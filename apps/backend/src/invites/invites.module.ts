import { Module } from '@nestjs/common';
import { InvitesController } from './invites.controller.js';
import { InvitesService } from './invites.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [InvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
