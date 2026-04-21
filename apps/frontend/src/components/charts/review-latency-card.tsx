'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { AXIS_TICK, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE, LEGEND_STYLE } from '@/lib/chart-theme';
import type { ReviewLatencyMetrics, ReviewLatencyStat } from '@/lib/api';

const AI_COLOR = '#60a5fa';
const HUMAN_COLOR = '#a1a1aa';

interface ReviewLatencyCardProps {
  data: ReviewLatencyMetrics | null;
}

function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round(hours / 24 * 10) / 10}d`;
}

function fillWeeks(
  trend: ReadonlyArray<{ week: string; aiMedianHours: number | null; humanMedianHours: number | null }>,
  startDate?: string,
  endDate?: string,
): Array<{ label: string; ai: number | null; human: number | null }> {
  const byWeek = new Map(trend.map((t) => [t.week.slice(0, 10), t]));

  let cursor: Date;
  let end: Date;
  if (startDate && endDate) {
    cursor = new Date(startDate.slice(0, 10));
    end = new Date(endDate.slice(0, 10));
    // Snap to start of week (Sunday, matching ClickHouse toStartOfWeek default)
    cursor.setDate(cursor.getDate() - cursor.getDay());
  } else if (trend.length > 0) {
    cursor = new Date(trend[0]!.week.slice(0, 10));
    end = new Date(trend[trend.length - 1]!.week.slice(0, 10));
  } else {
    return [];
  }

  const result: Array<{ label: string; ai: number | null; human: number | null }> = [];
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const row = byWeek.get(key);
    result.push({
      label: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      ai: row?.aiMedianHours ?? null,
      human: row?.humanMedianHours ?? null,
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return result;
}

function SplitChart({
  title,
  stat,
  startDate,
  endDate,
}: {
  title: string;
  stat: ReviewLatencyStat;
  startDate?: string;
  endDate?: string;
}) {
  const data = fillWeeks(stat.splitByAI.trend, startDate, endDate);
  const tickInterval = Math.max(0, Math.ceil(data.length / 8) - 1);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </span>
        <span className="text-xs text-muted-foreground">
          median {formatDuration(stat.medianHours)} · p95 {formatDuration(stat.p95Hours)} · {stat.sampleCount} PRs
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#ffffff10" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={tickInterval} />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v: number) => formatDuration(v)}
          />
          <Tooltip
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            formatter={(value: number, name: string) => [formatDuration(value), name]}
          />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <Line type="monotone" dataKey="ai" name="AI PRs" stroke={AI_COLOR} strokeWidth={2} dot={{ r: 2 }} connectNulls />
          <Line type="monotone" dataKey="human" name="Human PRs" stroke={HUMAN_COLOR} strokeWidth={2} dot={{ r: 2 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function AIvsHumanSummary({ stat, label }: { stat: ReviewLatencyStat; label: string }) {
  const ai = stat.splitByAI.ai;
  const human = stat.splitByAI.human;
  if (!ai || !human || ai.sampleCount < 5 || human.sampleCount < 5) return null;

  const diff = human.medianHours - ai.medianHours;
  const pct = human.medianHours > 0 ? Math.abs(diff / human.medianHours) * 100 : 0;
  if (pct < 10) return null; // suppress noise
  const faster = diff > 0 ? 'AI' : 'Human';
  const direction = diff > 0 ? 'faster' : 'slower';

  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{label}:</span>{' '}
      {faster} PRs {direction} ({formatDuration(faster === 'AI' ? ai.medianHours : human.medianHours)} vs{' '}
      {formatDuration(faster === 'AI' ? human.medianHours : ai.medianHours)} — {Math.round(pct)}% {direction}).
    </p>
  );
}

export function ReviewLatencyCard({
  data,
  startDate,
  endDate,
}: ReviewLatencyCardProps & { startDate?: string; endDate?: string }) {
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review Latency</CardTitle>
          <CardDescription>How fast PRs get reviewed and merged</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  if (!data.githubConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review Latency</CardTitle>
          <CardDescription>How fast PRs get reviewed and merged</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">Connect GitHub to see review metrics</p>
        </CardContent>
      </Card>
    );
  }

  if (!data.githubReposMapped) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review Latency</CardTitle>
          <CardDescription>How fast PRs get reviewed and merged</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">
            Map a GitHub repository to a team in Settings → Integrations to enable review metrics
          </p>
        </CardContent>
      </Card>
    );
  }

  const { timeToFirstReview, timeToMerge, reviewerLoad } = data;

  if (!timeToFirstReview && !timeToMerge && reviewerLoad.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review Latency</CardTitle>
          <CardDescription>How fast PRs get reviewed and merged</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">
            Syncing review data — appears after the next GitHub sync completes
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Latency</CardTitle>
        <CardDescription>Time-to-first-review and time-to-merge, split by AI vs human PRs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {timeToFirstReview ? (
          <SplitChart title="Time to First Review" stat={timeToFirstReview} startDate={startDate} endDate={endDate} />
        ) : null}
        {timeToMerge ? (
          <SplitChart title="Time to Merge" stat={timeToMerge} startDate={startDate} endDate={endDate} />
        ) : null}

        {(timeToFirstReview || timeToMerge) ? (
          <div className="space-y-1 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
            {timeToFirstReview ? <AIvsHumanSummary stat={timeToFirstReview} label="Time to First Review" /> : null}
            {timeToMerge ? <AIvsHumanSummary stat={timeToMerge} label="Time to Merge" /> : null}
          </div>
        ) : null}

        {reviewerLoad.length > 0 ? (
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Reviewer Load
              </span>
              <span className="text-xs text-muted-foreground">Top {reviewerLoad.length}, by PRs reviewed</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Reviewer</th>
                    <th className="px-4 py-2 text-right font-medium">PRs Reviewed</th>
                    <th className="px-4 py-2 text-right font-medium">Median Turnaround</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewerLoad.map((r) => (
                    <tr key={r.reviewer} className="border-t border-border/40">
                      <td className="px-4 py-2">{r.reviewer}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.prsReviewed}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {formatDuration(r.medianTurnaroundHours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
