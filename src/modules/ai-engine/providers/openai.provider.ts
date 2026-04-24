import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAiOverrides {
  apiKey?: string;
  baseURL?: string;
}

@Injectable()
export class OpenAiProvider {
  private readonly logger = new Logger(OpenAiProvider.name);
  private defaultClient: OpenAI | null = null;

  constructor(private readonly configService: ConfigService) {}

  private buildClient(overrides?: OpenAiOverrides): OpenAI {
    if (overrides?.apiKey || overrides?.baseURL) {
      const apiKey =
        overrides.apiKey ?? this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('No API key provided (env OPENAI_API_KEY or context override)');
      }
      return new OpenAI({ apiKey, baseURL: overrides.baseURL });
    }

    if (!this.defaultClient) {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY not configured');
      }
      this.defaultClient = new OpenAI({ apiKey });
    }
    return this.defaultClient;
  }

  async chat(
    messages: ChatMessage[],
    model: string,
    maxTokens: number,
    overrides?: OpenAiOverrides,
  ): Promise<string> {
    try {
      const response = await this.buildClient(overrides).chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        stream: false,
      });
      return response.choices[0]?.message?.content ?? '';
    } catch (error) {
      this.logger.error(`OpenAI error: ${(error as Error).message}`);
      throw error;
    }
  }
}
