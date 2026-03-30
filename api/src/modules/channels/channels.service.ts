import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { encrypt, decrypt } from '../../shared/utils/crypto.util.js';
import { CreateChannelDto } from './dto/create-channel.dto.js';
import { UpdateChannelDto } from './dto/update-channel.dto.js';
import { PaginationDto } from '../../common/dto/pagination.dto.js';
import { PaginationMeta } from '../../common/dto/api-response.dto.js';

@Injectable()
export class ChannelsService {
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.encryptionKey = this.config.getOrThrow<string>('ENCRYPTION_KEY');
  }

  async create(tenantId: string, dto: CreateChannelDto) {
    const encryptedCredentials = encrypt(
      JSON.stringify(dto.credentials),
      this.encryptionKey,
    );
    const webhookSecret = randomBytes(32).toString('hex');

    return this.prisma.channel.create({
      data: {
        tenantId,
        type: dto.type,
        name: dto.name,
        credentials: encryptedCredentials,
        webhookSecret,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAll(tenantId: string, pagination: PaginationDto) {
    const where = { tenantId };

    const [items, total] = await Promise.all([
      this.prisma.channel.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          type: true,
          name: true,
          webhookSecret: true,
          isActive: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: {
          [pagination.sortBy ?? 'createdAt']: pagination.sortOrder,
        },
      }),
      this.prisma.channel.count({ where }),
    ]);

    const meta: PaginationMeta = {
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };

    return { data: items, meta };
  }

  async findOne(tenantId: string, id: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id, tenantId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const decryptedCredentials = JSON.parse(
      decrypt(channel.credentials as string, this.encryptionKey),
    ) as Record<string, unknown>;

    return { ...channel, credentials: decryptedCredentials };
  }

  async update(tenantId: string, id: string, dto: UpdateChannelDto) {
    await this.findOne(tenantId, id);

    const data: Record<string, unknown> = {};

    if (dto.type !== undefined) data.type = dto.type;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.credentials !== undefined) {
      data.credentials = encrypt(
        JSON.stringify(dto.credentials),
        this.encryptionKey,
      );
    }

    return this.prisma.channel.update({
      where: { id },
      data,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    return this.prisma.channel.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
