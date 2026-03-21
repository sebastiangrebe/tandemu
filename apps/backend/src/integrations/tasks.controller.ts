import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { OrgRequiredGuard } from '../auth/org-required.guard.js';
import { CurrentUser } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import type { Task, TaskStatus, IntegrationProvider } from '@tandemu/types';

@Controller('tasks')
@UseGuards(JwtAuthGuard, OrgRequiredGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async getTasks(
    @CurrentUser() user: RequestUser,
    @Query('teamId') teamId?: string,
    @Query('sprint') sprint?: string,
    @Query('status') status?: TaskStatus,
    @Query('mine') mine?: string,
    @Query('unassigned') unassigned?: string,
  ): Promise<Task[]> {
    const tasks = await this.tasksService.getTasks(user.organizationId, {
      teamId,
      assigneeEmail: mine === 'true' ? user.email : undefined,
      sprint: sprint ?? 'current',
    });

    let filtered = tasks;

    if (status) {
      filtered = filtered.filter((t) => t.status === status);
    }

    if (unassigned === 'true') {
      filtered = filtered.filter((t) => !t.assigneeEmail);
    }

    return filtered;
  }

  @Get(':taskId/statuses')
  async getStatuses(
    @CurrentUser() user: RequestUser,
    @Param('taskId') taskId: string,
    @Query('provider') provider: IntegrationProvider,
  ) {
    return this.tasksService.getTaskStatuses(
      user.organizationId,
      taskId,
      provider,
    );
  }

  @Patch(':taskId/status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @CurrentUser() user: RequestUser,
    @Param('taskId') taskId: string,
    @Body() body: { statusName: string; provider: IntegrationProvider },
  ): Promise<{ success: boolean }> {
    await this.tasksService.updateTaskStatus(
      user.organizationId,
      taskId,
      body.statusName,
      body.provider,
    );
    return { success: true };
  }
}
