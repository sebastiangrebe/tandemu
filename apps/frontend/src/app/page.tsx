'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Brain, Users, Code2, Timer, Wrench } from "lucide-react";
import { getAIRatio, getTimesheets, getToolUsage, getTaskVelocity, getInvestmentAllocation } from '@/lib/api';
import type { TimesheetEntry, ToolUsageStat, TaskVelocityEntry, InvestmentAllocation } from '@/lib/api';
import type { AIvsManualRatio } from '@tandemu/types';
import { InstallBanner } from '@/components/install-banner';
import { BillingBanner } from '@/components/billing-banner';
import { AIRatioChart } from '@/components/charts/ai-ratio-chart';
import { ToolUsageChart } from '@/components/charts/tool-usage-chart';
import { VelocityChart } from '@/components/charts/velocity-chart';
import { InvestmentChart } from '@/components/charts/investment-chart';
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
  const [velocityData, setVelocityData] = useState<TaskVelocityEntry[]>([]);
  const [investment, setInvestment] = useState<InvestmentAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { startDate, endDate, teamId } = useFilterParams();

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const f = { startDate, endDate, teamId };
        const [ai, timesheets, tools, velocity, invest] = await Promise.allSettled([
          getAIRatio(f), getTimesheets(f), getToolUsage(f), getTaskVelocity(f),
          getInvestmentAllocation(f),
        ]);
        if (cancelled) return;
        if (ai.status === 'fulfilled') setAiData(ai.value);
        if (timesheets.status === 'fulfilled') setTimesheetData(timesheets.value);
        if (tools.status === 'fulfilled') setToolData(tools.value);
        if (velocity.status === 'fulfilled') setVelocityData(velocity.value);
        if (invest.status === 'fulfilled') setInvestment(invest.value);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
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
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-transparent" />
          <CardContent className="relative pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Sessions</p>
                <p className="text-3xl font-bold text-violet-400 mt-1">{totalSessions}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDuration(totalMinutes)} active time</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-violet-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent" />
          <CardContent className="relative pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">AI Code Ratio</p>
                <p className="text-3xl font-bold text-blue-400 mt-1">{aiRatio}%</p>
                <p className="text-xs text-muted-foreground mt-1">{totalAi.toLocaleString()} AI / {totalManual.toLocaleString()} manual</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Brain className="h-5 w-5 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent" />
          <CardContent className="relative pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Developers</p>
                <p className="text-3xl font-bold text-emerald-400 mt-1">{developerIds.size}</p>
                <p className="text-xs text-muted-foreground mt-1">with recorded sessions</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent" />
          <CardContent className="relative pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Lines of Code</p>
                <p className="text-3xl font-bold text-amber-400 mt-1">{totalLines.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">across all sessions</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Code2 className="h-5 w-5 text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-transparent" />
          <CardContent className="relative pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Cycle Time</p>
                <p className="text-3xl font-bold text-pink-400 mt-1">{formatDuration(avgSessionDuration)}</p>
                <p className="text-xs text-muted-foreground mt-1">per task completion</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
                <Timer className="h-5 w-5 text-pink-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent" />
          <CardContent className="relative pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tool Success Rate</p>
                <p className="text-3xl font-bold text-cyan-400 mt-1">{totalToolCalls > 0 ? `${overallToolSuccess}%` : '—'}</p>
                <p className="text-xs text-muted-foreground mt-1">{totalToolCalls.toLocaleString()} total tool calls</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Wrench className="h-5 w-5 text-cyan-400" />
              </div>
            </div>
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
            <AIRatioChart data={aiData} />
            <ToolUsageChart data={toolData} />
          </div>

          {/* Velocity + Investment Row */}
          <div className="grid gap-4 lg:grid-cols-2">
            <VelocityChart data={velocityData} />
            <InvestmentChart data={investment} />
          </div>
        </>
      )}
    </div>
  );
}
