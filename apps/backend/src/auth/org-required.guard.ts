import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { RequestUser } from './auth.decorator.js';

/**
 * Guard that rejects requests from users who don't belong to any organization yet.
 * Use on endpoints that require an org context (integrations, tasks, telemetry, teams, etc.)
 */
@Injectable()
export class OrgRequiredGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;

    if (!user?.organizationId) {
      throw new ForbiddenException('You must create or join an organization first');
    }

    return true;
  }
}
