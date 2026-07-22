"use client";

import { Building2, Loader2, Smartphone, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app/app-shell";
import { LiveApplicationsPanel } from "../../components/app/live-applications-panel";
import { LivePaymentsPanel } from "../../components/app/live-payments-panel";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  canRefreshSession,
  clearAuthState,
  isSessionExpired,
  readAuthState,
  refreshAuthSession,
} from "../../lib/auth-session";
import { resolveOperatorRole } from "../../lib/roles";

type Branch = {
  id: string;
  name: string;
  address: string;
  manager?: {
    name: string;
    inviteStatus: string;
  } | null;
  staffSummary?: {
    active: number;
    pendingInvites: number;
  };
};

type LoanRow = {
  status: string;
  balance: number;
  currency: string;
};

type CollectionSummary = {
  amountCollectedToday: number;
  repaymentsTodayCount: number;
  dueTodayCount: number;
};

type DashboardStats = {
  activeLoans: number | null;
  completedLoans: number | null;
  outstanding: number | null;
  collectedToday: number | null;
  dueToday: number | null;
  repaymentsToday: number | null;
  currency: string;
};

const ACTIVE_LOAN_STATUSES = new Set([
  "SUBMITTED",
  "APPROVED",
  "DISBURSED",
  "CURRENT",
  "IN_ARREARS",
  "RESTRUCTURED",
]);

const COMPLETED_LOAN_STATUSES = new Set(["CLOSED"]);

