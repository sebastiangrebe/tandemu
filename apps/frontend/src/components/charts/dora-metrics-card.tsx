'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE } from '@/lib/chart-theme';
import { Clock, GitPullRequest, AlertTriangle, Wrench, Rocket, ArrowRight, MessageSquare, GitMerge } from 'lucide-react';
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
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ backgroundColor: `${RATING_COLORS[rating]}1f`, color: RATING_COLORS[rating] }}
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

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {children}
      </span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

interface HeroTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  rating?: string;
  accent?: string;
  children?: React.ReactNode;
}

function HeroTile({ icon, label, value, unit, rating, accent, children }: HeroTileProps) {
  return (
    <div className="relative flex min-h-[148px] flex-col justify-between overflow-hidden rounded-xl border border-border/60 bg-card/40 p-4">
      {accent ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        />
      ) : null}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
        {rating ? <RatingBadge rating={rating} /> : null}
      </div>
      {children ? <div className="-mx-4 -mb-4 mt-2 h-11">{children}</div> : <div className="h-11" />}
    </div>
  );
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

  const freqAccent = freq ? RATING_COLORS[freq.rating] : undefined;
  const leadAccent = lead ? RATING_COLORS[lead.rating] : undefined;
  const cfrAccent = cfr ? RATING_COLORS[cfr.rating] : undefined;
  const mttrAccent = mttr ? RATING_COLORS[mttr.rating] : undefined;
  const reviewLatency = data.reviewLatency;
  const ttfr = reviewLatency?.timeToFirstReview ?? null;
  const ttm = reviewLatency?.timeToMerge ?? null;
  const ttfrAccent = ttfr ? RATING_COLORS[ttfr.rating] : undefined;
  const ttmAccent = ttm ? RATING_COLORS[ttm.rating] : undefined;

  const sourceLabel = data.dataSource === 'deployments' ? 'GitHub Deployments' : 'PR merges';
  const sparklineLabel = data.dataSource === 'deployments' ? 'Deploys / week' : 'PRs merged / week';

  const reliabilityConnected = !!(cfr || mttr || data.incidentProviderConnected);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>DORA Metrics</CardTitle>
            <CardDescription>Software delivery performance</CardDescription>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
            {data.dataSource === 'deployments' ? <Rocket className="size-3" /> : <GitPullRequest className="size-3" />}
            {sourceLabel}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Delivery tier */}
        <section>
          <SectionLabel hint={chartData.length > 1 ? sparklineLabel : undefined}>Delivery</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <HeroTile
              icon={<GitPullRequest className="size-3.5" />}
              label="Deployment Frequency"
              value={freq ? String(freq.avgPerWeek) : '—'}
              unit={freq ? '/ week' : undefined}
              rating={freq?.rating}
              accent={freqAccent}
            >
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="doraFreqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={freqAccent ?? '#71717a'} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={freqAccent ?? '#71717a'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="week" hide />
                    <YAxis hide domain={[0, 'dataMax']} />
                    <Tooltip
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      cursor={{ stroke: freqAccent ?? '#71717a', strokeOpacity: 0.25 }}
                      formatter={(value: number) => [
                        `${value} ${data.dataSource === 'deployments' ? 'deploys' : 'PRs'}`,
                        data.dataSource === 'deployments' ? 'Deployed' : 'Merged',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="deployments"
                      stroke={freqAccent ?? '#71717a'}
                      strokeWidth={1.5}
                      fill="url(#doraFreqGrad)"
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : null}
            </HeroTile>

            <HeroTile
              icon={<Clock className="size-3.5" />}
              label="Lead Time for Changes"
              value={lead ? formatDuration(lead.medianHours) : '—'}
              unit={lead ? 'median' : undefined}
              rating={lead?.rating}
              accent={leadAccent}
            />
          </div>
        </section>

        {/* Reliability tier */}
        <section>
          <SectionLabel
            hint={
              !reliabilityConnected ? (
                <a
                  href="/settings/integrations"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/80 transition-colors hover:text-foreground"
                >
                  Connect incident provider
                  <ArrowRight className="size-3" />
                </a>
              ) : data.incidentProviderConnected && (!cfr || !mttr) ? (
                'Syncing incident data…'
              ) : undefined
            }
          >
            Reliability
          </SectionLabel>

          {reliabilityConnected ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <HeroTile
                icon={<AlertTriangle className="size-3.5" />}
                label="Change Failure Rate"
                value={cfr ? `${Math.round(cfr.rate * 100)}%` : '—'}
                unit={cfr ? `${cfr.failedDeploys} of ${cfr.totalDeploys}` : undefined}
                rating={cfr?.rating}
                accent={cfrAccent}
              />
              <HeroTile
                icon={<Wrench className="size-3.5" />}
                label="Mean Time to Restore"
                value={mttr ? formatDuration(mttr.medianHours) : '—'}
                unit={mttr ? 'median' : undefined}
                rating={mttr?.rating}
                accent={mttrAccent}
              />
            </div>
          ) : (
            <div className="flex items-center gap-4 rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-3">
              <div className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>Change Failure Rate</span>
              </div>
              <div className="h-4 w-px bg-border/60" />
              <div className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
                <Wrench className="size-3.5 shrink-0" />
                <span>Mean Time to Restore</span>
              </div>
            </div>
          )}
        </section>

        {/* Review tier */}
        {reviewLatency ? (
          <section>
            <SectionLabel>Review</SectionLabel>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <HeroTile
                icon={<MessageSquare className="size-3.5" />}
                label="Time to First Review"
                value={ttfr ? formatDuration(ttfr.medianHours) : '—'}
                unit={ttfr ? 'median' : undefined}
                rating={ttfr?.rating}
                accent={ttfrAccent}
              />
              <HeroTile
                icon={<GitMerge className="size-3.5" />}
                label="Time to Merge"
                value={ttm ? formatDuration(ttm.medianHours) : '—'}
                unit={ttm ? 'median' : undefined}
                rating={ttm?.rating}
                accent={ttmAccent}
              />
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
