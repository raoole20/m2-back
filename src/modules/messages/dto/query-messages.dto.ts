import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { MessageDirection, ContentType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';

export class QueryMessagesDto extends PaginationDto {
  @ApiProperty({ description: 'Conversation ID (required)' })
  @IsUUID()
  @IsNotEmpty()
  conversationId: string;

  @ApiPropertyOptional({ enum: MessageDirection, description: 'Filter by direction' })
  @IsOptional()
  @IsEnum(MessageDirection)
  direction?: MessageDirection;

  @ApiPropertyOptional({ enum: ContentType, description: 'Filter by content type' })
  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)', example: '2025-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)', example: '2025-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
