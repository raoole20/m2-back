import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QueryMessagesDto } from './dto/query-messages.dto.js';
import { PaginationMeta } from '../../common/dto/api-response.dto.js';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyConversationBelongsToTenant(
    conversationId: string,
    tenantId: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
  }

  async findAll(tenantId: string, query: QueryMessagesDto) {
    await this.verifyConversationBelongsToTenant(query.conversationId, tenantId);

    const where: Prisma.MessageWhereInput = {
      conversationId: query.conversationId,
    };

    if (query.direction) where.direction = query.direction;
    if (query.contentType) where.contentType = query.contentType;

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: {
          [query.sortBy ?? 'createdAt']: query.sortOrder,
        },
      }),
      this.prisma.message.count({ where }),
    ]);

    const meta: PaginationMeta = {
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };

    return { data: items, meta };
  }

  async findOne(tenantId: string, id: string) {
    const message = await this.prisma.message.findUnique({
      where: { id },
      include: {
        conversation: {
          select: { tenantId: true },
        },
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.conversation.tenantId !== tenantId) {
      throw new NotFoundException('Message not found');
    }

    const { conversation: _conversation, ...messageData } = message;
    return messageData;
  }
}
