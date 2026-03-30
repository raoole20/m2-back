import { Injectable, Logger } from '@nestjs/common';
import { MemoryRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class AiMemoryService {
  private readonly logger = new Logger(AiMemoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async addEntry(conversationId: string, role: MemoryRole, content: string) {
    const tokenCount = Math.ceil(content.length / 4);

    return this.prisma.aiMemoryEntry.create({
      data: {
        conversationId,
        role,
        content,
        tokenCount,
      },
    });
  }

  async getConversationMemory(conversationId: string, windowSize: number) {
    return this.prisma.aiMemoryEntry.findMany({
      where: {
        conversationId,
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
      take: windowSize,
    });
  }

  async summarizeOldEntries(conversationId: string, windowSize: number) {
    const threshold = Math.floor(windowSize * 1.5);

    const totalActive = await this.prisma.aiMemoryEntry.count({
      where: { conversationId, isActive: true },
    });

    if (totalActive <= threshold) {
      return;
    }

    const entriesToSummarize = await this.prisma.aiMemoryEntry.findMany({
      where: { conversationId, isActive: true },
      orderBy: { createdAt: 'asc' },
      take: totalActive - windowSize,
    });

    if (entriesToSummarize.length === 0) {
      return;
    }

    const summaryContent = entriesToSummarize
      .map((entry) => `[${entry.role}]: ${entry.content}`)
      .join('\n');

    const entryIds = entriesToSummarize.map((entry) => entry.id);

    await this.prisma.$transaction([
      this.prisma.aiMemoryEntry.create({
        data: {
          conversationId,
          role: MemoryRole.SUMMARY,
          content: summaryContent,
          tokenCount: Math.ceil(summaryContent.length / 4),
        },
      }),
      this.prisma.aiMemoryEntry.updateMany({
        where: { id: { in: entryIds } },
        data: { isActive: false },
      }),
    ]);

    this.logger.log(
      `Summarized ${entriesToSummarize.length} entries for conversation ${conversationId}`,
    );
  }

  async clearMemory(conversationId: string) {
    return this.prisma.aiMemoryEntry.updateMany({
      where: { conversationId },
      data: { isActive: false },
    });
  }
}
