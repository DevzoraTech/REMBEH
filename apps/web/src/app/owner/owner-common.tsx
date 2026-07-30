"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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
  balance: number;
  paidAmount: number;
  installmentAmount: number;
  currency: string;
  officerName: string | null;
  branchId: string;
  dueDate: string | null;
  createdAt: string;
  disbursedAt: string | null;
};

export type OwnerBorrower = {
  id: string;
  branchId: string;
  branchName: string | null;
  fullName: string;
  phone: string;
  nationalId: string | null;
  collateralType: string | null;
  city: string | null;
  loanCount: number;
  verifiedAt: string | null;
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
  ownerApprovedAt: string | null;
  ownerApprovedByName: string | null;
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
      const auth = readAuthState();
      if (!auth.session || isSessionExpired(auth.session)) {
        clearAuthState();
        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      if (resolveOperatorRole(auth.session, auth.user) !== "owner") {
        router.replace("/dashboard");
        return;
      }

      setState({
        session: auth.session,
        workspace: auth.workspace,
        user: auth.user,
        ready: true,
      });
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
      <div className="mx-auto max-w-7xl space-y-4 animate-rise">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--forest-emerald)]">
              {eyebrow ?? "Owner"}
            </p>
            <h1 className="text-2xl font-bold text-[var(--midnight-navy)]">
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
  label,
  value,
  detail,
  tone = "green",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "green" | "blue" | "gold" | "red" | "slate";
}) {
  const toneClass = {
    green: "bg-emerald-50 text-[var(--forest-emerald)]",
    blue: "bg-sky-50 text-sky-700",
    gold: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-50 text-slate-700",
  }[tone];

  return (
    <div className="min-w-0 border border-[var(--line)] bg-white p-3 shadow-[0_10px_24px_rgba(20,33,61,0.06)]">
      <div className={`mb-2 h-1.5 w-10 rounded-full ${toneClass}`} />
      <p className="truncate text-[11px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-bold tabular-nums text-[var(--midnight-navy)]">
        {value}
      </p>
      {detail ? (
        <p className="mt-1 truncate text-xs text-slate-500">{detail}</p>
      ) : null}
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
    <section className="overflow-hidden border border-[var(--line)] bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--soft-mist)] px-3 py-2">
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
      className={`inline-flex border px-2 py-1 text-[11px] font-bold ${tone}`}
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

export function formatMoney(
  value: number | null | undefined,
  currency = "UGX",
) {
  return `${currency} ${Math.round(value ?? 0).toLocaleString("en-UG")}`;
}

export function formatNumber(value: number | null | undefined) {
  return Math.round(value ?? 0).toLocaleString("en-UG");
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
