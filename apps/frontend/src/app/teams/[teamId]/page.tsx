'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
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
import { Users, Trash2, UserPlus, ArrowLeft, UserMinus, Mail, Clock, MoreHorizontal, Pencil, Settings } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { DeleteTeamDialog } from '@/components/teams/delete-team-dialog';
import { RenameTeamDialog } from '@/components/teams/rename-team-dialog';
import { AddMemberDialog } from '@/components/teams/add-member-dialog';
import {
  getTeam,
  getTeamMembers,
  getMembers,
  getInvites,
  removeTeamMember,
  updateTeam,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Team, TeamMember, Membership, Invite } from '@tandemu/types';

export default function TeamDetailPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params);
  const router = useRouter();
  const { currentOrg } = useAuth();

  const [team, setTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamInvites, setTeamInvites] = useState<Invite[]>([]);
  const [orgMembers, setOrgMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);

  const loadTeamData = useCallback(async (orgId: string) => {
    try {
      const [teamData, members, memberList, inviteList] = await Promise.all([
        getTeam(orgId, teamId),
        getTeamMembers(orgId, teamId),
        getMembers(orgId),
        getInvites(orgId),
      ]);
      setTeam(teamData);
      setTeamMembers(members);
      setOrgMembers(memberList);
      setTeamInvites(inviteList.filter((inv) => inv.status === 'pending' && inv.teamId === teamId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (currentOrg) {
      loadTeamData(currentOrg.id);
    }
  }, [currentOrg, loadTeamData]);

  const handleRemoveMember = async (userId: string) => {
    if (!currentOrg) return;
    setError('');
    try {
      await removeTeamMember(currentOrg.id, teamId, userId);
      const members = await getTeamMembers(currentOrg.id, teamId);
      setTeamMembers(members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const refreshAfterMemberChange = async () => {
    if (!currentOrg) return;
    const members = await getTeamMembers(currentOrg.id, teamId);
    setTeamMembers(members);
  };

  const availableMembers = orgMembers.filter(
    (m: any) => !teamMembers.some((tm) => tm.userId === (m.id ?? m.userId))
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/teams')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!team || !currentOrg) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/teams')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <p className="text-sm text-muted-foreground">Team not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/teams')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{team.name}</h1>
            {team.description && (
              <p className="text-muted-foreground">{team.description}</p>
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
              <DropdownMenuItem onClick={() => setShowRenameDialog(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
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
          {teamMembers.length === 0 && teamInvites.length === 0 ? (
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
                    <TableCell className="text-muted-foreground text-sm">{member.email || '\u2014'}</TableCell>
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label htmlFor="doneWindowDays">Done window (days)</Label>
              <p className="text-sm text-muted-foreground">
                Show completed tasks from the last {team.settings?.doneWindowDays ?? 14} days.
              </p>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Input
                id="doneWindowDays"
                type="number"
                min={1}
                max={365}
                className="w-20"
                value={team.settings?.doneWindowDays ?? 14}
                onChange={(e) => {
                  const val = Math.max(1, parseInt(e.target.value, 10) || 14);
                  setTeam((prev) => prev ? { ...prev, settings: { ...prev.settings, doneWindowDays: val } } : prev);
                }}
              />
              <Button
                size="sm"
                disabled={savingSettings}
                onClick={async () => {
                  setSavingSettings(true);
                  try {
                    await updateTeam(currentOrg.id, teamId, {
                      settings: { doneWindowDays: team.settings?.doneWindowDays ?? 14 },
                    });
                    toast.success('Settings saved.');
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Failed to save settings');
                  } finally {
                    setSavingSettings(false);
                  }
                }}
              >
                {savingSettings ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AddMemberDialog
        open={showAddMemberDialog}
        onOpenChange={setShowAddMemberDialog}
        orgId={currentOrg.id}
        teamId={teamId}
        availableMembers={availableMembers}
        onAdded={refreshAfterMemberChange}
      />

      <DeleteTeamDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        orgId={currentOrg.id}
        teamId={teamId}
        teamName={team.name}
        onDeleted={() => router.push('/teams')}
      />

      <RenameTeamDialog
        open={showRenameDialog}
        onOpenChange={setShowRenameDialog}
        orgId={currentOrg.id}
        teamId={teamId}
        currentName={team.name}
        onRenamed={(newName) => {
          setTeam((prev) => prev ? { ...prev, name: newName } : prev);
        }}
      />
    </div>
  );
}
