'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, Users, Save, Plus, CreditCard, Lightbulb, Brain, Trash2 } from 'lucide-react';
import { SettingsSkeleton } from '@/components/ui/skeleton-helpers';
import { InviteDialog } from '@/components/invite-dialog';
import { RemoveMemberDialog } from '@/components/remove-member-dialog';
import { toast } from 'sonner';
import {
  updateOrganization,
  getMembers,
  removeMember,
  getInvites,
  cancelInvite,
  getTeams,
  createCheckout,
  createBillingPortal,
  getInvoices,
} from '@/lib/api';
import type { Invoice } from '@/lib/api';
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
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsPageContent />
    </Suspense>
  );
}

function SettingsPageContent() {
  const { currentOrg: authOrg, user: authUser, isAdmin } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const [removingMember, setRemovingMember] = useState<{ id: string; name: string } | null>(null);

  // ROI settings
  const [editHourlyRate, setEditHourlyRate] = useState(75);
  const [editSecsPerLine, setEditSecsPerLine] = useState(120);
  const [savingROI, setSavingROI] = useState(false);

  // Memory settings
  const [editDraftRetention, setEditDraftRetention] = useState(30);
  const [savingMemory, setSavingMemory] = useState(false);

  // Invoices (OWNER only)
  const [invoices, setInvoices] = useState<Invoice[]>([]);

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
      if (s?.draftRetentionDays) setEditDraftRetention(s.draftRetentionDays);

      const [memberList, invites, teamList] = await Promise.all([
        getMembers(activeOrg.id),
        getInvites(activeOrg.id),
        getTeams(activeOrg.id),
      ]);

      setMembers(memberList);
      setInvitesList(invites);
      setTeams(teamList);

      // Load invoices for OWNER only
      if (process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true' && activeOrg.planTier !== 'FREE') {
        getInvoices().then(setInvoices).catch(() => {});
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }, []);

  useEffect(() => {
    if (authOrg) {
      loadData(authOrg).finally(() => setLoading(false));
    }
  }, [authOrg, loadData]);

  useEffect(() => {
    if (searchParams.get('billing') === 'success') {
      toast.success('Subscription activated! Welcome to Tandemu Pro.');
      router.replace('/settings', { scroll: false });
    }
  }, [searchParams, router]);

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

      {/* ROI & Memory Settings */}
      {org && (
        <div className="grid gap-6 lg:grid-cols-2">
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

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Memory Settings</CardTitle>
                <CardDescription>Configure how AI memory drafts are managed.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs space-y-2">
              <label className="text-sm font-medium">Draft Retention (days)</label>
              <Input
                type="number"
                min={1}
                max={365}
                value={editDraftRetention}
                onChange={(e) => setEditDraftRetention(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Draft org memories older than this are automatically cleaned up. Drafts linked to completed tasks are promoted instead.
              </p>
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-4 flex justify-end">
            <Button
              onClick={async () => {
                if (!org) return;
                setSavingMemory(true);
                try {
                  const updated = await updateOrganization(org.id, {
                    settings: { draftRetentionDays: editDraftRetention },
                  });
                  setOrg(updated);
                  toast.success('Memory settings saved.');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to save settings');
                } finally {
                  setSavingMemory(false);
                }
              }}
              disabled={savingMemory}
            >
              {savingMemory ? (
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
        </div>
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
                    ${members.length * 25}/month
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
                Upgrade to Pro — $25/seat/month
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

      {/* Invoice History — OWNER only, paid plans only */}
      {org && process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true' && org.planTier !== 'FREE' && authUser?.role === 'OWNER' && invoices.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Invoices</CardTitle>
                <CardDescription>Your recent billing history.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-sm">
                      {new Date(inv.createdAt * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(inv.periodStart * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' – '}
                      {new Date(inv.periodEnd * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {inv.currency.toUpperCase()} {(inv.amountPaid / 100).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={inv.status === 'paid' ? 'default' : 'secondary'} className="text-xs">
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {inv.hostedInvoiceUrl && (
                        <a
                          href={inv.hostedInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          View
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                    <TableHead className={isAdmin ? '' : 'text-right'}>Role</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-muted-foreground">{m.email}</TableCell>
                      <TableCell className={isAdmin ? '' : 'text-right'}>
                        <RoleBadge role={m.role} />
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          {m.role !== 'OWNER' && m.id !== authUser?.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRemovingMember({ id: m.id, name: m.name })}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
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

      {/* Remove Member Dialog */}
      {org && removingMember && (
        <RemoveMemberDialog
          open={!!removingMember}
          onOpenChange={(open) => { if (!open) setRemovingMember(null); }}
          orgId={org.id}
          memberId={removingMember.id}
          memberName={removingMember.name}
          onRemoved={() => {
            setMembers(members.filter((m: any) => m.id !== removingMember.id));
            setRemovingMember(null);
          }}
        />
      )}
    </div>
  );
}
