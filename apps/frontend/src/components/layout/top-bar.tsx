'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/activity': 'Activity',
  '/insights': 'Insights',
  '/friction-map': 'Friction Map',
  '/memory': 'AI Memory',
  '/teams': 'Teams',
  '/integrations': 'Integrations',
  '/settings': 'Settings',
  '/account': 'Account',
  '/developer': 'Developer',
};

interface Crumb {
  href: string;
  label: string;
}

function buildCrumbs(pathname: string): Crumb[] {
  if (pathname === '/') return [{ href: '/', label: 'Dashboard' }];

  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [];
  let accumulated = '';
  for (const segment of segments) {
    accumulated += `/${segment}`;
    const label =
      ROUTE_LABELS[accumulated] ??
      segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({ href: accumulated, label });
  }
  return crumbs;
}

export function AppTopBar() {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 !h-4 !self-center" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <div key={crumb.href} className="flex items-center gap-1.5">
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </div>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
