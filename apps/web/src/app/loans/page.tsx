"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app/app-shell";
import { ApplicationDetailDrawer } from "../../components/app/application-detail-drawer";
import { LoanApplicationFormDrawer } from "../../components/app/loan-application-form-drawer";
import {
  DEFAULT_PAGE_SIZE,
  PaginationControls,
  paginateItems,
} from "../../components/app/pagination";
import { RowActions } from "../../components/app/row-actions";
import {
  AppBootSkeleton,
  SkeletonBlock,
  TableSkeleton,
} from "../../components/app/skeleton";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  clearAuthState,
  isSessionExpired,
  readAuthState,
} from "../../lib/auth-session";

type LoanRow = {
  id: string;
  applicationId: string | null;
  customerId: string;
  borrowerName: string;
  phone: string;
  nationalId: string | null;
  loanTypeName: string | null;
  status: string;
  principal: number;
  balance: number;
  paidAmount: number;
  currency: string;
  officerName: string | null;
  officerPublicId: string | null;
  paymentStartDate: string | null;
  durationDays: number | null;
  dueDate: string | null;
  createdAt: string;
  disbursedAt: string | null;
  updatedAt: string;
};

type BorrowerRow = {
  id: string;
  fullName: string;
  phone: string;
  nationalId: string | null;
  collateralType: string | null;
  loanCount: number;
};

type LoanApplicationResponse = {
  application?: {
    id: string;
  };
  message?: string | string[];
};

type LoanFilter =
  | "today"
  | "all"
  | "active"
  | "completed"
  | "dueToday"
  | "overdue"
  | "closedThisMonth";

const ACTIVE_LOAN_STATUSES = new Set([
  "SUBMITTED",
  "APPROVED",
  "DISBURSED",
  "CURRENT",
  "IN_ARREARS",
  "RESTRUCTURED",
]);

const COMPLETED_LOAN_STATUSES = new Set(["CLOSED"]);

