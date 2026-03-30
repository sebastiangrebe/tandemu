'use client';

import { Card, CardContent } from '@/components/ui/card';
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
    {
      label: 'Total Memories',
      value: stats.total,
      sub: `across ${Object.keys(stats.categories).length} categories`,
      icon: Brain,
      gradient: 'from-violet-500/10',
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-400',
      valueColor: 'text-violet-400',
    },
    {
      label: 'Personal',
      value: stats.personal,
      sub: 'coding style, preferences, DNA',
      icon: User,
      gradient: 'from-blue-500/10',
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-400',
      valueColor: 'text-blue-400',
    },
    {
      label: 'Organization',
      value: stats.org,
      sub: 'architecture, decisions, patterns',
      icon: Building2,
      gradient: 'from-emerald-500/10',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-400',
      valueColor: 'text-emerald-400',
    },
    {
      label: 'Memory Health',
      value: stats.total > 0 ? `${healthPct}%` : '—',
      sub: 'actively used by AI',
      icon: Activity,
      gradient: 'from-amber-500/10',
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-400',
      valueColor: 'text-amber-400',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label} className="relative overflow-hidden">
            <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} to-transparent`} />
            <CardContent className="relative pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                  <p className={`text-3xl font-bold ${card.valueColor} mt-1`}>{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                </div>
                <div className={`h-10 w-10 rounded-lg ${card.iconBg} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
