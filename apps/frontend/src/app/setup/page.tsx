'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import {
  createOrganization,
  createInvite,
  createTeam,
  switchOrg,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LayoutDashboard,
  Clock,
  Flame,
  Users,
  Plug,
  Settings,
  Layers,
  Plus,
  X,
  Mail,
  Trash2,
  ChevronsUpDown,
} from 'lucide-react';
import { toast } from 'sonner';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

interface InviteEntry {
  email: string;
  role: string;
  teamId: string;
}

interface TeamEntry {
  name: string;
  description: string;
}

const STEPS = [
  { description: 'Set up your workspace' },
  { description: 'Create your teams' },
  { description: 'Invite your team' },
];

const sidebarNav = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Activity', icon: Clock },
  { label: 'Friction Map', icon: Flame },
  { label: 'Teams', icon: Users },
  { label: 'Integrations', icon: Plug },
  { label: 'Settings', icon: Settings },
];

// --- Preview: Dashboard mockup ---

function DashboardPreview({ orgName, userName }: { orgName: string; userName: string }) {
  const orgInitial = orgName ? orgName.charAt(0).toUpperCase() : 'T';
  const userInitials = userName
    ? userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <div className="flex h-[540px] gap-0 rounded-xl border border-border bg-muted shadow-lg overflow-hidden">
      <div className="w-52 bg-background rounded-lg m-2 mr-0 flex flex-col p-2 text-sm">
        <div className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/80 mb-1">
          <div className="h-7 w-7 rounded-md bg-foreground text-background flex items-center justify-center text-xs font-bold shrink-0">
            {orgInitial}
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <p className="text-xs font-semibold truncate">{orgName || 'Your Org'}</p>
            <p className="text-[10px] text-muted-foreground">Free</p>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </div>
        <p className="px-2 pt-3 pb-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Platform</p>
        <div className="flex flex-col gap-0.5">
          {sidebarNav.map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                  i === 0 ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </div>
            );
          })}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/80 mt-1">
          <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <p className="text-xs font-semibold truncate">{userName || 'User'}</p>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </div>
      </div>
      <div className="flex-1 p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-muted/80" />
          <div className="h-5 flex-1 rounded bg-muted/80" />
        </div>
        <div className="flex-1 rounded-xl bg-background p-4 flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-muted/50" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 flex-1">
            <div className="rounded-lg bg-muted/50" />
            <div className="rounded-lg bg-muted/50" />
          </div>
          <div className="flex flex-col gap-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-2">
                <div className="h-5 flex-[2] rounded bg-muted/40" />
                <div className="h-5 flex-1 rounded bg-muted/40" />
                <div className="h-5 flex-1 rounded bg-muted/40" />
                <div className="h-5 w-12 rounded bg-muted/40" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Preview: Teams ---

