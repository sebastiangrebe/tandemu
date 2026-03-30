'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from 'next/link';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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

function getAdoptionTier(aiPct: number) {
  if (aiPct >= 70) return { label: 'Champion', color: '#4ade80', textClass: 'text-emerald-400', badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
  if (aiPct >= 25) return { label: 'Growing', color: '#facc15', textClass: 'text-yellow-400', badgeClass: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' };
  return { label: 'Getting Started', color: '#71717a', textClass: 'text-muted-foreground', badgeClass: 'bg-muted text-muted-foreground border-border' };
}

export function DeveloperLeaderboard({ data }: DeveloperLeaderboardProps) {
  const sorted = [...data].sort((a, b) => {
    const totalA = a.aiLines + a.manualLines;
    const totalB = b.aiLines + b.manualLines;
    const pctA = totalA > 0 ? a.aiLines / totalA : 0;
    const pctB = totalB > 0 ? b.aiLines / totalB : 0;
    if (pctB !== pctA) return pctB - pctA;
    return totalB - totalA;
  });

  if (sorted.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Adoption Leaderboard</CardTitle>
          <CardDescription>Developer AI usage ranked by adoption rate</CardDescription>
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
        <CardTitle>AI Adoption Leaderboard</CardTitle>
        <CardDescription>Developer AI usage ranked by adoption rate</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Developer</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Active Time</TableHead>
              <TableHead className="text-right">Total Lines</TableHead>
              <TableHead className="w-full">AI Adoption</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((dev, i) => {
              const total = dev.aiLines + dev.manualLines;
              const aiPct = total > 0 ? Math.round((dev.aiLines / total) * 100) : 0;
              const tier = getAdoptionTier(aiPct);
              return (
                <TableRow key={dev.userId}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/developer/${dev.userId}`} className="hover:underline">
                      {dev.userName || dev.userId.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">{dev.sessions}</TableCell>
                  <TableCell className="text-right">{formatDuration(dev.activeMinutes)}</TableCell>
                  <TableCell className="text-right">{total.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${aiPct}%`, backgroundColor: tier.color }} />
                      </div>
                      <span className={`text-sm font-medium ${tier.textClass}`}>{aiPct}%</span>
                      <Badge variant="outline" className={tier.badgeClass}>{tier.label}</Badge>
                    </div>
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
