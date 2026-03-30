import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ChannelType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';

export class QueryContactsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search by name, phone, or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ChannelType, description: 'Filter by channel type' })
  @IsOptional()
  @IsEnum(ChannelType)
  channelType?: ChannelType;
}
