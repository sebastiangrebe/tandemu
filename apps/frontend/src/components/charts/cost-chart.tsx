'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { CostEntry } from '@/lib/api';

interface CostChartProps {
  data: CostEntry[];
}

export function CostChart({ data }: CostChartProps) {
  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    cost: d.totalCost,
  }));

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Cost</CardTitle>
          <CardDescription>Daily Claude Code usage cost</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No cost data yet — enable OTEL in Claude Code</p>
        </CardContent>
      </Card>
    );
  }

  const totalCost = data.reduce((s, d) => s + d.totalCost, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>AI Cost</CardTitle>
            <CardDescription>Daily Claude Code usage cost</CardDescription>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold">${totalCost.toFixed(2)}</span>
            <p className="text-xs text-muted-foreground">total in period</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorCostGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--tt)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: 'var(--tt)' }} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => `$${v}`} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: '12px', fontSize: '12px' }}
              labelStyle={{ color: 'var(--ts)' }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
            />
            <Area type="monotone" dataKey="cost" stroke="#60a5fa" fill="url(#colorCostGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
      <CardFooter className="border-t px-6 py-3">
        <Link href="/insights" className="text-sm text-primary hover:underline">
          View Insights &rarr;
        </Link>
      </CardFooter>
    </Card>
  );
}
