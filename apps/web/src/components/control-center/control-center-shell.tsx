"use client";

import {
  BarChart3,
  Bell,
  Building2,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Settings,
  ShieldCheck,
  Tag,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import type { ControlCenterAdmin } from "../../lib/control-center-session";
import { clearControlCenterAuth } from "../../lib/control-center-session";

export type ControlCenterSection =
  | "dashboard"
  | "clients"
  | "subscriptions"
  | "payments"
  | "pricing"
  | "reports"
  | "users"
  | "messaging"
  | "audit"
  | "settings";

const nav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "clients", label: "Clients", icon: Users },
  { id: "subscriptions", label: "Subscriptions", icon: Building2 },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "pricing", label: "Pricing", icon: Tag },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "users", label: "Users", icon: Users },
  { id: "messaging", label: "Messaging", icon: Mail },
  { id: "audit", label: "Audit Logs", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings },
] satisfies Array<{
  id: ControlCenterSection;
  label: string;
  icon: typeof LayoutDashboard;
}>;

export function ControlCenterShell({
  admin,
  active,
  onSectionChange,
  children,
}: {
  admin: ControlCenterAdmin;
  active: ControlCenterSection;
  onSectionChange: (section: ControlCenterSection) => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeLabel = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  function logout() {
    clearControlCenterAuth();
    router.replace("/control-center/login");
  }

  return (
    <main className="min-h-screen bg-[#f7f9fb] text-[var(--midnight-navy)]">
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-[224px] border-r border-[#e2e8f0] bg-white xl:block">
        <div className="flex h-full flex-col">
          <div className="flex h-[70px] items-center gap-3 border-b border-[#edf1f5] px-6">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--forest-emerald)] text-lg font-black text-white">
              R
            </div>
            <div>
              <div className="text-xl font-black leading-none">Rembeh</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">
                Control Center
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-8">
            {nav.map((item) => {
              const selected = item.id === active;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSectionChange(item.id)}
                  className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold transition ${
                    selected
                      ? "bg-[#edf8f1] text-[var(--forest-emerald)] shadow-[inset_3px_0_0_var(--forest-emerald)]"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="size-4" />
                  <span className="font-bold">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-[#edf1f5] p-4">
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#e2e8f0] bg-white p-3">
              <div className="grid size-9 place-items-center rounded-full bg-[#eaf5ed] text-sm font-black text-[var(--forest-emerald)]">
                {initials(admin.displayName)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-black">
                  {admin.displayName}
                </div>
                <div className="truncate text-xs font-semibold text-slate-500">
                  Super Admin
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex h-10 items-center gap-3 px-2 text-sm font-bold text-slate-600 hover:text-[var(--coral-red)]"
            >
              <LogOut className="size-4" />
              Log out
            </button>
          </div>
        </div>
      </aside>

      <section className="xl:pl-[224px]">
        <header className="sticky top-0 z-10 flex h-[70px] items-center justify-between border-b border-[#e2e8f0] bg-white px-5 xl:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((current) => !current)}
              className="grid size-9 place-items-center border border-[#e2e8f0] bg-white text-slate-600 xl:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <ShieldCheck className="hidden size-5 text-[var(--forest-emerald)] xl:block" />
          </div>
          <div className="flex items-center gap-5">
            <div className="relative">
              <Bell className="size-5 text-slate-700" />
              <span className="absolute -right-1.5 -top-2 grid size-4 place-items-center rounded-full bg-red-500 text-[10px] font-black text-white">
                3
              </span>
            </div>
            <div className="text-right text-xs font-bold text-slate-700">
              <div>{dateLabel}</div>
              <div className="mt-0.5 text-slate-500">{timeLabel}</div>
            </div>
          </div>
        </header>

        <div className="px-5 py-6 xl:px-8">{children}</div>
      </section>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-30 bg-slate-950/35 xl:hidden">
          <div className="h-full w-[280px] bg-white shadow-2xl">
            <div className="flex h-[70px] items-center justify-between border-b border-[#edf1f5] px-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--forest-emerald)] text-lg font-black text-white">
                  R
                </div>
                <div>
                  <div className="text-xl font-black leading-none">Rembeh</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    Control Center
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="grid size-9 place-items-center border border-[#e2e8f0] text-slate-600"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <Menu className="size-5" />
              </button>
            </div>
            <nav className="space-y-1 px-3 py-5">
              {nav.map((item) => {
                const selected = item.id === active;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSectionChange(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold transition ${
                      selected
                        ? "bg-[#edf8f1] text-[var(--forest-emerald)]"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}
