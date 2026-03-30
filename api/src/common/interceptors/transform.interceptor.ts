import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        if (
          data &&
          typeof data === 'object' &&
          'meta' in (data as Record<string, unknown>)
        ) {
          const { meta, ...rest } = data as Record<string, unknown>;
          return {
            success: true,
            data: rest as T,
            meta: meta as Record<string, unknown>,
          };
        }
        return { success: true, data };
      }),
    );
  }
}
