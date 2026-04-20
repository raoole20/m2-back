import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStrongPassword } from '../../../common/validators/password.validator.js';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Reset token from email link' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsStrongPassword()
  newPassword!: string;
}
