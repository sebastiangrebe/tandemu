import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
