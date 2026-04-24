import { ChannelType, ContentType } from '@prisma/client';

import { NormalizedMessage } from '../../../common/interfaces/normalized-message.interface.js';
import { BaseAdapter } from './base.adapter.js';

export class TelegramAdapter extends BaseAdapter {
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
    const results: NormalizedMessage[] = [];
    const message = payload.message as Record<string, unknown>;
    if (!message) return results;

    const from = message.from as Record<string, unknown>;
    if (!from) return results;

    const chat = message.chat as Record<string, unknown>;
    const senderId = String(from.id);
    const senderName = [from.first_name, from.last_name]
      .filter(Boolean)
      .join(' ') || undefined;

    let content = '';
    let contentType: ContentType = ContentType.TEXT;
    let mediaUrl: string | undefined;
    let mediaMimeType: string | undefined;

    if (message.text) {
      content = message.text as string;
      contentType = ContentType.TEXT;
    } else if (message.photo) {
      const photos = message.photo as Array<Record<string, unknown>>;
      const largest = photos[photos.length - 1];
      mediaUrl = largest?.file_id as string;
      contentType = ContentType.IMAGE;
      content = (message.caption as string) ?? '';
    } else if (message.video) {
      const video = message.video as Record<string, unknown>;
      mediaUrl = video.file_id as string;
      mediaMimeType = video.mime_type as string | undefined;
      contentType = ContentType.VIDEO;
      content = (message.caption as string) ?? '';
    } else if (message.document) {
      const doc = message.document as Record<string, unknown>;
      mediaUrl = doc.file_id as string;
      mediaMimeType = doc.mime_type as string | undefined;
      contentType = ContentType.DOCUMENT;
      content = (message.caption as string) ?? '';
    } else if (message.audio) {
      const audio = message.audio as Record<string, unknown>;
      mediaUrl = audio.file_id as string;
      mediaMimeType = audio.mime_type as string | undefined;
      contentType = ContentType.AUDIO;
      content = (message.caption as string) ?? '';
    } else if (message.voice) {
      const voice = message.voice as Record<string, unknown>;
      mediaUrl = voice.file_id as string;
      mediaMimeType = voice.mime_type as string | undefined;
      contentType = ContentType.AUDIO;
    } else if (message.sticker) {
      const sticker = message.sticker as Record<string, unknown>;
      mediaUrl = sticker.file_id as string;
      contentType = ContentType.STICKER;
      content = (sticker.emoji as string) ?? '';
    } else if (message.location) {
      const loc = message.location as Record<string, unknown>;
      content = `${loc.latitude},${loc.longitude}`;
      contentType = ContentType.LOCATION;
    }

    const replyTo = message.reply_to_message as
      | Record<string, unknown>
      | undefined;

    results.push({
      externalId: String(message.message_id),
      channelType: ChannelType.TELEGRAM,
      channelId,
      tenantId,
      senderId,
      senderName,
      content,
      contentType,
      mediaUrl,
      mediaMimeType,
      replyToExternalId: replyTo
        ? String(replyTo.message_id)
        : undefined,
      timestamp: new Date((message.date as number) * 1000),
      rawPayload: payload,
    });

    return results;
  }
}
