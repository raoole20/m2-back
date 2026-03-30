import { Module } from '@nestjs/common';
import { AiMemoryService } from './ai-memory.service.js';

@Module({
  providers: [AiMemoryService],
  exports: [AiMemoryService],
})
export class AiMemoryModule {}
