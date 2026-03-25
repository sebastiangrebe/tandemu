'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { getMe, getOrganizations } from '@/lib/api';

function CallbackHandler() {
  const searchParams = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = searchParams.get('token');
    if (!token) {
      window.location.replace('/login');
      return;
    }

    // Store the token
    localStorage.setItem('tandemu_token', token);

    // Strip token from URL for security
    window.history.replaceState({}, '', '/auth/callback');

    // Check if user has orgs to decide where to redirect
    Promise.all([getMe(), getOrganizations()])
      .then(([, orgs]) => {
        const redirect = localStorage.getItem('tandemu_auth_redirect');
        localStorage.removeItem('tandemu_auth_redirect');
        if (orgs.length === 0) {
          window.location.replace('/setup');
        } else {
          window.location.replace(redirect || '/');
        }
      })
      .catch(() => {
        // Token invalid — clear and go to login
        localStorage.removeItem('tandemu_token');
        window.location.replace('/login');
      });
  }, [searchParams]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
