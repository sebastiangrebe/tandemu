'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Rocket, Clock, AlertCircle, RotateCcw, BarChart3 } from "lucide-react";
import { getDORAMetrics } from '@/lib/api';
import type { DORAMetrics } from '@tandem/types';

function classifyLevel(metric: string, value: number): "Elite" | "High" | "Medium" | "Low" {
  switch (metric) {
    case "deploymentFrequency":
      if (value >= 1) return "Elite";
      if (value >= 0.14) return "High"; // weekly
      if (value >= 0.03) return "Medium"; // monthly
      return "Low";
    case "leadTimeForChanges":
      if (value < 1) return "Elite"; // < 1 hour
      if (value < 24) return "High"; // < 1 day
      if (value < 168) return "Medium"; // < 1 week
      return "Low";
    case "changeFailureRate":
      if (value <= 5) return "Elite";
      if (value <= 10) return "High";
      if (value <= 15) return "Medium";
      return "Low";
    case "timeToRestore":
      if (value < 60) return "Elite"; // < 1 hour
      if (value < 1440) return "High"; // < 1 day
      if (value < 10080) return "Medium"; // < 1 week
      return "Low";
    default:
      return "Low";
  }
}

function getLevelColor(level: string) {
  switch (level) {
    case "Elite":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "High":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "Medium":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    default:
      return "bg-red-500/20 text-red-400 border-red-500/30";
  }
}

export default function DORAMetricsPage() {
  const [data, setData] = useState<DORAMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getDORAMetrics()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load DORA metrics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">DORA Metrics</h1>
          <p className="text-muted-foreground">Track your team&apos;s software delivery performance with DORA metrics.</p>
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
          <h1 className="text-3xl font-bold tracking-tight">DORA Metrics</h1>
          <p className="text-muted-foreground">Track your team&apos;s software delivery performance with DORA metrics.</p>
        </div>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  const hasData = data && (
    data.deploymentFrequency > 0 ||
    data.leadTimeForChanges > 0 ||
    data.changeFailureRate > 0 ||
    data.timeToRestore > 0
  );

  const metrics = data
    ? [
        {
          title: "Deployment Frequency",
          value: data.deploymentFrequency.toFixed(1),
          unit: "per day",
          level: classifyLevel("deploymentFrequency", data.deploymentFrequency),
          icon: Rocket,
          description: "Frequency of production deployments",
        },
        {
          title: "Lead Time for Changes",
          value: data.leadTimeForChanges.toFixed(1),
          unit: "hours",
          level: classifyLevel("leadTimeForChanges", data.leadTimeForChanges),
          icon: Clock,
          description: "Time from commit to production",
        },
        {
          title: "Change Failure Rate",
          value: data.changeFailureRate.toFixed(1),
          unit: "%",
          level: classifyLevel("changeFailureRate", data.changeFailureRate),
          icon: AlertCircle,
          description: "Percentage of deployments causing failures",
        },
        {
          title: "Time to Restore",
          value: data.timeToRestore.toFixed(0),
          unit: "minutes",
          level: classifyLevel("timeToRestore", data.timeToRestore),
          icon: RotateCcw,
          description: "Time to recover from a production incident",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">DORA Metrics</h1>
        <p className="text-muted-foreground">Track your team&apos;s software delivery performance with DORA metrics.</p>
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No DORA metrics data yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Connect your CI/CD pipeline to start tracking deployment performance.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <Card key={metric.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{metric.title}</CardTitle>
                <metric.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{metric.value}</span>
                  <span className="text-sm text-muted-foreground">{metric.unit}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Badge className={getLevelColor(metric.level)} variant="outline">
                    {metric.level}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{metric.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
