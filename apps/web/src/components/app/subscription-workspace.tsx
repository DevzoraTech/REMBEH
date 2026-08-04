"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  FileText,
  Lock,
  Loader2,
  MessageSquare,
  RefreshCw,
  Shield,
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

type BillingPlanOption = {
  code: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
  durationMonths: number;
  label: string;
  tagline: string;
  compareAtAmount: number | null;
  savingsAmount: number | null;
  badge: "MOST_POPULAR" | "BEST_VALUE" | null;
  defaultSelected: boolean;
};

type BillingSummary = {
  plan: BillingPlanOption;
  plans?: BillingPlanOption[];
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
  availableUnits: number;
  reservedUnits: number;
  canSendSms: boolean;
  creditsRemaining?: number;
};

type SmsBundle = {
  id: string;
  code: string;
  name: string;
  priceUgx: number;
  smsUnits: number;
  currency: string;
  version: number;
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
  bundleId?: string | null;
};

const PRO_BENEFITS = [
  "Unlimited borrower records",
  "Loan and repayment management",
  "Agent and branch operations",
  "Reports and exports",
  "Full business analytics",
  "140 introductory SMS credits on first paid subscription",
  "Borrower and operations workflows",
  "Cloud backup and synchronisation",
  "Ongoing product updates",
  "Support within 24 hours",
];

