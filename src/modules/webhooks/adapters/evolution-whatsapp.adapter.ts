import { ChannelType, ContentType } from '@prisma/client';

import { NormalizedMessage } from '../../../common/interfaces/normalized-message.interface.js';
import { BaseAdapter } from './base.adapter.js';

interface EvolutionMessageKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
}

interface EvolutionData {
  key: EvolutionMessageKey;
  pushName?: string;
  message?: Record<string, unknown>;
  messageType?: string;
  messageTimestamp?: number;
}

interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: EvolutionData;
}

export class EvolutionWhatsAppAdapter extends BaseAdapter {
  validateSignature(
    _rawBody: Buffer,
    signature: string,
    secret: string,
  ): boolean {
    return signature === secret;
  }

  normalizeInbound(
    payload: Record<string, unknown>,
    channelId: string,
    tenantId: string,
  ): NormalizedMessage[] {
    const webhook = payload as unknown as EvolutionWebhookPayload;

    if (webhook.event !== 'messages.upsert') return [];

    const { data } = webhook;
    if (!data?.key) return [];

    if (data.key.fromMe) return [];

    const remoteJid = data.key.remoteJid;
    if (remoteJid.endsWith('@g.us')) return [];

    const senderId = this.extractPhoneNumber(remoteJid);
    const { content, contentType, mediaUrl, mediaMimeType } =
      this.extractContent(data);

    const replyToExternalId = this.extractReplyTo(data);

    return [
      {
        externalId: data.key.id,
        channelType: ChannelType.WHATSAPP,
        channelId,
        tenantId,
        senderId,
        senderName: data.pushName,
        senderPhone: senderId,
        content,
        contentType,
        mediaUrl,
        mediaMimeType,
        replyToExternalId,
        timestamp: new Date((data.messageTimestamp ?? 0) * 1000),
        rawPayload: payload,
      },
    ];
  }

  private extractPhoneNumber(remoteJid: string): string {
    return remoteJid.replace(/@s\.whatsapp\.net$/, '');
  }

  private extractContent(data: EvolutionData): {
    content: string;
    contentType: ContentType;
    mediaUrl?: string;
    mediaMimeType?: string;
  } {
    const msg = data.message ?? {};
    const messageType = data.messageType ?? '';

    switch (messageType) {
      case 'conversation':
        return {
          content: (msg.conversation as string) ?? '',
          contentType: ContentType.TEXT,
        };

      case 'extendedTextMessage': {
        const ext = msg.extendedTextMessage as Record<string, unknown>;
        return {
          content: (ext?.text as string) ?? '',
          contentType: ContentType.TEXT,
        };
      }

      case 'imageMessage': {
        const img = msg.imageMessage as Record<string, unknown>;
        return {
          content: (img?.caption as string) ?? '',
          contentType: ContentType.IMAGE,
          mediaUrl: (img?.url as string) ?? (img?.mediaUrl as string),
          mediaMimeType: (img?.mimetype as string),
        };
      }

      case 'videoMessage': {
        const vid = msg.videoMessage as Record<string, unknown>;
        return {
          content: (vid?.caption as string) ?? '',
          contentType: ContentType.VIDEO,
          mediaUrl: (vid?.url as string) ?? (vid?.mediaUrl as string),
          mediaMimeType: (vid?.mimetype as string),
        };
      }

      case 'audioMessage':
      case 'pttMessage': {
        const audio = msg[messageType] as Record<string, unknown>;
        return {
          content: '',
          contentType: ContentType.AUDIO,
          mediaUrl: (audio?.url as string) ?? (audio?.mediaUrl as string),
          mediaMimeType: (audio?.mimetype as string),
        };
      }

      case 'documentMessage': {
        const doc = msg.documentMessage as Record<string, unknown>;
        return {
          content: (doc?.caption as string) ?? (doc?.fileName as string) ?? '',
          contentType: ContentType.DOCUMENT,
          mediaUrl: (doc?.url as string) ?? (doc?.mediaUrl as string),
          mediaMimeType: (doc?.mimetype as string),
        };
      }

      case 'stickerMessage': {
        const sticker = msg.stickerMessage as Record<string, unknown>;
        return {
          content: '',
          contentType: ContentType.STICKER,
          mediaUrl: (sticker?.url as string) ?? (sticker?.mediaUrl as string),
          mediaMimeType: (sticker?.mimetype as string),
        };
      }

      case 'locationMessage': {
        const loc = msg.locationMessage as Record<string, unknown>;
        return {
          content: `${loc?.degreesLatitude ?? 0},${loc?.degreesLongitude ?? 0}`,
          contentType: ContentType.LOCATION,
        };
      }

      case 'reactionMessage': {
        const reaction = msg.reactionMessage as Record<string, unknown>;
        return {
          content: (reaction?.text as string) ?? '',
          contentType: ContentType.REACTION,
        };
      }

      default:
        return {
          content: '',
          contentType: ContentType.TEXT,
        };
    }
  }

  private extractReplyTo(data: EvolutionData): string | undefined {
    const msg = data.message ?? {};
    const contextInfo = (
      msg.extendedTextMessage as Record<string, unknown>
    )?.contextInfo as Record<string, unknown> | undefined;

    return contextInfo?.stanzaId as string | undefined;
  }
}
