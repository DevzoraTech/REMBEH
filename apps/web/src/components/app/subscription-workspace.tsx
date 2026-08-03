"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Download,
  FileText,
  Headset,
  Loader2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
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
import { PaymentMethodBadge } from "./payment-method-badge";

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

type SmsWallet = {
  branchId: string;
  branchName: string;
  creditsRemaining: number;
  canSendSms: boolean;
  topUpPresets: Array<{
    amountUgx: number;
    currency: string;
    credits: number;
  }>;
};

type PaymentRow = {
  id: string;
  date: string;
  branchId: string;
  branchName: string;
  kind?: "subscription" | "sms";
  transaction: string;
  periodLabel: string | null;
  amount: number;
  currency: string;
  credits?: number | null;
  paymentMethod: string;
  status: string;
  receipt: string | null;
  canRetry: boolean;
};

const PRO_BENEFITS = [
  "Unlimited borrower records",
  "Loan and repayment management",
  "Agent and branch operations",
  "Reports and exports",
  "Full business analytics",
  "SMS notifications alerts and reminders",
  "Cloud backup and synchronisation",
  "Ongoing product updates",
  "24hr support",
];

const TRIAL_TOTAL_DAYS = 30;
const PERIOD_TOTAL_DAYS = 30;
const GRACE_TOTAL_DAYS = 2;

function authHeaders(session: RembehSession) {
  return {
    Authorization: `${session.tokenType} ${session.accessToken}`,
  };
}

/** Never surface provider/backend wording to end users. */
function friendlyError(raw: unknown): string {
  const text =
    raw instanceof Error
      ? raw.message
      : typeof raw === "string"
        ? raw
        : formatApiError(raw as string | string[] | undefined);
  const lower = text.toLowerCase();
  if (
    !text.trim() ||
    lower.includes("internal") ||
    lower.includes("server") ||
    lower.includes("exception") ||
    lower.includes("pesapal") ||
    lower.includes("prisma") ||
    lower.includes("nest") ||
    lower.includes("stack") ||
    lower.includes("econn") ||
    lower.includes("timeout") ||
    lower.includes("fetch failed") ||
    lower.includes("network")
  ) {
    return "We couldn’t complete that. Please try again.";
  }
  if (text.length > 140) {
    return "We couldn’t complete that. Please try again.";
  }
  return text;
}

function currentStatusTitle(
  row: BillingSummary["branches"][number],
  trialActive: boolean,
) {
  if (trialActive && row.status === "TRIAL") return "Free Trial";
  switch (row.status) {
    case "TRIAL":
      return "Free Trial";
    case "ACTIVE":
      return "Pro";
    case "GRACE":
    case "PAST_DUE":
      return "Grace period";
    case "LOCKED":
      return "Paused";
    default:
      return "Pro";
  }
}

function daysRemainingFor(row: BillingSummary["branches"][number], trial: BillingSummary["trial"]) {
  if (row.status === "TRIAL" || (trial.active && row.status === "TRIAL")) {
    return Math.max(0, trial.daysRemaining);
  }
  if (row.status === "GRACE" || row.status === "PAST_DUE") {
    return Math.max(0, row.daysUntilGraceEnd ?? 0);
  }
  if (row.status === "LOCKED") {
    return 0;
  }
  return Math.max(0, row.daysUntilPeriodEnd ?? 0);
}

