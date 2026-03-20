import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller.js';
import { TasksController } from './tasks.controller.js';
import { IntegrationsService } from './integrations.service.js';
import { TasksService } from './tasks.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [IntegrationsController, TasksController],
  providers: [IntegrationsService, TasksService],
  exports: [IntegrationsService, TasksService],
})
export class IntegrationsModule {}
