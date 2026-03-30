'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  PieChart, Pie, Cell,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE, LEGEND_STYLE } from '@/lib/chart-theme';
import type { AIvsManualRatio } from '@tandemu/types';

const AI_COLORS = ['#4ade80', '#27272a'];

interface AIRatioChartProps {
  data: AIvsManualRatio[];
}

export function AIRatioChart({ data }: AIRatioChartProps) {
  const totalAi = data.reduce((s, r) => s + r.aiGeneratedLines, 0);
  const totalManual = data.reduce((s, r) => s + r.manualLines, 0);
  const totalLines = totalAi + totalManual;

  if (totalLines === 0) return null;

  const pieData = [
    { name: 'AI Generated', value: totalAi },
    { name: 'Manual', value: totalManual },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI vs Manual Code</CardTitle>
        <CardDescription>{totalLines.toLocaleString()} total lines this period</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-center">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={AI_COLORS[i]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              formatter={(value: number) => value.toLocaleString()}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={LEGEND_STYLE} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
