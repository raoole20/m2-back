import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { MessageInboundProcessor } from '../../queue/processors/message-inbound.processor.js';
import { ContactResolver } from './steps/contact-resolver.js';
import { ConversationResolver } from './steps/conversation-resolver.js';
import { MessagePersister } from './steps/message-persister.js';
import { AiEngineModule } from '../ai-engine/ai-engine.module.js';
import { ResponseDispatcherModule } from '../response-dispatcher/response-dispatcher.module.js';
import { ActionsModule } from '../actions/actions.module.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'message-inbound' }),
    AiEngineModule,
    ResponseDispatcherModule,
    ActionsModule,
  ],
  providers: [
    MessageInboundProcessor,
    ContactResolver,
    ConversationResolver,
    MessagePersister,
  ],
})
export class MessagePipelineModule {}
