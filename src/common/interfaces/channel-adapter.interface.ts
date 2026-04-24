import { NormalizedMessage } from './normalized-message.interface.js';

export interface IChannelAdapter {
  validateSignature(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): boolean;

  normalizeInbound(
    payload: Record<string, unknown>,
    channelId: string,
    tenantId: string,
  ): NormalizedMessage[];

  handleVerification(
    query: Record<string, string>,
    verifyToken: string,
  ): string | null;
}
