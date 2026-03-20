import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MembershipRole } from '@tandem/types';
import { ROLES_KEY } from './auth.decorator.js';
import type { RequestUser } from './auth.decorator.js';

const ROLE_HIERARCHY: Record<string, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<MembershipRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator means the endpoint is open to all authenticated users
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('No user context found');
    }

    const userLevel = ROLE_HIERARCHY[user.role.toUpperCase()] ?? 0;
    const requiredLevel = Math.min(
      ...requiredRoles.map((r) => ROLE_HIERARCHY[r.toUpperCase()] ?? 99),
    );

    if (userLevel < requiredLevel) {
      throw new ForbiddenException(
        `This action requires ${requiredRoles.join(' or ')} role`,
      );
    }

    return true;
  }
}
