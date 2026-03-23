'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/lib/auth';
import { authorizeCli, getOrganizations } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Terminal, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import type { Organization } from '@tandemu/types';

type PageStatus = 'prompt' | 'authorizing' | 'success' | 'denied' | 'error';

export default function CliAuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-muted">
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

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const redirectUrl = `/cli-auth?code=${encodeURIComponent(code || '')}`;
      router.push(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
    }
  }, [isLoading, isAuthenticated, code, router]);

  useEffect(() => {
    if (isAuthenticated) {
      getOrganizations()
        .then((orgs) => {
          if (orgs.length > 0) setCurrentOrg(orgs[0]);
        })
        .catch(() => {});
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
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <section className="min-h-screen bg-muted">
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Tandemu" width={36} height={36} className="dark:hidden" />
            <Image src="/logo-dark.svg" alt="Tandemu" width={36} height={36} className="hidden dark:block" />
            <span className="text-xl font-bold text-foreground tracking-tight">Tandemu</span>
          </div>

          {/* Card */}
          <Card className="w-full max-w-sm min-w-sm shadow-md">
            {!code ? (
              <>
                <CardHeader className="text-center">
                  <div className="mx-auto flex items-center justify-center rounded-full bg-destructive/10 p-3 mb-2">
                    <AlertCircle className="h-6 w-6 text-destructive" />
                  </div>
                  <CardTitle>Invalid Request</CardTitle>
                  <CardDescription>
                    Missing authorization code. Please try again from the CLI.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="justify-center pb-6">
                  <Button variant="outline" onClick={() => window.close()}>
                    Close
                  </Button>
                </CardFooter>
              </>
            ) : status === 'prompt' ? (
              <>
                <CardHeader className="text-center">
                  <div className="mx-auto flex items-center justify-center rounded-full bg-muted p-3 mb-2">
                    <Terminal className="h-6 w-6 text-foreground" />
                  </div>
                  <CardTitle>Authorize CLI</CardTitle>
                  <CardDescription>
                    Tandemu CLI is requesting access to your account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Separator />
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Account</span>
                      <span className="font-medium">{user?.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Email</span>
                      <span className="font-medium">{user?.email}</span>
                    </div>
                    {currentOrg && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Organization</span>
                        <span className="font-medium">{currentOrg.name}</span>
                      </div>
                    )}
                  </div>
                  <Separator />
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground">This will allow the CLI to:</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary">Read your profile</Badge>
                      <Badge variant="secondary">Access tasks</Badge>
                      <Badge variant="secondary">Send telemetry</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleDeny}>
                    Deny
                  </Button>
                  <Button className="flex-1" onClick={handleAllow}>
                    Authorize
                  </Button>
                </CardFooter>
              </>
            ) : status === 'authorizing' ? (
              <CardContent className="flex flex-col items-center gap-4 py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Authorizing...</p>
              </CardContent>
            ) : status === 'success' ? (
              <>
                <CardHeader className="text-center">
                  <div className="mx-auto flex items-center justify-center rounded-full bg-primary/10 p-3 mb-2">
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>CLI Authorized</CardTitle>
                  <CardDescription>
                    You can return to your terminal. This tab can be closed.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="justify-center pb-6">
                  <Button variant="outline" onClick={() => window.close()}>
                    Close Tab
                  </Button>
                </CardFooter>
              </>
            ) : status === 'denied' ? (
              <>
                <CardHeader className="text-center">
                  <div className="mx-auto flex items-center justify-center rounded-full bg-muted p-3 mb-2">
                    <XCircle className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <CardTitle>Authorization Denied</CardTitle>
                  <CardDescription>
                    The CLI was not authorized. You can close this tab.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="justify-center pb-6">
                  <Button variant="outline" onClick={() => window.close()}>
                    Close Tab
                  </Button>
                </CardFooter>
              </>
            ) : (
              <>
                <CardHeader className="text-center">
                  <div className="mx-auto flex items-center justify-center rounded-full bg-destructive/10 p-3 mb-2">
                    <AlertCircle className="h-6 w-6 text-destructive" />
                  </div>
                  <CardTitle>Authorization Failed</CardTitle>
                  <CardDescription>{errorMessage}</CardDescription>
                </CardHeader>
                <CardFooter className="justify-center pb-6">
                  <Button variant="outline" onClick={() => setStatus('prompt')}>
                    Try Again
                  </Button>
                </CardFooter>
              </>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
}
