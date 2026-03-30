'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, User, Building2, Activity } from 'lucide-react';
import { CardSkeleton } from '@/components/ui/skeleton-helpers';
import { useMemoryStats } from '@/app/memory/page';

export function MemoryStats() {
  const { stats, loading } = useMemoryStats();

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => <CardSkeleton key={i} />)}
      </div>
    );
  }

  if (!stats) return null;

  const accessedCount = stats.total - stats.neverAccessedCount;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Memories</CardTitle>
          <Brain className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total}</div>
          <p className="text-xs text-muted-foreground mt-1">
            across {Object.keys(stats.categories).length} categories
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Personal</CardTitle>
          <User className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.personal}</div>
          <p className="text-xs text-muted-foreground mt-1">coding style, preferences, DNA</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Organization</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.org}</div>
          <p className="text-xs text-muted-foreground mt-1">architecture, decisions, patterns</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Memory Health</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.total > 0 ? `${Math.round((accessedCount / stats.total) * 100)}%` : '—'}
          </div>
          <p className="text-xs text-muted-foreground mt-1">actively used by AI</p>
        </CardContent>
      </Card>
    </div>
  );
}
