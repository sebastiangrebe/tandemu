import {
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { GithubOAuthService } from '../auth/strategies/github.strategy.js';
import { IntegrationsService } from './integrations.service.js';
import { AuthService } from '../auth/auth.service.js';

interface OAuthState {
  createdAt: number;
  orgId: string;
  userId: string;
  returnUrl: string;
}

@Controller('integrations/github/oauth')
export class IntegrationOAuthController {
  private readonly logger = new Logger(IntegrationOAuthController.name);
  private readonly frontendUrl: string;
  private readonly githubEnabled: boolean;
  private readonly states = new Map<string, OAuthState>();

  constructor(
    private readonly githubOAuthService: GithubOAuthService,
    private readonly integrationsService: IntegrationsService,
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    this.frontendUrl = configService.get<string>('oauth.frontendUrl', 'http://localhost:3000');
    this.githubEnabled = configService.get<boolean>('oauth.github.enabled', false);

    // Clean up expired states every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [state, data] of this.states) {
        if (now - data.createdAt > 10 * 60 * 1000) this.states.delete(state);
      }
    }, 5 * 60 * 1000);
  }

  @Get()
  async initiate(
    @Query('token') token: string,
    @Query('return_url') returnUrl: string | undefined,
    @Res() res: Response,
  ) {
    if (!this.githubEnabled) {
      throw new InternalServerErrorException('GitHub OAuth is not configured');
    }

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    // Validate JWT and extract user context
    const user = await this.authService.validateToken(token);
    if (!user || !user.organizationId) {
      throw new UnauthorizedException('Invalid token or no organization context');
    }

    const state = randomBytes(16).toString('hex');
    this.states.set(state, {
      createdAt: Date.now(),
      orgId: user.organizationId,
      userId: user.userId,
      returnUrl: returnUrl || '/integrations',
    });

    res.redirect(this.githubOAuthService.getIntegrationAuthorizationUrl(state));
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const stateData = state ? this.states.get(state) : undefined;
    if (!stateData) {
      throw new InternalServerErrorException('Invalid or expired OAuth state');
    }
    this.states.delete(state);

    if (!code) {
      throw new InternalServerErrorException('No authorization code received');
    }

    try {
      // Exchange code for token and verify identity
      const { accessToken, githubUserId } = await this.githubOAuthService.exchangeCodeForToken(code);

      // Verify the GitHub user matches the logged-in user's linked account
      const linkedGithubId = await this.authService.getOAuthProviderUserId(stateData.userId, 'github');
      if (linkedGithubId && linkedGithubId !== githubUserId) {
        this.logger.warn(
          `GitHub user mismatch: expected ${linkedGithubId}, got ${githubUserId} for user ${stateData.userId}`,
        );
        const redirectUrl = new URL(stateData.returnUrl, this.frontendUrl);
        redirectUrl.searchParams.set('github', 'error');
        redirectUrl.searchParams.set('error', 'account_mismatch');
        res.redirect(redirectUrl.toString());
        return;
      }

      // Create or update the GitHub integration
      await this.integrationsService.createOrUpdate(stateData.orgId, {
        provider: 'github',
        accessToken,
      });

      const redirectUrl = new URL(stateData.returnUrl, this.frontendUrl);
      redirectUrl.searchParams.set('github', 'connected');
      res.redirect(redirectUrl.toString());
    } catch (error) {
      this.logger.error(`GitHub integration OAuth failed: ${error}`);
      const redirectUrl = new URL(stateData.returnUrl, this.frontendUrl);
      redirectUrl.searchParams.set('github', 'error');
      res.redirect(redirectUrl.toString());
    }
  }
}
