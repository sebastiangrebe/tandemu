'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { AXIS_TICK, AXIS_TICK_SM, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE, LEGEND_STYLE } from '@/lib/chart-theme';
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
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatTokens}
            />
            <YAxis
              type="category"
              dataKey="model"
              tick={AXIS_TICK_SM}
              axisLine={false}
              tickLine={false}
              width={120}
            />
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              formatter={(value: number) => [formatTokens(value), undefined]}
            />
            <Legend wrapperStyle={LEGEND_STYLE} />
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
