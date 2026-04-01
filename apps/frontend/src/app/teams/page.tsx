'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layers, Plus, Users, Trash2, Mail } from 'lucide-react';
import { TeamsSkeleton } from '@/components/ui/skeleton-helpers';
import { CreateTeamDialog } from '@/components/teams/create-team-dialog';
import { DeleteTeamDialog } from '@/components/teams/delete-team-dialog';
import {
  getTeams,
  getTeamMembers,
  getInvites,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Team, Organization, Invite } from '@tandemu/types';

interface TeamWithMembers extends Team {
  memberCount?: number;
  pendingInvites?: number;
}

export default function TeamsPage() {
  const router = useRouter();
  const { currentOrg: authOrg } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeamWithMembers | null>(null);

  const loadTeams = useCallback(async (orgId: string) => {
    try {
      const [teamList, inviteList] = await Promise.all([
        getTeams(orgId),
        getInvites(orgId),
      ]);

      const pending = inviteList.filter((inv) => inv.status === 'pending');

      const teamsWithCounts = await Promise.all(
        teamList.map(async (team) => {
          try {
            const members = await getTeamMembers(orgId, team.id);
            const teamPendingCount = pending.filter((inv) => inv.teamId === team.id).length;
            return { ...team, memberCount: members.length, pendingInvites: teamPendingCount };
          } catch {
            const teamPendingCount = pending.filter((inv) => inv.teamId === team.id).length;
            return { ...team, memberCount: 0, pendingInvites: teamPendingCount };
          }
        })
      );

      setTeams(teamsWithCounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    }
  }, []);

  useEffect(() => {
    if (authOrg) {
      setOrg(authOrg);
      loadTeams(authOrg.id)
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
        .finally(() => setLoading(false));
    }
  }, [authOrg, loadTeams]);

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
              onClick={() => router.push(`/teams/${team.id}`)}
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
