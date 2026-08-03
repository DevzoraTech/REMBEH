"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  RefreshCw,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "../../../components/app/app-shell";
import { AppBootSkeleton } from "../../../components/app/skeleton";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../lib/api";
import {
  authHeaders,
  formatDate,
  formatMoney,
  ownerFetch,
  useOwnerSession,
} from "../owner-common";
import { OwnerHeader } from "../owner-header";

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
  merchantReference: string;
  orderTrackingId: string | null;
};

function statusLabel(status: string) {
  switch (status) {
    case "TRIAL":
      return "Trial";
    case "ACTIVE":
      return "Active";
    case "GRACE":
      return "Grace";
    case "PAST_DUE":
      return "Past due";
    case "LOCKED":
      return "Locked";
    default:
      return status;
  }
}

function statusTone(status: string) {
  switch (status) {
    case "TRIAL":
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "GRACE":
    case "PAST_DUE":
      return "bg-amber-50 text-amber-900 ring-amber-200";
    case "LOCKED":
      return "bg-rose-50 text-rose-800 ring-rose-200";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-200";
  }
}

export default function OwnerSubscriptionPage() {
  return (
    <Suspense fallback={<AppBootSkeleton />}>
      <OwnerSubscriptionContent />
    </Suspense>
  );
}

function OwnerSubscriptionContent() {
  const state = useOwnerSession("/owner/subscription");
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingBranchId, setPayingBranchId] = useState<string | null>(null);
  const paidBanner =
    searchParams.get("paid") === "1"
      ? "Payment received — status updates within a few seconds."
      : null;

  const load = useCallback(async () => {
    if (!state.session) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await ownerFetch<BillingSummary>(
        state.session,
        "/billing/summary",
      );
      setSummary(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load billing.");
    } finally {
      setLoading(false);
    }
  }, [state.session]);

  useEffect(() => {
    if (!state.ready || !state.session) return;
    void load();
  }, [state.ready, state.session, load]);

  useEffect(() => {
    if (!paidBanner || !state.session) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [paidBanner, state.session, load]);

  async function startCheckout(branchId: string) {
    if (!state.session) return;
    setPayingBranchId(branchId);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/billing/branches/${branchId}/checkout`,
        {
          method: "POST",
          headers: {
            ...authHeaders(state.session),
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
        throw new Error("Pesapal did not return a checkout URL.");
      }
      window.location.assign(payload.redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setPayingBranchId(null);
    }
  }

  if (!state.ready || !state.session || !state.workspace || !state.user) {
    return <AppBootSkeleton />;
  }

  return (
    <AppShell
      session={state.session}
      workspace={state.workspace}
      user={state.user}
    >
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <OwnerHeader
          title="Subscription"
          subtitle="Organisation trial, then Pro per branch via Pesapal (mobile money & cards)."
          search={search}
          onSearchChange={setSearch}
          showSearch={true}
          showReportsButton={false}
          searchPlaceholder="Search branches…"
        />

        {paidBanner ? (
          <Callout tone="success" icon={<CheckCircle2 className="size-4" />}>
            {paidBanner}
          </Callout>
        ) : null}

        {error ? (
          <Callout tone="danger" icon={<AlertTriangle className="size-4" />}>
            {error}
          </Callout>
        ) : null}

        {loading && !summary ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading subscription…
          </div>
        ) : null}

        {summary ? (
          <>
            {summary.trial.active ? (
              <Callout tone="info" icon={<CreditCard className="size-4" />}>
                Free trial covers all branches —{" "}
                <strong>{summary.trial.daysRemaining}</strong> day
                {summary.trial.daysRemaining === 1 ? "" : "s"} left (ends{" "}
                {formatDate(summary.trial.endsAt)}).
              </Callout>
            ) : (
              <Callout tone="warn" icon={<AlertTriangle className="size-4" />}>
                Trial ended {formatDate(summary.trial.endsAt)}. Each branch needs
                its own Pro subscription.
              </Callout>
            )}

            {summary.reminders.length > 0 ? (
              <div className="space-y-2 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4">
                <p className="text-sm font-semibold text-amber-950">Reminders</p>
                <ul className="space-y-1 text-sm text-amber-900">
                  {summary.reminders.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_12px_40px_rgba(20,33,61,0.04)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Plan
                  </p>
                  <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--midnight-navy)]">
                    {summary.plan.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatMoney(summary.plan.amount, summary.plan.currency)} /{" "}
                    branch / month
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="btn btn-ghost h-9 gap-1.5 rounded-xl text-xs"
                >
                  <RefreshCw className="size-3.5" />
                  Refresh
                </button>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_12px_40px_rgba(20,33,61,0.04)]">
              <div className="border-b border-[var(--line)] px-5 py-4">
                <h3 className="font-semibold text-[var(--midnight-navy)]">
                  Branches
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Unpaid branches get a 2-day grace period, then lock individually.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">Branch</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Period end</th>
                      <th className="px-5 py-3 font-medium">Grace</th>
                      <th className="px-5 py-3 font-medium text-right">Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {summary.branches
                      .filter((row) => {
                        if (!search.trim()) return true;
                        return row.branchName
                          .toLowerCase()
                          .includes(search.trim().toLowerCase());
                      })
                      .map((row) => (
                      <tr key={row.branchId} className="align-middle">
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-slate-900">
                            {row.branchName}
                          </div>
                          {row.reminder ? (
                            <p className="mt-0.5 text-xs text-amber-800">
                              {row.reminder}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusTone(row.status)}`}
                          >
                            {row.status === "LOCKED" ? (
                              <Lock className="size-3" />
                            ) : null}
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">
                          {row.currentPeriodEnd
                            ? formatDate(row.currentPeriodEnd)
                            : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">
                          {row.status === "GRACE" && row.daysUntilGraceEnd != null
                            ? `${Math.max(0, row.daysUntilGraceEnd)}d left`
                            : row.graceEndsAt
                              ? formatDate(row.graceEndsAt)
                              : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {row.canCheckout ? (
                            <button
                              type="button"
                              disabled={payingBranchId === row.branchId}
                              onClick={() => void startCheckout(row.branchId)}
                              className="btn btn-primary h-9 gap-1.5 rounded-xl px-3 text-xs"
                            >
                              {payingBranchId === row.branchId ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <CreditCard className="size-3.5" />
                              )}
                              Pay with Pesapal
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">
                              Covered by trial
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {summary.branches.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-5 py-8 text-center text-slate-500"
                        >
                          Create a branch first, then subscribe after the trial.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function Callout({
  tone,
  icon,
  children,
}: {
  tone: "info" | "warn" | "danger" | "success";
  icon: ReactNode;
  children: ReactNode;
}) {
  const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-950",
    warn: "border-amber-200 bg-amber-50 text-amber-950",
    danger: "border-rose-200 bg-rose-50 text-rose-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  }[tone];
  return (
    <div
      className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm ${styles}`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
