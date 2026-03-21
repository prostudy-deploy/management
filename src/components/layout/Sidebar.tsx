"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { canManageTeam } from "@/lib/types";
import { TimerWidget } from "./TimerWidget";
import { useState } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  Users,
  Clock,
  FolderOpen,
  MessageCircle,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin", "marketing", "verwaltung"] },
  { name: "Chat", href: "/chat", icon: MessageCircle, roles: ["admin", "marketing", "verwaltung"] },
  { name: "Projekte", href: "/projekte", icon: FolderOpen, roles: ["admin", "marketing", "verwaltung"] },
  { name: "Aufgaben", href: "/aufgaben", icon: ClipboardList, roles: ["admin", "marketing", "verwaltung"] },
  { name: "Arbeitszeit", href: "/arbeitszeit", icon: Clock, roles: ["admin", "marketing", "verwaltung"] },
  { name: "Budget", href: "/budget", icon: Wallet, roles: ["admin", "verwaltung"] },
  { name: "Team", href: "/admin/team", icon: Users, roles: ["admin"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { role, displayName, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredNav = navigation.filter(
    (item) => role && item.roles.includes(role)
  );

  const navContent = (
    <>
      <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4 lg:px-6 lg:h-16">
        <div className="flex items-center">
          <h1 className="text-xl font-bold text-blue-600">ProStudy</h1>
          <span className="ml-2 text-xs text-gray-400">Management</span>
        </div>
        {/* Mobile Close */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1 text-gray-500 hover:text-gray-900"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Timer Widget */}
      <div className="border-b border-gray-200 px-4 py-3">
        <TimerWidget />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {filteredNav.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 p-4">
        <div className="mb-3 text-sm">
          <p className="font-medium text-gray-900">{displayName || "Benutzer"}</p>
          <p className="text-xs text-gray-500 capitalize">{role || "—"}</p>
        </div>
        <button
          onClick={() => { signOut(); setMobileOpen(false); }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Abmelden
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 text-gray-600 hover:text-gray-900"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex items-center">
          <h1 className="text-lg font-bold text-blue-600">ProStudy</h1>
        </div>
        <div className="w-8" /> {/* Spacer für Zentrierung */}
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar (Slide-in) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white shadow-xl transition-transform duration-300 ease-in-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {navContent}
      </aside>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex h-screen w-64 flex-col border-r border-gray-200 bg-white shrink-0">
        {navContent}
      </aside>
    </>
  );
}
