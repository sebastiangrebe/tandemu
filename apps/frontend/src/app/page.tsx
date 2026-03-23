'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Brain, GitPullRequest, Users, Rocket, Clock, AlertCircle, RotateCcw } from "lucide-react";
import { getAIRatio, getDORAMetrics, getTimesheets } from '@/lib/api';
import type { TimesheetEntry } from '@/lib/api';
import type { AIvsManualRatio, DORAMetrics } from '@tandemu/types';
import { InstallBanner } from '@/components/install-banner';
import { ActivityChart } from '@/components/charts/activity-chart';
import { AIRatioChart } from '@/components/charts/ai-ratio-chart';
import { TelemetryFilters, useFilterParams } from '@/components/filters/telemetry-filters';
import { DashboardSkeleton } from '@/components/ui/skeleton-helpers';

function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatHours(hours: number): string {
  if (hours === 0) return '—';
  if (hours < 0.1) return '<6m';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

function classifyDORA(metric: string, value: number): { level: string; color: string } {
  const levels: Record<string, Array<[number, string, string]>> = {
    deploymentFrequency: [[1, 'Elite', 'emerald'], [0.14, 'High', 'blue'], [0.03, 'Medium', 'yellow']],
    leadTimeForChanges: [[1, 'Elite', 'emerald'], [24, 'High', 'blue'], [168, 'Medium', 'yellow']],
    changeFailureRate: [[5, 'Elite', 'emerald'], [10, 'High', 'blue'], [15, 'Medium', 'yellow']],
  };
  const thresholds = levels[metric];
  if (!thresholds) return { level: 'Low', color: 'red' };
  const isLowerBetter = metric === 'leadTimeForChanges' || metric === 'changeFailureRate';
  for (const [threshold, level, color] of thresholds) {
    if (isLowerBetter ? value <= threshold : value >= threshold) return { level, color };
  }
  return { level: 'Low', color: 'red' };
}

const badgeColor = (color: string) => {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    red: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return map[color] ?? map.red;
};

export default function DashboardPage() {
  const [aiData, setAiData] = useState<AIvsManualRatio[]>([]);
  const [doraData, setDoraData] = useState<DORAMetrics | null>(null);
  const [timesheetData, setTimesheetData] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { startDate, endDate } = useFilterParams();

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const f = { startDate, endDate };
        const [ai, dora, timesheets] = await Promise.allSettled([
          getAIRatio(f), getDORAMetrics(f), getTimesheets(f),
        ]);
        if (cancelled) return;
        if (ai.status === 'fulfilled') setAiData(ai.value);
        if (dora.status === 'fulfilled') setDoraData(dora.value);
        if (timesheets.status === 'fulfilled') setTimesheetData(timesheets.value);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">Engineering metrics and AI teammate activity.</p>
          </div>
          <TelemetryFilters />
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Engineering metrics and AI teammate activity.</p>
        </div>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      </div>
    );
  }

  const totalSessions = timesheetData.reduce((s, t) => s + t.sessions, 0);
  const totalMinutes = timesheetData.reduce((s, t) => s + t.activeMinutes, 0);
  const developerIds = new Set(timesheetData.map(t => t.userId));
  const totalAi = aiData.reduce((s, r) => s + r.aiGeneratedLines, 0);
  const totalManual = aiData.reduce((s, r) => s + r.manualLines, 0);
  const totalLines = totalAi + totalManual;
  const aiRatio = totalLines > 0 ? Math.round((totalAi / totalLines) * 1000) / 10 : 0;
  const avgCycleTime = doraData?.leadTimeForChanges ?? 0;
  const hasData = totalSessions > 0 || totalLines > 0 || avgCycleTime > 0;

  const doraMetrics = doraData ? [
    { title: 'Deploy Frequency', value: doraData.deploymentFrequency.toFixed(1), unit: '/day', icon: Rocket, ...classifyDORA('deploymentFrequency', doraData.deploymentFrequency) },
    { title: 'Lead Time', value: formatHours(doraData.leadTimeForChanges), unit: '', icon: Clock, ...classifyDORA('leadTimeForChanges', doraData.leadTimeForChanges) },
    { title: 'Failure Rate', value: `${doraData.changeFailureRate.toFixed(1)}%`, unit: '', icon: AlertCircle, ...classifyDORA('changeFailureRate', doraData.changeFailureRate) },
    { title: 'Restore Time', value: doraData.timeToRestore > 0 ? `${doraData.timeToRestore.toFixed(0)}m` : '—', unit: '', icon: RotateCcw, level: 'Elite', color: 'emerald' },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Engineering metrics and AI teammate activity.</p>
        </div>
        <TelemetryFilters />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSessions}</div>
            <p className="text-xs text-muted-foreground mt-1">{formatDuration(totalMinutes)} active time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">AI Code Ratio</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{aiRatio}%</div>
            <p className="text-xs text-muted-foreground mt-1">{totalAi.toLocaleString()} AI / {totalManual.toLocaleString()} manual</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Cycle Time</CardTitle>
            <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHours(avgCycleTime)}</div>
            <p className="text-xs text-muted-foreground mt-1">task start to finish</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Developers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{developerIds.size}</div>
            <p className="text-xs text-muted-foreground mt-1">with recorded sessions</p>
          </CardContent>
        </Card>
      </div>

      {!hasData && (
        <>
          {/* No data card */}
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Activity className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No data yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Start using Claude Code with Tandemu to see metrics here.</p>
            </CardContent>
          </Card>

          <InstallBanner />
        </>
      )}

      {hasData && (
        <>
          {/* Charts Row */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ActivityChart data={timesheetData} startDate={startDate} endDate={endDate} />
            <AIRatioChart data={aiData} />
          </div>

          {/* DORA */}
          {doraMetrics.length > 0 && (doraData?.deploymentFrequency ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Delivery Performance</CardTitle>
                <CardDescription>DORA metrics from task completions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {doraMetrics.map((m) => (
                    <div key={m.title} className="rounded-lg border border-[var(--border-subtle)] p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-muted-foreground">{m.title}</span>
                        <m.icon className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold">{m.value}</span>
                        {m.unit && <span className="text-xs text-muted-foreground">{m.unit}</span>}
                      </div>
                      <Badge variant="outline" className={`mt-1.5 text-xs ${badgeColor(m.color)}`}>{m.level}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
