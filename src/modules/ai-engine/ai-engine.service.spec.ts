import { Test, TestingModule } from '@nestjs/testing';
import { MemoryRole } from '@prisma/client';
import { AiEngineService } from './ai-engine.service';
import { AiContextService } from '../ai-context/ai-context.service';
import { AiMemoryService } from '../ai-memory/ai-memory.service';
import { OpenAiProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';

const mockAiContextService = {
  getActiveContext: jest.fn(),
};

const mockAiMemoryService = {
  addEntry: jest.fn().mockResolvedValue(undefined),
  getConversationMemory: jest.fn().mockResolvedValue([]),
  summarizeOldEntries: jest.fn().mockResolvedValue(undefined),
};

const mockOpenAiProvider = {
  chat: jest.fn(),
};

const mockAnthropicProvider = {
  chat: jest.fn(),
};

describe('AiEngineService', () => {
  let service: AiEngineService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiEngineService,
        { provide: AiContextService, useValue: mockAiContextService },
        { provide: AiMemoryService, useValue: mockAiMemoryService },
        { provide: OpenAiProvider, useValue: mockOpenAiProvider },
        { provide: AnthropicProvider, useValue: mockAnthropicProvider },
      ],
    }).compile();

    service = module.get<AiEngineService>(AiEngineService);
  });

  const tenantId = 'tenant-1';
  const conversationId = 'conv-1';
  const userMessage = 'Hello AI';

  const baseContext = {
    id: 'ctx-1',
    tenantId,
    systemPrompt: 'You are a helpful assistant.',
    personality: null as string | null,
    language: null as string | null,
    provider: 'OPENAI',
    model: 'gpt-4o-mini',
    maxTokens: 1000,
    memoryWindowSize: 20,
    fallbackMessage: 'Sorry, I am unavailable right now.',
    isActive: true,
  };

  describe('processMessage()', () => {
    it('should return null when no active context exists', async () => {
      mockAiContextService.getActiveContext.mockResolvedValue(null);

      const result = await service.processMessage(
        tenantId,
        conversationId,
        userMessage,
      );

      expect(result).toBeNull();
      expect(mockOpenAiProvider.chat).not.toHaveBeenCalled();
      expect(mockAnthropicProvider.chat).not.toHaveBeenCalled();
    });

    it('should call OpenAI when provider is OPENAI', async () => {
      mockAiContextService.getActiveContext.mockResolvedValue({
        ...baseContext,
        provider: 'OPENAI',
      });
      mockOpenAiProvider.chat.mockResolvedValue('Hello from OpenAI');

      const result = await service.processMessage(
        tenantId,
        conversationId,
        userMessage,
      );

      expect(result).toBe('Hello from OpenAI');
      expect(mockOpenAiProvider.chat).toHaveBeenCalledWith(
        expect.any(Array),
        'gpt-4o-mini',
        1000,
      );
      expect(mockAnthropicProvider.chat).not.toHaveBeenCalled();
    });

    it('should call Anthropic when provider is ANTHROPIC', async () => {
      mockAiContextService.getActiveContext.mockResolvedValue({
        ...baseContext,
        provider: 'ANTHROPIC',
        model: 'claude-3-5-sonnet',
      });
      mockAnthropicProvider.chat.mockResolvedValue('Hello from Anthropic');

      const result = await service.processMessage(
        tenantId,
        conversationId,
        userMessage,
      );

      expect(result).toBe('Hello from Anthropic');
      expect(mockAnthropicProvider.chat).toHaveBeenCalledWith(
        expect.any(Array),
        'claude-3-5-sonnet',
        1000,
      );
      expect(mockOpenAiProvider.chat).not.toHaveBeenCalled();
    });

    it('should return fallback message on provider error', async () => {
      mockAiContextService.getActiveContext.mockResolvedValue({
        ...baseContext,
        provider: 'OPENAI',
      });
      mockOpenAiProvider.chat.mockRejectedValue(new Error('API rate limit'));

      const result = await service.processMessage(
        tenantId,
        conversationId,
        userMessage,
      );

      expect(result).toBe('Sorry, I am unavailable right now.');
    });

    it('should add user and assistant entries to memory', async () => {
      mockAiContextService.getActiveContext.mockResolvedValue({
        ...baseContext,
        provider: 'OPENAI',
      });
      mockOpenAiProvider.chat.mockResolvedValue('AI response');

      await service.processMessage(tenantId, conversationId, userMessage);

      expect(mockAiMemoryService.addEntry).toHaveBeenCalledTimes(2);
      expect(mockAiMemoryService.addEntry).toHaveBeenNthCalledWith(
        1,
        conversationId,
        MemoryRole.USER,
        userMessage,
      );
      expect(mockAiMemoryService.addEntry).toHaveBeenNthCalledWith(
        2,
        conversationId,
        MemoryRole.ASSISTANT,
        'AI response',
      );
    });

    it('should trigger summarization after response', async () => {
      mockAiContextService.getActiveContext.mockResolvedValue({
        ...baseContext,
        provider: 'OPENAI',
      });
      mockOpenAiProvider.chat.mockResolvedValue('AI response');

      await service.processMessage(tenantId, conversationId, userMessage);

      expect(mockAiMemoryService.summarizeOldEntries).toHaveBeenCalledWith(
        conversationId,
        baseContext.memoryWindowSize,
      );
    });
  });
});
