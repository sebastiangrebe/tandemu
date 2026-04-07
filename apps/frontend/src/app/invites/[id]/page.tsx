'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getInviteDetails, acceptInvite, getOrganizations } from '@/lib/api';
import { LoadingScreen } from '@/components/loading-screen';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

interface InviteDetails {
  id: string;
  organizationName: string;
  inviterName: string;
  role: string;
  status: string;
  expiresAt: string;
}

export default function InviteAcceptPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, switchOrg } = useAuth();
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (authLoading || !isAuthenticated || fetched.current) return;
    fetched.current = true;

    getInviteDetails(id)
      .then(setInvite)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load invite');
      });
  }, [id, authLoading, isAuthenticated]);

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      const result = await acceptInvite(id);
      setAccepted(true);
      toast.success(`Joined ${invite?.organizationName}!`);

      // Switch to the new org and redirect to dashboard
      setTimeout(async () => {
        try {
          await switchOrg(result.organizationId);
        } catch {
          router.push('/');
        }
      }, 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept invite');
      setIsAccepting(false);
    }
  };

  if (authLoading) return <LoadingScreen />;

  const isExpired = invite ? new Date(invite.expiresAt) < new Date() : false;
  const isPending = invite?.status === 'pending' && !isExpired;

  return (
    <section className="h-screen bg-muted">
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo.svg"
              alt="Tandemu"
              width={36}
              height={36}
              className="dark:hidden"
            />
            <Image
              src="/logo-dark.svg"
              alt="Tandemu"
              width={36}
              height={36}
              className="hidden dark:block"
            />
            <span className="text-xl font-bold text-foreground tracking-tight">Tandemu</span>
          </div>

          {/* Card */}
          <div className="flex w-full max-w-sm min-w-sm flex-col gap-y-5 rounded-md border border-muted bg-background px-6 py-8 shadow-md">
            {error ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <XCircle className="h-10 w-10 text-destructive" />
                <h2 className="text-lg font-semibold">Invite not found</h2>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button className="mt-2 w-full" onClick={() => router.push('/')}>
                  Go to Dashboard
                </Button>
              </div>
            ) : !invite ? (
              <div className="flex flex-col items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading invite...</p>
              </div>
            ) : accepted ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <CheckCircle className="h-10 w-10 text-green-500" />
                <h2 className="text-lg font-semibold">You&apos;re in!</h2>
                <p className="text-sm text-muted-foreground">
                  Redirecting to {invite.organizationName}...
                </p>
              </div>
            ) : !isPending ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <Clock className="h-10 w-10 text-muted-foreground" />
                <h2 className="text-lg font-semibold">
                  {invite.status === 'accepted' ? 'Already accepted' : 'Invite expired'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {invite.status === 'accepted'
                    ? 'This invite has already been accepted.'
                    : 'This invite has expired. Ask the organization admin to send a new one.'}
                </p>
                <Button className="mt-2 w-full" onClick={() => router.push('/')}>
                  Go to Dashboard
                </Button>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <h2 className="text-lg font-semibold">You&apos;re invited!</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    <strong>{invite.inviterName}</strong> invited you to join{' '}
                    <strong>{invite.organizationName}</strong> as{' '}
                    <strong>{invite.role.toLowerCase()}</strong>.
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={handleAccept}
                  disabled={isAccepting}
                >
                  {isAccepting ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                      Accepting...
                    </>
                  ) : (
                    'Accept Invite'
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => router.push('/')}
                >
                  Skip for now
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
