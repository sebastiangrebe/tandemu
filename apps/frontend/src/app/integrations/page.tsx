'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Plug,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  AlertTriangle,
  ExternalLink,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { SiGithub, SiJira, SiLinear, SiClickup, SiAsana } from '@icons-pack/react-simple-icons';
import Image from 'next/image';
import { IntegrationsSkeleton } from '@/components/ui/skeleton-helpers';
import {
  getIntegrations,
  createIntegration,
  deleteIntegration,
  getExternalProjects,
  getProjectMappings,
  createProjectMapping,
  deleteProjectMapping,
  getTeams,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Integration, IntegrationProjectMapping } from '@/lib/api';
import type { Team } from '@tandemu/types';

function ProviderIcon({ providerId, size = 20 }: { providerId: string; size?: number }) {
  switch (providerId) {
    case 'github': return <SiGithub size={size} />;
    case 'jira': return <SiJira size={size} color="#2684FF" />;
    case 'linear': return <SiLinear size={size} color="#5E6AD2" />;
    case 'clickup': return <SiClickup size={size} color="#7B68EE" />;
    case 'asana': return <SiAsana size={size} color="#F06A6A" />;
    case 'monday': return <Image src="/monday.svg" alt="Monday.com" width={size} height={size} />;
    default: return <Plug size={size} />;
  }
}

// Provider metadata
const PROVIDERS = [
  {
    id: 'github',
    name: 'GitHub Issues',
    description: 'Track issues and pull requests from GitHub repositories.',
    workspaceLabel: 'Organization',
    workspacePlaceholder: 'my-org (leave blank for personal repos)',
    workspaceRequired: false,
    helpText: 'Create a personal access token at github.com/settings/tokens with `repo` scope',
    helpUrl: 'https://github.com/settings/tokens',
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Sync issues and sprints from Atlassian Jira.',
    workspaceLabel: 'Site URL',
    workspacePlaceholder: 'mycompany.atlassian.net',
    workspaceRequired: true,
    helpText: 'Create an API token at id.atlassian.net/manage-profile/security/api-tokens. Use your email as username.',
    helpUrl: 'https://id.atlassian.net/manage-profile/security/api-tokens',
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Import issues, cycles, and projects from Linear.',
    workspaceLabel: 'Workspace',
    workspacePlaceholder: 'Derived from token (leave blank)',
    workspaceRequired: false,
    helpText: 'Create a personal API key at linear.app/settings/api',
    helpUrl: 'https://linear.app/settings/api',
  },
  {
    id: 'clickup',
    name: 'ClickUp',
    description: 'Connect tasks, lists, and spaces from ClickUp.',
    workspaceLabel: 'Workspace ID (optional)',
    workspacePlaceholder: 'Auto-detected from token',
    workspaceRequired: false,
    helpText: 'Create a personal API token at app.clickup.com/settings/apps',
    helpUrl: 'https://app.clickup.com/settings/apps',
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Sync tasks and projects from Asana workspaces.',
    workspaceLabel: 'Workspace GID',
    workspacePlaceholder: 'Your Asana workspace GID',
    workspaceRequired: true,
    helpText: 'Create a personal access token at app.asana.com/0/developer-console',
    helpUrl: 'https://app.asana.com/0/developer-console',
  },
  {
    id: 'monday',
    name: 'Monday.com',
    description: 'Connect boards and items from Monday.com.',
    workspaceLabel: 'Workspace',
    workspacePlaceholder: 'Not required (leave blank)',
    workspaceRequired: false,
    helpText: 'Create an API token in your Monday.com admin panel under Developers',
    helpUrl: 'https://monday.com/developers/apps',
  },
] as const;

function getProviderMeta(providerId: string) {
  return PROVIDERS.find((p) => p.id === providerId);
}

