'use client';

import { MemoryStats } from '@/components/memory/memory-stats';
import { MemoryCharts } from '@/components/memory/memory-charts';
import { MemoryInsights } from '@/components/memory/memory-insights';
import { MemoryBrowser } from '@/components/memory/memory-browser';

export default function MemoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Memory</h1>
        <p className="text-muted-foreground">Your AI teammate&apos;s persistent knowledge base.</p>
      </div>

      <MemoryStats />
      <MemoryCharts />
      <MemoryInsights />
      <MemoryBrowser />
    </div>
  );
}
