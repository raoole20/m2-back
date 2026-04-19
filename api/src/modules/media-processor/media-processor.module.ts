import { Module } from '@nestjs/common';

import { MediaProcessorService } from './media-processor.service.js';
import { MediaDownloaderService } from './media-downloader.service.js';
import { TranscriberFactory } from './transcribers/transcriber.factory.js';
import { GeminiTranscriber } from './transcribers/gemini-transcriber.service.js';
import { OpenAiTranscriber } from './transcribers/openai-transcriber.service.js';
import { AnthropicTranscriber } from './transcribers/anthropic-transcriber.service.js';
import { CustomTranscriber } from './transcribers/custom-transcriber.service.js';

@Module({
  providers: [
    MediaProcessorService,
    MediaDownloaderService,
    TranscriberFactory,
    GeminiTranscriber,
    OpenAiTranscriber,
    AnthropicTranscriber,
    CustomTranscriber,
  ],
  exports: [MediaProcessorService],
})
export class MediaProcessorModule {}
