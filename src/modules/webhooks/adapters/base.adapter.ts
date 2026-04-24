import { createHmac, timingSafeEqual } from 'crypto';

import { IChannelAdapter } from '../../../common/interfaces/channel-adapter.interface.js';
import { NormalizedMessage } from '../../../common/interfaces/normalized-message.interface.js';

export abstract class BaseAdapter implements IChannelAdapter {
  protected verifyHmac(
    payload: Buffer,
    signature: string,
    secret: string,
    algorithm: string,
  ): boolean {
    try {
      const expected = createHmac(algorithm, secret)
        .update(payload)
        .digest('hex');

      if (signature.length !== expected.length) return false;

      return timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      return false;
    }
  }

  abstract validateSignature(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): boolean;

  abstract normalizeInbound(
    payload: Record<string, unknown>,
    channelId: string,
    tenantId: string,
  ): NormalizedMessage[];

  handleVerification(
    _query: Record<string, string>,
    _verifyToken: string,
  ): string | null {
    return null;
  }
}
