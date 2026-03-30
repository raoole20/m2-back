import { Module } from '@nestjs/common';
import { AiContextController } from './ai-context.controller.js';
import { AiContextService } from './ai-context.service.js';

@Module({
  controllers: [AiContextController],
  providers: [AiContextService],
  exports: [AiContextService],
})
export class AiContextModule {}
