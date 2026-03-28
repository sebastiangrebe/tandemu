import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import configuration from './config/configuration.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';
import { TenantMiddleware } from './common/middleware/tenant.middleware.js';
import { TeamsModule } from './teams/teams.module.js';
import { InvitesModule } from './invites/invites.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { MemoryModule } from './memory/memory.module.js';
import { SetupModule } from './setup/setup.module.js';
import { QueueModule } from './queue/queue.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    TelemetryModule,
    TeamsModule,
    InvitesModule,
    IntegrationsModule,
    MemoryModule,
    SetupModule,
    QueueModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .forRoutes('organizations', 'telemetry', 'invites', 'integrations', 'tasks');
  }
}
