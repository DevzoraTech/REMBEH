"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Banknote } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/app/app-shell";
import { AppBootSkeleton, TableSkeleton } from "../../components/app/skeleton";
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

export type OwnerBranch = {
  id: string;
  name: string;
  address: string;
  gpsLatitude?: string | number | null;
  gpsLongitude?: string | number | null;
  phone?: string | null;
  workingHours?: unknown;
  createdAt: string;
  manager: {
    id: string;
    roleName?: string;
    name: string;
    email: string;
    phone: string | null;
    inviteStatus: string;
    status: string;
    invitedAt?: string | null;
    inviteExpiresAt?: string | null;
  } | null;
  staff?: Array<{
    id: string;
    branchId: string;
    roleName: string;
    name: string;
    email: string;
    phone: string | null;
    publicId: string | null;
    status: string;
    inviteStatus: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    invitedAt: string | null;
    inviteExpiresAt: string | null;
  }>;
  staffSummary: {
    total: number;
    active: number;
    pendingInvites: number;
    expiredInvites: number;
  };
};

export type OwnerLoan = {
  id: string;
  customerId: string;
  borrowerName: string;
  phone: string;
  nationalId: string | null;
  loanTypeName: string | null;
  status: string;
  principal: number;
  disbursedAmount?: number;
  pendingDisbursementAmount?: number;
  disbursementCount?: number;
  balance: number;
  paidAmount: number;
  openingBalance?: number | null;
  finesTotal?: number;
  /** openingBalance + finesTotal (API); prefer over client recomputation. */
  totalRepayable?: number;
  expectedInterest?: number;
  processingFee?: number;
  installmentAmount: number;
  overdueDays?: number;
  nextDueLabel?: string;
  nextDueIsToday?: boolean;
  paidTodayAmount?: number;
  dueDayCoverage?:
    | "due_paid"
    | "due_unpaid"
    | "overdue_paid"
    | "overdue_unpaid"
    | "none";
  nextDueDate?: string | null;
  currency: string;
  officerName: string | null;
  branchId: string;
  paymentStartDate: string | null;
  durationDays: number | null;
  dueDate: string | null;
  createdAt: string;
  disbursedAt: string | null;
  updatedAt: string;
  reminder?: {
    status: "sent" | "not_sent" | "queued" | "sending" | "failed";
    lastSentAt: string | null;
    lastFailureReason: string | null;
    canResend: boolean;
    activeBatchId: string | null;
  };
};

/** Full obligation: prefer API totalRepayable, else opening + fines, else balance + paid. */
export function loanTotalRepayable(loan: {
  totalRepayable?: number;
  openingBalance?: number | null;
  finesTotal?: number;
  balance: number;
  paidAmount: number;
}) {
  if (typeof loan.totalRepayable === "number") {
    return Math.max(0, loan.totalRepayable);
  }
  if (typeof loan.openingBalance === "number") {
    return Math.max(0, loan.openingBalance) + Math.max(0, loan.finesTotal ?? 0);
  }
  return Math.max(0, loan.balance) + Math.max(0, loan.paidAmount);
}

/** Schedule-overdue when API overdueDays is present; else maturity fallback. */
export function isLoanScheduleOverdue(loan: {
  status: string;
  balance: number;
  overdueDays?: number;
  dueDate?: string | null;
}) {
  if (loan.balance <= 0 || loan.status === "CLOSED") return false;
  if (typeof loan.overdueDays === "number") return loan.overdueDays >= 1;
  if (loan.status === "IN_ARREARS") return true;
  if (!loan.dueDate) return false;
  const due = new Date(loan.dueDate);
  due.setHours(23, 59, 59, 999);
  return due < new Date();
}

export type OwnerBorrower = {
  id: string;
  branchId: string;
  branchName: string | null;
  fullName: string;
  phone: string;
  nationalId: string | null;
  email?: string | null;
  collateralType: string | null;
  city: string | null;
  loanCount: number;
  activeLoanCount?: number;
  activeLoanId?: string | null;
  hasOverdueLoan?: boolean;
  registeredByName?: string | null;
  registeredByPublicId?: string | null;
  verifiedAt: string | null;
  verificationStatus?: "VERIFIED" | "NOT_VERIFIED" | "ISSUE";
  voidedAt?: string | null;
  voidDisposition?: "BLACKLISTED" | "WARNING" | null;
  voidReason?: string | null;
  createdAt: string;
};

