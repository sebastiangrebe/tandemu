import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CliAuthService } from './cli-auth.service.js';
import { JwtAuthGuard } from './auth.guard.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, CliAuthService, JwtAuthGuard],
  exports: [AuthService, CliAuthService, JwtAuthGuard],
})
export class AuthModule {}
