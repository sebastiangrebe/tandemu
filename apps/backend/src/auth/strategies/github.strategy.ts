import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service.js';

interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

interface GithubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

@Injectable()
export class GithubOAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;
  private readonly integrationCallbackUrl: string;

  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    const appUrl = configService.get<string>('oauth.appUrl')!;
    this.clientId = configService.get<string>('oauth.github.clientId')!;
    this.clientSecret = configService.get<string>('oauth.github.clientSecret')!;
    this.callbackUrl = `${appUrl}/api/auth/github/callback`;
    this.integrationCallbackUrl = `${appUrl}/api/integrations/github/oauth/callback`;
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      scope: 'user:email',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  getIntegrationAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.integrationCallbackUrl,
      scope: 'repo,user:email',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<{ accessToken: string; githubUserId: string }> {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.integrationCallbackUrl,
      }),
    });

    const tokenData = (await tokenRes.json()) as GithubTokenResponse;
    if (tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description ?? tokenData.error ?? 'Failed to obtain access token');
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Tandemu',
      },
    });

    if (!userRes.ok) {
      throw new Error('Failed to fetch GitHub user profile');
    }

    const user = (await userRes.json()) as GithubUser;
    return { accessToken: tokenData.access_token, githubUserId: String(user.id) };
  }

  async exchangeCodeAndAuthenticate(code: string): Promise<{
    accessToken: string;
    user: { id: string; email: string; name: string };
  }> {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.callbackUrl,
      }),
    });

    const tokenData = (await tokenRes.json()) as GithubTokenResponse;
    if (tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description ?? tokenData.error ?? 'Failed to obtain access token');
    }

    const ghHeaders = {
      Authorization: `token ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Tandemu',
    };

    // Fetch user profile and emails in parallel
    const [userRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', { headers: ghHeaders }),
      fetch('https://api.github.com/user/emails', { headers: ghHeaders }),
    ]);

    if (!userRes.ok) {
      throw new Error('Failed to fetch GitHub user profile');
    }

    const user = (await userRes.json()) as GithubUser;
    const emails = emailsRes.ok ? ((await emailsRes.json()) as GithubEmail[]) : [];

    const email =
      emails.find((e) => e.primary && e.verified)?.email ??
      emails.find((e) => e.verified)?.email ??
      emails[0]?.email;

    if (!email) {
      throw new Error('No email returned from GitHub. Make sure your GitHub email is verified.');
    }

    return this.authService.findOrCreateOAuthUser(
      'github',
      String(user.id),
      email,
      user.name ?? user.login,
      user.avatar_url,
    );
  }
}
