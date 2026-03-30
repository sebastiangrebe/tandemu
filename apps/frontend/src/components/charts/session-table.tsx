'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TimesheetEntry } from '@/lib/api';

function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface SessionTableProps {
  data: TimesheetEntry[];
  limit?: number;
}

export function SessionTable({ data, limit }: SessionTableProps) {
  const entries = limit ? data.slice(0, limit) : data;

  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session Log</CardTitle>
        <CardDescription>Daily entries by developer</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Developer</TableHead>
              <TableHead className="text-right">Active Time</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry, i) => (
              <TableRow key={`${entry.date}-${entry.userId}-${i}`}>
                <TableCell className="font-mono text-sm">
                  {new Date(entry.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </TableCell>
                <TableCell className="font-medium text-sm">{entry.userName}</TableCell>
                <TableCell className="text-right text-sm">{formatDuration(entry.activeMinutes)}</TableCell>
                <TableCell className="text-right text-sm">{entry.sessions}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
