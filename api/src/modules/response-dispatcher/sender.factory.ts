import { Injectable } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { BaseSender } from './senders/base.sender.js';
import { WhatsAppSender } from './senders/whatsapp.sender.js';
import { TelegramSender } from './senders/telegram.sender.js';
import { InstagramSender } from './senders/instagram.sender.js';
import { MessengerSender } from './senders/messenger.sender.js';

@Injectable()
export class SenderFactory {
  private readonly senders: Map<ChannelType, BaseSender>;

  constructor(
    whatsAppSender: WhatsAppSender,
    telegramSender: TelegramSender,
    instagramSender: InstagramSender,
    messengerSender: MessengerSender,
  ) {
    this.senders = new Map<ChannelType, BaseSender>([
      [ChannelType.WHATSAPP, whatsAppSender],
      [ChannelType.TELEGRAM, telegramSender],
      [ChannelType.INSTAGRAM, instagramSender],
      [ChannelType.MESSENGER, messengerSender],
    ]);
  }

  getSender(channelType: ChannelType): BaseSender | undefined {
    return this.senders.get(channelType);
  }
}
