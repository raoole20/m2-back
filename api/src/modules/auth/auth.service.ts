import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectQueue } from '@nestjs/bullmq';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { StringValue } from 'ms';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { JwtPayload } from '../../common/decorators/user.decorator.js';
import type { EmailJobData } from '../../queue/processors/email.processor.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RefreshDto } from './dto/refresh.dto.js';
import type { VerifyEmailDto } from './dto/verify-email.dto.js';
import type { ResendVerificationDto } from './dto/resend-verification.dto.js';
import type { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import type { ResetPasswordDto } from './dto/reset-password.dto.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterResult {
  message: string;
  userId: string;
  tenantSlug: string;
}

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

const BCRYPT_ROUNDS = 10;
const DEFAULT_REFRESH_TTL = 604_800; // 7 days
const GENERIC_RESET_RESPONSE = {
  message: 'If the email exists, a reset link was sent',
};
const GENERIC_RESEND_RESPONSE = {
  message: 'If the email exists and is unverified, a verification link was sent',
};
const RESEND_RATE_LIMIT_SECONDS = 60;
const FORGOT_RATE_LIMIT_SECONDS = 3600;
const FORGOT_MAX_PER_HOUR = 3;

@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly refreshTtl: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectQueue('email') private readonly emailQueue: Queue<EmailJobData>,
  ) {
    this.redis = new Redis({
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379),
    });

    this.refreshTtl = this.parseExpirationToSeconds(
      this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d'),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async register(dto: RegisterDto): Promise<RegisterResult> {
    const slug = this.slugify(dto.tenantSlug);

    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    if (existingTenant) {
      throw new ConflictException('A tenant with this slug already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const rawToken = this.generateToken();
    const tokenHash = this.hashToken(rawToken);
    const ttlHours = this.configService.get<number>(
      'mailer.emailVerificationTtlHours',
      24,
    );
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.tenantName, slug },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email.toLowerCase(),
          passwordHash,
          name: dto.name,
          role: UserRole.OWNER,
          emailVerified: false,
          verificationTokenHash: tokenHash,
          verificationTokenExpiresAt: expiresAt,
        },
      });

      return { tenant, user };
    });

    await this.emailQueue.add('send-verification', {
      type: 'send-verification',
      email: result.user.email,
      name: result.user.name,
      rawToken,
      tenantSlug: result.tenant.slug,
    });

    return {
      message: 'Account created. Check your email to verify before logging in.',
      userId: result.user.id,
      tenantSlug: result.tenant.slug,
    };
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), isActive: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException('EMAIL_NOT_VERIFIED');
    }

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    };

    return this.generateTokens(payload);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const tokenHash = this.hashToken(dto.token);

    const user = await this.prisma.user.findUnique({
      where: { verificationTokenHash: tokenHash },
    });

    if (!user) {
      throw new BadRequestException('Invalid or already used verification token');
    }

    if (
      !user.verificationTokenExpiresAt ||
      user.verificationTokenExpiresAt < new Date()
    ) {
      throw new BadRequestException('Verification token expired');
    }

    if (user.emailVerified) {
      return { message: 'Email already verified' };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        verificationTokenHash: null,
        verificationTokenExpiresAt: null,
      },
    });

    return { message: 'Email verified. You can now log in.' };
  }

  async resendVerification(
    dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    const rateKey = `resend-verify:${dto.email.toLowerCase()}`;
    const allowed = await this.checkAndSetRateLimit(
      rateKey,
      RESEND_RATE_LIMIT_SECONDS,
    );

    if (!allowed) {
      return GENERIC_RESEND_RESPONSE;
    }

    const user = await this.findUserByEmailAndTenant(
      dto.email,
      dto.tenantSlug,
    );

    if (!user || user.emailVerified || !user.isActive) {
      return GENERIC_RESEND_RESPONSE;
    }

    const rawToken = this.generateToken();
    const tokenHash = this.hashToken(rawToken);
    const ttlHours = this.configService.get<number>(
      'mailer.emailVerificationTtlHours',
      24,
    );
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationTokenHash: tokenHash,
        verificationTokenExpiresAt: expiresAt,
      },
    });

    await this.emailQueue.add('send-verification', {
      type: 'send-verification',
      email: user.email,
      name: user.name,
      rawToken,
      tenantSlug: user.tenant.slug,
    });

    return GENERIC_RESEND_RESPONSE;
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
    meta: RequestMetadata,
  ): Promise<{ message: string }> {
    const rateKey = `forgot-pwd:${dto.email.toLowerCase()}`;
    const count = await this.redis.incr(rateKey);
    if (count === 1) {
      await this.redis.expire(rateKey, FORGOT_RATE_LIMIT_SECONDS);
    }
    if (count > FORGOT_MAX_PER_HOUR) {
      return GENERIC_RESET_RESPONSE;
    }

    const user = await this.findUserByEmailAndTenant(
      dto.email,
      dto.tenantSlug,
    );

    if (!user || !user.isActive) {
      return GENERIC_RESET_RESPONSE;
    }

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = this.generateToken();
    const tokenHash = this.hashToken(rawToken);
    const ttlMinutes = this.configService.get<number>(
      'mailer.passwordResetTtlMinutes',
      30,
    );
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });

    await this.emailQueue.add('send-password-reset', {
      type: 'send-password-reset',
      email: user.email,
      name: user.name,
      rawToken,
      tenantSlug: user.tenant.slug,
      ipAddress: meta.ipAddress,
      requestedAt: new Date().toISOString(),
    });

    return GENERIC_RESET_RESPONSE;
  }

  async resetPassword(
    dto: ResetPasswordDto,
    meta: RequestMetadata,
  ): Promise<{ message: string }> {
    const tokenHash = this.hashToken(dto.token);

    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!token || token.usedAt || token.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const sameAsOld = await bcrypt.compare(
      dto.newPassword,
      token.user.passwordHash,
    );
    if (sameAsOld) {
      throw new BadRequestException(
        'New password must differ from current password',
      );
    }

    const newHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash: newHash },
      });
      await tx.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      });
    });

    await this.invalidateRefreshTokens(token.userId);

    await this.emailQueue.add('send-password-changed', {
      type: 'send-password-changed',
      email: token.user.email,
      name: token.user.name,
      ipAddress: meta.ipAddress,
      changedAt: new Date().toISOString(),
    });

    return { message: 'Password updated. Please log in with your new password.' };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    meta: RequestMetadata,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must differ from current password',
      );
    }

    const newHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    await this.invalidateRefreshTokens(userId);

    await this.emailQueue.add('send-password-changed', {
      type: 'send-password-changed',
      email: user.email,
      name: user.name,
      ipAddress: meta.ipAddress,
      changedAt: new Date().toISOString(),
    });

    return { message: 'Password changed. Please log in again.' };
  }

  async refreshToken(dto: RefreshDto): Promise<TokenPair> {
    let decoded: JwtPayload;

    try {
      decoded = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const isValid = await this.validateRefreshToken(
      decoded.sub,
      dto.refreshToken,
    );

    if (!isValid) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: decoded.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    };

    return this.generateTokens(payload);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            isActive: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  private async findUserByEmailAndTenant(email: string, tenantSlug?: string) {
    const normalizedEmail = email.toLowerCase();

    if (tenantSlug) {
      return this.prisma.user.findFirst({
        where: {
          email: normalizedEmail,
          tenant: { slug: tenantSlug.toLowerCase() },
        },
        include: { tenant: true },
      });
    }

    const users = await this.prisma.user.findMany({
      where: { email: normalizedEmail },
      include: { tenant: true },
    });

    if (users.length !== 1) {
      return null;
    }

    return users[0];
  }

  private async generateTokens(payload: JwtPayload): Promise<TokenPair> {
    const tokenPayload: Record<string, string> = { ...payload };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(tokenPayload),
      this.jwtService.signAsync(tokenPayload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRATION',
          '7d',
        ) as StringValue,
      }),
    ]);

    await this.storeRefreshToken(payload.sub, refreshToken);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(
    userId: string,
    token: string,
  ): Promise<void> {
    const key = `refresh:${userId}`;
    await this.redis.set(key, token, 'EX', this.refreshTtl);
  }

  private async validateRefreshToken(
    userId: string,
    token: string,
  ): Promise<boolean> {
    const key = `refresh:${userId}`;
    const stored = await this.redis.get(key);
    return stored === token;
  }

  private async invalidateRefreshTokens(userId: string): Promise<void> {
    await this.redis.del(`refresh:${userId}`);
  }

  private async checkAndSetRateLimit(
    key: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private parseExpirationToSeconds(expiration: string): number {
    const match = expiration.match(/^(\d+)(s|m|h|d)$/);

    if (!match) {
      return DEFAULT_REFRESH_TTL;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3_600,
      d: 86_400,
    };

    return value * (multipliers[unit] ?? 1);
  }
}
