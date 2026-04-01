'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Clock, Calendar, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { getTimesheets, getDeveloperStats, type TimesheetEntry, type DeveloperStat } from '@/lib/api';
import { ActivityChart } from '@/components/charts/activity-chart';
import { SessionTable } from '@/components/charts/session-table';
import { TelemetryFilters, useFilterParams } from '@/components/filters/telemetry-filters';

function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function DeveloperProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [sessions, setSessions] = useState<TimesheetEntry[]>([]);
  const [devStat, setDevStat] = useState<DeveloperStat | null>(null);
  const [loading, setLoading] = useState(true);
  const { startDate, endDate, teamId } = useFilterParams();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const f = { startDate, endDate, teamId };

    Promise.allSettled([
      getTimesheets({ ...f, userId: id }),
      getDeveloperStats(f),
    ])
      .then(([timesheets, devStats]) => {
        if (cancelled) return;
        if (timesheets.status === 'fulfilled') setSessions(timesheets.value);
        if (devStats.status === 'fulfilled') {
          const match = devStats.value.find((d) => d.userId === id);
          if (match) setDevStat(match);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [id, startDate, endDate, teamId]);

  const devName = devStat?.userName || sessions[0]?.userName || id.slice(0, 8);
  const totalMinutes = sessions.reduce((s, t) => s + t.activeMinutes, 0);
  const totalSessions = sessions.reduce((s, t) => s + t.sessions, 0);
  const totalLines = devStat ? devStat.aiLines + devStat.manualLines : 0;
  const aiPct = totalLines > 0 && devStat ? Math.round((devStat.aiLines / totalLines) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/activity" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Activity
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{loading ? 'Developer' : devName}</h1>
          <p className="text-muted-foreground">Session history and activity.</p>
        </div>
        <TelemetryFilters />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-6">
                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No session data for this developer</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatDuration(totalMinutes)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Sessions</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalSessions}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Lines</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalLines.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">AI Adoption</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{aiPct}%</div>
              </CardContent>
            </Card>
          </div>

          <ActivityChart data={sessions} startDate={startDate} endDate={endDate} height={250} />

          <SessionTable data={sessions} />
        </>
      )}
    </div>
  );
}
