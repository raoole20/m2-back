import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import { AiProvider, ContentType } from '@prisma/client';

import {
  MediaTranscriber,
  TranscribeInput,
} from './media-transcriber.interface.js';

@Injectable()
export class OpenAiTranscriber implements MediaTranscriber {
  readonly provider = AiProvider.OPENAI;
  readonly supportedTypes: ContentType[] = [
    ContentType.IMAGE,
    ContentType.AUDIO,
    ContentType.STICKER,
  ];

  private readonly logger = new Logger(OpenAiTranscriber.name);

  constructor(private readonly configService: ConfigService) {}

  supports(contentType: ContentType): boolean {
    return this.supportedTypes.includes(contentType);
  }

  async transcribe(input: TranscribeInput): Promise<string> {
    const apiKey =
      input.apiKey ?? this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured and no override provided');
    }

    const client = new OpenAI({ apiKey, baseURL: input.apiBaseUrl });
    const visionModel =
      input.model ??
      this.configService.get<string>(
        'MEDIA_PROCESSOR_DEFAULT_MODEL_OPENAI',
        'gpt-4o',
      );

    if (input.contentType === ContentType.AUDIO) {
      const file = await toFile(input.buffer, `audio.${guessExtension(input.mimeType)}`, {
        type: input.mimeType,
      });
      const transcription = await client.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        prompt: input.prompt,
      });
      this.logger.debug(
        `📝 Whisper transcribió audio (${input.buffer.length}B) → ${transcription.text.length} chars`,
      );
      return transcription.text;
    }

    const dataUrl = `data:${input.mimeType};base64,${input.buffer.toString('base64')}`;
    const response = await client.chat.completions.create({
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: input.prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 2000,
    });
    const text = response.choices[0]?.message?.content ?? '';
    this.logger.debug(
      `📝 GPT-4o describió ${input.contentType} (${input.buffer.length}B) → ${text.length} chars`,
    );
    return text;
  }
}

function guessExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
  };
  return map[mimeType] ?? 'bin';
}
