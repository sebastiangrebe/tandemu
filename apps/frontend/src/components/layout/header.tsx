"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { getTeams, getMembers } from "@/lib/api";
import type { Team, Membership } from "@tandemu/types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Clock,
  Flame,
  Brain,
  Lightbulb,
  Menu,
  Layers,
  Plug,
  Settings,
  Users,
  Search,
  ChevronsUpDown,
  Plus,
  LogOut,
  Sun,
  Moon,
  BadgeCheck,
  MessageCircle,
} from "lucide-react";

const mainNavAll = [
  { href: "/", label: "Dashboard" },
  { href: "/teams", label: "Teams", adminOnly: true },
  { href: "/integrations", label: "Integrations", adminOnly: true },
  { href: "/settings", label: "Settings", adminOnly: true },
];

const dashboardSubNav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/activity", label: "Activity", icon: Clock },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/friction-map", label: "Friction Map", icon: Flame },
  { href: "/memory", label: "AI Memory", icon: Brain },
];

const subNavMap: Record<
  string,
  Array<{ href: string; label: string; icon: typeof LayoutDashboard }>
> = {
  "/": dashboardSubNav,
  "/activity": dashboardSubNav,
  "/insights": dashboardSubNav,
  "/friction-map": dashboardSubNav,
  "/memory": dashboardSubNav,
};

const allNavItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/activity", label: "Activity", icon: Clock },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/friction-map", label: "Friction Map", icon: Flame },
  { href: "/memory", label: "AI Memory", icon: Brain },
  { href: "/teams", label: "Teams", icon: Layers, adminOnly: true },
  { href: "/integrations", label: "Integrations", icon: Plug, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, currentOrg, organizations, switchOrg, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Load Crisp chat (SaaS only)
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID) {
      import('crisp-sdk-web').then(({ Crisp }) => {
        Crisp.configure(process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID!);
      });
    }
  }, []);

  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  const subNav = subNavMap[pathname] ?? null;

  useEffect(() => {
    if (currentOrg) {
      getTeams(currentOrg.id)
        .then(setTeams)
        .catch(() => {});
      getMembers(currentOrg.id)
        .then(setMembers)
        .catch(() => {});
    }
  }, [currentOrg]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback(
    (href: string) => {
      setCommandOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <>
      {/* Main header */}
      <header className="sticky top-0 z-50 border-b bg-background">
        <div className="mx-auto max-w-7xl flex h-14 items-center gap-4 px-4 lg:px-6">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="px-4 py-4 border-b">
                <SheetTitle className="text-left text-sm font-semibold">
                  {currentOrg?.name ?? "Tandemu"}
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col py-2">
                <p className="px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Dashboard</p>
                {dashboardSubNav.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        isActive
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
                {isAdmin && (
                  <>
                    <Separator className="my-2" />
                    <p className="px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Workspace</p>
                    {[
                      { href: "/teams", label: "Teams", icon: Layers },
                      { href: "/integrations", label: "Integrations", icon: Plug },
                      { href: "/settings", label: "Settings", icon: Settings },
                    ].map((item) => {
                      const Icon = item.icon;
                      const isActive = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                            isActive
                              ? "bg-accent text-foreground font-medium"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Logo + Org */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 text-sm font-semibold hover:opacity-80 transition-opacity">
                <Image
                  src="/logo.svg"
                  alt="Tandemu"
                  width={24}
                  height={24}
                  className="dark:hidden"
                />
                <Image
                  src="/logo-dark.svg"
                  alt="Tandemu"
                  width={24}
                  height={24}
                  className="hidden dark:block"
                />
                <span className="hidden sm:inline">
                  {currentOrg?.name ?? "Tandemu"}
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Organizations
              </DropdownMenuLabel>
              {organizations.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => {
                    if (org.id !== currentOrg?.id) switchOrg(org.id);
                  }}
                  className="gap-2 p-2"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border text-xs font-medium">
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  {org.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 p-2"
                onClick={() => router.push("/setup")}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-md border bg-background">
                  <Plus className="h-4 w-4" />
                </div>
                Add organization
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Main nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {mainNavAll.filter((item) => isAdmin || !item.adminOnly).map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/" ||
                    pathname === "/activity" ||
                    pathname === "/insights" ||
                    pathname === "/friction-map" ||
                    pathname === "/memory"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {/* Search */}
            <button
              onClick={() => setCommandOpen(true)}
              className="hidden sm:flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm text-muted-foreground hover:border-foreground/20 transition-colors w-48 lg:w-56"
            >
              <Search className="h-4 w-4 shrink-0 opacity-50" />
              <span className="flex-1 text-left">Search...</span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden"
              onClick={() => setCommandOpen(true)}
            >
              <Search className="h-4 w-4" />
            </Button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent transition-colors">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline font-medium">
                    {user?.name}
                  </span>
                  <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{userInitials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {user?.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user?.email}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => router.push("/account")}>
                    <BadgeCheck className="mr-2 h-4 w-4" />
                    Account
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={toggleTheme}>
                    {theme === "dark" ? (
                      <Sun className="mr-2 h-4 w-4" />
                    ) : (
                      <Moon className="mr-2 h-4 w-4" />
                    )}
                    {theme === "dark" ? "Light mode" : "Dark mode"}
                  </DropdownMenuItem>
                  {process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID && (
                    <DropdownMenuItem onClick={() => {
                      import('crisp-sdk-web').then(({ Crisp }) => Crisp.chat.open());
                    }}>
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Support
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Sub nav */}
        {subNav && (
          <div className="hidden md:block border-t border-border/50 bg-muted/40">
            <div className="mx-auto max-w-7xl flex items-center gap-6 px-4 lg:px-6 h-10">
              {subNav.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 text-sm transition-colors ${
                      isActive
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Command palette */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <Command>
          <CommandInput placeholder="Search pages, teams, members..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Pages">
              {allNavItems.filter((item) => isAdmin || !item.adminOnly).map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => handleSelect(item.href)}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {teams.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Teams">
                  {teams.map((team) => (
                    <CommandItem
                      key={team.id}
                      onSelect={() => handleSelect("/teams")}
                    >
                      <Layers className="mr-2 h-4 w-4" />
                      {team.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {members.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Members">
                  {members.map((member: any) => (
                    <CommandItem
                      key={member.id ?? member.userId}
                      onSelect={() => handleSelect("/teams")}
                    >
                      <Users className="mr-2 h-4 w-4" />
                      {member.name || member.email || member.id}
                      <span className="ml-2 text-muted-foreground text-xs">
                        {member.role}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
