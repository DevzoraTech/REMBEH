"use client";

import { useEffect, useRef, useState } from "react";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  RembehSession,
  isSessionExpired,
  readAuthState,
} from "../../lib/auth-session";
import { playNotificationSound } from "../../lib/notification-sound";
import {
  OwnerBranch,
  OwnerLoan,
  OwnerReport,
  authHeaders,
  formatNumber,
  isLoanScheduleOverdue,
} from "./owner-common";

export type NotificationScope = "owner" | "manager";

export type OwnerNotificationItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: "red" | "gold" | "blue" | "green";
  icon: "alert" | "report" | "loan";
  time: string;
};

type RiskEntry = {
  id: string;
  type: "BLACKLISTED" | "WATCHLIST";
};

type CacheEntry = {
  key: string;
  at: number;
  items: OwnerNotificationItem[];
};

const CACHE_TTL_MS = 25_000;
let cache: CacheEntry | null = null;
let inflight: Promise<OwnerNotificationItem[]> | null = null;

function timeAgo(value: string | null | undefined) {
  if (!value) return "Today";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Today";
  const minutes = Math.max(
    0,
    Math.round((Date.now() - parsed.getTime()) / 60_000),
  );
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

async function fetchJson<T>(session: RembehSession, path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: authHeaders(session),
  });
  const payload = await readApiJson<T & { message?: string | string[] }>(
    response,
  );
  if (!response.ok) {
    throw new Error(formatApiError(payload.message));
  }
  return payload;
}

function linksFor(scope: NotificationScope) {
  if (scope === "manager") {
    return {
      reports: "/reports",
      loans: "/loans",
      risk: "/blacklist-watchlist",
      branches: "/agents",
    };
  }
  return {
    reports: "/owner/reports",
    loans: "/owner/portfolio",
    risk: "/owner/risk",
    branches: "/owner/branches",
  };
}

