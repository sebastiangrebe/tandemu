import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from './auth.decorator.js';
import { AuthService } from './auth.service.js';
import type { MembershipRole } from '@tandemu/types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);

    if (!token) {
      throw new UnauthorizedException('Token is empty');
    }

    try {
      const payload = this.authService.validateToken(token);

      const user: RequestUser = {
        userId: payload.userId,
        email: payload.email,
        organizationId: payload.organizationId,
        role: payload.role as MembershipRole,
      };

      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
