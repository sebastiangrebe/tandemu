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

      return user;
    });

    return this.generateAuthResponse(result.id, result.email, result.name);
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const userResult = await this.db.query<{
      id: string;
      email: string;
      name: string;
      password_hash: string | null;
    }>(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email],
    );

    if (userResult.rows.length === 0) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = userResult.rows[0]!;

    if (!user.password_hash) {
      throw new UnauthorizedException(
        'This account uses social login. Please sign in with Google or GitHub.',
      );
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.generateAuthResponse(user.id, user.email, user.name);
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

  async generateAuthResponse(userId: string, email: string, name: string): Promise<AuthResponse> {
    const membershipResult = await this.db.query<{
      organization_id: string;
      role: string;
    }>(
      'SELECT organization_id, role FROM memberships WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
      [userId],
    );

    const membership = membershipResult.rows[0];
    const organizationId = membership?.organization_id ?? '';
    const role = membership?.role?.toUpperCase() ?? 'MEMBER';

    const token = this.signToken({
      userId,
      email,
      organizationId,
      role,
    });

    return {
      accessToken: token,
      user: { id: userId, email, name },
    };
  }

  async findOrCreateOAuthUser(
    provider: string,
    providerUserId: string,
    email: string,
    name: string,
    avatarUrl?: string,
  ): Promise<AuthResponse> {
    // 1. Check if OAuth account already linked
    const oauthResult = await this.db.query<{ user_id: string }>(
      'SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
      [provider, providerUserId],
    );

    if (oauthResult.rows.length > 0) {
      const userId = oauthResult.rows[0]!.user_id;
      const userResult = await this.db.query<{ id: string; email: string; name: string }>(
        'SELECT id, email, name FROM users WHERE id = $1',
        [userId],
      );
      const user = userResult.rows[0]!;
      return this.generateAuthResponse(user.id, user.email, user.name);
    }

    // 2. Check if user with same email exists — link OAuth account
    const existingUser = await this.db.query<{ id: string; email: string; name: string }>(
      'SELECT id, email, name FROM users WHERE email = $1',
      [email],
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0]!;
      await this.db.query(
        'INSERT INTO oauth_accounts (user_id, provider, provider_user_id, provider_email) VALUES ($1, $2, $3, $4)',
        [user.id, provider, providerUserId, email],
      );
      // Update avatar if not set
      if (avatarUrl) {
        await this.db.query(
          'UPDATE users SET avatar_url = COALESCE(avatar_url, $1) WHERE id = $2',
          [avatarUrl, user.id],
        );
      }
      return this.generateAuthResponse(user.id, user.email, user.name);
    }

    // 3. Create new user + OAuth account + auto-accept invites
    const result = await this.db.withTransaction(async (client) => {
      const userResult = await client.query<{ id: string; email: string; name: string }>(
        'INSERT INTO users (email, name, avatar_url) VALUES ($1, $2, $3) RETURNING id, email, name',
        [email, name, avatarUrl ?? null],
      );
      const user = userResult.rows[0]!;

      await client.query(
        'INSERT INTO oauth_accounts (user_id, provider, provider_user_id, provider_email) VALUES ($1, $2, $3, $4)',
        [user.id, provider, providerUserId, email],
      );

      // Auto-accept pending invites
      const pendingInvites = await client.query<{
        id: string;
        organization_id: string;
        role: string;
        team_id: string | null;
      }>(
        `SELECT id, organization_id, role, team_id FROM invites WHERE email = $1 AND status = 'pending'`,
        [email],
      );

      for (const invite of pendingInvites.rows) {
        await client.query(
          `UPDATE invites SET status = 'accepted' WHERE id = $1`,
          [invite.id],
        );
        await client.query(
          'INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, $3)',
          [user.id, invite.organization_id, invite.role],
        );
        if (invite.team_id) {
          await client.query(
            'INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [invite.team_id, user.id],
          );
        }
      }

      return user;
    });

    return this.generateAuthResponse(result.id, result.email, result.name);
  }

  // --- Email aliases ---

  async getEmailsForUser(userId: string): Promise<Array<{ id: string; email: string; isPrimary: boolean; createdAt: string }>> {
    const result = await this.db.query<{ id: string; email: string; is_primary: boolean; created_at: Date }>(
      'SELECT id, email, is_primary, created_at FROM user_emails WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC',
      [userId],
    );
    return result.rows.map((r) => ({
      id: r.id,
      email: r.email,
      isPrimary: r.is_primary,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async getAllEmailAddresses(userId: string): Promise<string[]> {
    const result = await this.db.query<{ email: string }>(
      'SELECT email FROM user_emails WHERE user_id = $1',
      [userId],
    );
    if (result.rows.length === 0) {
      // Fallback: user_emails table might not be seeded yet
      const user = await this.db.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
      return user.rows.map((r) => r.email);
    }
    return result.rows.map((r) => r.email);
  }

  async addEmailAlias(userId: string, email: string): Promise<{ id: string; email: string; isPrimary: boolean; createdAt: string }> {
    const result = await this.db.query<{ id: string; email: string; is_primary: boolean; created_at: Date }>(
      'INSERT INTO user_emails (user_id, email, is_primary) VALUES ($1, $2, FALSE) RETURNING id, email, is_primary, created_at',
      [userId, email.toLowerCase().trim()],
    );
    const r = result.rows[0]!;
    return { id: r.id, email: r.email, isPrimary: r.is_primary, createdAt: r.created_at.toISOString() };
  }

  async removeEmailAlias(userId: string, emailId: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM user_emails WHERE id = $1 AND user_id = $2 AND is_primary = FALSE',
      [emailId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private signToken(payload: JwtPayload): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: '30d' });
  }
}
