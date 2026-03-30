import { ChannelType, ContentType } from '@prisma/client';

export interface NormalizedMessage {
  externalId: string;
  channelType: ChannelType;
  channelId: string;
  tenantId: string;
  senderId: string;
  senderName?: string;
  senderPhone?: string;
  content: string;
  contentType: ContentType;
  mediaUrl?: string;
  mediaMimeType?: string;
  replyToExternalId?: string;
  timestamp: Date;
  rawPayload: Record<string, unknown>;
}
