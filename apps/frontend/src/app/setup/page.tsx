'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  createOrganization,
  createInvite,
  createTeam,
  switchOrg,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, Users, Layers, Check, Plus, X, ArrowRight, ArrowLeft } from 'lucide-react';

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
}

interface TeamEntry {
  name: string;
  description: string;
}

const STEPS = [
  { label: 'Organization', icon: Building2 },
  { label: 'Invite Members', icon: Users },
  { label: 'Create Teams', icon: Layers },
];

export default function SetupPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Organization
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  // Step 2: Invites
  const [invites, setInvites] = useState<InviteEntry[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');

  // Step 3: Teams
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');

  const handleOrgNameChange = (value: string) => {
    setOrgName(value);
    if (!slugEdited) {
      setOrgSlug(generateSlug(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugEdited(true);
    setOrgSlug(generateSlug(value));
  };

  const addInvite = () => {
    if (!inviteEmail.trim()) return;
    if (invites.some((i) => i.email === inviteEmail.trim())) return;
    setInvites([...invites, { email: inviteEmail.trim(), role: inviteRole }]);
    setInviteEmail('');
    setInviteRole('MEMBER');
  };

  const removeInvite = (index: number) => {
    setInvites(invites.filter((_, i) => i !== index));
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
  };

  const canProceed = useCallback(() => {
    if (step === 0) return orgName.trim().length > 0 && orgSlug.trim().length > 0;
    return true; // Steps 1 and 2 are optional
  }, [step, orgName, orgSlug]);

  const handleComplete = async () => {
    setError('');
    setIsSubmitting(true);

    try {
      // Create a new organization
      const org = await createOrganization({ name: orgName.trim(), slug: orgSlug.trim() });
      const orgId = org.id;

      // Send invites
      const invitePromises = invites.map((inv) =>
        createInvite(orgId, { email: inv.email, role: inv.role })
      );
      await Promise.allSettled(invitePromises);

      // Create teams
      const teamPromises = teams.map((t) =>
        createTeam(orgId, { name: t.name, description: t.description || undefined })
      );
      await Promise.allSettled(teamPromises);

      // Get a new JWT with the org context and reload
      const { accessToken } = await switchOrg(orgId);
      localStorage.setItem('tandemu_token', accessToken);
      localStorage.setItem('tandemu_current_org', orgId);
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Please log in to continue.</p>
      </div>
    );
  }

  const inputClass =
    'flex h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/30 transition-all';

  return (
    <div className="min-h-screen flex flex-col items-center bg-background noise-bg py-12 px-4">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-2.5 relative z-10">
        <div className="relative w-9 h-9">
          <div className="absolute inset-0 bg-primary rounded-lg rotate-45" />
          <div className="absolute inset-[3px] bg-background rounded-[5px] rotate-45" />
          <div className="absolute inset-[6px] bg-primary rounded-[3px] rotate-45" />
        </div>
        <span className="text-xl font-bold text-foreground tracking-tight">Tandemu</span>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isCompleted = i < step;
          return (
            <div key={s.label} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-px w-8 ${
                    isCompleted ? 'bg-primary' : 'bg-border'
                  }`}
                />
              )}
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isCompleted
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Content */}
      <Card className="w-full max-w-lg">
        <CardContent className="p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Step 1: Organization */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Set up your organization</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Give your workspace a name. You can change this later.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Organization Name</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => handleOrgNameChange(e.target.value)}
                  placeholder="Acme Inc."
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Slug</label>
                <input
                  type="text"
                  value={orgSlug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="acme-inc"
                  className={inputClass}
                />
                <p className="text-xs text-muted-foreground">
                  Used in URLs. Lowercase letters, numbers, and hyphens only.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Invite Members */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Invite team members</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Add people to your organization. You can also do this later.
                </p>
              </div>
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
                      addInvite();
                    }
                  }}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="flex h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--input-bg)] px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <Button size="sm" onClick={addInvite} className="h-10 px-3">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {invites.length > 0 && (
                <div className="space-y-2">
                  {invites.map((inv, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-foreground">{inv.email}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {inv.role}
                        </span>
                      </div>
                      <button
                        onClick={() => removeInvite(i)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Create Teams */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Create teams</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Organize your members into teams. This step is optional.
                </p>
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Team name"
                  className={inputClass}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTeam();
                    }
                  }}
                />
                <input
                  type="text"
                  value={teamDescription}
                  onChange={(e) => setTeamDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className={inputClass}
                />
                <Button size="sm" onClick={addTeam} variant="outline" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Team
                </Button>
              </div>
              {teams.length > 0 && (
                <div className="space-y-2">
                  {teams.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{t.name}</p>
                        {t.description && (
                          <p className="text-xs text-muted-foreground">{t.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => removeTeam(i)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between">
            <div>
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {step < 2 ? (
                <>
                  {step > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setStep(step + 1)}>
                      Skip
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => setStep(step + 1)}
                    disabled={!canProceed()}
                  >
                    Continue
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </>
              ) : (
                <Button onClick={handleComplete} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    'Complete Setup'
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
