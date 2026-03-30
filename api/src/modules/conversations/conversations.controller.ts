import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { CurrentTenant } from '../../common/decorators/tenant.decorator.js';
import { ConversationsService } from './conversations.service.js';
import { QueryConversationsDto } from './dto/query-conversations.dto.js';
import { UpdateConversationDto } from './dto/update-conversation.dto.js';

@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'List conversations with filters' })
  @ApiResponse({ status: 200, description: 'Conversations retrieved successfully' })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: QueryConversationsDto,
  ) {
    return this.conversationsService.findAll(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation detail with contact, channel, and recent messages' })
  @ApiResponse({ status: 200, description: 'Conversation retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.conversationsService.findOne(tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update conversation status, assignment, or AI setting' })
  @ApiResponse({ status: 200, description: 'Conversation updated successfully' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.update(tenantId, id, dto);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close a conversation' })
  @ApiResponse({ status: 200, description: 'Conversation closed successfully' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async close(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.conversationsService.close(tenantId, id);
  }
}
