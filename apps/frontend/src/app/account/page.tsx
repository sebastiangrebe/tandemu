'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, Mail, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { getEmailAliases, addEmailAlias, removeEmailAlias } from '@/lib/api';
import type { UserEmail } from '@/lib/api';
import { toast } from 'sonner';

export default function AccountPage() {
  const { user } = useAuth();
  const [emailAliases, setEmailAliases] = useState<UserEmail[]>([]);
  const [newAliasEmail, setNewAliasEmail] = useState('');
  const [addingAlias, setAddingAlias] = useState(false);

  useEffect(() => {
    if (user) {
      getEmailAliases().then(setEmailAliases).catch(() => {});
    }
  }, [user]);

  const handleAddAlias = async () => {
    if (!newAliasEmail.trim()) return;
    setAddingAlias(true);
    try {
      const alias = await addEmailAlias(newAliasEmail.trim());
      setEmailAliases((prev) => [...prev, alias]);
      setNewAliasEmail('');
      toast.success('Email alias added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add email');
    } finally {
      setAddingAlias(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Account</h1>
        <p className="text-muted-foreground">Your personal account settings.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your account information.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {user ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{user.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium text-sm">{user.email}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No user data available.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Email Aliases</CardTitle>
              <CardDescription>
                Add alternative emails so tasks assigned to those addresses show up as yours.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailAliases.length > 0 && (
            <div className="space-y-2">
              {emailAliases.map((alias) => (
                <div key={alias.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span>{alias.email}</span>
                    {alias.isPrimary && <Badge variant="secondary">Primary</Badge>}
                  </div>
                  {!alias.isPrimary && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await removeEmailAlias(alias.id);
                          setEmailAliases((prev) => prev.filter((a) => a.id !== alias.id));
                          toast.success('Email removed');
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Failed to remove');
                        }
                      }}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              type="email"
              value={newAliasEmail}
              onChange={(e) => setNewAliasEmail(e.target.value)}
              placeholder="alias@example.com"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddAlias();
                }
              }}
            />
            <Button
              size="sm"
              disabled={addingAlias || !newAliasEmail.trim()}
              onClick={handleAddAlias}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
