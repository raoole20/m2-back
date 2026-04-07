import { ContentType } from '@prisma/client';

export enum MessageCategory {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  OTHER = 'other',
}

export function discriminateMessageType(contentType: ContentType): MessageCategory {
  switch (contentType) {
    case ContentType.TEXT:
    case ContentType.TEMPLATE:
    case ContentType.REACTION:
      return MessageCategory.TEXT;
    case ContentType.IMAGE:
      return MessageCategory.IMAGE;
    case ContentType.AUDIO:
      return MessageCategory.AUDIO;
    case ContentType.DOCUMENT:
      return MessageCategory.DOCUMENT;
    default:
      return MessageCategory.OTHER;
  }
}
