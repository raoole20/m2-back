import {
  Controller,
  Get,
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
import { MessagesService } from './messages.service.js';
import { QueryMessagesDto } from './dto/query-messages.dto.js';

@ApiTags('Messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'List messages for a conversation' })
  @ApiResponse({ status: 200, description: 'Messages retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: QueryMessagesDto,
  ) {
    return this.messagesService.findAll(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single message' })
  @ApiResponse({ status: 200, description: 'Message retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.messagesService.findOne(tenantId, id);
  }
}
