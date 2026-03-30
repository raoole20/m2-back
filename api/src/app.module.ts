import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { QueueModule } from './queue/queue.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';
import { ChannelsModule } from './modules/channels/channels.module.js';
import { ContactsModule } from './modules/contacts/contacts.module.js';
import { ConversationsModule } from './modules/conversations/conversations.module.js';
import { MessagesModule } from './modules/messages/messages.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AiContextModule } from './modules/ai-context/ai-context.module.js';
import { AiMemoryModule } from './modules/ai-memory/ai-memory.module.js';
import { AiEngineModule } from './modules/ai-engine/ai-engine.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { MessagePipelineModule } from './modules/message-pipeline/message-pipeline.module.js';
import { ResponseDispatcherModule } from './modules/response-dispatcher/response-dispatcher.module.js';
import { ActionsModule } from './modules/actions/actions.module.js';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    QueueModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    ChannelsModule,
    ContactsModule,
    ConversationsModule,
    MessagesModule,
    AiContextModule,
    AiMemoryModule,
    AiEngineModule,
    WebhooksModule,
    MessagePipelineModule,
    ResponseDispatcherModule,
    ActionsModule,
  ],
})
export class AppModule {}
