'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Layers, Plus, Users, Trash2, UserPlus, ArrowLeft, UserMinus } from 'lucide-react';
import {
  getOrganizations,
  getTeams,
  createTeam,
  deleteTeam,
  getTeamMembers,
  addTeamMember,
  removeTeamMember,
  getMembers,
} from '@/lib/api';
import type { Team, TeamMember, Membership, Organization } from '@tandem/types';

interface TeamWithMembers extends Team {
  members?: TeamMember[];
  memberCount?: number;
}

export default function TeamsPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [orgMembers, setOrgMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selected team detail view
  const [selectedTeam, setSelectedTeam] = useState<TeamWithMembers | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Create team dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Add member dialog
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  const loadTeams = useCallback(async (orgId: string) => {
    try {
      const [teamList, memberList] = await Promise.all([
        getTeams(orgId),
        getMembers(orgId),
      ]);

      // Load member counts for each team
      const teamsWithCounts = await Promise.all(
        teamList.map(async (team) => {
          try {
            const members = await getTeamMembers(orgId, team.id);
            return { ...team, members, memberCount: members.length };
          } catch {
            return { ...team, members: [], memberCount: 0 };
          }
        })
      );

      setTeams(teamsWithCounts);
      setOrgMembers(memberList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    }
  }, []);

  useEffect(() => {
    getOrganizations()
      .then((orgs) => {
        if (orgs.length > 0) {
          setOrg(orgs[0]);
          return loadTeams(orgs[0].id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [loadTeams]);

  const handleCreateTeam = async () => {
    if (!org || !newTeamName.trim()) return;
    setCreating(true);
    setError('');
    try {
      await createTeam(org.id, {
        name: newTeamName.trim(),
        description: newTeamDescription.trim() || undefined,
      });
      await loadTeams(org.id);
      setShowCreateDialog(false);
      setNewTeamName('');
      setNewTeamDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!org) return;
    setError('');
    try {
      await deleteTeam(org.id, teamId);
      if (selectedTeam?.id === teamId) {
        setSelectedTeam(null);
      }
      await loadTeams(org.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team');
    }
  };

  const handleSelectTeam = async (team: TeamWithMembers) => {
    if (!org) return;
    setSelectedTeam(team);
    setLoadingMembers(true);
    try {
      const members = await getTeamMembers(org.id, team.id);
      setTeamMembers(members);
    } catch {
      setTeamMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleAddMember = async () => {
    if (!org || !selectedTeam || !selectedUserId) return;
    setAddingMember(true);
    setError('');
    try {
      await addTeamMember(org.id, selectedTeam.id, selectedUserId);
      const members = await getTeamMembers(org.id, selectedTeam.id);
      setTeamMembers(members);
      await loadTeams(org.id);
      setShowAddMemberDialog(false);
      setSelectedUserId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!org || !selectedTeam) return;
    setError('');
    try {
      await removeTeamMember(org.id, selectedTeam.id, userId);
      const members = await getTeamMembers(org.id, selectedTeam.id);
      setTeamMembers(members);
      await loadTeams(org.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const availableMembers = orgMembers.filter(
    (m) => !teamMembers.some((tm) => tm.userId === m.userId)
  );

  const inputClass =
    'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background';

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
          <p className="text-muted-foreground">Manage your teams and members.</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  // Team detail view
  if (selectedTeam) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setSelectedTeam(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{selectedTeam.name}</h1>
            {selectedTeam.description && (
              <p className="text-muted-foreground">{selectedTeam.description}</p>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle>Members</CardTitle>
                  <CardDescription>{teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}</CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={() => setShowAddMemberDialog(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingMembers ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : teamMembers.length === 0 ? (
              <div className="flex flex-col items-center py-8">
                <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No members yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-mono text-sm">{member.userId}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(member.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(member.userId)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add Member Dialog */}
        <Dialog open={showAddMemberDialog} onClose={() => setShowAddMemberDialog(false)}>
          <DialogContent>
            <DialogHeader onClose={() => setShowAddMemberDialog(false)}>
              <DialogTitle>Add Member to Team</DialogTitle>
              <DialogDescription>Select an organization member to add to this team.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              {availableMembers.length === 0 ? (
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
                  {availableMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.userId} ({m.role})
                    </option>
                  ))}
                </select>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowAddMemberDialog(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddMember}
                disabled={addingMember || !selectedUserId}
              >
                {addingMember ? (
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

  // Team list view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
          <p className="text-muted-foreground">Manage your teams and members.</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Team
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <Layers className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-1">No teams yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first team to organize your members.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Team
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Card
              key={team.id}
              className="cursor-pointer transition-colors hover:border-primary/50"
              onClick={() => handleSelectTeam(team)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{team.name}</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTeam(team.id);
                    }}
                    className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {team.description && (
                  <CardDescription>{team.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>
                    {team.memberCount ?? 0} member{(team.memberCount ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Team Dialog */}
      <Dialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)}>
        <DialogContent>
          <DialogHeader onClose={() => setShowCreateDialog(false)}>
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
            <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateTeam}
              disabled={creating || !newTeamName.trim()}
            >
              {creating ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
