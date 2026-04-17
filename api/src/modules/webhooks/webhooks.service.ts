import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelType, ChannelProvider, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service.js';
import { NormalizedMessage } from '../../common/interfaces/normalized-message.interface.js';
import { AdapterFactory } from './adapters/adapter.factory.js';

const META_PLATFORMS = new Set<ChannelType>([
  ChannelType.WHATSAPP,
  ChannelType.INSTAGRAM,
  ChannelType.MESSENGER,
]);

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterFactory: AdapterFactory,
    private readonly configService: ConfigService,
  ) {}

  async handleVerification(
    channelType: ChannelType,
    channelId: string,
    query: Record<string, string>,
  ): Promise<string | null> {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, type: channelType, isActive: true },
    });

    const provider = channel?.provider ?? ChannelProvider.META;
    const adapter = this.adapterFactory.getAdapter(channelType, provider);
    const verifyToken = this.configService.get<string>(
      'META_VERIFY_TOKEN',
      '',
    );

    return adapter.handleVerification(query, verifyToken);
  }

  async processInboundWebhook(
    channelType: ChannelType,
    channelId: string,
    rawBody: Buffer,
    headers: Record<string, string>,
  ): Promise<{
    messages: NormalizedMessage[];
    channelId: string;
    tenantId: string;
  }> {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, type: channelType, isActive: true },
      include: { tenant: true },
    });

    if (!channel) {
      throw new NotFoundException(
        `Channel ${channelId} of type ${channelType} not found`,
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString('utf-8'));
    } catch {
      throw new UnauthorizedException('Invalid JSON payload');
    }

    const webhookLog = await this.prisma.webhookLog.create({
      data: {
        channelType,
        rawPayload: payload as unknown as Prisma.InputJsonValue,
        headers: headers as unknown as Prisma.InputJsonValue,
      },
    });

    const adapter = this.adapterFactory.getAdapter(
      channelType,
      channel.provider,
    );

    const secret = this.resolveSecret(
      channelType,
      channel.provider,
      channel.webhookSecret,
    );
    const signature = this.extractSignature(
      channelType,
      channel.provider,
      headers,
    );

    if (!adapter.validateSignature(rawBody, signature, secret)) {
      await this.prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: { errorMessage: 'Invalid signature' },
      });
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const messages = adapter.normalizeInbound(
      payload,
      channel.id,
      channel.tenantId,
    );

    await this.prisma.webhookLog.update({
      where: { id: webhookLog.id },
      data: { processed: true },
    });

    this.logger.log(
      `Processed ${messages.length} message(s) from ${channelType}:${channel.provider} channel ${channel.id}`,
    );

    return {
      messages,
      channelId: channel.id,
      tenantId: channel.tenantId,
    };
  }

  async cleanupOldLogs(daysToKeep: number = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);

    const result = await this.prisma.webhookLog.deleteMany({
      where: { receivedAt: { lt: cutoff } },
    });

    this.logger.log(
      `Cleaned up ${result.count} webhook log(s) older than ${daysToKeep} days`,
    );

    return result.count;
  }

  private resolveSecret(
    channelType: ChannelType,
    provider: ChannelProvider,
    channelWebhookSecret: string | null,
  ): string {
    if (provider === ChannelProvider.EVOLUTION) {
      return channelWebhookSecret ?? '';
    }

    if (META_PLATFORMS.has(channelType)) {
      return this.configService.get<string>('META_APP_SECRET', '');
    }

    if (channelType === ChannelType.TELEGRAM) {
      return this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
    }

    return channelWebhookSecret ?? '';
  }

  private extractSignature(
    channelType: ChannelType,
    provider: ChannelProvider,
    headers: Record<string, string>,
  ): string {
    if (provider === ChannelProvider.EVOLUTION) {
      return headers['apikey'] ?? '';
    }

    if (META_PLATFORMS.has(channelType)) {
      return headers['x-hub-signature-256'] ?? '';
    }

    if (channelType === ChannelType.TELEGRAM) {
      return headers['x-telegram-bot-api-secret-token'] ?? '';
    }

    return '';
  }
}
