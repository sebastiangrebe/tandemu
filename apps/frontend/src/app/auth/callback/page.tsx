'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { getMe, getOrganizations } from '@/lib/api';
import { LoadingScreen } from '@/components/loading-screen';

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

  return <LoadingScreen />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CallbackHandler />
    </Suspense>
  );
}
