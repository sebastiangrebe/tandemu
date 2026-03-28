'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, Users, Save, Plus, CreditCard, Lightbulb } from 'lucide-react';
import { SettingsSkeleton } from '@/components/ui/skeleton-helpers';
import { InviteDialog } from '@/components/invite-dialog';
import { toast } from 'sonner';
import {
  updateOrganization,
  getMembers,
  getInvites,
  cancelInvite,
  getTeams,
  createCheckout,
  createBillingPortal,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Organization, Membership, Invite, Team } from '@tandemu/types';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function RoleBadge({ role }: { role: string }) {
  switch (role) {
    case 'OWNER':
      return <Badge variant="default">Owner</Badge>;
    case 'ADMIN':
      return <Badge variant="secondary">Admin</Badge>;
    default:
      return <Badge variant="outline">Member</Badge>;
  }
}

export default function SettingsPage() {
  const { currentOrg: authOrg } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  // Org editing
  const [editOrgName, setEditOrgName] = useState('');
  const [editOrgSlug, setEditOrgSlug] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);

  // Members
  const [members, setMembers] = useState<Membership[]>([]);
  const [invitesList, setInvitesList] = useState<Invite[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  // ROI settings
  const [editHourlyRate, setEditHourlyRate] = useState(75);
  const [editSecsPerLine, setEditSecsPerLine] = useState(120);
  const [savingROI, setSavingROI] = useState(false);

  // Invite dialog
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const loadData = useCallback(async (activeOrg: Organization) => {
    try {
      setOrg(activeOrg);
      setEditOrgName(activeOrg.name);
      setEditOrgSlug(activeOrg.slug);
      const s = (activeOrg as any).settings;
      if (s?.developerHourlyRate) setEditHourlyRate(s.developerHourlyRate);
      if (s?.aiLineTimeEstimateSeconds) setEditSecsPerLine(s.aiLineTimeEstimateSeconds);

      const [memberList, invites, teamList] = await Promise.all([
        getMembers(activeOrg.id),
        getInvites(activeOrg.id),
        getTeams(activeOrg.id),
      ]);

      setMembers(memberList);
      setInvitesList(invites);
      setTeams(teamList);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }, []);

  useEffect(() => {
    if (authOrg) {
      loadData(authOrg).finally(() => setLoading(false));
    }
  }, [authOrg, loadData]);

  const handleSaveOrg = async () => {
    if (!org) return;
    setSavingOrg(true);
    try {
      const updated = await updateOrganization(org.id, {
        name: editOrgName.trim(),
        slug: editOrgSlug.trim(),
      });
      setOrg(updated);
      toast.success('Organization updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update organization');
    } finally {
      setSavingOrg(false);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!org) return;
    try {
      await cancelInvite(org.id, inviteId);
      setInvitesList(invitesList.filter((i) => i.id !== inviteId));
      toast.success('Invite cancelled.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel invite');
    }
  };

  const hasChanges = org && (editOrgName !== org.name || editOrgSlug !== org.slug);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your organization.</p>
        </div>
        <SettingsSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your organization.</p>
      </div>

      {/* Organization Card */}
      {org && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Organization</CardTitle>
                <CardDescription>Edit your organization details.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={editOrgName}
                  onChange={(e) => setEditOrgName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Slug</label>
                <Input
                  value={editOrgSlug}
                  onChange={(e) => setEditOrgSlug(generateSlug(e.target.value))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Plan</span>
              <Badge variant="secondary">{org.planTier}</Badge>
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-4 flex justify-end">
            <Button
              onClick={handleSaveOrg}
              disabled={savingOrg || !hasChanges}
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
          </CardFooter>
        </Card>
      )}

      {/* ROI Settings */}
      {org && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Insights Settings</CardTitle>
                <CardDescription>Configure assumptions for the Insights page. Conservative defaults are pre-filled.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Developer Hourly Rate ($)</label>
                <Input
                  type="number"
                  min={1}
                  value={editHourlyRate}
                  onChange={(e) => setEditHourlyRate(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">Fully-loaded cost per developer hour</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Est. Time per Manual Line (seconds)</label>
                <Input
                  type="number"
                  min={1}
                  value={editSecsPerLine}
                  onChange={(e) => setEditSecsPerLine(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">How long a developer takes to write one line manually</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              These values estimate how much manual coding work AI replaces. They are used to calculate capacity freed on the Insights page.
            </p>
          </CardContent>
          <CardFooter className="border-t px-6 py-4 flex justify-end">
            <Button
              onClick={async () => {
                if (!org) return;
                setSavingROI(true);
                try {
                  const updated = await updateOrganization(org.id, {
                    settings: { developerHourlyRate: editHourlyRate, aiLineTimeEstimateSeconds: editSecsPerLine },
                  });
                  setOrg(updated);
                  toast.success('Insights settings saved.');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to save settings');
                } finally {
                  setSavingROI(false);
                }
              }}
              disabled={savingROI}
            >
              {savingROI ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Billing Section — only shown when billing is enabled */}
      {org && process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Billing</CardTitle>
                <CardDescription>Manage your subscription and billing.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Current Plan</p>
                <p className="text-2xl font-bold">{org.planTier === 'FREE' ? 'Free' : 'Pro'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">
                  {members.length} seat{members.length !== 1 ? 's' : ''}
                </p>
                {org.planTier !== 'FREE' && (
                  <p className="text-sm text-muted-foreground">
                    ${members.length * 10}/month
                  </p>
                )}
              </div>
            </div>
            {org.planTier === 'FREE' ? (
              <Button
                onClick={async () => {
                  try {
                    const { url } = await createCheckout({
                      organizationId: org.id,
                      planTier: 'PRO',
                      successUrl: `${window.location.origin}/settings?billing=success`,
                      cancelUrl: `${window.location.origin}/settings`,
                    });
                    window.location.href = url;
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Failed to start checkout');
                  }
                }}
              >
                Upgrade to Pro — $10/seat/month
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const { url } = await createBillingPortal({
                      organizationId: org.id,
                      returnUrl: `${window.location.origin}/settings`,
                    });
                    window.location.href = url;
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Failed to open billing portal');
                  }
                }}
              >
                Manage Billing
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Members Section */}
      {org && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle>Members</CardTitle>
                  <CardDescription>
                    {members.length} member{members.length !== 1 ? 's' : ''}
                    {invitesList.length > 0 && ` · ${invitesList.length} pending`}
                  </CardDescription>
                </div>
              </div>
              {process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true' && org.planTier === 'FREE' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const { url } = await createCheckout({
                        organizationId: org.id,
                        planTier: 'PRO',
                        successUrl: `${window.location.origin}/settings?billing=success`,
                        cancelUrl: `${window.location.origin}/settings`,
                      });
                      window.location.href = url;
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Failed to start checkout');
                    }
                  }}
                >
                  Upgrade to Invite
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setShowInviteDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Invite
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {members.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-muted-foreground">{m.email}</TableCell>
                      <TableCell className="text-right">
                        <RoleBadge role={m.role} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {invitesList.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Pending Invites</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitesList.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.email}</TableCell>
                          <TableCell>
                            <RoleBadge role={inv.role} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(inv.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelInvite(inv.id)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              Cancel
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {members.length === 0 && invitesList.length === 0 && (
              <div className="flex flex-col items-center py-8">
                <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No members yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invite Dialog */}
      {org && (
        <InviteDialog
          open={showInviteDialog}
          onOpenChange={setShowInviteDialog}
          orgId={org.id}
          teams={teams}
          onInvitesSent={setInvitesList}
        />
      )}
    </div>
  );
}
