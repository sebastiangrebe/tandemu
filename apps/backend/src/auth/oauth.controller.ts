import {
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { GithubOAuthService } from './strategies/github.strategy.js';

interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string; name: string };
}

@Controller('auth')
export class OAuthController {
  private readonly frontendUrl: string;
  private readonly googleEnabled: boolean;
  private readonly githubEnabled: boolean;
  private readonly githubStates = new Map<string, number>();

  constructor(
    private readonly configService: ConfigService,
    private readonly githubOAuthService: GithubOAuthService,
  ) {
    this.frontendUrl = this.configService.get<string>('oauth.frontendUrl', 'http://localhost:3000');
    this.googleEnabled = this.configService.get<boolean>('oauth.google.enabled', false);
    this.githubEnabled = this.configService.get<boolean>('oauth.github.enabled', false);

    // Clean up expired states every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [state, createdAt] of this.githubStates) {
        if (now - createdAt > 10 * 60 * 1000) this.githubStates.delete(state);
      }
    }, 5 * 60 * 1000);
  }

  @Get('config')
  getConfig() {
    const providers: string[] = [];
    if (this.googleEnabled) providers.push('google');
    if (this.githubEnabled) providers.push('github');
    return { providers };
  }

  // --- Google (via Passport) ---

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    if (!this.googleEnabled) {
      throw new NotFoundException('Google OAuth is not configured');
    }
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(@Req() req: Request, @Res() res: Response) {
    const authResponse = req.user as AuthResponse;
    const redirectUrl = new URL('/auth/callback', this.frontendUrl);
    redirectUrl.searchParams.set('token', authResponse.accessToken);
    res.redirect(redirectUrl.toString());
  }

  // --- GitHub (manual OAuth — passport-github2 doesn't support GitHub Apps) ---

  @Get('github')
  githubLogin(@Res() res: Response) {
    if (!this.githubEnabled) {
      throw new NotFoundException('GitHub OAuth is not configured');
    }
    const state = randomBytes(16).toString('hex');
    this.githubStates.set(state, Date.now());
    res.redirect(this.githubOAuthService.getAuthorizationUrl(state));
  }

  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!state || !this.githubStates.has(state)) {
      throw new InternalServerErrorException('Invalid or expired OAuth state');
    }
    this.githubStates.delete(state);

    if (!code) {
      throw new InternalServerErrorException('No authorization code received');
    }

    const authResponse = await this.githubOAuthService.exchangeCodeAndAuthenticate(code);
    const redirectUrl = new URL('/auth/callback', this.frontendUrl);
    redirectUrl.searchParams.set('token', authResponse.accessToken);
    res.redirect(redirectUrl.toString());
  }
}
