"use client";

import { usePathname } from "next/navigation";
import Image from "next/image";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/activity": "Activity",
  "/friction-map": "Friction Map",
  "/teams": "Teams",
  "/integrations": "Integrations",
  "/settings": "Settings",
  "/account": "Account",
};

export function Header() {
  const pathname = usePathname();
  const pageTitle = pageTitles[pathname] ?? "Dashboard";

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1 border-none" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px"
        />
        <h1 className="text-base font-medium">{pageTitle}</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm">
            <Image
              src="/logo.svg"
              alt="Tandemu"
              width={18}
              height={18}
              className="dark:hidden"
            />
            <Image
              src="/logo-dark.svg"
              alt="Tandemu"
              width={18}
              height={18}
              className="hidden dark:block"
            />
            <span className="hidden sm:inline font-medium">Tandemu</span>
          </div>
        </div>
      </div>
    </header>
  );
}
