import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: 'Name of the tenant/organization',
    example: 'Acme Corp',
  })
  @IsString()
  @IsNotEmpty()
  tenantName!: string;

  @ApiProperty({
    description: 'URL-friendly slug for the tenant (lowercase, no spaces)',
    example: 'acme-corp',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'tenantSlug must be lowercase alphanumeric with hyphens only (e.g. "acme-corp")',
  })
  tenantSlug!: string;

  @ApiProperty({
    description: 'Email address for the owner account',
    example: 'owner@acme.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Password (minimum 8 characters)',
    example: 'Str0ngP@ss',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    description: 'Full name of the owner',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
