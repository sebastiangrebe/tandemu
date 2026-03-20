import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'node:crypto';

interface CliAuthEntry {
  code: string;
  createdAt: number;
  authorized: boolean;
  token?: string;
  userId?: string;
  organizationId?: string;
  userName?: string;
  userEmail?: string;
}

export type CliAuthStatus =
  | { status: 'pending' }
  | { status: 'expired' }
  | {
      status: 'authorized';
      accessToken: string;
      organizationId: string;
      user: { id: string; email: string; name: string };
    };

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

@Injectable()
export class CliAuthService implements OnModuleDestroy {
  private readonly codes = new Map<string, CliAuthEntry>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.frontendUrl = this.configService.get<string>(
      'frontend.url',
      'http://localhost:3000',
    );
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  initiate(): { code: string; url: string } {
    const code = crypto.randomUUID();
    this.codes.set(code, {
      code,
      createdAt: Date.now(),
      authorized: false,
    });
    const url = `${this.frontendUrl}/cli-auth?code=${code}`;
    return { code, url };
  }

  authorize(
    code: string,
    userId: string,
    token: string,
    organizationId: string,
    userName: string,
    userEmail: string,
  ): boolean {
    const entry = this.codes.get(code);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.codes.delete(code);
      return false;
    }
    entry.authorized = true;
    entry.token = token;
    entry.userId = userId;
    entry.organizationId = organizationId;
    entry.userName = userName;
    entry.userEmail = userEmail;
    return true;
  }

  checkStatus(code: string): CliAuthStatus {
    const entry = this.codes.get(code);
    if (!entry) return { status: 'expired' };
    if (this.isExpired(entry)) {
      this.codes.delete(code);
      return { status: 'expired' };
    }
    if (!entry.authorized) return { status: 'pending' };
    // Once consumed, remove the code
    this.codes.delete(code);
    return {
      status: 'authorized',
      accessToken: entry.token!,
      organizationId: entry.organizationId!,
      user: {
        id: entry.userId!,
        email: entry.userEmail!,
        name: entry.userName!,
      },
    };
  }

  private isExpired(entry: CliAuthEntry): boolean {
    return Date.now() - entry.createdAt > CODE_TTL_MS;
  }

  private cleanupExpired(): void {
    for (const [code, entry] of this.codes) {
      if (this.isExpired(entry)) {
        this.codes.delete(code);
      }
    }
  }
}
