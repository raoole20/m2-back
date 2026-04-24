import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { CurrentTenant } from '../../common/decorators/tenant.decorator.js';
import { ActionsService } from './actions.service.js';
import { QueryActionsDto } from './dto/query-actions.dto.js';

@ApiTags('Actions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('actions')
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Get()
  @ApiOperation({ summary: 'List action logs (paginated)' })
  @ApiResponse({ status: 200, description: 'Actions retrieved successfully' })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: QueryActionsDto,
  ) {
    return this.actionsService.getActions(tenantId, query);
  }

  @Get('conversation/:conversationId')
  @ApiOperation({ summary: 'Get all actions for a conversation' })
  @ApiResponse({ status: 200, description: 'Conversation actions retrieved successfully' })
  async findByConversation(
    @CurrentTenant() tenantId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.actionsService.getConversationActions(tenantId, conversationId);
  }
}
