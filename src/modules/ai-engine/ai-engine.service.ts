import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemoryRole } from '@prisma/client';
import { AiContextService } from '../ai-context/ai-context.service.js';
import { AiMemoryService } from '../ai-memory/ai-memory.service.js';
import { decrypt } from '../../shared/utils/crypto.util.js';
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
    private readonly configService: ConfigService,
  ) {}

  private resolveApiKey(encryptedOrPlain: string | null | undefined): string | undefined {
    if (!encryptedOrPlain) return undefined;
    if (encryptedOrPlain.split(':').length === 3) {
      try {
        const key = this.configService.getOrThrow<string>('ENCRYPTION_KEY');
        return decrypt(encryptedOrPlain, key);
      } catch {
        return encryptedOrPlain;
      }
    }
    return encryptedOrPlain;
  }

  async processMessage(
    tenantId: string,
    conversationId: string,
    userMessage: string,
  ): Promise<string | null> {
    const context = await this.aiContextService.getActiveContext(tenantId);
    if (!context) {
      this.logger.warn(
        `⚠️  Sin AiContext activo para tenant ${tenantId.slice(0, 8)} — crea uno con POST /api/ai-contexts`,
      );
      return null;
    }

    this.logger.debug(
      `🧠 Usando contexto "${context.name}" (${context.provider}/${context.model})`,
    );

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

    const apiKeyOverride = this.resolveApiKey(context.apiKey);
    const baseUrlOverride = context.apiBaseUrl ?? undefined;

    let response: string;
    try {
      if (context.provider === 'OPENAI' || context.provider === 'CUSTOM') {
        response = await this.openAiProvider.chat(
          messages,
          context.model,
          context.maxTokens,
          { apiKey: apiKeyOverride, baseURL: baseUrlOverride },
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
        this.logger.warn(
          `⚠️  Proveedor IA no soportado: ${context.provider}`,
        );
        return context.fallbackMessage ?? null;
      }
    } catch (error) {
      this.logger.error(
        `❌ Proveedor IA (${context.provider}/${context.model}) falló: ${(error as Error).message}`,
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
