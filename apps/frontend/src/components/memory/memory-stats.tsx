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
  const healthPct = stats.total > 0 ? Math.round((accessedCount / stats.total) * 100) : 0;

  const cards = [
    { label: 'Total Memories', value: stats.total, sub: `across ${Object.keys(stats.categories).length} categories`, icon: Brain },
    { label: 'Personal', value: stats.personal, sub: 'coding style, preferences, DNA', icon: User },
    { label: 'Organization', value: stats.org, sub: 'architecture, decisions, patterns', icon: Building2 },
    { label: 'Memory Health', value: stats.total > 0 ? `${healthPct}%` : '—', sub: 'actively used by AI', icon: Activity },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
