import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenantId(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async update(tenantId: string, dto: UpdateTenantDto) {
    await this.findByTenantId(tenantId);

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.settings !== undefined && {
          settings: dto.settings as Prisma.InputJsonValue,
        }),
      },
    });
  }
}
