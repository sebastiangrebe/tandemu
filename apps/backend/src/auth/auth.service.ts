import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DatabaseService } from '../database/database.service.js';

interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

interface JwtPayload {
  userId: string;
  email: string;
  organizationId: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret = this.configService.get<string>('jwt.secret', 'change-me-in-production');
  }

  async register(email: string, name: string, password: string): Promise<AuthResponse> {
    // Check if user already exists
    const existing = await this.db.query(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Create user and auto-accept pending invites in a transaction
    const result = await this.db.withTransaction(async (client) => {
      // Create user
      const userResult = await client.query<{ id: string; email: string; name: string }>(
        `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name`,
        [email, name, passwordHash],
      );
      const user = userResult.rows[0]!;

      // Auto-accept any pending invites for this email
      const pendingInvites = await client.query<{
        id: string;
        organization_id: string;
        role: string;
      }>(
        `SELECT id, organization_id, role FROM invites WHERE email = $1 AND status = 'pending'`,
        [email],
      );

      let organizationId = '';
      let role = 'MEMBER';

      for (const invite of pendingInvites.rows) {
        await client.query(
          `UPDATE invites SET status = 'accepted' WHERE id = $1`,
          [invite.id],
        );
        await client.query(
          `INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, $3)`,
          [user.id, invite.organization_id, invite.role],
        );
        // Use the first accepted invite's org as the default
        if (organizationId === '') {
          organizationId = invite.organization_id;
          role = invite.role.toUpperCase();
        }
      }

      return { user, organizationId, role };
    });

    const token = this.signToken({
      userId: result.user.id,
      email: result.user.email,
      organizationId: result.organizationId,
      role: result.role,
    });

    return {
      accessToken: token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
    };
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const userResult = await this.db.query<{
      id: string;
      email: string;
      name: string;
      password_hash: string;
    }>(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email],
    );

    if (userResult.rows.length === 0) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = userResult.rows[0]!;

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Get the user's first membership for the default org
    const membershipResult = await this.db.query<{
      organization_id: string;
      role: string;
    }>(
      'SELECT organization_id, role FROM memberships WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
      [user.id],
    );

    const membership = membershipResult.rows[0];
    const organizationId = membership?.organization_id ?? '';
    const role = membership?.role?.toUpperCase() ?? 'MEMBER';

    const token = this.signToken({
      userId: user.id,
      email: user.email,
      organizationId,
      role,
    });

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  async switchOrganization(userId: string, email: string, organizationId: string): Promise<{ accessToken: string }> {
    // Verify user has membership in the target org
    const membership = await this.db.query<{ role: string }>(
      'SELECT role FROM memberships WHERE user_id = $1 AND organization_id = $2',
      [userId, organizationId],
    );

    if (membership.rows.length === 0) {
      throw new UnauthorizedException('You are not a member of this organization');
    }

    const role = membership.rows[0]!.role.toUpperCase();
    const token = this.signToken({ userId, email, organizationId, role });
    return { accessToken: token };
  }

  validateToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async getMe(userId: string): Promise<{ id: string; email: string; name: string; avatarUrl: string | null; createdAt: string; updatedAt: string }> {
    const result = await this.db.query<{
      id: string;
      email: string;
      name: string;
      avatar_url: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      'SELECT id, email, name, avatar_url, created_at, updated_at FROM users WHERE id = $1',
      [userId],
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedException('User not found');
    }

    const user = result.rows[0]!;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at.toISOString(),
      updatedAt: user.updated_at.toISOString(),
    };
  }

  private signToken(payload: JwtPayload): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: '24h' });
  }
}