function ringTotals(row: BillingSummary["branches"][number], trialActive: boolean) {
  if (row.status === "TRIAL" || (trialActive && row.status === "TRIAL")) {
    return TRIAL_TOTAL_DAYS;
  }
  if (row.status === "GRACE" || row.status === "PAST_DUE") {
    return GRACE_TOTAL_DAYS;
  }
  return PERIOD_TOTAL_DAYS;
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
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [payingBranchId, setPayingBranchId] = useState<string | null>(null);
  const [focusedBranchId, setFocusedBranchId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [smsWallet, setSmsWallet] = useState<SmsWallet | null>(null);
  const [smsLoading, setSmsLoading] = useState(false);
  const [toppingUpAmount, setToppingUpAmount] = useState<number | null>(null);
  const paid = searchParams.get("paid") === "1";
  const smsPaid = searchParams.get("smsPaid") === "1";
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

  const loadSummary = useCallback(async () => {
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
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [session]);

  const loadPayments = useCallback(async () => {
    if (!session) return;
    setPaymentsLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/billing/payments`, {
        headers: authHeaders(session),
      });
      const payload = await readApiJson<{
        payments?: PaymentRow[];
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setPayments(payload.payments ?? []);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPaymentsLoading(false);
    }
  }, [session]);

  const loadSmsWallet = useCallback(
    async (branchId: string) => {
      if (!session || !branchId) return;
      setSmsLoading(true);
      try {
        const params = new URLSearchParams({ branchId });
        const response = await fetch(
          `${apiBaseUrl}/sms-credits/wallet?${params.toString()}`,
          { headers: authHeaders(session) },
        );
        const payload = await readApiJson<
          SmsWallet & { message?: string | string[] }
        >(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        setSmsWallet(payload);
      } catch (err) {
        setError(friendlyError(err));
        setSmsWallet(null);
      } finally {
        setSmsLoading(false);
      }
    },
    [session],
  );

  const load = useCallback(async () => {
    await Promise.all([loadSummary(), loadPayments()]);
  }, [loadSummary, loadPayments]);

  useEffect(() => {
    if (!ready || !session) return;
    void load();
  }, [ready, session, load]);

  useEffect(() => {
    if ((!paid && !smsPaid) || !session) return;
    const timer = window.setTimeout(() => {
      void load();
      if (focusedBranchId) void loadSmsWallet(focusedBranchId);
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [paid, smsPaid, session, load, focusedBranchId, loadSmsWallet]);

  useEffect(() => {
    if (!summary?.branches.length) return;
    setFocusedBranchId((current) => {
      if (current && summary.branches.some((b) => b.branchId === current)) {
        return current;
      }
      const fromQuery = searchParams.get("branch");
      if (
        fromQuery &&
        summary.branches.some((b) => b.branchId === fromQuery)
      ) {
        return fromQuery;
      }
      const checkoutable = summary.branches.find((b) => b.canCheckout);
      return checkoutable?.branchId ?? summary.branches[0]?.branchId ?? null;
    });
  }, [summary, searchParams]);

  useEffect(() => {
    if (!session || !focusedBranchId) return;
    void loadSmsWallet(focusedBranchId);
  }, [session, focusedBranchId, loadSmsWallet]);

  const focusedBranch = useMemo(() => {
    if (!summary || !focusedBranchId) return null;
    return (
      summary.branches.find((b) => b.branchId === focusedBranchId) ??
      summary.branches[0] ??
      null
    );
  }, [summary, focusedBranchId]);

  const filteredPayments = useMemo(() => {
    return payments.filter((row) => {
      if (statusFilter !== "all") {
        if (row.status.toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
      }
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        if (new Date(row.date) < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(row.date) > to) return false;
      }
      return true;
    });
  }, [payments, statusFilter, dateFrom, dateTo]);

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
        throw new Error("unavailable");
      }
      window.location.assign(payload.redirectUrl);
    } catch (err) {
      setError(friendlyError(err));
      setPayingBranchId(null);
    }
  }

  async function startSmsTopUp(amountUgx: number, branchId?: string) {
    const targetBranchId = branchId ?? focusedBranchId;
    if (!session || !targetBranchId) return;
    setToppingUpAmount(amountUgx);
    setPayingBranchId(targetBranchId);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/sms-credits/branches/${targetBranchId}/top-up`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ amountUgx }),
        },
      );
      const payload = await readApiJson<
        CheckoutResponse & { message?: string | string[] }
      >(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      if (!payload.redirectUrl) {
        throw new Error("unavailable");
      }
      window.location.assign(payload.redirectUrl);
    } catch (err) {
      setError(friendlyError(err));
      setToppingUpAmount(null);
      setPayingBranchId(null);
    }
  }

  function handleSubscribe() {
    if (!summary) return;
    if (mode === "manager") {
      const branch = summary.branches[0];
      if (branch?.canCheckout) void startCheckout(branch.branchId);
      return;
    }
    const selected =
      focusedBranch ??
      summary.branches.find((b) => b.canCheckout) ??
      summary.branches[0];
    if (selected?.canCheckout) void startCheckout(selected.branchId);
  }

  if (!ready || !session || !workspace || !user) {
    return <AppBootSkeleton />;
  }

  const amount = summary?.plan.amount ?? 30_000;
  const currency = summary?.plan.currency ?? "UGX";
  const priceLabel = formatMoney(amount, currency);
  const branchName =
    focusedBranch?.branchName ??
    summary?.branches[0]?.branchName ??
    "your branch";
  const trialActive = Boolean(summary?.trial.active);
  const daysLeft = focusedBranch
    ? daysRemainingFor(focusedBranch, summary!.trial)
    : 0;
  const ringTotal = focusedBranch
    ? ringTotals(focusedBranch, trialActive)
    : TRIAL_TOTAL_DAYS;
  const statusTitle = focusedBranch
    ? currentStatusTitle(focusedBranch, trialActive)
    : "Pro";
  const isTrial =
    focusedBranch?.status === "TRIAL" ||
    (trialActive && focusedBranch?.status === "TRIAL");
  const isGrace =
    focusedBranch?.status === "GRACE" || focusedBranch?.status === "PAST_DUE";
  const isPaused = focusedBranch?.status === "LOCKED";
  const isActive = focusedBranch?.status === "ACTIVE";
  const canSubscribe = Boolean(
    mode === "manager"
      ? summary?.branches[0]?.canCheckout
      : focusedBranch?.canCheckout ??
          summary?.branches.some((b) => b.canCheckout),
  );
  const subscribePaying =
    payingBranchId != null &&
    (payingBranchId === focusedBranch?.branchId ||
      (mode === "manager" && payingBranchId === summary?.branches[0]?.branchId));

  let daysCopy = `${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining`;
  if (isPaused) daysCopy = "Subscription paused";
  else if (isGrace) daysCopy = `${daysLeft} day${daysLeft === 1 ? "" : "s"} left to renew`;

  let bodyCopy = `Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Subscribe to keep full access.`;
  if (isActive) {
    bodyCopy = focusedBranch?.currentPeriodEnd
      ? `Your Pro plan renews on ${formatDate(focusedBranch.currentPeriodEnd)}.`
      : "Your Pro plan is active for this branch.";
  } else if (isGrace) {
    bodyCopy = `Your subscription has expired. Renew within ${daysLeft} day${daysLeft === 1 ? "" : "s"} to avoid a lock.`;
  } else if (isPaused) {
    bodyCopy = "This branch is paused. Renew to reopen lending and collections.";
  } else if (!isTrial) {
    bodyCopy = "Subscribe to unlock Pro for this branch.";
  }

  const showOwnerBranchSelect =
    mode === "owner" && (summary?.branches.length ?? 0) > 1;

  return (
    <AppShell session={session} workspace={workspace} user={user}>
      <div className="mx-auto max-w-6xl space-y-4 px-1 pb-6 sm:px-2">
        <OwnerHeader
          title="Subscription"
          subtitle={`Manage the plan and billing for ${branchName}.`}
          search=""
          onSearchChange={() => undefined}
          showSearch={false}
          showReportsButton={mode === "owner"}
          settingsHref={mode === "owner" ? "/owner/settings" : "/settings"}
          reportsHref={mode === "owner" ? "/owner/reports" : "/reports"}
          notificationScope={mode === "owner" ? "owner" : "manager"}
          actions={
            showOwnerBranchSelect ? (
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <span className="hidden sm:inline">Branch</span>
                <select
                  value={focusedBranchId ?? ""}
                  onChange={(event) => setFocusedBranchId(event.target.value)}
                  className="h-9 rounded-xl border border-[var(--line)] bg-white px-3 text-xs font-semibold text-[#070b18] outline-none focus:border-[var(--forest-emerald)]"
                >
                  {summary!.branches.map((branch) => (
                    <option key={branch.branchId} value={branch.branchId}>
                      {branch.branchName}
                    </option>
                  ))}
                </select>
              </label>
            ) : undefined
          }
        />

        {paid ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950">
            Payment received. Updating your plan…
          </p>
        ) : null}

        {smsPaid ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950">
            SMS top-up received. Updating your balance…
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-950">
            {error}
          </p>
        ) : null}

        {loading && !summary ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white py-16 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <section className="grid gap-3 lg:grid-cols-3">
            {/* A) Current subscription */}
            <article className="flex flex-col rounded-2xl border border-sky-100 bg-[#f3f8fd] p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
              <span className="inline-flex w-fit rounded-full bg-[#e8f1fb] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#2b6cb0]">
                Current subscription
              </span>
              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.03em] text-[#070b18]">
                    {statusTitle}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    {daysCopy}
                  </p>
                  <p className="mt-3 text-xs leading-relaxed text-slate-500">
                    {bodyCopy}
                  </p>
                </div>
                <DaysRing daysLeft={daysLeft} total={ringTotal} />
              </div>
              <div className="mt-auto border-t border-[var(--line)] pt-4">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">Current cost</span>
                  <span className="font-semibold text-[#070b18]">
                    {isTrial || isPaused
                      ? formatMoney(0, currency)
                      : priceLabel}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">
                    {isTrial ? "After trial" : "Renews"}
                  </span>
                  <span className="font-semibold text-[#070b18]">
                    {priceLabel} / month
                  </span>
                </div>
              </div>
            </article>

            {/* B) Plan */}
            <article className="flex flex-col rounded-2xl border border-emerald-100 bg-[#f3faf6] p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
              <span className="inline-flex w-fit rounded-full bg-[#e9f8ef] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#07885f]">
                Plan
              </span>
              <h2 className="mt-4 font-[family-name:var(--font-display)] text-2xl tracking-[-0.03em] text-[#070b18]">
                Pro
              </h2>
              <p className="mt-1 text-lg font-semibold text-[#07885f]">
                {priceLabel} / month
              </p>
              <ul className="mt-4 flex-1 space-y-2">
                {PRO_BENEFITS.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2 text-[12px] leading-snug text-slate-700"
                  >
                    <Check
                      className="mt-0.5 size-3.5 shrink-0 text-[#07885f]"
                      strokeWidth={2.75}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={!canSubscribe || subscribePaying}
                onClick={handleSubscribe}
                className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#07885f] text-sm font-semibold text-white shadow-[0_12px_24px_rgba(7,136,95,0.22)] transition hover:bg-[#067352] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {subscribePaying ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Subscribe
              </button>
            </article>

            {/* C) Support */}
            <article className="flex flex-col rounded-2xl border border-sky-100 bg-[#f3f8fd] p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
              <div className="grid size-11 place-items-center rounded-2xl bg-[#e8f1fb] text-[#2b6cb0]">
                <Headset className="size-5" strokeWidth={2} />
              </div>
              <h2 className="mt-4 font-[family-name:var(--font-display)] text-xl tracking-[-0.02em] text-[#070b18]">
                Need help? We&apos;re here for you.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Questions about billing, renewals, or unlocking a paused branch?
                Our team can walk you through it.
              </p>
              <div className="mt-5 rounded-xl border border-[var(--line)] bg-[#f6f8fb] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Email
                </p>
                <a
                  href="mailto:support@rembeh.com"
                  className="mt-1 block text-sm font-semibold text-[#07885f] hover:underline"
                >
                  support@rembeh.com
                </a>
              </div>
              <p className="mt-auto pt-4 text-xs text-slate-500">
                Response within 24 hours on business days.
              </p>
            </article>
          </section>
        )}

        {/* SMS credits (prepaid per branch) */}
        {focusedBranchId ? (
          <section className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#e8f1fb] text-[#2b6cb0]">
                  <MessageSquare className="size-3.5" strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#070b18]">
                      SMS credits
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#f6f8fb] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#070b18]">
                      {smsLoading && !smsWallet ? (
                        <Loader2 className="size-3 animate-spin text-slate-400" />
                      ) : (
                        <>
                          {(smsWallet?.creditsRemaining ?? 0).toLocaleString(
                            "en-UG",
                          )}{" "}
                          left
                        </>
                      )}
                    </span>
                    {!smsWallet?.canSendSms && !smsLoading ? (
                      <span className="text-[11px] font-medium text-amber-700">
                        Top up to keep messaging
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Keep borrower SMS running for this branch.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(smsWallet?.topUpPresets ?? []).map((preset, index) => {
                  const busy = toppingUpAmount === preset.amountUgx;
                  const popular = index === 1;
                  return (
                    <button
                      key={preset.amountUgx}
                      type="button"
                      disabled={toppingUpAmount != null}
                      onClick={() => void startSmsTopUp(preset.amountUgx)}
                      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        popular
                          ? "border-[#07885f] bg-[#07885f] text-white hover:bg-[#067352]"
                          : "border-[var(--line)] bg-[#f6f8fb] text-[#070b18] hover:border-[#07885f] hover:bg-[#f3faf6]"
                      }`}
                    >
                      {busy ? (
                        <Loader2
                          className={`size-3.5 animate-spin ${
                            popular ? "text-white" : "text-[#07885f]"
                          }`}
                        />
                      ) : (
                        <>
                          <span className="min-w-0">
                            <span className="block text-[11px] font-bold leading-none tabular-nums">
                              {formatMoney(preset.amountUgx, preset.currency)}
                            </span>
                            <span
                              className={`mt-0.5 block text-[10px] font-medium leading-none ${
                                popular ? "text-white/80" : "text-slate-500"
                              }`}
                            >
                              {preset.credits.toLocaleString("en-UG")} SMS
                            </span>
                          </span>
                          <span
                            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] ${
                              popular
                                ? "bg-white/20 text-white"
                                : "bg-white text-[#07885f]"
                            }`}
                          >
                            Buy
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {/* Subscription history */}
        <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-[#07885f]" />
              <h3 className="text-sm font-semibold text-[#070b18]">
                Payment history
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-8 rounded-lg border border-[var(--line)] bg-white px-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-[var(--forest-emerald)]"
              >
                <option value="all">All statuses</option>
                <option value="Paid">Paid</option>
                <option value="Failed">Failed</option>
                <option value="Pending">Pending</option>
              </select>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="h-8 rounded-lg border border-[var(--line)] bg-white px-2 text-[11px] font-medium text-slate-700 outline-none focus:border-[var(--forest-emerald)]"
                aria-label="From date"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="h-8 rounded-lg border border-[var(--line)] bg-white px-2 text-[11px] font-medium text-slate-700 outline-none focus:border-[var(--forest-emerald)]"
                aria-label="To date"
              />
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                <RefreshCw className="size-3" />
                Refresh
              </button>
            </div>
          </div>

          <div className="px-3 py-3 sm:px-4">
            {paymentsLoading && payments.length === 0 ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Loading history…
              </div>
            ) : filteredPayments.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
                {payments.length === 0
                  ? "No payments yet."
                  : "No payments match these filters."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-[#dfe5eb] bg-[#e8edf2] text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">Branch</th>
                      <th className="px-3 py-2 font-semibold">Transaction</th>
                      <th className="hidden px-3 py-2 font-semibold md:table-cell">
                        Period
                      </th>
                      <th className="px-3 py-2 font-semibold">Amount</th>
                      <th className="hidden px-3 py-2 font-semibold lg:table-cell">
                        Payment method
                      </th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Receipt</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)] bg-white">
                    {filteredPayments.map((row) => {
                      const isSms = row.kind === "sms";
                      const retrying =
                        payingBranchId === row.branchId &&
                        (isSms
                          ? toppingUpAmount === Math.round(row.amount)
                          : toppingUpAmount == null);
                      const failed = row.status === "Failed" || row.canRetry;
                      const isPaid = row.status === "Paid";
                      return (
                        <tr key={row.id} className="align-middle">
                          <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-slate-700">
                            {formatDate(row.date)}
                          </td>
                          <td className="px-3 py-2.5 text-[13px] font-medium text-[#070b18]">
                            {row.branchName}
                          </td>
                          <td className="px-3 py-2.5 text-[13px] text-slate-700">
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              <span>{row.transaction}</span>
                              {isSms ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f1fb] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#2b6cb0]">
                                  <MessageSquare className="size-2.5" />
                                  SMS
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full bg-[#e9f8ef] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#07885f]">
                                  Plan
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="hidden px-3 py-2.5 text-xs text-slate-600 md:table-cell">
                            {row.periodLabel ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold text-[#070b18]">
                            {formatMoney(row.amount, row.currency)}
                          </td>
                          <td className="hidden px-3 py-2.5 lg:table-cell">
                            <PaymentMethodBadge
                              method={row.paymentMethod || ""}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <PaymentStatusPill status={row.status} />
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-600">
                            {isPaid && row.receipt ? (
                              <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                                <Download className="size-3 text-[#07885f]" />
                                {row.receipt}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {failed ? (
                              <button
                                type="button"
                                disabled={retrying || toppingUpAmount != null}
                                onClick={() => {
                                  if (isSms) {
                                    void startSmsTopUp(
                                      Math.round(row.amount),
                                      row.branchId,
                                    );
                                    return;
                                  }
                                  void startCheckout(row.branchId);
                                }}
                                className="inline-flex h-8 min-w-[4.5rem] items-center justify-center gap-1 rounded-full bg-rose-600 px-3 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-70"
                              >
                                {retrying ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : null}
                                Retry
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function DaysRing({ daysLeft, total }: { daysLeft: number; total: number }) {
  const size = 72;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, Math.max(0, daysLeft / total)) : 0;
  const offset = circumference * (1 - ratio);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label={`${daysLeft} of ${total} days remaining`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e8edf2"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#07885f"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-sm font-bold leading-none text-[#070b18]">
            {daysLeft}
          </p>
          <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            days
          </p>
        </div>
      </div>
    </div>
  );
}

function PaymentStatusPill({ status }: { status: string }) {
  const tone =
    status === "Paid"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : status === "Failed"
        ? "bg-rose-50 text-rose-800 ring-rose-200"
        : "bg-amber-50 text-amber-900 ring-amber-200";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${tone}`}
    >
      {status}
    </span>
  );
}
