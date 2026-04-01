'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { AXIS_TICK, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE } from '@/lib/chart-theme';

const CATEGORY_HEX: Record<string, string> = {
  architecture: '#3b82f6',
  pattern: '#a855f7',
  gotcha: '#ef4444',
  preference: '#10b981',
  style: '#06b6d4',
  dependency: '#f97316',
  decision: '#eab308',
  uncategorized: '#71717a',
};

const CATEGORY_LABELS: Record<string, string> = {
  architecture: 'Architecture',
  pattern: 'Patterns',
  gotcha: 'Gotchas',
  preference: 'Preferences',
  style: 'Style',
  dependency: 'Dependencies',
  decision: 'Decisions',
  uncategorized: 'Other',
};

interface MemoryCategoryChartProps {
  categories: Record<string, number>;
}

export function MemoryCategoryChart({ categories }: MemoryCategoryChartProps) {
  const chartData = Object.entries(categories)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, count]) => ({
      name: CATEGORY_LABELS[cat] ?? cat,
      count,
      color: CATEGORY_HEX[cat] ?? '#71717a',
    }));

  if (chartData.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Memory Categories</CardTitle>
        <CardDescription>Knowledge distribution by type</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
