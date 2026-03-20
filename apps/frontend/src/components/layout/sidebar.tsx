"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard,
  Brain,
  Flame,
  BarChart3,
  Clock,
  Settings,
  Users,
  Plug,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ai-insights", label: "AI Insights", icon: Brain },
  { href: "/friction-map", label: "Friction Map", icon: Flame },
  { href: "/dora-metrics", label: "DORA Metrics", icon: BarChart3 },
  { href: "/timesheets", label: "Timesheets", icon: Clock },
  { href: "/teams", label: "Teams", icon: Users },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { currentOrg, organizations, switchOrg } = useAuth();
  const [showSwitcher, setShowSwitcher] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  // Close switcher on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setShowSwitcher(false);
      }
    }
    if (showSwitcher) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showSwitcher]);

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Org switcher */}
      <div className="relative border-b" ref={switcherRef}>
        <button
          onClick={() => organizations.length > 1 && setShowSwitcher(!showSwitcher)}
          className={cn(
            "flex h-16 w-full items-center gap-2 px-6 transition-colors",
            organizations.length > 1 && "hover:bg-accent/50 cursor-pointer"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            {currentOrg?.name?.charAt(0)?.toUpperCase() ?? "T"}
          </div>
          <div className="flex flex-col items-start overflow-hidden">
            <span className="text-sm font-semibold text-foreground leading-tight truncate max-w-[150px]">
              {currentOrg?.name ?? "Tandem"}
            </span>
            <span className="text-xs text-muted-foreground leading-tight">
              {currentOrg?.planTier ?? "Free"}
            </span>
          </div>
          {organizations.length > 1 && (
            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>

        {/* Dropdown */}
        {showSwitcher && (
          <div className="absolute left-2 right-2 top-[calc(100%+4px)] z-50 rounded-lg border bg-popover p-1 shadow-lg">
            <div className="px-2 py-1.5">
              <p className="text-xs font-medium text-muted-foreground">Switch organization</p>
            </div>
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => {
                  setShowSwitcher(false);
                  if (org.id !== currentOrg?.id) {
                    switchOrg(org.id);
                  }
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium">
                  {org.name.charAt(0).toUpperCase()}
                </div>
                <span className="truncate text-foreground">{org.name}</span>
                {org.id === currentOrg?.id && (
                  <Check className="ml-auto h-3.5 w-3.5 text-primary" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground">Tandem v0.1.0</p>
      </div>
    </aside>
  );
}
