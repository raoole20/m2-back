import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
  }));
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');

const mockPrismaService = {
  tenant: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  passwordResetToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockJwtService = {
  signAsync: jest.fn(),
  verify: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: unknown) => {
    const config: Record<string, unknown> = {
      'redis.host': 'localhost',
      'redis.port': 6379,
      'mailer.emailVerificationTtlHours': 24,
      'mailer.passwordResetTtlMinutes': 30,
      JWT_REFRESH_EXPIRATION: '7d',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
    };
    return config[key] ?? defaultValue;
  }),
  getOrThrow: jest.fn((key: string) => {
    const config: Record<string, string> = {
      JWT_REFRESH_SECRET: 'test-refresh-secret',
    };
    return config[key];
  }),
};

const mockEmailQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockJwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getQueueToken('email'), useValue: mockEmailQueue },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterAll(async () => {
    await service.onModuleDestroy();
  });

  describe('register()', () => {
    const registerDto = {
      tenantName: 'Acme Corp',
      tenantSlug: 'acme-corp',
      email: 'owner@acme.com',
      password: 'Str0ngP@ss',
      name: 'John Doe',
    };

    it('should create tenant+user unverified and enqueue verification email', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);
      mockPrismaService.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          tenant: {
            create: jest.fn().mockResolvedValue({
              id: 'tenant-1',
              name: 'Acme Corp',
              slug: 'acme-corp',
            }),
          },
          user: {
            create: jest.fn().mockResolvedValue({
              id: 'user-1',
              tenantId: 'tenant-1',
              email: 'owner@acme.com',
              name: 'John Doe',
              role: UserRole.OWNER,
              emailVerified: false,
            }),
          },
        };
        return cb(tx);
      });

      const result = await service.register(registerDto);

      expect(result).toEqual({
        message: expect.any(String),
        userId: 'user-1',
        tenantSlug: 'acme-corp',
      });
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'send-verification',
        expect.objectContaining({
          type: 'send-verification',
          email: 'owner@acme.com',
          tenantSlug: 'acme-corp',
        }),
      );
    });

    it('should throw ConflictException if tenant slug already exists', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 'existing-tenant',
        slug: 'acme-corp',
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login()', () => {
    const loginDto = {
      email: 'owner@acme.com',
      password: 'Str0ngP@ss',
    };

    const verifiedUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'owner@acme.com',
      passwordHash: 'hashed-password',
      role: UserRole.OWNER,
      isActive: true,
      emailVerified: true,
    };

    it('should return tokens for valid credentials with verified email', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(verifiedUser);
      bcrypt.compare.mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('should throw EMAIL_NOT_VERIFIED for unverified account', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        ...verifiedUser,
        emailVerified: false,
      });
      bcrypt.compare.mockResolvedValue(true);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(verifiedUser);
      bcrypt.compare.mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshToken()', () => {
    const refreshDto = { refreshToken: 'valid-refresh-token' };

    it('should return new tokens for a valid refresh token', async () => {
      const decodedPayload = {
        sub: 'user-1',
        tenantId: 'tenant-1',
        role: UserRole.OWNER,
        email: 'owner@acme.com',
      };

      mockJwtService.verify.mockReturnValue(decodedPayload);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ioredis = require('ioredis');
      const redisInstance = ioredis.mock.results[0]?.value;
      if (redisInstance) {
        redisInstance.get.mockResolvedValue('valid-refresh-token');
      }

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        tenantId: 'tenant-1',
        email: 'owner@acme.com',
        role: UserRole.OWNER,
        isActive: true,
      });

      const result = await service.refreshToken(refreshDto);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(mockJwtService.verify).toHaveBeenCalledWith(
        'valid-refresh-token',
        { secret: 'test-refresh-secret' },
      );
    });
  });

  describe('getProfile()', () => {
    it('should return user data without passwordHash', async () => {
      const profileData = {
        id: 'user-1',
        tenantId: 'tenant-1',
        email: 'owner@acme.com',
        name: 'John Doe',
        role: UserRole.OWNER,
        isActive: true,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenant: {
          id: 'tenant-1',
          name: 'Acme Corp',
          slug: 'acme-corp',
          plan: 'FREE',
          isActive: true,
        },
      };

      mockPrismaService.user.findUnique.mockResolvedValue(profileData);

      const result = await service.getProfile('user-1');

      expect(result).toEqual(profileData);
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('verifyEmail()', () => {
    it('should mark user as verified with valid token', async () => {
      const rawToken = 'a'.repeat(64);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        emailVerified: false,
        verificationTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      });
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.verifyEmail({ token: rawToken });

      expect(result.message).toContain('verified');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            emailVerified: true,
            verificationTokenHash: null,
          }),
        }),
      );
    });

    it('should throw if token expired', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        emailVerified: false,
        verificationTokenExpiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.verifyEmail({ token: 'x'.repeat(64) }),
      ).rejects.toThrow();
    });
  });
});
