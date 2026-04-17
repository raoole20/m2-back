import { Injectable, Logger } from '@nestjs/common';
import { MemoryRole } from '@prisma/client';
import { AiContextService } from '../ai-context/ai-context.service.js';
import { AiMemoryService } from '../ai-memory/ai-memory.service.js';
import { OpenAiProvider } from './providers/openai.provider.js';
import { AnthropicProvider } from './providers/anthropic.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);

  constructor(
    private readonly aiContextService: AiContextService,
    private readonly aiMemoryService: AiMemoryService,
    private readonly openAiProvider: OpenAiProvider,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly geminiProvider: GeminiProvider,
  ) {}

  async processMessage(
    tenantId: string,
    conversationId: string,
    userMessage: string,
  ): Promise<string | null> {
    const context = await this.aiContextService.getActiveContext(tenantId);
    if (!context) {
      return null;
    }

    await this.aiMemoryService.addEntry(
      conversationId,
      MemoryRole.USER,
      userMessage,
    );

    const memoryEntries = await this.aiMemoryService.getConversationMemory(
      conversationId,
      context.memoryWindowSize,
    );

    const messages: ChatMessage[] = [];

    let systemPrompt = context.systemPrompt;
    if (context.personality) {
      systemPrompt += `\n\nPersonalidad: ${context.personality}`;
    }
    if (context.language) {
      systemPrompt += `\nIdioma de respuesta: ${context.language}`;
    }
    messages.push({ role: 'system', content: systemPrompt });

    for (const entry of memoryEntries) {
      if (entry.role === MemoryRole.SUMMARY) {
        messages.push({
          role: 'system',
          content: `Resumen previo: ${entry.content}`,
        });
      } else {
        messages.push({
          role: entry.role === MemoryRole.USER ? 'user' : 'assistant',
          content: entry.content,
        });
      }
    }

    let response: string;
    try {
      if (context.provider === 'OPENAI') {
        response = await this.openAiProvider.chat(
          messages,
          context.model,
          context.maxTokens,
        );
      } else if (context.provider === 'ANTHROPIC') {
        response = await this.anthropicProvider.chat(
          messages,
          context.model,
          context.maxTokens,
        );
      } else if (context.provider === 'GEMINI') {
        response = await this.geminiProvider.chat(
          messages,
          context.model,
          context.maxTokens,
        );
      } else {
        return context.fallbackMessage ?? null;
      }
    } catch (error) {
      this.logger.error(
        `AI provider error for tenant ${tenantId}: ${(error as Error).message}`,
      );
      return context.fallbackMessage ?? null;
    }

    await this.aiMemoryService.addEntry(
      conversationId,
      MemoryRole.ASSISTANT,
      response,
    );

    await this.aiMemoryService.summarizeOldEntries(
      conversationId,
      context.memoryWindowSize,
    );

    return response;
  }
}
