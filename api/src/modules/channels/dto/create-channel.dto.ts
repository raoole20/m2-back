import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsString,
  IsObject,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ChannelType } from '@prisma/client';

export class CreateChannelDto {
  @ApiProperty({ enum: ChannelType, description: 'Channel type' })
  @IsEnum(ChannelType)
  type: ChannelType;

  @ApiProperty({ description: 'Channel display name', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Channel credentials (provider-specific)',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  credentials: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Whether the channel is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
