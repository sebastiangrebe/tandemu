import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailService } from './email.service.js';
import { EmailListener } from './email.listener.js';
import { EmailProcessor } from './email.processor.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'email' }),
  ],
  providers: [EmailService, EmailListener, EmailProcessor],
  exports: [EmailService],
})
export class EmailModule {}
