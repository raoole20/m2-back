import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  ActionStatus,
  ConversationStatus,
  MessageDirection,
} from '@prisma/client';
import { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service.js';
import { AiEngineService } from '../../modules/ai-engine/ai-engine.service.js';
import { ResponseDispatcherService } from '../../modules/response-dispatcher/response-dispatcher.service.js';
import { ActionsService } from '../../modules/actions/actions.service.js';

@Processor('ai-response')
export class AiResponseProcessor extends WorkerHost {
  private readonly logger = new Logger(AiResponseProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngineService: AiEngineService,
    private readonly responseDispatcher: ResponseDispatcherService,
    private readonly actionsService: ActionsService,
  ) {
    super();
  }

  async process(job: Job<{ conversationId: string }>): Promise<void> {
    const { conversationId } = job.data;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      this.logger.warn(
        `⚠️  Conversación ${conversationId.slice(0, 8)} no existe, omitiendo`,
      );
      return;
    }

    if (
      conversation.status !== ConversationStatus.ACTIVE ||
      !conversation.aiEnabled
    ) {
      const pendingIds = await this.prisma.message.findMany({
        where: {
          conversationId,
          direction: MessageDirection.INBOUND,
          aiProcessed: false,
        },
        select: { id: true },
      });

      if (pendingIds.length > 0) {
        await this.prisma.message.updateMany({
          where: { id: { in: pendingIds.map((m) => m.id) } },
          data: { aiProcessed: true },
        });
      }

      this.logger.log(
        `🚫 Conversación inactiva o IA deshabilitada, marcando ${pendingIds.length} mensaje(s) como procesado(s)`,
      );

      await this.actionsService.logAction(
        conversation.tenantId,
        conversationId,
        'AI_SKIPPED_INACTIVE_CONVERSATION',
        { status: conversation.status, aiEnabled: conversation.aiEnabled },
        null,
        ActionStatus.SUCCESS,
      );
      return;
    }

    const pending = await this.prisma.message.findMany({
      where: {
        conversationId,
        direction: MessageDirection.INBOUND,
        aiProcessed: false,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, content: true },
    });

    if (pending.length === 0) {
      this.logger.debug(
        `💤 Sin mensajes pendientes en conversación ${conversationId.slice(0, 8)}`,
      );
      return;
    }

    const concatenated = pending
      .map((m) => m.content)
      .filter((c) => c && c.trim().length > 0)
      .join('\n');

    const pendingIds = pending.map((m) => m.id);

    this.logger.log(
      `🤖 Procesando batch de ${pending.length} mensaje(s) con IA (conv. ${conversationId.slice(0, 8)})`,
    );

    try {
      const aiResponse = await this.aiEngineService.processMessage(
        conversation.tenantId,
        conversationId,
        concatenated,
      );

      await this.prisma.message.updateMany({
        where: { id: { in: pendingIds } },
        data: { aiProcessed: true },
      });

      if (aiResponse) {
        const oneLine = aiResponse.replace(/\s+/g, ' ').trim();
        this.logger.log(`✨ IA respondió → "${oneLine}"`);

        const outboundMessage = await this.responseDispatcher.dispatch(
          conversationId,
          aiResponse,
        );

        if (outboundMessage?.status === 'SENT') {
          this.logger.log(`📤 Respuesta enviada al canal`);
        } else {
          this.logger.warn(
            `⚠️  Despacho fallido (status: ${outboundMessage?.status ?? 'null'})`,
          );
        }

        await this.actionsService.logAction(
          conversation.tenantId,
          conversationId,
          'AI_RESPONSE',
          { batchedMessageIds: pendingIds, aiResponse },
          outboundMessage
            ? {
                outboundMessageId: outboundMessage.id,
                status: outboundMessage.status,
              }
            : null,
          outboundMessage?.status === 'SENT'
            ? ActionStatus.SUCCESS
            : ActionStatus.FAILED,
        );
      } else {
        this.logger.warn(`🤐 IA no generó respuesta (sin contexto o fallback null)`);
        await this.actionsService.logAction(
          conversation.tenantId,
          conversationId,
          'AI_NO_RESPONSE',
          { batchedMessageIds: pendingIds },
          null,
          ActionStatus.SUCCESS,
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ Falló procesamiento IA: ${(error as Error).message}`,
        (error as Error).stack,
      );

      await this.actionsService.logAction(
        conversation.tenantId,
        conversationId,
        'AI_PROCESSING_ERROR',
        { batchedMessageIds: pendingIds },
        { error: (error as Error).message },
        ActionStatus.FAILED,
        (error as Error).message,
      );
    }
  }
}
