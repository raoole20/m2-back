import { ChannelType, ContentType } from '@prisma/client';

import { NormalizedMessage } from '../../../common/interfaces/normalized-message.interface.js';
import { BaseAdapter } from './base.adapter.js';

const WHATSAPP_TYPE_MAP: Record<string, ContentType> = {
  text: ContentType.TEXT,
  image: ContentType.IMAGE,
  video: ContentType.VIDEO,
  audio: ContentType.AUDIO,
  document: ContentType.DOCUMENT,
  sticker: ContentType.STICKER,
  location: ContentType.LOCATION,
  reaction: ContentType.REACTION,
};

export class WhatsAppAdapter extends BaseAdapter {
  validateSignature(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): boolean {
    const cleaned = signature.startsWith('sha256=')
      ? signature.slice(7)
      : signature;

    return this.verifyHmac(rawBody, cleaned, secret, 'sha256');
  }

  normalizeInbound(
    payload: Record<string, unknown>,
    channelId: string,
    tenantId: string,
  ): NormalizedMessage[] {
    const results: NormalizedMessage[] = [];
    const entry = (payload.entry as Array<Record<string, unknown>>)?.[0];
    if (!entry) return results;

    const changes = (entry.changes as Array<Record<string, unknown>>)?.[0];
    if (!changes) return results;

    const value = changes.value as Record<string, unknown>;
    if (!value) return results;

    const messages = value.messages as Array<Record<string, unknown>>;
    if (!messages?.length) return results;

    const contacts = (value.contacts as Array<Record<string, unknown>>) ?? [];
    const contactInfo = contacts[0] as
      | Record<string, unknown>
      | undefined;
    const profile = contactInfo?.profile as
      | Record<string, unknown>
      | undefined;

    for (const msg of messages) {
      const msgType = msg.type as string;
      const contentType = WHATSAPP_TYPE_MAP[msgType] ?? ContentType.TEXT;

      let content = '';
      let mediaUrl: string | undefined;
      let mediaMimeType: string | undefined;

      if (msgType === 'text') {
        const textObj = msg.text as Record<string, unknown>;
        content = (textObj?.body as string) ?? '';
      } else if (msgType === 'location') {
        const loc = msg.location as Record<string, unknown>;
        content = `${loc?.latitude},${loc?.longitude}`;
      } else if (msgType === 'reaction') {
        const reaction = msg.reaction as Record<string, unknown>;
        content = (reaction?.emoji as string) ?? '';
      } else {
        const mediaObj = msg[msgType] as Record<string, unknown>;
        if (mediaObj) {
          mediaUrl = mediaObj.id as string;
          mediaMimeType = mediaObj.mime_type as string;
          content = (mediaObj.caption as string) ?? '';
        }
      }

      const context = msg.context as Record<string, unknown> | undefined;

      results.push({
        externalId: msg.id as string,
        channelType: ChannelType.WHATSAPP,
        channelId,
        tenantId,
        senderId: msg.from as string,
        senderName: profile?.name as string | undefined,
        senderPhone: msg.from as string,
        content,
        contentType,
        mediaUrl,
        mediaMimeType,
        replyToExternalId: context?.message_id as string | undefined,
        timestamp: new Date(
          Number(msg.timestamp as string) * 1000,
        ),
        rawPayload: msg as Record<string, unknown>,
      });
    }

    return results;
  }

  handleVerification(
    query: Record<string, string>,
    verifyToken: string,
  ): string | null {
    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === verifyToken
    ) {
      return query['hub.challenge'] ?? null;
    }
    return null;
  }
}
