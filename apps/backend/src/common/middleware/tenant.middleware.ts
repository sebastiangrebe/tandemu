import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import type { RequestUser } from '../../auth/auth.decorator.js';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  async use(
    req: Request & { user?: RequestUser },
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const organizationId = req.user?.organizationId;

    if (organizationId) {
      // TODO: Execute on the active DB connection from @tandem/database:
      //   await db.execute(sql`SET LOCAL app.current_tenant = ${organizationId}`);
      // This enables PostgreSQL row-level security policies to scope
      // all subsequent queries in this transaction to the tenant.
      void organizationId;
    }

    next();
  }
}
