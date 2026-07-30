"use client";

import { Download, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OwnerPage,
  OwnerPanel,
  OwnerRepayment,
  OwnerStat,
  formatDate,
  formatMoney,
  formatNumber,
  ownerFetch,
  sumBy,
  titleCase,
  useOwnerSession,
} from "../owner-common";

type PaymentFilter = "collectedToday" | "all" | "yesterday" | "thisWeek";

export default function OwnerPaymentsPage() {
  const state = useOwnerSession("/owner/payments");
  const [repayments, setRepayments] = useState<OwnerRepayment[]>([]);
  const [filter, setFilter] = useState<PaymentFilter>("collectedToday");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency = state.workspace?.currency ?? "UGX";

  const loadPayments = useCallback(async () => {
    if (!state.session) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await ownerFetch<{ repayments?: OwnerRepayment[] }>(
        state.session,
        `/collections/repayments?filter=${filter}`,
      );
      setRepayments(payload.repayments ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load payments.",
      );
    } finally {
      setLoading(false);
    }
  }, [filter, state.session]);

  useEffect(() => {
    if (state.ready && state.session) {
      void loadPayments();
    }
  }, [loadPayments, state.ready, state.session]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return repayments;
    return repayments.filter((payment) =>
      [
        payment.clientName,
        payment.phone,
        payment.loanId,
        payment.method,
        payment.recordedByName,
      ].some((value) => value.toLowerCase().includes(q)),
    );
  }, [repayments, search]);

  return (
    <OwnerPage
      state={state}
      title="Payments"
      eyebrow="Collections"
      actions={
        <>
          <button
            type="button"
            className="btn btn-ghost h-9 text-xs"
            onClick={() => void loadPayments()}
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
              void exportPayments(filtered, currency, setExporting)
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OwnerStat label="Payments" value={formatNumber(filtered.length)} />
        <OwnerStat
          label="Collected"
          value={formatMoney(
            sumBy(filtered, (payment) => payment.amount),
            currency,
          )}
          tone="green"
        />
        <OwnerStat
          label="Borrowers served"
          value={formatNumber(
            new Set(filtered.map((item) => item.customerId)).size,
          )}
          tone="blue"
        />
        <OwnerStat
          label="Current view"
          value={titleCase(filter)}
          tone="slate"
        />
      </div>

      <OwnerPanel title="Payment Records" meta={`${filtered.length} shown`}>
        <div className="grid gap-2 border-b border-[var(--line)] bg-white p-3 md:grid-cols-[1fr_180px]">
          <label className="flex h-10 items-center gap-2 border border-[var(--line)] px-3 text-sm">
            <Search className="size-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none"
              placeholder="Search borrower, phone, loan or officer"
            />
          </label>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as PaymentFilter)}
            className="h-10 border border-[var(--line)] bg-white px-3 text-sm font-semibold outline-none"
          >
            <option value="collectedToday">Collected today</option>
            <option value="all">All payments</option>
            <option value="yesterday">Yesterday</option>
            <option value="thisWeek">This week</option>
          </select>
        </div>
        <table className="w-full table-fixed text-left text-xs">
          <thead className="bg-[#e5ece8] text-[10px] font-bold text-slate-500">
            <tr>
              <th className="w-[21%] px-3 py-2">Borrower</th>
              <th className="w-[14%] px-3 py-2">Phone</th>
              <th className="w-[15%] px-3 py-2">Loan</th>
              <th className="w-[13%] px-3 py-2 text-right">Amount</th>
              <th className="w-[13%] px-3 py-2">Method</th>
              <th className="w-[12%] px-3 py-2">Officer</th>
              <th className="w-[12%] px-3 py-2">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] bg-white">
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-slate-500"
                >
                  Loading payments...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-slate-500"
                >
                  No payments match this view.
                </td>
              </tr>
            ) : (
              filtered.slice(0, 80).map((payment) => (
                <tr key={payment.id}>
                  <td className="px-3 py-3 font-bold text-[var(--midnight-navy)]">
                    {payment.clientName}
                  </td>
                  <td className="px-3 py-3">{payment.phone}</td>
                  <td className="px-3 py-3">{payment.loanId}</td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-[var(--forest-emerald)]">
                    {formatMoney(payment.amount, currency)}
                  </td>
                  <td className="px-3 py-3">{titleCase(payment.method)}</td>
                  <td className="px-3 py-3">{payment.recordedByName}</td>
                  <td className="px-3 py-3">
                    {formatDate(payment.recordedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </OwnerPanel>
    </OwnerPage>
  );
}

async function exportPayments(
  rows: OwnerRepayment[],
  currency: string,
  setExporting: (exporting: boolean) => void,
) {
  setExporting(true);
  try {
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Payments");
    worksheet.addRow(["REMBEH Owner Payments"]);
    worksheet.mergeCells(1, 1, 1, 7);
    worksheet.addRow([
      "Borrower",
      "Phone",
      "Loan",
      "Amount",
      "Method",
      "Officer",
      "Date",
    ]);
    rows.forEach((payment) => {
      worksheet.addRow([
        payment.clientName,
        payment.phone,
        payment.loanId,
        payment.amount,
        payment.method,
        payment.recordedByName,
        payment.recordedAt,
      ]);
    });
    worksheet.columns = [
      { width: 24 },
      { width: 18 },
      { width: 18 },
      { width: 16 },
      { width: 14 },
      { width: 20 },
      { width: 24 },
    ];
    worksheet.getRow(1).font = { bold: true, size: 16 };
    worksheet.getRow(2).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F8F68" },
    };
    worksheet.getColumn(4).numFmt = `"${currency}" #,##0`;
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rembeh-owner-payments.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    setExporting(false);
  }
}
