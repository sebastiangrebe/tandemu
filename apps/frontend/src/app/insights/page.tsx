'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Zap, Clock, DollarSign, Brain, TrendingDown, Share2, Info, Settings } from 'lucide-react';
import { getInsightsMetrics, getMemoryStats, getTokenUsage, getDeveloperStats } from '@/lib/api';
import type { InsightsMetrics, TokenUsageEntry, DeveloperStat } from '@/lib/api';
import { DeveloperLeaderboard } from '@/components/charts/developer-leaderboard';
import { TelemetryFilters, useFilterParams } from '@/components/filters/telemetry-filters';
import { ThroughputChart, CostEfficiencyChart } from '@/components/charts/insights-chart';
import { TokenUsageChart } from '@/components/charts/token-usage-chart';
import { DashboardSkeleton } from '@/components/ui/skeleton-helpers';

function formatCurrency(value: number | null, currency = 'USD'): string {
  if (value === null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatNumber(value: number | null): string {
  if (value === null) return '-';
  return new Intl.NumberFormat('en-US').format(value);
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsMetrics | null>(null);
  const [orgMemoryCount, setOrgMemoryCount] = useState(0);
  const [tokenData, setTokenData] = useState<TokenUsageEntry[]>([]);
  const [devStats, setDevStats] = useState<DeveloperStat[]>([]);
  const [loading, setLoading] = useState(true);
  const { startDate, endDate, teamId } = useFilterParams();

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const f = { startDate, endDate, teamId };
        const [insights, memStats, tokens, devs] = await Promise.allSettled([
          getInsightsMetrics(f),
          getMemoryStats(),
          getTokenUsage(f),
          getDeveloperStats(f),
        ]);
        if (cancelled) return;
        if (insights.status === 'fulfilled') setData(insights.value);
        if (memStats.status === 'fulfilled') setOrgMemoryCount(memStats.value.org);
        if (tokens.status === 'fulfilled') setTokenData(tokens.value);
        if (devs.status === 'fulfilled') setDevStats(devs.value);
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [startDate, endDate, teamId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
            <p className="text-muted-foreground">Honest assessment of AI investment value</p>
          </div>
          <TelemetryFilters showTeamFilter={true} />
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  const hasData = data && (data.totalAILines > 0 || data.totalManualLines > 0 || data.totalAICost > 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
          <p className="text-muted-foreground">Honest assessment of AI investment value</p>
        </div>
        <TelemetryFilters showTeamFilter={true} />
      </div>

      {/* Assumptions banner */}
      {data && hasData && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          <span>
            Calculations use <strong>${data.assumptions.developerHourlyRate}/hr</strong> developer rate
            and <strong>{Math.round(data.assumptions.aiLineTimeEstimateSeconds / 60)} min/line</strong> manual estimate.
          </span>
          <Link href="/settings" className="ml-auto flex items-center gap-1 text-primary hover:underline whitespace-nowrap">
            <Settings className="h-3.5 w-3.5" />
            Change
          </Link>
        </div>
      )}

      {!hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Zap className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-lg font-medium mb-1">No insights data yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Complete tasks using the /morning and /finish workflow to generate throughput, cost, and impact metrics.
              Enable OTEL in Claude Code for cost tracking.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Section 1: AI Coding Value */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">AI Coding Value</h2>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Productivity Multiplier</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {data.productivityMultiplier !== null ? `${data.productivityMultiplier}x` : '-'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    total output / manual-only output
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Capacity Freed</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {data.capacityFreedHours > 0 ? `${data.capacityFreedHours}h` : '-'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    hours of manual work handled by AI
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Cost per Task</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(data.costPerTask, data.assumptions.currency)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    AI cost per completed task
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Throughput stats */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="bg-muted/30">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-1">AI Lines</p>
                  <p className="text-lg font-semibold">{formatNumber(data.totalAILines)}</p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-1">Manual Lines</p>
                  <p className="text-lg font-semibold">{formatNumber(data.totalManualLines)}</p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-1">Tasks Completed</p>
                  <p className="text-lg font-semibold">{formatNumber(data.totalTasks)}</p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-1">Total AI Cost</p>
                  <p className="text-lg font-semibold">{formatCurrency(data.totalAICost, data.assumptions.currency)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-2">
              <ThroughputChart data={data.daily} />
              <CostEfficiencyChart data={data.daily} />
            </div>

            <TokenUsageChart data={tokenData} />
          </div>

          {/* Section 2: Tandemu Impact */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Tandemu Impact</h2>
            <p className="text-sm text-muted-foreground">
              How memory and workflow features reduce ramp-up time and prevent repeated mistakes.
            </p>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Memory Hits</CardTitle>
                  <Brain className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(data.memoryHits)}</div>
                  <p className="text-xs text-muted-foreground">
                    times AI used stored knowledge
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Friction Trend</CardTitle>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${
                    data.frictionEventsReduced !== null
                      ? data.frictionEventsReduced < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      : ''
                  }`}>
                    {data.frictionEventsReduced !== null
                      ? `${data.frictionEventsReduced > 0 ? '+' : ''}${data.frictionEventsReduced}%`
                      : '-'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    tool failures vs previous period
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Knowledge Shared</CardTitle>
                  <Share2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(orgMemoryCount)}</div>
                  <p className="text-xs text-muted-foreground">
                    org memories available to all members
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Section 3: AI Adoption */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">AI Adoption</h2>
            <p className="text-sm text-muted-foreground">
              Per-developer AI usage — who&apos;s leveraging AI and who could benefit from more adoption.
            </p>
            <DeveloperLeaderboard data={devStats} />
          </div>
        </>
      )}
    </div>
  );
}
