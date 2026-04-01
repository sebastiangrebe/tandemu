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
  input: '#818cf8',           // indigo-400
  output: '#f472b6',          // pink-400
  cacheRead: '#34d399',       // emerald-400
  cacheCreation: '#a78bfa',   // violet-400
  cache_read: '#34d399',      // alias
  cache_creation: '#a78bfa',  // alias
};

const TOKEN_LABELS: Record<string, string> = {
  input: 'Input',
  output: 'Output',
  cacheRead: 'Cache Read',
  cacheCreation: 'Cache Creation',
  cache_read: 'Cache Read',
  cache_creation: 'Cache Creation',
};

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

function shortenModel(model: string): string {
  // Shorten long model IDs for better readability
  return model
    .replace('claude-', '')
    .replace('-20251001', '')
    .replace('-20250514', '');
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
  return (
    <div style={TOOLTIP_CONTENT_STYLE} className="px-3 py-2.5 shadow-lg">
      <p className="text-xs font-medium mb-1.5" style={TOOLTIP_LABEL_STYLE}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 text-xs py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} />
            <span style={TOOLTIP_ITEM_STYLE}>{TOKEN_LABELS[p.dataKey] ?? p.dataKey}</span>
          </span>
          <span className="font-mono tabular-nums" style={TOOLTIP_ITEM_STYLE}>
            {formatTokens(p.value)}
          </span>
        </div>
      ))}
      <div className="border-t border-border/50 mt-1.5 pt-1.5 flex items-center justify-between text-xs">
        <span style={TOOLTIP_ITEM_STYLE} className="font-medium">Total</span>
        <span className="font-mono tabular-nums font-medium" style={TOOLTIP_ITEM_STYLE}>
          {formatTokens(total)}
        </span>
      </div>
    </div>
  );
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
              tickFormatter={shortenModel}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'var(--accent)', opacity: 0.3 }}
            />
            <Legend
              wrapperStyle={LEGEND_STYLE}
              formatter={(value: string) => TOKEN_LABELS[value] ?? value}
            />
            {tokenTypes.map((type, i) => (
              <Bar
                key={type}
                dataKey={type}
                stackId="tokens"
                fill={TOKEN_COLORS[type] ?? '#94a3b8'}
                fillOpacity={0.85}
                radius={i === tokenTypes.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
                name={type}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
