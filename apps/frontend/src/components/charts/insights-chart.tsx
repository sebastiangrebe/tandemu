'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { InsightsDaily } from '@/lib/api';

interface ThroughputChartProps {
  data: InsightsDaily[];
}

export function ThroughputChart({ data }: ThroughputChartProps) {
  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    aiLines: d.aiLines,
    manualLines: d.manualLines,
  }));

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Code Throughput</CardTitle>
          <CardDescription>AI-generated vs manually-written lines over time</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No data yet — complete tasks with /finish to see throughput</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Code Throughput</CardTitle>
        <CardDescription>AI-generated vs manually-written lines over time</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorAILines" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorManualLines" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a1a1aa" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#a1a1aa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} width={50} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: '12px', fontSize: '12px' }}
              labelStyle={{ color: '#a1a1aa' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Area type="monotone" dataKey="aiLines" name="AI Lines" stroke="#60a5fa" fill="url(#colorAILines)" strokeWidth={2} />
            <Area type="monotone" dataKey="manualLines" name="Manual Lines" stroke="#a1a1aa" fill="url(#colorManualLines)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface CostEfficiencyChartProps {
  data: InsightsDaily[];
}

export function CostEfficiencyChart({ data }: CostEfficiencyChartProps) {
  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    cost: d.aiCost,
    costPerLine: d.aiLines > 0 ? Math.round((d.aiCost / d.aiLines) * 10000) / 10000 : 0,
  }));

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cost Efficiency</CardTitle>
          <CardDescription>Daily AI cost and cost per line trend</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No cost data yet — enable OTEL in Claude Code</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost Efficiency</CardTitle>
        <CardDescription>Daily AI cost and cost per line trend</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorCostEff" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} width={50} tickFormatter={(v: number) => `$${v}`} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: '12px', fontSize: '12px' }}
              labelStyle={{ color: '#a1a1aa' }}
              formatter={(value: number, name: string) => [
                name === 'cost' ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`,
                name === 'cost' ? 'Daily Cost' : 'Cost/Line',
              ]}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Area type="monotone" dataKey="cost" name="Daily Cost" stroke="#f87171" fill="url(#colorCostEff)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
