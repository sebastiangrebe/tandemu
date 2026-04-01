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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { addTeamMember } from '@/lib/api';
import type { Membership } from '@tandemu/types';

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  teamId: string;
  availableMembers: Membership[];
  onAdded: () => void;
}

export function AddMemberDialog({ open, onOpenChange, orgId, teamId, availableMembers, onAdded }: AddMemberDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const selectedMember = availableMembers.find((m: any) => (m.id ?? m.userId) === selectedUserId);

  const reset = () => {
    setSelectedUserId('');
    setComboboxOpen(false);
  };

  const handleAdd = async () => {
    if (!selectedUserId) return;
    setAdding(true);
    try {
      await addTeamMember(orgId, teamId, selectedUserId);
      reset();
      onOpenChange(false);
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) reset();
      onOpenChange(o);
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Member to Team</DialogTitle>
          <DialogDescription>Select an organization member to add to this team.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {availableMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All organization members are already in this team.
            </p>
          ) : (
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboboxOpen}
                  className="w-full justify-between font-normal"
                >
                  {selectedMember
                    ? (selectedMember as any).name || (selectedMember as any).email
                    : 'Select a member...'}
                  <ChevronsUpDown className="opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search members..." />
                  <CommandList>
                    <CommandEmpty>No members found.</CommandEmpty>
                    <CommandGroup>
                      {availableMembers.map((m: any) => {
                        const id = m.id ?? m.userId;
                        const label = m.name || m.email || id;
                        return (
                          <CommandItem
                            key={id}
                            value={label}
                            onSelect={() => {
                              setSelectedUserId(id);
                              setComboboxOpen(false);
                            }}
                          >
                            <div className="flex flex-col">
                              <span>{label}</span>
                              {m.email && m.name && (
                                <span className="text-xs text-muted-foreground">{m.email}</span>
                              )}
                            </div>
                            <Check
                              className={cn(
                                'ml-auto',
                                selectedUserId === id ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={adding || !selectedUserId}>
            {adding ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              'Add Member'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
