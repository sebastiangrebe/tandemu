'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { DeveloperStat } from '@/lib/api';

interface DeveloperLeaderboardProps {
  data: DeveloperStat[];
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function DeveloperLeaderboard({ data }: DeveloperLeaderboardProps) {
  const sorted = [...data].sort((a, b) => b.sessions - a.sessions);

  if (sorted.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Developer Activity</CardTitle>
          <CardDescription>Per-developer session and code metrics</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No developer data yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Developer Activity</CardTitle>
        <CardDescription>Per-developer session and code metrics</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Developer</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Active Time</TableHead>
              <TableHead className="text-right">AI Lines</TableHead>
              <TableHead className="text-right">Manual Lines</TableHead>
              <TableHead className="text-right">AI %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((dev) => {
              const total = dev.aiLines + dev.manualLines;
              const aiPct = total > 0 ? Math.round((dev.aiLines / total) * 100) : 0;
              return (
                <TableRow key={dev.userId}>
                  <TableCell className="font-medium">{dev.userName || dev.userId.slice(0, 8)}</TableCell>
                  <TableCell className="text-right">{dev.sessions}</TableCell>
                  <TableCell className="text-right">{formatDuration(dev.activeMinutes)}</TableCell>
                  <TableCell className="text-right">{dev.aiLines.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{dev.manualLines.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <span className={aiPct >= 50 ? 'text-emerald-400' : 'text-muted-foreground'}>
                      {aiPct}%
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
