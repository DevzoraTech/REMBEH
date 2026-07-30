"use client";

import {
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldAlert,
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
import { apiBaseUrl, readApiJson } from "../../lib/api";
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

type OperationOpenCheck = {
  branch: { id: string; name: string } | null;
  operation: { id: string; status: string } | null;
  pendingClosureOperation: {
    operationDate: string;
    status: string;
  } | null;
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
  const homeHref = operatorRole === "owner" ? "/owner" : "/dashboard";

  const { primaryNav, settingsEnabled } = useMemo(() => {
    const ownerPrimary = [
      {
        href: "/owner",
        label: "Overview",
        icon: LayoutDashboard,
        enabled: operatorRole === "owner",
      },
      {
        href: "/owner/branches",
        label: "Branches",
        icon: Building2,
        enabled: operatorRole === "owner",
      },
      {
        href: "/owner/reports",
        label: "Sent Reports",
        icon: ClipboardCheck,
        enabled: operatorRole === "owner",
      },
      {
        href: "/owner/portfolio",
        label: "Portfolio",
        icon: FileText,
        enabled: operatorRole === "owner",
      },
      {
        href: "/owner/borrowers",
        label: "Borrowers",
        icon: UserRound,
        enabled: operatorRole === "owner",
      },
      {
        href: "/owner/risk",
        label: "Risk Register",
        icon: ShieldAlert,
        enabled: operatorRole === "owner",
      },
      {
        href: "/owner/payments",
        label: "Payments",
        icon: Wallet,
        enabled: operatorRole === "owner",
      },
    ];

    const managerPrimary = [
      {
        href: "/dashboard",
        label: "Home",
        icon: LayoutDashboard,
        enabled: operatorRole === "manager",
      },
      {
        href: "/agents",
        label: "Agents",
        icon: Users,
        enabled:
          operatorRole === "manager" &&
          Boolean(
            session.permissions.includes("branch.staff.read") ||
            session.permissions.includes("user.read") ||
            session.permissions.includes("collection.read"),
          ),
      },
      {
        href: "/loans",
        label: "Loans",
        icon: FileText,
        enabled:
          operatorRole === "manager" &&
          Boolean(session.permissions.includes("loan.read")),
      },
      {
        href: "/clients",
        label: "Borrowers",
        icon: UserRound,
        enabled:
          operatorRole === "manager" &&
          Boolean(session.permissions.includes("customer.read")),
      },
      {
        href: "/blacklist-watchlist",
        label: "Blacklist & Watchlist",
        icon: ShieldAlert,
        enabled:
          operatorRole === "manager" &&
          Boolean(session.permissions.includes("customer.read")),
      },
      {
        href: "/dashboard#payments",
        label: "Payments",
        icon: Wallet,
        enabled:
          operatorRole === "manager" &&
          Boolean(session.permissions.includes("collection.read")),
      },
      {
        href: "/operations",
        label: "Daily Operations",
        icon: CalendarDays,
        enabled:
          operatorRole === "manager" &&
          Boolean(session.permissions.includes("operation.read")),
      },
    ];

    const primary = (
      operatorRole === "owner" ? ownerPrimary : managerPrimary
    ).filter((item) => item.enabled);

    const settingsEnabled =
      operatorRole === "owner" ||
      operatorRole === "manager" ||
      Boolean(session.permissions.includes("loan.product.manage"));

    return { primaryNav: primary, settingsEnabled };
  }, [operatorRole, session.permissions]);

  useEffect(() => {
    if (operatorRole !== "owner") return;
    const redirects: Array<[string, string]> = [
      ["/dashboard", "/owner"],
      ["/branches", "/owner/branches"],
      ["/operations", "/owner/reports"],
      ["/loans", "/owner/portfolio"],
      ["/clients", "/owner/borrowers"],
      ["/blacklist-watchlist", "/owner/risk"],
      ["/collections/daily", "/owner/payments"],
      ["/settings", "/owner/settings"],
    ];
    const match = redirects.find(
      ([from]) => pathname === from || pathname.startsWith(`${from}/`),
    );
    if (match) {
      router.replace(match[1]);
    }
  }, [operatorRole, pathname, router]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    if (
      operatorRole !== "manager" ||
      pathname === "/operations" ||
      pathname.startsWith("/operations/") ||
      !session.permissions.includes("operation.read")
    ) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/operations/today`, {
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
          },
        });
        const payload = await readApiJson<OperationOpenCheck>(response);
        if (cancelled || !response.ok) return;
        if (payload.pendingClosureOperation) {
          router.replace(
            `/operations?date=${encodeURIComponent(
              payload.pendingClosureOperation.operationDate,
            )}&prompt=close`,
          );
        } else if (payload.branch && !payload.operation) {
          router.replace("/operations?prompt=open");
        }
      } catch {
        // Navigation should not fail just because the prompt check could not run.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    operatorRole,
    pathname,
    router,
    session.accessToken,
    session.permissions,
    session.tokenType,
  ]);

  function handleLogout() {
    clearAuthState();
    router.replace("/login");
  }

  if (operatorRole === "staff") {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--slate-text)]">
        <header className="border-b border-[var(--line)] bg-white/85 px-4 py-3 shadow-[0_10px_30px_rgba(20,33,61,0.05)] backdrop-blur sm:px-6">
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
            <button
              type="button"
              onClick={handleLogout}
              className="btn btn-ghost h-9 rounded-xl text-xs"
            >
              <LogOut className="size-3.5" />
              sign out
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
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-4">
            <Link
              href={homeHref}
              className="flex items-center gap-2 rounded-2xl px-1 py-1 transition hover:bg-white/8"
            >
              <Image
                src={rembehIcon}
                alt="REMBEH"
                className="size-9 rounded-xl object-cover shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
                priority
              />
              <div>
                <p className="font-[family-name:var(--font-display)] text-lg leading-none tracking-[-0.03em] text-white">
                  REMBEH
                </p>
                <p className="mt-1 text-[10px] capitalize tracking-[0.12em] text-white/45">
                  {operatorRole === "owner" ? "Owner" : "Manager"}
                </p>
              </div>
            </Link>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-xl bg-white/10 text-white lg:hidden"
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
                    item.href !== "/owner" &&
                    pathname.startsWith(`${item.href}/`)) ||
                  (item.href === "/dashboard" && pathname === "/dashboard") ||
                  (item.href === "/owner" && pathname === "/owner");

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? "bg-[var(--forest-emerald)] text-white shadow-[0_10px_24px_rgba(0,0,0,0.12)]"
                        : "text-white/72 hover:bg-white/10 hover:text-white"
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
                  href={
                    operatorRole === "owner" ? "/owner/settings" : "/settings"
                  }
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    pathname ===
                      (operatorRole === "owner"
                        ? "/owner/settings"
                        : "/settings") ||
                    pathname.startsWith(
                      operatorRole === "owner"
                        ? "/owner/settings/"
                        : "/settings/",
                    )
                      ? "bg-[var(--forest-emerald)] text-white shadow-[0_10px_24px_rgba(0,0,0,0.12)]"
                      : "text-white/72 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Settings className="size-4" />
                  Settings
                </Link>
              ) : null}
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-white/72 transition hover:bg-white/10 hover:text-white"
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
          className="fixed inset-0 z-30 bg-[rgba(10,18,32,0.5)] backdrop-blur-[2px] lg:hidden"
          aria-label="Close overlay"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="min-h-screen lg:pl-[232px]">
        <header className="sticky top-0 z-20 border-b border-[rgba(184,200,192,0.78)] bg-[rgba(248,251,249,0.88)] px-4 py-2.5 shadow-[0_10px_30px_rgba(20,33,61,0.05)] backdrop-blur sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                className="grid size-9 place-items-center rounded-xl border border-[var(--line)] bg-white text-[var(--midnight-navy)] shadow-[0_6px_16px_rgba(20,33,61,0.06)] lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="size-4" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold tracking-[0.12em] text-[var(--forest-emerald)]">
                  {workspace?.name ?? "REMBEH"}
                </p>
                <h1 className="truncate text-sm font-bold text-[var(--midnight-navy)]">
                  {operatorRole === "manager"
                    ? (branch?.name ?? "branch")
                    : "account"}
                </h1>
              </div>
            </div>

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-2.5 text-xs font-semibold text-[var(--midnight-navy)] shadow-[0_8px_20px_rgba(20,33,61,0.06)]"
                aria-expanded={profileOpen}
              >
                <span className="grid size-6 place-items-center rounded-lg bg-[var(--mint-wash)] text-[var(--forest-emerald)]">
                  <UserRound className="size-3.5" />
                </span>
                <span className="hidden max-w-[140px] truncate sm:inline">
                  {user?.name ?? "profile"}
                </span>
                <ChevronDown className="size-3.5 text-slate-500" />
              </button>

              {profileOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[260px] overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_18px_44px_rgba(20,33,61,0.18)]">
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
                      value={
                        user?.roleName ??
                        (operatorRole === "owner" ? "account owner" : "manager")
                      }
                    />
                    <ProfileLine
                      label="Account"
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
                        value={
                          [workspace?.country, workspace?.currency]
                            .filter(Boolean)
                            .join(" · ") || "—"
                        }
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

        <main className="px-4 py-5 sm:px-5 sm:py-6">{children}</main>
      </div>
    </div>
  );
}

function ProfileLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500 capitalize">{label}</span>
      <span className="max-w-[160px] truncate text-right font-semibold text-[var(--midnight-navy)]">
        {value}
      </span>
    </div>
  );
}
