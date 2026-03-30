import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ActionStatus } from '@prisma/client';
import { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service.js';
import { ContactResolver } from '../../modules/message-pipeline/steps/contact-resolver.js';
import { ConversationResolver } from '../../modules/message-pipeline/steps/conversation-resolver.js';
import { MessagePersister } from '../../modules/message-pipeline/steps/message-persister.js';
import { AiEngineService } from '../../modules/ai-engine/ai-engine.service.js';
import { ResponseDispatcherService } from '../../modules/response-dispatcher/response-dispatcher.service.js';
import { ActionsService } from '../../modules/actions/actions.service.js';
import { NormalizedMessage } from '../../common/interfaces/normalized-message.interface.js';

@Processor('message-inbound')
export class MessageInboundProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageInboundProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactResolver: ContactResolver,
    private readonly conversationResolver: ConversationResolver,
    private readonly messagePersister: MessagePersister,
    private readonly aiEngineService: AiEngineService,
    private readonly responseDispatcher: ResponseDispatcherService,
    private readonly actionsService: ActionsService,
  ) {
    super();
  }

  async process(
    job: Job<{
      messages: NormalizedMessage[];
      channelId: string;
      tenantId: string;
    }>,
  ): Promise<void> {
    const { messages, channelId, tenantId } = job.data;

    for (const msg of messages) {
      try {
        const contact = await this.contactResolver.resolve(tenantId, msg);

        const conversation = await this.conversationResolver.resolve(
          tenantId,
          channelId,
          contact.id,
        );

        const message = await this.messagePersister.persist(
          conversation.id,
          channelId,
          msg,
        );

        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() },
        });

        this.logger.log(
          `Processed message ${message.id} for conversation ${conversation.id}`,
        );

        if (conversation.aiEnabled) {
          await this.processWithAi(tenantId, conversation.id, message.id, message.content);
        }
      } catch (error) {
        this.logger.error(
          `Failed to process message: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }
  }

  private async processWithAi(
    tenantId: string,
    conversationId: string,
    messageId: string,
    content: string,
  ): Promise<void> {
    try {
      const aiResponse = await this.aiEngineService.processMessage(
        tenantId,
        conversationId,
        content,
      );

      await this.prisma.message.update({
        where: { id: messageId },
        data: { aiProcessed: true },
      });

      if (aiResponse) {
        const outboundMessage = await this.responseDispatcher.dispatch(
          conversationId,
          aiResponse,
        );

        await this.actionsService.logAction(
          tenantId,
          conversationId,
          'AI_RESPONSE',
          { inboundMessageId: messageId, aiResponse },
          outboundMessage
            ? { outboundMessageId: outboundMessage.id, status: outboundMessage.status }
            : null,
          outboundMessage?.status === 'SENT'
            ? ActionStatus.SUCCESS
            : ActionStatus.FAILED,
        );
      } else {
        await this.actionsService.logAction(
          tenantId,
          conversationId,
          'AI_NO_RESPONSE',
          { inboundMessageId: messageId },
          null,
          ActionStatus.SUCCESS,
        );
      }
    } catch (error) {
      this.logger.error(
        `AI processing failed for message ${messageId}: ${(error as Error).message}`,
        (error as Error).stack,
      );

      await this.actionsService.logAction(
        tenantId,
        conversationId,
        'AI_PROCESSING_ERROR',
        { inboundMessageId: messageId },
        { error: (error as Error).message },
        ActionStatus.FAILED,
        (error as Error).message,
      );
    }
  }
}
