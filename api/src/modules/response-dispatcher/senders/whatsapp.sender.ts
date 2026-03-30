import { Injectable, Logger } from '@nestjs/common';
import { BaseSender, SendMessagePayload, SendResult } from './base.sender.js';

@Injectable()
export class WhatsAppSender extends BaseSender {
  private readonly logger = new Logger(WhatsAppSender.name);

  async send(
    payload: SendMessagePayload,
    credentials: Record<string, unknown>,
  ): Promise<SendResult> {
    const { phoneNumberId, accessToken } = credentials as {
      phoneNumberId: string;
      accessToken: string;
    };

    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: payload.contactExternalId,
          type: 'text',
          text: { body: payload.content },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `WhatsApp API error (${response.status}): ${errorBody}`,
        );
        return { success: false, error: `WhatsApp API error: ${response.status}` };
      }

      const data = (await response.json()) as {
        messages?: Array<{ id: string }>;
      };
      const externalMessageId = data.messages?.[0]?.id;

      return { success: true, externalMessageId };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`WhatsApp send failed: ${message}`);
      return { success: false, error: message };
    }
  }
}
