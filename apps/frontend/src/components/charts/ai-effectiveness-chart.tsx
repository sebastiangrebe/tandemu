'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, ChevronRight, ChevronDown, FolderOpen, FileCode, Sparkles,
} from 'lucide-react';
import { FileTree } from '@/components/memory/file-tree';
import { useFullscreen } from '@/components/ui/fullscreen-card';
import type { AIEffectivenessEntry, FileTreeNode } from '@/lib/api';

interface AIEffectivenessChartProps {
  data: AIEffectivenessEntry[];
}

function repoName(repo: string): string {
  if (!repo) return 'Unknown';
  const segments = repo.replace(/\/+$/, '').split('/').filter(Boolean);
  return segments[segments.length - 1] ?? repo;
}

// ── Folder-based browser (default view) ──

interface AIFolder {
  name: string;
  files: AIEffectivenessEntry[];
  totalTouches: number;
}

function groupByFolder(files: AIEffectivenessEntry[]): AIFolder[] {
  const map = new Map<string, AIEffectivenessEntry[]>();
  for (const file of files) {
    const repo = file.repo ? repoName(file.repo) : '';
    const firstSlash = file.filePath.indexOf('/');
    const folder = repo || (firstSlash > 0 ? file.filePath.slice(0, firstSlash) : '');
    const existing = map.get(folder) ?? [];
    existing.push(file);
    map.set(folder, existing);
  }
  return Array.from(map.entries())
    .map(([name, folderFiles]) => ({
      name: name || 'root',
      files: folderFiles.sort((a, b) => b.aiTouchCount - a.aiTouchCount),
      totalTouches: folderFiles.reduce((s, f) => s + f.aiTouchCount, 0),
    }))
    .sort((a, b) => b.totalTouches - a.totalTouches);
}

function AIFolderRow({ folder, maxTouches }: { folder: AIFolder; maxTouches: number }) {
  const [expanded, setExpanded] = useState(folder.totalTouches === maxTouches);

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-accent/50 transition-colors text-left"
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium text-sm flex-1 truncate">{folder.name}</span>
        <span className="text-xs text-muted-foreground mr-2">{folder.files.length} file{folder.files.length !== 1 ? 's' : ''}</span>
        <div className="w-24 shrink-0">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(100, (folder.totalTouches / maxTouches) * 100)}%` }}
            />
          </div>
        </div>
        <span className="text-xs font-mono tabular-nums w-8 text-right text-emerald-400">
          {folder.totalTouches}
        </span>
      </button>
      {expanded && (
        <div className="pb-1">
          {folder.files.map((file) => (
            <div key={file.filePath} className="flex items-center gap-3 px-4 pl-12 py-2 hover:bg-accent/30 transition-colors group">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <FileCode className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-sm font-mono truncate flex-1 text-muted-foreground group-hover:text-foreground transition-colors">
                {file.filePath}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                <span className="text-emerald-400 font-medium">{file.aiTouchCount}</span> AI touches
              </span>
              <div className="w-16 shrink-0">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500/60 transition-all"
                    style={{ width: `${Math.min(100, (file.aiTouchCount / maxTouches) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FileTree-based view (fullscreen) ──

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
          existing = { name, path, memoryCount: isFile ? file.aiTouchCount : 0, children: [], memoryIds: isFile ? [file.filePath] : [] };
          currentLevel.push(existing);
        }
        if (isFile) { existing.memoryIds = [file.filePath]; existing.memoryCount = file.aiTouchCount; }
        currentLevel = existing.children;
      }
    }
  }
  function rollUp(nodes: FileTreeNode[]): number {
    let total = 0;
    for (const node of nodes) {
      const childTotal = rollUp(node.children);
      if (node.children.length > 0) { node.memoryCount = childTotal; node.memoryIds = node.children.flatMap(function collect(n: FileTreeNode): string[] { return n.children.length === 0 ? n.memoryIds : n.children.flatMap(collect); }); }
      total += node.memoryCount;
    }
    return total;
  }
  rollUp(root);
  return root;
}

export function AIEffectivenessChart({ data }: AIEffectivenessChartProps) {
  const isFullscreen = useFullscreen();
  const [search, setSearch] = useState('');
  const [selectedPath, setSelectedPath] = useState<string>();
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const maxTouches = useMemo(() => Math.max(1, ...data.map((f) => f.aiTouchCount)), [data]);

  // Browser view data
  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((f) => f.filePath.toLowerCase().includes(q));
  }, [data, search]);
  const folders = useMemo(() => groupByFolder(filtered), [filtered]);

  // Fullscreen tree view data
  const tree = useMemo(() => buildTree(data), [data]);
  const fileMap = useMemo(() => { const m = new Map<string, AIEffectivenessEntry>(); for (const f of data) m.set(f.filePath, f); return m; }, [data]);
  const detailFiles = useMemo(() => {
    let files: AIEffectivenessEntry[];
    if (selectedFiles.length === 0) files = data;
    else files = selectedFiles.map((p) => fileMap.get(p)).filter((f): f is AIEffectivenessEntry => f !== undefined).sort((a, b) => b.aiTouchCount - a.aiTouchCount);
    if (search) { const q = search.toLowerCase(); files = files.filter((f) => f.filePath.toLowerCase().includes(q)); }
    return files.slice(0, 50);
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

  if (isFullscreen) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle>AI Effectiveness</CardTitle>
          <CardDescription>
            {selectedPath ? <>Showing files in <span className="font-mono text-xs">{selectedPath}</span></> : 'Browse the file tree or view top AI-touched files'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 min-h-0">
          <div className="grid gap-4 lg:grid-cols-[280px_1fr] h-full">
            <div className="flex flex-col border rounded-lg overflow-hidden">
              <div className="relative shrink-0 border-b">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input type="text" placeholder="Search files..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent pl-8 pr-3 py-2 text-sm outline-none placeholder:text-muted-foreground" />
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <FileTree tree={tree} selectedPath={selectedPath} onSelectPath={(path, ids) => { if (selectedPath === path) { setSelectedPath(undefined); setSelectedFiles([]); } else { setSelectedPath(path); setSelectedFiles(ids); } }} />
              </div>
            </div>
            <div className="overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead>File</TableHead><TableHead className="text-right">AI Touches</TableHead></TableRow></TableHeader>
                <TableBody>
                  {detailFiles.map((entry) => (
                    <TableRow key={entry.filePath}>
                      <TableCell className="font-mono text-xs truncate max-w-[250px]">{selectedPath ? entry.filePath.replace(selectedPath + '/', '') : entry.filePath}</TableCell>
                      <TableCell className="text-right"><span className="text-emerald-400 font-medium">{entry.aiTouchCount}</span></TableCell>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Effectiveness</CardTitle>
        <CardDescription>Files where AI writes the most code, grouped by repository.</CardDescription>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search files..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {folders.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">No matching files found.</div>
        ) : (
          <div className="divide-y divide-border/50">
            {folders.map((folder) => (
              <AIFolderRow key={folder.name} folder={folder} maxTouches={maxTouches} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
