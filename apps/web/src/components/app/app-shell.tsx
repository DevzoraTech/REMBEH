"use client";

import {
  Building2,
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  Wallet,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import rembehIcon from "../../assets/rembeh-icon.png";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  clearAuthState,
} from "../../lib/auth-session";
import { resolveOperatorRole } from "../../lib/roles";

type AppShellProps = {
  children: ReactNode;
  session: RembehSession;
  workspace: RembehWorkspace | null;
  user: RembehUser | null;
  branch?: RembehBranch | null;
};

export function AppShell({
  children,
  session,
  workspace,
  user,
  branch = null,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const operatorRole = resolveOperatorRole(session, user);

  const { primaryNav, settingsEnabled } = useMemo(() => {
    const primary = [
      {
        href: "/dashboard",
        label: "Home",
        icon: LayoutDashboard,
        enabled: operatorRole !== "staff",
      },
      {
        href: "/branches",
        label: "Branches",
        icon: Building2,
        enabled: operatorRole === "owner",
      },
      {
        href: "/agents",
        label: "Agents",
        icon: Users,
        enabled:
          operatorRole !== "staff" &&
          Boolean(
            session.permissions.includes("branch.staff.read") ||
              session.permissions.includes("user.read") ||
              session.permissions.includes("collection.read"),
          ),
      },
      {
        href: "/dashboard#payments",
        label: "Payments",
        icon: Wallet,
        enabled:
          operatorRole !== "staff" &&
          Boolean(session.permissions.includes("collection.read")),
      },
      {
        href: "/collections/daily",
        label: "Close the day",
        icon: CalendarDays,
        enabled:
          operatorRole !== "staff" &&
          Boolean(session.permissions.includes("collection.read")),
      },
    ].filter((item) => item.enabled);

    const settingsEnabled =
      operatorRole === "owner" ||
      operatorRole === "manager" ||
      Boolean(session.permissions.includes("loan.product.manage"));

    return { primaryNav: primary, settingsEnabled };
  }, [operatorRole, session.permissions]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function handleLogout() {
    clearAuthState();
    router.replace("/login");
  }

  // Agents / field staff: no console data surface.
  if (operatorRole === "staff") {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--slate-text)]">
        <header className="border-b border-[var(--line)] bg-[var(--soft-ivory)] px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Image
                src={rembehIcon}
                alt="REMBEH"
                className="size-8 object-cover"
                priority
              />
              <p className="font-[family-name:var(--font-display)] text-xl tracking-[-0.03em] text-[var(--midnight-navy)]">
                REMBEH
              </p>
            </div>
            <button type="button" onClick={handleLogout} className="btn btn-ghost h-9 text-xs">
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </div>
        </header>
        <main className="px-4 py-8 sm:px-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen text-[var(--slate-text)]">
      <aside
        className={`app-sidebar fixed inset-y-0 left-0 z-40 w-[232px] transform transition duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col px-3 py-4">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Image
                src={rembehIcon}
                alt="REMBEH"
                className="size-8 object-cover"
                priority
              />
              <div>
                <p className="font-[family-name:var(--font-display)] text-lg leading-none tracking-[-0.03em] text-white">
                  REMBEH
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/45">
                  {operatorRole === "owner" ? "Owner" : "Manager"}
                </p>
              </div>
            </Link>
            <button
              type="button"
              className="grid size-8 place-items-center bg-white/8 text-white lg:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
          </div>

          <nav className="mt-4 flex flex-1 flex-col">
            <div className="space-y-1">
              {primaryNav.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(`${item.href}/`)) ||
                  (item.href === "/dashboard" && pathname === "/dashboard");

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 text-sm font-semibold ${
                      active
                        ? "bg-[var(--forest-emerald)] text-white"
                        : "text-white/70 hover:bg-white/8 hover:text-white"
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-auto space-y-1 border-t border-white/10 pt-3">
              {settingsEnabled ? (
                <Link
                  href="/settings"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 text-sm font-semibold ${
                    pathname === "/settings" ||
                    pathname.startsWith("/settings/")
                      ? "bg-[var(--forest-emerald)] text-white"
                      : "text-white/70 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <Settings className="size-4" />
                  Settings
                </Link>
              ) : null}
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/8 hover:text-white"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </div>
          </nav>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-[rgba(10,18,32,0.5)] lg:hidden"
          aria-label="Close overlay"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="min-h-screen lg:pl-[232px]">
        <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--soft-ivory)] px-4 py-2.5 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                className="grid size-9 place-items-center border border-[var(--line)] bg-white text-[var(--midnight-navy)] lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="size-4" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--forest-emerald)]">
                  {workspace?.name ?? "REMBEH"}
                </p>
                <h1 className="truncate text-sm font-bold text-[var(--midnight-navy)]">
                  {operatorRole === "manager"
                    ? branch?.name ?? "Branch console"
                    : "Control center"}
                </h1>
              </div>
            </div>

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                className="inline-flex h-9 items-center gap-2 border border-[var(--line)] bg-white px-2.5 text-xs font-semibold text-[var(--midnight-navy)]"
                aria-expanded={profileOpen}
              >
                <span className="grid size-6 place-items-center bg-[var(--soft-mist)] text-[var(--forest-emerald)]">
                  <UserRound className="size-3.5" />
                </span>
                <span className="hidden max-w-[140px] truncate sm:inline">
                  {user?.name ?? "Profile"}
                </span>
                <ChevronDown className="size-3.5 text-slate-500" />
              </button>

              {profileOpen ? (
                <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[260px] border border-[var(--line)] bg-white shadow-[0_12px_30px_rgba(20,33,61,0.16)]">
                  <div className="border-b border-[var(--line)] px-3 py-2.5">
                    <p className="text-sm font-bold text-[var(--midnight-navy)]">
                      {user?.name ?? "User"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {user?.email ?? "—"}
                    </p>
                  </div>
                  <div className="space-y-1.5 px-3 py-2.5 text-xs">
                    <ProfileLine
                      label="Role"
                      value={user?.roleName ?? (operatorRole === "owner" ? "Account Owner" : "Manager")}
                    />
                    <ProfileLine
                      label="Workspace"
                      value={workspace?.name ?? "—"}
                    />
                    {operatorRole === "manager" ? (
                      <>
                        <ProfileLine
                          label="Branch"
                          value={branch?.name ?? "—"}
                        />
                        <ProfileLine
                          label="Address"
                          value={branch?.address ?? "—"}
                        />
                      </>
                    ) : (
                      <ProfileLine
                        label="Market"
                        value={[workspace?.country, workspace?.currency]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 border-t border-[var(--line)] px-3 py-2.5 text-left text-xs font-semibold text-[var(--midnight-navy)] hover:bg-[var(--soft-mist)]"
                  >
                    <LogOut className="size-3.5" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="px-4 py-4 sm:px-5 sm:py-5">{children}</main>
      </div>
    </div>
  );
}

function ProfileLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[160px] truncate text-right font-semibold text-[var(--midnight-navy)]">
        {value}
      </span>
    </div>
  );
}
