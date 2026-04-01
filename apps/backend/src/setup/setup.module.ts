import { Module } from '@nestjs/common';
import { SetupController } from './setup.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [AuthModule, MemoryModule, DatabaseModule],
  controllers: [SetupController],
})
export class SetupModule {}
