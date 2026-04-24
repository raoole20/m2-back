import { Injectable } from '@nestjs/common';
import { ChannelType, ChannelProvider } from '@prisma/client';
import { BaseSender } from './senders/base.sender.js';
import { WhatsAppSender } from './senders/whatsapp.sender.js';
import { TelegramSender } from './senders/telegram.sender.js';
import { InstagramSender } from './senders/instagram.sender.js';
import { MessengerSender } from './senders/messenger.sender.js';
import { EvolutionWhatsAppSender } from './senders/evolution-whatsapp.sender.js';

@Injectable()
export class SenderFactory {
  private readonly senders: Map<string, BaseSender>;

  constructor(
    whatsAppSender: WhatsAppSender,
    evolutionWhatsAppSender: EvolutionWhatsAppSender,
    telegramSender: TelegramSender,
    instagramSender: InstagramSender,
    messengerSender: MessengerSender,
  ) {
    this.senders = new Map<string, BaseSender>([
      [this.key(ChannelType.WHATSAPP, ChannelProvider.META), whatsAppSender],
      [this.key(ChannelType.WHATSAPP, ChannelProvider.EVOLUTION), evolutionWhatsAppSender],
      [this.key(ChannelType.TELEGRAM, ChannelProvider.META), telegramSender],
      [this.key(ChannelType.INSTAGRAM, ChannelProvider.META), instagramSender],
      [this.key(ChannelType.MESSENGER, ChannelProvider.META), messengerSender],
    ]);
  }

  getSender(
    channelType: ChannelType,
    provider: ChannelProvider = ChannelProvider.META,
  ): BaseSender | undefined {
    return this.senders.get(this.key(channelType, provider));
  }

  private key(type: ChannelType, provider: ChannelProvider): string {
    return `${type}:${provider}`;
  }
}
