import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { BillingModule } from './billing/billing.module.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';
import { TenantMiddleware } from './common/middleware/tenant.middleware.js';
import { TeamsModule } from './teams/teams.module.js';
import { InvitesModule } from './invites/invites.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    BillingModule,
    TelemetryModule,
    TeamsModule,
    InvitesModule,
    IntegrationsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .forRoutes('organizations', 'billing', 'telemetry', 'invites', 'integrations', 'tasks');
  }
}