export default function IntegrationsPage() {
  const { currentOrg: authOrg } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Org + teams for mappings
  const [orgId, setOrgId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);

  // Connect dialog
  const [connectProvider, setConnectProvider] = useState<string | null>(null);
  const [connectToken, setConnectToken] = useState('');
  const [connectWorkspace, setConnectWorkspace] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Disconnect confirmation
  const [disconnectProvider, setDisconnectProvider] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Expanded mappings
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [mappingsMap, setMappingsMap] = useState<Record<string, IntegrationProjectMapping[]>>({});
  const [loadingMappings, setLoadingMappings] = useState<string | null>(null);

  // Add mapping dialog
  const [addMappingProvider, setAddMappingProvider] = useState<string | null>(null);
  const [externalProjects, setExternalProjects] = useState<Array<{ id: string; name: string; key?: string }>>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedExternalProject, setSelectedExternalProject] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [savingMapping, setSavingMapping] = useState(false);

  const [connectError, setConnectError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const integrationsData = await getIntegrations();
      setIntegrations(integrationsData);
      if (authOrg) {
        setOrgId(authOrg.id);
        const teamList = await getTeams(authOrg.id);
        setTeams(teamList);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations');
    }
  }, [authOrg]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const connectedProviderIds = integrations.map((i) => i.provider);
  const availableProviders = PROVIDERS.filter((p) => !connectedProviderIds.includes(p.id));

  // Connect handler
  const handleConnect = async () => {
    if (!connectProvider || !connectToken.trim()) return;
    const meta = getProviderMeta(connectProvider);
    setConnecting(true);
    setConnectError('');
    try {
      await createIntegration({
        provider: connectProvider,
        accessToken: connectToken.trim(),
        externalWorkspaceId: connectWorkspace.trim() || undefined,
        externalWorkspaceName: connectWorkspace.trim() || undefined,
      });
      setConnectProvider(null);
      setConnectToken('');
      setConnectWorkspace('');
      setShowToken(false);
      setConnectError('');
      await loadData();
      toast.success(`${meta?.name ?? connectProvider} connected successfully.`);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to connect integration');
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect handler
  const handleDisconnect = async () => {
    if (!disconnectProvider) return;
    const meta = getProviderMeta(disconnectProvider);
    setDisconnecting(true);
    setError('');
    try {
      await deleteIntegration(disconnectProvider);
      setDisconnectProvider(null);
      setIntegrations((prev) => prev.filter((i) => i.provider !== disconnectProvider));
      if (expandedProvider === disconnectProvider) setExpandedProvider(null);
      toast.success(`${meta?.name ?? disconnectProvider} disconnected.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect integration');
    } finally {
      setDisconnecting(false);
    }
  };

  // Toggle mappings
  const handleToggleMappings = async (provider: string) => {
    if (expandedProvider === provider) {
      setExpandedProvider(null);
      return;
    }
    setExpandedProvider(provider);
    if (!mappingsMap[provider]) {
      setLoadingMappings(provider);
      try {
        const mappings = await getProjectMappings(provider);
        setMappingsMap((prev) => ({ ...prev, [provider]: mappings }));
      } catch {
        setMappingsMap((prev) => ({ ...prev, [provider]: [] }));
      } finally {
        setLoadingMappings(null);
      }
    }
  };

  // Open add mapping dialog
  const handleOpenAddMapping = async (provider: string) => {
    setAddMappingProvider(provider);
    setSelectedExternalProject('');
    setSelectedTeamId('');
    setLoadingProjects(true);
    try {
      const projects = await getExternalProjects(provider);
      setExternalProjects(projects);
    } catch {
      setExternalProjects([]);
      setError('Failed to load external projects. Check your integration token.');
    } finally {
      setLoadingProjects(false);
    }
  };

  // Save mapping
  const handleSaveMapping = async () => {
    if (!addMappingProvider || !selectedExternalProject || !selectedTeamId) return;
    setSavingMapping(true);
    setError('');
    try {
      const project = externalProjects.find((p) => p.id === selectedExternalProject);
      await createProjectMapping(addMappingProvider, {
        teamId: selectedTeamId,
        externalProjectId: selectedExternalProject,
        externalProjectName: project?.name,
      });
      // Refresh mappings
      const mappings = await getProjectMappings(addMappingProvider);
      setMappingsMap((prev) => ({ ...prev, [addMappingProvider]: mappings }));
      setAddMappingProvider(null);
      toast.success('Project mapping added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create mapping');
    } finally {
      setSavingMapping(false);
    }
  };

  // Delete mapping
  const handleDeleteMapping = async (provider: string, mappingId: string) => {
    setError('');
    try {
      await deleteProjectMapping(provider, mappingId);
      setMappingsMap((prev) => ({
        ...prev,
        [provider]: (prev[provider] ?? []).filter((m) => m.id !== mappingId),
      }));
      toast.success('Mapping removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove mapping');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground">Connect your ticket system and map projects to teams.</p>
        </div>
        <IntegrationsSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground">Connect your ticket system and map projects to teams.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Connected Integrations */}
      {integrations.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Connected Integrations</CardTitle>
                <CardDescription>Manage your active integrations.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {integrations.map((integration) => {
              const meta = getProviderMeta(integration.provider);
              const isExpanded = expandedProvider === integration.provider;
              const mappings = mappingsMap[integration.provider] ?? [];

              return (
                <div key={integration.id} className="rounded-lg border border-border">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ProviderIcon providerId={integration.provider} />
                      <span className="text-sm font-medium">{meta?.name ?? integration.provider}</span>
                      {integration.externalWorkspaceName && (
                        <span className="text-sm text-muted-foreground">
                          {integration.externalWorkspaceName}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Connected{' '}
                        {new Date(integration.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleMappings(integration.provider)}
                        className="text-xs"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 mr-1" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 mr-1" />
                        )}
                        Manage Mappings
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDisconnectProvider(integration.provider)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Disconnect
                      </Button>
                    </div>
                  </div>

                  {/* Mappings section */}
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3">
                      {loadingMappings === integration.provider ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Project-Team Mappings
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenAddMapping(integration.provider)}
                              className="h-7 text-xs"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Add Mapping
                            </Button>
                          </div>

                          {mappings.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2">
                              No project mappings configured. Add one to sync issues.
                            </p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>External Project</TableHead>
                                  <TableHead>Tandemu Team</TableHead>
                                  <TableHead className="w-[80px]">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {mappings.map((mapping) => {
                                  const team = teams.find((t) => t.id === mapping.teamId);
                                  return (
                                    <TableRow key={mapping.id}>
                                      <TableCell className="text-sm">
                                        {mapping.externalProjectName ?? mapping.externalProjectId}
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {team?.name ?? mapping.teamId}
                                      </TableCell>
                                      <TableCell>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                          onClick={() =>
                                            handleDeleteMapping(integration.provider, mapping.id)
                                          }
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Available Integrations */}
      {availableProviders.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Add Integration</CardTitle>
                <CardDescription>Connect a new ticket system to your organization.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {availableProviders.map((provider) => (
                <div
                  key={provider.id}
                  className="rounded-lg border border-border p-4 flex flex-col justify-between"
                >
                  <div className="mb-3">
                    <div className="flex items-center gap-3 mb-2">
                      <ProviderIcon providerId={provider.id} size={24} />
                      <span className="text-sm font-medium">{provider.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{provider.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setConnectProvider(provider.id);
                      setConnectToken('');
                      setConnectWorkspace('');
                      setShowToken(false);
                    }}
                  >
                    <Plug className="h-3.5 w-3.5 mr-2" />
                    Connect
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {integrations.length === 0 && availableProviders.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <Plug className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No integrations available.</p>
          </CardContent>
        </Card>
      )}

      {/* Connect Dialog */}
      <Dialog open={!!connectProvider} onOpenChange={(open) => {
        if (!open) {
          setConnectProvider(null);
          setConnectError('');
        }
      }}>
        <DialogContent>
          {connectProvider && (() => {
            const meta = getProviderMeta(connectProvider);
            if (!meta) return null;
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center rounded-lg border bg-muted p-2">
                      <ProviderIcon providerId={connectProvider} size={24} />
                    </div>
                    <div>
                      <DialogTitle>Connect {meta.name}</DialogTitle>
                      <DialogDescription>
                        Provide your API credentials to connect this integration.
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                  {/* Help text */}
                  <div className="flex gap-3 rounded-lg border bg-muted/50 p-3">
                    <Info className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div className="text-sm text-muted-foreground">
                      <p>{meta.helpText}</p>
                      <a
                        href={meta.helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline mt-1"
                      >
                        Open settings
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>

                  {/* Error inside dialog */}
                  {connectError && (
                    <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive flex-shrink-0" />
                      <p className="text-sm text-destructive">{connectError}</p>
                    </div>
                  )}

                  {/* Token input */}
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">API Token / Personal Access Token</label>
                    <div className="relative">
                      <Input
                        type={showToken ? 'text' : 'password'}
                        value={connectToken}
                        onChange={(e) => setConnectToken(e.target.value)}
                        placeholder="Paste your token here"
                        className="pr-10"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Workspace input */}
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">
                      {meta.workspaceLabel}
                      {!meta.workspaceRequired && (
                        <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                      )}
                    </label>
                    <Input
                      value={connectWorkspace}
                      onChange={(e) => setConnectWorkspace(e.target.value)}
                      placeholder={meta.workspacePlaceholder}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConnectProvider(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConnect}
                    disabled={
                      connecting ||
                      !connectToken.trim() ||
                      (meta.workspaceRequired && !connectWorkspace.trim())
                    }
                  >
                    {connecting ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <>
                        <Plug className="h-4 w-4 mr-2" />
                        Connect
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={!!disconnectProvider} onOpenChange={(open) => { if (!open) setDisconnectProvider(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Integration</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect{' '}
              {disconnectProvider ? getProviderMeta(disconnectProvider)?.name : ''}? All project
              mappings for this integration will also be removed.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 pt-0">
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-300">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <p>This action cannot be undone.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDisconnectProvider(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                'Disconnect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Mapping Dialog */}
      <Dialog open={!!addMappingProvider} onOpenChange={(open) => { if (!open) setAddMappingProvider(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Project Mapping</DialogTitle>
            <DialogDescription>
              Map an external project to a Tandemu team to sync issues.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            {loadingProjects ? (
              <div className="flex items-center justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">External Project</label>
                  {externalProjects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No projects found. Verify your token has the right permissions.
                    </p>
                  ) : (
                    <Select value={selectedExternalProject} onValueChange={setSelectedExternalProject}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a project..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {externalProjects.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}{p.key ? ` (${p.key})` : ''}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Tandemu Team</label>
                  {teams.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No teams found. Create a team first.
                    </p>
                  ) : (
                    <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a team..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {teams.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddMappingProvider(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveMapping}
              disabled={savingMapping || !selectedExternalProject || !selectedTeamId}
            >
              {savingMapping ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
