import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class OpenAiProvider {
  private readonly logger = new Logger(OpenAiProvider.name);
  private client: OpenAI | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY not configured');
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  async chat(
    messages: ChatMessage[],
    model: string,
    maxTokens: number,
  ): Promise<string> {
    try {
      const response = await this.getClient().chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
      });
      return response.choices[0]?.message?.content ?? '';
    } catch (error) {
      this.logger.error(`OpenAI error: ${(error as Error).message}`);
      throw error;
    }
  }
}
