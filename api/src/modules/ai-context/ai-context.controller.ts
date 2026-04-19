import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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
import { AiContextService } from './ai-context.service.js';
import { CreateAiContextDto } from './dto/create-ai-context.dto.js';
import { UpdateAiContextDto } from './dto/update-ai-context.dto.js';

@ApiTags('AI Contexts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('ai-contexts')
export class AiContextController {
  constructor(private readonly aiContextService: AiContextService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new AI context' })
  @ApiResponse({ status: 201, description: 'AI Context created successfully' })
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateAiContextDto,
  ) {
    return this.aiContextService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all AI contexts with file count' })
  @ApiResponse({ status: 200, description: 'AI Contexts retrieved successfully' })
  async findAll(@CurrentTenant() tenantId: string) {
    return this.aiContextService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an AI context with context files' })
  @ApiResponse({ status: 200, description: 'AI Context retrieved successfully' })
  @ApiResponse({ status: 404, description: 'AI Context not found' })
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.aiContextService.findOne(tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an AI context' })
  @ApiResponse({ status: 200, description: 'AI Context updated successfully' })
  @ApiResponse({ status: 404, description: 'AI Context not found' })
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAiContextDto,
  ) {
    return this.aiContextService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete an AI context (set deletedAt)' })
  @ApiResponse({ status: 200, description: 'AI Context deleted successfully' })
  @ApiResponse({ status: 404, description: 'AI Context not found' })
  async remove(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.aiContextService.remove(tenantId, id);
  }
}
