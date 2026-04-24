import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStrongPassword } from '../../../common/validators/password.validator.js';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current account password' })
  @IsString()
  currentPassword!: string;

  @IsStrongPassword()
  newPassword!: string;
}
