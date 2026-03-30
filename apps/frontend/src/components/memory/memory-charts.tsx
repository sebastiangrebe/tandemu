'use client';

import { MemoryCategoryChart } from '@/components/charts/memory-category-chart';
import { MemoryHealthChart } from '@/components/charts/memory-health-chart';
import { ChartSkeleton } from '@/components/ui/skeleton-helpers';
import { useMemoryStats } from '@/app/memory/page';

export function MemoryCharts() {
  const { stats, loading } = useMemoryStats();

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton height={160} />
      </div>
    );
  }

  if (!stats || Object.keys(stats.categories).length === 0) return null;

  const accessedCount = stats.total - stats.neverAccessedCount;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <MemoryCategoryChart categories={stats.categories} />
      <MemoryHealthChart
        totalMemories={stats.total}
        accessedCount={accessedCount}
        neverAccessedCount={stats.neverAccessedCount}
      />
    </div>
  );
}
