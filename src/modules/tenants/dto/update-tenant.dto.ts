import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsObject, MaxLength } from 'class-validator';

export class UpdateTenantDto {
  @ApiPropertyOptional({ description: 'Tenant display name', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Tenant settings as a JSON object',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
