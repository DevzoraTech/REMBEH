"use client";

import {
  ArrowRight,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileText,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldAlert,
  Users,
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
import { PushNotificationsBootstrap } from "./push-notifications-bootstrap";

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

export function AppShell({ children, session, user }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railSidebarPinned, setRailSidebarPinned] = useState(false);
  const [railSidebarHover, setRailSidebarHover] = useState(false);
  const railSidebarLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const railSidebarExpanded = railSidebarPinned || railSidebarHover;
  const operatorRole = resolveOperatorRole(session, user);
  const homeHref = operatorRole === "owner" ? "/owner" : "/dashboard";
  const settingsHref =
    operatorRole === "owner" ? "/owner/settings" : "/settings";

  const primaryNav = useMemo(() => {
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
        href: "/owner/portfolio",
        label: "Loans",
        icon: FileText,
        enabled: operatorRole === "owner",
      },
      {
        href: "/owner/borrowers",
        label: "Borrowers",
        icon: Users,
        enabled: operatorRole === "owner",
      },
      {
        href: "/owner/collections",
        label: "Repayments",
        icon: HandCoins,
        enabled: operatorRole === "owner",
      },
      {
        href: "/owner/reports",
        label: "Reports",
        icon: ClipboardCheck,
        enabled: operatorRole === "owner",
      },
      {
        href: "/owner/risk",
        label: "Risk Register",
        icon: ShieldAlert,
        enabled: operatorRole === "owner",
      },
      {
        href: "/owner/settings",
        label: "Settings",
        icon: Settings,
        enabled: operatorRole === "owner",
      },
    ];

    const managerPrimary = [
      {
        href: "/dashboard",
        label: "Overview",
        icon: LayoutDashboard,
        enabled: operatorRole === "manager",
        matchPath: "/dashboard",
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
        href: "/collections/daily",
        label: "Repayments",
        icon: HandCoins,
        enabled:
          operatorRole === "manager" &&
          Boolean(session.permissions.includes("collection.read")),
      },
      {
        href: "/reports",
        label: "Reports",
        icon: ClipboardCheck,
        enabled:
          operatorRole === "manager" &&
          Boolean(session.permissions.includes("operation.read")),
      },
      {
        href: "/operations",
        label: "Daily Operations",
        icon: CalendarDays,
        enabled:
          operatorRole === "manager" &&
          Boolean(session.permissions.includes("operation.read")),
      },
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        enabled: operatorRole === "manager",
      },
    ];

    return (operatorRole === "owner" ? ownerPrimary : managerPrimary).filter(
      (item) => item.enabled,
    );
  }, [operatorRole, session.permissions]);

  const sidebarPromo =
    operatorRole === "owner"
      ? {
          href: "/owner/branches",
          title: "Scale your lending",
          description: "Invite managers and agents to grow your portfolio.",
          cta: "Invite Team",
          collapsedLabel: "Invite team",
        }
      : {
          href: "/agents",
          title: "Grow your branch",
          description: "Invite agents so repayments and field work stay covered.",
          cta: "Invite Agents",
          collapsedLabel: "Invite agents",
        };

  useEffect(() => {
    if (operatorRole !== "owner") return;
    const redirects: Array<[string, string]> = [
      ["/dashboard", "/owner"],
      ["/branches", "/owner/branches"],
      ["/operations", "/owner/reports"],
      ["/loans", "/owner/portfolio"],
      ["/clients", "/owner/borrowers"],
      ["/blacklist-watchlist", "/owner/risk"],
      ["/collections/daily", "/owner/collections"],
      ["/owner/payments", "/owner/collections"],
      ["/reports", "/owner/reports"],
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
        <PushNotificationsBootstrap enabled />
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
    <div className="min-h-screen bg-[#f6f8fb] text-[var(--slate-text)]">
      <PushNotificationsBootstrap enabled />
      <RailSidebar
        homeHref={homeHref}
        mobileOpen={mobileOpen}
        pathname={pathname}
        primaryNav={primaryNav}
        user={user}
        roleLabel={operatorRole === "owner" ? "Owner" : "Manager"}
        settingsHref={settingsHref}
        promo={sidebarPromo}
        expanded={railSidebarExpanded}
        pinned={railSidebarPinned}
        onCloseMobile={() => setMobileOpen(false)}
        onTogglePinned={() => {
          setRailSidebarPinned((pinned) => !pinned);
        }}
        onHoverChange={(hovering) => {
          if (railSidebarLeaveTimer.current) {
            clearTimeout(railSidebarLeaveTimer.current);
            railSidebarLeaveTimer.current = null;
          }
          if (hovering) {
            setRailSidebarHover(true);
            return;
          }
          railSidebarLeaveTimer.current = setTimeout(() => {
            setRailSidebarHover(false);
            railSidebarLeaveTimer.current = null;
          }, 160);
        }}
        onLogout={handleLogout}
      />

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-[rgba(10,18,32,0.5)] backdrop-blur-[2px] lg:hidden"
          aria-label="Close overlay"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <button
        type="button"
        className="fixed left-4 top-4 z-30 grid size-10 place-items-center rounded-2xl border border-white/50 bg-white text-[var(--midnight-navy)] shadow-[0_12px_26px_rgba(15,23,42,0.1)] lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="size-4" />
      </button>

      {/* Keep content inset at the rail width so hover-expand overlays instead of shifting the page. */}
      <main className="min-h-screen px-4 py-5 sm:px-5 lg:pl-[96px] lg:pr-5 lg:pt-5">
        {children}
      </main>
    </div>
  );
}

function RailSidebar({
  homeHref,
  mobileOpen,
  pathname,
  primaryNav,
  user,
  roleLabel,
  settingsHref,
  promo,
  expanded,
  pinned,
  onCloseMobile,
  onTogglePinned,
  onHoverChange,
  onLogout,
}: {
  homeHref: string;
  mobileOpen: boolean;
  pathname: string;
  primaryNav: Array<{
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    matchPath?: string;
  }>;
  user: RembehUser | null;
  roleLabel: string;
  settingsHref: string;
  promo: {
    href: string;
    title: string;
    description: string;
    cta: string;
    collapsedLabel: string;
  };
  expanded: boolean;
  pinned: boolean;
  onCloseMobile: () => void;
  onTogglePinned: () => void;
  onHoverChange: (hovering: boolean) => void;
  onLogout: () => void;
}) {
  const collapsed = !expanded;
  const rootPaths = new Set(["/owner", "/dashboard"]);

  return (
    <aside
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocusCapture={() => onHoverChange(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onHoverChange(false);
        }
      }}
      className={`fixed inset-y-0 left-0 z-40 w-[248px] transform overflow-visible bg-[#003f35] text-white transition-[width,transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:translate-x-0 ${
        collapsed
          ? "lg:w-[76px] lg:shadow-[10px_0_28px_rgba(0,38,31,0.12)]"
          : "lg:w-[248px] lg:shadow-[22px_0_56px_rgba(0,38,31,0.28)]"
      } ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#00473d_0%,#003e35_52%,#002e28_100%)]" />
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent transition-opacity duration-300 ${
          collapsed ? "opacity-40" : "opacity-70"
        }`}
      />
      <div
        className={`relative flex h-full min-h-0 flex-col py-5 transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] [@media(max-height:720px)]:py-4 ${
          collapsed ? "px-5 lg:px-2" : "px-5"
        }`}
      >
        <div
          className={`flex h-10 items-center gap-3 ${
            collapsed ? "lg:justify-center" : "justify-between"
          }`}
        >
          <RailSidebarTooltip label="Overview" show={collapsed}>
            <Link
              href={homeHref}
              onClick={onCloseMobile}
              className={`flex min-w-0 items-center gap-3 overflow-hidden ${
                collapsed ? "lg:justify-center" : ""
              }`}
            >
              <Image
                src={rembehIcon}
                alt="REMBEH"
                className={`shrink-0 rounded-xl object-cover shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all duration-300 ${
                  collapsed ? "size-10 lg:size-9 lg:rounded-[10px]" : "size-10"
                }`}
                priority
              />
              <div
                className={`min-w-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  collapsed
                    ? "max-w-0 opacity-0 lg:pointer-events-none"
                    : "max-w-[160px] opacity-100"
                }`}
              >
                <p className="whitespace-nowrap font-[family-name:var(--font-display)] text-xl font-bold leading-none tracking-[-0.03em] text-white">
                  REMBEH
                </p>
                <p className="mt-1 whitespace-nowrap text-[8px] font-medium uppercase tracking-[0.14em] text-white/72">
                  Financial Services
                </p>
              </div>
            </Link>
          </RailSidebarTooltip>
          <RailSidebarTooltip
            label={pinned ? "Unpin sidebar" : "Keep sidebar open"}
            show={collapsed}
          >
            <button
              type="button"
              className={`hidden place-items-center border border-white/10 bg-white/10 text-white/82 shadow-[0_10px_22px_rgba(0,21,17,0.18)] transition hover:bg-white/16 hover:text-white lg:grid ${
                collapsed
                  ? "pointer-events-none absolute opacity-0"
                  : "size-8 rounded-xl"
              }`}
              onClick={onTogglePinned}
              aria-label={pinned ? "Unpin sidebar" : "Keep sidebar open"}
              aria-pressed={pinned}
            >
              {pinned ? (
                <PanelLeftClose className="size-4" />
              ) : (
                <PanelLeftOpen className="size-4" />
              )}
            </button>
          </RailSidebarTooltip>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-2xl bg-white/10 text-white lg:hidden"
            onClick={onCloseMobile}
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="mt-6 min-h-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto pr-0 [@media(max-height:720px)]:mt-4 [@media(max-height:720px)]:space-y-0.5">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const activePath = item.matchPath ?? item.href;
            const active =
              pathname === activePath ||
              (!rootPaths.has(activePath) &&
                pathname.startsWith(`${activePath}/`));
            return (
              <RailSidebarTooltip
                key={`${item.href}-${item.label}`}
                label={item.label}
                show={collapsed}
              >
                <Link
                  href={item.href}
                  onClick={onCloseMobile}
                  className={`relative flex h-10 w-full items-center rounded-xl text-[13px] font-medium transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] [@media(max-height:720px)]:h-9 ${
                    collapsed ? "lg:justify-center lg:px-0" : "gap-3 px-3"
                  } ${
                    active
                      ? `bg-white/14 text-white ring-1 ring-white/10 shadow-[0_15px_28px_rgba(0,21,17,0.18)] ${
                          collapsed
                            ? ""
                            : "before:absolute before:left-0 before:h-6 before:w-1 before:rounded-r-full before:bg-[#20d08d]"
                        }`
                      : "text-white/78 hover:bg-white/9 hover:text-white"
                  }`}
                >
                  <Icon
                    className={`size-4 shrink-0 transition-colors duration-200 ${
                      active ? "text-[#7df2bd]" : "text-white/75"
                    }`}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      collapsed
                        ? "max-w-0 opacity-0 lg:pointer-events-none"
                        : "max-w-[160px] opacity-100"
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              </RailSidebarTooltip>
            );
          })}
        </nav>

        <div
          className={`mt-2 shrink-0 overflow-hidden rounded-2xl border border-white/12 bg-white/[0.045] shadow-[0_14px_30px_rgba(0,21,17,0.14)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] [@media(max-height:720px)]:p-2 ${
            collapsed ? "p-3 lg:p-2" : "p-3"
          }`}
        >
          <div className={collapsed ? "hidden lg:block" : "hidden"}>
            <RailSidebarTooltip label={promo.collapsedLabel} show>
              <Link
                href={promo.href}
                onClick={onCloseMobile}
                className="grid h-10 w-full place-items-center rounded-xl bg-[#19a876] text-white shadow-[0_10px_20px_rgba(25,168,118,0.2)] transition hover:bg-[#15986b]"
                aria-label={promo.collapsedLabel}
              >
                <Users className="size-4" />
              </Link>
            </RailSidebarTooltip>
          </div>
          <div
            className={`transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              collapsed
                ? "max-h-0 opacity-0 lg:pointer-events-none lg:max-h-0"
                : "max-h-40 opacity-100"
            } ${collapsed ? "lg:hidden" : ""}`}
          >
            <div className="flex items-start gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#d9f7e7] text-[#006b4f]">
                <Users className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-white">{promo.title}</p>
                <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-4 text-white/64 [@media(max-height:720px)]:line-clamp-1">
                  {promo.description}
                </p>
              </div>
            </div>
            <Link
              href={promo.href}
              onClick={onCloseMobile}
              className="mt-3 flex h-8 items-center justify-between rounded-xl bg-[#19a876] px-3 text-[11px] font-medium text-white shadow-[0_10px_20px_rgba(25,168,118,0.2)] transition hover:bg-[#15986b] [@media(max-height:720px)]:mt-2 [@media(max-height:720px)]:h-7"
            >
              {promo.cta}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className={`lg:hidden ${collapsed ? "" : "hidden"}`}>
            <div className="flex items-start gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#d9f7e7] text-[#006b4f]">
                <Users className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-white">{promo.title}</p>
                <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-4 text-white/64">
                  {promo.description}
                </p>
              </div>
            </div>
            <Link
              href={promo.href}
              onClick={onCloseMobile}
              className="mt-3 flex h-8 items-center justify-between rounded-xl bg-[#19a876] px-3 text-[11px] font-medium text-white"
            >
              {promo.cta}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        <div className="mt-3 shrink-0 border-t border-white/14 pt-3 [@media(max-height:720px)]:mt-2 [@media(max-height:720px)]:pt-2">
          <RailSidebarTooltip
            label={user?.name ?? roleLabel}
            show={collapsed}
          >
            <div
              className={`flex items-center overflow-hidden transition-all duration-300 ${
                collapsed ? "lg:justify-center" : "gap-3"
              }`}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/12 text-xs font-medium text-white">
                {initials(user?.name ?? roleLabel)}
              </span>
              <div
                className={`min-w-0 flex-1 overflow-hidden transition-all duration-300 ${
                  collapsed
                    ? "max-w-0 opacity-0 lg:pointer-events-none"
                    : "max-w-[140px] opacity-100"
                }`}
              >
                <p className="truncate whitespace-nowrap text-xs font-medium text-white">
                  {user?.name ?? roleLabel}
                </p>
                <p className="whitespace-nowrap text-xs font-semibold text-white/62">
                  {roleLabel}
                </p>
              </div>
              <Link
                href={settingsHref}
                onClick={onCloseMobile}
                className={`grid size-8 shrink-0 place-items-center rounded-xl text-white/75 transition hover:bg-white/10 hover:text-white ${
                  collapsed ? "lg:hidden" : ""
                }`}
                aria-label="Open settings"
              >
                <Settings className="size-4" />
              </Link>
            </div>
          </RailSidebarTooltip>
          <RailSidebarTooltip label="Sign out" show={collapsed}>
            <button
              type="button"
              onClick={onLogout}
              className={`mt-3 flex h-9 w-full items-center rounded-xl text-xs font-semibold text-white/75 transition hover:bg-white/10 hover:text-white [@media(max-height:720px)]:mt-2 [@media(max-height:720px)]:h-8 ${
                collapsed ? "lg:justify-center lg:px-0" : "gap-2 px-2"
              }`}
            >
              <LogOut className="size-3.5 shrink-0" />
              <span
                className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${
                  collapsed
                    ? "max-w-0 opacity-0 lg:pointer-events-none"
                    : "max-w-[80px] opacity-100"
                }`}
              >
                Sign out
              </span>
            </button>
          </RailSidebarTooltip>
        </div>
      </div>
    </aside>
  );
}

function RailSidebarTooltip({
  label,
  children,
  show = true,
}: {
  label: string;
  children: ReactNode;
  show?: boolean;
}) {
  return (
    <span className="group/sidebar-tip relative flex min-w-0">
      {children}
      {show ? (
        <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 hidden max-w-[230px] -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg border border-white/10 bg-[#071611] px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-[0_14px_32px_rgba(7,22,17,0.28)] transition duration-150 group-hover/sidebar-tip:translate-x-0 group-hover/sidebar-tip:opacity-100 lg:block">
          {label}
        </span>
      ) : null}
    </span>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
