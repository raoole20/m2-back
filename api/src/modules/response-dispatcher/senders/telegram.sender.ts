import { Injectable, Logger } from '@nestjs/common';
import { BaseSender, SendMessagePayload, SendResult } from './base.sender.js';

@Injectable()
export class TelegramSender extends BaseSender {
  private readonly logger = new Logger(TelegramSender.name);

  async send(
    payload: SendMessagePayload,
    credentials: Record<string, unknown>,
  ): Promise<SendResult> {
    const { botToken } = credentials as { botToken: string };
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: payload.contactExternalId,
          text: payload.content,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Telegram API error (${response.status}): ${errorBody}`,
        );
        return { success: false, error: `Telegram API error: ${response.status}` };
      }

      const data = (await response.json()) as {
        result?: { message_id: number };
      };
      const externalMessageId = data.result?.message_id?.toString();

      return { success: true, externalMessageId };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Telegram send failed: ${message}`);
      return { success: false, error: message };
    }
  }
}
