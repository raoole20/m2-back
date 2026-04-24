import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

export class ApiResponseDto<T> {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  data: T;

  @ApiPropertyOptional()
  meta?: PaginationMeta;
}

export class ApiErrorDto {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty()
  error: string;

  @ApiProperty()
  statusCode: number;
}
