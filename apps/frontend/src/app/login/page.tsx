'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SiGoogle, SiGithub } from '@icons-pack/react-simple-icons';
import { toast } from 'sonner';
import { getAuthConfig } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function LoginPage() {
  const { login } = useAuth();
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    getAuthConfig()
      .then((config) => setProviders(config.providers))
      .catch(() => setProviders([]))
      .finally(() => setConfigLoaded(true));
  }, []);

  const hasOAuth = providers.length > 0;
  const hasGoogle = providers.includes('google');
  const hasGithub = providers.includes('github');

  // Detect invite redirect to show contextual messaging
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const redirect = params?.get('redirect') || '';
  const isInviteRedirect = redirect.startsWith('/invites/');
  const registerHref = redirect ? `/register?redirect=${encodeURIComponent(redirect)}` : '/register';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="h-screen bg-muted">
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-6 lg:justify-start">
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
          <div className="flex w-full max-w-sm min-w-sm flex-col gap-y-6 rounded-md border border-muted bg-background px-6 py-8 shadow-md">
            <div>
              <h1 className="text-xl font-semibold">Log In</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                New to Tandemu?{' '}
                <Link href={registerHref} className="font-medium text-primary hover:underline">
                  Sign up
                </Link>
              </p>
              {isInviteRedirect && (
                <p className="mt-2 text-sm text-primary font-medium">
                  You&apos;ve been invited to an organization. Log in or create an account to accept.
                </p>
              )}
            </div>

            {!configLoaded ? (
              /* Skeleton while loading auth config */
              <div className="flex flex-col gap-3">
                <Skeleton className="h-9 w-full rounded-md" />
                <Skeleton className="h-9 w-full rounded-md" />
                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground uppercase">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ) : (
              <>
                {/* Social login buttons — only shown when OAuth is configured */}
                {hasOAuth && (
                  <>
                    <div className="flex flex-col gap-3">
                      {hasGoogle && (
                        <Button
                          variant="outline"
                          className="w-full"
                          type="button"
                          onClick={() => {
                            const params = new URLSearchParams(window.location.search);
                            const redirect = params.get('redirect');
                            if (redirect) localStorage.setItem('tandemu_auth_redirect', redirect);
                            window.location.href = `${API_URL}/api/auth/google`;
                          }}
                        >
                          <SiGoogle className="mr-2 h-4 w-4" />
                          Continue with Google
                        </Button>
                      )}
                      {hasGithub && (
                        <Button
                          variant="outline"
                          className="w-full"
                          type="button"
                          onClick={() => {
                            const params = new URLSearchParams(window.location.search);
                            const redirect = params.get('redirect');
                            if (redirect) localStorage.setItem('tandemu_auth_redirect', redirect);
                            window.location.href = `${API_URL}/api/auth/github`;
                          }}
                        >
                          <SiGithub className="mr-2 h-4 w-4" />
                          Continue with GitHub
                        </Button>
                      )}
                    </div>

                    {/* OR divider */}
                    <div className="flex items-center gap-4">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground uppercase">or</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  </>
                )}

                {/* Email login */}
                {hasOAuth && !showEmail ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    type="button"
                    onClick={() => setShowEmail(true)}
                  >
                    Continue with email
                  </Button>
                ) : (
                  <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                    <Input
                      type="email"
                      placeholder="Email"
                      className="text-sm"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoFocus
                    />
                    <Input
                      type="password"
                      placeholder="Password"
                      className="text-sm"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                          Signing in...
                        </>
                      ) : (
                        'Sign in'
                      )}
                    </Button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
