import { Processor } from '@nestjs/bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import type { Job } from 'bullmq';
import { SentryProcessor } from './sentry-processor.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { PagerDutyProviderService } from '../integrations/providers/pagerduty.service.js';
import { OpsgenieProviderService } from '../integrations/providers/opsgenie.service.js';
import { IncidentSyncScheduler } from '../telemetry/incident-sync.scheduler.js';
import type { IncidentSyncJobData } from './queue.types.js';

@Processor('incident-sync')
export class IncidentSyncProcessor extends SentryProcessor {
  private readonly logger = new Logger(IncidentSyncProcessor.name);

  constructor(
    @Inject(forwardRef(() => TelemetryService))
    private readonly telemetryService: TelemetryService,
    @Inject(forwardRef(() => IncidentSyncScheduler))
    private readonly scheduler: IncidentSyncScheduler,
    private readonly pagerdutyService: PagerDutyProviderService,
    private readonly opsgenieService: OpsgenieProviderService,
  ) {
    super();
  }

  async run(job: Job<IncidentSyncJobData>): Promise<void> {
    if (job.name === 'incident-sync-trigger') {
      this.logger.log('Incident sync trigger fired — fanning out per-org jobs');
      await this.scheduler.triggerSyncForAllOrgs();
      return;
    }

    if (job.data.type === 'incident-sync-trigger') return; // handled above
    const { token, provider, organizationId, teamId, since, config } = job.data;

    this.logger.log(`Syncing incidents for org ${organizationId} (${provider})`);

    let incidents;
    if (provider === 'pagerduty') {
      const serviceIds = (config?.serviceIds as string[]) ?? undefined;
      incidents = await this.pagerdutyService.fetchIncidents(token, since ?? '', serviceIds);
    } else {
      const region = (config?.region as string) ?? undefined;
      incidents = await this.opsgenieService.fetchIncidents(token, since ?? '', region);
    }

    if (incidents.length > 0) {
      await this.telemetryService.insertIncidents(organizationId, teamId, incidents);
    }

    this.logger.log(`Synced ${incidents.length} incidents for org ${organizationId} (${provider})`);
  }
}
