'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { usePathname, useRouter } from 'next/navigation';
import { Header } from './header';
import { LoadingScreen } from '@/components/loading-screen';

const PUBLIC_PATHS = ['/login', '/register', '/setup', '/cli-auth', '/auth/callback'];
const ADMIN_PATHS = ['/settings', '/integrations', '/teams'];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PATHS.includes(pathname);

  if (isPublicPage) {
    return <>{children}</>;
  }

  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, hasOrganization, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && isAuthenticated && !hasOrganization) {
      router.push('/setup');
    }
  }, [isLoading, isAuthenticated, hasOrganization, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && !isAdmin && ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
      router.push('/');
    }
  }, [isLoading, isAuthenticated, isAdmin, pathname, router]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated || !hasOrganization) {
    return null;
  }

  if (!isAdmin && ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-6">
        {children}
      </main>
    </div>
  );
}

