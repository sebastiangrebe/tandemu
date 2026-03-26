'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Brain, Users, Code2, Timer, Wrench } from "lucide-react";
import { getAIRatio, getTimesheets, getToolUsage, getDeveloperStats, getTaskVelocity } from '@/lib/api';
import type { TimesheetEntry, ToolUsageStat, DeveloperStat, TaskVelocityEntry } from '@/lib/api';
import type { AIvsManualRatio } from '@tandemu/types';
import { InstallBanner } from '@/components/install-banner';
import { BillingBanner } from '@/components/billing-banner';
import { ActivityChart } from '@/components/charts/activity-chart';
import { AIRatioChart } from '@/components/charts/ai-ratio-chart';
import { ToolUsageChart } from '@/components/charts/tool-usage-chart';
import { DeveloperLeaderboard } from '@/components/charts/developer-leaderboard';
import { VelocityChart } from '@/components/charts/velocity-chart';
import { TelemetryFilters, useFilterParams } from '@/components/filters/telemetry-filters';
import { DashboardSkeleton } from '@/components/ui/skeleton-helpers';

function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}


export default function DashboardPage() {
  const [aiData, setAiData] = useState<AIvsManualRatio[]>([]);
  const [timesheetData, setTimesheetData] = useState<TimesheetEntry[]>([]);
  const [toolData, setToolData] = useState<ToolUsageStat[]>([]);
  const [devStats, setDevStats] = useState<DeveloperStat[]>([]);
  const [velocityData, setVelocityData] = useState<TaskVelocityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { startDate, endDate } = useFilterParams();

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const f = { startDate, endDate };
        const [ai, timesheets, tools, devs, velocity] = await Promise.allSettled([
          getAIRatio(f), getTimesheets(f), getToolUsage(), getDeveloperStats(f), getTaskVelocity(f),
        ]);
        if (cancelled) return;
        if (ai.status === 'fulfilled') setAiData(ai.value);
        if (timesheets.status === 'fulfilled') setTimesheetData(timesheets.value);
        if (tools.status === 'fulfilled') setToolData(tools.value);
        if (devs.status === 'fulfilled') setDevStats(devs.value);
        if (velocity.status === 'fulfilled') setVelocityData(velocity.value);
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
  const avgSessionDuration = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;
  const totalToolCalls = toolData.reduce((s, t) => s + t.totalCalls, 0);
  const overallToolSuccess = totalToolCalls > 0
    ? Math.round(toolData.reduce((s, t) => s + t.successCount, 0) / totalToolCalls * 100)
    : 0;
  const hasData = totalSessions > 0 || totalLines > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Engineering metrics and AI teammate activity.</p>
        </div>
        <TelemetryFilters />
      </div>

      <BillingBanner />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
            <p className="text-xs text-muted-foreground mt-1">{totalAi.toLocaleString()} AI / {totalManual.toLocaleString()} manual lines</p>
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Lines of Code</CardTitle>
            <Code2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLines.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">across all sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Session Duration</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(avgSessionDuration)}</div>
            <p className="text-xs text-muted-foreground mt-1">per task completion</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tool Success Rate</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalToolCalls > 0 ? `${overallToolSuccess}%` : '—'}</div>
            <p className="text-xs text-muted-foreground mt-1">{totalToolCalls.toLocaleString()} total tool calls</p>
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

          {/* Tool Usage + Developer Activity Row */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ToolUsageChart data={toolData} />
            <DeveloperLeaderboard data={devStats} />
          </div>

          {/* Velocity */}
          <VelocityChart data={velocityData} />
        </>
      )}
    </div>
  );
}
