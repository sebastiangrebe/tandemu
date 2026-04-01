import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MemoryService } from '../memory/memory.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import { TasksService } from '../integrations/tasks.service.js';
import type { MemoryOpsJobData } from './queue.types.js';

@Processor('memory-ops')
export class MemoryOpsProcessor extends WorkerHost {
  private readonly logger = new Logger(MemoryOpsProcessor.name);

  constructor(
    private readonly memoryService: MemoryService,
    private readonly organizationsService: OrganizationsService,
    private readonly tasksService: TasksService,
  ) {
    super();
  }

  async process(job: Job<MemoryOpsJobData>): Promise<void> {
    switch (job.data.type) {
      case 'promote-memory':
        await this.promoteMemory(job.data.memoryId, job.data.upstreamUrl, job.data.upstreamHeaders);
        break;
      case 'delete-memory-upstream':
        await this.deleteMemoryUpstream(job.data.memoryId, job.data.upstreamUrl, job.data.upstreamHeaders);
        break;
      case 'mcp-tool-call':
        await this.mcpToolCall(job.data.toolName, job.data.args, job.data.userId);
        break;
      case 'clean-stale-drafts':
        await this.cleanStaleDrafts();
        break;
      case 'cleanup-user-memories':
        await this.cleanupUserMemories(job.data.userId, job.data.organizationId);
        break;
    }
  }

  private async promoteMemory(
    memoryId: string,
    upstreamUrl: string,
    upstreamHeaders: Record<string, string>,
  ): Promise<void> {
    const res = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { ...upstreamHeaders, 'Accept': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `promote-${memoryId}`,
        method: 'tools/call',
        params: {
          name: 'update_memory',
          arguments: {
            memory_id: memoryId,
            metadata: { status: 'published' },
          },
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Promote memory ${memoryId} failed: ${res.status}`);
    }
    this.logger.debug(`Promoted memory ${memoryId}`);
  }

  private async deleteMemoryUpstream(
    memoryId: string,
    upstreamUrl: string,
    upstreamHeaders: Record<string, string>,
  ): Promise<void> {
    const res = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { ...upstreamHeaders, 'Accept': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `delete-${memoryId}`,
        method: 'tools/call',
        params: {
          name: 'delete_memory',
          arguments: { memory_id: memoryId },
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Delete memory ${memoryId} failed: ${res.status}`);
    }
    this.logger.debug(`Deleted memory ${memoryId}`);
  }

  private async mcpToolCall(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
  ): Promise<void> {
    const upstreamUrl = this.memoryService.getUpstreamSseUrl(userId);
    const upstreamHeaders = this.memoryService.getUpstreamMessageHeaders();

    const res = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { ...upstreamHeaders, 'Accept': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `queue-${toolName}-${Date.now()}`,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    });
    if (!res.ok) {
      throw new Error(`MCP tool call ${toolName} failed: ${res.status}`);
    }
    this.logger.debug(`MCP tool call ${toolName} completed`);
  }

  private async cleanupUserMemories(userId: string, organizationId: string): Promise<void> {
    try {
      const deleted = await this.memoryService.deleteAllUserMemories(userId);
      this.logger.log(`Deleted ${deleted} personal memories for user ${userId}`);

      const ownerId = await this.organizationsService.getOwnerId(organizationId);
      const reassigned = await this.memoryService.reassignUserOrgMemories(organizationId, userId, ownerId);
      if (reassigned > 0) {
        this.logger.log(`Reassigned ${reassigned} org memories from user ${userId} to owner ${ownerId}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to cleanup memories for user ${userId}: ${err}`);
    }
  }

  private async cleanStaleDrafts(): Promise<void> {
    const orgIds = await this.organizationsService.getAllOrgIds();
    this.logger.log(`Running stale draft cleanup for ${orgIds.length} org(s)`);

    for (const orgId of orgIds) {
      try {
        const settings = await this.organizationsService.getSettings(orgId);
        const staleDays = settings.draftRetentionDays;

        const taskStatusLookup = async (taskId: string): Promise<string | undefined> => {
          try {
            const tasks = await this.tasksService.getTasks(orgId, {});
            const task = tasks.find((t) => t.id === taskId);
            return task?.status;
          } catch {
            return undefined;
          }
        };

        const result = await this.memoryService.cleanStaleDrafts(orgId, staleDays, taskStatusLookup);
        if (result.promoted > 0 || result.deleted > 0) {
          this.logger.log(`Org ${orgId}: promoted ${result.promoted}, deleted ${result.deleted} stale drafts`);
        }
      } catch (err) {
        this.logger.warn(`Failed to clean stale drafts for org ${orgId}: ${err}`);
      }
    }
  }
}
