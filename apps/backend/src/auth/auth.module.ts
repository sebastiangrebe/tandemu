import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CliAuthService } from './cli-auth.service.js';
import { JwtAuthGuard } from './auth.guard.js';
import { OAuthController } from './oauth.controller.js';
import { GoogleStrategy } from './strategies/google.strategy.js';
import { GithubOAuthService } from './strategies/github.strategy.js';

@Module({
  imports: [PassportModule],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    CliAuthService,
    JwtAuthGuard,
    GithubOAuthService,
    // Conditionally register Google Passport strategy
    {
      provide: GoogleStrategy,
      useFactory: (authService: AuthService, configService: ConfigService) => {
        const enabled = configService.get<boolean>('oauth.google.enabled', false);
        if (!enabled) return null;
        return new GoogleStrategy(authService, configService);
      },
      inject: [AuthService, ConfigService],
    },
  ],
  exports: [AuthService, CliAuthService, JwtAuthGuard],
})
export class AuthModule {}
