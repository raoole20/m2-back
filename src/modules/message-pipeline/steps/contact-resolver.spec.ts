import { Test, TestingModule } from '@nestjs/testing';
import { ChannelType, ContentType } from '@prisma/client';
import { ContactResolver } from './contact-resolver';
import { PrismaService } from '../../../prisma/prisma.service';
import { NormalizedMessage } from '../../../common/interfaces/normalized-message.interface';

const mockPrismaService = {
  contact: {
    upsert: jest.fn(),
  },
};

describe('ContactResolver', () => {
  let resolver: ContactResolver;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactResolver,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    resolver = module.get<ContactResolver>(ContactResolver);
  });

  const tenantId = 'tenant-1';

  const buildNormalizedMessage = (
    overrides: Partial<NormalizedMessage> = {},
  ): NormalizedMessage => ({
    externalId: 'msg-ext-1',
    channelType: ChannelType.WHATSAPP,
    channelId: 'channel-1',
    tenantId,
    senderId: 'sender-123',
    senderName: 'John Doe',
    senderPhone: '+5491155551234',
    content: 'Hello',
    contentType: ContentType.TEXT,
    timestamp: new Date(),
    rawPayload: {},
    ...overrides,
  });

  it('should create a new contact when not found (upsert create path)', async () => {
    const msg = buildNormalizedMessage();
    const expectedContact = {
      id: 'contact-1',
      tenantId,
      externalId: 'sender-123',
      channelType: ChannelType.WHATSAPP,
      name: 'John Doe',
      phone: '+5491155551234',
    };

    mockPrismaService.contact.upsert.mockResolvedValue(expectedContact);

    const result = await resolver.resolve(tenantId, msg);

    expect(result).toEqual(expectedContact);
    expect(mockPrismaService.contact.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_externalId_channelType: {
          tenantId,
          externalId: 'sender-123',
          channelType: ChannelType.WHATSAPP,
        },
      },
      update: expect.objectContaining({
        lastContactAt: expect.any(Date),
        name: 'John Doe',
        phone: '+5491155551234',
      }),
      create: {
        tenantId,
        externalId: 'sender-123',
        channelType: ChannelType.WHATSAPP,
        name: 'John Doe',
        phone: '+5491155551234',
      },
    });
  });

  it('should update lastContactAt when contact exists (upsert update path)', async () => {
    const msg = buildNormalizedMessage();
    const existingContact = {
      id: 'contact-1',
      tenantId,
      externalId: 'sender-123',
      channelType: ChannelType.WHATSAPP,
      name: 'John Doe',
      phone: '+5491155551234',
      lastContactAt: new Date(),
    };

    mockPrismaService.contact.upsert.mockResolvedValue(existingContact);

    const result = await resolver.resolve(tenantId, msg);

    expect(result).toEqual(existingContact);

    const upsertCall = mockPrismaService.contact.upsert.mock.calls[0][0];
    expect(upsertCall.update.lastContactAt).toBeInstanceOf(Date);
  });

  it('should use correct tenant scoping in the composite unique key', async () => {
    const msg = buildNormalizedMessage({ senderId: 'unique-sender' });
    mockPrismaService.contact.upsert.mockResolvedValue({ id: 'contact-2' });

    await resolver.resolve(tenantId, msg);

    const upsertCall = mockPrismaService.contact.upsert.mock.calls[0][0];
    expect(upsertCall.where.tenantId_externalId_channelType).toEqual({
      tenantId,
      externalId: 'unique-sender',
      channelType: ChannelType.WHATSAPP,
    });
    expect(upsertCall.create.tenantId).toBe(tenantId);
  });
});
