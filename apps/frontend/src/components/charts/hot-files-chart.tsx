'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileTree } from '@/components/memory/file-tree';
import type { HotFile } from '@/lib/api';
import type { FileTreeNode } from '@/lib/api';

interface HotFilesChartProps {
  data: HotFile[];
}

function getHeatColor(count: number): string {
  if (count >= 10) return 'text-red-400';
  if (count >= 5) return 'text-yellow-400';
  return 'text-muted-foreground';
}

/** Build a FileTreeNode hierarchy from flat hot file paths. */
function buildTree(files: HotFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const file of files) {
    const parts = file.filePath.split('/');
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const path = parts.slice(0, i + 1).join('/');
      const isFile = i === parts.length - 1;

      let existing = currentLevel.find((n) => n.name === name);
      if (!existing) {
        existing = {
          name,
          path,
          memoryCount: isFile ? file.changeCount : 0,
          children: [],
          memoryIds: isFile ? [file.filePath] : [],
        };
        currentLevel.push(existing);
      }

      if (isFile) {
        existing.memoryIds = [file.filePath];
        existing.memoryCount = file.changeCount;
      }

      currentLevel = existing.children;
    }
  }

  // Roll up counts to parent folders
  function rollUp(nodes: FileTreeNode[]): number {
    let total = 0;
    for (const node of nodes) {
      const childTotal = rollUp(node.children);
      if (node.children.length > 0) {
        node.memoryCount = childTotal;
        node.memoryIds = collectPaths(node);
      }
      total += node.memoryCount;
    }
    return total;
  }

  function collectPaths(node: FileTreeNode): string[] {
    if (node.children.length === 0) return node.memoryIds;
    return node.children.flatMap(collectPaths);
  }

  rollUp(root);
  return root;
}

export function HotFilesChart({ data }: HotFilesChartProps) {
  const [selectedPath, setSelectedPath] = useState<string>();
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const tree = useMemo(() => buildTree(data), [data]);

  // Build lookup for quick access
  const fileMap = useMemo(() => {
    const map = new Map<string, HotFile>();
    for (const f of data) map.set(f.filePath, f);
    return map;
  }, [data]);

  // Files to show in the detail table
  const detailFiles = useMemo(() => {
    if (selectedFiles.length === 0) return data.slice(0, 10);
    return selectedFiles
      .map((p) => fileMap.get(p))
      .filter((f): f is HotFile => f !== undefined)
      .sort((a, b) => b.changeCount - a.changeCount);
  }, [selectedFiles, fileMap, data]);

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
        <CardDescription>
          {selectedPath
            ? <>Showing files in <span className="font-mono text-xs">{selectedPath}</span></>
            : 'Browse the file tree or view top changed files'
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          {/* File tree */}
          <div className="max-h-[400px] overflow-y-auto border rounded-lg p-2">
            <FileTree
              tree={tree}
              selectedPath={selectedPath}
              onSelectPath={(path, ids) => {
                if (selectedPath === path) {
                  setSelectedPath(undefined);
                  setSelectedFiles([]);
                } else {
                  setSelectedPath(path);
                  setSelectedFiles(ids);
                }
              }}
            />
          </div>

          {/* Detail table */}
          <div className="max-h-[400px] overflow-y-auto">
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
                {detailFiles.map((file) => (
                  <TableRow key={file.filePath}>
                    <TableCell className="font-mono text-xs truncate max-w-[250px]">
                      {selectedPath ? file.filePath.replace(selectedPath + '/', '') : file.filePath}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${getHeatColor(file.changeCount)}`}>{file.changeCount}</TableCell>
                    <TableCell className="text-right">{file.taskCount}</TableCell>
                    <TableCell className="text-right">{file.developerCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
