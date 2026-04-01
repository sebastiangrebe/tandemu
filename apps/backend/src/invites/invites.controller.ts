import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InvitesService } from './invites.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CurrentUser, Roles } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import { MembershipRole } from '@tandemu/types';
import type { Invite, CreateInviteDto } from '@tandemu/types';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  // Owner/Admin only — send invites
  @Post('organizations/:orgId/invites')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('orgId') orgId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateInviteDto,
  ): Promise<Invite> {
    return this.invitesService.create(orgId, dto.email, dto.role, user.userId, dto.teamId);
  }

  // Owner/Admin can view pending invites
  @Get('organizations/:orgId/invites')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  async findAllForOrg(
    @Param('orgId') orgId: string,
  ): Promise<Invite[]> {
    return this.invitesService.findAllForOrg(orgId);
  }

  // Any authenticated user can accept their own invite
  @Post('invites/:inviteId/accept')
  async accept(
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<Invite> {
    return this.invitesService.accept(inviteId, user.userId);
  }

  // Owner/Admin only — cancel invites
  @Delete('organizations/:orgId/invites/:inviteId')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @Param('inviteId') inviteId: string,
  ): Promise<void> {
    const cancelled = await this.invitesService.cancel(inviteId);
    if (!cancelled) {
      throw new NotFoundException(`Invite with id ${inviteId} not found`);
    }
  }
}
