import { Injectable } from '@nestjs/common';
import { ChannelType, ChannelProvider } from '@prisma/client';

import { IChannelAdapter } from '../../../common/interfaces/channel-adapter.interface.js';
import { WhatsAppAdapter } from './whatsapp.adapter.js';
import { InstagramAdapter } from './instagram.adapter.js';
import { MessengerAdapter } from './messenger.adapter.js';
import { TelegramAdapter } from './telegram.adapter.js';
import { EvolutionWhatsAppAdapter } from './evolution-whatsapp.adapter.js';

@Injectable()
export class AdapterFactory {
  private readonly adapters = new Map<string, IChannelAdapter>([
    [this.key(ChannelType.WHATSAPP, ChannelProvider.META), new WhatsAppAdapter()],
    [this.key(ChannelType.WHATSAPP, ChannelProvider.EVOLUTION), new EvolutionWhatsAppAdapter()],
    [this.key(ChannelType.INSTAGRAM, ChannelProvider.META), new InstagramAdapter()],
    [this.key(ChannelType.MESSENGER, ChannelProvider.META), new MessengerAdapter()],
    [this.key(ChannelType.TELEGRAM, ChannelProvider.META), new TelegramAdapter()],
  ]);

  getAdapter(
    type: ChannelType,
    provider: ChannelProvider = ChannelProvider.META,
  ): IChannelAdapter {
    const adapter = this.adapters.get(this.key(type, provider));
    if (!adapter) {
      throw new Error(
        `No adapter registered for channel type: ${type}, provider: ${provider}`,
      );
    }
    return adapter;
  }

  private key(type: ChannelType, provider: ChannelProvider): string {
    return `${type}:${provider}`;
  }
}
