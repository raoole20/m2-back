import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AiProvider, ContentType } from '@prisma/client';

import {
  MediaTranscriber,
  TranscribeInput,
} from './media-transcriber.interface.js';

@Injectable()
export class GeminiTranscriber implements MediaTranscriber {
  readonly provider = AiProvider.GEMINI;
  readonly supportedTypes: ContentType[] = [
    ContentType.IMAGE,
    ContentType.AUDIO,
    ContentType.VIDEO,
    ContentType.DOCUMENT,
    ContentType.STICKER,
  ];

  private readonly logger = new Logger(GeminiTranscriber.name);

  constructor(private readonly configService: ConfigService) {}

  supports(contentType: ContentType): boolean {
    return this.supportedTypes.includes(contentType);
  }

  async transcribe(input: TranscribeInput): Promise<string> {
    const apiKey =
      input.apiKey ?? this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured and no override provided');
    }

    const model =
      input.model ??
      this.configService.get<string>(
        'MEDIA_PROCESSOR_DEFAULT_MODEL_GEMINI',
        'gemini-2.0-flash-exp',
      );

    const client = new GoogleGenerativeAI(apiKey);
    const genModel = client.getGenerativeModel({ model });

    const result = await genModel.generateContent([
      { text: input.prompt },
      {
        inlineData: {
          mimeType: input.mimeType,
          data: input.buffer.toString('base64'),
        },
      },
    ]);

    const text = result.response.text();
    this.logger.debug(
      `📝 Gemini transcribió ${input.contentType} (${input.buffer.length}B) → ${text.length} chars`,
    );
    return text;
  }
}
