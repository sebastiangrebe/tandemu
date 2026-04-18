"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Flame,
  Clock,
  Settings,
  Users,
  Plug,
  ChevronsUpDown,
  Plus,
  LogOut,
  Sun,
  Moon,
  BadgeCheck,
  Search,
  Layers,
  Brain,
  Lightbulb,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { getTeams, getMembers } from "@/lib/api";
import type { Team, Membership } from "@tandemu/types";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const overviewItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/activity", label: "Activity", icon: Clock },
  { href: "/memory", label: "AI Memory", icon: Brain },
];

const analyticsItems = [
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/friction-map", label: "Friction Map", icon: Flame },
];

const teamItems = [
  { href: "/teams", label: "Teams", icon: Layers },
];

const workspaceItems = [
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

const adminOnlyItems = new Set(['/integrations', '/settings', '/teams']);

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, currentOrg, organizations, switchOrg, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [commandOpen, setCommandOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);

  const userInitials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const orgInitial = currentOrg?.name?.charAt(0).toUpperCase() ?? "T";

  // Load teams and members for search
  useEffect(() => {
    if (currentOrg) {
      getTeams(currentOrg.id).then(setTeams).catch(() => {});
      getMembers(currentOrg.id).then(setMembers).catch(() => {});
    }
  }, [currentOrg]);

  // Keyboard shortcut: Cmd+K
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

  const handleSelect = useCallback((href: string) => {
    setCommandOpen(false);
    router.push(href);
  }, [router]);

  function NavGroup({ label, items }: { label: string; items: typeof overviewItems }) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <Sidebar variant="inset">
        {/* Org switcher header */}
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
                    <Image
                      src="/logo.svg"
                      alt="Tandemu"
                      width={28}
                      height={28}
                      className="shrink-0 dark:hidden"
                    />
                    <Image
                      src="/logo-dark.svg"
                      alt="Tandemu"
                      width={28}
                      height={28}
                      className="hidden shrink-0 dark:block"
                    />
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {currentOrg?.name ?? "Tandemu"}
                      </span>
                      <span className="truncate text-xs text-sidebar-foreground/70">
                        {currentOrg?.planTier ?? "Free"}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                  align="start"
                  side="bottom"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Organizations
                  </DropdownMenuLabel>
                  {organizations.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      onClick={() => {
                        if (org.id !== currentOrg?.id) {
                          switchOrg(org.id);
                        }
                      }}
                      className="gap-2 p-2"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border">
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
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* Search */}
        <div className="px-3 pb-2">
          <button
            onClick={() => setCommandOpen(true)}
            className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-3 py-1.5 text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search...</span>
            <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-sidebar-accent px-1.5 font-mono text-[10px] font-medium text-sidebar-foreground/50 sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        </div>

        {/* Navigation */}
        <SidebarContent>
          <NavGroup label="Overview" items={overviewItems} />
          <NavGroup label="Analytics" items={analyticsItems} />
          {isAdmin && <NavGroup label="Team" items={teamItems} />}
          {isAdmin && <NavGroup label="Workspace" items={workspaceItems} />}
        </SidebarContent>

        {/* User footer */}
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {user?.name ?? "User"}
                      </span>
                      <span className="truncate text-xs text-sidebar-foreground/70">
                        {user?.email ?? ""}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                  side="bottom"
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarFallback className="rounded-lg">
                          {userInitials}
                        </AvatarFallback>
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
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Command palette */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Search pages, teams, members..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Pages">
            {[...overviewItems, ...analyticsItems, ...teamItems, ...workspaceItems]
              .filter((item) => isAdmin || !adminOnlyItems.has(item.href))
              .map((item) => (
              <CommandItem key={item.href} onSelect={() => handleSelect(item.href)}>
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
                  <CommandItem key={team.id} onSelect={() => handleSelect("/teams")}>
                    <Layers className="mr-2 h-4 w-4" />
                    {team.name}
                    {team.description && (
                      <span className="ml-2 text-muted-foreground text-xs">{team.description}</span>
                    )}
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
                  <CommandItem key={member.id ?? member.userId} onSelect={() => handleSelect("/teams")}>
                    <Users className="mr-2 h-4 w-4" />
                    {member.name || member.email || member.id}
                    <span className="ml-2 text-muted-foreground text-xs">{member.role}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
