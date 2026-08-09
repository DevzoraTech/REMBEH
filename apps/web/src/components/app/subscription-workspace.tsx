"use client";

import {
  Suspense,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  FileText,
  Headphones,
  Info,
  Lock,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  ReceiptText,
  RefreshCw,
  Shield,
  X,
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
  refreshAuthSession,
} from "../../lib/auth-session";
import { resolveOperatorRole } from "../../lib/roles";
import { formatDate, formatMoney } from "../../app/owner/owner-common";
import { OwnerHeader } from "../../app/owner/owner-header";
import { PaymentMethodBadge } from "./payment-method-badge";
import {
  connectRealtime,
  type SubscriptionPaymentUpdatedEvent,
} from "../../lib/realtime";
import {
  SubscriptionPaymentResultOverlay,
  type SubscriptionPaymentResultOverlayState,
  hasSeenSubscriptionPaymentResult as hasSeenPaymentResult,
  isManualSubscriptionPayment,
  markSubscriptionPaymentResultSeen as markPaymentResultSeen,
} from "./subscription-payment-result-overlay";

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
  planCode?: string | null;
  planDurationMonths?: number | null;
  activeUntil?: string | null;
  transactionId?: string | null;
  verifiedAt?: string | null;
  verifiedByName?: string | null;
  failureReason?: string | null;
  credits?: number | null;
  paymentMethod: string;
  status: string;
  receipt: string | null;
  canRetry: boolean;
  canCancel?: boolean;
  bundleId?: string | null;
};

type ManualPaymentMethod = "MTN_MOMO" | "AIRTEL_MONEY";

type ManualPaymentMethodOption = {
  id: ManualPaymentMethod;
  title: string;
  subtitle: string;
  logoSrc: string;
  logoAlt: string;
  merchantCode: string;
  accountName: string;
  qrSrc?: string;
};

