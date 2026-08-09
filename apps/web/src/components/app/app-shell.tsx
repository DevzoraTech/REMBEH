"use client";

import {
  Building2,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileText,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  ShieldAlert,
  Users,
  UserRound,
  Lock,
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
import { playNotificationSound } from "../../lib/notification-sound";
import {
  connectRealtime,
  type SubscriptionPaymentUpdatedEvent,
} from "../../lib/realtime";
import {
  FALLBACK_SUBSCRIPTION_PLANS,
  SubscriptionPaymentResultOverlay,
  type SubscriptionBillingPlanOption,
  type SubscriptionPaymentResultOverlayState,
  type SubscriptionPaymentRow,
  hasSeenSubscriptionPaymentResult,
  isManualSubscriptionPayment,
  markSubscriptionPaymentResultSeen,
  planForSubscriptionPaymentRow,
} from "./subscription-payment-result-overlay";

type AppShellProps = {
  children: ReactNode;
  session: RembehSession;
  workspace: RembehWorkspace | null;
  user: RembehUser | null;
  branch?: RembehBranch | null;
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
  const [branchBilling, setBranchBilling] = useState<{
    locked: boolean;
    message: string | null;
    status: string | null;
    daysUntilGraceEnd: number | null;
    branchName: string | null;
  } | null>(null);
  const [graceModalOpen, setGraceModalOpen] = useState(false);
  const [subscriptionPlans, setSubscriptionPlans] = useState<
    SubscriptionBillingPlanOption[]
  >(FALLBACK_SUBSCRIPTION_PLANS);
  const [subscriptionPaymentResult, setSubscriptionPaymentResult] =
    useState<SubscriptionPaymentResultOverlayState | null>(null);
  const railSidebarExpanded = railSidebarPinned || railSidebarHover;
  const operatorRole = resolveOperatorRole(session, user);
  const homeHref = operatorRole === "owner" ? "/owner" : "/dashboard";
  const isSubscriptionPage =
    pathname === "/subscription" || pathname.startsWith("/subscription/");
  const branchLocked =
    operatorRole === "manager" && Boolean(branchBilling?.locked);

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
        href: "/owner/subscription",
        label: "Subscription",
        icon: CreditCard,
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
        href: "/owner/shortages",
        label: "Shortages",
        icon: Scale,
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
        label: "Field Officers",
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
        href: "/shortages",
        label: "Shortages",
        icon: Scale,
        enabled:
          operatorRole === "manager" &&
          Boolean(session.permissions.includes("operation.read")),
      },
      {
        href: "/subscription",
        label: "Subscription",
        icon: CreditCard,
        enabled: operatorRole === "manager",
      },
    ];

    const items = (
      operatorRole === "owner" ? ownerPrimary : managerPrimary
    ).filter((item) => item.enabled);

    if (branchLocked) {
      return items.filter((item) => item.href === "/subscription");
    }
    return items;
  }, [branchLocked, operatorRole, session.permissions]);

  useEffect(() => {
    if (operatorRole !== "manager") return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/billing/my-branch`, {
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
          },
        });
        const payload = await readApiJson<{
          locked?: boolean;
          message?: string | null;
          status?: string | null;
          daysUntilGraceEnd?: number | null;
          branchName?: string | null;
        }>(response);
        if (cancelled || !response.ok) return;
        setBranchBilling({
          locked: Boolean(payload.locked),
          message: payload.message ?? null,
          status: payload.status ?? null,
          daysUntilGraceEnd:
            typeof payload.daysUntilGraceEnd === "number"
              ? payload.daysUntilGraceEnd
              : null,
          branchName: payload.branchName ?? null,
        });
      } catch {
        // Non-blocking: managers can still browse read-only without this check.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [operatorRole, session.accessToken, session.tokenType]);

  useEffect(() => {
    if (operatorRole !== "manager" || !branchBilling) return;
    if (branchBilling.status !== "GRACE" || branchBilling.locked) return;

    const key = `rembeh-grace-modal:${session.accessToken.slice(-16)}`;
    try {
      if (window.sessionStorage.getItem(key) === "1") return;
    } catch {
      // sessionStorage may be unavailable; still show once in-memory this mount.
    }
    setGraceModalOpen(true);
    playNotificationSound();
  }, [branchBilling, operatorRole, session.accessToken]);

  useEffect(() => {
    if (!branchLocked || isSubscriptionPage) return;
    router.replace("/subscription");
  }, [branchLocked, isSubscriptionPage, router]);

  function dismissGraceModal() {
    const key = `rembeh-grace-modal:${session.accessToken.slice(-16)}`;
    try {
      window.sessionStorage.setItem(key, "1");
    } catch {
      // ignore
    }
    setGraceModalOpen(false);
  }

  function buildSubscriptionPaymentResult(row: SubscriptionPaymentRow) {
    const fallback =
      subscriptionPlans.find((plan) => plan.defaultSelected) ??
      subscriptionPlans[0] ??
      FALLBACK_SUBSCRIPTION_PLANS[1];
    return {
      kind: row.status === "Failed" ? "failed" : "success",
      payment: row,
      plan: planForSubscriptionPaymentRow(row, subscriptionPlans, fallback),
    } satisfies SubscriptionPaymentResultOverlayState;
  }

  function showSubscriptionPaymentResult(row: SubscriptionPaymentRow) {
    if (
      !isManualSubscriptionPayment(row) ||
      (row.status !== "Paid" && row.status !== "Failed") ||
      hasSeenSubscriptionPaymentResult(row.id)
    ) {
      return;
    }
    if (row.status === "Paid") {
      setBranchBilling((current) =>
        current
          ? {
              ...current,
              locked: false,
              status: "ACTIVE",
              message: null,
              branchName: row.branchName,
              daysUntilGraceEnd: null,
            }
          : current,
      );
    }
    setSubscriptionPaymentResult(buildSubscriptionPaymentResult(row));
  }

  function closeSubscriptionPaymentResult() {
    if (subscriptionPaymentResult?.payment.id) {
      markSubscriptionPaymentResultSeen(subscriptionPaymentResult.payment.id);
    }
    setSubscriptionPaymentResult(null);
  }

  function retrySubscriptionPayment() {
    const row = subscriptionPaymentResult?.payment;
    if (row?.id) {
      markSubscriptionPaymentResultSeen(row.id);
    }
    setSubscriptionPaymentResult(null);
    const subscriptionPath =
      operatorRole === "owner" ? "/owner/subscription" : "/subscription";
    router.push(
      row?.id
        ? `${subscriptionPath}?retryPayment=${encodeURIComponent(row.id)}`
        : subscriptionPath,
    );
  }

  useEffect(() => {
    if (operatorRole !== "owner") return;
    const redirects: Array<[string, string]> = [
      ["/dashboard", "/owner"],
      ["/branches", "/owner/branches"],
      ["/subscription", "/owner/subscription"],
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
      const suffix =
        typeof window !== "undefined" ? window.location.search : "";
      router.replace(`${match[1]}${suffix}`);
    }
  }, [operatorRole, pathname, router]);

  useEffect(() => {
    if (
      operatorRole === "staff" ||
      isSubscriptionPage ||
      subscriptionPaymentResult
    ) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const headers = {
        Authorization: `${session.tokenType} ${session.accessToken}`,
      };
      let plans = FALLBACK_SUBSCRIPTION_PLANS;
      try {
        const summaryResponse = await fetch(`${apiBaseUrl}/billing/summary`, {
          headers,
        });
        const summaryPayload = await readApiJson<{
          plans?: SubscriptionBillingPlanOption[];
        }>(summaryResponse);
        if (
          !cancelled &&
          summaryResponse.ok &&
          Array.isArray(summaryPayload.plans) &&
          summaryPayload.plans.length > 0
        ) {
          plans = summaryPayload.plans;
          setSubscriptionPlans(summaryPayload.plans);
        }
      } catch {
        plans = FALLBACK_SUBSCRIPTION_PLANS;
      }

      try {
        const paymentsResponse = await fetch(`${apiBaseUrl}/billing/payments`, {
          headers,
        });
        const paymentsPayload = await readApiJson<{
          payments?: SubscriptionPaymentRow[];
        }>(paymentsResponse);
        if (cancelled || !paymentsResponse.ok) return;
        const result = (paymentsPayload.payments ?? [])
          .filter(
            (row) =>
              isManualSubscriptionPayment(row) &&
              (row.status === "Paid" || row.status === "Failed") &&
              !hasSeenSubscriptionPaymentResult(row.id),
          )
          .sort((a, b) => {
            const bTime = Date.parse(b.verifiedAt ?? b.date);
            const aTime = Date.parse(a.verifiedAt ?? a.date);
            return bTime - aTime;
          })[0];
        if (!result) return;

        const fallback =
          plans.find((plan) => plan.defaultSelected) ??
          plans[0] ??
          FALLBACK_SUBSCRIPTION_PLANS[1];
        setSubscriptionPaymentResult({
          kind: result.status === "Failed" ? "failed" : "success",
          payment: result,
          plan: planForSubscriptionPaymentRow(result, plans, fallback),
        });
      } catch {
        // Payment result modals are helpful but should never block navigation.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isSubscriptionPage,
    operatorRole,
    session.accessToken,
    session.tokenType,
    subscriptionPaymentResult,
  ]);

  useEffect(() => {
    if (operatorRole === "staff" || isSubscriptionPage) return;
    const socket = connectRealtime(session.accessToken);
    const onPaymentUpdate = (event: SubscriptionPaymentUpdatedEvent) => {
      const row = event.payment;
      if (!row || (row.kind ?? "subscription") === "sms") return;
      showSubscriptionPaymentResult(row);
    };

    socket.on("subscription_payment.updated", onPaymentUpdate);
    return () => {
      socket.off("subscription_payment.updated", onPaymentUpdate);
      socket.disconnect();
    };
  }, [
    isSubscriptionPage,
    operatorRole,
    session.accessToken,
    subscriptionPlans,
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

  const graceDays = Math.max(0, branchBilling?.daysUntilGraceEnd ?? 0);

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
        {branchLocked && !isSubscriptionPage ? (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">This branch is paused</p>
              <p className="mt-0.5 text-rose-900/90">
                Renew your plan to continue lending and collections.
              </p>
            </div>
          </div>
        ) : null}
        {children}
      </main>

      {graceModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,18,32,0.55)] px-4 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="grace-modal-title"
            className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_64px_rgba(15,23,42,0.22)]"
          >
            <div className="grid size-11 place-items-center rounded-2xl bg-amber-50 text-amber-700">
              <ShieldAlert className="size-5" />
            </div>
            <h2
              id="grace-modal-title"
              className="mt-4 font-[family-name:var(--font-display)] text-xl tracking-[-0.02em] text-[#070b18]"
            >
              Subscription expired
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {branchBilling?.branchName
                ? `${branchBilling.branchName} is in a grace period. `
                : "Your branch is in a grace period. "}
              You have {graceDays} day{graceDays === 1 ? "" : "s"} left to renew
              before the branch is locked.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={dismissGraceModal}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Exit
              </button>
              <Link
                href="/subscription"
                onClick={dismissGraceModal}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[#07885f] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(7,136,95,0.22)] hover:bg-[#067352]"
              >
                Renew
              </Link>
            </div>
          </div>
        </div>
      ) : null}
      {subscriptionPaymentResult ? (
        <SubscriptionPaymentResultOverlay
          result={subscriptionPaymentResult}
          onClose={closeSubscriptionPaymentResult}
          onTryAgain={retrySubscriptionPayment}
        />
      ) : null}
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

        <div className="mt-3 shrink-0 border-t border-white/14 pt-3 [@media(max-height:720px)]:mt-2 [@media(max-height:720px)]:pt-2">
          <RailSidebarTooltip label={user?.name ?? roleLabel} show={collapsed}>
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
