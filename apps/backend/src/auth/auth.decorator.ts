import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { MembershipRole } from '@tandemu/types';

export interface RequestUser {
  userId: string;
  email: string;
  organizationId: string;
  role: MembershipRole;
}

export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext): RequestUser | string => {
    const request = ctx.switchToHttp().getRequest<Request & { user: RequestUser }>();
    const user = request.user;
    return data ? user[data] : user;
  },
);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES_KEY, roles);
