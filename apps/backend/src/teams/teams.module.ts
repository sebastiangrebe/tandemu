import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';
import { TeamsCleanupListener } from './teams-cleanup.listener.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [TeamsController],
  providers: [TeamsService, TeamsCleanupListener],
  exports: [TeamsService],
})
export class TeamsModule {}
