import { Logger, Module, OnModuleInit } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { IntegrationsController } from './integrations.controller.js';
import { IntegrationOAuthController } from './integration-oauth.controller.js';
import { TasksController } from './tasks.controller.js';
import { IntegrationsService } from './integrations.service.js';
import { TasksService } from './tasks.service.js';
import { GitHubGitService } from './providers/github-git.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { TeamsModule } from '../teams/teams.module.js';
import { forwardRef } from '@nestjs/common';
import { TelemetryModule } from '../telemetry/telemetry.module.js';

@Module({
  imports: [AuthModule, TeamsModule, forwardRef(() => TelemetryModule)],
  controllers: [IntegrationsController, IntegrationOAuthController, TasksController],
  providers: [IntegrationsService, TasksService, GitHubGitService],
  exports: [IntegrationsService, TasksService, GitHubGitService],
})
export class IntegrationsModule implements OnModuleInit {
  private readonly logger = new Logger(IntegrationsModule.name);

  constructor(private readonly integrationsService: IntegrationsService) {}

  async onModuleInit(): Promise<void> {
    try {
      const count = await this.integrationsService.reencryptTokens();
      if (count > 0) {
        this.logger.log(`Auto-encrypted ${count} plain text token(s) on startup`);
      }
    } catch (err) {
      this.logger.warn(`Token re-encryption on startup failed: ${err}`);
      Sentry.captureException(err, { tags: { operation: 'token-reencryption-startup' } });
    }
  }
}
