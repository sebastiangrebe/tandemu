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
import { IntegrationsService } from './integrations.service.js';
import { TasksService } from './tasks.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { OrgRequiredGuard } from '../auth/org-required.guard.js';
import { CurrentUser, Roles } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import { MembershipRole } from '@tandem/types';
import type {
  CreateIntegrationDto,
  CreateProjectMappingDto,
  IntegrationProvider,
} from '@tandem/types';

@Controller('integrations')
@UseGuards(JwtAuthGuard, OrgRequiredGuard, RolesGuard)
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly tasksService: TasksService,
  ) {}

  // Owner/Admin only — connect a ticket system
  @Post()
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateIntegrationDto,
  ) {
    return this.integrationsService.create(user.organizationId, dto);
  }

  // All members can view connected integrations
  @Get()
  async findAll(@CurrentUser() user: RequestUser) {
    return this.integrationsService.findAll(user.organizationId);
  }

  // Owner/Admin only — disconnect
  @Delete(':provider')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: IntegrationProvider,
  ): Promise<void> {
    const deleted = await this.integrationsService.delete(user.organizationId, provider);
    if (!deleted) {
      throw new NotFoundException(`No ${provider} integration found`);
    }
  }

  // Owner/Admin only — map projects to teams
  @Post(':provider/mappings')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createMapping(
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: IntegrationProvider,
    @Body() dto: CreateProjectMappingDto,
  ) {
    const integration = await this.integrationsService.findOne(user.organizationId, provider);
    return this.integrationsService.createMapping(integration.id, dto);
  }

  // All members can view mappings
  @Get(':provider/mappings')
  async getMappings(
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: IntegrationProvider,
  ) {
    const integration = await this.integrationsService.findOne(user.organizationId, provider);
    return this.integrationsService.getMappings(integration.id);
  }

  // Owner/Admin only — remove mapping
  @Delete(':provider/mappings/:id')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMapping(
    @Param('id') id: string,
  ): Promise<void> {
    const deleted = await this.integrationsService.deleteMapping(id);
    if (!deleted) {
      throw new NotFoundException('Mapping not found');
    }
  }

  // Owner/Admin only — browse external projects (needed for setup)
  @Get(':provider/projects')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  async getProjects(
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: IntegrationProvider,
  ) {
    return this.tasksService.getProjects(user.organizationId, provider);
  }
}
