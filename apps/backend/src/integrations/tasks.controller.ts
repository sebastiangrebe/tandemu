import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { TeamsService } from '../teams/teams.service.js';
import { AuthService } from '../auth/auth.service.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { OrgRequiredGuard } from '../auth/org-required.guard.js';
import { CurrentUser } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import type { Task, TaskStatus, TaskPriority, IntegrationProvider, StandupResponse, StandupMember, StandupBlocker } from '@tandemu/types';
import { inferCategory } from './task-category.js';

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
  private readonly logger = new Logger(TasksController.name);

  constructor(
    private readonly tasksService: TasksService,
    private readonly teamsService: TeamsService,
    private readonly authService: AuthService,
    private readonly telemetryService: TelemetryService,
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
    @Query('fallbackUnassigned') fallbackUnassigned?: string,
  ): Promise<Task[]> {
    // When fetching "my" tasks, use all email aliases for matching
    let assigneeEmails: string[] | undefined;
    if (mine === 'true') {
      assigneeEmails = await this.authService.getAllEmailAddresses(user.userId);
    }

    // Resolve team IDs — supports "all" or comma-separated
    const teamIds = await this.resolveTeamIds(teamId, user);

    // Fetch tasks (multi-team with dedup if needed)
    let tasks: Task[];
    if (teamIds.length > 1) {
      const allResults = await Promise.all(
        teamIds.map((tid) =>
          this.tasksService.getTasks(user.organizationId, {
            teamId: tid,
            assigneeEmail: mine === 'true' ? user.email : undefined,
            assigneeEmails,
            sprint: sprint ?? 'current',
            excludeDone: excludeDone === 'true',
          }),
        ),
      );
      const deduped = new Map<string, Task>();
      for (const batch of allResults) {
        for (const t of batch) deduped.set(t.id, t);
      }
      tasks = [...deduped.values()];
    } else {
      tasks = await this.tasksService.getTasks(user.organizationId, {
        teamId: teamIds[0],
        assigneeEmail: mine === 'true' ? user.email : undefined,
        assigneeEmails,
        sprint: sprint ?? 'current',
        excludeDone: excludeDone === 'true',
      });
    }

    let filtered = tasks;

    if (status) {
      filtered = filtered.filter((t) => t.status === status);
    }

    if (unassigned === 'true') {
      filtered = filtered.filter((t) => !t.assigneeEmail);
    }

    // Apply done window filter when a single teamId is set and excludeDone is not explicitly set
    if (teamIds.length === 1 && teamIds[0] && excludeDone !== 'true') {
      const settings = await this.teamsService.getSettings(teamIds[0]);
      const windowMs = settings.doneWindowDays * 86400_000;
      const cutoff = new Date(Date.now() - windowMs);

      filtered = filtered.filter((t) => {
        if (t.status === 'done' || t.status === 'cancelled') {
          return new Date(t.updatedAt) >= cutoff;
        }
        return true;
      });
    }

    // Fallback: if mine=true returned nothing and fallbackUnassigned is requested
    if (mine === 'true' && fallbackUnassigned === 'true' && filtered.length === 0) {
      const fallbackTasks = teamIds.length > 1
        ? await this.fetchMultiTeamTasks(user.organizationId, teamIds, sprint)
        : await this.tasksService.getTasks(user.organizationId, {
            teamId: teamIds[0],
            sprint: sprint ?? 'current',
          });
      filtered = fallbackTasks.filter((t) => !t.assigneeEmail && t.status === 'todo');
    }

    // Sort
    const sortField = sort ?? 'priority';
    const sortOrder = order ?? 'desc';

    filtered.sort((a, b) => {
      let cmp: number;
      if (sortField === 'priority') {
        cmp = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        return sortOrder === 'desc' ? cmp : -cmp;
      } else {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        return sortOrder === 'asc' ? cmp : -cmp;
      }
    });

    // Enrich with category
    return filtered.map((t) => ({ ...t, category: inferCategory(t.labels) }));
  }

  // ── Standup ── (must be before :taskId routes)

  @Get('standup')
  async getStandup(
    @CurrentUser() user: RequestUser,
    @Query('teamId') teamId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<StandupResponse> {
    const orgId = user.organizationId;

    // Fetch all data in parallel
    const [teamInfo, members, tasks, devStats, friction] = await Promise.all([
      this.teamsService.findOne(teamId),
      this.teamsService.getMembers(teamId),
      this.tasksService.getTasks(orgId, { teamId }),
      this.telemetryService.getDeveloperStats(orgId, startDate, endDate, teamId),
      this.telemetryService.getFrictionHeatmap(orgId, startDate, endDate, teamId),
    ]);

    // Build email → member lookup
    const emailToMember = new Map<string, (typeof members)[0]>();
    for (const m of members) {
      for (const email of m.emails) {
        emailToMember.set(email.toLowerCase(), m);
      }
    }

    // Categorize tasks
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400_000);

    const memberTasks = new Map<string, { inProgress: Task[]; inReview: Task[]; recentlyDone: Task[] }>();
    for (const m of members) {
      memberTasks.set(m.id, { inProgress: [], inReview: [], recentlyDone: [] });
    }

    const otherMap = new Map<string, { assigneeName?: string; assigneeEmail?: string; tasks: Task[] }>();
    const unassigned: Task[] = [];
    const todoTasks: Task[] = [];
    const stalledReviews: StandupBlocker[] = [];

    for (const task of tasks) {
      const enriched = { ...task, category: inferCategory(task.labels) };

      if (!task.assigneeEmail) {
        if (task.status === 'todo') todoTasks.push(enriched);
        else unassigned.push(enriched);
        continue;
      }

      const member = emailToMember.get(task.assigneeEmail.toLowerCase());
      if (!member) {
        // Other contributor
        const key = task.assigneeEmail.toLowerCase();
        const existing = otherMap.get(key);
        if (existing) {
          existing.tasks.push(enriched);
        } else {
          otherMap.set(key, { assigneeName: task.assigneeName, assigneeEmail: task.assigneeEmail, tasks: [enriched] });
        }
        continue;
      }

      const bucket = memberTasks.get(member.id)!;
      switch (task.status) {
        case 'in_progress':
          bucket.inProgress.push(enriched);
          break;
        case 'in_review':
          bucket.inReview.push(enriched);
          if (new Date(task.updatedAt) < twoDaysAgo) {
            stalledReviews.push({
              type: 'stalled_review',
              taskId: task.id,
              title: task.title,
              stalledDays: Math.floor((Date.now() - new Date(task.updatedAt).getTime()) / 86400_000),
            });
          }
          break;
        case 'done':
          if (new Date(task.updatedAt) >= sevenDaysAgo) {
            bucket.recentlyDone.push(enriched);
          }
          break;
        case 'todo':
          todoTasks.push(enriched);
          break;
      }
    }

    // Build dev stats lookup
    const devStatsMap = new Map<string, (typeof devStats)[0]>();
    for (const ds of devStats) {
      devStatsMap.set(ds.userId, ds);
    }

    // Build friction per member
    const frictionByUser = new Map<string, Map<string, number>>();
    const frictionByFile = new Map<string, Set<string>>();
    for (const f of friction) {
      if (!f.userId) continue;
      if (!frictionByUser.has(f.userId)) frictionByUser.set(f.userId, new Map());
      const userFriction = frictionByUser.get(f.userId)!;
      userFriction.set(f.repositoryPath, (userFriction.get(f.repositoryPath) ?? 0) + f.promptLoopCount + f.errorCount);

      if (!frictionByFile.has(f.repositoryPath)) frictionByFile.set(f.repositoryPath, new Set());
      frictionByFile.get(f.repositoryPath)!.add(f.userId);
    }

    // High-friction blockers (files affecting ≥2 devs)
    const frictionBlockers: StandupBlocker[] = [];
    for (const [filePath, devSet] of frictionByFile) {
      if (devSet.size >= 2) {
        let totalCount = 0;
        for (const f of friction) {
          if (f.repositoryPath === filePath) totalCount += f.promptLoopCount + f.errorCount;
        }
        frictionBlockers.push({
          type: 'high_friction',
          filePath,
          frictionCount: totalCount,
          affectedDevs: devSet.size,
        });
      }
    }

    // Assemble members (only include those with tasks or telemetry)
    const standupMembers: StandupMember[] = [];
    for (const m of members) {
      const tasks = memberTasks.get(m.id)!;
      const ds = devStatsMap.get(m.id);
      const userFriction = frictionByUser.get(m.id);

      const hasTasks = tasks.inProgress.length > 0 || tasks.inReview.length > 0 || tasks.recentlyDone.length > 0;
      const hasTelemetry = ds && (ds.sessions > 0 || ds.activeMinutes > 0);

      if (!hasTasks && !hasTelemetry) continue;

      const frictionFiles: Array<{ path: string; count: number }> = [];
      if (userFriction) {
        for (const [path, count] of userFriction) {
          frictionFiles.push({ path, count });
        }
        frictionFiles.sort((a, b) => b.count - a.count);
      }

      standupMembers.push({
        id: m.id,
        name: m.name,
        email: m.email,
        tasks,
        telemetry: {
          activeMinutes: ds ? Math.round(ds.activeMinutes) : 0,
          sessions: ds?.sessions ?? 0,
          aiLines: ds ? Math.round(ds.aiLines) : 0,
          manualLines: ds ? Math.round(ds.manualLines) : 0,
          frictionFiles,
        },
      });
    }

    // Summary
    let inProgressCount = 0;
    let inReviewCount = 0;
    let doneThisWeekCount = 0;
    for (const mt of memberTasks.values()) {
      inProgressCount += mt.inProgress.length;
      inReviewCount += mt.inReview.length;
      doneThisWeekCount += mt.recentlyDone.length;
    }

    return {
      team: { id: teamInfo.id, name: teamInfo.name, memberCount: members.length },
      summary: {
        inProgress: inProgressCount,
        inReview: inReviewCount,
        doneThisWeek: doneThisWeekCount,
        todoCount: todoTasks.length,
      },
      members: standupMembers,
      otherContributors: [...otherMap.values()],
      unassigned,
      backlog: { tasks: todoTasks.slice(0, 10), totalCount: todoTasks.length },
      blockers: [...stalledReviews, ...frictionBlockers],
    };
  }

  // ── Parameterized routes ──

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
    @Body() body: { statusName?: string; assigneeEmail?: string; priority?: string; provider: IntegrationProvider },
  ): Promise<{ success: boolean }> {
    await this.tasksService.updateTask(
      user.organizationId,
      taskId,
      body.provider,
      { statusName: body.statusName, assigneeEmail: body.assigneeEmail, priority: body.priority },
    );
    return { success: true };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTask(
    @CurrentUser() user: RequestUser,
    @Body() body: {
      teamId: string;
      title: string;
      description?: string;
      assigneeEmail?: string;
      priority?: string;
      labels?: string[];
    },
  ): Promise<Task> {
    return this.tasksService.createTask(user.organizationId, body);
  }

  // ── Helpers ──

  private async resolveTeamIds(teamId: string | undefined, user: RequestUser): Promise<string[]> {
    if (!teamId) return [];
    if (teamId === 'all') {
      const teams = await this.teamsService.findByUserId(user.organizationId, user.userId);
      return teams.map((t) => t.id);
    }
    if (teamId.includes(',')) {
      return teamId.split(',').map((id) => id.trim());
    }
    return [teamId];
  }

  private async fetchMultiTeamTasks(orgId: string, teamIds: string[], sprint?: string): Promise<Task[]> {
    const allResults = await Promise.all(
      teamIds.map((tid) => this.tasksService.getTasks(orgId, { teamId: tid, sprint: sprint ?? 'current' })),
    );
    const deduped = new Map<string, Task>();
    for (const batch of allResults) {
      for (const t of batch) deduped.set(t.id, t);
    }
    return [...deduped.values()];
  }
}
