import { Injectable, Logger } from '@nestjs/common';
import type { IncidentData } from './pagerduty.service.js';

interface OpsgenieIncident {
  id: string;
  message: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  status: 'open' | 'resolved' | 'closed';
  createdAt: string;
  closedAt?: string;
  impactedServices?: string[];
  tinyId: string;
}

@Injectable()
export class OpsgenieProviderService {
  private readonly logger = new Logger(OpsgenieProviderService.name);

  private baseUrl(region?: string): string {
    return region?.toLowerCase() === 'eu'
      ? 'https://api.eu.opsgenie.com'
      : 'https://api.opsgenie.com';
  }

  private async ogFetch<T>(path: string, apiKey: string, region?: string): Promise<T> {
    const response = await fetch(`${this.baseUrl(region)}${path}`, {
      headers: {
        Authorization: `GenieKey ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Opsgenie API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private mapPriority(p: string): string {
    switch (p) {
      case 'P1': return 'critical';
      case 'P2': return 'high';
      case 'P3': return 'medium';
      case 'P4': return 'low';
      case 'P5': return 'info';
      default: return 'medium';
    }
  }

  async fetchIncidents(
    apiKey: string,
    since: string,
    region?: string,
  ): Promise<IncidentData[]> {
    const sinceDate = new Date(since).getTime();
    const query = encodeURIComponent(`status=resolved AND createdAt >= ${sinceDate}`);

    try {
      const data = await this.ogFetch<{
        data: OpsgenieIncident[];
      }>(`/v1/incidents?query=${query}&sort=createdAt&order=desc&limit=100`, apiKey, region);

      return data.data.map((inc) => ({
        incidentId: inc.id,
        provider: 'opsgenie',
        title: inc.message,
        severity: this.mapPriority(inc.priority),
        status: inc.status === 'open' ? 'triggered' : 'resolved',
        serviceName: inc.impactedServices?.[0] ?? '',
        createdAt: inc.createdAt,
        resolvedAt: inc.closedAt,
        url: '',
        tags: [],
      }));
    } catch (err) {
      this.logger.warn(`Failed to fetch Opsgenie incidents: ${err}`);
      return [];
    }
  }

  async fetchServices(apiKey: string, region?: string): Promise<Array<{ id: string; name: string }>> {
    try {
      const data = await this.ogFetch<{
        data: Array<{ id: string; name: string }>;
      }>('/v1/services?limit=100', apiKey, region);

      return data.data.map((s) => ({ id: s.id, name: s.name }));
    } catch (err) {
      this.logger.warn(`Failed to fetch Opsgenie services: ${err}`);
      return [];
    }
  }
}
