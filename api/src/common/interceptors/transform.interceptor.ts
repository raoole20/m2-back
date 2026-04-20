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
          'meta' in (data as Record<string, unknown>) &&
          'data' in (data as Record<string, unknown>)
        ) {
          const payload = data as unknown as { data: unknown; meta: Record<string, unknown> };
          return {
            success: true,
            data: payload.data as T,
            meta: payload.meta,
          };
        }
        return { success: true, data };
      }),
    );
  }
}
