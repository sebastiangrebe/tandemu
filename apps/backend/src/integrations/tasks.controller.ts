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
import { TeamsService } from '../teams/teams.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { OrgRequiredGuard } from '../auth/org-required.guard.js';
import { CurrentUser } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import type { Task, TaskStatus, TaskPriority, IntegrationProvider } from '@tandemu/types';

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

@Controller('tasks')
@UseGuards(JwtAuthGuard, OrgRequiredGuard)
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly teamsService: TeamsService,
  ) {}

  @Get()
  async getTasks(
    @CurrentUser() user: RequestUser,
    @Query('teamId') teamId?: string,
    @Query('sprint') sprint?: string,
    @Query('status') status?: TaskStatus,
    @Query('mine') mine?: string,
    @Query('unassigned') unassigned?: string,
    @Query('sort') sort?: 'priority' | 'updatedAt',
    @Query('order') order?: 'asc' | 'desc',
    @Query('excludeDone') excludeDone?: string,
  ): Promise<Task[]> {
    const tasks = await this.tasksService.getTasks(user.organizationId, {
      teamId,
      assigneeEmail: mine === 'true' ? user.email : undefined,
      sprint: sprint ?? 'current',
      excludeDone: excludeDone === 'true',
    });

    let filtered = tasks;

    if (status) {
      filtered = filtered.filter((t) => t.status === status);
    }

    if (unassigned === 'true') {
      filtered = filtered.filter((t) => !t.assigneeEmail);
    }

    // Apply done window filter when teamId is set and excludeDone is not explicitly set
    if (teamId && excludeDone !== 'true') {
      const settings = await this.teamsService.getSettings(teamId);
      const windowMs = settings.doneWindowDays * 86400_000;
      const cutoff = new Date(Date.now() - windowMs);

      filtered = filtered.filter((t) => {
        if (t.status === 'done' || t.status === 'cancelled') {
          return new Date(t.updatedAt) >= cutoff;
        }
        return true;
      });
    }

    // Sort
    const sortField = sort ?? 'priority';
    const sortOrder = order ?? 'desc';

    filtered.sort((a, b) => {
      let cmp: number;
      if (sortField === 'priority') {
        cmp = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      } else {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

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

  @Patch(':taskId')
  @HttpCode(HttpStatus.OK)
  async updateTask(
    @CurrentUser() user: RequestUser,
    @Param('taskId') taskId: string,
    @Body() body: { statusName?: string; assigneeEmail?: string; provider: IntegrationProvider },
  ): Promise<{ success: boolean }> {
    await this.tasksService.updateTask(
      user.organizationId,
      taskId,
      body.provider,
      { statusName: body.statusName, assigneeEmail: body.assigneeEmail },
    );
    return { success: true };
  }
}
