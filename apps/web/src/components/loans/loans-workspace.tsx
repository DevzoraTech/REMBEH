"use client";

import {
  Banknote,
  CheckCircle2,
  Clock3,
  Download,
  Folder,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApplicationDetailDrawer } from "../app/application-detail-drawer";
import { LoanApplicationFormDrawer } from "../app/loan-application-form-drawer";
import { AppShell } from "../app/app-shell";
import { AppBootSkeleton, SkeletonBlock } from "../app/skeleton";
import {
  OwnerLoan,
  OwnerStatus,
  formatDate,
  formatMoney,
  formatNumber,
  ownerFetch,
  sumBy,
} from "../../app/owner/owner-common";
import { OwnerHeader } from "../../app/owner/owner-header";
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
import { resolveOperatorRole } from "../../lib/roles";

export type LoansMode = "owner" | "manager";

type PortfolioFilter = "all" | "active" | "closed" | "overdue";

type LoanRow = OwnerLoan & {
  applicationId?: string | null;
  officerPublicId?: string | null;
};

type BorrowerRow = {
  id: string;
  fullName: string;
  phone: string;
  nationalId: string | null;
  collateralType: string | null;
  loanCount: number;
};

const ACTIVE_STATUSES = new Set([
  "SUBMITTED",
  "APPROVED",
  "DISBURSED",
  "CURRENT",
  "IN_ARREARS",
  "RESTRUCTURED",
]);

type LoansSession = {
  session: RembehSession | null;
  workspace: RembehWorkspace | null;
  user: RembehUser | null;
  branch: RembehBranch | null;
  ready: boolean;
};

function useLoansSession(mode: LoansMode): LoansSession {
  const router = useRouter();
  const [state, setState] = useState<LoansSession>({
    session: null,
    workspace: null,
    user: null,
    branch: null,
    ready: false,
  });

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const auth = readAuthState();
      if (!auth.session || isSessionExpired(auth.session)) {
        clearAuthState();
        router.replace(
          `/login?next=${encodeURIComponent(mode === "owner" ? "/owner/portfolio" : "/loans")}`,
        );
        return;
      }
      const role = resolveOperatorRole(auth.session, auth.user);
      if (mode === "owner" && role !== "owner") {
        router.replace(role === "manager" ? "/loans" : "/dashboard");
        return;
      }
      if (mode === "manager" && role !== "manager") {
        router.replace(role === "owner" ? "/owner/portfolio" : "/dashboard");
        return;
      }
      setState({
        session: auth.session,
        workspace: auth.workspace,
        user: auth.user,
        branch: auth.branch,
        ready: true,
      });
    }, 0);
    return () => window.clearTimeout(boot);
  }, [mode, router]);

  return state;
}

