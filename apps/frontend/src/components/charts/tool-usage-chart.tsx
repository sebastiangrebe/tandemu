'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { ToolUsageStat } from '@/lib/api';

interface ToolUsageChartProps {
  data: ToolUsageStat[];
}

function getBarColor(successRate: number): string {
  if (successRate >= 90) return '#4ade80';
  if (successRate >= 70) return '#facc15';
  return '#f87171';
}

export function ToolUsageChart({ data }: ToolUsageChartProps) {
  const chartData = data
    .slice(0, 10)
    .map((t) => ({
      name: t.toolName.replace(/^mcp__.*?__/, '').replace(/_/g, ' '),
      calls: t.totalCalls,
      successRate: t.successRate,
    }));

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tool Usage</CardTitle>
          <CardDescription>Most used tools and success rates</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No tool usage data yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tool Usage</CardTitle>
        <CardDescription>Top 10 tools by call count</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
            <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--tt)' }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: 'var(--tt)' }}
              axisLine={false}
              tickLine={false}
              width={100}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: '12px', fontSize: '12px' }}
              labelStyle={{ color: 'var(--ts)' }}
              formatter={(value: number, _name: string, props: { payload?: { successRate: number } }) => [
                `${value.toLocaleString()} calls (${props.payload?.successRate ?? 0}% success)`,
                'Usage',
              ]}
            />
            <Bar dataKey="calls" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={getBarColor(entry.successRate)} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
