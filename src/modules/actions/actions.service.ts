import { Injectable } from '@nestjs/common';
import { ActionStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QueryActionsDto } from './dto/query-actions.dto.js';

type JsonInput = Prisma.InputJsonValue | null;

@Injectable()
export class ActionsService {
  constructor(private readonly prisma: PrismaService) {}

  async logAction(
    tenantId: string,
    conversationId: string | null,
    actionType: string,
    payload: JsonInput,
    result: JsonInput,
    status: ActionStatus,
    errorMessage?: string,
  ) {
    return this.prisma.actionLog.create({
      data: {
        tenantId,
        conversationId,
        actionType,
        payload: payload ?? undefined,
        result: result ?? undefined,
        status,
        errorMessage: errorMessage ?? null,
      },
    });
  }

  async getActions(tenantId: string, query: QueryActionsDto) {
    const where: Prisma.ActionLogWhereInput = { tenantId };

    if (query.actionType) {
      where.actionType = query.actionType;
    }
    if (query.conversationId) {
      where.conversationId = query.conversationId;
    }
    if (query.status) {
      where.status = query.status;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.actionLog.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: {
          executedAt: query.sortOrder,
        },
      }),
      this.prisma.actionLog.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getConversationActions(tenantId: string, conversationId: string) {
    return this.prisma.actionLog.findMany({
      where: { tenantId, conversationId },
      orderBy: { executedAt: 'desc' },
    });
  }
}
