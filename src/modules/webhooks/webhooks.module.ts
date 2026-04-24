import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { AdapterFactory } from './adapters/adapter.factory.js';

@Module({
  imports: [BullModule.registerQueue({ name: 'message-inbound' })],
  controllers: [WebhooksController],
  providers: [WebhooksService, AdapterFactory],
  exports: [WebhooksService],
})
export class WebhooksModule {}
