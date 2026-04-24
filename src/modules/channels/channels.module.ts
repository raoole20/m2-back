import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller.js';
import { ChannelsService } from './channels.service.js';
import { EvolutionController } from './evolution.controller.js';
import { EvolutionService } from './evolution.service.js';

@Module({
  controllers: [ChannelsController, EvolutionController],
  providers: [ChannelsService, EvolutionService],
  exports: [ChannelsService, EvolutionService],
})
export class ChannelsModule {}
