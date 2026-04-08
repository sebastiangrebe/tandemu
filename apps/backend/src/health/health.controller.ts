import {
  Controller,
  Get,
  Post,
  UseGuards,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { VERSION, compareVersions, MembershipRole } from '@tandemu/types';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/auth.decorator.js';

interface VersionCheckResult {
  current: string;
  latest: string | null;
  updateType: 'major' | 'minor' | 'patch' | null;
  updateAvailable: boolean;
  releaseUrl?: string;
  releaseNotes?: string;
  publishedAt?: string;
}

interface UpdateResult {
  triggered: boolean;
  error?: string;
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly version = process.env.APP_VERSION || VERSION;

  // In-memory cache for GitHub release check
  private cachedRelease: { data: VersionCheckResult; expiresAt: number } | null =
    null;

  @Get()
  check(): { status: string; timestamp: string; version: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: this.version,
    };
  }

  @Get('version')
  getVersion(): { version: string } {
    return { version: this.version };
  }

  @Get('version/check')
  async checkForUpdate(): Promise<VersionCheckResult> {
    // SaaS gating: skip GitHub fetch on managed deployments
    if (process.env.BILLING_ENABLED === 'true') {
      return {
        current: this.version,
        latest: null,
        updateType: null,
        updateAvailable: false,
      };
    }

    // Return cached result if fresh (1 hour TTL)
    if (this.cachedRelease && Date.now() < this.cachedRelease.expiresAt) {
      return this.cachedRelease.data;
    }

    try {
      const res = await fetch(
        'https://api.github.com/repos/sebastiangrebe/tandemu/releases/latest',
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': `tandemu/${this.version}`,
          },
        },
      );

      if (!res.ok) {
        return this.noUpdateResult();
      }

      const release = (await res.json()) as {
        tag_name: string;
        html_url: string;
        body: string;
        published_at: string;
      };
      const latestVersion = release.tag_name.replace(/^v/, '');
      const updateType = compareVersions(this.version, latestVersion);

      const result: VersionCheckResult = {
        current: this.version,
        latest: latestVersion,
        updateType,
        updateAvailable: updateType !== null,
        releaseUrl: release.html_url,
        releaseNotes: release.body ?? '',
        publishedAt: release.published_at,
      };

      // Cache for 1 hour
      this.cachedRelease = {
        data: result,
        expiresAt: Date.now() + 60 * 60 * 1000,
      };

      return result;
    } catch (err) {
      this.logger.warn('Failed to check for updates', err);
      return this.noUpdateResult();
    }
  }

  @Post('update')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(MembershipRole.OWNER)
  @HttpCode(200)
  async triggerUpdate(): Promise<UpdateResult> {
    // SaaS gating
    if (process.env.BILLING_ENABLED === 'true') {
      return { triggered: false, error: 'Updates are managed automatically on this deployment.' };
    }

    const watchtowerUrl =
      process.env.WATCHTOWER_API_URL ?? 'http://watchtower:8080';
    const watchtowerToken =
      process.env.WATCHTOWER_API_TOKEN ?? 'tandemu-update';

    try {
      const res = await fetch(`${watchtowerUrl}/v1/update`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${watchtowerToken}`,
        },
      });

      if (res.ok) {
        this.logger.log('Watchtower update triggered successfully');
        return { triggered: true };
      }

      this.logger.warn(`Watchtower returned ${res.status}`);
      return {
        triggered: false,
        error: `Watchtower returned status ${res.status}. Try running: docker compose pull && docker compose up -d`,
      };
    } catch {
      return {
        triggered: false,
        error:
          'Watchtower is not available. To update manually, run: docker compose pull && docker compose up -d',
      };
    }
  }

  private noUpdateResult(): VersionCheckResult {
    return {
      current: this.version,
      latest: null,
      updateType: null,
      updateAvailable: false,
    };
  }
}
