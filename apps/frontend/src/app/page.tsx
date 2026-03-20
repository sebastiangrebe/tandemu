'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Brain, GitPullRequest, Users } from "lucide-react";
import { getAIRatio, getDORAMetrics, getTimesheets } from '@/lib/api';

interface DashboardStats {
  totalSessions: number;
  aiCodeRatio: number;
  avgCycleTime: number;
  activeDevelopers: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const [aiData, doraData, timesheetData] = await Promise.allSettled([
          getAIRatio(),
          getDORAMetrics(),
          getTimesheets(),
        ]);

        let totalSessions = 0;
        let aiCodeRatio = 0;
        let avgCycleTime = 0;
        const developerIds = new Set<string>();

        if (aiData.status === 'fulfilled' && aiData.value.length > 0) {
          const totalAi = aiData.value.reduce((s, r) => s + r.aiGeneratedLines, 0);
          const totalManual = aiData.value.reduce((s, r) => s + r.manualLines, 0);
          const total = totalAi + totalManual;
          aiCodeRatio = total > 0 ? Math.round((totalAi / total) * 1000) / 10 : 0;
        }

        if (doraData.status === 'fulfilled') {
          avgCycleTime = doraData.value.leadTimeForChanges || 0;
        }

        if (timesheetData.status === 'fulfilled') {
          totalSessions = timesheetData.value.reduce((s, t) => s + t.sessions, 0);
          timesheetData.value.forEach((t) => developerIds.add(t.userId));
        }

        setStats({
          totalSessions,
          aiCodeRatio,
          avgCycleTime,
          activeDevelopers: developerIds.size,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your engineering metrics and AI teammate activity.</p>
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
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your engineering metrics and AI teammate activity.</p>
        </div>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  const hasData = stats && (stats.totalSessions > 0 || stats.aiCodeRatio > 0 || stats.avgCycleTime > 0 || stats.activeDevelopers > 0);

  const statCards = [
    { title: "Total Sessions", value: stats?.totalSessions.toLocaleString() ?? "0", icon: Activity },
    { title: "AI Code Ratio", value: stats ? `${stats.aiCodeRatio}%` : "0%", icon: Brain },
    { title: "Avg Cycle Time", value: stats?.avgCycleTime ? `${stats.avgCycleTime}h` : "0h", icon: GitPullRequest },
    { title: "Active Developers", value: stats?.activeDevelopers.toString() ?? "0", icon: Users },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your engineering metrics and AI teammate activity.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!hasData && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No data yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Start using Claude Code with Tandem to see metrics here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
