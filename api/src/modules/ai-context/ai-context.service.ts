import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateAiContextDto } from './dto/create-ai-context.dto.js';
import { UpdateAiContextDto } from './dto/update-ai-context.dto.js';

@Injectable()
export class AiContextService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateAiContextDto) {
    return this.prisma.aiContext.create({
      data: {
        tenantId,
        name: dto.name,
        systemPrompt: dto.systemPrompt,
        personality: dto.personality,
        language: dto.language ?? 'es',
        provider: dto.provider ?? 'OPENAI',
        model: dto.model ?? 'gpt-4o-mini',
        maxTokens: dto.maxTokens ?? 1000,
        memoryWindowSize: dto.memoryWindowSize ?? 20,
        fallbackMessage: dto.fallbackMessage,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.aiContext.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { contextFiles: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const context = await this.prisma.aiContext.findFirst({
      where: { id, tenantId },
      include: { contextFiles: true },
    });

    if (!context) {
      throw new NotFoundException('AI Context not found');
    }

    return context;
  }

  async update(tenantId: string, id: string, dto: UpdateAiContextDto) {
    await this.findOne(tenantId, id);

    return this.prisma.aiContext.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    return this.prisma.aiContext.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getActiveContext(tenantId: string) {
    return this.prisma.aiContext.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
