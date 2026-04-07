import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelType, ContentType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service.js';
import { NormalizedMessage } from '../../common/interfaces/normalized-message.interface.js';
import { AdapterFactory } from './adapters/adapter.factory.js';
import {
  discriminateMessageType,
  MessageCategory,
} from '../../common/utils/message-content.discriminator.js';

const EVOLUTION_TYPE_MAP: Record<string, ContentType> = {
  conversation: ContentType.TEXT,
  extendedTextMessage: ContentType.TEXT,
  listResponseMessage: ContentType.TEXT,
  buttonsResponseMessage: ContentType.TEXT,
  templateMessage: ContentType.TEMPLATE,
  imageMessage: ContentType.IMAGE,
  videoMessage: ContentType.VIDEO,
  audioMessage: ContentType.AUDIO,
  documentMessage: ContentType.DOCUMENT,
  stickerMessage: ContentType.STICKER,
  locationMessage: ContentType.LOCATION,
  reactionMessage: ContentType.REACTION,
};

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

  handleVerification(
    channelType: ChannelType,
    _channelId: string,
    query: Record<string, string>,
  ): string | null {
    const adapter = this.adapterFactory.getAdapter(channelType);
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

    const adapter = this.adapterFactory.getAdapter(channelType);

    const secret = this.resolveSecret(channelType, channel.webhookSecret);
    const signature = this.extractSignature(channelType, headers);

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
      `Processed ${messages.length} message(s) from ${channelType} channel ${channel.id}`,
    );

    return {
      messages,
      channelId: channel.id,
      tenantId: channel.tenantId,
    };
  }

  async handleNewChat(
    body: Record<string, unknown>,
  ): Promise<{ status: string }> {
    const instance = body.instance as string | undefined;
    const data = body.data as Record<string, unknown> | undefined;
    const key = data?.key as Record<string, unknown> | undefined;
    const remoteJid = key?.remoteJid as string | undefined;
    const fromMe = key?.fromMe as boolean | undefined;

    if (!instance || !remoteJid) {
      this.logger.warn('new-chat webhook: missing instance or remoteJid');
      return { status: 'ignored' };
    }

    if (fromMe) {
      return { status: 'ignored' };
    }

    const number = remoteJid.split('@')[0];

    const messageType = data?.messageType as string | undefined;
    const contentType =
      EVOLUTION_TYPE_MAP[messageType ?? ''] ?? ContentType.TEXT;
    const category = discriminateMessageType(contentType);

    const categoryLabel: Record<MessageCategory, string> = {
      [MessageCategory.TEXT]: 'texto',
      [MessageCategory.IMAGE]: 'imagen',
      [MessageCategory.AUDIO]: 'audio',
      [MessageCategory.DOCUMENT]: 'documento',
      [MessageCategory.OTHER]: 'otro',
    };

    const replyText = `Tipo de mensaje recibido: ${categoryLabel[category]}`;

    const evolutionUrl = this.configService.get<string>(
      'EVOLUTION_API_URL',
      'http://evolution-api:8080',
    );
    const evolutionKey = this.configService.get<string>(
      'EVOLUTION_API_KEY',
      '',
    );

    try {
      const response = await fetch(
        `${evolutionUrl}/message/sendText/${instance}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: evolutionKey,
          },
          body: JSON.stringify({ number, text: replyText }),
        },
      );

      if (!response.ok) {
        const err = await response.text();
        this.logger.error(`Evolution API error (${response.status}): ${err}`);
      } else {
        this.logger.log(`Message sent to ${number} via instance ${instance}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to call Evolution API: ${(error as Error).message}`,
      );
    }

    return { status: 'ok' };
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
    channelWebhookSecret: string | null,
  ): string {
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
    headers: Record<string, string>,
  ): string {
    if (META_PLATFORMS.has(channelType)) {
      return headers['x-hub-signature-256'] ?? '';
    }

    if (channelType === ChannelType.TELEGRAM) {
      return headers['x-telegram-bot-api-secret-token'] ?? '';
    }

    return '';
  }
}
