import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelProvider } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { encrypt, decrypt } from '../../shared/utils/crypto.util.js';
import { CreateChannelDto } from './dto/create-channel.dto.js';
import { UpdateChannelDto } from './dto/update-channel.dto.js';
import { PaginationDto } from '../../common/dto/pagination.dto.js';
import { PaginationMeta } from '../../common/dto/api-response.dto.js';
import { EvolutionService } from './evolution.service.js';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly evolutionService: EvolutionService,
  ) {
    this.encryptionKey = this.config.getOrThrow<string>('ENCRYPTION_KEY');
  }

  async create(tenantId: string, dto: CreateChannelDto) {
    const provider = dto.provider ?? ChannelProvider.META;
    const credentials = dto.credentials as Record<string, string>;

    const webhookSecret =
      provider === ChannelProvider.EVOLUTION
        ? (credentials.apiKey ?? randomBytes(32).toString('hex'))
        : randomBytes(32).toString('hex');

    const encryptedCredentials = encrypt(
      JSON.stringify(dto.credentials),
      this.encryptionKey,
    );

    const channel = await this.prisma.channel.create({
      data: {
        tenantId,
        type: dto.type,
        provider,
        name: dto.name,
        credentials: encryptedCredentials,
        webhookSecret,
        isActive: dto.isActive ?? true,
      },
    });

    if (provider === ChannelProvider.EVOLUTION) {
      await this.setupEvolutionWebhook(channel.id, credentials);
    }

    return channel;
  }

  private async setupEvolutionWebhook(
    channelId: string,
    credentials: Record<string, string>,
  ): Promise<void> {
    const { instanceName, apiKey } = credentials;
    if (!instanceName || !apiKey) return;

    const callbackUrl = `http://api:3000/webhooks/whatsapp/${channelId}`;

    try {
      await this.evolutionService.setWebhook(
        instanceName,
        apiKey,
        callbackUrl,
      );
      this.logger.log(
        `Evolution webhook configured for channel ${channelId} → ${callbackUrl}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to auto-configure Evolution webhook for channel ${channelId}: ${(error as Error).message}. You can configure it manually later.`,
      );
    }
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
