'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap, Clock, DollarSign, Info, Settings } from 'lucide-react';
import { getInsightsMetrics, getTokenUsage } from '@/lib/api';
import type { InsightsMetrics, TokenUsageEntry } from '@/lib/api';
import { TelemetryFilters, useFilterParams } from '@/components/filters/telemetry-filters';
import { ThroughputChart, CostEfficiencyChart } from '@/components/charts/insights-chart';
import { TokenUsageChart } from '@/components/charts/token-usage-chart';
import { InsightsSkeleton } from '@/components/ui/skeleton-helpers';

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
  const [tokenData, setTokenData] = useState<TokenUsageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { startDate, endDate, teamId } = useFilterParams();

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const f = { startDate, endDate, teamId };
        const [insights, tokens] = await Promise.allSettled([
          getInsightsMetrics(f),
          getTokenUsage(f),
        ]);
        if (cancelled) return;
        if (insights.status === 'fulfilled') setData(insights.value);
        if (tokens.status === 'fulfilled') setTokenData(tokens.value);
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
        <InsightsSkeleton />
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

            {/* Hero KPI Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Productivity Multiplier</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {data.productivityMultiplier !== null ? `${data.productivityMultiplier}x` : data.totalAILines > 0 ? '100%' : '-'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">total output / manual-only output</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Capacity Freed</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {data.capacityFreedHours > 0 ? `${data.capacityFreedHours}h` : '-'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">hours of manual work handled by AI</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Cost per Task</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(data.costPerTask, data.assumptions.currency)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">AI cost per completed task</p>
                </CardContent>
              </Card>
            </div>

            {/* Throughput stats — compact inline row */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                <div className="h-2 w-2 rounded-full bg-blue-400" />
                <div>
                  <p className="text-lg font-semibold leading-tight">{formatNumber(data.totalAILines)}</p>
                  <p className="text-xs text-muted-foreground">AI Lines</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                <div className="h-2 w-2 rounded-full bg-zinc-400" />
                <div>
                  <p className="text-lg font-semibold leading-tight">{formatNumber(data.totalManualLines)}</p>
                  <p className="text-xs text-muted-foreground">Manual Lines</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <div>
                  <p className="text-lg font-semibold leading-tight">{formatNumber(data.totalTasks)}</p>
                  <p className="text-xs text-muted-foreground">Tasks Completed</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                <div className="h-2 w-2 rounded-full bg-amber-400" />
                <div>
                  <p className="text-lg font-semibold leading-tight">{formatCurrency(data.totalAICost, data.assumptions.currency)}</p>
                  <p className="text-xs text-muted-foreground">Total AI Cost</p>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-2">
              <ThroughputChart data={data.daily} />
              <CostEfficiencyChart data={data.daily} />
            </div>

            <TokenUsageChart data={tokenData} />
          </div>

        </>
      )}
    </div>
  );
}