export type OwnerRepayment = {
  id: string;
  loanId: string;
  customerId: string;
  clientName: string;
  phone: string;
  amount: number;
  amountPaid: number;
  loanAmount: number;
  recordedAt: string;
  method: string;
  recordedByName: string;
  sms?: {
    status: "not_sent" | "sending" | "sent" | "failed";
    messageId: string | null;
    lastSentAt: string | null;
    lastFailureReason: string | null;
    canRetry: boolean;
  };
};

export type OwnerReport = {
  id: string;
  operationId: string;
  branchId: string;
  branchName: string;
  reportNumber: string;
  operationDate: string;
  status: string;
  generatedAt: string;
  managerReviewedAt: string | null;
  managerReviewedByName: string | null;
  managerNotes?: string | null;
  ownerApprovedAt: string | null;
  ownerApprovedByName: string | null;
  ownerNotes?: string | null;
  returnedAt?: string | null;
  returnedByName?: string | null;
  returnNotes?: string | null;
  expectedClosingBalance: number;
  closingBalance: number | null;
  closingVariance: number | null;
  loansIssuedCount: number;
  loansIssuedPrincipal: number;
  collectionsReceived: number;
  processingFeesTotal: number;
  expensesTotal: number;
  cashReturnedByAgents: number;
  snapshot: unknown;
};

export type OwnerBranchDailyStatus = {
  branchId: string;
  branchName: string;
  operationDate: string;
  operationId: string | null;
  operationStatus: "OPEN" | "CLOSING" | "CLOSED" | null;
  openedAt: string | null;
  closedAt: string | null;
  reportId: string | null;
  reportNumber: string | null;
  reportStatus:
    | "MANAGER_REVIEW"
    | "SENT_TO_OWNER"
    | "OWNER_APPROVED"
    | "RETURNED_TO_MANAGER"
    | null;
  reportGeneratedAt: string | null;
  managerReviewedAt: string | null;
};

export type OwnerSessionState = {
  session: RembehSession | null;
  workspace: RembehWorkspace | null;
  user: RembehUser | null;
  ready: boolean;
};

export function useOwnerSession(nextPath = "/owner"): OwnerSessionState {
  const router = useRouter();
  const [state, setState] = useState<OwnerSessionState>({
    session: null,
    workspace: null,
    user: null,
    ready: false,
  });

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

        if (resolveOperatorRole(activeSession, auth.user) !== "owner") {
          router.replace("/dashboard");
          return;
        }

        setState({
          session: activeSession,
          workspace: auth.workspace,
          user: auth.user,
          ready: true,
        });
      })();
    }, 0);

    return () => window.clearTimeout(boot);
  }, [nextPath, router]);

  return state;
}

