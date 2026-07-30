"use client";

import { ArrowRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OwnerBorrower,
  OwnerBranch,
  OwnerLoan,
  OwnerPage,
  OwnerPanel,
  OwnerReport,
  OwnerRepayment,
  OwnerStat,
  OwnerStatus,
  formatDate,
  formatMoney,
  formatNumber,
  ownerFetch,
  sumBy,
  useOwnerSession,
} from "./owner-common";

const ACTIVE_STATUSES = new Set([
  "SUBMITTED",
  "APPROVED",
  "DISBURSED",
  "CURRENT",
  "IN_ARREARS",
  "RESTRUCTURED",
]);

export default function OwnerDashboardPage() {
  const state = useOwnerSession("/owner");
  const [branches, setBranches] = useState<OwnerBranch[]>([]);
  const [loans, setLoans] = useState<OwnerLoan[]>([]);
  const [borrowers, setBorrowers] = useState<OwnerBorrower[]>([]);
  const [repayments, setRepayments] = useState<OwnerRepayment[]>([]);
  const [reports, setReports] = useState<OwnerReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currency = state.workspace?.currency ?? "UGX";

  const loadData = useCallback(async () => {
    if (!state.session) return;
    setLoading(true);
    setError(null);
    try {
      const [
        branchPayload,
        loanPayload,
        borrowerPayload,
        repaymentPayload,
        reportPayload,
      ] = await Promise.all([
        ownerFetch<{ branches?: OwnerBranch[] }>(state.session, "/branches"),
        ownerFetch<{ loans?: OwnerLoan[] }>(state.session, "/loans"),
        ownerFetch<{ customers?: OwnerBorrower[] }>(
          state.session,
          "/customers",
        ),
        ownerFetch<{ repayments?: OwnerRepayment[] }>(
          state.session,
          "/collections/repayments?filter=collectedToday",
        ),
        ownerFetch<{ reports?: OwnerReport[] }>(
          state.session,
          "/operations/reports",
        ),
      ]);
      setBranches(branchPayload.branches ?? []);
      setLoans(loanPayload.loans ?? []);
      setBorrowers(borrowerPayload.customers ?? []);
      setRepayments(repaymentPayload.repayments ?? []);
      setReports(reportPayload.reports ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load owner dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, [state.session]);

  useEffect(() => {
    if (state.ready && state.session) {
      void loadData();
    }
  }, [loadData, state.ready, state.session]);

  const activeLoans = useMemo(
    () => loans.filter((loan) => ACTIVE_STATUSES.has(loan.status)),
    [loans],
  );
  const pendingReports = reports.filter(
    (report) => report.status === "SENT_TO_OWNER",
  );
  const outstanding = sumBy(activeLoans, (loan) => loan.balance);
  const collectedToday = sumBy(repayments, (item) => item.amount);
  const activeStaff = sumBy(branches, (branch) => branch.staffSummary.active);

  return (
    <OwnerPage
      state={state}
      title="Owner Overview"
      eyebrow={state.workspace?.name ?? "Account"}
      actions={
        <button
          type="button"
          className="btn btn-ghost h-9 text-xs"
          onClick={() => void loadData()}
          disabled={loading || !state.session}
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      {error ? (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <OwnerStat label="Branches" value={formatNumber(branches.length)} />
        <OwnerStat label="Borrowers" value={formatNumber(borrowers.length)} />
        <OwnerStat
          label="Active loans"
          value={formatNumber(activeLoans.length)}
        />
        <OwnerStat
          label="Outstanding"
          value={formatMoney(outstanding, currency)}
          tone="blue"
        />
        <OwnerStat
          label="Collected today"
          value={formatMoney(collectedToday, currency)}
          tone="green"
        />
        <OwnerStat
          label="Sent reports"
          value={formatNumber(pendingReports.length)}
          detail="Waiting for approval"
          tone={pendingReports.length > 0 ? "gold" : "slate"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <OwnerPanel
          title="Sent Reports"
          meta={`${pendingReports.length} waiting`}
        >
          <div className="divide-y divide-[var(--line)]">
            {loading ? (
              <DashboardPlaceholder rows={4} />
            ) : pendingReports.length === 0 ? (
              <EmptyLine text="No sent reports are waiting for approval." />
            ) : (
              pendingReports.slice(0, 5).map((report) => (
                <Link
                  key={report.id}
                  href={`/owner/reports?reportId=${report.id}`}
                  className="grid gap-3 px-3 py-3 hover:bg-[var(--soft-mist)] md:grid-cols-[1fr_130px_140px_28px]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--midnight-navy)]">
                      {report.branchName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {report.reportNumber} - {formatDate(report.operationDate)}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-[var(--midnight-navy)]">
                    {formatMoney(report.expectedClosingBalance, currency)}
                  </p>
                  <OwnerStatus value={report.status} />
                  <ArrowRight className="size-4 self-center justify-self-end text-slate-400" />
                </Link>
              ))
            )}
          </div>
        </OwnerPanel>

        <OwnerPanel title="Account Health" meta={`${activeStaff} active staff`}>
          <div className="grid gap-3 p-3 sm:grid-cols-2">
            <MiniMetric
              label="Portfolio size"
              value={formatMoney(
                sumBy(loans, (loan) => loan.principal),
                currency,
              )}
            />
            <MiniMetric
              label="Active branches"
              value={formatNumber(
                branches.filter((branch) => branch.manager).length,
              )}
            />
            <MiniMetric
              label="Total collected today"
              value={formatMoney(collectedToday, currency)}
            />
            <MiniMetric
              label="Approved reports"
              value={formatNumber(
                reports.filter((report) => report.status === "OWNER_APPROVED")
                  .length,
              )}
            />
          </div>
        </OwnerPanel>
      </div>

      <OwnerPanel title="Branch Oversight" meta={`${branches.length} branches`}>
        <div className="overflow-hidden">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="bg-[#e5ece8] text-[10px] font-bold text-slate-500">
              <tr>
                <th className="w-[26%] px-3 py-2">Branch</th>
                <th className="w-[22%] px-3 py-2">Manager</th>
                <th className="w-[12%] px-3 py-2 text-right">Staff</th>
                <th className="w-[14%] px-3 py-2 text-right">Loans</th>
                <th className="w-[18%] px-3 py-2 text-right">Outstanding</th>
                <th className="w-[8%] px-3 py-2 text-right">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] bg-white">
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <DashboardPlaceholder rows={4} />
                  </td>
                </tr>
              ) : branches.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyLine text="Create a branch to start tracking account activity." />
                  </td>
                </tr>
              ) : (
                branches.slice(0, 8).map((branch) => {
                  const branchLoans = loans.filter(
                    (loan) => loan.branchId === branch.id,
                  );
                  const branchOutstanding = sumBy(
                    branchLoans,
                    (loan) => loan.balance,
                  );
                  return (
                    <tr key={branch.id}>
                      <td className="px-3 py-3">
                        <p className="truncate font-bold text-[var(--midnight-navy)]">
                          {branch.name}
                        </p>
                        <p className="mt-1 truncate text-slate-500">
                          {branch.address || "-"}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="truncate font-semibold text-[var(--midnight-navy)]">
                          {branch.manager?.name ?? "Not assigned"}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {branch.staffSummary.active}/{branch.staffSummary.total}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatNumber(branchLoans.length)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums">
                        {formatMoney(branchOutstanding, currency)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`/owner/branches?branchId=${branch.id}`}
                          className="font-bold text-[var(--forest-emerald)]"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </OwnerPanel>
    </OwnerPage>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--line)] bg-[var(--soft-ivory)] p-3">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-bold tabular-nums text-[var(--midnight-navy)]">
        {value}
      </p>
    </div>
  );
}

function DashboardPlaceholder({ rows }: { rows: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-10 animate-pulse bg-[linear-gradient(90deg,#eef3f0,#f8faf9,#eef3f0)] bg-[length:200%_100%]"
        />
      ))}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="px-3 py-8 text-center text-sm text-slate-500">{text}</p>;
}
