"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Lock, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "./app-shell";
import { AppBootSkeleton } from "./skeleton";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  RembehSession,
  RembehUser,
  RembehWorkspace,
  clearAuthState,
  isSessionExpired,
  readAuthState,
} from "../../lib/auth-session";
import { resolveOperatorRole } from "../../lib/roles";
import { formatDate, formatMoney } from "../../app/owner/owner-common";
import { OwnerHeader } from "../../app/owner/owner-header";

type BillingSummary = {
  plan: {
    code: string;
    name: string;
    amount: number;
    currency: string;
    interval: string;
  };
  trial: {
    active: boolean;
    startsAt: string;
    endsAt: string;
    daysRemaining: number;
  };
  scope: "organisation" | "branch";
  canPay: boolean;
  branches: Array<{
    branchId: string;
    branchName: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    graceEndsAt: string | null;
    lockedAt: string | null;
    daysUntilPeriodEnd: number | null;
    daysUntilGraceEnd: number | null;
    canCheckout: boolean;
    reminder: string | null;
  }>;
  reminders: string[];
};

type CheckoutResponse = {
  redirectUrl: string;
};

const PRO_FEATURES = [
  "Loans, repayments, and daily operations",
  "Agents and borrower records",
  "Reports for your branch",
  "Pay by mobile money or card",
];

function authHeaders(session: RembehSession) {
  return {
    Authorization: `${session.tokenType} ${session.accessToken}`,
  };
}

function statusCopy(
  row: BillingSummary["branches"][number],
  trialActive: boolean,
) {
  if (trialActive && row.status === "TRIAL") {
    return {
      label: "Free trial",
      tone: "good" as const,
      detail: "You can subscribe now — paid time starts after the trial",
    };
  }
  switch (row.status) {
    case "ACTIVE":
      return {
        label: "Active",
        tone: "good" as const,
        detail: row.currentPeriodEnd
          ? `Renews ${formatDate(row.currentPeriodEnd)}`
          : null,
      };
    case "GRACE":
    case "PAST_DUE":
      return {
        label: "Renew soon",
        tone: "warn" as const,
        detail:
          row.daysUntilGraceEnd != null
            ? `${Math.max(0, row.daysUntilGraceEnd)} day${row.daysUntilGraceEnd === 1 ? "" : "s"} left`
            : "Renew to keep this branch open",
      };
    case "LOCKED":
      return {
        label: "Paused",
        tone: "bad" as const,
        detail: "Renew to reopen this branch",
      };
    case "TRIAL":
      return {
        label: "Free trial",
        tone: "good" as const,
        detail: null,
      };
    default:
      return { label: "—", tone: "muted" as const, detail: null };
  }
}

function actionLabel(
  row: BillingSummary["branches"][number],
  trialActive: boolean,
) {
  if (!row.canCheckout) return null;
  if (row.status === "LOCKED") return "Renew";
  if (row.status === "GRACE" || row.status === "PAST_DUE") return "Renew";
  if (row.status === "ACTIVE") return "Extend";
  if (row.status === "TRIAL") return trialActive ? "Subscribe early" : "Subscribe";
  return "Subscribe";
}

export function SubscriptionWorkspace({
  mode,
}: {
  mode: "owner" | "manager";
}) {
  return (
    <Suspense fallback={<AppBootSkeleton />}>
      <SubscriptionWorkspaceContent mode={mode} />
    </Suspense>
  );
}

