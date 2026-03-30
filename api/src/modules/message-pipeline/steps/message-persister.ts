import { Injectable, Logger } from '@nestjs/common';
import { Message, MessageDirection, MessageStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service.js';
import { NormalizedMessage } from '../../../common/interfaces/normalized-message.interface.js';
import { sanitizeContent } from '../../../shared/utils/text-cleaner.util.js';

@Injectable()
export class MessagePersister {
  private readonly logger = new Logger(MessagePersister.name);

  constructor(private readonly prisma: PrismaService) {}

  async persist(
    conversationId: string,
    channelId: string,
    normalizedMsg: NormalizedMessage,
  ): Promise<Message> {
    const sanitized = normalizedMsg.content
      ? sanitizeContent(normalizedMsg.content)
      : '';

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        channelId,
        direction: MessageDirection.INBOUND,
        content: normalizedMsg.content,
        contentType: normalizedMsg.contentType,
        mediaUrl: normalizedMsg.mediaUrl,
        mediaMimeType: normalizedMsg.mediaMimeType,
        externalId: normalizedMsg.externalId,
        rawPayload: normalizedMsg.rawPayload as unknown as Prisma.InputJsonValue,
        sanitizedContent: sanitized,
        status: MessageStatus.RECEIVED,
      },
    });

    this.logger.debug(
      `Persisted message ${message.id} in conversation ${conversationId}`,
    );

    return message;
  }
}
