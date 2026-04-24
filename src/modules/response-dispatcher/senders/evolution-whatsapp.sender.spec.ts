import { ConfigService } from '@nestjs/config';
import { EvolutionWhatsAppSender } from './evolution-whatsapp.sender';

describe('EvolutionWhatsAppSender', () => {
  let sender: EvolutionWhatsAppSender;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('http://evolution-api:8080'),
    } as unknown as ConfigService;
    sender = new EvolutionWhatsAppSender(configService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const payload = {
    channelId: 'channel-1',
    contactExternalId: '5491155551234',
    content: 'Hello from bot',
    contentType: 'text',
  };

  const credentials = {
    instanceName: 'test-instance',
    apiKey: 'test-api-key',
  };

  it('should send a text message successfully', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ key: { id: 'EVO_MSG_001' } }),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response);

    const result = await sender.send(payload, credentials);

    expect(result.success).toBe(true);
    expect(result.externalMessageId).toBe('EVO_MSG_001');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://evolution-api:8080/message/sendText/test-instance',
      expect.objectContaining({
        method: 'POST',
        headers: {
          apikey: 'test-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: '5491155551234',
          text: 'Hello from bot',
        }),
      }),
    );
  });

  it('should return error on HTTP failure', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response);

    const result = await sender.send(payload, credentials);

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
  });

  it('should return error on network failure', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('Connection refused'));

    const result = await sender.send(payload, credentials);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection refused');
  });

  it('should use evolutionApiUrl from credentials when provided', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ key: { id: 'EVO_MSG_002' } }),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as Response);

    const credentialsWithUrl = {
      ...credentials,
      evolutionApiUrl: 'http://custom-evolution:9090',
    };

    await sender.send(payload, credentialsWithUrl);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://custom-evolution:9090/message/sendText/test-instance',
      expect.anything(),
    );
  });
});
