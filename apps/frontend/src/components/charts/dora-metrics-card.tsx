'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { AXIS_TICK_SM, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE } from '@/lib/chart-theme';
import { Clock, GitPullRequest, AlertTriangle, Wrench, Rocket, Server } from 'lucide-react';
import type { DORAMetrics } from '@/lib/api';

const RATING_COLORS: Record<string, string> = {
  elite: '#4ade80',
  high: '#60a5fa',
  medium: '#facc15',
  low: '#f87171',
};

const RATING_LABELS: Record<string, string> = {
  elite: 'Elite',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function RatingBadge({ rating }: { rating: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${RATING_COLORS[rating]}20`, color: RATING_COLORS[rating] }}
    >
      {RATING_LABELS[rating] ?? rating}
    </span>
  );
}

function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round(hours / 24 * 10) / 10}d`;
}

interface DORAMetricsCardProps {
  data: DORAMetrics | null;
}

export function DORAMetricsCard({ data }: DORAMetricsCardProps) {
  if (!data || (!data.deploymentFrequency && !data.leadTimeForChanges)) {
    let message = 'Connect GitHub to see DORA metrics';
    if (data?.githubConnected && !data?.githubReposMapped) {
      message = 'Map a GitHub repository to a team in Settings → Integrations to enable DORA metrics';
    } else if (data?.githubConnected) {
      message = 'Syncing GitHub data — DORA metrics will appear after the first sync completes';
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>DORA Metrics</CardTitle>
          <CardDescription>Software delivery performance</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    );
  }

  const freq = data.deploymentFrequency;
  const lead = data.leadTimeForChanges;
  const cfr = data.changeFailureRate;
  const mttr = data.meanTimeToRestore;

  const chartData = freq?.trend.map((d) => ({
    week: new Date(d.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    deployments: d.deployments,
  })) ?? [];

  const sourceLabel = data.dataSource === 'deployments' ? 'GitHub Deployments' : 'PR merges';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>DORA Metrics</CardTitle>
            <CardDescription>Software delivery performance</CardDescription>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {data.dataSource === 'deployments' ? <Rocket className="size-3" /> : <GitPullRequest className="size-3" />}
            {sourceLabel}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Metric rows */}
        <div className="grid grid-cols-2 gap-4">
          {/* Deployment Frequency */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <GitPullRequest className="size-4" />
              Deployment Frequency
            </div>
            {freq ? (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold">{freq.avgPerWeek}</span>
                <span className="text-sm text-muted-foreground">/ week</span>
                <RatingBadge rating={freq.rating} />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No data</span>
            )}
          </div>

          {/* Lead Time */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4" />
              Lead Time for Changes
            </div>
            {lead ? (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold">{formatDuration(lead.medianHours)}</span>
                <span className="text-sm text-muted-foreground">median</span>
                <RatingBadge rating={lead.rating} />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No data</span>
            )}
          </div>

          {/* Change Failure Rate */}
          <div className={`space-y-1${!cfr && !data.incidentProviderConnected ? ' opacity-50' : ''}`}>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="size-4" />
              Change Failure Rate
            </div>
            {cfr ? (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold">{Math.round(cfr.rate * 100)}%</span>
                <span className="text-sm text-muted-foreground">{cfr.failedDeploys} of {cfr.totalDeploys}</span>
                <RatingBadge rating={cfr.rating} />
              </div>
            ) : data.incidentProviderConnected ? (
              <span className="text-sm text-muted-foreground">Syncing incident data...</span>
            ) : (
              <span className="text-xs text-muted-foreground">Connect PagerDuty or Opsgenie</span>
            )}
          </div>

          {/* Mean Time to Restore */}
          <div className={`space-y-1${!mttr && !data.incidentProviderConnected ? ' opacity-50' : ''}`}>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wrench className="size-4" />
              Mean Time to Restore
            </div>
            {mttr ? (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold">{formatDuration(mttr.medianHours)}</span>
                <span className="text-sm text-muted-foreground">median</span>
                <RatingBadge rating={mttr.rating} />
              </div>
            ) : data.incidentProviderConnected ? (
              <span className="text-sm text-muted-foreground">Syncing incident data...</span>
            ) : (
              <span className="text-xs text-muted-foreground">Connect PagerDuty or Opsgenie</span>
            )}
          </div>
        </div>

        {/* Deployment trend chart */}
        {chartData.length > 1 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {data.dataSource === 'deployments' ? 'Deployments per Week' : 'PRs Merged per Week'}
            </p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} margin={{ top: 4 }}>
                <XAxis dataKey="week" tick={AXIS_TICK_SM} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK_SM} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                <Tooltip
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                  formatter={(value: number) => [
                    `${value} ${data.dataSource === 'deployments' ? 'deploys' : 'PRs'}`,
                    data.dataSource === 'deployments' ? 'Deployed' : 'Merged',
                  ]}
                />
                <Bar dataKey="deployments" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={freq ? RATING_COLORS[freq.rating] : '#71717a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
