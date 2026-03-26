'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { HotFile } from '@/lib/api';

interface HotFilesChartProps {
  data: HotFile[];
}

function getHeatColor(count: number): string {
  if (count >= 10) return 'text-red-400';
  if (count >= 5) return 'text-yellow-400';
  return 'text-muted-foreground';
}

export function HotFilesChart({ data }: HotFilesChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hot Files</CardTitle>
          <CardDescription>Most frequently changed files across tasks</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No file change data yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hot Files</CardTitle>
        <CardDescription>Most frequently changed files across tasks</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead className="text-right">Changes</TableHead>
              <TableHead className="text-right">Tasks</TableHead>
              <TableHead className="text-right">Devs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slice(0, 15).map((file) => (
              <TableRow key={file.filePath}>
                <TableCell className="font-mono text-xs truncate max-w-[300px]">{file.filePath}</TableCell>
                <TableCell className={`text-right font-medium ${getHeatColor(file.changeCount)}`}>{file.changeCount}</TableCell>
                <TableCell className="text-right">{file.taskCount}</TableCell>
                <TableCell className="text-right">{file.developerCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
