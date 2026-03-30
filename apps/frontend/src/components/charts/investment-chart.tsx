'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { InvestmentAllocation } from '@/lib/api';

interface InvestmentChartProps {
  data: InvestmentAllocation[];
}

const CATEGORY_COLORS: Record<string, string> = {
  feature: '#4ade80',
  bugfix: '#f87171',
  tech_debt: '#facc15',
  maintenance: '#60a5fa',
  other: '#71717a',
};

const CATEGORY_LABELS: Record<string, string> = {
  feature: 'Features',
  bugfix: 'Bug Fixes',
  tech_debt: 'Tech Debt',
  maintenance: 'Maintenance',
  other: 'Other',
};

export function InvestmentChart({ data }: InvestmentChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Investment Allocation</CardTitle>
          <CardDescription>Where engineering time goes</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No task category data yet</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    name: CATEGORY_LABELS[d.category] ?? d.category,
    value: d.totalHours,
    tasks: d.taskCount,
    color: CATEGORY_COLORS[d.category] ?? '#71717a',
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Investment Allocation</CardTitle>
        <CardDescription>Where engineering time goes</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: '12px', fontSize: '12px' }}
              formatter={(value: number, _name: string, props: { payload?: { tasks: number } }) => [
                `${value}h (${props.payload?.tasks ?? 0} tasks)`,
                'Time',
              ]}
            />
            <Legend
              formatter={(value: string) => <span style={{ color: 'var(--ts)', fontSize: '12px' }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
