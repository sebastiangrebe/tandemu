'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search } from 'lucide-react';
import { FileTree } from '@/components/memory/file-tree';
import type { AIEffectivenessEntry } from '@/lib/api';
import type { FileTreeNode } from '@/lib/api';

interface AIEffectivenessChartProps {
  data: AIEffectivenessEntry[];
}

function repoName(repo: string): string {
  if (!repo) return 'Unknown';
  const segments = repo.replace(/\/+$/, '').split('/').filter(Boolean);
  return segments[segments.length - 1] ?? repo;
}

function buildTree(files: AIEffectivenessEntry[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  const byRepo = new Map<string, AIEffectivenessEntry[]>();
  for (const file of files) {
    const repo = file.repo || '';
    if (!byRepo.has(repo)) byRepo.set(repo, []);
    byRepo.get(repo)!.push(file);
  }

  const hasMultipleRepos = byRepo.size > 1 || (byRepo.size === 1 && [...byRepo.keys()][0] !== '');

  for (const [repo, repoFiles] of byRepo) {
    let currentRoot: FileTreeNode[];
    if (hasMultipleRepos && repo) {
      const rName = repoName(repo);
      let repoNode = root.find((n) => n.name === rName);
      if (!repoNode) {
        repoNode = { name: rName, path: rName, memoryCount: 0, children: [], memoryIds: [] };
        root.push(repoNode);
      }
      currentRoot = repoNode.children;
    } else {
      currentRoot = root;
    }

    for (const file of repoFiles) {
      const parts = file.filePath.split('/');
      let currentLevel = currentRoot;

      for (let i = 0; i < parts.length; i++) {
        const name = parts[i];
        const path = parts.slice(0, i + 1).join('/');
        const isFile = i === parts.length - 1;

        let existing = currentLevel.find((n) => n.name === name);
        if (!existing) {
          existing = {
            name,
            path,
            memoryCount: isFile ? file.aiTouchCount : 0,
            children: [],
            memoryIds: isFile ? [file.filePath] : [],
          };
          currentLevel.push(existing);
        }

        if (isFile) {
          existing.memoryIds = [file.filePath];
          existing.memoryCount = file.aiTouchCount;
        }

        currentLevel = existing.children;
      }
    }
  }

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

export function AIEffectivenessChart({ data }: AIEffectivenessChartProps) {
  const [selectedPath, setSelectedPath] = useState<string>();
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const tree = useMemo(() => buildTree(data), [data]);

  const fileMap = useMemo(() => {
    const map = new Map<string, AIEffectivenessEntry>();
    for (const f of data) map.set(f.filePath, f);
    return map;
  }, [data]);

  const detailFiles = useMemo(() => {
    let files: AIEffectivenessEntry[];
    if (selectedFiles.length === 0) {
      files = data;
    } else {
      files = selectedFiles
        .map((p) => fileMap.get(p))
        .filter((f): f is AIEffectivenessEntry => f !== undefined)
        .sort((a, b) => b.aiTouchCount - a.aiTouchCount);
    }
    if (search) {
      const q = search.toLowerCase();
      files = files.filter((f) => f.filePath.toLowerCase().includes(q));
    }
    return files.slice(0, 30);
  }, [selectedFiles, fileMap, data, search]);

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
        <CardDescription>
          {selectedPath
            ? <>Showing files in <span className="font-mono text-xs">{selectedPath}</span></>
            : 'Browse the file tree or view top AI-touched files'
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[280px_1fr] h-full">
          <div className="flex flex-col border rounded-lg overflow-hidden">
            <div className="relative shrink-0 border-b">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent pl-8 pr-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 max-h-[360px]">
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
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">AI Touches</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailFiles.map((entry) => (
                  <TableRow key={entry.filePath}>
                    <TableCell className="font-mono text-xs truncate max-w-[250px]">
                      {selectedPath ? entry.filePath.replace(selectedPath + '/', '') : entry.filePath}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-emerald-400 font-medium">{entry.aiTouchCount}</span>
                    </TableCell>
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
