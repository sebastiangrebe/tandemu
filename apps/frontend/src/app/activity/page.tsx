'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Calendar, TrendingUp } from "lucide-react";
import { getTimesheets, getDeveloperStats, getHotFiles, getAIEffectiveness, type TimesheetEntry, type DeveloperStat, type HotFile, type AIEffectivenessEntry } from '@/lib/api';
import { ActivityChart } from '@/components/charts/activity-chart';
import { DeveloperLeaderboard } from '@/components/charts/developer-leaderboard';
import { HotFilesChart } from '@/components/charts/hot-files-chart';
import { AIEffectivenessChart } from '@/components/charts/ai-effectiveness-chart';
import { TelemetryFilters, useFilterParams } from '@/components/filters/telemetry-filters';
import { ActivitySkeleton } from '@/components/ui/skeleton-helpers';
import { InstallBanner } from '@/components/install-banner';
import { FullscreenCard } from '@/components/ui/fullscreen-card';

function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ActivityPage() {
  const [data, setData] = useState<TimesheetEntry[]>([]);
  const [devStats, setDevStats] = useState<DeveloperStat[]>([]);
  const [hotFiles, setHotFiles] = useState<HotFile[]>([]);
  const [aiEffectiveness, setAiEffectiveness] = useState<AIEffectivenessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { startDate, endDate, teamId } = useFilterParams();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const f = { startDate, endDate, teamId };
    Promise.allSettled([
      getTimesheets(f),
      getDeveloperStats(f),
      getHotFiles(f),
      getAIEffectiveness(f),
    ])
      .then(([timesheets, devs, hot, aiEff]) => {
        if (cancelled) return;
        if (timesheets.status === 'fulfilled') setData(timesheets.value);
        if (devs.status === 'fulfilled') setDevStats(devs.value);
        if (hot.status === 'fulfilled') setHotFiles(hot.value);
        if (aiEff.status === 'fulfilled') setAiEffectiveness(aiEff.value);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [startDate, endDate, teamId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
            <p className="text-muted-foreground">Development sessions and time tracking.</p>
          </div>
          <TelemetryFilters />
        </div>
        <ActivitySkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
          <p className="text-muted-foreground">Development sessions and time tracking.</p>
        </div>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      </div>
    );
  }

  const hasData = data.length > 0;
  const totalMinutes = data.reduce((s, t) => s + t.activeMinutes, 0);
  const totalSessions = data.reduce((s, t) => s + t.sessions, 0);
  const uniqueDevs = new Set(data.map((e) => e.userId)).size;
  const avgPerDev = uniqueDevs > 0 ? Math.round(totalMinutes / uniqueDevs) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
          <p className="text-muted-foreground">Development sessions and time tracking.</p>
        </div>
        <TelemetryFilters />
      </div>

      {!hasData ? (
        <>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No session data recorded yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Session tracking data will appear as developers use Claude Code.
              </p>
            </CardContent>
          </Card>

          <InstallBanner />
        </>
      ) : (
        <>
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Active Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatDuration(totalMinutes)}</div>
                <p className="text-xs text-muted-foreground mt-1">this period</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalSessions}</div>
                <p className="text-xs text-muted-foreground mt-1">task completions</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg per Developer</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatDuration(avgPerDev)}</div>
                <p className="text-xs text-muted-foreground mt-1">average active time</p>
              </CardContent>
            </Card>
          </div>

          <ActivityChart data={data} startDate={startDate} endDate={endDate} height={280} />

          <DeveloperLeaderboard data={devStats} />

          <FullscreenCard>
            <HotFilesChart data={hotFiles} />
          </FullscreenCard>
          <FullscreenCard>
            <AIEffectivenessChart data={aiEffectiveness} />
          </FullscreenCard>
        </>
      )}
    </div>
  );
}
