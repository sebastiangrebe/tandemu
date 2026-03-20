import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { OrgRequiredGuard } from '../auth/org-required.guard.js';
import { CurrentUser } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import type { Task, TaskStatus } from '@tandem/types';

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
  ): Promise<Task[]> {
    // Fetch the user's email from the JWT payload — it's stored in the auth service
    // The RequestUser has userId; we need the email for assignee filtering.
    // We'll pass the user info along and let the service handle it.
    const tasks = await this.tasksService.getTasks(user.organizationId, {
      teamId,
      sprint: sprint ?? 'current',
    });

    if (status) {
      return tasks.filter((t) => t.status === status);
    }

    return tasks;
  }
}
