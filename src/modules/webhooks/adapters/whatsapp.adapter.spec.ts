import { createHmac } from 'crypto';
import { ChannelType, ContentType } from '@prisma/client';
import { WhatsAppAdapter } from './whatsapp.adapter';

describe('WhatsAppAdapter', () => {
  let adapter: WhatsAppAdapter;

  beforeEach(() => {
    adapter = new WhatsAppAdapter();
  });

  describe('validateSignature()', () => {
    const secret = 'test-secret';

    it('should return true for a valid HMAC signature', () => {
      const body = Buffer.from('{"test":"data"}');
      const expectedSig = createHmac('sha256', secret)
        .update(body)
        .digest('hex');
      const signature = `sha256=${expectedSig}`;

      const result = adapter.validateSignature(body, signature, secret);

      expect(result).toBe(true);
    });

    it('should return false for an invalid HMAC signature', () => {
      const body = Buffer.from('{"test":"data"}');
      const signature = 'sha256=invalidhexsignaturevalue0000000000000000000000000000000000000000';

      const result = adapter.validateSignature(body, signature, secret);

      expect(result).toBe(false);
    });
  });

  describe('handleVerification()', () => {
    const verifyToken = 'my-verify-token';

    it('should return challenge when mode is subscribe and token matches', () => {
      const query = {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'my-verify-token',
        'hub.challenge': 'challenge-string-123',
      };

      const result = adapter.handleVerification(query, verifyToken);

      expect(result).toBe('challenge-string-123');
    });

    it('should return null when token does not match', () => {
      const query = {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': 'challenge-string-123',
      };

      const result = adapter.handleVerification(query, verifyToken);

      expect(result).toBeNull();
    });
  });

  describe('normalizeInbound()', () => {
    const channelId = 'channel-1';
    const tenantId = 'tenant-1';

    it('should parse a text message correctly', () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  contacts: [
                    {
                      profile: { name: 'John Doe' },
                      wa_id: '5491155551234',
                    },
                  ],
                  messages: [
                    {
                      id: 'wamid.abc123',
                      from: '5491155551234',
                      timestamp: '1700000000',
                      type: 'text',
                      text: { body: 'Hello World' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = adapter.normalizeInbound(payload, channelId, tenantId);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        externalId: 'wamid.abc123',
        channelType: ChannelType.WHATSAPP,
        channelId,
        tenantId,
        senderId: '5491155551234',
        senderName: 'John Doe',
        senderPhone: '5491155551234',
        content: 'Hello World',
        contentType: ContentType.TEXT,
        timestamp: new Date(1700000000 * 1000),
      });
    });

    it('should return empty array for status updates (no messages)', () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'wamid.status1',
                      status: 'delivered',
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = adapter.normalizeInbound(payload, channelId, tenantId);

      expect(result).toEqual([]);
    });
  });
});