function SubscriptionWorkspaceContent({
  mode,
}: {
  mode: "owner" | "manager";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingBranchId, setPayingBranchId] = useState<string | null>(null);
  const paid = searchParams.get("paid") === "1";
  const nextPath = mode === "owner" ? "/owner/subscription" : "/subscription";

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const auth = readAuthState();
      if (!auth.session || isSessionExpired(auth.session)) {
        clearAuthState();
        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }
      const role = resolveOperatorRole(auth.session, auth.user);
      if (mode === "owner" && role !== "owner") {
        router.replace(role === "manager" ? "/subscription" : "/dashboard");
        return;
      }
      if (mode === "manager" && role === "owner") {
        const qs = searchParams.toString();
        router.replace(
          qs ? `/owner/subscription?${qs}` : "/owner/subscription",
        );
        return;
      }
      if (mode === "manager" && role !== "manager") {
        router.replace("/dashboard");
        return;
      }
      setSession(auth.session);
      setWorkspace(auth.workspace);
      setUser(auth.user);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(boot);
  }, [mode, nextPath, router, searchParams]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/billing/summary`, {
        headers: authHeaders(session),
      });
      const payload = await readApiJson<
        BillingSummary & { message?: string | string[] }
      >(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setSummary(payload);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn’t load subscription details.",
      );
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!ready || !session) return;
    void load();
  }, [ready, session, load]);

  useEffect(() => {
    if (!paid || !session) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [paid, session, load]);

  const visibleBranches = useMemo(() => {
    if (!summary) return [];
    const q = search.trim().toLowerCase();
    if (!q) return summary.branches;
    return summary.branches.filter((row) =>
      row.branchName.toLowerCase().includes(q),
    );
  }, [summary, search]);

  async function startCheckout(branchId: string) {
    if (!session) return;
    setPayingBranchId(branchId);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/billing/branches/${branchId}/checkout`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session),
            "Content-Type": "application/json",
          },
        },
      );
      const payload = await readApiJson<
        CheckoutResponse & { message?: string | string[] }
      >(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      if (!payload.redirectUrl) {
        throw new Error("Payment page is unavailable right now. Try again.");
      }
      window.location.assign(payload.redirectUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn’t start payment. Please try again.",
      );
      setPayingBranchId(null);
    }
  }

  if (!ready || !session || !workspace || !user) {
    return <AppBootSkeleton />;
  }

  const amount = summary?.plan.amount ?? 150_000;
  const currency = summary?.plan.currency ?? "UGX";
  const isBranchScope = summary?.scope === "branch" || mode === "manager";

  return (
    <AppShell session={session} workspace={workspace} user={user}>
      <div className="mx-auto max-w-5xl space-y-5 px-1 pb-10 sm:px-2">
        <OwnerHeader
          title="Subscription"
          subtitle={
            isBranchScope
              ? "Your branch plan and renewal."
              : "Plans for every branch in your organisation."
          }
          search={search}
          onSearchChange={setSearch}
          showSearch={!isBranchScope && Boolean(summary && summary.branches.length > 4)}
          showReportsButton={mode === "owner"}
          searchPlaceholder="Find a branch…"
          settingsHref={mode === "owner" ? "/owner/settings" : "/settings"}
          reportsHref={mode === "owner" ? "/owner/reports" : "/reports"}
          notificationScope={mode === "owner" ? "owner" : "manager"}
        />

        {paid ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950">
            Payment received. We’re updating your plan now.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-950">
            {error}
          </p>
        ) : null}

        <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
          <div className="border-b border-[var(--line)] bg-gradient-to-br from-[#003f35] via-[#0a5c4d] to-[#0f8a6c] px-5 py-6 text-white sm:px-7 sm:py-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                  REMBEH Pro
                </p>
                <h2 className="mt-1 font-[family-name:var(--font-display)] text-[clamp(1.6rem,3vw,2.1rem)] leading-tight tracking-[-0.02em]">
                  {formatMoney(amount, currency)}
                  <span className="ml-2 text-base font-sans font-medium text-white/75">
                    / branch / month
                  </span>
                </h2>
                <p className="mt-2 max-w-xl text-sm text-white/75">
                  {isBranchScope
                    ? "Keep your branch open with a monthly Pro plan."
                    : "Each branch has its own monthly plan after the free trial."}
                </p>
              </div>
              {summary?.trial.active ? (
                <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
                    Free trial
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {summary.trial.daysRemaining} day
                    {summary.trial.daysRemaining === 1 ? "" : "s"} left
                  </p>
                </div>
              ) : null}
            </div>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {PRO_FEATURES.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-white/85"
                >
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-[#7dffb5]"
                    strokeWidth={2.75}
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#070b18]">
                  {isBranchScope ? "Your branch" : "Branches"}
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  {isBranchScope
                    ? "Current plan status for this location."
                    : "Current plan for each location."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw className="size-3.5" />
                Refresh
              </button>
            </div>

            {loading && !summary ? (
              <div className="mt-8 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </div>
            ) : null}

            {summary && visibleBranches.length === 0 ? (
              <p className="mt-8 rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                {summary.branches.length === 0
                  ? isBranchScope
                    ? "No branch is assigned to your account yet."
                    : "Add a branch to start managing plans."
                  : "No branches match that search."}
              </p>
            ) : null}

            {summary && visibleBranches.length > 0 ? (
              <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--line)]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f0f4f6] text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Branch</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="hidden px-4 py-3 font-semibold sm:table-cell">
                        Renews
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)] bg-white">
                    {visibleBranches.map((row) => {
                      const copy = statusCopy(row, summary.trial.active);
                      const label = actionLabel(row, summary.trial.active);
                      const paying = payingBranchId === row.branchId;
                      return (
                        <tr key={row.branchId} className="align-middle">
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-[#070b18]">
                              {row.branchName}
                            </p>
                            {copy.detail ? (
                              <p className="mt-0.5 text-xs text-slate-500 sm:hidden">
                                {copy.detail}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusPill tone={copy.tone} label={copy.label} />
                          </td>
                          <td className="hidden px-4 py-3.5 text-slate-600 sm:table-cell">
                            {copy.detail ?? "—"}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {label ? (
                              <button
                                type="button"
                                disabled={paying}
                                onClick={() => void startCheckout(row.branchId)}
                                className="inline-flex h-9 min-w-[6.5rem] items-center justify-center gap-1.5 rounded-xl bg-[#003f35] px-3 text-xs font-semibold text-white transition hover:bg-[#025144] disabled:opacity-70"
                              >
                                {paying ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : null}
                                {paying ? "Opening…" : label}
                              </button>
                            ) : (
                              <span className="text-xs font-medium text-emerald-700">
                                Included
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatusPill({
  tone,
  label,
}: {
  tone: "good" | "warn" | "bad" | "muted";
  label: string;
}) {
  const styles = {
    good: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    warn: "bg-amber-50 text-amber-900 ring-amber-200",
    bad: "bg-rose-50 text-rose-800 ring-rose-200",
    muted: "bg-slate-50 text-slate-600 ring-slate-200",
  }[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${styles}`}
    >
      {tone === "bad" ? <Lock className="size-3" /> : null}
      {label}
    </span>
  );
}
