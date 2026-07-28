"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
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
  installmentAmount: number;
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

const LOAN_FILTER_OPTIONS: Array<{ value: LoanFilter; label: string }> = [
  { value: "today", label: "Today's loans" },
  { value: "all", label: "All loans" },
  { value: "active", label: "Active loans" },
  { value: "completed", label: "Completed loans" },
  { value: "dueToday", label: "Due today" },
  { value: "overdue", label: "Overdue loans" },
  { value: "closedThisMonth", label: "Closed this month" },
];

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
  const [exporting, setExporting] = useState(false);
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

  const activeFilterLabel = loanFilterLabel(filter);
  const trimmedSearch = search.trim();

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

  async function exportFilteredLoans() {
    if (exporting || filteredLoans.length === 0) return;
    setExporting(true);
    setNotice(null);
    setError(null);

    try {
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet("Loans");
      const currency = filteredLoans[0]?.currency ?? loanStats.currency;
      const exportedAt = new Date();
      const headers = [
        "Loan Id",
        "Borrower",
        "Phone",
        "National Id",
        "Loan Type",
        "Status",
        "Principal",
        "Installment",
        "Paid",
        "Balance",
        "Next Due",
        "Officer",
        "Issued At",
      ];

      workbook.creator = "REMBEH";
      workbook.created = exportedAt;
      workbook.modified = exportedAt;

      worksheet.addRow(["REMBEH Loans Report"]);
      worksheet.mergeCells(1, 1, 1, headers.length);
      worksheet.addRow([
        `${workspace?.name ?? "Account"}${branch?.name ? ` · ${branch.name}` : ""}`,
      ]);
      worksheet.mergeCells(2, 1, 2, headers.length);
      worksheet.addRow([
        `Showing: ${activeFilterLabel}${trimmedSearch ? ` · Search: ${trimmedSearch}` : ""} · Exported: ${formatDateTime(exportedAt)}`,
      ]);
      worksheet.mergeCells(3, 1, 3, headers.length);
      worksheet.addRow([
        "Loans",
        filteredLoans.length,
        "Principal",
        sumMoney(filteredLoans, "principal"),
        "Installments",
        sumMoney(filteredLoans, "installmentAmount"),
        "Paid",
        sumMoney(filteredLoans, "paidAmount"),
        "Balance",
        sumMoney(filteredLoans, "balance"),
      ]);
      worksheet.addRow([]);

      const headerRow = worksheet.addRow(headers);

      filteredLoans.forEach((loan) => {
        worksheet.addRow([
          loan.id.toUpperCase(),
          loan.borrowerName,
          loan.phone,
          loan.nationalId ?? "",
          loan.loanTypeName || "Standard Loan",
          loanStatusLabel(loan.status),
          loan.principal,
          loan.installmentAmount,
          loan.paidAmount,
          loan.balance,
          parseDate(loan.dueDate) ?? "",
          loan.officerName || "",
          loanDate(loan) ?? "",
        ]);
      });

      const totalsRow = worksheet.addRow([
        "",
        "",
        "",
        "",
        "",
        "Totals",
        sumMoney(filteredLoans, "principal"),
        sumMoney(filteredLoans, "installmentAmount"),
        sumMoney(filteredLoans, "paidAmount"),
        sumMoney(filteredLoans, "balance"),
      ]);

      worksheet.columns = [
        { width: 18 },
        { width: 24 },
        { width: 17 },
        { width: 18 },
        { width: 20 },
        { width: 14 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 15 },
        { width: 18 },
        { width: 15 },
      ];
      worksheet.views = [{ state: "frozen", ySplit: headerRow.number }];
      worksheet.autoFilter = {
        from: { row: headerRow.number, column: 1 },
        to: { row: headerRow.number, column: headers.length },
      };

      worksheet.getRow(1).height = 24;
      worksheet.getRow(1).font = {
        bold: true,
        color: { argb: "FFFFFFFF" },
        size: 16,
      };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF14213D" },
      };
      worksheet.getRow(1).alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      [2, 3].forEach((rowNumber) => {
        const row = worksheet.getRow(rowNumber);
        row.font = {
          bold: rowNumber === 2,
          color: { argb: rowNumber === 2 ? "FF14213D" : "FF516171" },
          size: rowNumber === 2 ? 12 : 10,
        };
        row.alignment = { horizontal: "center" };
      });

      const summaryRow = worksheet.getRow(4);
      summaryRow.height = 22;
      summaryRow.eachCell((cell, columnNumber) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: columnNumber % 2 === 1 ? "FFE8EEEB" : "FFFFFFFF" },
        };
        cell.border = excelBorder();
        cell.font = {
          bold: true,
          color: { argb: "FF14213D" },
          size: 10,
        };
        if ([4, 6, 8, 10].includes(columnNumber)) {
          cell.numFmt = `"${currency}" #,##0`;
        }
      });

      headerRow.height = 24;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0F8A6C" },
        };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = excelBorder();
      });

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRow.number) return;
        row.eachCell((cell, columnNumber) => {
          cell.border = excelBorder();
          cell.alignment = {
            vertical: "middle",
            horizontal:
              columnNumber >= 7 && columnNumber <= 10 ? "right" : "left",
          };
          if ([7, 8, 9, 10].includes(columnNumber)) {
            cell.numFmt = `"${currency}" #,##0`;
          }
          if ([11, 13].includes(columnNumber) && cell.value instanceof Date) {
            cell.numFmt = "d mmm yyyy";
          }
          if (rowNumber % 2 === 0 && rowNumber !== totalsRow.number) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFBFDFC" },
            };
          }
        });
      });

      totalsRow.eachCell((cell, columnNumber) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE8EEEB" },
        };
        cell.font = {
          bold: true,
          color: { argb: "FF14213D" },
          size: 10,
        };
        if ([7, 8, 9, 10].includes(columnNumber)) {
          cell.numFmt = `"${currency}" #,##0`;
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFileName(`${workspace?.name ?? "rembeh"}-${activeFilterLabel}-loans-${formatFileDate(exportedAt)}`)}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Loans exported.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not export loans.",
      );
    } finally {
      setExporting(false);
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

        <section className="grid w-full min-w-0 grid-cols-6 gap-1 sm:gap-1.5 xl:gap-2">
          <LoanStatCard
            icon={<Plus className="size-4" />}
            label="loans issued today"
            value={String(loanStats.issuedToday)}
            hint={formatMoney(
              loanStats.issuedTodayPrincipal,
              loanStats.currency,
            )}
            tone="good"
          />
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

        <div className="panel grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 border-[var(--forest-emerald)] bg-white/95 p-2 shadow-[0_8px_20px_rgba(15,138,108,0.07)]">
          <label className="flex h-9 min-w-0 items-center gap-2 px-2">
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by loan id, borrower, phone or agent"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-[var(--midnight-navy)] outline-none placeholder:text-slate-400"
            />
          </label>
          <span className="hidden whitespace-nowrap text-[11px] font-semibold text-slate-500 md:inline">
            {filteredLoans.length} shown
          </span>
          <button
            type="button"
            className="btn btn-ghost h-9 shrink-0 px-2 text-xs sm:px-3"
            onClick={() => void exportFilteredLoans()}
            disabled={exporting || filteredLoans.length === 0}
          >
            {exporting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-3.5" />
            )}
            <span className="hidden sm:inline">Export</span>
          </button>
          <label className="flex h-9 min-w-0 shrink-0 items-center gap-1.5 border border-[var(--forest-emerald)] bg-emerald-50/80 px-2 text-xs font-bold text-[var(--midnight-navy)] shadow-[inset_3px_0_0_var(--forest-emerald)] sm:min-w-[210px]">
            <SlidersHorizontal className="size-3.5 shrink-0 text-[var(--forest-emerald)]" />
            <span className="text-[10px] font-bold text-[var(--forest-emerald)]">
              Showing
            </span>
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as LoanFilter);
                setPage(1);
              }}
              className="min-w-0 flex-1 bg-transparent outline-none"
              aria-label="loan filter"
            >
              {LOAN_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {loading && loans.length === 0 ? (
          <TableSkeleton rows={6} columns={9} />
        ) : filteredLoans.length === 0 ? (
          <LoanEmptyState
            filter={filter}
            filterLabel={activeFilterLabel}
            hasAnyLoans={loans.length > 0}
            search={trimmedSearch}
            onClearSearch={
              trimmedSearch
                ? () => {
                    setSearch("");
                    setPage(1);
                  }
                : undefined
            }
            onShowAll={
              filter !== "all"
                ? () => {
                    setFilter("all");
                    setPage(1);
                  }
                : undefined
            }
          />
        ) : (
          <div className="panel overflow-hidden shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
            <table className="w-full table-fixed text-left text-[11px]">
              <thead className="border-b border-[var(--line)] bg-[#e5ece8] text-[9px] capitalize tracking-[0.06em] text-slate-500">
                <tr>
                  <th className="w-[10%] px-2 py-2.5 font-semibold">loan id</th>
                  <th className="w-[17%] px-2 py-2.5 font-semibold">
                    borrower
                  </th>
                  <th className="hidden w-[12%] px-2 py-2.5 font-semibold md:table-cell">
                    loan type
                  </th>
                  <th className="hidden w-[10%] px-2 py-2.5 text-right font-semibold sm:table-cell">
                    principal
                  </th>
                  <th className="hidden w-[10%] px-2 py-2.5 text-right font-semibold md:table-cell">
                    installment
                  </th>
                  <th className="hidden w-[8%] px-2 py-2.5 text-right font-semibold lg:table-cell">
                    paid
                  </th>
                  <th className="w-[12%] px-2 py-2.5 text-right font-semibold">
                    balance
                  </th>
                  <th className="hidden w-[10%] px-2 py-2.5 font-semibold lg:table-cell">
                    next due
                  </th>
                  <th className="hidden w-[7%] px-2 py-2.5 font-semibold xl:table-cell">
                    officer
                  </th>
                  <th className="w-[4%] px-2 py-2.5 text-right font-semibold">
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
                    <td className="hidden px-2 py-3 text-right text-[11px] font-bold tabular-nums text-[var(--midnight-navy)] md:table-cell">
                      {formatMoney(loan.installmentAmount, loan.currency)}
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

function LoanEmptyState({
  filter,
  filterLabel,
  hasAnyLoans,
  search,
  onClearSearch,
  onShowAll,
}: {
  filter: LoanFilter;
  filterLabel: string;
  hasAnyLoans: boolean;
  search: string;
  onClearSearch?: () => void;
  onShowAll?: () => void;
}) {
  const emptyCopy = loanFilterEmptyCopy(filter);
  const title = !hasAnyLoans
    ? "No loans yet"
    : search
      ? `No results in ${filterLabel.toLowerCase()}`
      : emptyCopy.title;
  const detail = !hasAnyLoans
    ? "New loans will appear here after they are given."
    : search
      ? `Nothing matches "${search}". Clear the search or change the filter.`
      : emptyCopy.detail;

  return (
    <div className="panel flex flex-wrap items-center justify-between gap-3 border-emerald-100 bg-white px-4 py-5 shadow-[0_8px_22px_rgba(20,33,61,0.04)]">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[var(--midnight-navy)]">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{detail}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {onClearSearch ? (
          <button
            type="button"
            className="btn btn-ghost h-9 text-xs"
            onClick={onClearSearch}
          >
            <X className="size-3.5" />
            Clear search
          </button>
        ) : null}
        {onShowAll ? (
          <button
            type="button"
            className="btn btn-primary h-9 text-xs"
            onClick={onShowAll}
          >
            All loans
          </button>
        ) : null}
      </div>
    </div>
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
    <article className="panel flex min-h-[76px] min-w-0 items-start gap-1.5 bg-white px-1.5 py-2 shadow-[0_8px_20px_rgba(20,33,61,0.05)] sm:gap-2 sm:px-2 xl:px-3">
      <span
        className={`hidden size-7 shrink-0 place-items-center border md:grid xl:size-8 ${toneClass}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[8px] font-semibold capitalize tracking-[0.06em] text-slate-500 sm:text-[9px] xl:text-[10px]">
          {label}
        </p>
        <p className="mt-1 break-words text-[clamp(0.55rem,1.15vw,1rem)] font-bold leading-tight tabular-nums text-[var(--midnight-navy)]">
          {value}
        </p>
        <p className="mt-0.5 break-words text-[clamp(0.5rem,0.9vw,0.7rem)] leading-tight text-slate-500">
          {hint}
        </p>
      </div>
    </article>
  );
}

function buildLoanStats(loans: LoanRow[]) {
  const currency = loans[0]?.currency ?? "UGX";
  const issuedTodayLoans = loans.filter((loan) =>
    isSameLocalDay(loanDate(loan), new Date()),
  );
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
    issuedToday: issuedTodayLoans.length,
    issuedTodayPrincipal: sumMoney(issuedTodayLoans, "principal"),
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

function loanFilterLabel(filter: LoanFilter) {
  return (
    LOAN_FILTER_OPTIONS.find((option) => option.value === filter)?.label ??
    "All loans"
  );
}

function loanFilterEmptyCopy(filter: LoanFilter) {
  switch (filter) {
    case "today":
      return {
        title: "No loans for today",
        detail: "Change the filter to see loans from another day.",
      };
    case "active":
      return {
        title: "No active loans",
        detail: "Loans still being paid will appear here.",
      };
    case "completed":
      return {
        title: "No completed loans",
        detail: "Fully paid loans will appear here.",
      };
    case "dueToday":
      return {
        title: "No loans due today",
        detail: "Loans with a payment due today will appear here.",
      };
    case "overdue":
      return {
        title: "No overdue loans",
        detail: "Loans past their payment date will appear here.",
      };
    case "closedThisMonth":
      return {
        title: "No loans closed this month",
        detail: "Loans closed this month will appear here.",
      };
    default:
      return {
        title: "No loans to show",
        detail: "Loans will appear here after they are given.",
      };
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

function formatDateTime(value: Date) {
  return value.toLocaleString("en-UG", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function sumMoney(
  loans: LoanRow[],
  field: "balance" | "principal" | "installmentAmount" | "paidAmount",
) {
  return (
    Math.round(loans.reduce((sum, loan) => sum + loan[field], 0) * 100) / 100
  );
}

function excelBorder() {
  return {
    top: { style: "thin" as const, color: { argb: "FFD5DDD9" } },
    left: { style: "thin" as const, color: { argb: "FFD5DDD9" } },
    bottom: { style: "thin" as const, color: { argb: "FFD5DDD9" } },
    right: { style: "thin" as const, color: { argb: "FFD5DDD9" } },
  };
}
