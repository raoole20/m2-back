import { Injectable, Logger } from '@nestjs/common';
import { BaseSender, SendMessagePayload, SendResult } from './base.sender.js';

@Injectable()
export class InstagramSender extends BaseSender {
  private readonly logger = new Logger(InstagramSender.name);

  async send(
    payload: SendMessagePayload,
    credentials: Record<string, unknown>,
  ): Promise<SendResult> {
    const { pageAccessToken } = credentials as { pageAccessToken: string };
    const url = 'https://graph.facebook.com/v18.0/me/messages';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pageAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: payload.contactExternalId },
          message: { text: payload.content },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Instagram API error (${response.status}): ${errorBody}`,
        );
        return { success: false, error: `Instagram API error: ${response.status}` };
      }

      const data = (await response.json()) as { message_id?: string };

      return { success: true, externalMessageId: data.message_id };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Instagram send failed: ${message}`);
      return { success: false, error: message };
    }
  }
}
