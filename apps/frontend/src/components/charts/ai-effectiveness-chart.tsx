'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { AIEffectivenessEntry } from '@/lib/api';

interface AIEffectivenessChartProps {
  data: AIEffectivenessEntry[];
}

export function AIEffectivenessChart({ data }: AIEffectivenessChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Effectiveness</CardTitle>
          <CardDescription>Files where AI writes the most code</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No AI file attribution data yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Effectiveness</CardTitle>
        <CardDescription>Files where AI writes the most code</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead className="text-right">AI Touches</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slice(0, 15).map((entry) => (
              <TableRow key={entry.filePath}>
                <TableCell className="font-mono text-xs truncate max-w-[350px]">{entry.filePath}</TableCell>
                <TableCell className="text-right">
                  <span className="text-emerald-400 font-medium">{entry.aiTouchCount}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
