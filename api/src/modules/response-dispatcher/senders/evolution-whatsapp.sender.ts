import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseSender, SendMessagePayload, SendResult } from './base.sender.js';

@Injectable()
export class EvolutionWhatsAppSender extends BaseSender {
  private readonly logger = new Logger(EvolutionWhatsAppSender.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async send(
    payload: SendMessagePayload,
    credentials: Record<string, unknown>,
  ): Promise<SendResult> {
    const { instanceName, apiKey } = credentials as {
      instanceName: string;
      apiKey: string;
    };

    const baseUrl =
      (credentials.evolutionApiUrl as string) ??
      this.configService.get<string>(
        'EVOLUTION_API_URL',
        'http://evolution-api:8080',
      );

    const url = `${baseUrl}/message/sendText/${instanceName}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: payload.contactExternalId,
          text: payload.content,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Evolution API error (${response.status}): ${errorBody}`,
        );
        return {
          success: false,
          error: `Evolution API error: ${response.status}`,
        };
      }

      const data = (await response.json()) as {
        key?: { id?: string };
      };
      const externalMessageId = data.key?.id;

      return { success: true, externalMessageId };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Evolution send failed: ${message}`);
      return { success: false, error: message };
    }
  }
}
