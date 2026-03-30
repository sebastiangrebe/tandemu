'use client';

import { useEffect, useState, createContext, useContext } from 'react';
import { MemoryStats } from '@/components/memory/memory-stats';
import { MemoryCharts } from '@/components/memory/memory-charts';
import { MemoryInsights } from '@/components/memory/memory-insights';
import { MemoryBrowser } from '@/components/memory/memory-browser';
import { KnowledgeGaps } from '@/components/memory/knowledge-gaps';
import { getMemoryStats, type MemoryStatsResponse } from '@/lib/api';

interface MemoryStatsContextValue {
  stats: MemoryStatsResponse | null;
  loading: boolean;
}

const MemoryStatsContext = createContext<MemoryStatsContextValue>({ stats: null, loading: true });

export function useMemoryStats() {
  return useContext(MemoryStatsContext);
}

export default function MemoryPage() {
  const [stats, setStats] = useState<MemoryStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMemoryStats().then(setStats).finally(() => setLoading(false));
  }, []);

  return (
    <MemoryStatsContext.Provider value={{ stats, loading }}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Memory</h1>
          <p className="text-muted-foreground">Your AI teammate&apos;s persistent knowledge base.</p>
        </div>

        <MemoryStats />
        <MemoryCharts />
        <MemoryInsights />
        <MemoryBrowser />
        <KnowledgeGaps />
      </div>
    </MemoryStatsContext.Provider>
  );
}
