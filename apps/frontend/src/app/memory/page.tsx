'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.uncategorized;
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

  // Dialogs
  const [editMemory, setEditMemory] = useState<MemoryEntry | null>(null);
  const [deleteMemoryId, setDeleteMemoryId] = useState<string | null>(null);

  // Expanded content
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load stats + gaps + usage insights
  useEffect(() => {
    getMemoryStats().then(setStats).catch(() => {});
    getMemoryGaps().then((r) => setGaps(r.gaps)).catch(() => {});
    getMemoryUsageInsights('all', 30).then(setUsageInsights).catch(() => {});
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

  // Loading
  if (loading && memories.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Memory</h1>
          <p className="text-muted-foreground">Browse and manage your AI teammate&apos;s knowledge base.</p>
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
          <p className="text-muted-foreground">Browse and manage your AI teammate&apos;s knowledge base.</p>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Memory</h1>
        <p className="text-muted-foreground">Browse and manage your AI teammate&apos;s knowledge base.</p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Total Memories
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              {Object.keys(stats.categories).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(stats.categories)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([cat, count]) => (
                      <Badge key={cat} variant="outline" className={`text-xs ${getCategoryColor(cat)}`}>
                        {cat}: {count}
                      </Badge>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <User className="h-4 w-4" />
                Personal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.personal}</div>
              <p className="text-xs text-muted-foreground mt-1">coding preferences, style, DNA</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Organization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.org}</div>
              <p className="text-xs text-muted-foreground mt-1">architecture, decisions, patterns</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Knowledge Gaps */}
      {gaps.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Knowledge Gaps
            </CardTitle>
            <CardDescription>Modules with heavy activity but few or no memories.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {gaps.slice(0, 5).map((gap) => (
                <div key={gap.filePath} className="flex items-center justify-between text-sm">
                  <code className="font-mono text-xs text-muted-foreground truncate max-w-[60%]">{gap.filePath}</code>
                  <div className="flex items-center gap-3 text-xs">
                    <span>{gap.changeCount} changes</span>
                    <span className="text-amber-400">{gap.memoryCount} memories</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage Insights */}
      {usageInsights && (usageInsights.topUsed.length > 0 || usageInsights.neverAccessedCount > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {usageInsights.topUsed.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  Most Used Knowledge
                </CardTitle>
                <CardDescription>Memories the AI relies on most.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {usageInsights.topUsed.slice(0, 5).map((u) => (
                    <div key={u.memoryId} className="flex items-start justify-between gap-2 text-sm">
                      <p className="line-clamp-1 text-muted-foreground flex-1">{u.content}</p>
                      <Badge variant="secondary" className="shrink-0 text-xs">{u.accessCount}x</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {(usageInsights.leastUsed.length > 0 || usageInsights.neverAccessedCount > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-orange-400" />
                  Cleanup Candidates
                </CardTitle>
                <CardDescription>
                  {usageInsights.neverAccessedCount > 0 && (
                    <>{usageInsights.neverAccessedCount} memories never accessed. </>
                  )}
                  Consider reviewing these.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {usageInsights.leastUsed.slice(0, 5).map((u) => (
                    <div key={u.memoryId} className="flex items-start justify-between gap-2 text-sm">
                      <p className="line-clamp-1 text-muted-foreground flex-1">{u.content}</p>
                      <Badge variant="outline" className="shrink-0 text-xs">{u.accessCount}x</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tabs + Search + Filters */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Tabs value={activeScope} onValueChange={(v) => setActiveScope(v as MemoryScope)}>
            <TabsList>
              <TabsTrigger value="personal">Personal</TabsTrigger>
              <TabsTrigger value="org">Organization</TabsTrigger>
            </TabsList>
          </Tabs>

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

        <div className="flex items-center gap-3">
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
      </div>

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
            <div className="space-y-2">
              {filteredMemories
                .filter((m) => selectedMemoryIds.includes(m.id))
                .map((mem) => (
                  <MemoryRow
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
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Brain className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No memories yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Memories will appear as you use Claude Code with Tandemu.
              </p>
            </CardContent>
          </Card>
          <InstallBanner />
        </>
      ) : viewMode === 'list' && debouncedQuery ? (
        /* Flat search results */
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Search Results</CardTitle>
            </div>
            <CardDescription>{filteredMemories.length} memories found</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredMemories.map((mem) => (
                <MemoryRow
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
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        /* Structured repo tree view */
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FolderTree className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Memories</CardTitle>
            </div>
            <CardDescription>
              {filteredMemories.length} memories
              {categoryFilter !== 'all' && ` in ${categoryFilter}`}
              {repoFilter !== 'all' && ` from ${repoFilter.split('/').pop()}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {repoGroups.map((group) => (
                <div key={group.repo}>
                  <button
                    onClick={() => toggleRepo(group.repo)}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
                  >
                    {expandedRepos.has(group.repo) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-mono text-xs">{group.repo === 'Uncategorized' ? 'Uncategorized' : group.repo.split('/').slice(-2).join('/')}</span>
                    <Badge variant="secondary" className="text-xs">{group.memories.length}</Badge>
                  </button>

                  {expandedRepos.has(group.repo) && (
                    <div className="space-y-2 ml-6">
                      {group.memories.map((mem) => (
                        <MemoryRow
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
          </CardContent>
        </Card>
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
    </div>
  );
}

// ---- Memory Row Component ----

interface MemoryRowProps {
  memory: MemoryEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onApprove?: () => void;
  showScore?: boolean;
}

function MemoryRow({ memory, expanded, onToggleExpand, onEdit, onDelete, onApprove, showScore }: MemoryRowProps) {
  const category = memory.metadata.category ?? 'uncategorized';
  const stale = isStale(memory.updatedAt || memory.createdAt);

  return (
    <div className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Badges */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <Badge variant="outline" className={`text-xs ${getCategoryColor(category)}`}>
              {category}
            </Badge>
            {memory.metadata.status === 'draft' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30">
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
                    <Badge variant="outline" className="text-xs bg-zinc-500/10 text-zinc-400 border-zinc-500/30">
                      <Clock className="h-3 w-3 mr-1" />
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
              <span className="text-xs text-muted-foreground">
                {Math.round(memory.score * 100)}% match
              </span>
            )}
          </div>

          {/* Content */}
          <button
            onClick={onToggleExpand}
            className="text-left text-sm w-full"
          >
            <p className={expanded ? '' : 'line-clamp-2'}>
              {memory.content}
            </p>
          </button>

          {/* Meta */}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-muted-foreground">
              {relativeTime(memory.updatedAt || memory.createdAt)}
            </span>
            {memory.metadata.files && memory.metadata.files.length > 0 && (
              <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                {memory.metadata.files[0]}
                {memory.metadata.files.length > 1 && ` +${memory.metadata.files.length - 1}`}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {onApprove && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onApprove}>
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Approve and publish</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
