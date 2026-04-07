'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { removeMember } from '@/lib/api';

interface RemoveMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  memberId: string;
  memberName: string;
  onRemoved: () => void;
}

export function RemoveMemberDialog({ open, onOpenChange, orgId, memberId, memberName, onRemoved }: RemoveMemberDialogProps) {
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeMember(orgId, memberId);
      onOpenChange(false);
      onRemoved();
      toast.success(`${memberName} has been removed.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Member</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove <span className="font-medium text-foreground">{memberName}</span>? They will be removed from all teams in this organization.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">This action cannot be undone.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleRemove} disabled={removing}>
            {removing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                Removing...
              </>
            ) : (
              'Remove Member'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
