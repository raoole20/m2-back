import { Module } from '@nestjs/common';
import { AiContextModule } from '../ai-context/ai-context.module.js';
import { AiMemoryModule } from '../ai-memory/ai-memory.module.js';
import { AiEngineService } from './ai-engine.service.js';
import { OpenAiProvider } from './providers/openai.provider.js';
import { AnthropicProvider } from './providers/anthropic.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';

@Module({
  imports: [AiContextModule, AiMemoryModule],
  providers: [AiEngineService, OpenAiProvider, AnthropicProvider, GeminiProvider],
  exports: [AiEngineService],
})
export class AiEngineModule {}
