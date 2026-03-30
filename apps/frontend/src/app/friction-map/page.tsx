'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, CheckCircle, XCircle, Flame, Search,
  ChevronRight, ChevronDown, FolderOpen, FileCode, BarChart3,
} from "lucide-react";
import { getFrictionHeatmap } from '@/lib/api';
import type { FrictionEvent } from '@tandemu/types';
import { TelemetryFilters, useFilterParams } from '@/components/filters/telemetry-filters';
import { FrictionSkeleton } from '@/components/ui/skeleton-helpers';
import { InstallBanner } from '@/components/install-banner';

interface FrictionItem {
  path: string;
  shortPath: string;
  repo: string;
  promptLoopCount: number;
  errorCount: number;
  sessions: number;
  score: number;
  severity: "low" | "medium" | "high";
}

interface FrictionFolder {
  name: string;
  items: FrictionItem[];
  totalScore: number;
  severity: "low" | "medium" | "high";
}

function computeScore(promptLoopCount: number, errorCount: number): number {
  return promptLoopCount + errorCount * 2;
}

function computeSeverity(score: number): "low" | "medium" | "high" {
  if (score >= 20) return "high";
  if (score >= 10) return "medium";
  return "low";
}

function aggregateFriction(events: FrictionEvent[]): FrictionItem[] {
  const key = (e: FrictionEvent) => `${e.repo}::${e.repositoryPath}`;
  const map = new Map<string, { repo: string; path: string; promptLoopCount: number; errorCount: number; sessions: Set<string> }>();
  for (const event of events) {
    const k = key(event);
    const existing = map.get(k);
    if (existing) {
      existing.promptLoopCount += event.promptLoopCount;
      existing.errorCount += event.errorCount;
      existing.sessions.add(event.sessionId);
    } else {
      map.set(k, {
        repo: event.repo,
        path: event.repositoryPath,
        promptLoopCount: event.promptLoopCount,
        errorCount: event.errorCount,
        sessions: new Set([event.sessionId]),
      });
    }
  }

  return Array.from(map.values())
    .map((data) => {
      const score = computeScore(data.promptLoopCount, data.errorCount);
      return {
        path: data.path,
        shortPath: data.path,
        repo: data.repo,
        promptLoopCount: data.promptLoopCount,
        errorCount: data.errorCount,
        sessions: data.sessions.size,
        score,
        severity: computeSeverity(score),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function groupByFolder(items: FrictionItem[]): FrictionFolder[] {
  const map = new Map<string, FrictionItem[]>();
  for (const item of items) {
    const existing = map.get(item.repo) ?? [];
    existing.push(item);
    map.set(item.repo, existing);
  }
  return Array.from(map.entries())
    .map(([name, folderItems]) => {
      const totalScore = folderItems.reduce((s, i) => s + i.score, 0);
      return {
        name: name || 'Uncategorized',
        items: folderItems.sort((a, b) => b.score - a.score),
        totalScore,
        severity: computeSeverity(totalScore / folderItems.length),
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);
}

const severityConfig = {
  high: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: XCircle, barColor: 'bg-red-500' },
  medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', icon: AlertTriangle, barColor: 'bg-yellow-500' },
  low: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle, barColor: 'bg-emerald-500' },
};

type SeverityFilter = 'all' | 'high' | 'medium' | 'low';

function FolderRow({ folder, maxScore }: { folder: FrictionFolder; maxScore: number }) {
  const [expanded, setExpanded] = useState(folder.severity === 'high' || folder.severity === 'medium');
  const config = severityConfig[folder.severity];

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-accent/50 transition-colors text-left"
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium text-sm flex-1 truncate">{folder.name}</span>
        <span className="text-xs text-muted-foreground mr-2">{folder.items.length} file{folder.items.length !== 1 ? 's' : ''}</span>
        <div className="w-24 shrink-0">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${config.barColor} transition-all`}
              style={{ width: `${Math.min(100, (folder.totalScore / maxScore) * 100)}%` }}
            />
          </div>
        </div>
        <span className={`text-xs font-mono tabular-nums w-8 text-right ${config.color}`}>
          {folder.totalScore}
        </span>
      </button>
      {expanded && (
        <div className="pb-1">
          {folder.items.map((item) => (
            <FileRow key={item.path} item={item} maxScore={maxScore} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileRow({ item, maxScore }: { item: FrictionItem; maxScore: number }) {
  const config = severityConfig[item.severity];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-3 px-4 pl-12 py-2 hover:bg-accent/30 transition-colors group">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${config.color}`} />
      <FileCode className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-sm font-mono truncate flex-1 text-muted-foreground group-hover:text-foreground transition-colors">
        {item.shortPath}
      </span>
      <div className="flex items-center gap-4 shrink-0 text-xs">
        {item.promptLoopCount > 0 && (
          <span className="text-muted-foreground">
            <span className="text-yellow-400 font-medium">{item.promptLoopCount}</span> loops
          </span>
        )}
        <span className="text-muted-foreground">
          <span className="text-red-400 font-medium">{item.errorCount}</span> errors
        </span>
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">{item.sessions}</span> sessions
        </span>
      </div>
      <div className="w-16 shrink-0">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${config.barColor} transition-all`}
            style={{ width: `${Math.min(100, (item.score / maxScore) * 100)}%` }}
          />
        </div>
      </div>
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color} ${config.border}`}>
        {item.score}
      </Badge>
    </div>
  );
}

export default function FrictionMapPage() {
  const [frictionData, setFrictionData] = useState<FrictionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [showCount, setShowCount] = useState(50);
  const { startDate, endDate, teamId } = useFilterParams();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFrictionHeatmap({ startDate, endDate, teamId })
      .then((events) => { if (!cancelled) setFrictionData(aggregateFriction(events)); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load friction data'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [startDate, endDate, teamId]);

  const filtered = useMemo(() => {
    let items = frictionData;
    if (severityFilter !== 'all') {
      items = items.filter((i) => i.severity === severityFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((i) => i.path.toLowerCase().includes(q) || i.repo.toLowerCase().includes(q));
    }
    return items;
  }, [frictionData, severityFilter, search]);

  const folders = useMemo(() => groupByFolder(filtered.slice(0, showCount)), [filtered, showCount]);
  const maxScore = useMemo(() => Math.max(1, ...frictionData.map((i) => i.score)), [frictionData]);

  const highCount = frictionData.filter((f) => f.severity === "high").length;
  const mediumCount = frictionData.filter((f) => f.severity === "medium").length;
  const lowCount = frictionData.filter((f) => f.severity === "low").length;
  const totalErrors = frictionData.reduce((s, f) => s + f.errorCount, 0);
  const totalLoops = frictionData.reduce((s, f) => s + f.promptLoopCount, 0);

  const header = (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Friction Map</h1>
        <p className="text-muted-foreground">Identify areas in your codebase where developers face the most friction.</p>
      </div>
      <TelemetryFilters />
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <FrictionSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  const hasData = frictionData.length > 0;

  return (
    <div className="space-y-6">
      {header}

      {!hasData ? (
        <>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Flame className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-medium mb-1">No friction events detected yet</h3>
              <p className="text-sm text-muted-foreground text-center max-w-lg">
                Friction is detected automatically from Claude Code tool failures.
                As developers use Claude Code with Tandemu connected, files where tools repeatedly fail will appear here.
              </p>
            </CardContent>
          </Card>
          <InstallBanner />
        </>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">High Friction</CardTitle>
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-400">{highCount}</div>
                <p className="text-xs text-muted-foreground mt-1">paths need attention</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Medium Friction</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-400">{mediumCount}</div>
                <p className="text-xs text-muted-foreground mt-1">paths to monitor</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Low Friction</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-400">{lowCount}</div>
                <p className="text-xs text-muted-foreground mt-1">paths running smoothly</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Events</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-violet-400">{totalErrors + totalLoops}</div>
                <p className="text-xs text-muted-foreground mt-1">{totalErrors} errors, {totalLoops} loops</p>
              </CardContent>
            </Card>
          </div>

          {/* File tree browser */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Friction by File</CardTitle>
                  <CardDescription>Files grouped by repository, sorted by friction score.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {(['all', 'high', 'medium', 'low'] as const).map((sev) => {
                    const isActive = severityFilter === sev;
                    const count = sev === 'all' ? frictionData.length : frictionData.filter((f) => f.severity === sev).length;
                    return (
                      <Button
                        key={sev}
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        className="text-xs h-7 px-2.5"
                        onClick={() => setSeverityFilter(sev)}
                      >
                        {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)}
                        <span className="ml-1 opacity-60">{count}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search files..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {folders.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  No matching files found.
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {folders.map((folder) => (
                    <FolderRow key={folder.name} folder={folder} maxScore={maxScore} />
                  ))}
                </div>
              )}
              {filtered.length > showCount && (
                <div className="flex items-center justify-center py-3 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCount((c) => c + 50)}
                  >
                    Show more ({filtered.length - showCount} remaining)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
