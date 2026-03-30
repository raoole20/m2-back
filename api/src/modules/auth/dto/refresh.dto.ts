import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({
    description: 'Refresh token obtained during login or registration',
  })
  @IsString()
  refreshToken!: string;
}
