import { Injectable } from '@nestjs/common';
import { AiProvider, ContentType } from '@prisma/client';

import {
  MediaTranscriber,
  TranscribeInput,
} from './media-transcriber.interface.js';
import { OpenAiTranscriber } from './openai-transcriber.service.js';

@Injectable()
export class CustomTranscriber implements MediaTranscriber {
  readonly provider = AiProvider.CUSTOM;
  readonly supportedTypes: ContentType[] = [ContentType.IMAGE, ContentType.STICKER];

  constructor(private readonly openAiTranscriber: OpenAiTranscriber) {}

  supports(contentType: ContentType): boolean {
    return this.supportedTypes.includes(contentType);
  }

  async transcribe(input: TranscribeInput): Promise<string> {
    if (!input.apiBaseUrl) {
      throw new Error('CUSTOM provider requires mediaProcessorApiBaseUrl');
    }
    return this.openAiTranscriber.transcribe(input);
  }
}
