'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { authorizeCli, getOrganizations } from '@/lib/api';
import type { Organization } from '@tandemu/types';

type PageStatus = 'prompt' | 'authorizing' | 'success' | 'denied' | 'error';

export default function CliAuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    }>
      <CliAuthContent />
    </Suspense>
  );
}

function CliAuthContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  const code = searchParams.get('code');

  const [status, setStatus] = useState<PageStatus>('prompt');
  const [errorMessage, setErrorMessage] = useState('');
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);

  // If not authenticated, redirect to login with redirect back
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const redirectUrl = `/cli-auth?code=${encodeURIComponent(code || '')}`;
      router.push(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
    }
  }, [isLoading, isAuthenticated, code, router]);

  // Fetch current org
  useEffect(() => {
    if (isAuthenticated) {
      getOrganizations()
        .then((orgs) => {
          if (orgs.length > 0) {
            setCurrentOrg(orgs[0]);
          }
        })
        .catch(() => {
          // ignore - org display is optional
        });
    }
  }, [isAuthenticated]);

  const handleAllow = async () => {
    if (!code) return;
    setStatus('authorizing');
    try {
      await authorizeCli(code);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Authorization failed.');
    }
  };

  const handleDeny = () => {
    setStatus('denied');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect in useEffect
  }

  if (!code) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md space-y-6 px-6 text-center">
          <div className="mx-auto relative w-12 h-12">
            <div className="absolute inset-0 bg-primary rounded-xl rotate-45" />
            <div className="absolute inset-[4px] bg-background rounded-[9px] rotate-45" />
            <div className="absolute inset-[8px] bg-primary rounded-[6px] rotate-45" />
          </div>
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            Missing authorization code. Please try again from the CLI.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 px-6">
        <div className="text-center">
          <div className="mx-auto relative w-12 h-12">
            <div className="absolute inset-0 bg-primary rounded-xl rotate-45" />
            <div className="absolute inset-[4px] bg-background rounded-[9px] rotate-45" />
            <div className="absolute inset-[8px] bg-primary rounded-[6px] rotate-45" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
            Authorize CLI
          </h1>
        </div>

        {status === 'prompt' && (
          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Tandemu CLI wants to connect to your account.
              </p>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Account</span>
                  <span className="text-foreground font-medium">{user?.name}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Email</span>
                  <span className="text-foreground font-medium">{user?.email}</span>
                </div>
                {currentOrg && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Organization</span>
                    <span className="text-foreground font-medium">{currentOrg.name}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDeny}
                className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              >
                Deny
              </button>
              <button
                onClick={handleAllow}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              >
                Allow
              </button>
            </div>
          </div>
        )}

        {status === 'authorizing' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Authorizing...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center space-y-2">
            <p className="text-sm font-medium text-green-400">CLI authorized!</p>
            <p className="text-sm text-green-400/80">You can close this tab.</p>
          </div>
        )}

        {status === 'denied' && (
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <p className="text-sm text-muted-foreground">Authorization denied.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center">
            <p className="text-sm text-red-400">{errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
