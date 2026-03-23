'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Layers, Plus, Users, Trash2, UserPlus, ArrowLeft, UserMinus, Mail, Clock, MoreHorizontal, Pencil } from 'lucide-react';
import { TeamsSkeleton } from '@/components/ui/skeleton-helpers';
import { CreateTeamDialog } from '@/components/teams/create-team-dialog';
import { DeleteTeamDialog } from '@/components/teams/delete-team-dialog';
import { RenameTeamDialog } from '@/components/teams/rename-team-dialog';
import { AddMemberDialog } from '@/components/teams/add-member-dialog';
import {
  getOrganizations,
  getTeams,
  getTeamMembers,
  removeTeamMember,
  getMembers,
  getInvites,
} from '@/lib/api';
import type { Team, TeamMember, Membership, Organization, Invite } from '@tandemu/types';

interface TeamWithMembers extends Team {
  members?: TeamMember[];
  memberCount?: number;
  pendingInvites?: number;
}

export default function TeamsPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [orgMembers, setOrgMembers] = useState<Membership[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selected team detail view
  const [selectedTeam, setSelectedTeam] = useState<TeamWithMembers | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamInvites, setTeamInvites] = useState<Invite[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeamWithMembers | null>(null);
  const [renameTarget, setRenameTarget] = useState<TeamWithMembers | null>(null);

  const loadTeams = useCallback(async (orgId: string) => {
    try {
      const [teamList, memberList, inviteList] = await Promise.all([
        getTeams(orgId),
        getMembers(orgId),
        getInvites(orgId),
      ]);

      const pending = inviteList.filter((inv) => inv.status === 'pending');
      setPendingInvites(pending);

      const teamsWithCounts = await Promise.all(
        teamList.map(async (team) => {
          try {
            const members = await getTeamMembers(orgId, team.id);
            const teamPendingCount = pending.filter((inv) => inv.teamId === team.id).length;
            return { ...team, members, memberCount: members.length, pendingInvites: teamPendingCount };
          } catch {
            const teamPendingCount = pending.filter((inv) => inv.teamId === team.id).length;
            return { ...team, members: [], memberCount: 0, pendingInvites: teamPendingCount };
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

  const handleSelectTeam = async (team: TeamWithMembers) => {
    if (!org) return;
    setSelectedTeam(team);
    setLoadingMembers(true);
    try {
      const members = await getTeamMembers(org.id, team.id);
      setTeamMembers(members);
      setTeamInvites(pendingInvites.filter((inv) => inv.teamId === team.id));
    } catch {
      setTeamMembers([]);
      setTeamInvites([]);
    } finally {
      setLoadingMembers(false);
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

  const refreshAfterMemberChange = async () => {
    if (!org || !selectedTeam) return;
    const members = await getTeamMembers(org.id, selectedTeam.id);
    setTeamMembers(members);
    await loadTeams(org.id);
  };

  const availableMembers = orgMembers.filter(
    (m: any) => !teamMembers.some((tm) => tm.userId === (m.id ?? m.userId))
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
          <p className="text-muted-foreground">Manage your teams and members.</p>
        </div>
        <TeamsSkeleton />
      </div>
    );
  }

  // Team detail view
  if (selectedTeam && org) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setRenameTarget(selectedTeam)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDeleteTarget(selectedTeam)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
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
            ) : teamMembers.length === 0 && teamInvites.length === 0 ? (
              <div className="flex flex-col items-center py-8">
                <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No members yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((member: any) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.name || member.userId}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{member.email || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                          Active
                        </Badge>
                      </TableCell>
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
                  {teamInvites.map((invite) => (
                    <TableRow key={invite.id} className="opacity-70">
                      <TableCell className="font-medium">
                        <span className="text-muted-foreground">{invite.email.split('@')[0]}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{invite.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(invite.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">Invited</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <AddMemberDialog
          open={showAddMemberDialog}
          onOpenChange={setShowAddMemberDialog}
          orgId={org.id}
          teamId={selectedTeam.id}
          availableMembers={availableMembers}
          onAdded={refreshAfterMemberChange}
        />

        <DeleteTeamDialog
          open={!!deleteTarget}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          orgId={org.id}
          teamId={deleteTarget?.id ?? ''}
          teamName={deleteTarget?.name ?? ''}
          onDeleted={() => {
            if (selectedTeam?.id === deleteTarget?.id) setSelectedTeam(null);
            loadTeams(org.id);
          }}
        />

        <RenameTeamDialog
          open={!!renameTarget}
          onOpenChange={(open) => { if (!open) setRenameTarget(null); }}
          orgId={org.id}
          teamId={renameTarget?.id ?? ''}
          currentName={renameTarget?.name ?? ''}
          onRenamed={(newName) => {
            if (selectedTeam?.id === renameTarget?.id) {
              setSelectedTeam((prev) => prev ? { ...prev, name: newName } : prev);
            }
            loadTeams(org.id);
          }}
        />
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
                      setDeleteTarget(team);
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
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    <span>
                      {team.memberCount ?? 0} member{(team.memberCount ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {(team.pendingInvites ?? 0) > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-4 w-4 text-amber-500" />
                      <span className="text-amber-500">
                        {team.pendingInvites} pending
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {org && (
        <>
          <CreateTeamDialog
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
            orgId={org.id}
            onCreated={() => loadTeams(org.id)}
          />

          <DeleteTeamDialog
            open={!!deleteTarget}
            onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
            orgId={org.id}
            teamId={deleteTarget?.id ?? ''}
            teamName={deleteTarget?.name ?? ''}
            onDeleted={() => loadTeams(org.id)}
          />
        </>
      )}
    </div>
  );
}
