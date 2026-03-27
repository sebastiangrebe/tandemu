'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// Tabs removed — using custom segmented control instead
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Brain,
  User,
  Building2,
  Search,
  X,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Clock,
  CheckCircle,
  AlertTriangle,
  List,
  FileCode,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Activity,
  GitBranch,
  Zap,
  Code2,
} from 'lucide-react';
import {
  getMemoryList,
  getMemoryStats,
  searchMemories,
  approveMemory,
  getMemoryFileTree,
  getMemoryGaps,
  getMemoryUsageInsights,
  type MemoryEntry,
  type MemoryScope,
  type MemoryStatsResponse,
  type FileTreeNode,
  type GapEntry,
  type UsageInsightsResponse,
} from '@/lib/api';
import { MemorySkeleton } from '@/components/ui/skeleton-helpers';
import { InstallBanner } from '@/components/install-banner';
import { EditMemoryDialog } from '@/components/memory/edit-memory-dialog';
import { DeleteMemoryDialog } from '@/components/memory/delete-memory-dialog';
import { FileTree } from '@/components/memory/file-tree';
import { MemoryCategoryChart } from '@/components/charts/memory-category-chart';
import { MemoryHealthChart } from '@/components/charts/memory-health-chart';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';

const CATEGORY_COLORS: Record<string, string> = {
  architecture: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  pattern: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  gotcha: 'bg-red-500/10 text-red-400 border-red-500/30',
  preference: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  style: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  dependency: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  decision: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  uncategorized: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
};

const CATEGORY_ACCENT: Record<string, string> = {
  architecture: 'border-l-blue-500',
  pattern: 'border-l-purple-500',
  gotcha: 'border-l-red-500',
  preference: 'border-l-emerald-500',
  style: 'border-l-cyan-500',
  dependency: 'border-l-orange-500',
  decision: 'border-l-yellow-500',
  uncategorized: 'border-l-zinc-500',
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.uncategorized;
}

function getCategoryAccent(category: string): string {
  return CATEGORY_ACCENT[category] ?? CATEGORY_ACCENT.uncategorized;
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function isStale(dateStr: string): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = new Date();
  return now.getTime() - date.getTime() > 90 * 24 * 60 * 60 * 1000;
}

interface RepoGroup {
  repo: string;
  memories: MemoryEntry[];
  expanded: boolean;
}

function groupByRepo(memories: MemoryEntry[]): RepoGroup[] {
  const map = new Map<string, MemoryEntry[]>();
  for (const mem of memories) {
    const repo = mem.metadata.repo ?? 'Uncategorized';
    const list = map.get(repo);
    if (list) list.push(mem);
    else map.set(repo, [mem]);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return a.localeCompare(b);
    })
    .map(([repo, mems]) => ({
      repo,
      memories: mems,
      expanded: true,
    }));
}

