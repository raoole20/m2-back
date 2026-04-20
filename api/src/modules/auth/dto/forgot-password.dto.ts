import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Tenant slug (required if email exists in multiple tenants)',
    required: false,
  })
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}
