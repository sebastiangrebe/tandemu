import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service.js';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    const appUrl = configService.get<string>('oauth.appUrl')!;
    super({
      clientID: configService.get<string>('oauth.google.clientId')!,
      clientSecret: configService.get<string>('oauth.google.clientSecret')!,
      callbackURL: `${appUrl}/api/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      emails?: Array<{ value: string; verified?: boolean }>;
      displayName?: string;
      photos?: Array<{ value: string }>;
    },
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('No email returned from Google'), undefined);
      return;
    }

    try {
      const result = await this.authService.findOrCreateOAuthUser(
        'google',
        profile.id,
        email,
        profile.displayName ?? email.split('@')[0]!,
        profile.photos?.[0]?.value,
      );
      done(null, result);
    } catch (err) {
      done(err as Error, undefined);
    }
  }
}
