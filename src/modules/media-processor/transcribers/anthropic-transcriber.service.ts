import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AiProvider, ContentType } from '@prisma/client';

import {
  MediaTranscriber,
  TranscribeInput,
} from './media-transcriber.interface.js';

@Injectable()
export class AnthropicTranscriber implements MediaTranscriber {
  readonly provider = AiProvider.ANTHROPIC;
  readonly supportedTypes: ContentType[] = [
    ContentType.IMAGE,
    ContentType.DOCUMENT,
    ContentType.STICKER,
  ];

  private readonly logger = new Logger(AnthropicTranscriber.name);

  constructor(private readonly configService: ConfigService) {}

  supports(contentType: ContentType): boolean {
    return this.supportedTypes.includes(contentType);
  }

  async transcribe(input: TranscribeInput): Promise<string> {
    const apiKey =
      input.apiKey ?? this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured and no override provided');
    }

    const client = new Anthropic({ apiKey });
    const model =
      input.model ??
      this.configService.get<string>(
        'MEDIA_PROCESSOR_DEFAULT_MODEL_ANTHROPIC',
        'claude-3-5-sonnet-latest',
      );

    const base64 = input.buffer.toString('base64');
    const sourceBlock =
      input.contentType === ContentType.DOCUMENT
        ? {
            type: 'document' as const,
            source: {
              type: 'base64' as const,
              media_type: 'application/pdf' as const,
              data: base64,
            },
          }
        : {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: input.mimeType as
                | 'image/jpeg'
                | 'image/png'
                | 'image/gif'
                | 'image/webp',
              data: base64,
            },
          };

    const response = await client.messages.create({
      model,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [sourceBlock, { type: 'text', text: input.prompt }],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock && 'text' in textBlock ? textBlock.text : '';
    this.logger.debug(
      `📝 Claude transcribió ${input.contentType} (${input.buffer.length}B) → ${text.length} chars`,
    );
    return text;
  }
}
