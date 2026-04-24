import { Module } from '@nestjs/common';
import { ResponseDispatcherService } from './response-dispatcher.service.js';
import { SenderFactory } from './sender.factory.js';
import { WhatsAppSender } from './senders/whatsapp.sender.js';
import { EvolutionWhatsAppSender } from './senders/evolution-whatsapp.sender.js';
import { TelegramSender } from './senders/telegram.sender.js';
import { InstagramSender } from './senders/instagram.sender.js';
import { MessengerSender } from './senders/messenger.sender.js';

@Module({
  providers: [
    ResponseDispatcherService,
    SenderFactory,
    WhatsAppSender,
    EvolutionWhatsAppSender,
    TelegramSender,
    InstagramSender,
    MessengerSender,
  ],
  exports: [ResponseDispatcherService],
})
export class ResponseDispatcherModule {}
