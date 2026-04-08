'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users } from 'lucide-react';
import type { DeveloperCostEntry } from '@/lib/api';

function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

interface DeveloperCostChartProps {
  data: DeveloperCostEntry[];
  currency?: string;
}

export function DeveloperCostChart({ data, currency = 'USD' }: DeveloperCostChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-semibold">Cost by Developer</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">No developer cost data available yet.</p>
        </CardContent>
      </Card>
    );
  }

  const maxCost = Math.max(...data.map((d) => d.totalCost));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">Cost by Developer</CardTitle>
        <Users className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Developer</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Tasks</TableHead>
              <TableHead className="text-right">AI Lines</TableHead>
              <TableHead className="text-right">Cost/Line</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((dev) => (
              <TableRow key={dev.userId}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 rounded-full bg-blue-400"
                      style={{ width: `${Math.max((dev.totalCost / maxCost) * 48, 4)}px` }}
                    />
                    <span className="font-medium text-sm">{dev.userName}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(dev.totalCost, currency)}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {dev.taskCount}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {new Intl.NumberFormat('en-US').format(dev.aiLines)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">
                  {dev.costPerLine !== null ? `$${dev.costPerLine.toFixed(4)}` : '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
