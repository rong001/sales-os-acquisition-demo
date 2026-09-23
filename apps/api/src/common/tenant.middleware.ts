import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/** Ensures authenticated requests always carry tenant_id (from JWT). */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request & { user?: { tenant_id?: string } }, _res: Response, next: NextFunction) {
    // Public auth + health (liveness/readiness) routes skip
    if (
      req.path.startsWith('/auth')
      || req.path === '/health'
      || req.path.startsWith('/health/')
    ) {
      return next();
    }
    if (req.user && !req.user.tenant_id) {
      throw new ForbiddenException('缺少租户上下文');
    }
    next();
  }
}
