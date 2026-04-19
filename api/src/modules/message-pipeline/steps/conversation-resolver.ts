import { Injectable, Logger } from '@nestjs/common';
import { Conversation, ConversationStatus } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class ConversationResolver {
  private readonly logger = new Logger(ConversationResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    tenantId: string,
    channelId: string,
    contactId: string,
  ): Promise<Conversation> {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        channelId,
        contactId,
        status: ConversationStatus.ACTIVE,
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    if (existing) {
      this.logger.debug(
        `💬 Conversación activa encontrada (${existing.id.slice(0, 8)})`,
      );
      return existing;
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        tenantId,
        channelId,
        contactId,
        status: ConversationStatus.ACTIVE,
        aiEnabled: true,
      },
    });

    this.logger.log(
      `✨ Nueva conversación creada (${conversation.id.slice(0, 8)})`,
    );

    return conversation;
  }
}
