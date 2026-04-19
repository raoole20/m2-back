import { AiProvider, ContentType } from '@prisma/client';

export interface TranscribeInput {
  buffer: Buffer;
  mimeType: string;
  contentType: ContentType;
  prompt: string;
  model?: string;
  apiKey?: string;
  apiBaseUrl?: string;
}

export interface MediaTranscriber {
  readonly provider: AiProvider;
  readonly supportedTypes: ContentType[];
  supports(contentType: ContentType): boolean;
  transcribe(input: TranscribeInput): Promise<string>;
}
