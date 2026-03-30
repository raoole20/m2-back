import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ConversationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QueryConversationsDto } from './dto/query-conversations.dto.js';
import { UpdateConversationDto } from './dto/update-conversation.dto.js';
import { PaginationMeta } from '../../common/dto/api-response.dto.js';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: QueryConversationsDto) {
    const where: Prisma.ConversationWhereInput = { tenantId };

    if (query.status) where.status = query.status;
    if (query.channelId) where.channelId = query.channelId;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.contactId) where.contactId = query.contactId;

    const [items, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              channelType: true,
            },
          },
          channel: {
            select: {
              id: true,
              type: true,
              name: true,
            },
          },
        },
        skip: query.skip,
        take: query.limit,
        orderBy: {
          [query.sortBy ?? 'lastMessageAt']: query.sortOrder,
        },
      }),
      this.prisma.conversation.count({ where }),
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
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, tenantId },
      include: {
        contact: true,
        channel: {
          select: {
            id: true,
            type: true,
            name: true,
          },
        },
        messages: {
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  async update(tenantId: string, id: string, dto: UpdateConversationDto) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, tenantId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const data: Prisma.ConversationUpdateInput = {};

    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === ConversationStatus.CLOSED) {
        data.closedAt = new Date();
      }
    }

    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }

    if (dto.aiEnabled !== undefined) {
      data.aiEnabled = dto.aiEnabled;
    }

    return this.prisma.conversation.update({
      where: { id },
      data,
    });
  }

  async close(tenantId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, tenantId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return this.prisma.conversation.update({
      where: { id },
      data: {
        status: ConversationStatus.CLOSED,
        closedAt: new Date(),
      },
    });
  }
}
