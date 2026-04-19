import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  IsArray,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { AiProvider, ContentType } from '@prisma/client';

export class CreateAiContextDto {
  @ApiProperty({ description: 'Context name', example: 'Customer Support Bot' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ description: 'System prompt for the AI', example: 'You are a helpful assistant...' })
  @IsString()
  @MinLength(1)
  systemPrompt!: string;

  @ApiPropertyOptional({ description: 'AI personality description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  personality?: string;

  @ApiPropertyOptional({ description: 'Response language', default: 'es' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional({ enum: AiProvider, description: 'AI provider', default: AiProvider.OPENAI })
  @IsOptional()
  @IsEnum(AiProvider)
  provider?: AiProvider;

  @ApiPropertyOptional({ description: 'AI model identifier', default: 'gpt-4o-mini' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @ApiPropertyOptional({ description: 'Max tokens per response', default: 1000, minimum: 100, maximum: 4000 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(4000)
  maxTokens?: number;

  @ApiPropertyOptional({ description: 'Memory window size (number of entries)', default: 20, minimum: 5, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(50)
  memoryWindowSize?: number;

  @ApiPropertyOptional({ description: 'Debounce seconds before AI responds (lets user send multiple messages)', default: 8, minimum: 1, maximum: 300 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  debounceSeconds?: number;

  @ApiPropertyOptional({ description: 'Max seconds to wait before forced AI response', default: 60, minimum: 5, maximum: 600 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(600)
  debounceMaxWaitSeconds?: number;

  @ApiPropertyOptional({ description: 'Custom base URL for OpenAI-compatible gateway' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiBaseUrl?: string;

  @ApiPropertyOptional({ description: 'Override API key (stored encrypted). If empty, uses env var.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @ApiPropertyOptional({ description: 'Fallback message when AI fails' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  fallbackMessage?: string;

  @ApiPropertyOptional({
    description:
      'Whether the AI context is active (enabled for use). Use DELETE endpoint to remove it instead.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Tipos de mensaje que este contexto acepta procesar. Si llega un tipo no incluido, se marca como SKIPPED.',
    enum: ContentType,
    isArray: true,
    default: [ContentType.TEXT],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ContentType, { each: true })
  allowedMediaTypes?: ContentType[];

  @ApiPropertyOptional({
    enum: AiProvider,
    description: 'Proveedor IA para transcribir/describir media (audio, imagen, video, documento)',
    default: AiProvider.GEMINI,
  })
  @IsOptional()
  @IsEnum(AiProvider)
  mediaProcessorProvider?: AiProvider;

  @ApiPropertyOptional({
    description: 'Modelo específico para media processing. Si null, usa el default del provider.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mediaProcessorModel?: string;

  @ApiPropertyOptional({
    description: 'API key override para media processing (se encripta al persistir).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  mediaProcessorApiKey?: string;

  @ApiPropertyOptional({
    description: 'Base URL (sólo si mediaProcessorProvider=CUSTOM).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  mediaProcessorApiBaseUrl?: string;

  @ApiPropertyOptional({
    description:
      'Si el provider elegido no soporta el tipo recibido, hacer fallback a Gemini automáticamente.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  mediaProcessorFallbackToDefault?: boolean;

  @ApiPropertyOptional({
    description:
      'Mensaje enviado al usuario cuando todos los mensajes entrantes son de tipos no permitidos (SKIPPED). Si null, no se responde.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  unsupportedMediaMessage?: string;
}
