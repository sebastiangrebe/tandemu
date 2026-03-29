import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

@Injectable()
export class MemoryCleanupListener {
  private readonly logger = new Logger(MemoryCleanupListener.name);

  constructor(
    @InjectQueue('memory-ops') private readonly memoryOpsQueue: Queue,
  ) {}

  @OnEvent('organization.member_removed')
  async handleMemberRemoved(payload: { organizationId: string; userId: string }): Promise<void> {
    this.logger.log(`Enqueueing memory cleanup for user ${payload.userId} removed from org ${payload.organizationId}`);
    await this.memoryOpsQueue.add('cleanup-user-memories', {
      type: 'cleanup-user-memories' as const,
      userId: payload.userId,
      organizationId: payload.organizationId,
    });
  }
}
