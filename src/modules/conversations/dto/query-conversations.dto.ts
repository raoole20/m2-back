import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsUUID } from 'class-validator';
import { ConversationStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';

export class QueryConversationsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ConversationStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @ApiPropertyOptional({ description: 'Filter by channel ID' })
  @IsOptional()
  @IsUUID()
  channelId?: string;

  @ApiPropertyOptional({ description: 'Filter by assigned agent ID' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Filter by contact ID' })
  @IsOptional()
  @IsUUID()
  contactId?: string;
}
