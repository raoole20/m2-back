import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Channel,
  ChannelProvider,
  ChannelType,
  Message,
} from '@prisma/client';

import { decrypt } from '../../shared/utils/crypto.util.js';

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
}

@Injectable()
export class MediaDownloaderService {
  private readonly logger = new Logger(MediaDownloaderService.name);

  constructor(private readonly config: ConfigService) {}

  async download(message: Message, channel: Channel): Promise<DownloadedMedia> {
    if (!message.mediaUrl) {
      throw new Error('Message has no mediaUrl');
    }

    const timeoutMs = this.config.get<number>(
      'MEDIA_DOWNLOAD_TIMEOUT_MS',
      15000,
    );
    const maxSizeMb = this.config.get<number>('MEDIA_MAX_FILE_SIZE_MB', 20);
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    if (channel.provider === ChannelProvider.EVOLUTION) {
      return this.downloadDirect(message.mediaUrl, message.mediaMimeType, timeoutMs, maxSizeBytes);
    }

    if (channel.type === ChannelType.TELEGRAM) {
      return this.downloadTelegram(
        message.mediaUrl,
        channel,
        message.mediaMimeType,
        timeoutMs,
        maxSizeBytes,
      );
    }

    if (channel.provider === ChannelProvider.META) {
      return this.downloadMeta(
        message.mediaUrl,
        channel,
        message.mediaMimeType,
        timeoutMs,
        maxSizeBytes,
      );
    }

    throw new Error(
      `No downloader for provider=${channel.provider} type=${channel.type}`,
    );
  }

  private decryptCredentials(channel: Channel): Record<string, string> {
    const key = this.config.getOrThrow<string>('ENCRYPTION_KEY');
    const raw =
      typeof channel.credentials === 'string'
        ? decrypt(channel.credentials, key)
        : decrypt(String(channel.credentials), key);
    return JSON.parse(raw);
  }

  private async downloadDirect(
    url: string,
    fallbackMime: string | null,
    timeoutMs: number,
    maxSize: number,
  ): Promise<DownloadedMedia> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Download failed ${res.status} ${res.statusText}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength > maxSize) {
        throw new Error(
          `File ${arrayBuffer.byteLength}B exceeds limit ${maxSize}B`,
        );
      }
      const mimeType =
        res.headers.get('content-type')?.split(';')[0].trim() ??
        fallbackMime ??
        'application/octet-stream';
      return { buffer: Buffer.from(arrayBuffer), mimeType };
    } finally {
      clearTimeout(timer);
    }
  }

  private async downloadMeta(
    fileId: string,
    channel: Channel,
    fallbackMime: string | null,
    timeoutMs: number,
    maxSize: number,
  ): Promise<DownloadedMedia> {
    const creds = this.decryptCredentials(channel);
    const accessToken = creds.accessToken ?? creds.access_token;
    if (!accessToken) {
      throw new Error('Meta channel credentials missing accessToken');
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v20.0/${fileId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!metaRes.ok) {
      throw new Error(`Meta media metadata fetch failed ${metaRes.status}`);
    }
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
    if (!meta.url) throw new Error('Meta media response missing url');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const fileRes = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (!fileRes.ok) {
        throw new Error(`Meta media download failed ${fileRes.status}`);
      }
      const arrayBuffer = await fileRes.arrayBuffer();
      if (arrayBuffer.byteLength > maxSize) {
        throw new Error(
          `File ${arrayBuffer.byteLength}B exceeds limit ${maxSize}B`,
        );
      }
      return {
        buffer: Buffer.from(arrayBuffer),
        mimeType: meta.mime_type ?? fallbackMime ?? 'application/octet-stream',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async downloadTelegram(
    fileId: string,
    channel: Channel,
    fallbackMime: string | null,
    timeoutMs: number,
    maxSize: number,
  ): Promise<DownloadedMedia> {
    const creds = this.decryptCredentials(channel);
    const botToken = creds.botToken ?? creds.bot_token;
    if (!botToken) {
      throw new Error('Telegram channel credentials missing botToken');
    }

    const metaRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );
    if (!metaRes.ok) {
      throw new Error(`Telegram getFile failed ${metaRes.status}`);
    }
    const meta = (await metaRes.json()) as {
      ok: boolean;
      result?: { file_path?: string };
    };
    if (!meta.ok || !meta.result?.file_path) {
      throw new Error('Telegram getFile missing file_path');
    }

    return this.downloadDirect(
      `https://api.telegram.org/file/bot${botToken}/${meta.result.file_path}`,
      fallbackMime,
      timeoutMs,
      maxSize,
    );
  }
}
