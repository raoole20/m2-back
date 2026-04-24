import {
  Controller,
  Get,
  Patch,
  Body,
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
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentTenant } from '../../common/decorators/tenant.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { TenantsService } from './tenants.service.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';

@ApiTags('Tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current tenant info' })
  @ApiResponse({ status: 200, description: 'Tenant retrieved successfully' })
  async getMyTenant(@CurrentTenant() tenantId: string) {
    return this.tenantsService.findByTenantId(tenantId);
  }

  @Patch('me')
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Update current tenant (OWNER only)' })
  @ApiResponse({ status: 200, description: 'Tenant updated successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async updateMyTenant(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(tenantId, dto);
  }
}