export function OwnerPage({
  state,
  title,
  eyebrow,
  actions,
  children,
}: {
  state: OwnerSessionState;
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  if (!state.ready || !state.session) return <AppBootSkeleton />;

  return (
    <AppShell
      session={state.session}
      workspace={state.workspace}
      user={state.user}
      branch={null}
    >
      <div className="mx-auto max-w-7xl space-y-5 animate-rise">
        <div className="panel flex flex-wrap items-end justify-between gap-3 overflow-hidden px-4 py-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--forest-emerald)]">
              {eyebrow ?? "Owner"}
            </p>
            <h1 className="mt-0.5 text-2xl font-extrabold text-[var(--midnight-navy)]">
              {title}
            </h1>
          </div>
          {actions ? (
            <div className="flex items-center gap-2">{actions}</div>
          ) : null}
        </div>
        {children}
      </div>
    </AppShell>
  );
}

export function OwnerStat({
  icon,
  label,
  value,
  detail,
  tone = "green",
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  detail?: string;
  tone?: "green" | "blue" | "gold" | "red" | "slate";
}) {
  const toneClass = {
    green: "border-emerald-100 bg-emerald-50 text-[var(--forest-emerald)]",
    blue: "border-sky-100 bg-sky-50 text-sky-700",
    gold: "border-amber-100 bg-amber-50 text-amber-700",
    red: "border-rose-100 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  }[tone];
  const valueClass = {
    green: "text-[var(--forest-emerald)]",
    blue: "text-[var(--clear-sky)]",
    gold: "text-amber-700",
    red: "text-red-700",
    slate: "text-[var(--midnight-navy)]",
  }[tone];

  return (
    <div className="panel flex min-h-[76px] min-w-0 items-start gap-1.5 bg-white px-1.5 py-2 shadow-[0_8px_20px_rgba(20,33,61,0.05)] sm:gap-2 sm:px-2 xl:px-3">
      <span
        className={`hidden size-7 shrink-0 place-items-center border md:grid xl:size-8 ${toneClass}`}
      >
        {icon ?? <Banknote className="size-4" />}
      </span>
      <div className="min-w-0">
        <p className="text-[8px] font-semibold tracking-[0.06em] text-slate-500 sm:text-[9px] xl:text-[10px]">
          {label}
        </p>
        <p
          className={`mt-1 break-words text-[clamp(0.55rem,1.15vw,1rem)] font-bold leading-tight tabular-nums ${valueClass}`}
        >
          {value}
        </p>
        {detail ? (
          <p className="mt-0.5 truncate text-[clamp(0.5rem,0.9vw,0.7rem)] leading-tight text-slate-500">
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function OwnerPanel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--table-head)] px-3 py-2.5">
        <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
          {title}
        </h2>
        {meta ? (
          <p className="text-xs font-semibold text-slate-500">{meta}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function OwnerTableState({
  loading,
  empty,
  children,
}: {
  loading: boolean;
  empty: boolean;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="p-3">
        <TableSkeleton rows={5} columns={6} />
      </div>
    );
  }
  if (empty) {
    return (
      <div className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
        Nothing to show for this view.
      </div>
    );
  }
  return <>{children}</>;
}

export function OwnerStatus({ value }: { value: string }) {
  const normalized = value.replaceAll("_", " ").toLowerCase();
  const tone = value.includes("APPROVED")
    ? "border-emerald-200 bg-emerald-50 text-[var(--forest-emerald)]"
    : value.includes("RETURNED") || value.includes("OVERDUE")
      ? "border-red-200 bg-red-50 text-red-700"
      : value.includes("SENT") || value.includes("ACTIVE")
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span
      className={`inline-flex rounded-lg border px-2 py-1 text-[11px] font-bold ${tone}`}
    >
      {titleCase(normalized)}
    </span>
  );
}

export function authHeaders(session: RembehSession) {
  return {
    Authorization: `${session.tokenType} ${session.accessToken}`,
  };
}

export async function ownerFetch<T>(session: RembehSession, path: string) {
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

/** Plain-string money for exports, toasts, and non-React text. */
export function formatMoney(
  value: number | null | undefined,
  currency = "UGX",
) {
  return `${currency} ${formatMoneyAmount(value)}`;
}

/** Numeric amount only (no currency code). */
export function formatMoneyAmount(value: number | null | undefined) {
  return Math.round(value ?? 0).toLocaleString("en-UG");
}

export function formatNumber(value: number | null | undefined) {
  return formatMoneyAmount(value);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function todayLabel() {
  return new Date().toISOString().slice(0, 10);
}

export function previousDateLabel(date = new Date()) {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  const year = previous.getFullYear();
  const month = String(previous.getMonth() + 1).padStart(2, "0");
  const day = String(previous.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sumBy<T>(items: T[], pick: (item: T) => number) {
  return items.reduce((sum, item) => sum + pick(item), 0);
}

export function useOwnerSearch<T>(
  items: T[],
  query: string,
  pick: (item: T) => Array<string | null | undefined>,
) {
  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      pick(item).some((value) => (value ?? "").toLowerCase().includes(needle)),
    );
  }, [items, pick, query]);
}