export async function loadOwnerNotifications(
  session: RembehSession,
  options?: { force?: boolean; scope?: NotificationScope },
): Promise<OwnerNotificationItem[]> {
  const scope = options?.scope ?? "owner";
  const key = `${scope}:${session.accessToken.slice(-24)}`;
  const now = Date.now();
  if (
    !options?.force &&
    cache &&
    cache.key === key &&
    now - cache.at < CACHE_TTL_MS
  ) {
    return cache.items;
  }
  if (!options?.force && inflight) {
    return inflight;
  }

  inflight = (async () => {
    const links = linksFor(scope);
    const [
      branchesPayload,
      reportsPayload,
      loansPayload,
      riskPayload,
      billingPayload,
    ] = await Promise.all([
      fetchJson<{ branches?: OwnerBranch[] }>(session, "/branches"),
      fetchJson<{ reports?: OwnerReport[] }>(
        session,
        "/operations/reports",
      ).catch(() => ({ reports: [] as OwnerReport[] })),
      fetchJson<{ loans?: OwnerLoan[] }>(session, "/loans"),
      fetchJson<{ entries?: RiskEntry[] }>(session, "/borrower-lists").catch(
        () => ({ entries: [] as RiskEntry[] }),
      ),
      scope === "owner"
        ? fetchJson<{ reminders?: string[] }>(session, "/billing/summary").catch(
            () => ({ reminders: [] as string[] }),
          )
        : Promise.resolve({ reminders: [] as string[] }),
    ]);

    const branches = branchesPayload.branches ?? [];
    const reports = reportsPayload.reports ?? [];
    const loans = loansPayload.loans ?? [];
    const riskEntries = riskPayload.entries ?? [];
    const billingReminders = billingPayload.reminders ?? [];

    const waiting = reports.filter((report) => report.status === "SENT_TO_OWNER");
    const returned = reports.filter(
      (report) => report.status === "RETURNED_TO_MANAGER",
    );
    const variance = reports.filter(
      (report) =>
        report.status === "SENT_TO_OWNER" &&
        (report.closingVariance ?? 0) !== 0,
    );
    const missingManagers = branches.filter(
      (branch) =>
        !branch.manager ||
        branch.manager.status !== "ACTIVE" ||
        branch.manager.inviteStatus === "PENDING",
    );
    const overdueLoans = loans.filter(isLoanScheduleOverdue);
    const blacklisted = riskEntries.filter(
      (entry) => entry.type === "BLACKLISTED",
    );
    const watchlisted = riskEntries.filter(
      (entry) => entry.type === "WATCHLIST",
    );

    const items: OwnerNotificationItem[] = [];

    if (scope === "owner") {
      billingReminders.forEach((reminder, index) => {
        const urgent = /lock|paused|expired|grace|needs renewing|stay open/i.test(
          reminder,
        );
        items.push({
          id: `billing-${index}`,
          title: "Branch subscription",
          detail: reminder,
          href: "/owner/subscription",
          tone: urgent ? "red" : "gold",
          icon: "alert",
          time: "Today",
        });
      });

      waiting.slice(0, 4).forEach((report) => {
        items.push({
          id: `report-${report.id}`,
          title: `Approve ${report.branchName}`,
          detail: `${report.reportNumber} is waiting for your approval`,
          href: `${links.reports}?reportId=${encodeURIComponent(report.id)}`,
          tone: "green",
          icon: "report",
          time: timeAgo(report.generatedAt),
        });
      });

      if (waiting.length > 4) {
        items.push({
          id: "waiting-reports-more",
          title: `${formatNumber(waiting.length - 4)} more reports waiting`,
          detail: "Open reports to review the full approval queue.",
          href: links.reports,
          tone: "gold",
          icon: "report",
          time: "Today",
        });
      }

      if (variance.length > 0) {
        items.push({
          id: "report-variance",
          title: `${formatNumber(variance.length)} report${variance.length === 1 ? "" : "s"} with cash variance`,
          detail: "Counted cash does not match expected closing cash.",
          href: links.reports,
          tone: "red",
          icon: "alert",
          time: "Today",
        });
      }

      if (returned.length > 0) {
        items.push({
          id: "returned-reports",
          title: `${formatNumber(returned.length)} returned report${returned.length === 1 ? "" : "s"}`,
          detail: "Returned to managers and still need follow-up.",
          href: links.reports,
          tone: "blue",
          icon: "report",
          time: "Today",
        });
      }

      if (missingManagers.length > 0) {
        items.push({
          id: "missing-managers",
          title: `${formatNumber(missingManagers.length)} branch${missingManagers.length === 1 ? "" : "es"} need a manager`,
          detail: "Assign or activate a manager to keep operations running.",
          href: `${links.branches}?status=pending`,
          tone: "blue",
          icon: "alert",
          time: "Today",
        });
      }
    } else {
      if (returned.length > 0) {
        items.push({
          id: "returned-reports",
          title: `${formatNumber(returned.length)} returned report${returned.length === 1 ? "" : "s"}`,
          detail: "Owner returned these reports — follow up in Daily Operations.",
          href: links.reports,
          tone: "blue",
          icon: "report",
          time: "Today",
        });
      }

      if (waiting.length > 0) {
        items.push({
          id: "waiting-owner",
          title: "Daily reconciliation awaiting approval",
          detail:
            "Your reconciliation has been submitted to the administrator and is waiting for review.",
          href: links.reports,
          tone: "blue",
          icon: "report",
          time: "Today",
        });
      }
    }

    if (overdueLoans.length > 0) {
      items.push({
        id: "overdue-loans",
        title: `${formatNumber(overdueLoans.length)} overdue loan${overdueLoans.length === 1 ? "" : "s"}`,
        detail: "Borrowers past due with an open balance.",
        href: links.loans,
        tone: "gold",
        icon: "loan",
        time: "Today",
      });
    }

    if (blacklisted.length > 0) {
      items.push({
        id: "blacklist-count",
        title: `${formatNumber(blacklisted.length)} blacklisted borrower${blacklisted.length === 1 ? "" : "s"}`,
        detail: "These people cannot receive new loans.",
        href: links.risk,
        tone: "red",
        icon: "alert",
        time: "Risk",
      });
    }

    if (watchlisted.length > 0) {
      items.push({
        id: "watchlist-count",
        title: `${formatNumber(watchlisted.length)} on watchlist`,
        detail: "Review carefully before approving new credit.",
        href: links.risk,
        tone: "gold",
        icon: "alert",
        time: "Risk",
      });
    }

    cache = { key, at: Date.now(), items };
    return items;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

const INVALIDATE_EVENT = "owner-notifications-invalidate";

export function useOwnerNotifications(scope: NotificationScope = "owner") {
  const [items, setItems] = useState<OwnerNotificationItem[]>(
    () => (cache?.key.startsWith(`${scope}:`) ? cache.items : []),
  );
  const [loading, setLoading] = useState(!cache);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const primedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    knownIdsRef.current = null;
    primedRef.current = false;

    async function refresh(force = false) {
      const auth = readAuthState();
      if (!auth.session || isSessionExpired(auth.session)) {
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) setLoading(!cache || force);
      try {
        const next = await loadOwnerNotifications(auth.session, {
          force,
          scope,
        });
        if (cancelled) return;

        const nextIds = new Set(next.map((item) => item.id));
        if (primedRef.current && knownIdsRef.current) {
          const hasNew = next.some(
            (item) => !knownIdsRef.current!.has(item.id),
          );
          if (hasNew) {
            playNotificationSound();
          }
        }
        knownIdsRef.current = nextIds;
        primedRef.current = true;
        setItems(next);
      } catch {
        if (!cancelled && !cache) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void refresh(false);

    function onInvalidate() {
      void refresh(true);
    }
    window.addEventListener(INVALIDATE_EVENT, onInvalidate);
    const interval = window.setInterval(() => {
      void refresh(true);
    }, 45_000);
    return () => {
      cancelled = true;
      window.removeEventListener(INVALIDATE_EVENT, onInvalidate);
      window.clearInterval(interval);
    };
  }, [scope]);

  return { items, loading };
}

export function invalidateOwnerNotifications() {
  cache = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(INVALIDATE_EVENT));
  }
}
