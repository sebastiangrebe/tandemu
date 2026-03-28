'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, XCircle, FolderTree, Flame } from "lucide-react";
import { getFrictionHeatmap } from '@/lib/api';
import type { FrictionEvent } from '@tandemu/types';
import { TelemetryFilters, useFilterParams } from '@/components/filters/telemetry-filters';
import { FrictionSkeleton } from '@/components/ui/skeleton-helpers';
import { InstallBanner } from '@/components/install-banner';

interface FrictionItem {
  path: string;
  promptLoopCount: number;
  errorCount: number;
  sessions: number;
  severity: "low" | "medium" | "high";
}

function computeSeverity(promptLoopCount: number, errorCount: number): "low" | "medium" | "high" {
  const score = promptLoopCount + errorCount * 2;
  if (score >= 20) return "high";
  if (score >= 10) return "medium";
  return "low";
}

function aggregateFriction(events: FrictionEvent[]): FrictionItem[] {
  const map = new Map<string, { promptLoopCount: number; errorCount: number; sessions: Set<string> }>();
  for (const event of events) {
    const existing = map.get(event.repositoryPath);
    if (existing) {
      existing.promptLoopCount += event.promptLoopCount;
      existing.errorCount += event.errorCount;
      existing.sessions.add(event.sessionId);
    } else {
      map.set(event.repositoryPath, {
        promptLoopCount: event.promptLoopCount,
        errorCount: event.errorCount,
        sessions: new Set([event.sessionId]),
      });
    }
  }

  return Array.from(map.entries())
    .map(([path, data]) => ({
      path,
      promptLoopCount: data.promptLoopCount,
      errorCount: data.errorCount,
      sessions: data.sessions.size,
      severity: computeSeverity(data.promptLoopCount, data.errorCount),
    }))
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case "high":
      return "bg-red-500/10 border-red-500/30 text-red-400";
    case "medium":
      return "bg-yellow-500/10 border-yellow-500/30 text-yellow-400";
    default:
      return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
  }
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "high":
      return <XCircle className="h-4 w-4 text-red-400" />;
    case "medium":
      return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
    default:
      return <CheckCircle className="h-4 w-4 text-emerald-400" />;
  }
}

export default function FrictionMapPage() {
  const [frictionData, setFrictionData] = useState<FrictionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { startDate, endDate } = useFilterParams();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFrictionHeatmap({ startDate, endDate })
      .then((events) => { if (!cancelled) setFrictionData(aggregateFriction(events)); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load friction data'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Friction Map</h1>
            <p className="text-muted-foreground">Identify areas in your codebase where developers face the most friction.</p>
          </div>
          <TelemetryFilters />
        </div>
        <FrictionSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Friction Map</h1>
          <p className="text-muted-foreground">Identify areas in your codebase where developers face the most friction.</p>
        </div>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  const hasData = frictionData.length > 0;
  const highCount = frictionData.filter((f) => f.severity === "high").length;
  const mediumCount = frictionData.filter((f) => f.severity === "medium").length;
  const lowCount = frictionData.filter((f) => f.severity === "low").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Friction Map</h1>
          <p className="text-muted-foreground">Identify areas in your codebase where developers face the most friction.</p>
        </div>
        <TelemetryFilters />
      </div>

      {!hasData ? (
        <>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Flame className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-medium mb-1">No friction events detected yet</h3>
              <p className="text-sm text-muted-foreground text-center max-w-lg">
                Friction is detected automatically from Claude Code tool failures when OTEL telemetry is enabled.
                Enable it by setting <code className="text-xs bg-muted px-1.5 py-0.5 rounded">CLAUDE_CODE_ENABLE_TELEMETRY=1</code> and
                configuring <code className="text-xs bg-muted px-1.5 py-0.5 rounded">OTEL_EXPORTER_OTLP_ENDPOINT</code> in
                your Claude Code settings. Run <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/tandemu:setup</code> to configure this automatically.
              </p>
            </CardContent>
          </Card>

          <InstallBanner />
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-red-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">High Friction</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-400">{highCount}</div>
                <p className="text-xs text-muted-foreground mt-1">paths need attention</p>
              </CardContent>
            </Card>
            <Card className="border-yellow-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Medium Friction</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-400">{mediumCount}</div>
                <p className="text-xs text-muted-foreground mt-1">paths to monitor</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Low Friction</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-400">{lowCount}</div>
                <p className="text-xs text-muted-foreground mt-1">paths running smoothly</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FolderTree className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Repository Paths</CardTitle>
              </div>
              <CardDescription>Friction scores based on prompt loops, errors, and session frequency.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {frictionData.map((item) => (
                  <div
                    key={item.path}
                    className={`flex items-center justify-between rounded-lg border p-4 ${getSeverityColor(item.severity)}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {getSeverityIcon(item.severity)}
                      <code className="text-sm font-mono truncate">{item.path}</code>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 ml-4">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Prompt Loops</p>
                        <p className="text-sm font-semibold">{item.promptLoopCount}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Errors</p>
                        <p className="text-sm font-semibold">{item.errorCount}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Sessions</p>
                        <p className="text-sm font-semibold">{item.sessions}</p>
                      </div>
                      <Badge variant={item.severity === "high" ? "destructive" : item.severity === "medium" ? "secondary" : "outline"}>
                        {item.severity}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
