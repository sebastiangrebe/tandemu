'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Trash2, CheckCircle, ChevronRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  getMemoryUsageInsights,
  type UsageInsightsResponse,
} from '@/lib/api';
import { DeleteMemoryDialog } from '@/components/memory/delete-memory-dialog';

const CATEGORY_COLORS: Record<string, string> = {
  architecture: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  pattern: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  gotcha: 'bg-red-500/10 text-red-400 border-red-500/30',
  preference: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  style: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  dependency: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  decision: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  uncategorized: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
};

const CATEGORY_ACCENT: Record<string, string> = {
  architecture: 'border-l-blue-500',
  pattern: 'border-l-purple-500',
  gotcha: 'border-l-red-500',
  preference: 'border-l-emerald-500',
  style: 'border-l-cyan-500',
  dependency: 'border-l-orange-500',
  decision: 'border-l-yellow-500',
  uncategorized: 'border-l-zinc-500',
};

function getCategoryColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.uncategorized;
}

function getCategoryAccent(cat: string) {
  return CATEGORY_ACCENT[cat] ?? CATEGORY_ACCENT.uncategorized;
}

function InsightCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-3 w-44 mt-1" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-1.5 w-4/5 rounded-full" />
      </CardContent>
    </Card>
  );
}

export function MemoryInsights() {
  const [usageInsights, setUsageInsights] = useState<UsageInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCleanupSheet, setShowCleanupSheet] = useState(false);
  const [deleteMemoryId, setDeleteMemoryId] = useState<string | null>(null);

  useEffect(() => {
    getMemoryUsageInsights('all', 30)
      .then(setUsageInsights)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map((i) => <InsightCardSkeleton key={i} />)}
      </div>
    );
  }

  const hasTopUsed = usageInsights && usageInsights.topUsed.length > 0;
  const hasCleanup = usageInsights && (usageInsights.leastUsed.length > 0 || usageInsights.neverAccessedCount > 0);

  if (!hasTopUsed && !hasCleanup) return null;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Most Used */}
        {hasTopUsed && usageInsights && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Most Referenced
              </CardTitle>
              <CardDescription className="text-xs">Knowledge your AI teammate relies on most.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {usageInsights.topUsed.slice(0, 4).map((u, i) => (
                  <div key={u.memoryId} className="flex items-start gap-2.5">
                    <span className="text-xs font-medium text-muted-foreground mt-0.5 w-4 shrink-0 tabular-nums">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="line-clamp-1 text-xs">{u.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500/60 rounded-full"
                            style={{ width: `${Math.min(100, (u.accessCount / Math.max(...usageInsights.topUsed.map(t => t.accessCount))) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{u.accessCount}x</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cleanup Candidates */}
        {hasCleanup && usageInsights && (
          <Card className={`border-orange-500/20${!hasTopUsed ? ' md:col-span-2' : ''}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-orange-400" />
                Cleanup Candidates
                {usageInsights.neverAccessedCount > 0 && (
                  <Badge variant="outline" className="text-[10px] h-4 text-orange-400 border-orange-500/30">{usageInsights.neverAccessedCount}</Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">Memories never accessed by the AI.</CardDescription>
              <CardAction>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowCleanupSheet(true)}
                >
                  Review
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(usageInsights.neverAccessed ?? usageInsights.leastUsed).slice(0, 3).map((u) => {
                  const cat = (u as unknown as { metadata?: { category?: string } }).metadata?.category ?? 'uncategorized';
                  return (
                    <div key={u.memoryId} className={`rounded border border-l-[3px] ${getCategoryAccent(cat)} px-2.5 py-1.5`}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Badge variant="outline" className={`text-[10px] h-4 ${getCategoryColor(cat)}`}>{cat}</Badge>
                      </div>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{u.content}</p>
                    </div>
                  );
                })}
                {usageInsights.neverAccessedCount > 3 && (
                  <p className="text-xs text-orange-400">+{usageInsights.neverAccessedCount - 3} more</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cleanup review sheet */}
      <Sheet open={showCleanupSheet} onOpenChange={setShowCleanupSheet}>
        <SheetContent side="right" className="sm:!max-w-xl flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-orange-400" />
              Unused Memories
              {usageInsights && usageInsights.neverAccessedCount > 0 && (
                <Badge variant="outline" className="text-xs text-orange-400 border-orange-500/30">{usageInsights.neverAccessedCount}</Badge>
              )}
            </SheetTitle>
            <SheetDescription>
              These memories have never been accessed by your AI teammate. Review and remove any that are no longer relevant.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-2 overflow-y-auto flex-1 px-4 pb-4">
            {(usageInsights?.neverAccessed ?? []).map((u) => {
              const cat = (u as unknown as { metadata?: { category?: string } }).metadata?.category ?? 'uncategorized';
              return (
                <div key={u.memoryId} className={`flex items-start gap-3 rounded-lg border border-l-[3px] ${getCategoryAccent(cat)} p-3`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Badge variant="outline" className={`text-[10px] ${getCategoryColor(cat)}`}>{cat}</Badge>
                    </div>
                    <p className="text-sm">{u.content}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs"
                    onClick={() => setDeleteMemoryId(u.memoryId)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              );
            })}
            {(usageInsights?.neverAccessed ?? []).length === 0 && (
              <div className="flex flex-col items-center justify-center py-8">
                <CheckCircle className="h-8 w-8 text-emerald-400 mb-2" />
                <p className="text-sm font-medium">All clean!</p>
                <p className="text-xs text-muted-foreground">No unused memories found.</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {deleteMemoryId && (
        <DeleteMemoryDialog
          open={!!deleteMemoryId}
          onOpenChange={(open) => !open && setDeleteMemoryId(null)}
          memoryId={deleteMemoryId}
          onDeleted={() => {
            setDeleteMemoryId(null);
            getMemoryUsageInsights('all', 30).then(setUsageInsights).catch(() => {});
          }}
        />
      )}
    </>
  );
}
