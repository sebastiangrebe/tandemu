import { Module } from '@nestjs/common';
import { MemoryController } from './memory.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [MemoryController],
})
export class MemoryModule {}