const emptyStats: DashboardStats = {
  activeLoans: null,
  completedLoans: null,
  outstanding: null,
  collectedToday: null,
  dueToday: null,
  repaymentsToday: null,
  currency: "UGX",
};

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const operatorRole = useMemo(
    () => (session ? resolveOperatorRole(session, user) : "staff"),
    [session, user],
  );

  const clearSessionAndRedirect = useCallback(() => {
    clearAuthState();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void (async () => {
        const auth = readAuthState();
        let activeSession = auth.session;

        if (!activeSession) {
          clearSessionAndRedirect();
          return;
        }

        if (isSessionExpired(activeSession)) {
          if (canRefreshSession(activeSession)) {
            activeSession =
              (await refreshAuthSession(activeSession, apiBaseUrl)) ?? null;
          } else {
            activeSession = null;
          }
        }

        if (!activeSession) {
          clearSessionAndRedirect();
          return;
        }

        setSession(activeSession);
        setWorkspace(auth.workspace);
        setUser(auth.user);
        setBranch(auth.branch);
        setStats((current) => ({
          ...current,
          currency: auth.workspace?.currency ?? current.currency,
        }));

        const role = resolveOperatorRole(activeSession, auth.user);

        if (role === "staff") {
          setIsLoading(false);
          return;
        }

        void Promise.all([
          activeSession.permissions.includes("branch.read")
            ? fetch(`${apiBaseUrl}/branches`, {
                headers: {
                  Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
                },
              }).then(async (response) => {
                const payload = await readApiJson<{
                  branches?: Branch[];
                  message?: string | string[];
                }>(response);
                if (!response.ok) {
                  throw new Error(formatApiError(payload.message));
                }
                setBranches(payload.branches ?? []);
              })
            : Promise.resolve(),
          activeSession.permissions.includes("customer.read")
            ? fetch(`${apiBaseUrl}/customers`, {
                headers: {
                  Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
                },
              }).then(async (response) => {
                const payload = await readApiJson<{
                  customers?: unknown[];
                }>(response);
                if (response.ok) {
                  setCustomerCount(payload.customers?.length ?? 0);
                }
              })
            : Promise.resolve(),
          activeSession.permissions.includes("loan.read")
            ? fetch(`${apiBaseUrl}/loans`, {
                headers: {
                  Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
                },
              }).then(async (response) => {
                const payload = await readApiJson<{
                  loans?: LoanRow[];
                  message?: string | string[];
                }>(response);
                if (!response.ok) {
                  throw new Error(formatApiError(payload.message));
                }
                const loans = payload.loans ?? [];
                const activeLoans = loans.filter((loan) =>
                  ACTIVE_LOAN_STATUSES.has(loan.status),
                );
                setStats((current) => ({
                  ...current,
                  activeLoans: activeLoans.length,
                  completedLoans: loans.filter((loan) =>
                    COMPLETED_LOAN_STATUSES.has(loan.status),
                  ).length,
                  outstanding: roundMoney(
                    activeLoans.reduce((sum, loan) => sum + loan.balance, 0),
                  ),
                  currency:
                    loans[0]?.currency ??
                    auth.workspace?.currency ??
                    current.currency,
                }));
              })
            : Promise.resolve(),
          role === "manager" &&
          activeSession.permissions.includes("collection.read")
            ? fetch(`${apiBaseUrl}/collections/summary`, {
                headers: {
                  Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
                },
              }).then(async (response) => {
                const payload = await readApiJson<{
                  summary?: CollectionSummary;
                  message?: string | string[];
                }>(response);
                if (!response.ok) {
                  throw new Error(formatApiError(payload.message));
                }
                setStats((current) => ({
                  ...current,
                  collectedToday:
                    payload.summary?.amountCollectedToday ?? null,
                  dueToday: payload.summary?.dueTodayCount ?? null,
                  repaymentsToday:
                    payload.summary?.repaymentsTodayCount ?? null,
                }));
              })
            : Promise.resolve(),
        ])
          .catch((caughtError: unknown) => {
            setError(
              caughtError instanceof Error
                ? caughtError.message
                : "Could not load console.",
            );
          })
          .finally(() => {
            setIsLoading(false);
          });
      })();
    }, 0);

    return () => window.clearTimeout(boot);
  }, [clearSessionAndRedirect]);

  useEffect(() => {
    if (isLoading || !session || operatorRole !== "owner") {
      return;
    }

    if (branches.length === 0) {
      router.replace("/branches?setup=1&create=1");
    }
  }, [branches.length, isLoading, operatorRole, router, session]);

  if (!session || isLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-[var(--forest-emerald)]" />
      </main>
    );
  }

  const shellBranch =
    branch ??
    (branches[0]
      ? {
          id: branches[0].id,
          name: branches[0].name,
          address: branches[0].address,
        }
      : null);

  return (
    <AppShell
      session={session}
      workspace={workspace}
      user={user}
      branch={shellBranch}
    >
      <div className="mx-auto max-w-5xl space-y-3 animate-rise">
        {error ? (
          <div className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {operatorRole === "owner" ? (
          <OwnerView
            branches={branches}
            customerCount={customerCount}
            stats={stats}
            session={session}
          />
        ) : operatorRole === "manager" ? (
          <ManagerView
            branch={
              branches[0] ??
              (branch
                ? {
                    id: branch.id ?? "",
                    name: branch.name ?? "Branch",
                    address: branch.address ?? "",
                  }
                : null)
            }
            customerCount={customerCount}
            stats={stats}
            session={session}
          />
        ) : (
          <StaffView />
        )}
      </div>
    </AppShell>
  );
}

function OwnerView({
  branches,
  customerCount,
  stats,
  session,
}: {
  branches: Branch[];
  customerCount: number | null;
  stats: DashboardStats;
  session: RembehSession;
}) {
  return (
    <>
      <section className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="branches" value={String(branches.length)} />
        <Stat
          label="borrowers"
          value={numberStat(customerCount)}
        />
        <Stat
          label="active loans"
          value={numberStat(stats.activeLoans)}
        />
        <Stat
          label="outstanding"
          value={moneyStat(stats.outstanding, stats.currency)}
        />
        <Stat
          label="pending managers"
          value={String(
            branches.filter(
              (item) => item.manager?.inviteStatus === "INVITE_PENDING",
            ).length,
          )}
        />
      </section>

      <OwnerBranchesTable branches={branches} />

      <LiveApplicationsPanel
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        canRead={session.permissions.includes("loan.read")}
      />

      <LivePaymentsPanel
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        canRead={session.permissions.includes("collection.read")}
      />
    </>
  );
}

function ManagerView({
  branch,
  customerCount,
  stats,
  session,
}: {
  branch: Branch | null;
  customerCount: number | null;
  stats: DashboardStats;
  session: RembehSession;
}) {
  return (
    <>
      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="borrowers"
          value={numberStat(customerCount)}
        />
        <Stat label="active loans" value={numberStat(stats.activeLoans)} />
        <Stat
          label="completed loans"
          value={numberStat(stats.completedLoans)}
        />
        <Stat
          label="outstanding"
          value={moneyStat(stats.outstanding, stats.currency)}
        />
        <Stat
          label="collected today"
          value={moneyStat(stats.collectedToday, stats.currency)}
        />
        <Stat label="due today" value={numberStat(stats.dueToday)} />
        <Stat
          label="payments today"
          value={numberStat(stats.repaymentsToday)}
        />
        <Stat
          label="active staff"
          value={String(branch?.staffSummary?.active ?? 0)}
        />
        <Stat
          label="pending invites"
          value={String(branch?.staffSummary?.pendingInvites ?? 0)}
        />
      </section>

      <LiveApplicationsPanel
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        canRead={session.permissions.includes("loan.read")}
      />

      <LivePaymentsPanel
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        canRead={session.permissions.includes("collection.read")}
      />
    </>
  );
}

function StaffView() {
  return (
    <section className="mx-auto max-w-md border border-[var(--line)] bg-white px-5 py-10 text-center">
      <span className="mx-auto grid size-12 place-items-center border border-[var(--line)] bg-[var(--soft-mist)] text-[var(--forest-emerald)]">
        <Smartphone className="size-5" />
      </span>
      <h2 className="mt-4 font-[family-name:var(--font-display)] text-2xl tracking-[-0.02em] text-[var(--midnight-navy)]">
        Use REMBEH mobile
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Open REMBEH on mobile to continue.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-[var(--midnight-navy)]">
        <Building2 className="size-3.5 text-[var(--forest-emerald)]" />
        Continue on mobile
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel border-l-4 border-l-[var(--midnight-navy)] bg-white px-3 py-2.5 shadow-[0_8px_22px_rgba(20,33,61,0.05)]">
      <p className="text-[10px] font-semibold lowercase tracking-[0.1em] text-slate-500">
        {label.toLowerCase()}
      </p>
      <p className="mt-0.5 text-xl font-bold text-[var(--midnight-navy)]">
        {value}
      </p>
    </div>
  );
}

function numberStat(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-UG").format(value);
}

function moneyStat(value: number | null, currency: string) {
  if (value === null) return "—";
  return `${currency} ${new Intl.NumberFormat("en-UG", {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function OwnerBranchesTable({ branches }: { branches: Branch[] }) {
  return (
    <section className="panel overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[#eef3f0] px-3 py-2.5">
        <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
          Branches
        </h2>
        <Link href="/branches" className="btn btn-ghost h-8 text-xs">
          Manage
        </Link>
      </div>
      {branches.length === 0 ? (
        <p className="px-3 py-5 text-sm text-slate-500">No branches yet.</p>
      ) : (
        <table className="w-full table-fixed text-left text-[12px]">
          <thead className="border-b border-[var(--line)] bg-[#f7faf8] text-[9px] lowercase tracking-[0.06em] text-slate-500">
            <tr>
              <th className="w-[24%] px-3 py-2.5 font-semibold">branch</th>
              <th className="w-[23%] px-3 py-2.5 font-semibold">address</th>
              <th className="w-[20%] px-3 py-2.5 font-semibold">manager</th>
              <th className="w-[10%] px-3 py-2.5 text-right font-semibold">
                staff
              </th>
              <th className="w-[11%] px-3 py-2.5 text-right font-semibold">
                pending
              </th>
              <th className="w-[12%] px-3 py-2.5 text-right font-semibold">
                action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {branches.map((item) => (
              <tr
                key={item.id}
                className="odd:bg-white even:bg-[#fbfdfc] hover:bg-[var(--soft-mist)]"
              >
                <td className="px-3 py-3">
                  <p className="truncate font-semibold text-[var(--midnight-navy)]">
                    {item.name}
                  </p>
                </td>
                <td className="px-3 py-3 text-slate-600">
                  <span className="block truncate">{item.address || "—"}</span>
                </td>
                <td className="px-3 py-3">
                  <p className="truncate font-semibold text-[var(--midnight-navy)]">
                    {item.manager?.name ?? "No manager"}
                  </p>
                  <ManagerStatusBadge status={item.manager?.inviteStatus} />
                </td>
                <td className="px-3 py-3 text-right font-bold tabular-nums text-[var(--midnight-navy)]">
                  {item.staffSummary?.active ?? 0}
                </td>
                <td className="px-3 py-3 text-right font-bold tabular-nums text-amber-700">
                  {item.staffSummary?.pendingInvites ?? 0}
                </td>
                <td className="px-2 py-3 text-right">
                  <Link
                    href={`/branches?invite=manager&branchId=${item.id}`}
                    className="btn btn-ghost h-8 px-2 text-[11px]"
                  >
                    <UserPlus className="size-3.5" />
                    {item.manager ? "Edit" : "Assign"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ManagerStatusBadge({ status }: { status?: string | null }) {
  if (!status) {
    return (
      <span className="mt-1 inline-flex border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold lowercase tracking-[0.04em] text-amber-700">
        not assigned
      </span>
    );
  }

  const className =
    status === "ACTIVE"
      ? "border-emerald-200 bg-emerald-50 text-[var(--forest-emerald)]"
      : status === "INVITE_PENDING"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-[var(--line)] bg-[var(--soft-mist)] text-slate-600";

  return (
    <span
      className={`mt-1 inline-flex border px-1.5 py-0.5 text-[9px] font-bold lowercase tracking-[0.04em] ${className}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function statusLabel(status: string) {
  if (status === "ACTIVE") return "active";
  if (status === "INVITE_PENDING") return "pending";
  if (status === "INVITE_EXPIRED") return "expired";
  return status;
}
