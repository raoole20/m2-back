import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ActionStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';

export class QueryActionsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by action type' })
  @IsOptional()
  @IsString()
  actionType?: string;

  @ApiPropertyOptional({ description: 'Filter by conversation ID' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional({ enum: ActionStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(ActionStatus)
  status?: ActionStatus;
}
