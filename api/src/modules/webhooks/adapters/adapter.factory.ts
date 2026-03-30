import { Injectable } from '@nestjs/common';
import { ChannelType } from '@prisma/client';

import { IChannelAdapter } from '../../../common/interfaces/channel-adapter.interface.js';
import { WhatsAppAdapter } from './whatsapp.adapter.js';
import { InstagramAdapter } from './instagram.adapter.js';
import { MessengerAdapter } from './messenger.adapter.js';
import { TelegramAdapter } from './telegram.adapter.js';

@Injectable()
export class AdapterFactory {
  private readonly adapters = new Map<ChannelType, IChannelAdapter>([
    [ChannelType.WHATSAPP, new WhatsAppAdapter()],
    [ChannelType.INSTAGRAM, new InstagramAdapter()],
    [ChannelType.MESSENGER, new MessengerAdapter()],
    [ChannelType.TELEGRAM, new TelegramAdapter()],
  ]);

  getAdapter(type: ChannelType): IChannelAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`No adapter registered for channel type: ${type}`);
    }
    return adapter;
  }
}
