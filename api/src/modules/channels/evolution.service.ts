import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EvolutionInstanceResponse {
  instance: {
    instanceName: string;
    status: string;
  };
  qrcode?: {
    base64: string;
  };
}

export interface EvolutionConnectionState {
  instance: {
    instanceName: string;
    state: string;
  };
}

export interface EvolutionContact {
  id: string;
  remoteJid?: string;
  pushName?: string | null;
  name?: string | null;
  profilePicUrl?: string | null;
  instanceId?: string;
}

export class EvolutionInstanceExistsError extends Error {
  constructor(public readonly instanceName: string) {
    super(`Evolution instance "${instanceName}" already exists`);
    this.name = 'EvolutionInstanceExistsError';
  }
}

@Injectable()
export class EvolutionService {
  private readonly logger = new Logger(EvolutionService.name);

  constructor(private readonly configService: ConfigService) {}

  private getBaseUrl(overrideUrl?: string): string {
    return (
      overrideUrl ??
      this.configService.get<string>(
        'EVOLUTION_API_URL',
        'http://evolution-api:8080',
      )
    );
  }

  async createInstance(
    instanceName: string,
    apiKey: string,
    baseUrl?: string,
  ): Promise<EvolutionInstanceResponse> {
    const url = `${this.getBaseUrl(baseUrl)}/instance/create`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      if (response.status === 403 && /already in use/i.test(error)) {
        throw new EvolutionInstanceExistsError(instanceName);
      }
      this.logger.error(
        `Failed to create Evolution instance (${response.status}): ${error}`,
      );
      throw new Error(`Evolution API error: ${response.status}`);
    }

    return (await response.json()) as EvolutionInstanceResponse;
  }

  async connectInstance(
    instanceName: string,
    apiKey: string,
    baseUrl?: string,
  ): Promise<EvolutionInstanceResponse> {
    const url = `${this.getBaseUrl(baseUrl)}/instance/connect/${instanceName}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { apikey: apiKey },
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(
        `Failed to connect Evolution instance (${response.status}): ${error}`,
      );
      throw new Error(`Evolution API error: ${response.status}`);
    }

    return (await response.json()) as EvolutionInstanceResponse;
  }

  async getConnectionStatus(
    instanceName: string,
    apiKey: string,
    baseUrl?: string,
  ): Promise<EvolutionConnectionState> {
    const url = `${this.getBaseUrl(baseUrl)}/instance/connectionState/${instanceName}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { apikey: apiKey },
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(
        `Failed to get Evolution connection state (${response.status}): ${error}`,
      );
      throw new Error(`Evolution API error: ${response.status}`);
    }

    return (await response.json()) as EvolutionConnectionState;
  }

  async setWebhook(
    instanceName: string,
    apiKey: string,
    callbackUrl: string,
    baseUrl?: string,
  ): Promise<void> {
    const url = `${this.getBaseUrl(baseUrl)}/webhook/set/${instanceName}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: callbackUrl,
          byEvents: false,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'CONNECTION_UPDATE',
          ],
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(
        `Failed to set Evolution webhook (${response.status}): ${error}`,
      );
      throw new Error(`Evolution API error: ${response.status}`);
    }

    this.logger.log(
      `🔗 Webhook Evolution registrado para "${instanceName}"`,
    );
  }

  async findContacts(
    instanceName: string,
    apiKey: string,
    baseUrl?: string,
  ): Promise<EvolutionContact[]> {
    const url = `${this.getBaseUrl(baseUrl)}/chat/findContacts/${instanceName}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ where: {} }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(
        `Failed to find Evolution contacts (${response.status}): ${error}`,
      );
      throw new Error(`Evolution API error: ${response.status}`);
    }

    const data = (await response.json()) as EvolutionContact[];
    return Array.isArray(data) ? data : [];
  }

  async deleteInstance(
    instanceName: string,
    apiKey: string,
    baseUrl?: string,
  ): Promise<void> {
    const url = `${this.getBaseUrl(baseUrl)}/instance/delete/${instanceName}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: { apikey: apiKey },
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(
        `Failed to delete Evolution instance (${response.status}): ${error}`,
      );
      throw new Error(`Evolution API error: ${response.status}`);
    }

    this.logger.log(`🗑️  Instancia Evolution eliminada: "${instanceName}"`);
  }
}
