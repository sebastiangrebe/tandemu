import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TeamsService } from './teams.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CurrentUser, Roles } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import { MembershipRole } from '@tandemu/types';
import type { Team, CreateTeamDto, UpdateTeamDto } from '@tandemu/types';

@Controller('organizations/:orgId/teams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  // Owner/Admin only — create teams
  @Post()
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateTeamDto,
  ): Promise<Team> {
    return this.teamsService.create(orgId, dto);
  }

  // Any member can list teams
  @Get()
  async findAll(
    @Param('orgId') orgId: string,
  ): Promise<Team[]> {
    return this.teamsService.findAll(orgId);
  }

  // Any member can list their own teams
  @Get('mine')
  async findMine(
    @Param('orgId') orgId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<Team[]> {
    return this.teamsService.findByUserId(orgId, user.userId);
  }

  // Any member can view a team
  @Get(':teamId')
  async findOne(
    @Param('teamId') teamId: string,
  ): Promise<Team> {
    return this.teamsService.findOne(teamId);
  }

  // Owner/Admin only — update team
  @Patch(':teamId')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  async update(
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
  ): Promise<Team> {
    return this.teamsService.update(teamId, dto);
  }

  // Owner/Admin only — delete team
  @Delete(':teamId')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('teamId') teamId: string,
  ): Promise<void> {
    const deleted = await this.teamsService.delete(teamId);
    if (!deleted) {
      throw new NotFoundException(`Team with id ${teamId} not found`);
    }
  }

  // Owner/Admin only — manage team members
  @Post(':teamId/members')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async addMember(
    @Param('teamId') teamId: string,
    @Body() body: { userId: string },
  ) {
    return this.teamsService.addMember(teamId, body.userId);
  }

  // Owner/Admin only — remove team members
  @Delete(':teamId/members/:userId')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    const removed = await this.teamsService.removeMember(teamId, userId);
    if (!removed) {
      throw new NotFoundException('Team member not found');
    }
  }

  // Any member can view team members
  @Get(':teamId/members')
  async getMembers(
    @Param('teamId') teamId: string,
  ) {
    return this.teamsService.getMembers(teamId);
  }
}
