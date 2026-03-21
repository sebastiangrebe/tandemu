'use client';

import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/activity': 'Activity',
  '/friction-map': 'Friction Map',
  '/teams': 'Teams',
  '/integrations': 'Integrations',
  '/settings': 'Settings',
  '/account': 'Account',
};

export function Header() {
  const pathname = usePathname();
  const pageTitle = pageTitles[pathname] ?? 'Dashboard';

  return (
    <header className="flex h-16 shrink-0 items-center gap-2">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
