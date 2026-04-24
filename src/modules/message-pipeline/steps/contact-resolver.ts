import { Injectable, Logger } from '@nestjs/common';
import { Contact } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service.js';
import { NormalizedMessage } from '../../../common/interfaces/normalized-message.interface.js';

@Injectable()
export class ContactResolver {
  private readonly logger = new Logger(ContactResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    tenantId: string,
    normalizedMsg: NormalizedMessage,
  ): Promise<Contact> {
    const existing = await this.prisma.contact.findUnique({
      where: {
        tenantId_externalId_channelType: {
          tenantId,
          externalId: normalizedMsg.senderId,
          channelType: normalizedMsg.channelType,
        },
      },
      select: { id: true, name: true },
    });

    const updateData: Record<string, unknown> = { lastContactAt: new Date() };

    if (normalizedMsg.senderName && !existing?.name) {
      updateData.name = normalizedMsg.senderName;
    }
    if (normalizedMsg.senderPhone) {
      updateData.phone = normalizedMsg.senderPhone;
    }

    const contact = await this.prisma.contact.upsert({
      where: {
        tenantId_externalId_channelType: {
          tenantId,
          externalId: normalizedMsg.senderId,
          channelType: normalizedMsg.channelType,
        },
      },
      update: updateData,
      create: {
        tenantId,
        externalId: normalizedMsg.senderId,
        channelType: normalizedMsg.channelType,
        name: normalizedMsg.senderName,
        phone: normalizedMsg.senderPhone,
      },
    });

    this.logger.debug(
      `👤 Contacto identificado: ${normalizedMsg.senderName ?? normalizedMsg.senderId} (${contact.id.slice(0, 8)})`,
    );

    return contact;
  }
}
