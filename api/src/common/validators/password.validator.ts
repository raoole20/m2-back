import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

export function IsStrongPassword(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      description: `Password (${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} chars, at least 1 uppercase, 1 lowercase, 1 number)`,
      example: 'Str0ngP@ss',
      minLength: PASSWORD_MIN_LENGTH,
      maxLength: PASSWORD_MAX_LENGTH,
    }),
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH),
    MaxLength(PASSWORD_MAX_LENGTH),
    Matches(PASSWORD_REGEX, {
      message:
        'password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number',
    }),
  );
}
