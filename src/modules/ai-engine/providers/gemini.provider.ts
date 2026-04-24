import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class GeminiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private client: GoogleGenerativeAI | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      const apiKey = this.configService.get<string>('GEMINI_API_KEY');
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY not configured');
      }
      this.client = new GoogleGenerativeAI(apiKey);
    }
    return this.client;
  }

  async chat(
    messages: ChatMessage[],
    model: string,
    maxTokens: number,
  ): Promise<string> {
    try {
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      const genModel = this.getClient().getGenerativeModel({
        model,
        systemInstruction: systemMessage?.content,
        generationConfig: { maxOutputTokens: maxTokens },
      });

      const history = chatMessages.slice(0, -1).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const lastMessage = chatMessages[chatMessages.length - 1];

      const chat = genModel.startChat({ history });
      const result = await chat.sendMessage(lastMessage.content);

      return result.response.text();
    } catch (error) {
      this.logger.error(`Gemini error: ${(error as Error).message}`);
      throw error;
    }
  }
}