export default function MemoryPage() {
  const { isAdmin } = useAuth();

  // State
  const [activeScope, setActiveScope] = useState<MemoryScope>('personal');
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [stats, setStats] = useState<MemoryStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [repoFilter, setRepoFilter] = useState<string>('all');
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());

  // View mode: 'list' (default) or 'files' (file tree)
  const [viewMode, setViewMode] = useState<'list' | 'files'>('list');
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);
  const [selectedTreePath, setSelectedTreePath] = useState<string | undefined>();
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([]);

  // Knowledge gaps
  const [gaps, setGaps] = useState<GapEntry[]>([]);

  // Usage insights
  const [usageInsights, setUsageInsights] = useState<UsageInsightsResponse | null>(null);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [showAllGaps, setShowAllGaps] = useState(false);

  // Dialogs
  const [editMemory, setEditMemory] = useState<MemoryEntry | null>(null);
  const [deleteMemoryId, setDeleteMemoryId] = useState<string | null>(null);

  // Expanded content
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Track initial page load across all data sources
  const [initialLoading, setInitialLoading] = useState(true);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load stats + gaps + usage insights
  useEffect(() => {
    Promise.allSettled([
      getMemoryStats().then(setStats),
      getMemoryGaps().then((r) => setGaps(r.gaps)),
      getMemoryUsageInsights('all', 30).then(setUsageInsights),
    ]).finally(() => setInitialLoading(false));
  }, []);

  // Load file tree when switching to files view or changing scope
  useEffect(() => {
    if (viewMode === 'files') {
      setFileTreeLoading(true);
      getMemoryFileTree(activeScope)
        .then((r) => setFileTree(r.tree))
        .catch(() => setFileTree([]))
        .finally(() => setFileTreeLoading(false));
    }
  }, [viewMode, activeScope]);

  // Load memories
  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (debouncedQuery) {
        const result = await searchMemories(debouncedQuery, activeScope === 'personal' ? 'personal' : 'org');
        setMemories(result.memories);
        setTotal(result.memories.length);
      } else {
        const result = await getMemoryList(activeScope, 50, offset);
        if (offset === 0) {
          setMemories(result.memories);
        } else {
          setMemories((prev) => [...prev, ...result.memories]);
        }
        setTotal(result.total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, [activeScope, debouncedQuery, offset]);

  useEffect(() => {
    setOffset(0);
  }, [activeScope, debouncedQuery]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  // Derived data
  const filteredMemories = useMemo(() => {
    let filtered = memories;
    if (categoryFilter !== 'all') {
      filtered = filtered.filter((m) => (m.metadata.category ?? 'uncategorized') === categoryFilter);
    }
    if (repoFilter !== 'all') {
      filtered = filtered.filter((m) => (m.metadata.repo ?? 'Uncategorized') === repoFilter);
    }
    return filtered;
  }, [memories, categoryFilter, repoFilter]);

  const repoGroups = useMemo(() => groupByRepo(filteredMemories), [filteredMemories]);

  const uniqueRepos = useMemo(() => {
    const repos = new Set(memories.map((m) => m.metadata.repo ?? 'Uncategorized'));
    return Array.from(repos).sort();
  }, [memories]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set(memories.map((m) => m.metadata.category ?? 'uncategorized'));
    return Array.from(cats).sort();
  }, [memories]);

  // Handlers
  const toggleRepo = (repo: string) => {
    setExpandedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo);
      else next.add(repo);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApprove = async (memoryId: string) => {
    try {
      await approveMemory(memoryId);
      toast.success('Memory approved and published.');
      loadMemories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve memory');
    }
  };

  const refreshAfterChange = () => {
    setOffset(0);
    loadMemories();
    getMemoryStats().then(setStats).catch(() => {});
  };

  // Loading — wait for ALL initial data (stats, gaps, insights, memories) before rendering
  if (initialLoading || (loading && memories.length === 0)) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Memory</h1>
          <p className="text-muted-foreground">Your AI teammate&apos;s persistent knowledge base.</p>
        </div>
        <MemorySkeleton />
      </div>
    );
  }

  // Error
  if (error && memories.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Memory</h1>
          <p className="text-muted-foreground">Your AI teammate&apos;s persistent knowledge base.</p>
        </div>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      </div>
    );
  }

  const hasData = memories.length > 0;
  const canLoadMore = !debouncedQuery && memories.length < total;

  // Initialize expandedRepos with all repos on first load
  if (expandedRepos.size === 0 && repoGroups.length > 0) {
    const allRepos = new Set(repoGroups.map((g) => g.repo));
    setExpandedRepos(allRepos);
  }

  const accessedCount = stats ? stats.total - (usageInsights?.neverAccessedCount ?? 0) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Memory</h1>
        <p className="text-muted-foreground">Your AI teammate&apos;s persistent knowledge base.</p>
      </div>

      {/* KPI Stats Row */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Memories</CardTitle>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">
                across {Object.keys(stats.categories).length} categories
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Personal</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.personal}</div>
              <p className="text-xs text-muted-foreground mt-1">coding style, preferences, DNA</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Organization</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.org}</div>
              <p className="text-xs text-muted-foreground mt-1">architecture, decisions, patterns</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Memory Health</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.total > 0
                  ? `${Math.round((accessedCount / stats.total) * 100)}%`
                  : '—'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">actively used by AI</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Row */}
      {stats && Object.keys(stats.categories).length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <MemoryCategoryChart categories={stats.categories} />
          {usageInsights && (
            <MemoryHealthChart
              totalMemories={stats.total}
              accessedCount={accessedCount}
              neverAccessedCount={usageInsights.neverAccessedCount}
            />
          )}
        </div>
      )}

      {/* Insights Section */}
      {(gaps.length > 0 || (usageInsights && (usageInsights.topUsed.length > 0 || usageInsights.neverAccessedCount > 0))) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
              Insights
            </CardTitle>
            <CardDescription>Actionable intelligence from your memory data.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              {/* Knowledge Gaps */}
              {gaps.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <h3 className="text-sm font-medium">Knowledge Gaps</h3>
                    <Badge variant="outline" className="text-[10px] h-4 text-amber-400 border-amber-500/30 ml-auto">{gaps.length}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">Modules with frequent changes but no documented knowledge.</p>
                  <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
                    {gaps.map((gap) => (
                      <div key={gap.filePath} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <code className="font-mono text-muted-foreground truncate max-w-[60%]">{gap.filePath}</code>
                          <span className="text-amber-400 shrink-0 tabular-nums">{gap.changeCount} changes</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500/60 rounded-full"
                            style={{ width: `${Math.min(100, (gap.changeCount / Math.max(...gaps.map(g => g.changeCount))) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Most Used */}
              {usageInsights && usageInsights.topUsed.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-sm font-medium">Most Referenced</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">Knowledge your AI teammate relies on most.</p>
                  <div className="space-y-2.5">
                    {usageInsights.topUsed.slice(0, 4).map((u, i) => (
                      <div key={u.memoryId} className="flex items-start gap-2.5">
                        <span className="text-xs font-medium text-muted-foreground mt-0.5 w-4 shrink-0 tabular-nums">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="line-clamp-1 text-xs">{u.content}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500/60 rounded-full"
                                style={{ width: `${Math.min(100, (u.accessCount / Math.max(...usageInsights.topUsed.map(t => t.accessCount))) * 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{u.accessCount}x</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cleanup Candidates */}
              {usageInsights && (usageInsights.leastUsed.length > 0 || usageInsights.neverAccessedCount > 0) && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="h-4 w-4 text-orange-400" />
                    <h3 className="text-sm font-medium">Cleanup Candidates</h3>
                    {usageInsights.neverAccessedCount > 0 && (
                      <Badge variant="outline" className="text-[10px] h-4 text-orange-400 border-orange-500/30 ml-auto">{usageInsights.neverAccessedCount}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">Memories never accessed by the AI.</p>
                  <div className="space-y-1.5 mb-3">
                    {(usageInsights.neverAccessed ?? usageInsights.leastUsed).slice(0, 3).map((u) => (
                      <p key={u.memoryId} className="line-clamp-1 text-xs text-muted-foreground">{u.content}</p>
                    ))}
                    {usageInsights.neverAccessedCount > 3 && (
                      <p className="text-xs text-muted-foreground">+{usageInsights.neverAccessedCount - 3} more</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setShowCleanupDialog(true)}
                  >
                    Review unused memories
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Browse Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Browse Memories</CardTitle>
              <CardDescription>Explore your AI teammate&apos;s knowledge.</CardDescription>
            </div>
            {/* View mode toggle */}
            <div className="flex items-center gap-1 border rounded-md p-0.5">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'files' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode('files')}
              >
                <FileCode className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* Scope toggle + search row */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <div className="flex items-center rounded-lg border p-1 gap-0.5">
              <button
                onClick={() => setActiveScope('personal')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeScope === 'personal'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <User className="h-3.5 w-3.5" />
                Personal
              </button>
              <button
                onClick={() => setActiveScope('org')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeScope === 'org'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                Organization
              </button>
            </div>

            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search memories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {uniqueCategories.length > 1 && (
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {uniqueCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {uniqueRepos.length > 1 && (
              <Select value={repoFilter} onValueChange={setRepoFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Repository" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All repositories</SelectItem>
                  {uniqueRepos.map((repo) => (
                    <SelectItem key={repo} value={repo}>
                      {repo.split('/').pop() ?? repo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* File tree view */}
      {viewMode === 'files' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileCode className="h-5 w-5 text-muted-foreground" />
              <CardTitle>File Explorer</CardTitle>
            </div>
            <CardDescription>Navigate memories by file path. Click a file or folder to filter memories.</CardDescription>
          </CardHeader>
          <CardContent>
            {fileTreeLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-7 bg-muted/50 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <FileTree
                tree={fileTree}
                selectedPath={selectedTreePath}
                onSelectPath={(path, memoryIds) => {
                  setSelectedTreePath(path);
                  setSelectedMemoryIds(memoryIds);
                }}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Filtered memories from file tree selection */}
      {viewMode === 'files' && selectedTreePath && selectedMemoryIds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-mono">{selectedTreePath}</CardTitle>
            <CardDescription>{selectedMemoryIds.length} memories associated with this path</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredMemories
                .filter((m) => selectedMemoryIds.includes(m.id))
                .map((mem) => (
                  <MemoryCard
                    key={mem.id}
                    memory={mem}
                    expanded={expandedIds.has(mem.id)}
                    onToggleExpand={() => toggleExpand(mem.id)}
                    onEdit={() => setEditMemory(mem)}
                    onDelete={() => setDeleteMemoryId(mem.id)}
                    onApprove={isAdmin && mem.metadata.status === 'draft' ? () => handleApprove(mem.id) : undefined}
                  />
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Memory list (list view) */}
      {viewMode === 'list' && !hasData ? (
        <>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="relative mb-6">
                <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-muted/50">
                  <Brain className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <div className="absolute -top-1 -right-1 flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-1">Your AI teammate builds knowledge as you code</h3>
              <p className="text-sm text-muted-foreground max-w-md text-center mb-6">
                Memories are created automatically when you work with Claude Code — from coding patterns, architecture decisions, gotchas, and more.
              </p>
              <div className="grid grid-cols-3 gap-6 text-center max-w-lg">
                <div className="space-y-2">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/50 mx-auto">
                    <Code2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">Learns your coding style</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/50 mx-auto">
                    <GitBranch className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">Captures decisions at /finish</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/50 mx-auto">
                    <Zap className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">Gets smarter every session</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <InstallBanner />
        </>
      ) : viewMode === 'list' && debouncedQuery ? (
        /* Flat search results */
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{filteredMemories.length} results for &ldquo;{debouncedQuery}&rdquo;</span>
          </div>
          <div className="space-y-3">
            {filteredMemories.map((mem) => (
              <MemoryCard
                key={mem.id}
                memory={mem}
                expanded={expandedIds.has(mem.id)}
                onToggleExpand={() => toggleExpand(mem.id)}
                onEdit={() => setEditMemory(mem)}
                onDelete={() => setDeleteMemoryId(mem.id)}
                onApprove={isAdmin ? () => handleApprove(mem.id) : undefined}
                showScore
              />
            ))}
          </div>
        </div>
      ) : viewMode === 'list' ? (
        /* Structured repo tree view */
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FolderTree className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {filteredMemories.length} memories
              {categoryFilter !== 'all' && ` in ${categoryFilter}`}
              {repoFilter !== 'all' && ` from ${repoFilter.split('/').pop()}`}
            </span>
          </div>
          <div className="space-y-6">
            {repoGroups.map((group) => (
              <div key={group.repo}>
                <button
                  onClick={() => toggleRepo(group.repo)}
                  className="flex items-center gap-2 text-sm font-medium hover:text-foreground transition-colors mb-3 group"
                >
                  {expandedRepos.has(group.repo) ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                  )}
                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono text-xs">
                    {group.repo === 'Uncategorized' ? 'Uncategorized' : group.repo.split('/').slice(-2).join('/')}
                  </span>
                  <Badge variant="secondary" className="text-[10px] h-5">{group.memories.length}</Badge>
                </button>

                {expandedRepos.has(group.repo) && (
                  <div className="space-y-3 ml-6">
                    {group.memories.map((mem) => (
                      <MemoryCard
                        key={mem.id}
                        memory={mem}
                        expanded={expandedIds.has(mem.id)}
                        onToggleExpand={() => toggleExpand(mem.id)}
                        onEdit={() => setEditMemory(mem)}
                        onDelete={() => setDeleteMemoryId(mem.id)}
                        onApprove={isAdmin && mem.metadata.status === 'draft' && mem.metadata.author_id !== undefined ? () => handleApprove(mem.id) : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Load more */}
      {viewMode === 'list' && canLoadMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => setOffset((prev) => prev + 50)}
            disabled={loading}
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
            ) : null}
            Load more ({total - memories.length} remaining)
          </Button>
        </div>
      )}

      {/* Dialogs */}
      {editMemory && (
        <EditMemoryDialog
          open={!!editMemory}
          onOpenChange={(open) => !open && setEditMemory(null)}
          memory={editMemory}
          onUpdated={refreshAfterChange}
        />
      )}
      {deleteMemoryId && (
        <DeleteMemoryDialog
          open={!!deleteMemoryId}
          onOpenChange={(open) => !open && setDeleteMemoryId(null)}
          memoryId={deleteMemoryId}
          onDeleted={refreshAfterChange}
        />
      )}

      {/* Cleanup review dialog */}
      <Dialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-orange-400" />
              Unused Memories
              {usageInsights && usageInsights.neverAccessedCount > 0 && (
                <Badge variant="outline" className="text-xs text-orange-400 border-orange-500/30">{usageInsights.neverAccessedCount}</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              These memories have never been accessed by your AI teammate. Review and remove any that are no longer relevant to keep your knowledge base clean.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2 overflow-y-auto flex-1 pr-1">
            {(usageInsights?.neverAccessed ?? []).map((u) => {
              const cat = (u as unknown as { metadata?: { category?: string } }).metadata?.category ?? 'uncategorized';
              return (
                <div key={u.memoryId} className={`flex items-start gap-3 rounded-lg border border-l-[3px] ${getCategoryAccent(cat)} p-3`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Badge variant="outline" className={`text-[10px] ${getCategoryColor(cat)}`}>{cat}</Badge>
                    </div>
                    <p className="text-sm">{u.content}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs"
                    onClick={() => {
                      setDeleteMemoryId(u.memoryId);
                    }}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              );
            })}
            {(usageInsights?.neverAccessed ?? []).length === 0 && (
              <div className="flex flex-col items-center justify-center py-8">
                <CheckCircle className="h-8 w-8 text-emerald-400 mb-2" />
                <p className="text-sm font-medium">All clean!</p>
                <p className="text-xs text-muted-foreground">No unused memories found.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Memory Card Component ----

interface MemoryCardProps {
  memory: MemoryEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onApprove?: () => void;
  showScore?: boolean;
}

function MemoryCard({ memory, expanded, onToggleExpand, onEdit, onDelete, onApprove, showScore }: MemoryCardProps) {
  const category = memory.metadata.category ?? 'uncategorized';
  const stale = isStale(memory.updatedAt || memory.createdAt);

  return (
    <div className={`rounded-lg border border-l-[3px] ${getCategoryAccent(category)} ${stale ? 'bg-muted/30' : ''} hover:bg-muted/50 transition-colors`}>
      <div className="p-3">
        {/* Header row: badges + actions */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Badge variant="outline" className={`text-[10px] shrink-0 ${getCategoryColor(category)}`}>
              {category}
            </Badge>
            {memory.metadata.status === 'draft' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                      Draft
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Visible only to you until the associated task completes.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {stale && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-[10px] bg-zinc-500/10 text-zinc-400 border-zinc-500/30">
                      <Clock className="h-2.5 w-2.5 mr-0.5" />
                      Stale
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>This memory is over 90 days old and may be outdated.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {showScore && memory.score !== undefined && (
              <span className="text-[10px] text-muted-foreground">
                {Math.round(memory.score * 100)}% match
              </span>
            )}
            {memory.metadata.files && memory.metadata.files.length > 0 && (
              <span className="text-[10px] text-muted-foreground font-mono truncate ml-auto">
                {memory.metadata.files[0].split('/').pop()}
                {memory.metadata.files.length > 1 && ` +${memory.metadata.files.length - 1}`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {onApprove && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onApprove}>
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Approve and publish</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <button onClick={onToggleExpand} className="text-left text-sm w-full">
          <p className={expanded ? '' : 'line-clamp-2'}>{memory.content}</p>
        </button>

        {/* Footer */}
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
          <span>{relativeTime(memory.updatedAt || memory.createdAt)}</span>
          {memory.metadata.taskId && (
            <span className="font-mono">{memory.metadata.taskId}</span>
          )}
        </div>
      </div>
    </div>
  );
}
