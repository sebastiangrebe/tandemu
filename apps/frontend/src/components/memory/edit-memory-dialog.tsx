'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { updateMemory, type MemoryEntry } from '@/lib/api';

const CATEGORIES = [
  'architecture',
  'pattern',
  'gotcha',
  'preference',
  'style',
  'dependency',
  'decision',
  'uncategorized',
] as const;

interface EditMemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memory: MemoryEntry;
  onUpdated: () => void;
}

export function EditMemoryDialog({ open, onOpenChange, memory, onUpdated }: EditMemoryDialogProps) {
  const [content, setContent] = useState(memory.content);
  const [category, setCategory] = useState(memory.metadata.category ?? 'uncategorized');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setContent(memory.content);
      setCategory(memory.metadata.category ?? 'uncategorized');
    }
  }, [open, memory]);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const body: { content?: string; metadata?: Record<string, unknown> } = {};
      if (content.trim() !== memory.content) {
        body.content = content.trim();
      }
      if (category !== (memory.metadata.category ?? 'uncategorized')) {
        body.metadata = { category };
      }
      if (body.content || body.metadata) {
        await updateMemory(memory.id, body);
        toast.success('Memory updated.');
        onUpdated();
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update memory');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Memory</DialogTitle>
          <DialogDescription>Update the content or category of this memory.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Memory content..."
            rows={5}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Category:</span>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !content.trim()}>
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
