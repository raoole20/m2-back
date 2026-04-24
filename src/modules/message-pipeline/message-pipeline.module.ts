import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { MessageInboundProcessor } from '../../queue/processors/message-inbound.processor.js';
import { AiResponseProcessor } from '../../queue/processors/ai-response.processor.js';
import { ContactResolver } from './steps/contact-resolver.js';
import { ConversationResolver } from './steps/conversation-resolver.js';
import { MessagePersister } from './steps/message-persister.js';
import { AiContextModule } from '../ai-context/ai-context.module.js';
import { AiEngineModule } from '../ai-engine/ai-engine.module.js';
import { MediaProcessorModule } from '../media-processor/media-processor.module.js';
import { ResponseDispatcherModule } from '../response-dispatcher/response-dispatcher.module.js';
import { ActionsModule } from '../actions/actions.module.js';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'message-inbound' },
      { name: 'ai-response' },
    ),
    AiContextModule,
    AiEngineModule,
    MediaProcessorModule,
    ResponseDispatcherModule,
    ActionsModule,
  ],
  providers: [
    MessageInboundProcessor,
    AiResponseProcessor,
    ContactResolver,
    ConversationResolver,
    MessagePersister,
  ],
})
export class MessagePipelineModule {}
