import { ChannelType, ContentType } from '@prisma/client';

import { NormalizedMessage } from '../../../common/interfaces/normalized-message.interface.js';
import { BaseAdapter } from './base.adapter.js';

export class MessengerAdapter extends BaseAdapter {
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

    const messagingArray = entry.messaging as Array<
      Record<string, unknown>
    >;
    if (!messagingArray?.length) return results;

    for (const event of messagingArray) {
      const sender = event.sender as Record<string, unknown>;
      const message = event.message as Record<string, unknown>;
      if (!sender || !message) continue;

      const senderId = sender.id as string;
      const text = (message.text as string) ?? '';
      const attachments = message.attachments as
        | Array<Record<string, unknown>>
        | undefined;

      let contentType: ContentType = ContentType.TEXT;
      let mediaUrl: string | undefined;
      let mediaMimeType: string | undefined;
      let content = text;

      if (attachments?.length) {
        const attachment = attachments[0];
        const type = attachment.type as string;
        const attachPayload = attachment.payload as Record<string, unknown>;

        if (type === 'image') contentType = ContentType.IMAGE;
        else if (type === 'video') contentType = ContentType.VIDEO;
        else if (type === 'audio') contentType = ContentType.AUDIO;
        else if (type === 'file') contentType = ContentType.DOCUMENT;

        mediaUrl = attachPayload?.url as string | undefined;

        if (!content && mediaUrl) {
          content = '';
        }
      }

      const replyTo = message.reply_to as
        | Record<string, unknown>
        | undefined;

      results.push({
        externalId: message.mid as string,
        channelType: ChannelType.MESSENGER,
        channelId,
        tenantId,
        senderId,
        content,
        contentType,
        mediaUrl,
        mediaMimeType,
        replyToExternalId: replyTo?.mid as string | undefined,
        timestamp: new Date(event.timestamp as number),
        rawPayload: event as Record<string, unknown>,
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
