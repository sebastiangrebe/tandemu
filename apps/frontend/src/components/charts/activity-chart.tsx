'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AreaChart, Area, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { AXIS_TICK, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE } from '@/lib/chart-theme';
import type { TimesheetEntry } from '@/lib/api';

interface ActivityChartProps {
  data: TimesheetEntry[];
  startDate: string;
  endDate: string;
  height?: number;
}

function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  const last = new Date(end);
  while (current <= last) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export function ActivityChart({ data, startDate, endDate, height = 220 }: ActivityChartProps) {
  // Aggregate data by date
  const byDate = data.reduce<Record<string, { minutes: number; sessions: number }>>((acc, t) => {
    const d = t.date.split('T')[0];
    if (!acc[d]) acc[d] = { minutes: 0, sessions: 0 };
    acc[d].minutes += t.activeMinutes;
    acc[d].sessions += t.sessions;
    return acc;
  }, {});

  // Fill the full date range with zeros for days without data
  const allDates = generateDateRange(startDate, endDate);
  const chartData = allDates.map(d => ({
    date: new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    hours: byDate[d] ? Math.round(byDate[d].minutes / 6) / 10 : 0,
    sessions: byDate[d]?.sessions ?? 0,
  }));

  if (chartData.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Daily active hours and session count</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorHoursGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
            />
            <Area type="monotone" dataKey="hours" name="Hours" stroke="#4ade80" fill="url(#colorHoursGrad)" strokeWidth={2} />
            <Bar dataKey="sessions" name="Sessions" fill="#4ade80" opacity={0.3} radius={[2, 2, 0, 0]} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
