"use client";

import { Download, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OwnerLoan,
  OwnerPage,
  OwnerPanel,
  OwnerStat,
  OwnerStatus,
  formatDate,
  formatMoney,
  formatNumber,
  ownerFetch,
  sumBy,
  useOwnerSession,
} from "../owner-common";

type PortfolioFilter = "all" | "active" | "closed" | "overdue";

const ACTIVE_STATUSES = new Set([
  "SUBMITTED",
  "APPROVED",
  "DISBURSED",
  "CURRENT",
  "IN_ARREARS",
  "RESTRUCTURED",
]);

export default function OwnerPortfolioPage() {
  const state = useOwnerSession("/owner/portfolio");
  const [loans, setLoans] = useState<OwnerLoan[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PortfolioFilter>("active");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency = state.workspace?.currency ?? "UGX";

  const loadLoans = useCallback(async () => {
    if (!state.session) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await ownerFetch<{ loans?: OwnerLoan[] }>(
        state.session,
        "/loans",
      );
      setLoans(payload.loans ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load portfolio.",
      );
    } finally {
      setLoading(false);
    }
  }, [state.session]);

  useEffect(() => {
    if (state.ready && state.session) {
      void loadLoans();
    }
  }, [loadLoans, state.ready, state.session]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = new Date();
    return loans.filter((loan) => {
      if (filter === "active" && !ACTIVE_STATUSES.has(loan.status))
        return false;
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

  return (
    <OwnerPage
      state={state}
      title="Portfolio"
      eyebrow="All Branches"
      actions={
        <>
          <button
            type="button"
            className="btn btn-ghost h-9 text-xs"
            onClick={() => void loadLoans()}
            disabled={loading}
          >
            <RefreshCw
              className={`size-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-primary h-9 text-xs"
            onClick={() =>
              void exportPortfolio(filtered, currency, setExporting)
            }
            disabled={exporting || filtered.length === 0}
          >
            <Download className="size-3.5" />
            {exporting ? "Exporting" : "Export"}
          </button>
        </>
      }
    >
      {error ? (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <OwnerStat label="Loans" value={formatNumber(loans.length)} />
        <OwnerStat
          label="Active loans"
          value={formatNumber(activeLoans.length)}
        />
        <OwnerStat
          label="Principal"
          value={formatMoney(
            sumBy(loans, (loan) => loan.principal),
            currency,
          )}
          tone="blue"
        />
        <OwnerStat
          label="Outstanding"
          value={formatMoney(
            sumBy(activeLoans, (loan) => loan.balance),
            currency,
          )}
          tone="gold"
        />
        <OwnerStat
          label="Paid"
          value={formatMoney(
            sumBy(loans, (loan) => loan.paidAmount),
            currency,
          )}
          tone="green"
        />
      </div>

      <OwnerPanel title="Portfolio Loans" meta={`${filtered.length} shown`}>
        <div className="grid gap-2 border-b border-[var(--line)] bg-white p-3 md:grid-cols-[1fr_190px]">
          <label className="flex h-10 items-center gap-2 border border-[var(--line)] px-3 text-sm">
            <Search className="size-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none"
              placeholder="Search borrower, loan id, phone or officer"
            />
          </label>
          <select
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as PortfolioFilter)
            }
            className="h-10 border border-[var(--line)] bg-white px-3 text-sm font-semibold outline-none"
          >
            <option value="active">Active loans</option>
            <option value="all">All loans</option>
            <option value="closed">Closed loans</option>
            <option value="overdue">Overdue loans</option>
          </select>
        </div>
        <table className="w-full table-fixed text-left text-xs">
          <thead className="bg-[#e5ece8] text-[10px] font-bold text-slate-500">
            <tr>
              <th className="w-[16%] px-3 py-2">Loan</th>
              <th className="w-[19%] px-3 py-2">Borrower</th>
              <th className="w-[15%] px-3 py-2">Loan Type</th>
              <th className="w-[13%] px-3 py-2 text-right">Principal</th>
              <th className="w-[13%] px-3 py-2 text-right">Paid</th>
              <th className="w-[13%] px-3 py-2 text-right">Balance</th>
              <th className="w-[11%] px-3 py-2">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] bg-white">
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
              filtered.slice(0, 50).map((loan) => (
                <tr key={loan.id}>
                  <td className="px-3 py-3">
                    <p className="truncate font-bold text-[var(--midnight-navy)]">
                      {loan.id}
                    </p>
                    <OwnerStatus value={loan.status} />
                  </td>
                  <td className="px-3 py-3">
                    <p className="truncate font-semibold text-[var(--midnight-navy)]">
                      {loan.borrowerName}
                    </p>
                    <p className="mt-1 truncate text-slate-500">{loan.phone}</p>
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
      </OwnerPanel>
    </OwnerPage>
  );
}

async function exportPortfolio(
  rows: OwnerLoan[],
  currency: string,
  setExporting: (exporting: boolean) => void,
) {
  setExporting(true);
  try {
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Portfolio");
    worksheet.addRow(["REMBEH Owner Portfolio"]);
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
    link.download = "rembeh-owner-portfolio.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    setExporting(false);
  }
}
