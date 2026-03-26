import { Module } from '@nestjs/common';
import { SetupController } from './setup.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [SetupController],
})
export class SetupModule {}
