import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { encrypt } from '../../shared/utils/crypto.util.js';
import { CreateAiContextDto } from './dto/create-ai-context.dto.js';
import { UpdateAiContextDto } from './dto/update-ai-context.dto.js';

@Injectable()
export class AiContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private encryptApiKey(plain?: string): string | undefined {
    if (!plain) return undefined;
    const key = this.config.getOrThrow<string>('ENCRYPTION_KEY');
    return encrypt(plain, key);
  }

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
        debounceSeconds: dto.debounceSeconds ?? 8,
        debounceMaxWaitSeconds: dto.debounceMaxWaitSeconds ?? 60,
        apiBaseUrl: dto.apiBaseUrl,
        apiKey: this.encryptApiKey(dto.apiKey),
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

    const data: Record<string, unknown> = { ...dto };
    if (dto.apiKey !== undefined) {
      data.apiKey = dto.apiKey ? this.encryptApiKey(dto.apiKey) : null;
    }

    return this.prisma.aiContext.update({
      where: { id },
      data,
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