const FALLBACK_PLANS: BillingPlanOption[] = [
  {
    code: "PRO",
    name: "Pro",
    amount: 255_000,
    currency: "UGX",
    interval: "MONTHLY",
    durationMonths: 1,
    label: "Monthly",
    tagline: "Maximum flexibility",
    compareAtAmount: null,
    savingsAmount: null,
    badge: null,
    defaultSelected: false,
  },
  {
    code: "PRO_3M",
    name: "Pro",
    amount: 725_000,
    currency: "UGX",
    interval: "THREE_MONTHS",
    durationMonths: 3,
    label: "3 months",
    tagline: "Most popular",
    compareAtAmount: 765_000,
    savingsAmount: 40_000,
    badge: "MOST_POPULAR",
    defaultSelected: true,
  },
  {
    code: "PRO_6M",
    name: "Pro",
    amount: 1_385_000,
    currency: "UGX",
    interval: "SIX_MONTHS",
    durationMonths: 6,
    label: "6 months",
    tagline: "Best value",
    compareAtAmount: 1_530_000,
    savingsAmount: 145_000,
    badge: "BEST_VALUE",
    defaultSelected: false,
  },
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
  const [smsBundles, setSmsBundles] = useState<SmsBundle[]>([]);
  const [smsLoading, setSmsLoading] = useState(false);
  const [confirmBundle, setConfirmBundle] = useState<SmsBundle | null>(null);
  const [purchasingBundleId, setPurchasingBundleId] = useState<string | null>(
    null,
  );
  const [selectedPlanCode, setSelectedPlanCode] = useState("PRO_3M");
  const paid = searchParams.get("paid") === "1";
  const smsPaid = searchParams.get("smsPaid") === "1";
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"plan" | "sms">(
    tabParam === "sms" || smsPaid ? "sms" : "plan",
  );
  const nextPath = mode === "owner" ? "/owner/subscription" : "/subscription";

  useEffect(() => {
    if (tabParam === "sms" || smsPaid) {
      setActiveTab("sms");
    } else if (tabParam === "plan" || paid) {
      setActiveTab("plan");
    }
  }, [tabParam, smsPaid, paid]);

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
        const [walletRes, bundlesRes] = await Promise.all([
          fetch(`${apiBaseUrl}/sms-credits/wallet?${params.toString()}`, {
            headers: authHeaders(session),
          }),
          fetch(`${apiBaseUrl}/sms-credits/bundles`, {
            headers: authHeaders(session),
          }),
        ]);
        const walletPayload = await readApiJson<
          SmsWallet & { message?: string | string[] }
        >(walletRes);
        if (!walletRes.ok) {
          throw new Error(formatApiError(walletPayload.message));
        }
        setSmsWallet(walletPayload);

        const bundlesPayload = await readApiJson<{
          bundles?: SmsBundle[];
          message?: string | string[];
        }>(bundlesRes);
        if (bundlesRes.ok) {
          setSmsBundles(bundlesPayload.bundles ?? []);
        }
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
    if (!summary) return;
    const options =
      summary.plans && summary.plans.length > 0 ? summary.plans : FALLBACK_PLANS;
    const preferred =
      options.find((plan) => plan.defaultSelected)?.code ??
      options.find((plan) => plan.code === "PRO_3M")?.code ??
      options[0]?.code;
    if (preferred) {
      setSelectedPlanCode((current) =>
        options.some((plan) => plan.code === current) ? current : preferred,
      );
    }
  }, [summary]);

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

  const planPayments = useMemo(
    () => payments.filter((row) => (row.kind ?? "subscription") !== "sms"),
    [payments],
  );
  const smsPayments = useMemo(
    () => payments.filter((row) => row.kind === "sms"),
    [payments],
  );

  const filteredPayments = useMemo(() => {
    const source = activeTab === "sms" ? smsPayments : planPayments;
    return source.filter((row) => {
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
  }, [
    activeTab,
    planPayments,
    smsPayments,
    statusFilter,
    dateFrom,
    dateTo,
  ]);

  function switchTab(tab: "plan" | "sms") {
    setActiveTab(tab);
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.toString());
  }

  async function startCheckout(branchId: string, planCode: string) {
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
          body: JSON.stringify({ planCode }),
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

  async function startSmsPurchase(bundleId: string, branchId?: string) {
    const targetBranchId = branchId ?? focusedBranchId;
    if (!session || !targetBranchId || !bundleId) return;
    setPurchasingBundleId(bundleId);
    setPayingBranchId(targetBranchId);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/sms-credits/purchases`, {
        method: "POST",
        headers: {
          ...authHeaders(session),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bundleId, branchId: targetBranchId }),
      });
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
      setPurchasingBundleId(null);
      setPayingBranchId(null);
    }
  }

  function handleSubscribe() {
    if (!summary) return;
    const planCode = selectedPlanCode || "PRO_3M";
    if (mode === "manager") {
      const branch = summary.branches[0];
      if (branch?.canCheckout) void startCheckout(branch.branchId, planCode);
      return;
    }
    const selected =
      focusedBranch ??
      summary.branches.find((b) => b.canCheckout) ??
      summary.branches[0];
    if (selected?.canCheckout) void startCheckout(selected.branchId, planCode);
  }

  if (!ready || !session || !workspace || !user) {
    return <AppBootSkeleton />;
  }

  const planOptions =
    summary?.plans && summary.plans.length > 0
      ? summary.plans
      : FALLBACK_PLANS;
  const selectedPlan =
    planOptions.find((plan) => plan.code === selectedPlanCode) ??
    planOptions.find((plan) => plan.defaultSelected) ??
    planOptions[1] ??
    planOptions[0]!;
  const monthlyPlan =
    planOptions.find((plan) => plan.durationMonths === 1) ?? planOptions[0]!;
  const currency = selectedPlan.currency ?? "UGX";
  const monthlyPriceLabel = formatMoney(monthlyPlan.amount, currency);
  const selectedPriceLabel = formatMoney(selectedPlan.amount, currency);
  const periodSuffix =
    selectedPlan.durationMonths === 1
      ? "month"
      : `${selectedPlan.durationMonths} months`;
  const subscribeLabel =
    selectedPlan.durationMonths === 1
      ? "Subscribe monthly"
      : `Subscribe for ${selectedPlan.durationMonths} months`;
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
  else if (isGrace)
    daysCopy = `${daysLeft} day${daysLeft === 1 ? "" : "s"} left to renew`;

  let bodyCopy = `Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Subscribe to keep full access to all Pro features and continue growing your business.`;
  if (isActive) {
    bodyCopy = focusedBranch?.currentPeriodEnd
      ? `Your Pro plan is active until ${formatDate(focusedBranch.currentPeriodEnd)}.`
      : "Your Pro plan is active for this branch.";
  } else if (isGrace) {
    bodyCopy = `Your subscription has ended. Renew within ${daysLeft} day${daysLeft === 1 ? "" : "s"} to keep this branch open.`;
  } else if (isPaused) {
    bodyCopy =
      "This branch is paused. Renew to reopen lending and collections.";
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
          subtitle={
            activeTab === "sms"
              ? `Manage prepaid SMS credits for ${branchName}.`
              : `Manage the plan and billing for ${branchName}.`
          }
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
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <p className="font-semibold">SMS credits received</p>
            <p className="mt-1 text-emerald-900/90">
              {smsLoading && !smsWallet ? (
                "Updating your balance…"
              ) : (
                <>
                  New available balance:{" "}
                  <span className="font-bold tabular-nums">
                    {(
                      smsWallet?.availableUnits ??
                      smsWallet?.creditsRemaining ??
                      0
                    ).toLocaleString("en-UG")}{" "}
                    SMS
                  </span>
                  {focusedBranch?.branchName
                    ? ` on ${focusedBranch.branchName}`
                    : ""}
                  .
                </>
              )}
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-950">
            {error}
          </p>
        ) : null}

        <nav className="flex gap-5 border-b border-[var(--line)]">
          <button
            type="button"
            onClick={() => switchTab("plan")}
            className={`relative shrink-0 pb-3 text-sm font-semibold transition ${
              activeTab === "plan"
                ? "text-[var(--forest-emerald)]"
                : "text-slate-500 hover:text-[#0b1220]"
            }`}
          >
            Plan
            {activeTab === "plan" ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--forest-emerald)]" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => switchTab("sms")}
            className={`relative inline-flex shrink-0 items-center gap-1.5 pb-3 text-sm font-semibold transition ${
              activeTab === "sms"
                ? "text-[var(--forest-emerald)]"
                : "text-slate-500 hover:text-[#0b1220]"
            }`}
          >
            <MessageSquare className="size-3.5" />
            SMS notifications
            {activeTab === "sms" ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--forest-emerald)]" />
            ) : null}
          </button>
        </nav>

        {activeTab === "plan" ? (
          loading && !summary ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white py-16 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <section className="space-y-4">
              <article className="overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-[#f3f8fd] via-white to-[#f7fbf9] p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <DaysRing daysLeft={daysLeft} total={ringTotal} />
                    <div className="min-w-0">
                      <span className="inline-flex w-fit rounded-full bg-[#e8f1fb] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#2b6cb0]">
                        Current subscription
                      </span>
                      <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl tracking-[-0.03em] text-[#070b18] sm:text-[1.75rem]">
                        {statusTitle}
                      </h2>
                      <p className="mt-1 text-sm font-semibold text-[#07885f]">
                        {daysCopy}
                      </p>
                      <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                        {bodyCopy}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 rounded-2xl border border-[#d7e3f0] bg-white/90 px-4 py-3 sm:min-w-[11.5rem]">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-500">Current cost</span>
                      <span className="font-semibold text-[#070b18]">
                        {isTrial || isPaused
                          ? formatMoney(0, currency)
                          : selectedPriceLabel}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-500">
                        {isTrial ? "After trial" : "Renews from"}
                      </span>
                      <span className="font-semibold text-[#070b18]">
                        {monthlyPriceLabel} / month
                      </span>
                    </div>
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-emerald-100 bg-[#f3faf6] p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <span className="inline-flex w-fit rounded-full bg-[#e9f8ef] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#07885f]">
                      Plan
                    </span>
                    <h2 className="mt-1.5 font-[family-name:var(--font-display)] text-xl tracking-[-0.03em] text-[#070b18]">
                      Pro
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Choose billing period
                    </p>
                  </div>
                  <p className="text-sm text-slate-600">
                    Your price{" "}
                    <span className="text-base font-bold text-[#07885f]">
                      {selectedPriceLabel}
                    </span>{" "}
                    <span className="font-medium text-slate-500">
                      / {periodSuffix}
                    </span>
                  </p>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {planOptions.map((plan) => {
                      const selected = plan.code === selectedPlan.code;
                      const badgeLabel =
                        plan.badge === "MOST_POPULAR"
                          ? "Most popular"
                          : plan.badge === "BEST_VALUE"
                            ? "Best value"
                            : null;
                      return (
                        <button
                          key={plan.code}
                          type="button"
                          onClick={() => setSelectedPlanCode(plan.code)}
                          className={`relative flex flex-col rounded-xl border bg-white px-3 py-3 text-left transition ${
                            selected
                              ? "border-[#07885f] shadow-[0_8px_18px_rgba(7,136,95,0.14)] ring-2 ring-[#07885f]/20"
                              : "border-[#d7e3f0] hover:border-[#07885f]/50"
                          }`}
                        >
                          {badgeLabel ? (
                            <span
                              className={`absolute -top-2 left-2.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.05em] text-white ${
                                plan.badge === "MOST_POPULAR"
                                  ? "bg-[#2b6cb0]"
                                  : "bg-[#07885f]"
                              }`}
                            >
                              {badgeLabel}
                            </span>
                          ) : null}
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-bold text-[#070b18]">
                              {plan.label}
                            </span>
                            <span
                              className={`flex size-3.5 shrink-0 items-center justify-center rounded-full border ${
                                selected
                                  ? "border-[#07885f] bg-[#07885f]"
                                  : "border-slate-300 bg-white"
                              }`}
                              aria-hidden
                            >
                              {selected ? (
                                <Check
                                  className="size-2 text-white"
                                  strokeWidth={3}
                                />
                              ) : null}
                            </span>
                          </span>
                          {plan.compareAtAmount ? (
                            <p className="mt-1.5 text-[11px] text-slate-400 line-through">
                              {formatMoney(plan.compareAtAmount, plan.currency)}
                            </p>
                          ) : null}
                          <p
                            className={`text-[15px] font-bold tabular-nums text-[#070b18] ${
                              plan.compareAtAmount ? "mt-0" : "mt-1.5"
                            }`}
                          >
                            {formatMoney(plan.amount, plan.currency)}
                          </p>
                          {plan.savingsAmount ? (
                            <p className="mt-0.5 text-[11px] font-semibold text-[#07885f]">
                              Save {formatMoney(plan.savingsAmount, plan.currency)}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                              {plan.tagline}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-col rounded-xl border border-[#d7e3f0] bg-white p-3.5">
                    <ul className="flex-1 space-y-1.5">
                      {PRO_BENEFITS.map((item) => (
                        <li
                          key={item}
                          className="flex gap-2 text-[11px] leading-snug text-slate-700"
                        >
                          <Check
                            className="mt-0.5 size-3 shrink-0 text-[#07885f]"
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
                      className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#07885f] text-sm font-semibold text-white shadow-[0_12px_24px_rgba(7,136,95,0.22)] transition hover:bg-[#067352] disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {subscribePaying ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          {subscribeLabel}
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </article>

              <div className="rounded-xl border border-sky-100 bg-[#f3f8fd] px-4 py-3">
                <p className="text-xs font-medium text-slate-700 sm:text-sm">
                  Secure. Reliable. Built for your business. Your data is
                  encrypted and backed up daily. Cancel anytime.
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="size-3.5 text-[#2b6cb0]" />
                    Secure payments
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCw className="size-3.5 text-[#2b6cb0]" />
                    Cancel anytime
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Shield className="size-3.5 text-[#2b6cb0]" />
                    Data protected
                  </span>
                </div>
              </div>
            </section>
          )
        ) : (
          <section className="space-y-3">
            <article className="rounded-2xl border border-sky-100 bg-[#f3f8fd] p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#e8f1fb] text-[#2b6cb0]">
                    <MessageSquare className="size-5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <span className="inline-flex w-fit rounded-full bg-[#e8f1fb] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#2b6cb0]">
                      SMS notifications
                    </span>
                    <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl tracking-[-0.03em] text-[#070b18]">
                      Prepaid SMS credits
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Buy a bundle for borrower alerts and reminders on this
                      branch. OTP and platform messages stay free.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm font-bold tabular-nums text-[#070b18] ring-1 ring-[#d7e3f0]">
                        {smsLoading && !smsWallet ? (
                          <Loader2 className="size-3.5 animate-spin text-slate-400" />
                        ) : (
                          <>
                            {(
                              smsWallet?.availableUnits ??
                              smsWallet?.creditsRemaining ??
                              0
                            ).toLocaleString("en-UG")}{" "}
                            available
                          </>
                        )}
                      </span>
                      {(smsWallet?.reservedUnits ?? 0) > 0 ? (
                        <span className="text-xs font-medium text-slate-500">
                          {(smsWallet?.reservedUnits ?? 0).toLocaleString(
                            "en-UG",
                          )}{" "}
                          reserved
                        </span>
                      ) : null}
                      {!smsWallet?.canSendSms && !smsLoading ? (
                        <span className="text-xs font-medium text-amber-700">
                          Buy a bundle to keep messaging
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </article>

            {confirmBundle && focusedBranchId ? (
              <article className="rounded-2xl border border-[#07885f]/40 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                <h3 className="text-sm font-semibold text-[#070b18]">
                  Confirm purchase
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Check the details, then continue to payment.
                </p>
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-xl bg-[#f6f8fb] px-3 py-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                      Bundle
                    </dt>
                    <dd className="mt-0.5 font-semibold text-[#070b18]">
                      {confirmBundle.name}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-[#f6f8fb] px-3 py-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                      Branch
                    </dt>
                    <dd className="mt-0.5 font-semibold text-[#070b18]">
                      {focusedBranch?.branchName ?? "This branch"}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-[#f6f8fb] px-3 py-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                      SMS units
                    </dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-[#070b18]">
                      {confirmBundle.smsUnits.toLocaleString("en-UG")}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-[#f6f8fb] px-3 py-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                      Amount
                    </dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-[#070b18]">
                      {formatMoney(
                        confirmBundle.priceUgx,
                        confirmBundle.currency,
                      )}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={purchasingBundleId != null}
                    onClick={() =>
                      void startSmsPurchase(confirmBundle.id, focusedBranchId)
                    }
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#07885f] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(7,136,95,0.22)] transition hover:bg-[#067352] disabled:opacity-55"
                  >
                    {purchasingBundleId === confirmBundle.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Continue to payment
                  </button>
                  <button
                    type="button"
                    disabled={purchasingBundleId != null}
                    onClick={() => setConfirmBundle(null)}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-55"
                  >
                    Back
                  </button>
                </div>
              </article>
            ) : focusedBranchId ? (
              <article className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                <h3 className="text-sm font-semibold text-[#070b18]">
                  Choose an SMS bundle
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Packs for {focusedBranch?.branchName ?? "this branch"}. Prices
                  come from the server catalogue.
                </p>
                {smsLoading && smsBundles.length === 0 ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="size-4 animate-spin" />
                    Loading bundles…
                  </div>
                ) : smsBundles.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">
                    No SMS bundles are available right now.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {smsBundles.map((bundle, index) => {
                      const popular = index === 1;
                      return (
                        <button
                          key={bundle.id}
                          type="button"
                          disabled={purchasingBundleId != null}
                          onClick={() => setConfirmBundle(bundle)}
                          className={`flex min-h-[88px] flex-col items-start justify-between rounded-xl border px-3.5 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            popular
                              ? "border-[#07885f] bg-[#07885f] text-white hover:bg-[#067352]"
                              : "border-[var(--line)] bg-[#f6f8fb] text-[#070b18] hover:border-[#07885f] hover:bg-[#f3faf6]"
                          }`}
                        >
                          <span>
                            <span className="block text-sm font-semibold">
                              {bundle.name}
                            </span>
                            <span className="mt-1 block text-lg font-bold tabular-nums">
                              {formatMoney(bundle.priceUgx, bundle.currency)}
                            </span>
                            <span
                              className={`mt-1 block text-xs font-medium ${
                                popular ? "text-white/80" : "text-slate-500"
                              }`}
                            >
                              {bundle.smsUnits.toLocaleString("en-UG")} SMS
                            </span>
                          </span>
                          <span
                            className={`mt-3 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] ${
                              popular
                                ? "bg-white/20 text-white"
                                : "bg-white text-[#07885f]"
                            }`}
                          >
                            Select
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </article>
            ) : (
              <p className="rounded-xl border border-[var(--line)] bg-white px-4 py-8 text-center text-sm text-slate-500">
                Select a branch to manage SMS credits.
              </p>
            )}
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-[#07885f]" />
              <h3 className="text-sm font-semibold text-[#070b18]">
                {activeTab === "sms" ? "SMS payment history" : "Billing history"}
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
                {(activeTab === "sms" ? smsPayments : planPayments).length === 0
                  ? activeTab === "sms"
                    ? "No SMS purchases yet."
                    : "No plan payments yet."
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
                        {activeTab === "sms" ? "Credits" : "Period"}
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
                          ? purchasingBundleId === row.bundleId
                          : purchasingBundleId == null);
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
                            {row.transaction}
                          </td>
                          <td className="hidden px-3 py-2.5 text-xs text-slate-600 md:table-cell">
                            {isSms
                              ? row.credits != null
                                ? `${row.credits.toLocaleString("en-UG")} SMS`
                                : "—"
                              : (row.periodLabel ?? "—")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold text-[#070b18]">
                            {row.amount === 0 && row.kind === "sms"
                              ? "Free"
                              : formatMoney(row.amount, row.currency)}
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
                                disabled={
                                  retrying || purchasingBundleId != null
                                }
                                onClick={() => {
                                  if (isSms) {
                                    if (row.bundleId) {
                                      void startSmsPurchase(
                                        row.bundleId,
                                        row.branchId,
                                      );
                                      return;
                                    }
                                    setActiveTab("sms");
                                    setFocusedBranchId(row.branchId);
                                    return;
                                  }
                                  void startCheckout(
                                    row.branchId,
                                    selectedPlanCode || "PRO_3M",
                                  );
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
          <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
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
