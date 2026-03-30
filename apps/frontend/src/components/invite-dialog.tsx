'use client';

import { useState } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { createInvite, getInvites } from '@/lib/api';
import type { Team, Invite } from '@tandemu/types';

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  teams: Team[];
  onInvitesSent: (invites: Invite[]) => void;
}

export function InviteDialog({ open, onOpenChange, orgId, teams, onInvitesSent }: InviteDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [teamId, setTeamId] = useState('');
  const [sending, setSending] = useState(false);

  const reset = () => {
    setEmail('');
    setRole('MEMBER');
    setTeamId('');
  };

  const handleSend = async () => {
    if (!email.trim()) return;
    setSending(true);
    try {
      await createInvite(orgId, {
        email: email.trim(),
        role,
        teamId: teamId || undefined,
      });
      const invites = await getInvites(orgId);
      onInvitesSent(invites);
      reset();
      onOpenChange(false);
      toast.success('Invite sent.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) reset();
      onOpenChange(o);
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
          <DialogDescription>Send an invitation to join your organization.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSend();
                }
              }}
              autoFocus
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                Team <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Select value={teamId} onValueChange={(v) => setTeamId(v === 'none' ? '' : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">No team</SelectItem>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !email.trim()}
          >
            {sending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Send Invite
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
