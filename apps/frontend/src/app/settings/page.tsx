'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Building2,
  Users,
  Shield,
  User,
  Layers,
  Mail,
  Plus,
  Trash2,
  UserPlus,
  UserMinus,
  Save,
  ChevronDown,
  ChevronRight,
  Plug,
} from 'lucide-react';
import Link from 'next/link';
import {
  getOrganizations,
  updateOrganization,
  getMembers,
  getTeams,
  createTeam,
  deleteTeam,
  getTeamMembers,
  addTeamMember,
  removeTeamMember,
  getInvites,
  createInvite,
  cancelInvite,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Organization, Membership, Team, TeamMember, Invite } from '@tandem/types';

function getPlanColor(tier: string) {
  switch (tier) {
    case 'ENTERPRISE':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'PRO':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    default:
      return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
  }
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

interface TeamWithDetails extends Team {
  members?: TeamMember[];
  memberCount?: number;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Org editing
  const [editOrgName, setEditOrgName] = useState('');
  const [editOrgSlug, setEditOrgSlug] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);

  // Members
  const [members, setMembers] = useState<Membership[]>([]);
  const [invitesList, setInvitesList] = useState<Invite[]>([]);

  // Invite form
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [sendingInvite, setSendingInvite] = useState(false);

  // Teams
  const [teams, setTeams] = useState<TeamWithDetails[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [teamMembersMap, setTeamMembersMap] = useState<Record<string, TeamMember[]>>({});
  const [loadingTeamMembers, setLoadingTeamMembers] = useState<string | null>(null);

  // Create team dialog
  const [showCreateTeamDialog, setShowCreateTeamDialog] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Add team member dialog
  const [showAddTeamMember, setShowAddTeamMember] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [addingTeamMember, setAddingTeamMember] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const orgs = await getOrganizations();
      if (orgs.length === 0) return;

      const currentOrg = orgs[0];
      setOrg(currentOrg);
      setEditOrgName(currentOrg.name);
      setEditOrgSlug(currentOrg.slug);

      const [memberList, teamList, invites] = await Promise.all([
        getMembers(currentOrg.id),
        getTeams(currentOrg.id),
        getInvites(currentOrg.id),
      ]);

      setMembers(memberList);
      setInvitesList(invites);

      // Load member counts
      const teamsWithCounts = await Promise.all(
        teamList.map(async (team) => {
          try {
            const tmembers = await getTeamMembers(currentOrg.id, team.id);
            return { ...team, members: tmembers, memberCount: tmembers.length };
          } catch {
            return { ...team, members: [], memberCount: 0 };
          }
        })
      );
      setTeams(teamsWithCounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }, []);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleSaveOrg = async () => {
    if (!org) return;
    setSavingOrg(true);
    setError('');
    try {
      const updated = await updateOrganization(org.id, {
        name: editOrgName.trim(),
        slug: editOrgSlug.trim(),
      });
      setOrg(updated);
      showSuccess('Organization updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update organization');
    } finally {
      setSavingOrg(false);
    }
  };

  const handleSendInvite = async () => {
    if (!org || !inviteEmail.trim()) return;
    setSendingInvite(true);
    setError('');
    try {
      await createInvite(org.id, { email: inviteEmail.trim(), role: inviteRole });
      const invites = await getInvites(org.id);
      setInvitesList(invites);
      setInviteEmail('');
      setInviteRole('MEMBER');
      setShowInviteForm(false);
      showSuccess('Invite sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setSendingInvite(false);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!org) return;
    setError('');
    try {
      await cancelInvite(org.id, inviteId);
      setInvitesList(invitesList.filter((i) => i.id !== inviteId));
      showSuccess('Invite cancelled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel invite');
    }
  };

  const handleToggleTeam = async (teamId: string) => {
    if (expandedTeam === teamId) {
      setExpandedTeam(null);
      return;
    }
    setExpandedTeam(teamId);
    if (!teamMembersMap[teamId] && org) {
      setLoadingTeamMembers(teamId);
      try {
        const tmembers = await getTeamMembers(org.id, teamId);
        setTeamMembersMap((prev) => ({ ...prev, [teamId]: tmembers }));
      } catch {
        setTeamMembersMap((prev) => ({ ...prev, [teamId]: [] }));
      } finally {
        setLoadingTeamMembers(null);
      }
    }
  };

  const handleCreateTeam = async () => {
    if (!org || !newTeamName.trim()) return;
    setCreatingTeam(true);
    setError('');
    try {
      await createTeam(org.id, {
        name: newTeamName.trim(),
        description: newTeamDescription.trim() || undefined,
      });
      setShowCreateTeamDialog(false);
      setNewTeamName('');
      setNewTeamDescription('');
      await loadData();
      showSuccess('Team created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!org) return;
    setError('');
    try {
      await deleteTeam(org.id, teamId);
      setTeams(teams.filter((t) => t.id !== teamId));
      if (expandedTeam === teamId) setExpandedTeam(null);
      showSuccess('Team deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team');
    }
  };

  const handleAddTeamMember = async (teamId: string) => {
    if (!org || !selectedUserId) return;
    setAddingTeamMember(true);
    setError('');
    try {
      await addTeamMember(org.id, teamId, selectedUserId);
      const tmembers = await getTeamMembers(org.id, teamId);
      setTeamMembersMap((prev) => ({ ...prev, [teamId]: tmembers }));
      setTeams(teams.map((t) => (t.id === teamId ? { ...t, memberCount: tmembers.length } : t)));
      setShowAddTeamMember(null);
      setSelectedUserId('');
      showSuccess('Member added to team.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAddingTeamMember(false);
    }
  };

  const handleRemoveTeamMember = async (teamId: string, userId: string) => {
    if (!org) return;
    setError('');
    try {
      await removeTeamMember(org.id, teamId, userId);
      const tmembers = await getTeamMembers(org.id, teamId);
      setTeamMembersMap((prev) => ({ ...prev, [teamId]: tmembers }));
      setTeams(teams.map((t) => (t.id === teamId ? { ...t, memberCount: tmembers.length } : t)));
      showSuccess('Member removed from team.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const inputClass =
    'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background';

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your organization and profile.</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your organization and profile.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-400">
          {successMsg}
        </div>
      )}

      {/* Profile & Organization */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Profile</CardTitle>
            </div>
            <CardDescription>Your account information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{user.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium text-sm">{user.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">User ID</p>
                  <p className="font-medium font-mono text-xs">{user.id}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No user data available.</p>
            )}
          </CardContent>
        </Card>

        {/* Organization Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Organization</CardTitle>
            </div>
            <CardDescription>Edit your organization details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {org ? (
              <>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-sm text-muted-foreground">Name</label>
                    <input
                      type="text"
                      value={editOrgName}
                      onChange={(e) => setEditOrgName(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm text-muted-foreground">Slug</label>
                    <input
                      type="text"
                      value={editOrgSlug}
                      onChange={(e) => setEditOrgSlug(generateSlug(e.target.value))}
                      className={inputClass}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Plan</p>
                      <Badge className={getPlanColor(org.planTier)} variant="outline">
                        {org.planTier}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Org ID</p>
                      <p className="font-mono text-xs text-muted-foreground">{org.id}</p>
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveOrg}
                  disabled={savingOrg || (editOrgName === org.name && editOrgSlug === org.slug)}
                >
                  {savingOrg ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </>
            ) : (
              <div className="flex flex-col items-center py-6">
                <Building2 className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No organization found.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Members Section */}
      {org && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle>Members</CardTitle>
                  <CardDescription>People in your organization.</CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={() => setShowInviteForm(!showInviteForm)}>
                <Mail className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Inline invite form */}
            {showInviteForm && (
              <div className="rounded-lg border border-border p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Send an invitation</p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    className={`${inputClass} flex-1`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSendInvite();
                      }
                    }}
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="flex h-10 rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <Button size="sm" onClick={handleSendInvite} disabled={sendingInvite || !inviteEmail.trim()} className="h-10">
                    {sendingInvite ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      'Send'
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Current members */}
            {members.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{m.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            m.role === 'OWNER'
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : m.role === 'ADMIN'
                              ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                              : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
                          }
                        >
                          {m.role}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Pending invites */}
            {invitesList.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Pending Invites</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitesList.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>{inv.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">
                            {inv.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(inv.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelInvite(inv.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            Cancel
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {members.length === 0 && invitesList.length === 0 && (
              <div className="flex flex-col items-center py-6">
                <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No members yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Teams Section */}
      {org && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle>Teams</CardTitle>
                  <CardDescription>Organize members into teams.</CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={() => setShowCreateTeamDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Team
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {teams.length === 0 ? (
              <div className="flex flex-col items-center py-6">
                <Layers className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No teams yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {teams.map((team) => {
                  const isExpanded = expandedTeam === team.id;
                  const tmembers = teamMembersMap[team.id] ?? [];
                  const availableForTeam = members.filter(
                    (m) => !tmembers.some((tm) => tm.userId === m.userId)
                  );

                  return (
                    <div key={team.id} className="rounded-lg border border-border">
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => handleToggleTeam(team.id)}
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-foreground">{team.name}</p>
                            {team.description && (
                              <p className="text-xs text-muted-foreground">{team.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {team.memberCount ?? 0} member{(team.memberCount ?? 0) !== 1 ? 's' : ''}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTeam(team.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-border px-4 py-3">
                          {loadingTeamMembers === team.id ? (
                            <div className="flex items-center justify-center py-4">
                              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  Team Members
                                </p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowAddTeamMember(team.id);
                                  }}
                                  className="h-7 text-xs"
                                >
                                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                                  Add
                                </Button>
                              </div>
                              {tmembers.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2">No members in this team.</p>
                              ) : (
                                <div className="space-y-1">
                                  {tmembers.map((tm) => (
                                    <div
                                      key={tm.id}
                                      className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-muted/30"
                                    >
                                      <span className="text-sm font-mono text-foreground">{tm.userId}</span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveTeamMember(team.id, tm.userId)}
                                        className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                      >
                                        <UserMinus className="h-3.5 w-3.5 mr-1" />
                                        Remove
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Team Dialog */}
      <Dialog open={showCreateTeamDialog} onClose={() => setShowCreateTeamDialog(false)}>
        <DialogContent>
          <DialogHeader onClose={() => setShowCreateTeamDialog(false)}>
            <DialogTitle>Create Team</DialogTitle>
            <DialogDescription>Add a new team to your organization.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Name</label>
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Engineering"
                className={inputClass}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateTeam();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Description</label>
              <input
                type="text"
                value={newTeamDescription}
                onChange={(e) => setNewTeamDescription(e.target.value)}
                placeholder="Optional description"
                className={inputClass}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCreateTeamDialog(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateTeam} disabled={creatingTeam || !newTeamName.trim()}>
              {creatingTeam ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Integrations Link */}
      <Card>
        <CardContent className="p-6">
          <Link href="/integrations" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 transition-colors">
              <Plug className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground group-hover:text-purple-400 transition-colors">
                Integrations
              </p>
              <p className="text-xs text-muted-foreground">
                Connect your ticket system (GitHub Issues, Jira, Linear, ClickUp)
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-purple-400 transition-colors" />
          </Link>
        </CardContent>
      </Card>

      {/* Add Team Member Dialog */}
      <Dialog open={!!showAddTeamMember} onClose={() => setShowAddTeamMember(null)}>
        <DialogContent>
          <DialogHeader onClose={() => setShowAddTeamMember(null)}>
            <DialogTitle>Add Member to Team</DialogTitle>
            <DialogDescription>Select an organization member to add.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {showAddTeamMember && (() => {
              const tmembers = teamMembersMap[showAddTeamMember] ?? [];
              const available = members.filter(
                (m) => !tmembers.some((tm) => tm.userId === m.userId)
              );
              return available.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  All organization members are already in this team.
                </p>
              ) : (
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select a member...</option>
                  {available.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.userId} ({m.role})
                    </option>
                  ))}
                </select>
              );
            })()}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddTeamMember(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => showAddTeamMember && handleAddTeamMember(showAddTeamMember)}
              disabled={addingTeamMember || !selectedUserId}
            >
              {addingTeamMember ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                'Add Member'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
