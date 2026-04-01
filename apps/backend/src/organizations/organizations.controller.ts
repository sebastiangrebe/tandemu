import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CurrentUser, Roles } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import { MembershipRole } from '@tandemu/types';
import type {
  Organization,
  CreateOrganizationDto,
  UpdateOrganizationDto,
  InviteMemberDto,
  Membership,
} from '@tandemu/types';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  // Any authenticated user can create an org (they become the owner)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateOrganizationDto,
  ): Promise<Organization> {
    return this.organizationsService.create(dto, user.userId);
  }

  // Any member can list their orgs
  @Get()
  async findAll(
    @CurrentUser() user: RequestUser,
  ): Promise<Organization[]> {
    return this.organizationsService.findAll(user.userId);
  }

  // Any member can view org details
  @Get(':id')
  async findById(
    @Param('id') id: string,
  ): Promise<Organization> {
    return this.organizationsService.findOne(id);
  }

  // Owner/Admin only — update org settings
  @Patch(':id')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    return this.organizationsService.update(id, dto);
  }

  // Owner only — delete org
  @Delete(':id')
  @Roles(MembershipRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
  ): Promise<void> {
    const deleted = await this.organizationsService.delete(id);
    if (!deleted) {
      throw new NotFoundException(`Organization with id ${id} not found`);
    }
  }

  // Owner/Admin only — add members directly
  @Post(':id/members')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async inviteMember(
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
  ): Promise<Membership> {
    return this.organizationsService.addMember(id, dto.email, dto.role);
  }

  // Owner/Admin only — remove a member
  @Delete(':id/members/:userId')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    if (userId === user.userId) {
      throw new ForbiddenException('Cannot remove yourself from the organization');
    }
    const removed = await this.organizationsService.removeMember(id, userId);
    if (!removed) {
      throw new NotFoundException('Membership not found');
    }
  }

  // Any member can view the member list
  @Get(':id/members')
  async getMembers(
    @Param('id') id: string,
  ) {
    return this.organizationsService.getMembers(id);
  }
}