type ManualPaymentSubmission = {
  plan: BillingPlanOption;
  branchName: string;
  paymentMethod: ManualPaymentMethodOption;
  transactionId: string;
  submittedAt: string;
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
const PAYMENT_SUPPORT_PHONE = "0777823011, 0752039673";
const PAYMENT_SUPPORT_EMAIL = "subscriptions@antikra.com";
const PAYMENT_ACCOUNT_NAME = "ANTIKRA HOLDINGS LTD";

const MANUAL_PAYMENT_METHODS: ManualPaymentMethodOption[] = [
  {
    id: "MTN_MOMO",
    title: "MTN MoMo",
    subtitle: "Pay using MTN Mobile Money",
    logoSrc: "/assets/payments/mtn.png",
    logoAlt: "MTN",
    merchantCode: "123456",
    accountName: PAYMENT_ACCOUNT_NAME,
  },
  {
    id: "AIRTEL_MONEY",
    title: "Airtel Money",
    subtitle: "Pay using Airtel Money",
    logoSrc: "/assets/payments/airtel.png",
    logoAlt: "Airtel",
    merchantCode: "7170321",
    accountName: PAYMENT_ACCOUNT_NAME,
    qrSrc: "/assets/payments/airtel-qr.png",
  },
];

function manualPaymentMethodById(method: ManualPaymentMethod | null) {
  return MANUAL_PAYMENT_METHODS.find((item) => item.id === method) ?? null;
}

function normalizeManualTransactionId(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function compactManualTransactionId(value: string) {
  return normalizeManualTransactionId(value).replace(/[^A-Z0-9]/g, "");
}

function manualPaymentMethodForRow(row: PaymentRow) {
  const method = row.paymentMethod.toLowerCase();
  if (method.includes("airtel")) {
    return manualPaymentMethodById("AIRTEL_MONEY") ?? MANUAL_PAYMENT_METHODS[1];
  }
  return manualPaymentMethodById("MTN_MOMO") ?? MANUAL_PAYMENT_METHODS[0];
}

function submissionFromPendingPayment(
  row: PaymentRow,
  plans: BillingPlanOption[],
  fallback: BillingPlanOption,
): ManualPaymentSubmission {
  return {
    plan:
      (row.kind ?? "subscription") === "sms"
        ? planForSmsPaymentRow(row)
        : planForPaymentRow(row, plans, fallback),
    branchName: row.branchName,
    paymentMethod: manualPaymentMethodForRow(row),
    transactionId: row.transactionId || row.receipt || "Submitted",
    submittedAt: row.date,
  };
}

function isSmsBundlePlan(plan: BillingPlanOption) {
  return plan.interval === "SMS_BUNDLE";
}

function paymentPeriodLabel(plan: BillingPlanOption) {
  if (isSmsBundlePlan(plan)) return `${plan.label} SMS Bundle`;
  if (plan.durationMonths === 1) return "Monthly Subscription";
  return `${plan.durationMonths}-Month Subscription`;
}

function paymentPlanAccessCopy(plan: BillingPlanOption) {
  if (isSmsBundlePlan(plan)) return plan.tagline;
  const unit = plan.durationMonths === 1 ? "month" : "months";
  return `Access all Rembeh features for ${plan.durationMonths} ${unit}`;
}

function planForSmsBundle(bundle: SmsBundle): BillingPlanOption {
  return {
    code: `SMS_${bundle.id}`,
    name: "SMS",
    amount: bundle.priceUgx,
    currency: bundle.currency,
    interval: "SMS_BUNDLE",
    durationMonths: 0,
    label: bundle.name,
    tagline: `${bundle.smsUnits.toLocaleString(
      "en-UG",
    )} SMS credits for borrower notifications`,
    compareAtAmount: null,
    savingsAmount: null,
    badge: null,
    defaultSelected: false,
  };
}

function planForSmsPaymentRow(row: PaymentRow): BillingPlanOption {
  const label = row.transaction.replace(/\s+SMS Bundle$/i, "") || "SMS";
  return {
    code: row.bundleId ? `SMS_${row.bundleId}` : `SMS_${row.id}`,
    name: "SMS",
    amount: row.amount,
    currency: row.currency,
    interval: "SMS_BUNDLE",
    durationMonths: 0,
    label,
    tagline: `${(row.credits ?? 0).toLocaleString(
      "en-UG",
    )} SMS credits for borrower notifications`,
    compareAtAmount: null,
    savingsAmount: null,
    badge: null,
    defaultSelected: false,
  };
}

function planForPaymentRow(
  row: PaymentRow,
  plans: BillingPlanOption[],
  fallback: BillingPlanOption,
) {
  const match =
    plans.find((plan) => row.planCode && plan.code === row.planCode) ??
    plans.find(
      (plan) =>
        plan.durationMonths === row.planDurationMonths &&
        plan.amount === row.amount,
    ) ??
    plans.find((plan) => plan.amount === row.amount) ??
    fallback;

  return {
    ...match,
    amount: row.amount,
    currency: row.currency,
    durationMonths: row.planDurationMonths ?? match.durationMonths,
  };
}

function paymentRowMatchesPlan(row: PaymentRow, plan: BillingPlanOption) {
  if (row.planCode) return row.planCode === plan.code;
  return (
    row.amount === plan.amount &&
    (row.planDurationMonths == null ||
      row.planDurationMonths === plan.durationMonths)
  );
}

function formatPaymentSubmittedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .replace(/\b(am|pm)\b/gi, (match) => match.toUpperCase());
}

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

function daysRemainingFor(
  row: BillingSummary["branches"][number],
  trial: BillingSummary["trial"],
) {
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

function ringTotals(
  row: BillingSummary["branches"][number],
  trialActive: boolean,
) {
  if (row.status === "TRIAL" || (trialActive && row.status === "TRIAL")) {
    return TRIAL_TOTAL_DAYS;
  }
  if (row.status === "GRACE" || row.status === "PAST_DUE") {
    return GRACE_TOTAL_DAYS;
  }
  return PERIOD_TOTAL_DAYS;
}

export function SubscriptionWorkspace({ mode }: { mode: "owner" | "manager" }) {
  return (
    <Suspense fallback={<AppBootSkeleton />}>
      <SubscriptionWorkspaceContent mode={mode} />
    </Suspense>
  );
}

function SubscriptionWorkspaceContent({ mode }: { mode: "owner" | "manager" }) {
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
  const purchasingBundleId = useMemo<string | null>(() => null, []);
  const [selectedPlanCode, setSelectedPlanCode] = useState("PRO_3M");
  const [paymentPanelOpen, setPaymentPanelOpen] = useState(false);
  const [manualPaymentKind, setManualPaymentKind] = useState<
    "subscription" | "sms"
  >("subscription");
  const [manualSmsBundle, setManualSmsBundle] = useState<SmsBundle | null>(
    null,
  );
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<ManualPaymentMethod | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [confirmTransactionId, setConfirmTransactionId] = useState("");
  const [submittingManualPayment, setSubmittingManualPayment] = useState(false);
  const [submittedManualPayment, setSubmittedManualPayment] =
    useState<ManualPaymentSubmission | null>(null);
  const [paymentResultOverlay, setPaymentResultOverlay] =
    useState<SubscriptionPaymentResultOverlayState | null>(null);
  const [cancellingPaymentId, setCancellingPaymentId] = useState<string | null>(
    null,
  );
  const autoShownPendingPaymentIdRef = useRef<string | null>(null);
  const paid = searchParams.get("paid") === "1";
  const failedPayment = searchParams.get("failed") === "1";
  const resultParam = searchParams.get("paymentResult");
  const resultPaymentId = searchParams.get("payment");
  const retryPaymentId = searchParams.get("retryPayment");
  const smsPaid = searchParams.get("smsPaid") === "1";
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"plan" | "sms">(
    tabParam === "sms" || smsPaid ? "sms" : "plan",
  );
  const nextPath = mode === "owner" ? "/owner/subscription" : "/subscription";

  useEffect(() => {
    if (tabParam === "sms" || smsPaid) {
      setActiveTab("sms");
    } else if (
      tabParam === "plan" ||
      paid ||
      failedPayment ||
      retryPaymentId ||
      resultParam === "success" ||
      resultParam === "failed"
    ) {
      setActiveTab("plan");
    }
  }, [failedPayment, paid, resultParam, retryPaymentId, smsPaid, tabParam]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void (async () => {
        const auth = readAuthState();
        let activeSession = auth.session;
        if (activeSession && isSessionExpired(activeSession)) {
          activeSession = await refreshAuthSession(activeSession, apiBaseUrl);
        }
        if (!activeSession) {
          clearAuthState();
          router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
          return;
        }
        const role = resolveOperatorRole(activeSession, auth.user);
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
        setSession(activeSession);
        setWorkspace(auth.workspace);
        setUser(auth.user);
        setReady(true);
      })();
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
    const hasSubscriptionResult =
      paid ||
      failedPayment ||
      resultParam === "success" ||
      resultParam === "failed";
    if ((!hasSubscriptionResult && !smsPaid) || !session) return;
    const timer = window.setTimeout(() => {
      void load();
      if (focusedBranchId) void loadSmsWallet(focusedBranchId);
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [
    failedPayment,
    paid,
    resultParam,
    smsPaid,
    session,
    load,
    focusedBranchId,
    loadSmsWallet,
  ]);

  useEffect(() => {
    if (!summary?.branches.length) return;
    setFocusedBranchId((current) => {
      if (current && summary.branches.some((b) => b.branchId === current)) {
        return current;
      }
      const fromQuery = searchParams.get("branch");
      if (fromQuery && summary.branches.some((b) => b.branchId === fromQuery)) {
        return fromQuery;
      }
      const checkoutable = summary.branches.find((b) => b.canCheckout);
      return checkoutable?.branchId ?? summary.branches[0]?.branchId ?? null;
    });
  }, [summary, searchParams]);

  useEffect(() => {
    if (!summary) return;
    const options =
      summary.plans && summary.plans.length > 0
        ? summary.plans
        : FALLBACK_PLANS;
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
  const planOptions =
    summary?.plans && summary.plans.length > 0 ? summary.plans : FALLBACK_PLANS;
  const selectedPlan =
    planOptions.find((plan) => plan.code === selectedPlanCode) ??
    planOptions.find((plan) => plan.defaultSelected) ??
    planOptions[1] ??
    planOptions[0]!;
  const monthlyPlan =
    planOptions.find((plan) => plan.durationMonths === 1) ?? planOptions[0]!;

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
  }, [activeTab, planPayments, smsPayments, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (!ready || paymentResultOverlay || paymentPanelOpen) return;
    const result = [...planPayments]
      .filter(
        (row) =>
          isManualSubscriptionPayment(row) &&
          (row.status === "Paid" || row.status === "Failed") &&
          !hasSeenPaymentResult(row.id),
      )
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )[0];
    if (!result) return;

    setActiveTab("plan");
    setFocusedBranchId(result.branchId);
    setSubmittedManualPayment(null);
    setPaymentResultOverlay({
      kind: result.status === "Paid" ? "success" : "failed",
      payment: result,
      plan: planForPaymentRow(result, planOptions, selectedPlan),
    });
  }, [
    paymentPanelOpen,
    paymentResultOverlay,
    planOptions,
    planPayments,
    ready,
    selectedPlan,
  ]);

  useEffect(() => {
    if (
      !ready ||
      paymentPanelOpen ||
      paymentResultOverlay ||
      submittedManualPayment
    ) {
      return;
    }

    const pending = [...planPayments, ...smsPayments]
      .filter(
        (row) =>
          ((row.kind ?? "subscription") === "sms" ||
            isManualSubscriptionPayment(row)) &&
          row.status === "Pending" &&
          row.canCancel === true,
      )
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )[0];
    if (!pending || autoShownPendingPaymentIdRef.current === pending.id) return;

    autoShownPendingPaymentIdRef.current = pending.id;
    if ((pending.kind ?? "subscription") === "sms") {
      setManualPaymentKind("sms");
      setManualSmsBundle(
        smsBundles.find((bundle) => bundle.id === pending.bundleId) ?? null,
      );
      setActiveTab("sms");
    } else {
      setManualPaymentKind("subscription");
      setManualSmsBundle(null);
      setSelectedPlanCode(pending.planCode ?? selectedPlanCode ?? "PRO_3M");
      setActiveTab("plan");
    }
    setFocusedBranchId(pending.branchId);
    setSelectedPaymentMethod(manualPaymentMethodForRow(pending).id);
    setTransactionId("");
    setConfirmTransactionId("");
    setSubmittedManualPayment(
      submissionFromPendingPayment(pending, planOptions, selectedPlan),
    );
    setPaymentPanelOpen(true);
  }, [
    paymentPanelOpen,
    paymentResultOverlay,
    planOptions,
    planPayments,
    ready,
    selectedPlan,
    selectedPlanCode,
    smsBundles,
    smsPayments,
    submittedManualPayment,
  ]);

  useEffect(() => {
    if (!submittedManualPayment || !session) return;
    const timer = window.setInterval(() => {
      void loadPayments();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [submittedManualPayment, session, loadPayments]);

  useEffect(() => {
    if (!session) return;
    const socket = connectRealtime(session.accessToken);
    if (focusedBranchId) {
      socket.emit("subscribe", { branchId: focusedBranchId });
    }

    const onPaymentUpdate = (event: SubscriptionPaymentUpdatedEvent) => {
      const row = event.payment;
      if (!row) return;
      const isSms = (row.kind ?? "subscription") === "sms";
      const branchInScope =
        mode === "owner" ||
        summary?.branches.some((branch) => branch.branchId === row.branchId) ||
        row.branchId === focusedBranchId;
      if (!branchInScope) return;

      setPayments((current) => {
        const next = [...current];
        const index = next.findIndex((item) => item.id === row.id);
        if (index >= 0) {
          next[index] = { ...next[index], ...row };
        } else {
          next.unshift(row);
        }
        return next.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
      });

      if (isSms) {
        if (row.branchId === focusedBranchId) {
          void loadSmsWallet(row.branchId);
        }
        const submittedMatches =
          submittedManualPayment &&
          row.transactionId?.toUpperCase() ===
            submittedManualPayment.transactionId.toUpperCase() &&
          row.branchName === submittedManualPayment.branchName;
        if (
          submittedMatches &&
          (row.status === "Paid" || row.status === "Failed")
        ) {
          setSubmittedManualPayment(null);
          setPaymentPanelOpen(false);
          if (row.status === "Failed") {
            setError(
              row.failureReason ||
                "SMS payment could not be verified. Check the transaction ID and try again.",
            );
          }
        }
        return;
      }

      void loadSummary();

      if (row.status !== "Paid" && row.status !== "Failed") return;
      const submittedMatches =
        submittedManualPayment &&
        row.transactionId?.toUpperCase() ===
          submittedManualPayment.transactionId.toUpperCase() &&
        row.branchName === submittedManualPayment.branchName;
      const shouldShowResult =
        submittedMatches ||
        (isManualSubscriptionPayment(row) && !hasSeenPaymentResult(row.id));
      if (!shouldShowResult) return;

      setSubmittedManualPayment(null);
      setPaymentPanelOpen(false);
      setPaymentResultOverlay({
        kind: row.status === "Paid" ? "success" : "failed",
        payment: row,
        plan: planForPaymentRow(row, planOptions, selectedPlan),
      });
    };

    socket.on("subscription_payment.updated", onPaymentUpdate);
    return () => {
      socket.off("subscription_payment.updated", onPaymentUpdate);
      socket.disconnect();
    };
  }, [
    focusedBranchId,
    loadSummary,
    loadSmsWallet,
    mode,
    planOptions,
    selectedPlan,
    session,
    submittedManualPayment,
    summary?.branches,
  ]);

  useEffect(() => {
    if (!submittedManualPayment) return;
    const source = isSmsBundlePlan(submittedManualPayment.plan)
      ? smsPayments
      : planPayments;
    const match = source.find(
      (row) =>
        row.transactionId?.toUpperCase() ===
          submittedManualPayment.transactionId.toUpperCase() &&
        row.branchName === submittedManualPayment.branchName,
    );
    if (!match || (match.status !== "Paid" && match.status !== "Failed")) {
      return;
    }
    if ((match.kind ?? "subscription") === "sms") {
      setSubmittedManualPayment(null);
      setPaymentPanelOpen(false);
      if (match.branchId === focusedBranchId) {
        void loadSmsWallet(match.branchId);
      }
      if (match.status === "Failed") {
        setError(
          match.failureReason ||
            "SMS payment could not be verified. Check the transaction ID and try again.",
        );
      }
      return;
    }
    setSubmittedManualPayment(null);
    setPaymentPanelOpen(false);
    setPaymentResultOverlay({
      kind: match.status === "Paid" ? "success" : "failed",
      payment: match,
      plan: planForPaymentRow(match, planOptions, selectedPlan),
    });
  }, [
    focusedBranchId,
    loadSmsWallet,
    planOptions,
    planPayments,
    selectedPlan,
    smsPayments,
    submittedManualPayment,
  ]);

  useEffect(() => {
    const requested =
      resultParam === "success" || paid
        ? "success"
        : resultParam === "failed" || failedPayment
          ? "failed"
          : null;
    if (!requested || paymentResultOverlay) return;
    const expectedStatus = requested === "success" ? "Paid" : "Failed";
    const match =
      (resultPaymentId
        ? planPayments.find((row) => row.id === resultPaymentId)
        : null) ?? planPayments.find((row) => row.status === expectedStatus);
    if (!match || match.status !== expectedStatus) return;
    setPaymentResultOverlay({
      kind: requested,
      payment: match,
      plan: planForPaymentRow(match, planOptions, selectedPlan),
    });
  }, [
    failedPayment,
    paid,
    paymentResultOverlay,
    planOptions,
    planPayments,
    resultParam,
    resultPaymentId,
    selectedPlan,
  ]);

  useEffect(() => {
    if (
      !retryPaymentId ||
      !ready ||
      paymentPanelOpen ||
      paymentResultOverlay ||
      !summary
    ) {
      return;
    }
    const row = planPayments.find((payment) => payment.id === retryPaymentId);
    if (!row || row.status !== "Failed") return;
    const branch = summary.branches.find(
      (item) => item.branchId === row.branchId,
    );
    if (!branch) return;

    setSelectedPlanCode(row.planCode ?? selectedPlanCode ?? "PRO_3M");
    setFocusedBranchId(row.branchId);
    setActiveTab("plan");
    setPaymentPanelOpen(true);
    setSelectedPaymentMethod(manualPaymentMethodForRow(row).id);
    setSubmittedManualPayment(null);
    setTransactionId("");
    setConfirmTransactionId("");
    setError(null);

    const url = new URL(window.location.href);
    url.searchParams.delete("retryPayment");
    url.searchParams.set("tab", "plan");
    window.history.replaceState({}, "", url.toString());
  }, [
    paymentPanelOpen,
    paymentResultOverlay,
    planPayments,
    ready,
    retryPaymentId,
    selectedPlanCode,
    summary,
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

  function startSmsPurchase(bundleId: string, branchId?: string) {
    const bundle = smsBundles.find((item) => item.id === bundleId);
    const targetBranch = resolveSubscriptionBranch(branchId);
    if (!bundle) {
      setError("Choose an SMS bundle before starting payment.");
      return;
    }
    if (!targetBranch) {
      setError("Choose a branch before starting payment.");
      return;
    }

    setError(null);
    const pending = pendingManualSmsPaymentFor(
      bundle.id,
      targetBranch.branchId,
    );
    if (pending) {
      setManualPaymentKind("sms");
      setManualSmsBundle(bundle);
      setFocusedBranchId(targetBranch.branchId);
      setActiveTab("sms");
      setConfirmBundle(null);
      setSelectedPaymentMethod(manualPaymentMethodForRow(pending).id);
      setTransactionId("");
      setConfirmTransactionId("");
      setSubmittedManualPayment(
        submissionFromPendingPayment(pending, planOptions, selectedPlan),
      );
      setPaymentResultOverlay(null);
      setPaymentPanelOpen(true);
      return;
    }

    openManualSmsPayment(bundle, targetBranch.branchId);
  }

  function resolveSubscriptionBranch(branchId?: string) {
    if (!summary) return null;
    if (branchId) {
      return (
        summary.branches.find((branch) => branch.branchId === branchId) ?? null
      );
    }
    if (mode === "manager") return summary.branches[0] ?? null;
    return (
      focusedBranch ??
      summary.branches.find((branch) => branch.canCheckout) ??
      summary.branches[0] ??
      null
    );
  }

  function pendingManualPaymentFor(planCode?: string, branchId?: string) {
    const targetBranchId =
      branchId ?? resolveSubscriptionBranch()?.branchId ?? focusedBranchId;
    if (!targetBranchId) return null;
    const targetPlan =
      planOptions.find((plan) => plan.code === planCode) ?? selectedPlan;
    return (
      planPayments.find(
        (row) =>
          row.branchId === targetBranchId &&
          row.status === "Pending" &&
          row.canCancel === true &&
          paymentRowMatchesPlan(row, targetPlan),
      ) ?? null
    );
  }

  function pendingManualSmsPaymentFor(bundleId?: string, branchId?: string) {
    const targetBranchId =
      branchId ?? resolveSubscriptionBranch()?.branchId ?? focusedBranchId;
    if (!targetBranchId) return null;
    const targetBundle =
      smsBundles.find((bundle) => bundle.id === bundleId) ?? manualSmsBundle;
    return (
      smsPayments.find(
        (row) =>
          row.branchId === targetBranchId &&
          row.status === "Pending" &&
          row.canCancel === true &&
          ((bundleId && row.bundleId === bundleId) ||
            (!row.bundleId &&
              targetBundle != null &&
              row.amount === targetBundle.priceUgx &&
              (row.credits ?? 0) === targetBundle.smsUnits)),
      ) ?? null
    );
  }

  function openManualPayment(planCode?: string, branchId?: string) {
    const targetBranch = resolveSubscriptionBranch(branchId);
    if (!targetBranch) {
      setError("Choose a branch before starting payment.");
      return;
    }
    if (!targetBranch.canCheckout) {
      setError("This branch cannot be renewed right now.");
      return;
    }

    setSelectedPlanCode(planCode || selectedPlanCode || "PRO_3M");
    setManualPaymentKind("subscription");
    setManualSmsBundle(null);
    setFocusedBranchId(targetBranch.branchId);
    setActiveTab("plan");
    setPaymentPanelOpen(true);
    setSelectedPaymentMethod(null);
    setTransactionId("");
    setConfirmTransactionId("");
    setSubmittedManualPayment(null);
    setPaymentResultOverlay(null);
    setError(null);
  }

  function openManualSmsPayment(bundle: SmsBundle, branchId?: string) {
    const targetBranch = resolveSubscriptionBranch(branchId);
    if (!targetBranch) {
      setError("Choose a branch before starting payment.");
      return;
    }

    setManualPaymentKind("sms");
    setManualSmsBundle(bundle);
    setFocusedBranchId(targetBranch.branchId);
    setActiveTab("sms");
    setConfirmBundle(null);
    setPaymentPanelOpen(true);
    setSelectedPaymentMethod(null);
    setTransactionId("");
    setConfirmTransactionId("");
    setSubmittedManualPayment(null);
    setPaymentResultOverlay(null);
    setError(null);
  }

  async function cancelPendingPayment(paymentId: string) {
    if (!session) return;
    setCancellingPaymentId(paymentId);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/billing/payments/${paymentId}/cancel`,
        {
          method: "POST",
          headers: authHeaders(session),
        },
      );
      const payload = await readApiJson<{
        payment?: PaymentRow;
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setSelectedPaymentMethod(null);
      setTransactionId("");
      setConfirmTransactionId("");
      setSubmittedManualPayment(null);
      await Promise.all([
        loadSummary(),
        loadPayments(),
        focusedBranchId ? loadSmsWallet(focusedBranchId) : Promise.resolve(),
      ]);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setCancellingPaymentId(null);
    }
  }

  function closePaymentOverlay() {
    setPaymentPanelOpen(false);
    setManualPaymentKind("subscription");
    setManualSmsBundle(null);
    setSelectedPaymentMethod(null);
    setTransactionId("");
    setConfirmTransactionId("");
    setSubmittedManualPayment(null);
  }

  function closePaymentResultOverlay() {
    if (paymentResultOverlay?.payment.id) {
      markPaymentResultSeen(paymentResultOverlay.payment.id);
    }
    setPaymentResultOverlay(null);
    const url = new URL(window.location.href);
    for (const key of ["paid", "failed", "paymentResult", "payment"]) {
      url.searchParams.delete(key);
    }
    window.history.replaceState({}, "", url.toString());
  }

  function showPaymentResult(row: PaymentRow, kind?: "success" | "failed") {
    if ((row.kind ?? "subscription") === "sms") return;
    const resultKind = kind ?? (row.status === "Failed" ? "failed" : "success");
    setPaymentPanelOpen(false);
    setSubmittedManualPayment(null);
    setConfirmTransactionId("");
    setPaymentResultOverlay({
      kind: resultKind,
      payment: row,
      plan: planForPaymentRow(row, planOptions, selectedPlan),
    });
  }

  async function submitManualPayment() {
    const targetBranch = resolveSubscriptionBranch();
    const method = selectedPaymentMethod;
    const reference = transactionId.trim();
    const confirmation = confirmTransactionId.trim();
    if (!session || !targetBranch) return;
    if (manualPaymentKind === "sms" && !manualSmsBundle) {
      setError("Choose an SMS bundle before verifying payment.");
      return;
    }
    const pendingPayment =
      manualPaymentKind === "sms"
        ? pendingManualSmsPaymentFor(manualSmsBundle?.id, targetBranch.branchId)
        : pendingManualPaymentFor(selectedPlanCode, targetBranch.branchId);
    if (pendingPayment) {
      setError(
        "Cancel the pending payment request before submitting another transaction ID for this purchase.",
      );
      return;
    }
    const paymentMethodOption = manualPaymentMethodById(method);
    if (!method) {
      setError("Choose MTN MoMo or Airtel Money before verifying payment.");
      return;
    }
    if (!paymentMethodOption) {
      setError("Choose a payment method before verifying payment.");
      return;
    }
    if (!reference) {
      setError("Enter the transaction ID from your payment message.");
      return;
    }
    if (!confirmation) {
      setError("Re-enter the transaction ID to confirm it.");
      return;
    }
    if (
      compactManualTransactionId(reference) !==
      compactManualTransactionId(confirmation)
    ) {
      setError("The transaction IDs do not match. Check both entries.");
      return;
    }

    setSubmittingManualPayment(true);
    setPayingBranchId(targetBranch.branchId);
    setSubmittedManualPayment(null);
    setError(null);
    try {
      const endpoint =
        manualPaymentKind === "sms"
          ? `${apiBaseUrl}/billing/branches/${targetBranch.branchId}/manual-sms-payment`
          : `${apiBaseUrl}/billing/branches/${targetBranch.branchId}/manual-payment`;
      const body =
        manualPaymentKind === "sms"
          ? {
              bundleId: manualSmsBundle!.id,
              provider: method,
              transactionId: reference,
              confirmTransactionId: confirmation,
            }
          : {
              planCode: selectedPlanCode || "PRO_3M",
              provider: method,
              transactionId: reference,
              confirmTransactionId: confirmation,
            };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...authHeaders(session),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = await readApiJson<{
        payment?: PaymentRow;
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setSubmittedManualPayment({
        plan:
          manualPaymentKind === "sms" && manualSmsBundle
            ? planForSmsBundle(manualSmsBundle)
            : selectedPlan,
        branchName: targetBranch.branchName,
        paymentMethod: paymentMethodOption,
        transactionId: reference.toUpperCase(),
        submittedAt: payload.payment?.date ?? new Date().toISOString(),
      });
      setTransactionId("");
      setConfirmTransactionId("");
      await Promise.all([
        loadSummary(),
        loadPayments(),
        manualPaymentKind === "sms"
          ? loadSmsWallet(targetBranch.branchId)
          : Promise.resolve(),
      ]);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmittingManualPayment(false);
      setPayingBranchId(null);
    }
  }

  function handleSubscribe() {
    openManualPayment(selectedPlanCode || "PRO_3M");
  }

  if (!ready || !session || !workspace || !user) {
    return <AppBootSkeleton />;
  }

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
      : (focusedBranch?.canCheckout ??
          summary?.branches.some((b) => b.canCheckout)),
  );
  const subscribePaying =
    submittingManualPayment &&
    payingBranchId != null &&
    (payingBranchId === focusedBranch?.branchId ||
      (mode === "manager" &&
        payingBranchId === summary?.branches[0]?.branchId));
  const manualPaymentPlan =
    manualPaymentKind === "sms" && manualSmsBundle
      ? planForSmsBundle(manualSmsBundle)
      : selectedPlan;
  const activePendingManualPayment =
    paymentPanelOpen && !submittedManualPayment
      ? manualPaymentKind === "sms"
        ? pendingManualSmsPaymentFor(
            manualSmsBundle?.id,
            focusedBranch?.branchId,
          )
        : pendingManualPaymentFor(selectedPlan.code, focusedBranch?.branchId)
      : null;

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
                          onClick={() => {
                            setSelectedPlanCode(plan.code);
                            if (canSubscribe) openManualPayment(plan.code);
                          }}
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
                              Save{" "}
                              {formatMoney(plan.savingsAmount, plan.currency)}
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
                {activeTab === "sms"
                  ? "SMS payment history"
                  : "Billing history"}
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
                <option value="Cancelled">Cancelled</option>
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
                      const cancelling = cancellingPaymentId === row.id;
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
                            {!isSms && isPaid ? (
                              <button
                                type="button"
                                onClick={() =>
                                  showPaymentResult(row, "success")
                                }
                                className="inline-flex h-8 min-w-[4.5rem] items-center justify-center rounded-full border border-[#07885f] px-3 text-[11px] font-semibold text-[#07885f] hover:bg-[#f3faf6]"
                              >
                                View
                              </button>
                            ) : row.status === "Pending" && row.canCancel ? (
                              <button
                                type="button"
                                disabled={cancelling}
                                onClick={() =>
                                  void cancelPendingPayment(row.id)
                                }
                                className="inline-flex h-8 min-w-[4.5rem] items-center justify-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-70"
                              >
                                {cancelling ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : null}
                                Cancel
                              </button>
                            ) : failed ? (
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
                                  showPaymentResult(row, "failed");
                                }}
                                className="inline-flex h-8 min-w-[4.5rem] items-center justify-center gap-1 rounded-full bg-rose-600 px-3 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-70"
                              >
                                {retrying ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : null}
                                Review
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                —
                              </span>
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
      {paymentPanelOpen ? (
        <PaymentOverlay wide onClose={closePaymentOverlay}>
          {submittedManualPayment ? (
            <ManualPaymentSubmittedPanel
              submission={submittedManualPayment}
              onDone={closePaymentOverlay}
            />
          ) : (
            <ManualMerchantPaymentPanel
              plan={manualPaymentPlan}
              branchName={branchName}
              selectedMethod={selectedPaymentMethod}
              transactionId={transactionId}
              confirmTransactionId={confirmTransactionId}
              submitting={submittingManualPayment}
              pendingPayment={activePendingManualPayment}
              cancellingPending={
                activePendingManualPayment
                  ? cancellingPaymentId === activePendingManualPayment.id
                  : false
              }
              onClose={closePaymentOverlay}
              onCancelPending={(paymentId) =>
                void cancelPendingPayment(paymentId)
              }
              onSelectMethod={(method) => {
                setSelectedPaymentMethod(method);
                setSubmittedManualPayment(null);
                setError(null);
              }}
              onTransactionIdChange={setTransactionId}
              onConfirmTransactionIdChange={setConfirmTransactionId}
              onSubmit={() => void submitManualPayment()}
            />
          )}
        </PaymentOverlay>
      ) : null}
      {paymentResultOverlay ? (
        <SubscriptionPaymentResultOverlay
          result={paymentResultOverlay}
          onClose={closePaymentResultOverlay}
          onTryAgain={() => {
            const row = paymentResultOverlay.payment;
            closePaymentResultOverlay();
            openManualPayment(row.planCode ?? selectedPlanCode, row.branchId);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function PaymentOverlay({
  children,
  wide = false,
  onClose,
}: {
  children: ReactNode;
  wide?: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#020617]/55 px-3 py-6 backdrop-blur-[2px] sm:px-6 sm:py-10">
      <button
        type="button"
        aria-label="Close payment overlay"
        className="fixed inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        className={`relative mx-auto ${wide ? "max-w-6xl" : "max-w-[40rem]"}`}
      >
        {children}
      </div>
    </div>
  );
}

function ManualMerchantPaymentPanel({
  plan,
  branchName,
  selectedMethod,
  transactionId,
  confirmTransactionId,
  submitting,
  pendingPayment,
  cancellingPending,
  onClose,
  onCancelPending,
  onSelectMethod,
  onTransactionIdChange,
  onConfirmTransactionIdChange,
  onSubmit,
}: {
  plan: BillingPlanOption;
  branchName: string;
  selectedMethod: ManualPaymentMethod | null;
  transactionId: string;
  confirmTransactionId: string;
  submitting: boolean;
  pendingPayment: PaymentRow | null;
  cancellingPending: boolean;
  onClose: () => void;
  onCancelPending: (paymentId: string) => void;
  onSelectMethod: (method: ManualPaymentMethod) => void;
  onTransactionIdChange: (value: string) => void;
  onConfirmTransactionIdChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const method = manualPaymentMethodById(selectedMethod);
  const amountLabel = formatMoney(plan.amount, plan.currency);
  const isSmsPayment = isSmsBundlePlan(plan);
  const hasTransactionId = transactionId.trim().length > 0;
  const hasConfirmTransactionId = confirmTransactionId.trim().length > 0;
  const idsMismatch =
    hasTransactionId &&
    hasConfirmTransactionId &&
    compactManualTransactionId(transactionId) !==
      compactManualTransactionId(confirmTransactionId);
  const canSubmit =
    hasTransactionId && hasConfirmTransactionId && !idsMismatch && !submitting;

  return (
    <section
      aria-label={`Complete payment for ${branchName}`}
      className="relative rounded-2xl border border-[#e6ebf0] bg-white px-4 py-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:px-7 sm:py-6"
    >
      <button
        type="button"
        aria-label="Close payment"
        onClick={onClose}
        className="absolute right-5 top-5 grid size-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-[#070b18]"
      >
        <X className="size-5" />
      </button>
      <div>
        <h2 className="text-2xl font-bold tracking-normal text-[#070b18]">
          Complete your payment
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Pay using MTN MoMo or Airtel Money, then enter your transaction ID to
          verify your payment and{" "}
          {isSmsPayment
            ? "credit your SMS wallet."
            : "activate your subscription."}
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-[#e6ebf0] bg-white p-4 sm:p-6">
        {pendingPayment ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-base font-bold text-[#070b18]">
                  Payment verification already pending
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">
                  Cancel this pending request before submitting another
                  transaction ID for the same purchase.
                </p>
              </div>
              <button
                type="button"
                disabled={cancellingPending}
                onClick={() => onCancelPending(pendingPayment.id)}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-4 text-sm font-bold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancellingPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Cancel request
              </button>
            </div>

            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-white/80 px-3 py-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-amber-700">
                  Payment method
                </dt>
                <dd className="mt-1 font-bold text-[#070b18]">
                  {pendingPayment.paymentMethod || "Mobile Money"}
                </dd>
              </div>
              <div className="rounded-lg bg-white/80 px-3 py-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-amber-700">
                  Transaction ID
                </dt>
                <dd className="mt-1 font-bold text-[#070b18]">
                  {pendingPayment.transactionId || "Submitted"}
                </dd>
              </div>
              <div className="rounded-lg bg-white/80 px-3 py-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-amber-700">
                  Submitted on
                </dt>
                <dd className="mt-1 font-bold text-[#070b18]">
                  {formatPaymentSubmittedAt(pendingPayment.date)}
                </dd>
              </div>
              <div className="rounded-lg bg-white/80 px-3 py-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-amber-700">
                  Amount
                </dt>
                <dd className="mt-1 font-bold tabular-nums text-[#07885f]">
                  {formatMoney(pendingPayment.amount, pendingPayment.currency)}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <div>
            <div>
              <h3 className="text-base font-bold text-[#070b18]">
                1. Choose payment method
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Select the mobile money provider you will use to make the
                payment.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {MANUAL_PAYMENT_METHODS.map((item) => {
                  const selected = item.id === selectedMethod;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelectMethod(item.id)}
                      className={`relative flex min-h-[118px] items-center gap-6 rounded-lg border bg-white px-6 text-left transition ${
                        selected
                          ? "border-[#07885f] shadow-[0_8px_18px_rgba(7,136,95,0.08)]"
                          : "border-[#dfe5eb] hover:border-[#07885f]/50"
                      }`}
                    >
                      <span className="grid size-[68px] shrink-0 place-items-center overflow-hidden rounded-lg bg-white">
                        <Image
                          src={item.logoSrc}
                          alt={item.logoAlt}
                          width={68}
                          height={68}
                          className="h-[68px] w-[68px] object-contain"
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-lg font-bold text-[#070b18]">
                          {item.title}
                        </span>
                        <span className="mt-2 block text-sm text-slate-600">
                          {item.subtitle}
                        </span>
                      </span>
                      <span
                        className={`absolute right-5 top-5 grid size-6 place-items-center rounded-full border ${
                          selected
                            ? "border-[#07885f] bg-[#07885f] text-white"
                            : "border-slate-300 bg-white"
                        }`}
                        aria-hidden
                      >
                        {selected ? (
                          <Check className="size-4" strokeWidth={3} />
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {method ? (
              <div className="mt-6 border-t border-[#eef2f6] pt-5">
                <h3 className="text-base font-bold text-[#070b18]">
                  2. Payment instructions
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Use the details below to make your payment to{" "}
                  {PAYMENT_ACCOUNT_NAME}.
                </p>

                <div className="mt-5 flex flex-col gap-4 rounded-lg border border-[#e6ebf0] bg-[#fbfdfc] p-5 md:flex-row md:items-center">
                  <span className="grid size-[72px] shrink-0 place-items-center overflow-hidden rounded-full bg-white">
                    <Image
                      src={method.logoSrc}
                      alt={method.logoAlt}
                      width={72}
                      height={72}
                      className="h-[72px] w-[72px] object-contain"
                    />
                  </span>
                  <dl className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
                    <div className="sm:border-r sm:border-[#dfe5eb]">
                      <dt className="text-xs font-medium text-slate-500">
                        Merchant Code
                      </dt>
                      <dd className="mt-2 text-lg font-bold tabular-nums text-[#070b18]">
                        {method.merchantCode}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">
                        Account Name
                      </dt>
                      <dd className="mt-2 text-lg font-bold text-[#070b18]">
                        {method.accountName}
                      </dd>
                    </div>
                  </dl>
                  {method.qrSrc ? (
                    <div className="rounded-lg border border-[#e6ebf0] bg-white p-3 text-center md:w-[150px]">
                      <Image
                        src={method.qrSrc}
                        alt={`${method.title} merchant QR code`}
                        width={132}
                        height={258}
                        className="mx-auto max-h-[190px] w-auto object-contain"
                      />
                    </div>
                  ) : null}
                  <div className="rounded-lg border border-[#e6ebf0] bg-white px-8 py-5 text-center md:min-w-[230px]">
                    <p className="text-xs font-medium text-slate-500">
                      Pay this amount
                    </p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-[#07885f]">
                      {amountLabel}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[#070b18]">
                      {paymentPeriodLabel(plan)}
                    </p>
                  </div>
                </div>

                <p className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                  <Info className="size-4 shrink-0 text-[#07885f]" />
                  Please ensure you pay the exact amount using the details
                  above.
                </p>

                <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
                  <form
                    className="rounded-lg border border-[#e6ebf0] bg-white p-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onSubmit();
                    }}
                  >
                    <h4 className="text-lg font-bold text-[#070b18]">
                      Already made the payment?
                    </h4>
                    <p className="mt-2 text-sm text-slate-600">
                      Enter the transaction ID from your payment confirmation
                      message to verify your payment.
                    </p>
                    <label className="mt-5 block text-sm font-semibold text-[#070b18]">
                      Transaction ID
                      <span className="relative mt-2 block">
                        <input
                          value={transactionId}
                          onChange={(event) =>
                            onTransactionIdChange(event.target.value)
                          }
                          placeholder="Enter transaction ID"
                          className="h-11 w-full rounded-md border border-[#dfe5eb] bg-white px-3 pr-10 text-sm text-[#070b18] outline-none transition placeholder:text-slate-400 focus:border-[#07885f] focus:ring-2 focus:ring-[#07885f]/15"
                        />
                        <Info className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                      </span>
                    </label>
                    <label className="mt-4 block text-sm font-semibold text-[#070b18]">
                      Confirm transaction ID
                      <span className="relative mt-2 block">
                        <input
                          value={confirmTransactionId}
                          onChange={(event) =>
                            onConfirmTransactionIdChange(event.target.value)
                          }
                          placeholder="Re-enter transaction ID"
                          className={`h-11 w-full rounded-md border bg-white px-3 pr-10 text-sm text-[#070b18] outline-none transition placeholder:text-slate-400 focus:ring-2 ${
                            idsMismatch
                              ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                              : "border-[#dfe5eb] focus:border-[#07885f] focus:ring-[#07885f]/15"
                          }`}
                        />
                        {hasConfirmTransactionId && !idsMismatch ? (
                          <Check className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#07885f]" />
                        ) : (
                          <Info className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                        )}
                      </span>
                    </label>
                    {idsMismatch ? (
                      <p className="mt-2 text-sm font-semibold text-rose-600">
                        Transaction IDs do not match.
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#07885f] text-base font-bold text-white shadow-[0_12px_24px_rgba(7,136,95,0.18)] transition hover:bg-[#067352] disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {submitting ? (
                        <Loader2 className="size-5 animate-spin" />
                      ) : (
                        <Lock className="size-5" />
                      )}
                      Verify payment
                    </button>
                  </form>

                  <div className="rounded-lg bg-[#f7fbf8] p-5">
                    <div className="flex items-start gap-4">
                      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#e9f8ef] text-[#07885f]">
                        <Headphones className="size-6" />
                      </span>
                      <div>
                        <h4 className="text-lg font-bold text-[#070b18]">
                          Having trouble with your payment?
                        </h4>
                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          If you have any issue with your{" "}
                          {isSmsPayment ? "SMS purchase" : "subscription"},
                          contact support
                        </p>
                        <div className="mt-6 space-y-4 text-base text-[#070b18]">
                          <p className="flex items-center gap-3">
                            <Phone className="size-5 text-[#07885f]" />
                            <span>Call: {PAYMENT_SUPPORT_PHONE}</span>
                          </p>
                          <p className="flex items-center gap-3">
                            <Mail className="size-5 text-[#07885f]" />
                            <span>Email: {PAYMENT_SUPPORT_EMAIL}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="mt-8 flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
                  <Lock className="size-4" />
                  Your payment is secure. We will verify and{" "}
                  {isSmsPayment
                    ? "credit your SMS wallet"
                    : "activate your subscription"}{" "}
                  after confirmation.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function ManualPaymentSubmittedPanel({
  submission,
  onDone,
}: {
  submission: ManualPaymentSubmission;
  onDone: () => void;
}) {
  const amountLabel = formatMoney(
    submission.plan.amount,
    submission.plan.currency,
  );
  const isSmsPayment = isSmsBundlePlan(submission.plan);

  return (
    <section
      aria-label="Payment submitted"
      className="rounded-2xl border border-[#e6ebf0] bg-white px-4 py-8 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:px-8 sm:py-10"
    >
      <div className="mx-auto max-w-[58rem] text-center">
        <div className="relative mx-auto grid size-[96px] place-items-center rounded-full bg-[#eef8f2] text-[#07885f]">
          <Clock3 className="size-14" strokeWidth={2.5} />
          <span className="absolute right-5 top-5 size-2.5 rounded-full bg-[#f4c542]" />
          <span className="absolute bottom-6 right-7 size-2 rounded-full bg-[#f4c542]" />
        </div>
        <h2 className="mt-5 text-3xl font-bold tracking-normal text-[#070b18]">
          Payment submitted
        </h2>
        <p className="mt-2 text-2xl font-bold text-[#b47a00]">
          Verification pending
        </p>
        <p className="mx-auto mt-5 max-w-[40rem] text-base leading-7 text-slate-600">
          Your payment has been submitted for verification. We'll confirm your
          payment and{" "}
          {isSmsPayment
            ? "credit your SMS wallet"
            : "activate your subscription"}{" "}
          once the verification is complete.
        </p>
      </div>

      <div className="mx-auto mt-9 max-w-[52rem] overflow-hidden rounded-lg border border-[#e6ebf0] bg-white">
        <div className="flex flex-col gap-4 border-b border-[#edf1f5] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#e8f7ee] text-[#07885f]">
              <CalendarDays className="size-7" />
            </span>
            <div className="text-left">
              <h3 className="text-lg font-bold text-[#070b18]">
                {paymentPeriodLabel(submission.plan)}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {paymentPlanAccessCopy(submission.plan)}
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-sm font-medium text-slate-500">Amount</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-[#07885f]">
              {amountLabel}
            </p>
          </div>
        </div>

        <div className="px-6">
          <SubmittedPaymentRow
            icon={<CreditCard className="size-5" />}
            label="Payment method"
            value={submission.paymentMethod.title}
          />
          <SubmittedPaymentRow
            icon={<ReceiptText className="size-5" />}
            label="Transaction ID"
            value={submission.transactionId}
          />
          <SubmittedPaymentRow
            icon={<Clock3 className="size-5" />}
            label="Submitted on"
            value={formatPaymentSubmittedAt(submission.submittedAt)}
          />
          <SubmittedPaymentRow
            icon={<Clock3 className="size-5" />}
            label="Status"
            value={
              <span className="rounded-md bg-[#fff3d8] px-3 py-1.5 text-sm font-semibold text-[#9a6a00]">
                Pending verification
              </span>
            }
            last
          />
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-[52rem] rounded-lg bg-[#f8fbfa] px-5 py-4 text-center text-sm font-medium text-slate-600">
        <span className="inline-flex items-center justify-center gap-3">
          <Info className="size-5 text-[#07885f]" />
          You will be notified in-app once your{" "}
          {isSmsPayment ? "SMS credits are ready" : "subscription is active"}.
        </span>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-12 min-w-[10rem] items-center justify-center gap-3 rounded-lg border border-[#07885f] bg-white px-7 text-lg font-bold text-[#07885f] transition hover:bg-[#f3faf6]"
        >
          <CheckCircle2 className="size-6" />
          Done
        </button>
      </div>
    </section>
  );
}

function SubmittedPaymentRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`grid gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center ${
        last ? "" : "border-b border-[#edf1f5]"
      }`}
    >
      <div className="flex items-center gap-4 text-left">
        <span className="text-slate-500">{icon}</span>
        <span className="text-base font-semibold text-[#070b18]">{label}</span>
      </div>
      <div className="text-left text-base font-medium text-[#070b18] sm:text-right">
        {value}
      </div>
    </div>
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
        : status === "Cancelled"
          ? "bg-slate-100 text-slate-700 ring-slate-200"
          : "bg-amber-50 text-amber-900 ring-amber-200";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${tone}`}
    >
      {status}
    </span>
  );
}
