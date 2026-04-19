import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ContentType, MessageDirection } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service.js';
import { ContactResolver } from '../../modules/message-pipeline/steps/contact-resolver.js';
import { ConversationResolver } from '../../modules/message-pipeline/steps/conversation-resolver.js';
import { MessagePersister } from '../../modules/message-pipeline/steps/message-persister.js';
import { AiContextService } from '../../modules/ai-context/ai-context.service.js';
import { MediaProcessorService } from '../../modules/media-processor/media-processor.service.js';
import { NormalizedMessage } from '../../common/interfaces/normalized-message.interface.js';

interface InboundJobData {
  message: NormalizedMessage;
  channelId: string;
  tenantId: string;
}

@Processor('message-inbound')
export class MessageInboundProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageInboundProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactResolver: ContactResolver,
    private readonly conversationResolver: ConversationResolver,
    private readonly messagePersister: MessagePersister,
    private readonly aiContextService: AiContextService,
    private readonly mediaProcessor: MediaProcessorService,
    @InjectQueue('ai-response') private readonly aiResponseQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<InboundJobData>): Promise<void> {
    const { message: msg, channelId, tenantId } = job.data;

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

      const oneLine = (message.content ?? '').replace(/\s+/g, ' ').trim();
      this.logger.log(`📥 Mensaje entrante procesado → "${oneLine}"`);

      if (!conversation.aiEnabled) {
        this.logger.log(`🚫 IA deshabilitada en conversación, omitiendo`);
        return;
      }

      if (message.contentType !== ContentType.TEXT) {
        const aiContext = await this.aiContextService.getActiveContext(tenantId);
        await this.mediaProcessor.process(message.id, aiContext);
      }

      await this.scheduleAiResponse(tenantId, conversation.id);
    } catch (error) {
      this.logger.error(
        `❌ Error procesando mensaje entrante: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  private async scheduleAiResponse(
    tenantId: string,
    conversationId: string,
  ): Promise<void> {
    const context = await this.aiContextService.getActiveContext(tenantId);

    const debounceSeconds = context?.debounceSeconds ?? 8;
    const debounceMaxWaitSeconds = context?.debounceMaxWaitSeconds ?? 60;

    const oldestPending = await this.prisma.message.findFirst({
      where: {
        conversationId,
        direction: MessageDirection.INBOUND,
        aiProcessed: false,
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    const ageMs = oldestPending
      ? Date.now() - oldestPending.createdAt.getTime()
      : 0;
    const maxWaitMs = debounceMaxWaitSeconds * 1000;
    const debounceMs = debounceSeconds * 1000;
    const delay = ageMs >= maxWaitMs ? 0 : debounceMs;

    await this.aiResponseQueue.remove(conversationId).catch(() => undefined);

    await this.aiResponseQueue.add(
      'generate',
      { conversationId },
      {
        jobId: conversationId,
        delay,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );

    const seconds = Math.round(delay / 100) / 10;
    this.logger.log(
      `⏳ Respuesta IA agendada en ${seconds}s (conv. ${conversationId.slice(0, 8)})`,
    );
  }
}
