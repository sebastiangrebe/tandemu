'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Brain } from "lucide-react";
import { getAIRatio } from '@/lib/api';
import type { AIvsManualRatio } from '@tandem/types';

const COLORS = ["#6366f1", "#334155"];

export default function AIInsightsPage() {
  const [data, setData] = useState<AIvsManualRatio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getAIRatio()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load AI insights'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Insights</h1>
          <p className="text-muted-foreground">AI vs Manual code generation ratios across your organization.</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Insights</h1>
          <p className="text-muted-foreground">AI vs Manual code generation ratios across your organization.</p>
        </div>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  const hasData = data.length > 0;
  const totalAiLines = data.reduce((s, r) => s + r.aiGeneratedLines, 0);
  const totalManualLines = data.reduce((s, r) => s + r.manualLines, 0);

  const pieData = hasData
    ? [
        { name: "AI Generated", value: totalAiLines },
        { name: "Manual", value: totalManualLines },
      ]
    : [];

  const trendData = data.map((r) => ({
    period: new Date(r.periodStart).toLocaleDateString('en-US', { month: 'short' }),
    ratio: Math.round(r.ratio * 1000) / 10,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Insights</h1>
        <p className="text-muted-foreground">AI vs Manual code generation ratios across your organization.</p>
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No AI usage data yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Configure Claude Code telemetry to see insights.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>AI vs Manual Code Ratio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "8px" }}
                        labelStyle={{ color: "#999" }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {trendData.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>AI Ratio Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="period" stroke="#666" fontSize={12} />
                        <YAxis stroke="#666" fontSize={12} unit="%" />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "8px" }}
                          labelStyle={{ color: "#999" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="ratio"
                          stroke="#6366f1"
                          strokeWidth={2}
                          dot={{ fill: "#6366f1", r: 4 }}
                          name="AI Ratio %"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
