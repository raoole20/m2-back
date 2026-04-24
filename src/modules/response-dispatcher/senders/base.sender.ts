export interface SendMessagePayload {
  channelId: string;
  contactExternalId: string;
  content: string;
  contentType: string;
  metadata?: Record<string, unknown>;
}

export interface SendResult {
  success: boolean;
  externalMessageId?: string;
  error?: string;
}

export abstract class BaseSender {
  abstract send(
    payload: SendMessagePayload,
    credentials: Record<string, unknown>,
  ): Promise<SendResult>;
}