function TeamsPreview({ teams, onRemove }: { teams: TeamEntry[]; onRemove: (index: number) => void }) {
  return (
    <div className="h-[540px] rounded-xl border border-border bg-background shadow-lg overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-border">
        <p className="text-sm font-semibold">Teams</p>
        <p className="text-xs text-muted-foreground mt-0.5">{teams.length} team{teams.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {teams.map((t, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Layers className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{t.name}</p>
              {t.description && (
                <p className="text-xs text-muted-foreground truncate">{t.description}</p>
              )}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">0 members</span>
            <button
              onClick={() => onRemove(i)}
              className="text-red-500 hover:text-red-600 shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {teams.length === 0 && (
          <div className="flex flex-col items-center py-14 text-muted-foreground">
            <Layers className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">Create teams to see them here</p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Preview: Invites ---

function InvitesPreview({
  invites,
  user,
  teams,
  onRemove,
}: {
  invites: InviteEntry[];
  user: { name: string; email: string } | null;
  teams: TeamEntry[];
  onRemove: (index: number) => void;
}) {
  const owner = { name: user?.name ?? 'You', email: user?.email ?? '' };

  return (
    <div className="h-[540px] rounded-xl border border-border bg-background shadow-lg overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-border">
        <p className="text-sm font-semibold">Members</p>
        <p className="text-xs text-muted-foreground mt-0.5">{1 + invites.length} member{invites.length !== 0 ? 's' : ''}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {/* Owner */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
            {owner.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{owner.name}</p>
            <p className="text-xs text-muted-foreground truncate">{owner.email}</p>
          </div>
          <span className="text-[10px] text-muted-foreground rounded-full bg-muted px-2 py-0.5 shrink-0">
            OWNER
          </span>
        </div>
        {/* Invited */}
        {invites.map((inv, i) => {
          const teamName = teams.find((_, ti) => `team-${ti}` === inv.teamId)?.name;
          return (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                {inv.email.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{inv.email.split('@')[0]}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {inv.email}
                  {teamName && <span className="ml-1 text-primary">· {teamName}</span>}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground rounded-full bg-muted px-2 py-0.5 shrink-0">
                {inv.role}
              </span>
              <button
                onClick={() => onRemove(i)}
                className="text-red-500 hover:text-red-600 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        {invites.length === 0 && (
          <div className="flex flex-col items-center py-14 text-muted-foreground">
            <Mail className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">Invite members to see them here</p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main ---

export default function SetupPage() {
  const { user, isLoading: authLoading } = useAuth();

  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Organization
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  // Step 2: Teams
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');

  // Step 3: Invites
  const [invites, setInvites] = useState<InviteEntry[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviteTeamId, setInviteTeamId] = useState('none');

  const handleOrgNameChange = (value: string) => {
    setOrgName(value);
    if (!slugEdited) setOrgSlug(generateSlug(value));
  };

  const handleSlugChange = (value: string) => {
    setSlugEdited(true);
    setOrgSlug(generateSlug(value));
  };

  const addTeam = () => {
    if (!teamName.trim()) return;
    if (teams.some((t) => t.name === teamName.trim())) return;
    setTeams([...teams, { name: teamName.trim(), description: teamDescription.trim() }]);
    setTeamName('');
    setTeamDescription('');
  };

  const removeTeam = (index: number) => {
    setTeams(teams.filter((_, i) => i !== index));
    // Clear team assignment from invites referencing the removed team
    setInvites(invites.map((inv) =>
      inv.teamId === `team-${index}` ? { ...inv, teamId: 'none' } : inv
    ));
  };

  const addInvite = () => {
    if (!inviteEmail.trim()) return;
    if (invites.some((i) => i.email === inviteEmail.trim())) return;
    setInvites([...invites, { email: inviteEmail.trim(), role: inviteRole, teamId: inviteTeamId }]);
    setInviteEmail('');
    setInviteRole('MEMBER');
    setInviteTeamId('none');
  };

  const removeInvite = (index: number) => setInvites(invites.filter((_, i) => i !== index));

  const canProceed = useCallback(() => {
    if (step === 0) return orgName.trim().length > 0 && orgSlug.trim().length > 0;
    return true;
  }, [step, orgName, orgSlug]);

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      // 1. Create org
      const org = await createOrganization({ name: orgName.trim(), slug: orgSlug.trim() });
      const orgId = org.id;

      // 2. Switch org context to get OWNER token before creating teams/invites
      const { accessToken } = await switchOrg(orgId);
      localStorage.setItem('tandemu_token', accessToken);
      localStorage.setItem('tandemu_current_org', orgId);

      // 3. Create teams
      const teamIdMap: Record<string, string> = {};
      const errors: string[] = [];

      for (let i = 0; i < teams.length; i++) {
        try {
          const team = await createTeam(orgId, { name: teams[i].name, description: teams[i].description || undefined });
          teamIdMap[`team-${i}`] = team.id;
        } catch (err) {
          errors.push(`Team "${teams[i].name}": ${err instanceof Error ? err.message : 'failed'}`);
        }
      }

      // 4. Send invites with team assignment
      for (const inv of invites) {
        try {
          const realTeamId = inv.teamId !== 'none' ? teamIdMap[inv.teamId] : undefined;
          await createInvite(orgId, { email: inv.email, role: inv.role, teamId: realTeamId });
        } catch (err) {
          errors.push(`Invite "${inv.email}": ${err instanceof Error ? err.message : 'failed'}`);
        }
      }

      if (errors.length > 0) {
        toast.error(`Setup completed with errors:\n${errors.join('\n')}`);
      }

      window.location.href = '/';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Setup failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <p className="text-muted-foreground">Please log in to continue.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      <div className="flex h-screen">
        {/* Left: Form */}
        <div className="w-full lg:w-[45%] flex flex-col overflow-y-auto items-center">
          <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-16 xl:px-20 py-16 max-w-xl w-full">
            <p className="text-sm text-muted-foreground mb-1">{step + 1}/{STEPS.length}</p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-8">
              {STEPS[step].description}
            </h1>

            {/* Step 1: Organization */}
            {step === 0 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Organization Name</label>
                  <Input
                    value={orgName}
                    onChange={(e) => handleOrgNameChange(e.target.value)}
                    placeholder="Acme Inc."
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Slug</label>
                  <Input
                    value={orgSlug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="acme-inc"
                  />
                  <p className="text-xs text-muted-foreground">
                    Used in URLs. Lowercase letters, numbers, and hyphens only.
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Create Teams */}
            {step === 1 && (
              <div className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Organize your members into teams. This step is optional.
                </p>
                <div className="space-y-2">
                  <Input
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Team name"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTeam(); } }}
                    autoFocus
                  />
                  <Input
                    value={teamDescription}
                    onChange={(e) => setTeamDescription(e.target.value)}
                    placeholder="Description (optional)"
                  />
                  <Button size="sm" onClick={addTeam} variant="outline" className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Team
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Invite Members */}
            {step === 2 && (
              <div className="space-y-6">
                {process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true' ? (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                    <p className="text-sm text-muted-foreground">
                      Inviting team members requires the Pro plan ($10/seat/month).
                      You can upgrade from the Settings page after setup, or skip this step.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Add people to your organization. You can also do this later.
                  </p>
                )}
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    className="flex-1"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInvite(); } }}
                    disabled={isSubmitting}
                    autoFocus
                  />
                  <Select value={inviteRole} onValueChange={setInviteRole} disabled={isSubmitting}>
                    <SelectTrigger className="w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="MEMBER">Member</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {teams.length > 0 && (
                    <Select value={inviteTeamId} onValueChange={setInviteTeamId} disabled={isSubmitting}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue placeholder="No team" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="none">No team</SelectItem>
                          {teams.map((t, i) => (
                            <SelectItem key={i} value={`team-${i}`}>{t.name}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                  <Button onClick={addInvite} size="icon" disabled={isSubmitting}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Navigation */}
            <Separator className="mt-8 mb-6" />
            <div className="flex items-center gap-3">
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep(step - 1)} disabled={isSubmitting}>Back</Button>
              )}
              <div className="flex-1" />
              {step < 2 ? (
                <>
                  {step > 0 && (
                    <Button variant="ghost" onClick={() => setStep(step + 1)} disabled={isSubmitting}>Skip</Button>
                  )}
                  <Button onClick={() => setStep(step + 1)} disabled={!canProceed() || isSubmitting}>
                    Continue
                  </Button>
                </>
              ) : (
                <Button onClick={handleComplete} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                      Setting up...
                    </>
                  ) : (
                    'Complete Setup'
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="hidden lg:flex lg:w-[55%] items-center justify-center p-6 xl:p-10">
          <div className="w-full max-w-3xl">
            {step === 0 && <DashboardPreview orgName={orgName} userName={user.name} />}
            {step === 1 && <TeamsPreview teams={teams} onRemove={removeTeam} />}
            {step === 2 && <InvitesPreview invites={invites} user={user} teams={teams} onRemove={removeInvite} />}
          </div>
        </div>
      </div>
    </div>
  );
}
