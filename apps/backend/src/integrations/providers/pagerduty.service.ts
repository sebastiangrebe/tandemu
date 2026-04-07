import { Injectable, Logger } from '@nestjs/common';

const PAGERDUTY_API = 'https://api.pagerduty.com';

interface PagerDutyIncident {
  id: string;
  title: string;
  urgency: 'high' | 'low';
  status: 'triggered' | 'acknowledged' | 'resolved';
  created_at: string;
  last_status_change_at: string;
  html_url: string;
  service: { id: string; summary: string };
}

interface PagerDutyService {
  id: string;
  name: string;
  description: string | null;
}

export interface IncidentData {
  incidentId: string;
  provider: string;
  title: string;
  severity: string;
  status: string;
  serviceName: string;
  createdAt: string;
  resolvedAt?: string;
  url: string;
  tags: string[];
}

@Injectable()
export class PagerDutyProviderService {
  private readonly logger = new Logger(PagerDutyProviderService.name);

  private async pdFetch<T>(path: string, apiKey: string): Promise<T> {
    const response = await fetch(`${PAGERDUTY_API}${path}`, {
      headers: {
        Authorization: `Token token=${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.pagerduty+json;version=2',
      },
    });

    if (!response.ok) {
      throw new Error(`PagerDuty API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async fetchIncidents(
    apiKey: string,
    since: string,
    serviceIds?: string[],
  ): Promise<IncidentData[]> {
    const params = new URLSearchParams({
      since,
      until: new Date().toISOString(),
      'statuses[]': 'resolved',
      sort_by: 'created_at',
      limit: '100',
    });
    if (serviceIds?.length) {
      for (const id of serviceIds) {
        params.append('service_ids[]', id);
      }
    }

    const allIncidents: IncidentData[] = [];
    let offset = 0;
    let more = true;

    while (more) {
      params.set('offset', String(offset));
      try {
        const data = await this.pdFetch<{
          incidents: PagerDutyIncident[];
          more: boolean;
        }>(`/incidents?${params}`, apiKey);

        for (const inc of data.incidents) {
          allIncidents.push({
            incidentId: inc.id,
            provider: 'pagerduty',
            title: inc.title,
            severity: inc.urgency === 'high' ? 'high' : 'low',
            status: inc.status,
            serviceName: inc.service?.summary ?? '',
            createdAt: inc.created_at,
            resolvedAt: inc.status === 'resolved' ? inc.last_status_change_at : undefined,
            url: inc.html_url,
            tags: [],
          });
        }

        more = data.more;
        offset += data.incidents.length;
      } catch (err) {
        this.logger.warn(`Failed to fetch PagerDuty incidents (offset ${offset}): ${err}`);
        break;
      }
    }

    return allIncidents;
  }

  async fetchServices(apiKey: string): Promise<Array<{ id: string; name: string }>> {
    try {
      const data = await this.pdFetch<{
        services: PagerDutyService[];
      }>('/services?limit=100', apiKey);

      return data.services.map((s) => ({ id: s.id, name: s.name }));
    } catch (err) {
      this.logger.warn(`Failed to fetch PagerDuty services: ${err}`);
      return [];
    }
  }
}
