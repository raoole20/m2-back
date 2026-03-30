import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContentType,
  Message,
  MessageDirection,
  MessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decrypt } from '../../shared/utils/crypto.util.js';
import { SenderFactory } from './sender.factory.js';

@Injectable()
export class ResponseDispatcherService {
  private readonly logger = new Logger(ResponseDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly senderFactory: SenderFactory,
    private readonly configService: ConfigService,
  ) {}

  async dispatch(
    conversationId: string,
    content: string,
  ): Promise<Message | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { channel: true, contact: true },
    });

    if (!conversation) {
      this.logger.warn(
        `Conversation ${conversationId} not found for dispatch`,
      );
      return null;
    }

    const sender = this.senderFactory.getSender(conversation.channel.type);
    if (!sender) {
      this.logger.warn(
        `No sender available for channel type ${conversation.channel.type}`,
      );
      return this.createFailedMessage(
        conversationId,
        conversation.channelId,
        content,
        `Unsupported channel type: ${conversation.channel.type}`,
      );
    }

    let credentials: Record<string, unknown>;
    try {
      const encryptionKey = this.configService.getOrThrow<string>('ENCRYPTION_KEY');
      const rawCredentials = conversation.channel.credentials;
      if (typeof rawCredentials === 'string') {
        credentials = JSON.parse(decrypt(rawCredentials, encryptionKey)) as Record<string, unknown>;
      } else {
        credentials = rawCredentials as Record<string, unknown>;
      }
    } catch (error) {
      this.logger.error(
        `Failed to decrypt credentials for channel ${conversation.channelId}: ${(error as Error).message}`,
      );
      return this.createFailedMessage(
        conversationId,
        conversation.channelId,
        content,
        'Failed to decrypt channel credentials',
      );
    }

    const sendResult = await sender.send(
      {
        channelId: conversation.channelId,
        contactExternalId: conversation.contact.externalId,
        content,
        contentType: 'text',
      },
      credentials,
    );

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        channelId: conversation.channelId,
        direction: MessageDirection.OUTBOUND,
        content,
        contentType: ContentType.TEXT,
        status: sendResult.success ? MessageStatus.SENT : MessageStatus.FAILED,
        externalId: sendResult.externalMessageId ?? null,
        errorMessage: sendResult.error ?? null,
      },
    });

    if (sendResult.success) {
      this.logger.log(
        `Dispatched message ${message.id} to ${conversation.channel.type} for conversation ${conversationId}`,
      );
    } else {
      this.logger.error(
        `Failed to dispatch message ${message.id}: ${sendResult.error}`,
      );
    }

    await this.prisma.actionLog.create({
      data: {
        tenantId: conversation.tenantId,
        conversationId,
        actionType: 'OUTBOUND_MESSAGE',
        payload: { messageId: message.id, channelType: conversation.channel.type },
        result: sendResult.success
          ? { externalMessageId: sendResult.externalMessageId }
          : { error: sendResult.error },
        status: sendResult.success ? 'SUCCESS' : 'FAILED',
        errorMessage: sendResult.error ?? null,
      },
    });

    return message;
  }

  private async createFailedMessage(
    conversationId: string,
    channelId: string,
    content: string,
    errorMessage: string,
  ): Promise<Message> {
    return this.prisma.message.create({
      data: {
        conversationId,
        channelId,
        direction: MessageDirection.OUTBOUND,
        content,
        contentType: ContentType.TEXT,
        status: MessageStatus.FAILED,
        errorMessage,
      },
    });
  }
}