export default function LoansPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [borrowers, setBorrowers] = useState<BorrowerRow[]>([]);
  const [filter, setFilter] = useState<LoanFilter>("today");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [borrowerSearch, setBorrowerSearch] = useState("");
  const [selectedBorrowerId, setSelectedBorrowerId] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"new" | "existing">("new");
  const [detailApplicationId, setDetailApplicationId] = useState<string | null>(
    null,
  );
  const [editingApplicationId, setEditingApplicationId] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [borrowersLoading, setBorrowersLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canCreate = Boolean(session?.permissions.includes("loan.create"));

  const loadLoans = useCallback(async (activeSession: RembehSession) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/loans`, {
        headers: {
          Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
        },
      });
      const payload = await readApiJson<{
        loans?: LoanRow[];
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setLoans(payload.loans ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load loans.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBorrowers = useCallback(async (activeSession: RembehSession) => {
    setBorrowersLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/customers`, {
        headers: {
          Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
        },
      });
      const payload = await readApiJson<{
        customers?: BorrowerRow[];
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setBorrowers(payload.customers ?? []);
    } catch (caught) {
      setPanelError(
        caught instanceof Error ? caught.message : "Could not load borrowers.",
      );
    } finally {
      setBorrowersLoading(false);
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const auth = readAuthState();
      if (!auth.session || isSessionExpired(auth.session)) {
        clearAuthState();
        router.replace("/login");
        return;
      }

      setSession(auth.session);
      setWorkspace(auth.workspace);
      setUser(auth.user);
      setBranch(auth.branch);

      if (!auth.session.permissions.includes("loan.read")) {
        setError("You do not have permission to view loans.");
        setLoading(false);
        return;
      }

      void loadLoans(auth.session);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [router, loadLoans]);

  const filteredLoans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return loans.filter((loan) => {
      if (!matchesLoanFilter(loan, filter)) return false;
      if (!q) return true;
      return [
        loan.id,
        loan.borrowerName,
        loan.phone,
        loan.nationalId ?? "",
        loan.loanTypeName ?? "",
        loanStatusLabel(loan.status),
        loan.officerName ?? "",
        loan.officerPublicId ?? "",
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [filter, loans, search]);

  const loanStats = useMemo(() => buildLoanStats(loans), [loans]);

  const pagedLoans = useMemo(
    () => paginateItems(filteredLoans, page, pageSize),
    [filteredLoans, page, pageSize],
  );

  const filteredBorrowers = useMemo(() => {
    const q = borrowerSearch.trim().toLowerCase();
    if (!q) return borrowers.slice(0, 8);
    return borrowers
      .filter((borrower) =>
        [
          borrower.fullName,
          borrower.phone,
          borrower.nationalId ?? "",
          borrower.collateralType ?? "",
        ].some((value) => value.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [borrowerSearch, borrowers]);

  async function startApplication() {
    if (!session || creating) return;
    setCreating(true);
    setPanelError(null);
    setNotice(null);
    try {
      const existing = createMode === "existing";
      if (existing && !selectedBorrowerId) {
        throw new Error("Choose a borrower first.");
      }

      const response = await fetch(
        existing
          ? `${apiBaseUrl}/loans/applications/from-borrower`
          : `${apiBaseUrl}/loans/applications`,
        {
          method: "POST",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            ...(existing ? { "Content-Type": "application/json" } : {}),
          },
          body: existing
            ? JSON.stringify({ customerId: selectedBorrowerId })
            : undefined,
        },
      );
      const payload = await readApiJson<LoanApplicationResponse>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      if (!payload.application?.id) {
        throw new Error("Application was not started.");
      }
      setEditingApplicationId(payload.application.id);
      setNotice("Application started.");
      setAddOpen(false);
      setSelectedBorrowerId("");
      setBorrowerSearch("");
      await loadLoans(session);
    } catch (caught) {
      setPanelError(
        caught instanceof Error
          ? caught.message
          : "Could not start application.",
      );
    } finally {
      setCreating(false);
    }
  }

  if (!session) {
    return <AppBootSkeleton />;
  }

  return (
    <AppShell
      session={session}
      workspace={workspace}
      user={user}
      branch={branch}
    >
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--midnight-navy)]">
              Loans
            </h1>
            <p className="mt-1 text-sm text-slate-500">{loans.length} total</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost h-9 text-xs"
              onClick={() => void loadLoans(session)}
              disabled={loading}
            >
              <RefreshCw
                className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            {canCreate ? (
              <button
                type="button"
                className="btn btn-primary h-9 text-xs"
                onClick={() => {
                  setPanelError(null);
                  setCreateMode("new");
                  setAddOpen(true);
                }}
              >
                <Plus className="size-3.5" />
                New loan
              </button>
            ) : null}
          </div>
        </div>

        {notice ? (
          <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-[var(--forest-emerald)]">
            {notice}
          </p>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <LoanStatCard
            icon={<WalletCards className="size-4" />}
            label="active loans"
            value={String(loanStats.activeLoans)}
            hint={formatMoney(loanStats.activeOutstanding, loanStats.currency)}
            tone="good"
          />
          <LoanStatCard
            icon={<Clock3 className="size-4" />}
            label="outstanding loans"
            value={formatMoney(loanStats.outstanding, loanStats.currency)}
            hint={`${loanStats.outstandingCount} open`}
            tone="blue"
          />
          <LoanStatCard
            icon={<CalendarDays className="size-4" />}
            label="due today"
            value={String(loanStats.dueToday)}
            hint={formatMoney(loanStats.dueTodayAmount, loanStats.currency)}
            tone="warn"
          />
          <LoanStatCard
            icon={<AlertTriangle className="size-4" />}
            label="overdue loans"
            value={String(loanStats.overdue)}
            hint={formatMoney(loanStats.overdueAmount, loanStats.currency)}
            tone="bad"
          />
          <LoanStatCard
            icon={<CheckCircle2 className="size-4" />}
            label="closed this month"
            value={String(loanStats.closedThisMonth)}
            hint={`${loanStats.closedThisMonthChange >= 0 ? "+" : ""}${loanStats.closedThisMonthChange} vs last month`}
            tone="good"
          />
        </section>

        <div className="panel flex flex-wrap items-center justify-between gap-3 bg-white/95 px-3 py-2.5 shadow-[0_8px_22px_rgba(20,33,61,0.05)]">
          <label className="flex min-w-[220px] flex-1 items-center gap-2">
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by loan id, borrower, phone or agent"
              className="min-w-[160px] flex-1 bg-transparent py-1.5 text-sm text-[var(--midnight-navy)] outline-none placeholder:text-slate-400"
            />
          </label>
          <label className="flex h-9 min-w-[190px] items-center gap-2 border border-[var(--line)] bg-white px-2 text-xs font-bold text-[var(--midnight-navy)]">
            <SlidersHorizontal className="size-3.5 text-slate-400" />
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as LoanFilter);
                setPage(1);
              }}
              className="min-w-0 flex-1 bg-transparent outline-none"
              aria-label="loan filter"
            >
              <option value="today">today&apos;s loans</option>
              <option value="all">all loans</option>
              <option value="active">active loans</option>
              <option value="completed">completed loans</option>
              <option value="dueToday">due today</option>
              <option value="overdue">overdue loans</option>
              <option value="closedThisMonth">closed this month</option>
            </select>
          </label>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {loading && loans.length === 0 ? (
          <TableSkeleton rows={6} columns={8} />
        ) : filteredLoans.length === 0 ? (
          <p className="panel px-4 py-6 text-sm text-slate-500">
            No loans found.
          </p>
        ) : (
          <div className="panel overflow-hidden shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
            <table className="w-full table-fixed text-left text-[11px]">
              <thead className="border-b border-[var(--line)] bg-[#e5ece8] text-[9px] capitalize tracking-[0.06em] text-slate-500">
                <tr>
                  <th className="w-[11%] px-2 py-2.5 font-semibold">loan id</th>
                  <th className="w-[19%] px-2 py-2.5 font-semibold">
                    borrower
                  </th>
                  <th className="hidden w-[13%] px-2 py-2.5 font-semibold md:table-cell">
                    loan type
                  </th>
                  <th className="hidden w-[11%] px-2 py-2.5 text-right font-semibold sm:table-cell">
                    principal
                  </th>
                  <th className="hidden w-[9%] px-2 py-2.5 text-right font-semibold lg:table-cell">
                    paid
                  </th>
                  <th className="w-[13%] px-2 py-2.5 text-right font-semibold">
                    balance
                  </th>
                  <th className="hidden w-[11%] px-2 py-2.5 font-semibold lg:table-cell">
                    next due
                  </th>
                  <th className="hidden w-[8%] px-2 py-2.5 font-semibold xl:table-cell">
                    officer
                  </th>
                  <th className="w-[5%] px-2 py-2.5 text-right font-semibold">
                    actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {pagedLoans.items.map((loan) => (
                  <tr
                    key={loan.id}
                    className="bg-white transition odd:bg-white even:bg-[#fbfdfc] hover:bg-[var(--soft-mist)]"
                  >
                    <td className="px-2 py-3 text-[var(--midnight-navy)]">
                      <span className="block break-words font-bold">
                        {loan.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span
                        className={`mt-1 inline-flex border px-1.5 py-0.5 text-[9px] font-bold capitalize tracking-[0.04em] ${loanStatusTone(loan.status)}`}
                      >
                        {loanStatusLabel(loan.status)}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <Link
                        href={`/clients/${loan.customerId}`}
                        className="block min-w-0"
                      >
                        <span className="block truncate font-semibold text-[var(--midnight-navy)]">
                          {loan.borrowerName}
                        </span>
                        <span className="block truncate text-[10px] text-slate-500">
                          {loan.phone}
                        </span>
                      </Link>
                    </td>
                    <td className="hidden px-2 py-3 text-[11px] text-slate-600 md:table-cell">
                      <span className="block truncate">
                        {loan.loanTypeName || "Standard loan"}
                      </span>
                    </td>
                    <td className="hidden px-2 py-3 text-right text-[11px] font-bold tabular-nums text-[var(--midnight-navy)] sm:table-cell">
                      {formatMoney(loan.principal, loan.currency)}
                    </td>
                    <td className="hidden px-2 py-3 text-right text-[11px] font-bold tabular-nums text-[var(--forest-emerald)] lg:table-cell">
                      {formatMoney(loan.paidAmount, loan.currency)}
                    </td>
                    <td className="px-2 py-3 text-right text-[11px] font-bold tabular-nums text-[var(--midnight-navy)]">
                      {formatMoney(loan.balance, loan.currency)}
                    </td>
                    <td className="hidden px-2 py-3 text-[11px] text-slate-600 lg:table-cell">
                      <span className="block truncate font-semibold text-[var(--midnight-navy)]">
                        {formatDate(loan.dueDate)}
                      </span>
                      <span className="block truncate capitalize text-[10px] text-slate-500">
                        {dueHint(loan)}
                      </span>
                    </td>
                    <td className="hidden px-2 py-3 text-[11px] text-slate-600 xl:table-cell">
                      <span className="block truncate">
                        {loan.officerName || "—"}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right">
                      <RowActions
                        label={`Open actions for ${loan.borrowerName}`}
                        items={
                          loan.applicationId
                            ? [
                                {
                                  label: "View loan",
                                  onSelect: () =>
                                    setDetailApplicationId(loan.applicationId),
                                },
                                {
                                  label: "Open borrower",
                                  href: `/clients/${loan.customerId}`,
                                },
                              ]
                            : [
                                {
                                  label: "Open borrower",
                                  href: `/clients/${loan.customerId}`,
                                },
                              ]
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls
              page={pagedLoans.currentPage}
              pageSize={pageSize}
              total={filteredLoans.length}
              itemLabel="loans"
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      {addOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close new loan panel"
            onClick={() => setAddOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-[var(--line)] bg-[var(--soft-ivory)] shadow-xl">
            <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
              <div>
                <h2 className="text-lg font-bold text-[var(--midnight-navy)]">
                  New loan
                </h2>
                <p className="text-xs text-slate-500">
                  Start from a new application or an existing borrower.
                </p>
              </div>
              <button
                type="button"
                className="grid size-8 place-items-center border border-[var(--line)] bg-white"
                onClick={() => setAddOpen(false)}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {panelError ? (
                <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {panelError}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <ChoiceButton
                  active={createMode === "new"}
                  icon={<Plus className="size-4" />}
                  label="new application"
                  onClick={() => setCreateMode("new")}
                />
                <ChoiceButton
                  active={createMode === "existing"}
                  icon={<UserRound className="size-4" />}
                  label="existing borrower"
                  onClick={() => {
                    setCreateMode("existing");
                    if (
                      session &&
                      borrowers.length === 0 &&
                      !borrowersLoading
                    ) {
                      void loadBorrowers(session);
                    }
                  }}
                />
              </div>

              {createMode === "existing" ? (
                <div className="space-y-3">
                  <label className="panel flex items-center gap-2 bg-white px-3 py-2">
                    <Search className="size-4 shrink-0 text-slate-400" />
                    <input
                      type="search"
                      value={borrowerSearch}
                      onChange={(event) =>
                        setBorrowerSearch(event.target.value)
                      }
                      placeholder="Search borrowers"
                      className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-slate-400"
                    />
                  </label>

                  {borrowersLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <SkeletonBlock key={index} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : filteredBorrowers.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No borrowers found.
                    </p>
                  ) : (
                    <div className="divide-y divide-[var(--line)] border border-[var(--line)] bg-white">
                      {filteredBorrowers.map((borrower) => (
                        <button
                          key={borrower.id}
                          type="button"
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--soft-mist)] ${
                            selectedBorrowerId === borrower.id
                              ? "bg-emerald-50"
                              : ""
                          }`}
                          onClick={() => setSelectedBorrowerId(borrower.id)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-[var(--midnight-navy)]">
                              {borrower.fullName}
                            </span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {borrower.phone}
                              {borrower.nationalId
                                ? ` · ${borrower.nationalId}`
                                : ""}
                            </span>
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {borrower.loanCount} loan
                            {borrower.loanCount === 1 ? "" : "s"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="border-t border-[var(--line)] bg-white px-4 py-3">
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={
                  creating || (createMode === "existing" && !selectedBorrowerId)
                }
                onClick={() => void startApplication()}
              >
                {creating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Start application
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <ApplicationDetailDrawer
        applicationId={detailApplicationId}
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        onClose={() => setDetailApplicationId(null)}
      />
      <LoanApplicationFormDrawer
        applicationId={editingApplicationId}
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        onClose={() => setEditingApplicationId(null)}
        onSubmitted={() => {
          setEditingApplicationId(null);
          setNotice("Loan given.");
          void loadLoans(session);
        }}
      />
    </AppShell>
  );
}

function ChoiceButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex min-h-20 flex-col items-start justify-between border px-3 py-3 text-left text-sm font-bold ${
        active
          ? "border-[var(--forest-emerald)] bg-emerald-50 text-[var(--midnight-navy)]"
          : "border-[var(--line)] bg-white text-slate-600"
      }`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function LoanStatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "good" | "blue" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-100 bg-emerald-50 text-[var(--forest-emerald)]"
      : tone === "blue"
        ? "border-sky-100 bg-sky-50 text-sky-700"
        : tone === "warn"
          ? "border-amber-100 bg-amber-50 text-amber-700"
          : "border-rose-100 bg-rose-50 text-rose-700";

  return (
    <article className="panel flex min-h-[92px] items-start gap-3 bg-white px-3 py-3 shadow-[0_8px_22px_rgba(20,33,61,0.05)]">
      <span
        className={`grid size-9 shrink-0 place-items-center border ${toneClass}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold capitalize tracking-[0.08em] text-slate-500">
          {label}
        </p>
        <p className="mt-1 truncate text-lg font-bold tabular-nums text-[var(--midnight-navy)]">
          {value}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">{hint}</p>
      </div>
    </article>
  );
}

function buildLoanStats(loans: LoanRow[]) {
  const currency = loans[0]?.currency ?? "UGX";
  const activeLoans = loans.filter(isLoanActive);
  const outstandingLoans = activeLoans.filter((loan) => loan.balance > 0);
  const dueTodayLoans = loans.filter(isLoanDueToday);
  const overdueLoans = loans.filter(isLoanOverdue);
  const closedThisMonthLoans = loans.filter((loan) =>
    isClosedInMonth(loan, new Date()),
  );
  const previousMonth = new Date();
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const closedLastMonth = loans.filter((loan) =>
    isClosedInMonth(loan, previousMonth),
  ).length;

  return {
    currency,
    activeLoans: activeLoans.length,
    activeOutstanding: sumMoney(activeLoans, "balance"),
    outstanding: sumMoney(outstandingLoans, "balance"),
    outstandingCount: outstandingLoans.length,
    dueToday: dueTodayLoans.length,
    dueTodayAmount: sumMoney(dueTodayLoans, "balance"),
    overdue: overdueLoans.length,
    overdueAmount: sumMoney(overdueLoans, "balance"),
    closedThisMonth: closedThisMonthLoans.length,
    closedThisMonthChange: closedThisMonthLoans.length - closedLastMonth,
  };
}

function matchesLoanFilter(loan: LoanRow, filter: LoanFilter) {
  switch (filter) {
    case "today":
      return isSameLocalDay(loanDate(loan), new Date());
    case "active":
      return isLoanActive(loan);
    case "completed":
      return isLoanCompleted(loan);
    case "dueToday":
      return isLoanDueToday(loan);
    case "overdue":
      return isLoanOverdue(loan);
    case "closedThisMonth":
      return isClosedInMonth(loan, new Date());
    default:
      return true;
  }
}

function isLoanActive(loan: LoanRow) {
  return loan.balance > 0 && ACTIVE_LOAN_STATUSES.has(loan.status);
}

function isLoanCompleted(loan: LoanRow) {
  return loan.balance <= 0 || COMPLETED_LOAN_STATUSES.has(loan.status);
}

function isLoanDueToday(loan: LoanRow) {
  return (
    isLoanActive(loan) && isSameLocalDay(parseDate(loan.dueDate), new Date())
  );
}

function isLoanOverdue(loan: LoanRow) {
  const dueDate = parseDate(loan.dueDate);
  if (!isLoanActive(loan)) return false;
  if (loan.status === "IN_ARREARS") return true;
  if (!dueDate) return false;
  return (
    startOfLocalDay(dueDate).getTime() < startOfLocalDay(new Date()).getTime()
  );
}

function isClosedInMonth(loan: LoanRow, monthDate: Date) {
  if (!isLoanCompleted(loan)) return false;
  const closedAt = parseDate(loan.updatedAt);
  return Boolean(closedAt && isSameLocalMonth(closedAt, monthDate));
}

function loanDate(loan: LoanRow) {
  return (
    parseDate(loan.disbursedAt) ??
    parseDate(loan.createdAt) ??
    parseDate(loan.updatedAt)
  );
}

function dueHint(loan: LoanRow) {
  if (isLoanCompleted(loan)) return "Closed";
  if (isLoanOverdue(loan)) return "Overdue";
  if (isLoanDueToday(loan)) return "Due today";
  return loan.dueDate ? "Next payment" : "Not set";
}

function loanStatusLabel(status: string) {
  if (COMPLETED_LOAN_STATUSES.has(status)) return "Completed";
  if (ACTIVE_LOAN_STATUSES.has(status)) return "Active";
  return toTitleLabel(status);
}

function toTitleLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function loanStatusTone(status: string) {
  if (COMPLETED_LOAN_STATUSES.has(status)) {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }
  if (status === "IN_ARREARS") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (ACTIVE_LOAN_STATUSES.has(status)) {
    return "border-emerald-200 bg-emerald-50 text-[var(--forest-emerald)]";
  }
  return "border-[var(--line)] bg-[var(--soft-mist)] text-slate-500";
}

function formatMoney(value: number, currency = "UGX") {
  return `${currency} ${new Intl.NumberFormat("en-UG", {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

function formatDate(value: string | null) {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-UG", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameLocalDay(left: Date | null, right: Date) {
  if (!left) return false;
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isSameLocalMonth(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sumMoney(loans: LoanRow[], field: "balance" | "principal") {
  return (
    Math.round(loans.reduce((sum, loan) => sum + loan[field], 0) * 100) / 100
  );
}
