import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiContext,
  ContentType,
  MediaProcessingStatus,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service.js';
import { decrypt } from '../../shared/utils/crypto.util.js';
import { sanitizeContent } from '../../shared/utils/text-cleaner.util.js';
import { MediaDownloaderService } from './media-downloader.service.js';
import { PROMPT_BY_CONTENT_TYPE } from './prompts/index.js';
import { TranscriberFactory } from './transcribers/transcriber.factory.js';

export interface MediaProcessOutcome {
  status: MediaProcessingStatus;
  transcription?: string;
  error?: string;
}

@Injectable()
export class MediaProcessorService {
  private readonly logger = new Logger(MediaProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly downloader: MediaDownloaderService,
    private readonly transcriberFactory: TranscriberFactory,
  ) {}

  async process(
    messageId: string,
    aiContext: AiContext | null,
  ): Promise<MediaProcessOutcome> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { channel: true },
    });

    if (!message) {
      return { status: MediaProcessingStatus.FAILED, error: 'Message not found' };
    }

    if (message.contentType === ContentType.TEXT) {
      return { status: MediaProcessingStatus.PENDING };
    }

    if (!aiContext) {
      return this.markSkipped(messageId, 'No active AI context');
    }

    const allowed = aiContext.allowedMediaTypes.includes(message.contentType);
    if (!allowed) {
      this.logger.log(
        `⏭️  Tipo ${message.contentType} no permitido por AiContext "${aiContext.name}"`,
      );
      return this.markSkipped(
        messageId,
        `Content type ${message.contentType} not in allowedMediaTypes`,
      );
    }

    const prompt = PROMPT_BY_CONTENT_TYPE[message.contentType];
    if (!prompt) {
      return this.markSkipped(
        messageId,
        `No prompt defined for ${message.contentType}`,
      );
    }

    if (!message.mediaUrl) {
      return this.markFailed(messageId, 'Message has no mediaUrl');
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { mediaProcessingStatus: MediaProcessingStatus.PROCESSING },
    });

    try {
      let transcriber = this.transcriberFactory.get(
        aiContext.mediaProcessorProvider,
      );

      if (!transcriber.supports(message.contentType)) {
        if (aiContext.mediaProcessorFallbackToDefault) {
          this.logger.warn(
            `⚠️  Provider ${aiContext.mediaProcessorProvider} no soporta ${message.contentType}, fallback a Gemini`,
          );
          transcriber = this.transcriberFactory.getDefault();
          if (!transcriber.supports(message.contentType)) {
            return this.markFailed(
              messageId,
              `No transcriber supports ${message.contentType}`,
            );
          }
        } else {
          return this.markFailed(
            messageId,
            `Provider ${aiContext.mediaProcessorProvider} does not support ${message.contentType}`,
          );
        }
      }

      const downloaded = await this.downloader.download(message, message.channel);

      const resolvedApiKey = this.resolveApiKey(aiContext.mediaProcessorApiKey);

      const started = Date.now();
      const transcriptionRaw = await transcriber.transcribe({
        buffer: downloaded.buffer,
        mimeType: downloaded.mimeType,
        contentType: message.contentType,
        prompt,
        model: aiContext.mediaProcessorModel ?? undefined,
        apiKey: resolvedApiKey,
        apiBaseUrl: aiContext.mediaProcessorApiBaseUrl ?? undefined,
      });
      const transcription = sanitizeContent(transcriptionRaw).slice(0, 20000);
      const durationMs = Date.now() - started;

      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          transcription,
          mediaProcessingStatus: MediaProcessingStatus.COMPLETED,
          mediaProcessingError: null,
        },
      });

      this.logger.log(
        `✅ Media ${message.contentType} transcrita en ${durationMs}ms (${transcription.length} chars) → msg ${messageId.slice(0, 8)}`,
      );

      return {
        status: MediaProcessingStatus.COMPLETED,
        transcription,
      };
    } catch (error) {
      const errMsg = (error as Error).message;
      this.logger.error(
        `❌ MediaProcessor falló msg ${messageId.slice(0, 8)} (${message.contentType}): ${errMsg}`,
      );
      return this.markFailed(messageId, errMsg);
    }
  }

  private async markSkipped(
    messageId: string,
    reason: string,
  ): Promise<MediaProcessOutcome> {
    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        mediaProcessingStatus: MediaProcessingStatus.SKIPPED,
        mediaProcessingError: reason,
      },
    });
    return { status: MediaProcessingStatus.SKIPPED, error: reason };
  }

  private async markFailed(
    messageId: string,
    reason: string,
  ): Promise<MediaProcessOutcome> {
    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        mediaProcessingStatus: MediaProcessingStatus.FAILED,
        mediaProcessingError: reason,
      },
    });
    return { status: MediaProcessingStatus.FAILED, error: reason };
  }

  private resolveApiKey(encryptedOrPlain: string | null | undefined): string | undefined {
    if (!encryptedOrPlain) return undefined;
    if (encryptedOrPlain.split(':').length === 3) {
      try {
        const key = this.config.getOrThrow<string>('ENCRYPTION_KEY');
        return decrypt(encryptedOrPlain, key);
      } catch {
        return encryptedOrPlain;
      }
    }
    return encryptedOrPlain;
  }
}
