import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import type { RequestUser } from '../../auth/auth.decorator.js';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  async use(
    req: Request & { user?: RequestUser; params: Record<string, string> },
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const jwtOrgId = req.user?.organizationId;
    const paramOrgId = req.params?.orgId;

    // If both JWT org and URL org param exist, they must match
    if (jwtOrgId && paramOrgId && jwtOrgId !== paramOrgId) {
      throw new ForbiddenException('Organization mismatch: you do not have access to this organization');
    }

    next();
  }
}
