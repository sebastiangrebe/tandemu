'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle, Search, ChevronRight, ChevronDown,
  FolderOpen, FileCode,
} from 'lucide-react';
import { getMemoryGaps, type GapEntry } from '@/lib/api';

interface GapFolder {
  name: string;
  items: GapEntry[];
  totalChanges: number;
}

function groupByFolder(items: GapEntry[]): GapFolder[] {
  const map = new Map<string, GapEntry[]>();
  for (const item of items) {
    // Group by first path segment (e.g., "apps" from "apps/backend")
    const firstSlash = item.filePath.indexOf('/');
    const folder = firstSlash > 0 ? item.filePath.slice(0, firstSlash) : '';
    const existing = map.get(folder) ?? [];
    existing.push(item);
    map.set(folder, existing);
  }
  return Array.from(map.entries())
    .map(([name, folderItems]) => ({
      name: name || 'root',
      items: folderItems.sort((a, b) => b.changeCount - a.changeCount),
      totalChanges: folderItems.reduce((s, i) => s + i.changeCount, 0),
    }))
    .sort((a, b) => b.totalChanges - a.totalChanges);
}

function FolderRow({ folder, maxChanges }: { folder: GapFolder; maxChanges: number }) {
  const [expanded, setExpanded] = useState(folder.totalChanges === maxChanges);

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-accent/50 transition-colors text-left"
      >
        {expanded
          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium text-sm flex-1 truncate">{folder.name}</span>
        <span className="text-xs text-muted-foreground mr-2">
          {folder.items.length} path{folder.items.length !== 1 ? 's' : ''}
        </span>
        <div className="w-24 shrink-0">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${Math.min(100, (folder.totalChanges / maxChanges) * 100)}%` }}
            />
          </div>
        </div>
        <span className="text-xs font-mono tabular-nums w-8 text-right text-amber-400">
          {folder.totalChanges}
        </span>
      </button>
      {expanded && (
        <div className="pb-1">
          {folder.items.map((item) => (
            <div
              key={item.filePath}
              className="flex items-center gap-3 px-4 pl-12 py-2 hover:bg-accent/30 transition-colors group"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <FileCode className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-sm font-mono truncate flex-1 text-muted-foreground group-hover:text-foreground transition-colors">
                {item.filePath}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                <span className="text-amber-400 font-medium">{item.changeCount}</span> changes
              </span>
              <div className="w-16 shrink-0">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500/60"
                    style={{ width: `${(item.changeCount / maxChanges) * 100}%` }}
                  />
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-400 border-amber-500/20">
                {item.memoryCount} memories
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function KnowledgeGaps() {
  const [gaps, setGaps] = useState<GapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getMemoryGaps()
      .then((r) => setGaps(r.gaps))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return gaps;
    const q = search.toLowerCase();
    return gaps.filter((g) => g.filePath.toLowerCase().includes(q));
  }, [gaps, search]);

  const folders = useMemo(() => groupByFolder(filtered), [filtered]);
  const maxChanges = useMemo(() => Math.max(1, ...gaps.map((g) => g.changeCount)), [gaps]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-64 mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (gaps.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Knowledge Gaps
              <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">
                {gaps.length}
              </Badge>
            </CardTitle>
            <CardDescription>Hot areas with frequent changes but no documented knowledge.</CardDescription>
          </div>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search paths..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {folders.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No matching paths found.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {folders.map((folder) => (
              <FolderRow key={folder.name} folder={folder} maxChanges={maxChanges} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
