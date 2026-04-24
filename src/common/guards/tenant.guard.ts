import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as { tenantId?: string } | undefined;

    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    (request as unknown as Record<string, unknown>)['tenantId'] = user.tenantId;
    return true;
  }
}
