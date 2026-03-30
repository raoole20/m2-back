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
    const contact = await this.prisma.contact.upsert({
      where: {
        tenantId_externalId_channelType: {
          tenantId,
          externalId: normalizedMsg.senderId,
          channelType: normalizedMsg.channelType,
        },
      },
      update: {
        lastContactAt: new Date(),
        ...(normalizedMsg.senderName && {
          name: normalizedMsg.senderName,
        }),
        ...(normalizedMsg.senderPhone && {
          phone: normalizedMsg.senderPhone,
        }),
      },
      create: {
        tenantId,
        externalId: normalizedMsg.senderId,
        channelType: normalizedMsg.channelType,
        name: normalizedMsg.senderName,
        phone: normalizedMsg.senderPhone,
      },
    });

    this.logger.debug(
      `Resolved contact ${contact.id} for sender ${normalizedMsg.senderId}`,
    );

    return contact;
  }
}
