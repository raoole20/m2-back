import { Injectable } from '@nestjs/common';
import { AiProvider } from '@prisma/client';

import { MediaTranscriber } from './media-transcriber.interface.js';
import { GeminiTranscriber } from './gemini-transcriber.service.js';
import { OpenAiTranscriber } from './openai-transcriber.service.js';
import { AnthropicTranscriber } from './anthropic-transcriber.service.js';
import { CustomTranscriber } from './custom-transcriber.service.js';

@Injectable()
export class TranscriberFactory {
  constructor(
    private readonly gemini: GeminiTranscriber,
    private readonly openai: OpenAiTranscriber,
    private readonly anthropic: AnthropicTranscriber,
    private readonly custom: CustomTranscriber,
  ) {}

  get(provider: AiProvider): MediaTranscriber {
    switch (provider) {
      case AiProvider.GEMINI:
        return this.gemini;
      case AiProvider.OPENAI:
        return this.openai;
      case AiProvider.ANTHROPIC:
        return this.anthropic;
      case AiProvider.CUSTOM:
        return this.custom;
      default:
        return this.gemini;
    }
  }

  getDefault(): MediaTranscriber {
    return this.gemini;
  }
}
