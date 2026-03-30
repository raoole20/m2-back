import { Module } from '@nestjs/common';
import { ActionsService } from './actions.service.js';
import { ActionsController } from './actions.controller.js';

@Module({
  controllers: [ActionsController],
  providers: [ActionsService],
  exports: [ActionsService],
})
export class ActionsModule {}
