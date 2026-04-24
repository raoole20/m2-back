import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Email address',
    example: 'owner@acme.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Account password',
    example: 'Str0ngP@ss',
  })
  @IsString()
  password!: string;
}
