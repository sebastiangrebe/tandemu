'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { updateTeam } from '@/lib/api';

interface RenameTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  teamId: string;
  currentName: string;
  onRenamed: (newName: string) => void;
}

export function RenameTeamDialog({ open, onOpenChange, orgId, teamId, currentName, onRenamed }: RenameTeamDialogProps) {
  const [name, setName] = useState(currentName);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  const handleRename = async () => {
    if (!name.trim() || name.trim() === currentName) return;
    setRenaming(true);
    try {
      await updateTeam(orgId, teamId, { name: name.trim() });
      onOpenChange(false);
      onRenamed(name.trim());
      toast.success('Team renamed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename team');
    } finally {
      setRenaming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Team</DialogTitle>
          <DialogDescription>Enter a new name for this team.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Team name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRename();
              }
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleRename} disabled={renaming || !name.trim() || name.trim() === currentName}>
            {renaming ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              'Rename'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
