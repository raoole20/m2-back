import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function IsStrongPassword(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      description: `Password (${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} chars)`,
      example: 'Str0ngP@ss',
      minLength: PASSWORD_MIN_LENGTH,
      maxLength: PASSWORD_MAX_LENGTH,
    }),
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH),
    MaxLength(PASSWORD_MAX_LENGTH),
  );
}
