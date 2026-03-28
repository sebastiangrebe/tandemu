'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { TokenUsageEntry } from '@/lib/api';

interface TokenUsageChartProps {
  data: TokenUsageEntry[];
}

const TOKEN_COLORS: Record<string, string> = {
  input: '#60a5fa',
  output: '#f472b6',
  cache_read: '#4ade80',
  cache_creation: '#facc15',
};

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

export function TokenUsageChart({ data }: TokenUsageChartProps) {
  // Pivot: group by model, with tokenType as columns
  const byModel = new Map<string, Record<string, number>>();
  for (const entry of data) {
    const existing = byModel.get(entry.model) ?? {};
    existing[entry.tokenType] = (existing[entry.tokenType] ?? 0) + entry.totalTokens;
    byModel.set(entry.model, existing);
  }

  const tokenTypes = [...new Set(data.map((e) => e.tokenType))];
  const chartData = [...byModel.entries()]
    .map(([model, tokens]): Record<string, string | number> => ({ model, ...tokens }))
    .sort((a, b) => {
      const totalA = tokenTypes.reduce((s, t) => s + (Number(a[t]) || 0), 0);
      const totalB = tokenTypes.reduce((s, t) => s + (Number(b[t]) || 0), 0);
      return totalB - totalA;
    });

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Token Usage</CardTitle>
          <CardDescription>Token consumption by model</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No token usage data yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Token Usage</CardTitle>
        <CardDescription>Token consumption by model and type</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
            <XAxis
              type="number"
              tick={{ fontSize: 12, fill: '#71717a' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatTokens}
            />
            <YAxis
              type="category"
              dataKey="model"
              tick={{ fontSize: 11, fill: '#71717a' }}
              axisLine={false}
              tickLine={false}
              width={120}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: '12px', fontSize: '12px' }}
              labelStyle={{ color: '#a1a1aa' }}
              formatter={(value: number) => [formatTokens(value), undefined]}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            {tokenTypes.map((type) => (
              <Bar
                key={type}
                dataKey={type}
                stackId="tokens"
                fill={TOKEN_COLORS[type] ?? '#94a3b8'}
                fillOpacity={0.8}
                radius={[0, 0, 0, 0]}
                name={type.replace(/_/g, ' ')}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
