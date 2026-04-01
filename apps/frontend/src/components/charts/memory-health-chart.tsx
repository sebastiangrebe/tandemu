'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface MemoryHealthChartProps {
  totalMemories: number;
  accessedCount: number;
  neverAccessedCount: number;
}

const COLORS = ['#4ade80', '#27272a'];

export function MemoryHealthChart({ totalMemories, accessedCount, neverAccessedCount }: MemoryHealthChartProps) {
  if (totalMemories === 0) return null;

  const healthPercent = Math.round((accessedCount / totalMemories) * 100);
  const pieData = [
    { name: 'Accessed', value: accessedCount },
    { name: 'Unused', value: neverAccessedCount },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Memory Coverage</CardTitle>
        <CardDescription>Memories actively used by your AI teammate</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-center">
        <div className="relative">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={3}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold">{healthPercent}%</span>
            <span className="text-xs text-muted-foreground">active</span>
          </div>
        </div>
        <div className="ml-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-[#4ade80]" />
            <span className="text-muted-foreground">{accessedCount} accessed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-[#27272a]" />
            <span className="text-muted-foreground">{neverAccessedCount} unused</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
