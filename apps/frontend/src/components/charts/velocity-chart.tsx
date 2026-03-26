'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

interface VelocityEntry {
  week: string;
  avgDurationHours: number;
  taskCount: number;
}

interface VelocityChartProps {
  data: VelocityEntry[];
}

export function VelocityChart({ data }: VelocityChartProps) {
  const chartData = data.map((d) => ({
    week: new Date(d.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    hours: d.avgDurationHours,
    tasks: d.taskCount,
  }));

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Task Velocity</CardTitle>
          <CardDescription>Average task duration trend by week</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No velocity data yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Task Velocity</CardTitle>
        <CardDescription>Average task duration trend by week</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: '12px', fontSize: '12px' }}
              labelStyle={{ color: '#a1a1aa' }}
              formatter={(value: number, name: string) => [
                name === 'hours' ? `${value}h avg` : `${value} tasks`,
                name === 'hours' ? 'Avg Duration' : 'Tasks',
              ]}
            />
            <Line type="monotone" dataKey="hours" name="hours" stroke="#4ade80" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="tasks" name="tasks" stroke="#71717a" strokeWidth={1} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
