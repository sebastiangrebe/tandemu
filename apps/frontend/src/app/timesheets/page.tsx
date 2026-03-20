'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar, TrendingUp } from "lucide-react";
import { getTimesheets, type TimesheetEntry } from '@/lib/api';

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function TimesheetsPage() {
  const [timesheetData, setTimesheetData] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getTimesheets()
      .then(setTimesheetData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load timesheets'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Timesheets</h1>
          <p className="text-muted-foreground">Passive time tracking based on coding sessions and IDE activity.</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Timesheets</h1>
          <p className="text-muted-foreground">Passive time tracking based on coding sessions and IDE activity.</p>
        </div>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  const hasData = timesheetData.length > 0;
  const totalMinutes = timesheetData.reduce((sum, e) => sum + e.activeMinutes, 0);
  const totalSessions = timesheetData.reduce((sum, e) => sum + e.sessions, 0);
  const uniqueDevs = new Set(timesheetData.map((e) => e.userId)).size;
  const avgPerDev = uniqueDevs > 0 ? Math.round(totalMinutes / uniqueDevs) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Timesheets</h1>
        <p className="text-muted-foreground">Passive time tracking based on coding sessions and IDE activity.</p>
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No session data recorded yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Session tracking data will appear as developers use Claude Code.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
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
                <p className="text-xs text-muted-foreground mt-1">coding sessions</p>
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

          <Card>
            <CardHeader>
              <CardTitle>Daily Entries</CardTitle>
              <CardDescription>Automatically tracked from IDE sessions and coding activity.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Developer</TableHead>
                    <TableHead className="text-right">Active Time</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Productivity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timesheetData.map((entry, i) => (
                    <TableRow key={`${entry.date}-${entry.userId}-${i}`}>
                      <TableCell className="font-mono text-sm">{formatDate(entry.date)}</TableCell>
                      <TableCell className="font-medium">{entry.userName}</TableCell>
                      <TableCell className="text-right">{formatDuration(entry.activeMinutes)}</TableCell>
                      <TableCell className="text-right">{entry.sessions}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={entry.activeMinutes > 400 ? "default" : entry.activeMinutes > 350 ? "secondary" : "outline"}>
                          {entry.activeMinutes > 400 ? "High" : entry.activeMinutes > 350 ? "Normal" : "Low"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
