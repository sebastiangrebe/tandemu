'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { usePathname, useRouter } from 'next/navigation';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './sidebar';
import { AppTopBar } from './top-bar';
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

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID) {
      import('crisp-sdk-web').then(({ Crisp }) => {
        Crisp.configure(process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID!);
      });
    }
  }, []);

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
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppTopBar />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
