import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { EmailService } from './email.service.js';
import type { EmailJobData } from '../queue/queue.types.js';
import { renderInviteCreated } from './templates/invite-created.js';
import { renderInviteAccepted } from './templates/invite-accepted.js';
import { renderWelcome } from './templates/welcome.js';
import { renderMemberAddedOrg } from './templates/member-added-org.js';
import { renderMemberRemovedOrg } from './templates/member-removed-org.js';
import { renderMemberAddedTeam } from './templates/member-added-team.js';
import { renderIntegrationConnected } from './templates/integration-connected.js';
import { renderEmailAliasAdded } from './templates/email-alias-added.js';
import { renderInvoicePaid } from './templates/invoice-paid.js';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    this.logger.log(`Processing email job: ${job.data.type}`);

    switch (job.data.type) {
      case 'invite-created':
        await this.emailService.send(
          job.data.to,
          `You've been invited to ${job.data.organizationName}`,
          renderInviteCreated(job.data),
        );
        break;

      case 'invite-accepted':
        await this.emailService.send(
          job.data.to,
          `${job.data.acceptedByName} accepted your invite`,
          renderInviteAccepted(job.data),
        );
        break;

      case 'welcome':
        await this.emailService.send(
          job.data.to,
          'Welcome to Tandemu',
          renderWelcome(job.data),
        );
        break;

      case 'member-added-org':
        await this.emailService.send(
          job.data.to,
          `You've been added to ${job.data.organizationName}`,
          renderMemberAddedOrg(job.data),
        );
        break;

      case 'member-removed-org':
        await this.emailService.send(
          job.data.to,
          `You've been removed from ${job.data.organizationName}`,
          renderMemberRemovedOrg(job.data),
        );
        break;

      case 'member-added-team':
        await this.emailService.send(
          job.data.to,
          `You've been added to ${job.data.teamName}`,
          renderMemberAddedTeam(job.data),
        );
        break;

      case 'integration-connected':
        await this.emailService.send(
          job.data.to,
          `${job.data.provider} connected to ${job.data.organizationName}`,
          renderIntegrationConnected(job.data),
        );
        break;

      case 'email-alias-added':
        await this.emailService.send(
          job.data.to,
          'Email alias added to your account',
          renderEmailAliasAdded(job.data),
        );
        break;

      case 'invoice-paid':
        await this.emailService.send(
          job.data.to,
          `Invoice paid for ${job.data.organizationName}`,
          renderInvoicePaid(job.data),
        );
        break;

      default:
        this.logger.warn(`Unknown email job type: ${(job.data as { type: string }).type}`);
    }
  }
}
