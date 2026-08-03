"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Banknote,
  Download,
  FileText,
  Loader2,
  Percent,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApplicationDetailDrawer } from "../app/application-detail-drawer";
import { LoanApplicationFormDrawer } from "../app/loan-application-form-drawer";
import { AppShell } from "../app/app-shell";
import {
  DEFAULT_PAGE_SIZE,
  PaginationControls,
  paginateItems,
} from "../app/pagination";
import { RowActions } from "../app/row-actions";
import { AppBootSkeleton, SkeletonBlock } from "../app/skeleton";
import {
  OwnerLoan,
  formatDate,
  formatMoneyAmount,
  formatNumber,
  isLoanScheduleOverdue,
  loanTotalRepayable,
  ownerFetch,
  sumBy,
  titleCase,
} from "../../app/owner/owner-common";
import { OwnerHeader } from "../../app/owner/owner-header";
import { Money } from "../app/money";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  EMPTY_LOANS_FILTERS,
  LoansAdvancedFilters,
  LoansFiltersControl,
  loanMatchesDateIssued,
  loanMatchesOfficer,
  loanMatchesPrincipalRange,
  loanMatchesRepaymentPosition,
  loansFiltersFromSearchParams,
  type OfficerOption,
} from "./loans-filters";
import { RecordRepaymentModal } from "./record-repayment-modal";
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
  const router = useRouter();
  const isManager = mode === "manager";
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [borrowers, setBorrowers] = useState<BorrowerRow[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PortfolioFilter>("all");
  const [advancedFilters, setAdvancedFilters] =
    useState<LoansAdvancedFilters>(EMPTY_LOANS_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
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
  const [detailLoan, setDetailLoan] = useState<LoanRow | null>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [editingApplicationId, setEditingApplicationId] = useState<
    string | null
  >(null);
  const [repaymentLoan, setRepaymentLoan] = useState<LoanRow | null>(null);
  const [agreementBusyId, setAgreementBusyId] = useState<string | null>(null);
  const currency = state.workspace?.currency ?? "UGX";
  const canCreate =
    isManager && Boolean(state.session?.permissions.includes("loan.create"));
  const canRecordRepayment = Boolean(
    state.session?.permissions.includes("collection.create"),
  );

  useEffect(() => {
    if (!state.ready) return;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = loansFiltersFromSearchParams(params);
    if (Object.keys(fromUrl).length > 0) {
      setAdvancedFilters((current) => ({ ...current, ...fromUrl }));
      if (fromUrl.repayment && fromUrl.repayment !== "all") {
        setFilter("all");
      }
    }
    if (canCreate && params.get("new") === "1") {
      setPanelError(null);
      setCreateMode("new");
      setAddOpen(true);
      params.delete("new");
      const next = params.toString();
      router.replace(
        `${isManager ? "/loans" : "/owner/portfolio"}${next ? `?${next}` : ""}`,
        { scroll: false },
      );
    }
  }, [canCreate, isManager, router, state.ready]);

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
      const scoped =
        isManager && state.branch?.id
          ? next.filter((loan) => loan.branchId === state.branch?.id)
          : next;
      setLoans(scoped);
      setDetailLoan((current) => {
        if (!current) return null;
        return scoped.find((loan) => loan.id === current.id) ?? current;
      });
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

  const officerOptions = useMemo<OfficerOption[]>(() => {
    const map = new Map<string, string>();
    for (const loan of loans) {
      const label = loan.officerName?.trim();
      if (!label) continue;
      const key = loan.officerPublicId?.trim() || label.toLowerCase();
      if (!map.has(key)) map.set(key, label);
    }
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [loans]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    return loans.filter((loan) => {
      if (filter === "active" && !ACTIVE_STATUSES.has(loan.status)) return false;
      if (filter === "closed" && loan.status !== "CLOSED") return false;
      if (filter === "overdue" && !isLoanScheduleOverdue(loan)) {
        return false;
      }

      if (!loanMatchesOfficer(loan, advancedFilters)) return false;

      if (!loanMatchesDateIssued(loanIssueDate(loan), advancedFilters, now)) {
        return false;
      }

      const overdueDays = resolveOverdueDays(loan, now);
      if (
        !loanMatchesRepaymentPosition(overdueDays, advancedFilters.repayment)
      ) {
        return false;
      }

      if (!loanMatchesPrincipalRange(loan.principal, advancedFilters)) {
        return false;
      }

      if (!q) return true;
      const digits = q.replace(/\D/g, "");
      const haystack = [
        loan.id,
        shortLoanId(loan.id),
        loan.borrowerName,
        loan.phone,
        loan.nationalId ?? "",
        loan.loanTypeName ?? "",
        loan.officerName ?? "",
        loan.officerPublicId ?? "",
        loan.status,
        loan.status.replaceAll("_", " "),
        String(loan.principal),
        String(loan.balance),
        String(loan.paidAmount),
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(q)) return true;
      if (digits.length >= 3) {
        return [loan.phone, loan.nationalId ?? "", loan.id].some((value) =>
          value.replace(/\D/g, "").includes(digits),
        );
      }
      return false;
    });
  }, [advancedFilters, filter, loans, search]);

  useEffect(() => {
    setPage(1);
  }, [advancedFilters, filter, search]);

  useEffect(() => {
    if (!state.ready || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get("repayment");
    const next =
      advancedFilters.repayment === "all" ? null : advancedFilters.repayment;
    if (current === next) return;
    if (next) url.searchParams.set("repayment", next);
    else url.searchParams.delete("repayment");
    url.searchParams.delete("new");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [advancedFilters.repayment, router, state.ready]);

  const summary = useMemo(() => buildLoansSummary(loans), [loans]);
  const paged = useMemo(
    () => paginateItems(filtered, page, pageSize),
    [filtered, page, pageSize],
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

  async function downloadLoanAgreement(applicationId: string, loanId: string) {
    if (!state.session || agreementBusyId) return;
    setAgreementBusyId(loanId);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/loan-applications/${applicationId}/agreement.pdf`,
        {
          headers: {
            Authorization: `${state.session.tokenType} ${state.session.accessToken}`,
          },
        },
      );
      if (!response.ok) {
        let message = "Could not download loan agreement.";
        try {
          const payload = (await response.json()) as {
            message?: string | string[];
          };
          message = formatApiError(payload.message);
        } catch {
          // non-JSON body
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("content-disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/i);
      anchor.href = objectUrl;
      anchor.download = match?.[1] ?? `loan-agreement-${shortLoanId(loanId)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setNotice("Loan agreement downloaded.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not download loan agreement.",
      );
    } finally {
      setAgreementBusyId(null);
    }
  }

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
          eyebrow={isManager ? undefined : "All Branches"}
          title="Loans"
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search Loans..."
          searchTooltip="Search by borrower, loan ID, phone, national ID, loan type, officer, status or amount."
          showReportsButton={false}
          settingsHref={isManager ? "/settings" : "/owner/settings"}
          notificationScope={mode}
          actions={
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
          }
        />
        <p className="-mt-2 text-sm font-medium text-slate-500">
          {isManager
            ? "Track loans, monitor repayments, and follow up on overdue balances."
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

        <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <LoansSummaryCard
            title="Loans Issued"
            icon={<FileText className="size-4" />}
            value={{ amount: formatNumber(summary.issuedThisMonth) }}
            context="this month"
            monthDelta={{
              value: summary.issuedThisMonth - summary.issuedLastMonth,
              format: "number",
            }}
            secondary={{
              amount: formatNumber(summary.issuedAllTime),
              suffix: "all time",
            }}
            rows={[
              {
                label: "active",
                value: { amount: formatNumber(summary.activeCount) },
                tone: "good",
              },
              {
                label: "closed",
                value: { amount: formatNumber(summary.closedCount) },
                tone: "neutral",
              },
            ]}
          />
          <LoansSummaryCard
            title="Overdue Loans"
            icon={<AlertCircle className="size-4" />}
            value={{ amount: formatNumber(summary.overdueCount) }}
            context={`${summary.overduePercentLabel} of active loans`}
            rows={[
              {
                label: "overdue balance",
                value: {
                  currency,
                  amount: formatMoneyAmount(summary.overdueBalance),
                },
                tone: "warn",
              },
              {
                label: "overdue by 2+ days",
                value: {
                  amount: formatNumber(summary.overdueBy2PlusCount),
                  suffix: "loans",
                },
                tone: "warn",
              },
            ]}
          />
          <LoansSummaryCard
            title="Principal Issued"
            icon={<Banknote className="size-4" />}
            value={{
              currency,
              amount: formatMoneyAmount(summary.principalThisMonth),
            }}
            context="this month"
            monthDelta={{
              value: summary.principalThisMonth - summary.principalLastMonth,
              format: "money",
            }}
            secondary={{
              currency,
              amount: formatMoneyAmount(summary.principalAllTime),
              suffix: "all time",
            }}
            rows={[
              {
                label: "outstanding",
                value: {
                  currency,
                  amount: formatMoneyAmount(summary.outstanding),
                },
                tone: "warn",
              },
              {
                label: "repaid",
                value: {
                  currency,
                  amount: formatMoneyAmount(summary.repaid),
                },
                tone: "good",
              },
            ]}
          />
          <LoansSummaryCard
            title="Expected Interest"
            icon={<Percent className="size-4" />}
            value={{
              currency,
              amount: formatMoneyAmount(summary.expectedInterest),
            }}
            context="from active loans"
            rows={[
              {
                label: "not overdue",
                value: {
                  currency,
                  amount: formatMoneyAmount(summary.interestNotOverdue),
                },
                tone: "good",
              },
              {
                label: "at risk",
                value: {
                  currency,
                  amount: formatMoneyAmount(summary.interestAtRisk),
                },
                tone: "warn",
              },
            ]}
          />
        </section>

        <section className="rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f5] px-4 py-3.5">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h2 className="text-[15px] font-semibold text-[#0b1220]">
                {isManager ? "Loan Records" : "All Loans"}
              </h2>
              <select
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as PortfolioFilter)
                }
                className="h-9 w-full rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold outline-none sm:w-[170px]"
              >
                <option value="all">All Loans</option>
                <option value="active">Active Loans</option>
                <option value="closed">Closed Loans</option>
                <option value="overdue">Overdue Loans</option>
              </select>
              <LoansFiltersControl
                officers={officerOptions}
                applied={advancedFilters}
                onApply={setAdvancedFilters}
              />
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {canCreate ? (
                <button
                  type="button"
                  onClick={() => {
                    setPanelError(null);
                    setCreateMode("new");
                    setAddOpen(true);
                  }}
                  className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3.5 text-xs font-semibold text-[#111a2e] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-[#f8faf9]"
                >
                  <Plus className="size-3.5" />
                  New Loan
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
            </div>
          </div>

          <div className="overflow-hidden rounded-b-[16px]">
            {/* Mobile / narrow: stacked loan cards — no horizontal scroll */}
            <div className="divide-y divide-[#edf1f5] xl:hidden">
              {loading ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  Loading loans...
                </p>
              ) : filtered.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  No loans match this view.
                </p>
              ) : (
                paged.items.map((loan) => {
                  const dueState = resolveLoanDueState(loan);
                  const selected = detailLoan?.id === loan.id;
                  return (
                    <article
                      key={loan.id}
                      className={`cursor-pointer px-4 py-3.5 transition-colors hover:bg-[#eef7f2] ${
                        selected
                          ? "bg-[#eef7f2] shadow-[inset_3px_0_0_0_#07885f]"
                          : ""
                      }`}
                      onClick={() => {
                        if (loan.applicationId) setDetailLoan(loan);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] font-semibold text-slate-500">
                            {shortLoanId(loan.id)}
                          </p>
                          <p className="mt-0.5 truncate text-[13px] font-semibold text-[#0b1220]">
                            {loan.borrowerName}
                          </p>
                          <p className="truncate text-[11px] text-slate-500">
                            {loan.phone}
                          </p>
                        </div>
                        <div
                          className="shrink-0"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <LoanStatusBadge dueState={dueState} />
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <LoanCardMetric
                          label="Principal"
                          value={
                            <Money
                              value={loan.principal}
                              currency={currency}
                              stack
                            />
                          }
                        />
                        <LoanCardMetric
                          label="Total repayable"
                          value={
                            <Money
                              value={loanTotalRepayable(loan)}
                              currency={currency}
                              stack
                            />
                          }
                        />
                        <LoanCardMetric
                          label="Repaid"
                          value={
                            <Money
                              value={loan.paidAmount}
                              currency={currency}
                              stack
                              className="text-[var(--forest-emerald)]"
                            />
                          }
                        />
                        <LoanCardMetric
                          label="Outstanding"
                          value={
                            <Money
                              value={loan.balance}
                              currency={currency}
                              stack
                            />
                          }
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
                        <div className="min-w-0 text-[11px] text-slate-600">
                          <p className="truncate">
                            {loan.loanTypeName
                              ? titleCase(loan.loanTypeName)
                              : "—"}
                          </p>
                          <p className="mt-0.5 truncate">
                            By {loan.officerName?.trim() || "—"}
                          </p>
                          <div className="mt-1">
                            <NextDueCell loan={loan} dueState={dueState} />
                          </div>
                        </div>
                        <div onClick={(event) => event.stopPropagation()}>
                          <RowActions
                            label={`Actions for ${loan.borrowerName}`}
                            busy={agreementBusyId === loan.id}
                            items={loanRowActions(
                              loan,
                              canRecordRepayment,
                              setDetailLoan,
                              setRepaymentLoan,
                              downloadLoanAgreement,
                            )}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {/* Desktop: full-width table, no horizontal scroll */}
            <div className="hidden xl:block">
              <table className="w-full table-fixed text-left text-[11px]">
                <thead className="border-b border-[#dfe5eb] bg-[#e8edf2] text-[10px] font-semibold text-slate-600">
                  <tr>
                    <th className="w-[7%] px-2 py-2.5">Loan ID</th>
                    <th className="w-[14%] px-2 py-2.5">Borrower</th>
                    <th className="w-[11%] px-2 py-2.5">Loan Type</th>
                    <th className="w-[9%] px-2 py-2.5 text-right">Principal</th>
                    <th className="w-[10%] px-2 py-2.5 text-right">
                      Total Repayable
                    </th>
                    <th className="w-[9%] px-2 py-2.5 text-right">Repaid</th>
                    <th className="w-[10%] px-2 py-2.5 text-right">
                      Outstanding
                    </th>
                    <th className="w-[11%] px-2 py-2.5">Next Due</th>
                    <th className="w-[8%] px-2 py-2.5">Status</th>
                    <th className="w-[8%] px-2 py-2.5">Issued By</th>
                    <th className="w-[3%] px-1 py-2.5 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f5]">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={11}
                        className="px-3 py-8 text-center text-slate-500"
                      >
                        Loading loans...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={11}
                        className="px-3 py-8 text-center text-slate-500"
                      >
                        No loans match this view.
                      </td>
                    </tr>
                  ) : (
                    paged.items.map((loan) => {
                      const dueState = resolveLoanDueState(loan);
                      const selected = detailLoan?.id === loan.id;
                      return (
                        <tr
                          key={loan.id}
                          className={`cursor-pointer transition-colors hover:bg-[#eef7f2] ${
                            selected
                              ? "bg-[#eef7f2] shadow-[inset_3px_0_0_0_#07885f]"
                              : ""
                          }`}
                          onClick={() => {
                            if (loan.applicationId) {
                              setDetailLoan(loan);
                            }
                          }}
                        >
                          <td className="px-2 py-2.5 align-top">
                            <p className="break-all font-bold tabular-nums text-[#0b1220]">
                              {shortLoanId(loan.id)}
                            </p>
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <p className="break-words font-semibold leading-snug text-[#0b1220]">
                              {loan.borrowerName}
                            </p>
                            <p className="mt-0.5 break-all text-[10px] text-slate-500">
                              {loan.phone}
                            </p>
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <p className="break-words leading-snug">
                              {loan.loanTypeName
                                ? titleCase(loan.loanTypeName)
                                : "-"}
                            </p>
                          </td>
                          <td className="px-2 py-2.5 align-top text-right">
                            <Money
                              value={loan.principal}
                              currency={currency}
                              stack
                            />
                          </td>
                          <td className="px-2 py-2.5 align-top text-right">
                            <Money
                              value={loanTotalRepayable(loan)}
                              currency={currency}
                              stack
                            />
                          </td>
                          <td className="px-2 py-2.5 align-top text-right text-[var(--forest-emerald)]">
                            <Money
                              value={loan.paidAmount}
                              currency={currency}
                              stack
                            />
                          </td>
                          <td className="px-2 py-2.5 align-top text-right">
                            <Money
                              value={loan.balance}
                              currency={currency}
                              stack
                            />
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <NextDueCell loan={loan} dueState={dueState} />
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <LoanStatusBadge dueState={dueState} />
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <p className="break-words leading-snug text-slate-700">
                              {loan.officerName?.trim() || "-"}
                            </p>
                          </td>
                          <td
                            className="px-1 py-2.5 align-top"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <RowActions
                              label={`Actions for ${loan.borrowerName}`}
                              busy={agreementBusyId === loan.id}
                              items={loanRowActions(
                                loan,
                                canRecordRepayment,
                                setDetailLoan,
                                setRepaymentLoan,
                                downloadLoanAgreement,
                              )}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          <PaginationControls
            page={paged.currentPage}
            pageSize={paged.pageSize}
            total={paged.total}
            itemLabel="loans"
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
            }}
          />
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

      {state.session ? (
        <>
          <ApplicationDetailDrawer
            applicationId={detailLoan?.applicationId ?? null}
            accessToken={state.session.accessToken}
            tokenType={state.session.tokenType}
            customerId={detailLoan?.customerId}
            loanDisplayId={detailLoan ? shortLoanId(detailLoan.id) : null}
            loanStatusLabel={
              detailLoan
                ? loanDueStatusLabel(resolveLoanDueState(detailLoan))
                : null
            }
            loan={
              detailLoan
                ? {
                    id: detailLoan.id,
                    borrowerName: detailLoan.borrowerName,
                    phone: detailLoan.phone,
                    loanTypeName: detailLoan.loanTypeName,
                    principal: detailLoan.principal,
                    currency: detailLoan.currency || currency,
                    disbursedAt: detailLoan.disbursedAt,
                    officerName: detailLoan.officerName,
                    officerPublicId: detailLoan.officerPublicId ?? null,
                    balance: detailLoan.balance,
                    paidAmount: detailLoan.paidAmount,
                    totalRepayable: loanTotalRepayable(detailLoan),
                    openingBalance: detailLoan.openingBalance,
                    expectedInterest: expectedInterestForLoan(detailLoan),
                    processingFee: detailLoan.processingFee,
                    installmentAmount: detailLoan.installmentAmount,
                    overdueDays: resolveOverdueDays(detailLoan, new Date()),
                    nextDueDate: detailLoan.nextDueDate,
                    durationDays: detailLoan.durationDays,
                    dueDate: detailLoan.dueDate,
                    status: detailLoan.status,
                  }
                : null
            }
            canRecordRepayment={canRecordRepayment}
            onRecordRepayment={
              detailLoan && canRecordRepayment
                ? () => {
                    setRepaymentLoan(detailLoan);
                  }
                : undefined
            }
            refreshKey={detailRefreshKey}
            onClose={() => setDetailLoan(null)}
          />
          {isManager ? (
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
          ) : null}
          <RecordRepaymentModal
            open={Boolean(repaymentLoan)}
            loan={
              repaymentLoan
                ? {
                    id: repaymentLoan.id,
                    borrowerName: repaymentLoan.borrowerName,
                    phone: repaymentLoan.phone,
                    balance: repaymentLoan.balance,
                    currency: repaymentLoan.currency || currency,
                  }
                : null
            }
            accessToken={state.session.accessToken}
            tokenType={state.session.tokenType}
            onClose={() => setRepaymentLoan(null)}
            onRecorded={() => {
              setNotice("Repayment recorded.");
              setDetailRefreshKey((key) => key + 1);
              void loadLoans();
            }}
          />
        </>
      ) : null}
    </AppShell>
  );
}

const SUMMARY_ROW_TONE = {
  good: {
    shell: "bg-[#eef9f2]",
    dot: "bg-[#17a36a]",
  },
  warn: {
    shell: "bg-[#fff3e8]",
    dot: "bg-[#f0a04b]",
  },
  neutral: {
    shell: "bg-[#f3f5f7]",
    dot: "bg-[#94a3b8]",
  },
} as const;

type SummaryAmount = {
  amount: string;
  currency?: string;
  suffix?: string;
};

type MonthDelta = {
  value: number;
  format: "number" | "money";
};

function LoansSummaryCard({
  title,
  icon,
  value,
  context,
  monthDelta,
  secondary,
  rows,
}: {
  title: string;
  icon: ReactNode;
  value: SummaryAmount;
  context: string;
  monthDelta?: MonthDelta;
  secondary?: SummaryAmount;
  rows: Array<{
    label: string;
    value: SummaryAmount;
    tone: keyof typeof SUMMARY_ROW_TONE;
  }>;
}) {
  return (
    <article className="overflow-hidden rounded-[14px] border border-[#e8edf2] bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e9f8ef] text-[#07885f] [&_svg]:size-3.5">
          {icon}
        </span>
        <h3 className="truncate text-[13px] font-bold tracking-[-0.02em] text-[#0b1220]">
          {title}
        </h3>
      </div>

      <div className="mt-2.5 flex items-stretch gap-2">
        <div className="flex min-w-0 flex-[1.15] flex-col justify-center overflow-hidden pr-0.5">
          <SummaryMetric value={value} size="lg" />
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="text-[11px] font-medium leading-tight text-slate-500">
              {context}
            </p>
            {monthDelta ? <MonthDeltaBadge delta={monthDelta} /> : null}
          </div>
          {secondary ? (
            <div className="mt-1 min-w-0">
              <SummaryMetric value={secondary} size="sm" />
            </div>
          ) : null}
        </div>

        <div className="w-px shrink-0 bg-[#edf1f5]" aria-hidden />

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          {rows.map((row) => {
            const tone = SUMMARY_ROW_TONE[row.tone];
            return (
              <div
                key={row.label}
                className={`flex min-w-0 items-start gap-1.5 rounded-lg px-1.5 py-1.5 ${tone.shell}`}
              >
                <span
                  className={`mt-1 size-2 shrink-0 rounded-full ${tone.dot}`}
                />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <SummaryMetric value={row.value} size="chip" />
                  <p className="mt-0.5 truncate text-[10px] font-medium capitalize leading-tight text-slate-500">
                    {row.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}

function MonthDeltaBadge({ delta }: { delta: MonthDelta }) {
  const up = delta.value > 0;
  const down = delta.value < 0;
  const absolute = Math.abs(delta.value);
  const label =
    delta.format === "money"
      ? formatMoneyAmount(absolute)
      : formatNumber(absolute);
  const tone = down
    ? "bg-[#fdecec] text-[#c23b3b]"
    : "bg-[#e9f8ef] text-[#07885f]";

  return (
    <>
      <span
        className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${tone}`}
      >
        {down ? (
          <ArrowDown className="size-2.5 stroke-[2.5]" />
        ) : (
          <ArrowUp className="size-2.5 stroke-[2.5]" />
        )}
        {up || down ? label : formatNumber(0)}
      </span>
      <span className="text-[10px] font-medium text-slate-400">
        vs last month
      </span>
    </>
  );
}

function SummaryMetric({
  value,
  size,
}: {
  value: SummaryAmount;
  size: "lg" | "sm" | "chip";
}) {
  const amountClass =
    size === "lg"
      ? "text-[clamp(0.95rem,1.35vw,1.35rem)] font-bold leading-none tracking-[-0.03em] text-[#0b1220]"
      : size === "sm"
        ? "text-[11px] font-semibold leading-none text-[#334155]"
        : "text-[clamp(0.68rem,0.95vw,0.78rem)] font-bold leading-none tracking-[-0.02em] text-[#0b1220]";

  const currencyClass =
    size === "lg"
      ? "text-[9px] font-semibold uppercase tracking-[0.04em] text-slate-500"
      : size === "sm"
        ? "text-[9px] font-semibold uppercase tracking-[0.03em] text-slate-500"
        : "text-[8px] font-semibold uppercase tracking-[0.03em] text-slate-500";

  // Money: stack currency above amount so full figures stay readable in tight cards.
  if (value.currency) {
    return (
      <div className="min-w-0 max-w-full tabular-nums">
        <p className={currencyClass}>{value.currency}</p>
        <p
          className={`mt-0.5 min-w-0 truncate whitespace-nowrap ${amountClass}`}
          title={`${value.currency} ${value.amount}`}
        >
          {value.amount}
        </p>
        {value.suffix ? (
          <p className="mt-0.5 text-[10px] font-medium text-slate-500">
            {value.suffix}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <p className="inline-flex max-w-full min-w-0 items-baseline gap-1 tabular-nums">
      <span className={`min-w-0 truncate ${amountClass}`}>{value.amount}</span>
      {value.suffix ? (
        <span className="shrink-0 text-[0.85em] font-medium text-slate-500">
          {value.suffix}
        </span>
      ) : null}
    </p>
  );
}

function buildLoansSummary(loans: LoanRow[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const issuedThisMonth = loans.filter((loan) =>
    isOnOrAfter(loanIssueDate(loan), monthStart),
  );
  const issuedLastMonth = loans.filter((loan) => {
    const issued = loanIssueDate(loan);
    return isOnOrAfter(issued, lastMonthStart) && issued < monthStart;
  });
  const activeLoans = loans.filter((loan) => ACTIVE_STATUSES.has(loan.status));
  const closedCount = loans.filter((loan) => loan.status === "CLOSED").length;

  let interestNotOverdue = 0;
  let interestAtRisk = 0;
  let overdueCount = 0;
  let overdueBy2PlusCount = 0;
  let overdueBalance = 0;
  for (const loan of activeLoans) {
    const interest = expectedInterestForLoan(loan);
    const overdueDays = resolveOverdueDays(loan, now);
    if (overdueDays >= 4) {
      interestAtRisk += interest;
    } else {
      interestNotOverdue += interest;
    }
    if (overdueDays >= 1) {
      overdueCount += 1;
      overdueBalance += Math.max(0, loan.balance);
      if (overdueDays >= 2) overdueBy2PlusCount += 1;
    }
  }

  const overduePercent =
    activeLoans.length > 0 ? (overdueCount / activeLoans.length) * 100 : 0;
  const overduePercentLabel =
    overduePercent >= 10
      ? `${Math.round(overduePercent)}%`
      : `${overduePercent.toFixed(1)}%`;

  return {
    issuedThisMonth: issuedThisMonth.length,
    issuedLastMonth: issuedLastMonth.length,
    issuedAllTime: loans.length,
    activeCount: activeLoans.length,
    closedCount,
    overdueCount,
    overduePercentLabel,
    overdueBalance,
    overdueBy2PlusCount,
    principalThisMonth: sumBy(issuedThisMonth, (loan) => loan.principal),
    principalLastMonth: sumBy(issuedLastMonth, (loan) => loan.principal),
    principalAllTime: sumBy(loans, (loan) => loan.principal),
    outstanding: sumBy(activeLoans, (loan) => loan.balance),
    repaid: sumBy(loans, (loan) => loan.paidAmount),
    expectedInterest: interestNotOverdue + interestAtRisk,
    interestNotOverdue,
    interestAtRisk,
  };
}

function expectedInterestForLoan(loan: LoanRow) {
  if (typeof loan.expectedInterest === "number") {
    return Math.max(0, loan.expectedInterest);
  }
  const base =
    typeof loan.openingBalance === "number"
      ? loan.openingBalance
      : loanTotalRepayable(loan) - Math.max(0, loan.finesTotal ?? 0);
  return Math.max(
    0,
    base - loan.principal - Math.max(0, loan.processingFee ?? 0),
  );
}

function resolveOverdueDays(loan: LoanRow, today: Date) {
  if (typeof loan.overdueDays === "number") return Math.max(0, loan.overdueDays);
  return loanOverdueDaysFallback(loan, today);
}

type LoanDueState = "closed" | "overdue" | "due_today" | "active";

function resolveLoanDueState(loan: LoanRow): LoanDueState {
  if (loan.status === "CLOSED" || loan.status === "WRITTEN_OFF" || loan.balance <= 0) {
    return "closed";
  }
  const overdueDays = resolveOverdueDays(loan, new Date());
  const label = loan.nextDueLabel?.trim().toLowerCase() ?? "";
  if (overdueDays >= 2 || label === "overdue") return "overdue";
  if (loan.nextDueIsToday || overdueDays === 1 || label === "due today") {
    return "due_today";
  }
  return "active";
}

function loanDueStatusLabel(state: LoanDueState) {
  if (state === "overdue") return "Overdue";
  if (state === "due_today") return "Due Today";
  if (state === "closed") return "Closed";
  return "Active";
}

function LoanCardMetric({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-[#f7faf8] px-2.5 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">
        {label}
      </p>
      <div className="mt-1 flex justify-end">{value}</div>
    </div>
  );
}

function loanRowActions(
  loan: LoanRow,
  canRecordRepayment: boolean,
  setDetailLoan: (loan: LoanRow) => void,
  setRepaymentLoan: (loan: LoanRow) => void,
  downloadLoanAgreement: (applicationId: string, loanId: string) => void,
) {
  return [
    {
      label: "View details",
      disabled: !loan.applicationId,
      onSelect: () => {
        if (loan.applicationId) setDetailLoan(loan);
      },
    },
    {
      label: "Record repayment",
      disabled:
        !canRecordRepayment ||
        loan.balance <= 0 ||
        loan.status === "CLOSED",
      onSelect: () => setRepaymentLoan(loan),
    },
    {
      label: "View borrower",
      href: `/clients/${loan.customerId}`,
    },
    {
      label: "Loan agreement",
      disabled: !loan.applicationId,
      onSelect: () => {
        if (loan.applicationId) {
          void downloadLoanAgreement(loan.applicationId, loan.id);
        }
      },
    },
  ];
}

function NextDueCell({
  loan,
  dueState,
}: {
  loan: LoanRow;
  dueState: LoanDueState;
}) {
  if (dueState === "closed") {
    return <span className="text-slate-400">—</span>;
  }

  const dateLabel = formatDate(loan.nextDueDate ?? loan.dueDate);
  const overdueDays = resolveOverdueDays(loan, new Date());

  return (
    <div className="min-w-0">
      <p className="truncate font-medium tabular-nums text-[#0b1220]">
        {dateLabel}
      </p>
      {dueState === "overdue" ? (
        <p className="mt-0.5 truncate text-[10px] font-semibold text-[#c23b3b]">
          {overdueDays} day{overdueDays === 1 ? "" : "s"} overdue
        </p>
      ) : null}
      {dueState === "due_today" ? (
        <p className="mt-0.5 truncate text-[10px] font-semibold text-[#d97706]">
          Due today
        </p>
      ) : null}
    </div>
  );
}

function LoanStatusBadge({ dueState }: { dueState: LoanDueState }) {
  const tone =
    dueState === "closed"
      ? "bg-[#f3f5f7] text-slate-600"
      : dueState === "overdue"
        ? "bg-[#fdecec] text-[#c23b3b]"
        : dueState === "due_today"
          ? "bg-[#fff3e8] text-[#d97706]"
          : "bg-[#e9f8ef] text-[#07885f]";
  const label =
    dueState === "closed"
      ? "Closed"
      : dueState === "overdue"
        ? "Overdue"
        : dueState === "due_today"
          ? "Due Today"
          : "Active";

  return (
    <span
      className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

function formatLoanStatus(status: string, overdueDays?: number) {
  const normalized = status.toUpperCase();
  if (normalized === "CLOSED") return "Closed";
  if (normalized === "WRITTEN_OFF") return "Written Off";
  if (
    normalized === "IN_ARREARS" ||
    (typeof overdueDays === "number" && overdueDays >= 1)
  ) {
    return "Overdue";
  }
  if (
    normalized === "DISBURSED" ||
    normalized === "CURRENT" ||
    normalized === "RESTRUCTURED" ||
    normalized === "APPROVED" ||
    normalized === "SUBMITTED"
  ) {
    return "Active";
  }
  return titleCase(status.replaceAll("_", " "));
}

/** Fallback when API overdueDays is missing (legacy payloads). */
function loanOverdueDaysFallback(loan: LoanRow, today: Date) {
  if (loan.balance <= 0 || loan.installmentAmount <= 0) return 0;
  const startRaw = loan.paymentStartDate ?? loan.disbursedAt ?? loan.createdAt;
  const startAt = new Date(startRaw);
  if (Number.isNaN(startAt.getTime())) return 0;

  const start = startOfLocalDay(startAt);
  const todayStart = startOfLocalDay(today);
  if (todayStart < start) return 0;

  const dueAt = loan.dueDate ? new Date(loan.dueDate) : null;
  const end =
    dueAt && !Number.isNaN(dueAt.getTime()) && dueAt < todayStart
      ? startOfLocalDay(dueAt)
      : todayStart;
  const elapsedDays =
    Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const expectedDays =
    loan.durationDays != null && loan.durationDays > 0
      ? Math.min(elapsedDays, loan.durationDays)
      : elapsedDays;
  if (expectedDays <= 0) return 0;

  const coveredDays = Math.min(
    expectedDays,
    Math.floor(Math.max(0, loan.paidAmount) / loan.installmentAmount),
  );
  return Math.max(0, expectedDays - coveredDays);
}

function loanIssueDate(loan: LoanRow) {
  return new Date(loan.disbursedAt ?? loan.createdAt);
}

function isOnOrAfter(value: Date, boundary: Date) {
  if (Number.isNaN(value.getTime())) return false;
  return value.getTime() >= boundary.getTime();
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
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
    worksheet.addRow(["REMBEH Loan Records"]);
    worksheet.mergeCells(1, 1, 1, 11);
    worksheet.addRow([
      "Loan ID",
      "Borrower",
      "Phone",
      "Loan Type",
      "Principal",
      "Total Repayable",
      "Repaid",
      "Outstanding",
      "Next Due",
      "Status",
      "Issued By",
    ]);
    rows.forEach((loan) => {
      worksheet.addRow([
        loan.id,
        loan.borrowerName,
        loan.phone,
        loan.loanTypeName ? titleCase(loan.loanTypeName) : "",
        loan.principal,
        loanTotalRepayable(loan),
        loan.paidAmount,
        loan.balance,
        loan.nextDueLabel?.trim() ||
          formatDate(loan.nextDueDate ?? loan.dueDate),
        formatLoanStatus(loan.status, loan.overdueDays),
        loan.officerName?.trim() || "",
      ]);
    });
    worksheet.columns = [
      { width: 18 },
      { width: 24 },
      { width: 16 },
      { width: 18 },
      { width: 14 },
      { width: 16 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 12 },
      { width: 18 },
    ];
    worksheet.getRow(1).font = { bold: true, size: 16 };
    worksheet.getRow(2).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F8F68" },
    };
    [5, 6, 7, 8].forEach((column) => {
      worksheet.getColumn(column).numFmt = `"${currency}" #,##0`;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rembeh-loan-records.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    setExporting(false);
  }
}

/** Compact UI id — full database id stays for API/export/search. */
function shortLoanId(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}
