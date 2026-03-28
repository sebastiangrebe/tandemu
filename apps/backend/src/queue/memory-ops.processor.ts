import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MemoryService } from '../memory/memory.service.js';
import type { MemoryOpsJobData } from './queue.types.js';

@Processor('memory-ops')
export class MemoryOpsProcessor extends WorkerHost {
  private readonly logger = new Logger(MemoryOpsProcessor.name);

  constructor(private readonly memoryService: MemoryService) {
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
}
