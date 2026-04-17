import { ChannelType, ContentType } from '@prisma/client';
import { EvolutionWhatsAppAdapter } from './evolution-whatsapp.adapter';

describe('EvolutionWhatsAppAdapter', () => {
  let adapter: EvolutionWhatsAppAdapter;

  beforeEach(() => {
    adapter = new EvolutionWhatsAppAdapter();
  });

  describe('validateSignature()', () => {
    it('should return true when apikey matches secret', () => {
      const body = Buffer.from('{}');
      const result = adapter.validateSignature(body, 'my-api-key', 'my-api-key');
      expect(result).toBe(true);
    });

    it('should return false when apikey does not match', () => {
      const body = Buffer.from('{}');
      const result = adapter.validateSignature(body, 'wrong-key', 'my-api-key');
      expect(result).toBe(false);
    });
  });

  describe('handleVerification()', () => {
    it('should return null (Evolution does not use challenge)', () => {
      const result = adapter.handleVerification({}, 'token');
      expect(result).toBeNull();
    });
  });

  describe('normalizeInbound()', () => {
    const channelId = 'channel-1';
    const tenantId = 'tenant-1';

    it('should parse a text message (conversation type)', () => {
      const payload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        data: {
          key: {
            remoteJid: '5491155551234@s.whatsapp.net',
            fromMe: false,
            id: 'MSG001',
          },
          pushName: 'John Doe',
          message: { conversation: 'Hello from Evolution' },
          messageType: 'conversation',
          messageTimestamp: 1700000000,
        },
      };

      const result = adapter.normalizeInbound(payload, channelId, tenantId);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        externalId: 'MSG001',
        channelType: ChannelType.WHATSAPP,
        channelId,
        tenantId,
        senderId: '5491155551234',
        senderName: 'John Doe',
        senderPhone: '5491155551234',
        content: 'Hello from Evolution',
        contentType: ContentType.TEXT,
        timestamp: new Date(1700000000 * 1000),
      });
    });

    it('should parse an extendedTextMessage', () => {
      const payload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        data: {
          key: {
            remoteJid: '5491155551234@s.whatsapp.net',
            fromMe: false,
            id: 'MSG002',
          },
          pushName: 'Jane',
          message: {
            extendedTextMessage: { text: 'Extended text message' },
          },
          messageType: 'extendedTextMessage',
          messageTimestamp: 1700000001,
        },
      };

      const result = adapter.normalizeInbound(payload, channelId, tenantId);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Extended text message');
      expect(result[0].contentType).toBe(ContentType.TEXT);
    });

    it('should parse an image message with caption', () => {
      const payload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        data: {
          key: {
            remoteJid: '5491155551234@s.whatsapp.net',
            fromMe: false,
            id: 'MSG003',
          },
          pushName: 'Jane',
          message: {
            imageMessage: {
              url: 'https://media.example.com/img.jpg',
              caption: 'Check this out',
              mimetype: 'image/jpeg',
            },
          },
          messageType: 'imageMessage',
          messageTimestamp: 1700000002,
        },
      };

      const result = adapter.normalizeInbound(payload, channelId, tenantId);

      expect(result).toHaveLength(1);
      expect(result[0].contentType).toBe(ContentType.IMAGE);
      expect(result[0].content).toBe('Check this out');
      expect(result[0].mediaUrl).toBe('https://media.example.com/img.jpg');
      expect(result[0].mediaMimeType).toBe('image/jpeg');
    });

    it('should parse an audio message', () => {
      const payload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        data: {
          key: {
            remoteJid: '5491155551234@s.whatsapp.net',
            fromMe: false,
            id: 'MSG004',
          },
          message: {
            audioMessage: {
              url: 'https://media.example.com/audio.ogg',
              mimetype: 'audio/ogg',
            },
          },
          messageType: 'audioMessage',
          messageTimestamp: 1700000003,
        },
      };

      const result = adapter.normalizeInbound(payload, channelId, tenantId);

      expect(result).toHaveLength(1);
      expect(result[0].contentType).toBe(ContentType.AUDIO);
      expect(result[0].mediaUrl).toBe('https://media.example.com/audio.ogg');
    });

    it('should parse a location message', () => {
      const payload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        data: {
          key: {
            remoteJid: '5491155551234@s.whatsapp.net',
            fromMe: false,
            id: 'MSG005',
          },
          message: {
            locationMessage: {
              degreesLatitude: 40.7128,
              degreesLongitude: -74.006,
            },
          },
          messageType: 'locationMessage',
          messageTimestamp: 1700000004,
        },
      };

      const result = adapter.normalizeInbound(payload, channelId, tenantId);

      expect(result).toHaveLength(1);
      expect(result[0].contentType).toBe(ContentType.LOCATION);
      expect(result[0].content).toBe('40.7128,-74.006');
    });

    it('should ignore fromMe messages', () => {
      const payload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        data: {
          key: {
            remoteJid: '5491155551234@s.whatsapp.net',
            fromMe: true,
            id: 'MSG006',
          },
          message: { conversation: 'My own message' },
          messageType: 'conversation',
          messageTimestamp: 1700000005,
        },
      };

      const result = adapter.normalizeInbound(payload, channelId, tenantId);

      expect(result).toEqual([]);
    });

    it('should ignore group messages', () => {
      const payload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        data: {
          key: {
            remoteJid: '120363001234567890@g.us',
            fromMe: false,
            id: 'MSG007',
          },
          message: { conversation: 'Group message' },
          messageType: 'conversation',
          messageTimestamp: 1700000006,
        },
      };

      const result = adapter.normalizeInbound(payload, channelId, tenantId);

      expect(result).toEqual([]);
    });

    it('should return empty array for non-messages.upsert events', () => {
      const payload = {
        event: 'connection.update',
        instance: 'test-instance',
        data: { state: 'open' },
      };

      const result = adapter.normalizeInbound(
        payload as Record<string, unknown>,
        channelId,
        tenantId,
      );

      expect(result).toEqual([]);
    });
  });
});