export function LoansWorkspace({ mode }: { mode: LoansMode }) {
  const state = useLoansSession(mode);
  const isManager = mode === "manager";
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [borrowers, setBorrowers] = useState<BorrowerRow[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PortfolioFilter>("active");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"new" | "existing">("new");
  const [borrowerSearch, setBorrowerSearch] = useState("");
  const [selectedBorrowerId, setSelectedBorrowerId] = useState("");
  const [borrowersLoading, setBorrowersLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detailApplicationId, setDetailApplicationId] = useState<string | null>(
    null,
  );
  const [editingApplicationId, setEditingApplicationId] = useState<
    string | null
  >(null);
  const currency = state.workspace?.currency ?? "UGX";
  const canCreate =
    isManager && Boolean(state.session?.permissions.includes("loan.create"));

  const loadLoans = useCallback(async () => {
    if (!state.session) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await ownerFetch<{ loans?: LoanRow[] }>(
        state.session,
        "/loans",
      );
      const next = payload.loans ?? [];
      setLoans(
        isManager && state.branch?.id
          ? next.filter((loan) => loan.branchId === state.branch?.id)
          : next,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load portfolio.",
      );
    } finally {
      setLoading(false);
    }
  }, [isManager, state.branch?.id, state.session]);

  const loadBorrowers = useCallback(async () => {
    if (!state.session) return;
    setBorrowersLoading(true);
    try {
      const payload = await ownerFetch<{ customers?: BorrowerRow[] }>(
        state.session,
        "/customers",
      );
      setBorrowers(payload.customers ?? []);
    } catch (caught) {
      setPanelError(
        caught instanceof Error ? caught.message : "Could not load borrowers.",
      );
    } finally {
      setBorrowersLoading(false);
    }
  }, [state.session]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      if (state.ready && state.session) {
        void loadLoans();
      }
    }, 0);
    return () => window.clearTimeout(boot);
  }, [loadLoans, state.ready, state.session]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = new Date();
    return loans.filter((loan) => {
      if (filter === "active" && !ACTIVE_STATUSES.has(loan.status)) return false;
      if (filter === "closed" && loan.status !== "CLOSED") return false;
      if (
        filter === "overdue" &&
        (!loan.dueDate || new Date(loan.dueDate) >= today || loan.balance <= 0)
      ) {
        return false;
      }
      if (!q) return true;
      return [
        loan.id,
        loan.borrowerName,
        loan.phone,
        loan.nationalId ?? "",
        loan.loanTypeName ?? "",
        loan.officerName ?? "",
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [filter, loans, search]);

  const activeLoans = loans.filter((loan) => ACTIVE_STATUSES.has(loan.status));
  const overdueLoans = loans.filter(
    (loan) =>
      loan.dueDate &&
      new Date(loan.dueDate) < new Date() &&
      loan.balance > 0,
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
    if (!state.session || creating) return;
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
            Authorization: `${state.session.tokenType} ${state.session.accessToken}`,
            ...(existing ? { "Content-Type": "application/json" } : {}),
          },
          body: existing
            ? JSON.stringify({ customerId: selectedBorrowerId })
            : undefined,
        },
      );
      const payload = await readApiJson<{
        application?: { id: string };
        message?: string | string[];
      }>(response);
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
      await loadLoans();
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

  if (!state.ready || !state.session) return <AppBootSkeleton />;

  return (
    <AppShell
      session={state.session}
      workspace={state.workspace}
      user={state.user}
      branch={isManager ? state.branch : null}
    >
      <div className="mx-auto max-w-[1400px] space-y-5 animate-rise">
        <OwnerHeader
          eyebrow={isManager ? "Your branch" : "All Branches"}
          title={isManager ? "Loans" : "Portfolio"}
          search={search}
          onSearchChange={setSearch}
          searchTooltip="Search borrower, loan id, phone or officer."
          searchPlaceholder="Search borrower, loan id, phone or officer..."
          showReportsButton={false}
          settingsHref={isManager ? "/settings" : "/owner/settings"}
          notificationScope={mode}
          actions={
            <>
              <button
                type="button"
                onClick={() => void loadLoans()}
                disabled={loading}
                aria-label="Refresh loans"
                className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-emerald-50 disabled:opacity-60"
              >
                <RefreshCw
                  className={`size-4 ${loading ? "animate-spin" : ""}`}
                />
              </button>
              {canCreate ? (
                <button
                  type="button"
                  onClick={() => {
                    setPanelError(null);
                    setCreateMode("new");
                    setAddOpen(true);
                  }}
                  className="flex h-9 items-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-3.5 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(15,143,104,0.28)]"
                >
                  <Plus className="size-3.5" />
                  New loan
                </button>
              ) : null}
              <button
                type="button"
                disabled={exporting || filtered.length === 0}
                onClick={() =>
                  void exportPortfolio(filtered, currency, setExporting)
                }
                className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3.5 text-xs font-semibold text-[#111a2e] shadow-[0_8px_18px_rgba(15,23,42,0.045)] disabled:opacity-60"
              >
                <Download className="size-3.5" />
                {exporting ? "Exporting" : "Export"}
              </button>
            </>
          }
        />
        <p className="-mt-2 text-sm font-medium text-slate-500">
          {isManager
            ? "Review and manage loans issued at your branch."
            : "Review loan portfolio performance across branches."}
        </p>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-[var(--forest-emerald)]">
            {notice}
          </p>
        ) : null}

        <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
          <LoanStat
            icon={<Folder className="size-4" />}
            label="Loans"
            value={formatNumber(loans.length)}
            hint="In this view"
            tone="green"
          />
          <LoanStat
            icon={<WalletCards className="size-4" />}
            label="Active loans"
            value={formatNumber(activeLoans.length)}
            hint={formatMoney(
              sumBy(activeLoans, (loan) => loan.balance),
              currency,
            )}
            tone="green"
          />
          <LoanStat
            icon={<Banknote className="size-4" />}
            label="Principal"
            value={formatMoney(
              sumBy(loans, (loan) => loan.principal),
              currency,
            )}
            hint="Total issued"
            tone="blue"
          />
          <LoanStat
            icon={<Clock3 className="size-4" />}
            label="Outstanding"
            value={formatMoney(
              sumBy(activeLoans, (loan) => loan.balance),
              currency,
            )}
            hint={`${overdueLoans.length} overdue`}
            tone="gold"
          />
          <LoanStat
            icon={<CheckCircle2 className="size-4" />}
            label="Paid"
            value={formatMoney(
              sumBy(loans, (loan) => loan.paidAmount),
              currency,
            )}
            hint="Collections to date"
            tone="violet"
            className="sm:col-span-2 xl:col-span-1"
          />
        </section>

        <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f5] px-4 py-3.5">
            <div>
              <h2 className="text-[15px] font-semibold text-[#0b1220]">
                {isManager ? "Branch loans" : "Portfolio loans"}
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {formatNumber(filtered.length)} shown
              </p>
            </div>
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(220px,280px)_170px]">
              <label className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
                <Search className="size-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none"
                  placeholder="Filter this list..."
                />
              </label>
              <select
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as PortfolioFilter)
                }
                className="h-9 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold outline-none"
              >
                <option value="active">Active loans</option>
                <option value="all">All loans</option>
                <option value="closed">Closed loans</option>
                <option value="overdue">Overdue loans</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-left text-xs">
              <thead className="bg-[#f8faf9] text-[10px] font-semibold text-slate-500">
                <tr>
                  <th className="w-[16%] px-3 py-2.5">Loan</th>
                  <th className="w-[19%] px-3 py-2.5">Borrower</th>
                  <th className="w-[15%] px-3 py-2.5">Loan type</th>
                  <th className="w-[13%] px-3 py-2.5 text-right">Principal</th>
                  <th className="w-[13%] px-3 py-2.5 text-right">Paid</th>
                  <th className="w-[13%] px-3 py-2.5 text-right">Balance</th>
                  <th className="w-[11%] px-3 py-2.5">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f5]">
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      Loading portfolio...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      No loans match this view.
                    </td>
                  </tr>
                ) : (
                  filtered.slice(0, 80).map((loan) => (
                    <tr
                      key={loan.id}
                      className={
                        isManager && loan.applicationId
                          ? "cursor-pointer transition hover:bg-[#fbfdfc]"
                          : undefined
                      }
                      onClick={() => {
                        if (isManager && loan.applicationId) {
                          setDetailApplicationId(loan.applicationId);
                        }
                      }}
                    >
                      <td className="px-3 py-3">
                        <p className="truncate font-bold text-[#0b1220]">
                          {loan.id}
                        </p>
                        <OwnerStatus value={loan.status} />
                      </td>
                      <td className="px-3 py-3">
                        <p className="truncate font-semibold text-[#0b1220]">
                          {loan.borrowerName}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          {loan.phone}
                        </p>
                      </td>
                      <td className="px-3 py-3">{loan.loanTypeName ?? "-"}</td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums">
                        {formatMoney(loan.principal, currency)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-[var(--forest-emerald)]">
                        {formatMoney(loan.paidAmount, currency)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums">
                        {formatMoney(loan.balance, currency)}
                      </td>
                      <td className="px-3 py-3">{formatDate(loan.dueDate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {addOpen && canCreate ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(8,15,31,0.36)] backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close new loan panel"
            onClick={() => setAddOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-[#e6ebf0] bg-white shadow-[-18px_0_44px_rgba(15,23,42,0.18)]">
            <header className="flex items-start justify-between gap-3 border-b border-[#edf1f5] px-4 py-3">
              <div>
                <h2 className="text-lg font-bold text-[#0b1220]">New loan</h2>
                <p className="text-xs text-slate-500">
                  Start from a new application or an existing borrower.
                </p>
              </div>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-xl border border-[#e6ebf0]"
                onClick={() => setAddOpen(false)}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {panelError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {panelError}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <ChoiceButton
                  active={createMode === "new"}
                  icon={<Plus className="size-4" />}
                  label="New application"
                  onClick={() => setCreateMode("new")}
                />
                <ChoiceButton
                  active={createMode === "existing"}
                  icon={<UserRound className="size-4" />}
                  label="Existing borrower"
                  onClick={() => {
                    setCreateMode("existing");
                    if (borrowers.length === 0 && !borrowersLoading) {
                      void loadBorrowers();
                    }
                  }}
                />
              </div>
              {createMode === "existing" ? (
                <div className="space-y-3">
                  <label className="flex h-10 items-center gap-2 rounded-xl border border-[#e6ebf0] px-3">
                    <Search className="size-4 text-slate-400" />
                    <input
                      type="search"
                      value={borrowerSearch}
                      onChange={(event) =>
                        setBorrowerSearch(event.target.value)
                      }
                      placeholder="Search borrowers"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    />
                  </label>
                  {borrowersLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <SkeletonBlock key={index} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : filteredBorrowers.length === 0 ? (
                    <p className="text-sm text-slate-500">No borrowers found.</p>
                  ) : (
                    <div className="divide-y divide-[#edf1f5] rounded-xl border border-[#e6ebf0]">
                      {filteredBorrowers.map((borrower) => (
                        <button
                          key={borrower.id}
                          type="button"
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[#f8faf9] ${
                            selectedBorrowerId === borrower.id
                              ? "bg-emerald-50"
                              : ""
                          }`}
                          onClick={() => setSelectedBorrowerId(borrower.id)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-[#0b1220]">
                              {borrower.fullName}
                            </span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {borrower.phone}
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
            <div className="border-t border-[#edf1f5] px-4 py-3">
              <button
                type="button"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] text-xs font-semibold text-white disabled:opacity-55"
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

      {isManager && state.session ? (
        <>
          <ApplicationDetailDrawer
            applicationId={detailApplicationId}
            accessToken={state.session.accessToken}
            tokenType={state.session.tokenType}
            onClose={() => setDetailApplicationId(null)}
          />
          <LoanApplicationFormDrawer
            applicationId={editingApplicationId}
            accessToken={state.session.accessToken}
            tokenType={state.session.tokenType}
            onClose={() => setEditingApplicationId(null)}
            onSubmitted={() => {
              setEditingApplicationId(null);
              setNotice("Loan given.");
              void loadLoans();
            }}
          />
        </>
      ) : null}
    </AppShell>
  );
}

function LoanStat({
  icon,
  label,
  value,
  hint,
  tone,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "green" | "blue" | "violet" | "gold";
  className?: string;
}) {
  const toneClass = {
    green: "bg-[#e9f8ef] text-[#07885f]",
    blue: "bg-[#eaf4ff] text-[#2078dc]",
    violet: "bg-[#f2eaff] text-[#8b4ee8]",
    gold: "bg-[#fff3df] text-[#f28a17]",
  }[tone];
  return (
    <div className={`min-w-0 ${className}`}>
      <article className="flex h-full min-h-[88px] items-center gap-2.5 rounded-[13px] border border-[#e6ebf0] bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneClass}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-500">
            {label}
          </p>
          <p className="mt-1 break-words text-[clamp(0.72rem,0.9vw,1rem)] font-bold leading-tight tabular-nums text-[#0b1220]">
            {value}
          </p>
          <p className="mt-1 truncate text-[11px] font-medium text-slate-500">
            {hint}
          </p>
        </div>
      </article>
    </div>
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
      className={`flex min-h-20 flex-col items-start justify-between rounded-xl border px-3 py-3 text-left text-sm font-bold ${
        active
          ? "border-[var(--forest-emerald)] bg-emerald-50 text-[#0b1220]"
          : "border-[#e6ebf0] bg-white text-slate-600"
      }`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

async function exportPortfolio(
  rows: LoanRow[],
  currency: string,
  setExporting: (exporting: boolean) => void,
) {
  setExporting(true);
  try {
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Portfolio");
    worksheet.addRow(["REMBEH Portfolio"]);
    worksheet.mergeCells(1, 1, 1, 8);
    worksheet.addRow([
      "Loan Id",
      "Borrower",
      "Phone",
      "Loan Type",
      "Principal",
      "Paid",
      "Balance",
      "Status",
    ]);
    rows.forEach((loan) => {
      worksheet.addRow([
        loan.id,
        loan.borrowerName,
        loan.phone,
        loan.loanTypeName ?? "",
        loan.principal,
        loan.paidAmount,
        loan.balance,
        loan.status,
      ]);
    });
    worksheet.columns = [
      { width: 18 },
      { width: 24 },
      { width: 18 },
      { width: 18 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 18 },
    ];
    worksheet.getRow(1).font = { bold: true, size: 16 };
    worksheet.getRow(2).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F8F68" },
    };
    [5, 6, 7].forEach((column) => {
      worksheet.getColumn(column).numFmt = `"${currency}" #,##0`;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rembeh-portfolio.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    setExporting(false);
  }
}
