'use client';

import { useEffect, useState } from 'react';
import { getMemoryStats, getMemoryUsageInsights, type MemoryStatsResponse, type UsageInsightsResponse } from '@/lib/api';
import { MemoryCategoryChart } from '@/components/charts/memory-category-chart';
import { MemoryHealthChart } from '@/components/charts/memory-health-chart';
import { ChartSkeleton } from '@/components/ui/skeleton-helpers';

export function MemoryCharts() {
  const [stats, setStats] = useState<MemoryStatsResponse | null>(null);
  const [usageInsights, setUsageInsights] = useState<UsageInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      getMemoryStats().then(setStats),
      getMemoryUsageInsights('all', 30).then(setUsageInsights),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton height={160} />
      </div>
    );
  }

  if (!stats || Object.keys(stats.categories).length === 0) return null;

  const accessedCount = stats.total - (usageInsights?.neverAccessedCount ?? 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <MemoryCategoryChart categories={stats.categories} />
      {usageInsights && (
        <MemoryHealthChart
          totalMemories={stats.total}
          accessedCount={accessedCount}
          neverAccessedCount={usageInsights.neverAccessedCount}
        />
      )}
    </div>
  );
}
