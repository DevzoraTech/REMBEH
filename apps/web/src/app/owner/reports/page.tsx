"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../components/app/app-shell";
import { AppBootSkeleton } from "../../../components/app/skeleton";
import {
  OwnerBranch,
  OwnerReport,
  OwnerStatus,
  authHeaders,
  formatDate,
  formatMoney,
  formatNumber,
  ownerFetch,
  sumBy,
  titleCase,
  useOwnerSession,
} from "../owner-common";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../lib/api";
import { OwnerHeader, type OwnerNotificationItem } from "../owner-header";

type ReportStatusFilter =
  "all" | "SENT_TO_OWNER" | "OWNER_APPROVED" | "RETURNED_TO_MANAGER";
type ReportView = "report" | "excel";

type ReportAgentReturn = {
  floatId?: string;
  agentId?: string;
  agentName?: string;
  agentPublicId?: string | null;
  amountGiven?: number;
  amountDisbursed?: number;
  processingFees?: number;
  amountCollected?: number;
  expectedReturn?: number;
  amountReturned?: number | null;
  variance?: number | null;
  returnedAt?: string | null;
  status?: string;
};

type ReportRecord = {
  id?: string;
  amount?: number;
  description?: string | null;
  category?: string;
  addedAt?: string;
  incurredAt?: string;
  recordedByName?: string;
};

type ReportSnapshot = {
  summary: Record<string, unknown>;
  openingCash: Record<string, unknown>;
  cashPosition: Record<string, unknown>;
  operation: Record<string, unknown>;
  agentReturns: ReportAgentReturn[];
  topUps: ReportRecord[];
  expenses: ReportRecord[];
  closingNotes: string | null;
};

const STATUS_OPTIONS: Array<{ value: ReportStatusFilter; label: string }> = [
  { value: "all", label: "All reports" },
  { value: "SENT_TO_OWNER", label: "Waiting approval" },
  { value: "OWNER_APPROVED", label: "Approved" },
  { value: "RETURNED_TO_MANAGER", label: "Returned" },
];

export default function OwnerReportsPage() {
  const state = useOwnerSession("/owner/reports");
  const [branches, setBranches] = useState<OwnerBranch[]>([]);
  const [reports, setReports] = useState<OwnerReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("all");
  const [status, setStatus] = useState<ReportStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [queueOpen, setQueueOpen] = useState(false);
  const [view, setView] = useState<ReportView>("report");
  const [ownerNotes, setOwnerNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currency = state.workspace?.currency ?? "UGX";

  const loadReports = useCallback(async () => {
    if (!state.session) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (branchId !== "all") params.set("branchId", branchId);
      if (status !== "all") params.set("status", status);
      const [branchPayload, reportPayload] = await Promise.all([
        ownerFetch<{ branches?: OwnerBranch[] }>(state.session, "/branches"),
        ownerFetch<{ reports?: OwnerReport[] }>(
          state.session,
          `/operations/reports${params.toString() ? `?${params}` : ""}`,
        ),
      ]);
      const nextReports = reportPayload.reports ?? [];
      setBranches(branchPayload.branches ?? []);
      setReports(nextReports);
      setSelectedId((current) => {
        const fromUrl = new URLSearchParams(window.location.search).get(
          "reportId",
        );
        if (fromUrl && nextReports.some((report) => report.id === fromUrl)) {
          return fromUrl;
        }
        if (current && nextReports.some((report) => report.id === current)) {
          return current;
        }
        return nextReports[0]?.id ?? null;
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load reports.",
      );
    } finally {
      setLoading(false);
    }
  }, [branchId, state.session, status]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      if (state.ready && state.session) {
        void loadReports();
      }
    }, 0);

    return () => window.clearTimeout(boot);
  }, [loadReports, state.ready, state.session]);

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((report) =>
      [
        report.reportNumber,
        report.branchName,
        report.operationDate,
        report.status,
        report.managerReviewedByName ?? "",
      ].some((value) => value.toLowerCase().includes(q)),
    );
  }, [reports, search]);

  const selectedReport =
    filteredReports.find((report) => report.id === selectedId) ??
    filteredReports[0] ??
    null;
  const selectedSnapshot = selectedReport
    ? readReportSnapshot(selectedReport)
    : null;
  const waitingReports = reports.filter(
    (report) => report.status === "SENT_TO_OWNER",
  );
  const approvedReports = reports.filter(
    (report) => report.status === "OWNER_APPROVED",
  );
  const reportNotifications = useMemo<OwnerNotificationItem[]>(() => {
    if (waitingReports.length === 0) return [];
    return [
      {
        id: "waiting-report-approval",
        title: `${formatNumber(waitingReports.length)} report${waitingReports.length === 1 ? "" : "s"} waiting`,
        detail: "Reports sent by managers and waiting for owner approval.",
        href: "/owner/reports",
        tone: "gold",
        icon: "report",
        time: "Today",
      },
    ];
  }, [waitingReports.length]);

  async function approveReport(report: OwnerReport) {
    if (!state.session || approvingId) return;
    setApprovingId(report.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/operations/reports/${report.id}/owner-approve`,
        {
          method: "POST",
          headers: {
            ...authHeaders(state.session),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notes: ownerNotes.trim() || undefined }),
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) throw new Error(formatApiError(payload.message));
      setOwnerNotes("");
      setNotice("Report approved.");
      await loadReports();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not approve report.",
      );
    } finally {
      setApprovingId(null);
    }
  }

  if (!state.ready || !state.session) return <AppBootSkeleton />;

  return (
    <AppShell
      session={state.session}
      workspace={state.workspace}
      user={state.user}
      branch={null}
    >
      <div className="mx-auto max-w-[1440px] space-y-4">
        <OwnerHeader
          eyebrow="Reports"
          title="Reports"
          search={search}
          onSearchChange={setSearch}
          searchTooltip="Search report number, branch, date, status or manager."
          notifications={reportNotifications}
          actions={
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-3.5 text-xs font-medium text-white shadow-[0_10px_20px_rgba(0,135,95,0.22)] disabled:opacity-55"
              disabled={!selectedReport || !selectedSnapshot}
              onClick={() => {
                if (!selectedReport || !selectedSnapshot) return;
                void exportReport(
                  selectedReport,
                  selectedSnapshot,
                  currency,
                  setExportingId,
                );
              }}
            >
              {exportingId ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Export Report
              <ChevronDown className="size-3.5" />
            </button>
          }
        />

        {notice ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-[var(--forest-emerald)]">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-medium text-[var(--midnight-navy)] shadow-[0_8px_18px_rgba(15,23,42,0.035)] disabled:opacity-55"
            onClick={() => void loadReports()}
            disabled={loading}
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <ReportStat
            icon={<SlidersHorizontal className="size-5" />}
            label="Reports"
            value={formatNumber(reports.length)}
            detail="This month"
            tone="green"
          />
          <ReportStat
            icon={<FileText className="size-5" />}
            label="Waiting approval"
            value={formatNumber(waitingReports.length)}
            detail="Requires action"
            tone="gold"
          />
          <ReportStat
            icon={<FileText className="size-5" />}
            label="Approved"
            value={formatNumber(approvedReports.length)}
            detail="This month"
            tone="green"
          />
          <ReportStat
            icon={<FileSpreadsheet className="size-5" />}
            label="Expected close"
            value={formatMoney(
              sumBy(reports, (report) => report.expectedClosingBalance),
              currency,
            )}
            detail="Expected balance"
            tone="blue"
          />
          <ReportStat
            icon={<FileSpreadsheet className="size-5" />}
            label="Counted cash"
            value={formatMoney(
              sumBy(reports, (report) => report.closingBalance ?? 0),
              currency,
            )}
            detail="Total counted"
          />
          <ReportStat
            icon={<FileText className="size-5" />}
            label="Variance"
            value={formatMoney(
              sumBy(reports, (report) => report.closingVariance ?? 0),
              currency,
            )}
            detail="Difference"
            tone="red"
          />
        </section>

        <ReportQueueDropdown
          open={queueOpen}
          setOpen={setQueueOpen}
          reports={filteredReports}
          branches={branches}
          selectedReport={selectedReport}
          loading={loading}
          currency={currency}
          branchId={branchId}
          status={status}
          search={search}
          setBranchId={setBranchId}
          setStatus={setStatus}
          setSearch={setSearch}
          onSelect={(report) => {
            setSelectedId(report.id);
            setOwnerNotes("");
            setQueueOpen(false);
          }}
          onSendToOwner={() => {
            setNotice("This report is already in the owner review queue.");
          }}
        />

        <section className="min-w-0 overflow-hidden rounded-[14px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.055)]">
          {!selectedReport || !selectedSnapshot ? (
            <div className="px-4 py-14 text-center">
              <p className="text-sm font-medium text-slate-500">
                Select a report to review.
              </p>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f5] px-5 py-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                    Close-Day Report
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-[var(--midnight-navy)]">
                    {selectedReport.reportNumber}
                  </h2>
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    {selectedReport.branchName} <span className="px-1">·</span>{" "}
                    {formatDate(selectedReport.operationDate)}{" "}
                    <span className="px-1">·</span> Closed by{" "}
                    {selectedSnapshot.operation.closedByName
                      ? textValue(selectedSnapshot.operation.closedByName)
                      : selectedReport.managerReviewedByName ?? "Manager"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="flex h-9 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-medium text-[var(--forest-emerald)]"
                    onClick={() =>
                      setNotice("This report is already in the owner review queue.")
                    }
                  >
                    <Send className="size-3.5" />
                    Send To Owner
                  </button>
                  <ReportViewButton
                    active={view === "report"}
                    icon={<FileText className="size-3.5" />}
                    label="Computerised Report"
                    onClick={() => setView("report")}
                  />
                  <ReportViewButton
                    active={view === "excel"}
                    icon={<FileSpreadsheet className="size-3.5" />}
                    label="Excel View"
                    onClick={() => setView("excel")}
                  />
                  <button
                    type="button"
                    className="flex h-9 items-center gap-2 rounded-xl bg-[#003f35] px-4 text-xs font-medium text-white shadow-[0_10px_20px_rgba(0,63,53,0.2)]"
                    disabled={exportingId === selectedReport.id}
                    onClick={() =>
                      void exportReport(
                        selectedReport,
                        selectedSnapshot,
                        currency,
                        setExportingId,
                      )
                    }
                  >
                    {exportingId === selectedReport.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    Export
                  </button>
                </div>
              </header>

              <div className="space-y-4 p-5">
                <div className="min-w-0">
                  {view === "report" ? (
                    <ComputerisedReportView
                      report={selectedReport}
                      snapshot={selectedSnapshot}
                      currency={currency}
                      reviewPanel={
                        <OwnerReviewPanel
                          report={selectedReport}
                          notes={ownerNotes}
                          setNotes={setOwnerNotes}
                          approving={approvingId === selectedReport.id}
                          onApprove={() => void approveReport(selectedReport)}
                        />
                      }
                    />
                  ) : (
                    <div className="space-y-4">
                      <ExcelReportView
                        report={selectedReport}
                        snapshot={selectedSnapshot}
                        currency={currency}
                      />
                      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                        <OwnerReviewPanel
                          report={selectedReport}
                          notes={ownerNotes}
                          setNotes={setOwnerNotes}
                          approving={approvingId === selectedReport.id}
                          onApprove={() => void approveReport(selectedReport)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function ReportQueueDropdown({
  open,
  setOpen,
  reports,
  branches,
  selectedReport,
  loading,
  currency,
  branchId,
  status,
  search,
  setBranchId,
  setStatus,
  setSearch,
  onSelect,
  onSendToOwner,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  reports: OwnerReport[];
  branches: OwnerBranch[];
  selectedReport: OwnerReport | null;
  loading: boolean;
  currency: string;
  branchId: string;
  status: ReportStatusFilter;
  search: string;
  setBranchId: (value: string) => void;
  setStatus: (value: ReportStatusFilter) => void;
  setSearch: (value: string) => void;
  onSelect: (report: OwnerReport) => void;
  onSendToOwner: () => void;
}) {
  return (
    <div className="relative z-10">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-emerald-100 bg-white px-4 py-3 shadow-[0_12px_26px_rgba(15,23,42,0.045)]">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => setOpen(!open)}
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[var(--forest-emerald)]">
            <SlidersHorizontal className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
              Review Queue
            </span>
            <span className="mt-1 block truncate text-sm font-medium text-[var(--midnight-navy)]">
              {selectedReport
                ? `${selectedReport.branchName} - ${selectedReport.reportNumber}`
                : "Choose a report"}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <p className="hidden text-xs font-medium text-[var(--midnight-navy)] sm:block">
            {reports.length} shown
          </p>
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-medium text-[var(--forest-emerald)]"
            onClick={onSendToOwner}
          >
            <Send className="size-3.5" />
            Send To Owner
          </button>
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-medium text-[var(--midnight-navy)] shadow-[0_8px_18px_rgba(15,23,42,0.035)]"
            onClick={() => setOpen(!open)}
          >
            {open ? "Close Queue" : "Open Queue"}
            <ChevronRight className={`size-3.5 transition ${open ? "-rotate-90" : ""}`} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 max-w-3xl overflow-hidden rounded-[14px] border border-[#e6ebf0] bg-white shadow-[0_22px_50px_rgba(20,33,61,0.2)] animate-rise">
          <div className="border-b border-[#edf1f5] bg-[#f8faf9] px-3 py-3">
            <div className="grid gap-2 md:grid-cols-[1fr_180px_190px]">
              <label className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs">
                <Search className="size-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent font-medium outline-none"
                  placeholder="Search report, branch or manager"
                />
              </label>
              <select
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                className="h-9 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-medium outline-none"
              >
                <option value="all">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as ReportStatusFilter)
                }
                className="h-9 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-medium outline-none"
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="max-h-[430px] divide-y divide-[var(--line)] overflow-y-auto">
            {loading ? (
              <ReportQueueSkeleton />
            ) : reports.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">
                No reports match this view.
              </p>
            ) : (
              reports.map((report) => (
                <ReportQueueItem
                  key={report.id}
                  report={report}
                  currency={currency}
                  active={selectedReport?.id === report.id}
                  onSelect={() => onSelect(report)}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReportStat({
  icon,
  label,
  value,
  detail,
  tone = "slate",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "slate" | "green" | "blue" | "gold" | "red";
}) {
  const toneClass = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-[var(--forest-emerald)]",
    blue: "bg-sky-50 text-sky-600",
    gold: "bg-orange-50 text-orange-600",
    red: "bg-red-50 text-red-600",
  }[tone];
  const valueClass = {
    slate: "text-[var(--midnight-navy)]",
    green: "text-[var(--forest-emerald)]",
    blue: "text-[var(--clear-sky)]",
    gold: "text-amber-700",
    red: "text-red-700",
  }[tone];
  return (
    <article className="flex min-h-[96px] min-w-0 items-center gap-3 rounded-[14px] border border-[#e6ebf0] bg-white px-4 py-3.5 shadow-[0_12px_26px_rgba(15,23,42,0.055)]">
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${toneClass}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-bold text-slate-500">
          {label}
        </p>
        <p
          className={`mt-1.5 break-words text-[clamp(0.82rem,1vw,1.08rem)] font-semibold leading-tight tabular-nums ${valueClass}`}
        >
          {value}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">
          {detail}
        </p>
      </div>
    </article>
  );
}

function ReportQueueItem({
  report,
  currency,
  active,
  onSelect,
}: {
  report: OwnerReport;
  currency: string;
  active: boolean;
  onSelect: () => void;
}) {
  const variance = report.closingVariance ?? 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full px-3 py-3 text-left transition ${
        active
          ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200"
          : "bg-white hover:bg-[var(--soft-mist)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--midnight-navy)]">
            {report.branchName}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500">
            {report.reportNumber}
          </p>
        </div>
        <OwnerStatus value={report.status} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <QueueFigure
          label="Expected"
          value={formatMoney(report.expectedClosingBalance, currency)}
        />
        <QueueFigure
          label="Variance"
          value={formatMoney(variance, currency)}
          danger={variance !== 0}
        />
      </div>
      <p className="mt-2 text-[11px] font-semibold text-slate-500">
        {formatDate(report.operationDate)} - Sent by{" "}
        {report.managerReviewedByName ?? "Manager"}
      </p>
    </button>
  );
}

function QueueFigure({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0 border border-[var(--line)] bg-white px-2 py-1.5">
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
      <p
        className={`mt-0.5 break-words text-xs font-bold tabular-nums ${
          danger ? "text-red-700" : "text-[var(--midnight-navy)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ReportViewButton({
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
      className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${
        active
          ? "border-[#dfe8e3] bg-white text-[var(--midnight-navy)] shadow-[0_8px_18px_rgba(15,23,42,0.035)]"
          : "border-[#e6ebf0] bg-white text-slate-600 hover:text-[var(--midnight-navy)]"
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function ComputerisedReportView({
  report,
  snapshot,
  currency,
  reviewPanel,
}: {
  report: OwnerReport;
  snapshot: ReportSnapshot;
  currency: string;
  reviewPanel: ReactNode;
}) {
  const opening = snapshot.openingCash;
  const summary = snapshot.summary;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <ReportMetric
          label="Opening Cash"
          value={formatMoney(
            numberValue(summary.openingCash) ||
              numberValue(opening.totalOpeningBalance),
            currency,
          )}
        />
        <ReportMetric
          label="Float Distributed"
          value={formatMoney(numberValue(summary.floatDistributed), currency)}
        />
        <ReportMetric
          label="Returned Cash"
          value={formatMoney(
            numberValue(summary.cashReturnedByAgents),
            currency,
          )}
        />
        <ReportMetric
          label="Expenses"
          value={formatMoney(numberValue(summary.expenses), currency)}
          danger
        />
        <ReportMetric
          label="Expected Close"
          value={formatMoney(report.expectedClosingBalance, currency)}
          highlight
        />
        <ReportMetric
          label="Counted Cash"
          value={formatMoney(report.closingBalance ?? 0, currency)}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ReportBlock title="Opening Cash">
          <StatementRow
            label="Previous closing balance"
            value={formatMoney(
              numberValue(opening.previousClosingBalance),
              currency,
            )}
          />
          <StatementRow
            label="Top-ups added today"
            value={formatMoney(numberValue(opening.cashAddedToday), currency)}
          />
          <StatementRow
            label="Total opening balance"
            value={formatMoney(
              numberValue(opening.totalOpeningBalance),
              currency,
            )}
            strong
          />
        </ReportBlock>
        <ReportBlock title="Closing Result">
          <StatementRow
            label="Expected closing balance"
            value={formatMoney(report.expectedClosingBalance, currency)}
            strong
          />
          <StatementRow
            label="Counted cash"
            value={formatMoney(report.closingBalance ?? 0, currency)}
          />
          <StatementRow
            label="Variance"
            value={formatMoney(report.closingVariance ?? 0, currency)}
            danger={(report.closingVariance ?? 0) !== 0}
          />
        </ReportBlock>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ReportBlock title="Field Activity">
          <div className="grid gap-2 sm:grid-cols-4">
            <ReportMiniStat
              label="Loans issued"
              value={formatNumber(numberValue(summary.loansIssuedCount))}
              hint={formatMoney(
                numberValue(summary.loansIssuedPrincipal),
                currency,
              )}
            />
            <ReportMiniStat
              label="Collections"
              value={formatNumber(numberValue(summary.collectionsCount))}
              hint={formatMoney(
                numberValue(summary.collectionsReceived),
                currency,
              )}
            />
            <ReportMiniStat
              label="Processing fees"
              value={formatMoney(numberValue(summary.processingFees), currency)}
              hint="Included in handover"
            />
            <ReportMiniStat
              label="Agents returned"
              value={`${snapshot.agentReturns.filter((row) => row.amountReturned != null).length}/${snapshot.agentReturns.length}`}
              hint={formatMoney(
                sumBy(snapshot.agentReturns, (row) =>
                  numberValue(row.expectedReturn),
                ),
                currency,
              )}
            />
          </div>
        </ReportBlock>

        <ReportAgentTable rows={snapshot.agentReturns} currency={currency} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.05fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
        <ReportRecordList
          title="Topups"
          empty="No top-ups recorded."
          rows={snapshot.topUps.map((topUp, index) => ({
            id: topUp.id ?? `topup-${index}`,
            label: topUp.description || "Cash top-up",
            meta: `${formatClock(topUp.addedAt)} - ${topUp.recordedByName ?? "Manager"}`,
            value: formatMoney(numberValue(topUp.amount), currency),
          }))}
        />
        <ReportRecordList
          title="Expenses"
          empty="No expenses recorded."
          rows={snapshot.expenses.map((expense, index) => ({
            id: expense.id ?? `expense-${index}`,
            label: categoryLabel(expense.category),
            meta: `${formatClock(expense.incurredAt)} - ${expense.recordedByName ?? "Manager"}`,
            value: formatMoney(numberValue(expense.amount), currency),
          }))}
        />
        <ReportOperationCard
          openedBy={textValue(snapshot.operation.openedByName, "Not recorded")}
          closedBy={textValue(snapshot.operation.closedByName, "Not recorded")}
          sentAt={formatDateTime(report.managerReviewedAt)}
        />
        {reviewPanel}
      </div>

      {snapshot.closingNotes ? (
        <ReportBlock title="Closing Notes">
          <p className="text-sm text-slate-600">{snapshot.closingNotes}</p>
        </ReportBlock>
      ) : null}
    </div>
  );
}

function ExcelReportView({
  report,
  snapshot,
  currency,
}: {
  report: OwnerReport;
  snapshot: ReportSnapshot;
  currency: string;
}) {
  const rows = buildExcelRows(report, snapshot);
  const columns = [
    "Section",
    "Description",
    "Count",
    "Cash In",
    "Cash Out",
    "Balance",
    "Notes",
  ];
  const finalRowNumber = rows.length + 6;

  return (
    <div className="overflow-hidden border border-[#c6d2cc] bg-[#f3f7f5] shadow-inner">
      <div className="flex items-center gap-2 border-b border-[#c6d2cc] bg-[#eef3f0] px-3 py-2 text-[11px] font-semibold text-slate-600">
        <span className="border border-[#c6d2cc] bg-white px-2 py-1 text-[10px] font-bold text-slate-500">
          fx
        </span>
        <span className="min-w-0 truncate">
          {report.reportNumber} / {report.branchName} /{" "}
          {formatDate(report.operationDate)}
        </span>
      </div>
      <table className="w-full table-fixed border-collapse text-left text-[10px]">
        <thead>
          <tr>
            <th className="w-8 border border-[#c6d2cc] bg-[#e6ece8]" />
            {["A", "B", "C", "D", "E", "F", "G"].map((letter, index) => (
              <th
                key={letter}
                className={`border border-[#c6d2cc] bg-[#e6ece8] px-2 py-1 text-center font-bold text-slate-500 ${
                  index === 0
                    ? "w-[13%]"
                    : index === 1
                      ? "w-[28%]"
                      : index === 2
                        ? "w-[8%]"
                        : "w-[12.75%]"
                }`}
              >
                {letter}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <SpreadsheetMergedRow
            rowNumber={1}
            value="REMBEH Daily Operations Report"
            strong
          />
          <SpreadsheetMergedRow
            rowNumber={2}
            value={`${report.branchName} - ${formatDate(report.operationDate)}`}
          />
          <SpreadsheetMergedRow
            rowNumber={3}
            value={`${report.reportNumber} - ${statusLabel(report.status)}`}
            muted
          />
          <tr>
            <SpreadsheetRowNumber value={4} />
            <SpreadsheetSummaryCell
              label="Expected close"
              value={report.expectedClosingBalance}
              currency={currency}
            />
            <SpreadsheetSummaryCell
              label="Counted cash"
              value={report.closingBalance ?? 0}
              currency={currency}
            />
            <SpreadsheetSummaryCell
              label="Variance"
              value={report.closingVariance ?? 0}
              currency={currency}
            />
            <td className="border border-[#c6d2cc] bg-white px-2 py-2 font-semibold text-slate-500" />
          </tr>
          <tr>
            <SpreadsheetRowNumber value={5} />
            {columns.map((column) => (
              <td
                key={column}
                className="border border-[#c6d2cc] bg-[var(--forest-emerald)] px-2 py-2 text-center font-bold text-white"
              >
                {column}
              </td>
            ))}
          </tr>
          {rows.map((row, index) => (
            <tr
              key={`${row.section}-${row.description}`}
              className={index % 2 === 0 ? "bg-white" : "bg-[#fbfdfc]"}
            >
              <SpreadsheetRowNumber value={index + 6} />
              <td className="border border-[#d5ddd9] px-2 py-2 font-bold text-[var(--midnight-navy)]">
                {row.section}
              </td>
              <td className="border border-[#d5ddd9] px-2 py-2 text-slate-600">
                {row.description}
              </td>
              <td className="border border-[#d5ddd9] px-2 py-2 text-right tabular-nums text-slate-600">
                {row.count}
              </td>
              <SpreadsheetMoneyCell
                value={row.cashIn}
                tone="in"
                currency={currency}
              />
              <SpreadsheetMoneyCell
                value={row.cashOut}
                tone="out"
                currency={currency}
              />
              <SpreadsheetMoneyCell
                value={row.balance}
                tone="balance"
                currency={currency}
              />
              <td className="border border-[#d5ddd9] px-2 py-2 text-slate-600">
                {row.note}
              </td>
            </tr>
          ))}
          <tr>
            <SpreadsheetRowNumber value={finalRowNumber} />
            <td className="border border-[#c6d2cc] bg-[#e6ece8] px-2 py-2 font-bold text-[var(--midnight-navy)]">
              Closing
            </td>
            <td className="border border-[#c6d2cc] bg-[#e6ece8] px-2 py-2 font-bold text-[var(--midnight-navy)]">
              Final report totals
            </td>
            <td className="border border-[#c6d2cc] bg-[#e6ece8] px-2 py-2 text-right font-bold tabular-nums text-[var(--midnight-navy)]">
              -
            </td>
            <SpreadsheetMoneyCell
              value={
                numberValue(snapshot.summary.cashReturnedByAgents) +
                numberValue(snapshot.summary.collectionsReceived) +
                numberValue(snapshot.summary.processingFees)
              }
              tone="in"
              total
              currency={currency}
            />
            <SpreadsheetMoneyCell
              value={
                numberValue(snapshot.summary.floatDistributed) +
                numberValue(snapshot.summary.expenses) +
                numberValue(snapshot.summary.loansIssuedPrincipal)
              }
              tone="out"
              total
              currency={currency}
            />
            <SpreadsheetMoneyCell
              value={report.expectedClosingBalance}
              tone="balance"
              total
              currency={currency}
            />
            <td className="border border-[#c6d2cc] bg-[#e6ece8] px-2 py-2 font-bold text-slate-600">
              Sent to owner
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function OwnerReviewPanel({
  report,
  notes,
  setNotes,
  approving,
  onApprove,
}: {
  report: OwnerReport;
  notes: string;
  setNotes: (value: string) => void;
  approving: boolean;
  onApprove: () => void;
}) {
  const waiting = report.status === "SENT_TO_OWNER";
  return (
    <>
      <div className="rounded-xl border border-[#e6ebf0] bg-white p-4">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-amber-700">
          Review Status
        </p>
        <h3 className="mt-2 text-base font-semibold text-[var(--midnight-navy)]">
          {statusLabel(report.status)}
        </h3>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
          {statusHelp(report.status)}
        </p>
        <div className="mt-4 grid grid-cols-2 divide-x divide-[#edf1f5] border-t border-[#edf1f5] pt-3">
          <ReviewLine
            label="Manager"
            name={report.managerReviewedByName}
            date={report.managerReviewedAt}
          />
          <ReviewLine
            label="Owner"
            name={report.ownerApprovedByName}
            date={report.ownerApprovedAt}
          />
        </div>
      </div>
      {waiting ? (
        <div className="rounded-xl border border-[#e6ebf0] bg-white p-4">
          <label className="text-xs font-semibold text-[var(--midnight-navy)]">
            Owner Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-2 min-h-20 w-full rounded-xl border border-[#e6ebf0] px-3 py-2 text-sm font-semibold outline-none focus:border-[var(--forest-emerald)]"
              placeholder="Optional note before approval"
            />
          </label>
          <button
            type="button"
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-4 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(0,135,95,0.18)] disabled:opacity-55"
            onClick={onApprove}
            disabled={approving}
          >
            {approving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            Approve Report
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-[#e6ebf0] bg-white p-4">
          <p className="text-xs font-semibold text-[var(--midnight-navy)]">
            Owner Notes
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Report is already approved.
          </p>
        </div>
      )}
    </>
  );
}

function ReviewLine({
  label,
  name,
  date,
}: {
  label: string;
  name: string | null;
  date: string | null;
}) {
  return (
    <div className="px-3 text-xs first:pl-0 last:pr-0">
      <span className="font-bold text-slate-500">{label}</span>
      <p className="mt-1 font-semibold text-[var(--midnight-navy)]">
          {name ?? "Pending"}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">{formatDateTime(date)}</p>
    </div>
  );
}

function ReportMetric({
  label,
  value,
  highlight,
  danger,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[64px] min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 ${
        highlight
          ? "border-emerald-100 bg-emerald-50"
          : danger
            ? "border-red-100 bg-red-50"
            : "border-[#e6ebf0] bg-white"
      }`}
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-lg ${
          highlight
            ? "bg-white text-[var(--forest-emerald)]"
            : danger
              ? "bg-white text-red-600"
              : "bg-slate-50 text-slate-600"
        }`}
      >
        <FileText className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold text-slate-500">{label}</p>
        <p
          className={`mt-1 break-words text-sm font-semibold tabular-nums ${
            highlight
              ? "text-[var(--forest-emerald)]"
              : danger
                ? "text-red-700"
                : "text-[var(--midnight-navy)]"
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function ReportBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#e6ebf0] bg-white">
      <h3 className="border-b border-[#edf1f5] bg-[#f8faf9] px-4 py-3 text-sm font-semibold text-[var(--midnight-navy)]">
        {title}
      </h3>
      <div className="p-4">{children}</div>
    </section>
  );
}

function StatementRow({
  label,
  value,
  strong,
  danger,
}: {
  label: string;
  value: string;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-[#edf1f5] py-2.5 text-sm last:border-b-0">
      <span
        className={
          strong ? "font-semibold text-[var(--midnight-navy)]" : "font-semibold text-slate-600"
        }
      >
        {label}
      </span>
      <span
        className={`font-semibold tabular-nums ${
          danger ? "text-red-700" : "text-[var(--midnight-navy)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ReportMiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex min-h-[70px] min-w-0 items-start gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 py-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-600">
        <FileText className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-500">
          {label}
        </p>
        <p className="mt-1 break-words text-sm font-semibold leading-tight tabular-nums text-[var(--midnight-navy)]">
          {value}
        </p>
        <p className="mt-0.5 truncate text-[11px] leading-tight text-slate-500">
          {hint}
        </p>
      </div>
    </div>
  );
}

function ReportAgentTable({
  rows,
  currency,
}: {
  rows: ReportAgentReturn[];
  currency: string;
}) {
  return (
    <ReportBlock title="Agent Handover">
      <table className="w-full table-fixed text-left text-[11px]">
        <thead className="bg-[#f8faf9] text-[10px] font-bold text-slate-500">
          <tr>
            <th className="w-[24%] px-2 py-2">Agent</th>
            <th className="w-[14%] px-2 py-2 text-right">Float</th>
            <th className="w-[14%] px-2 py-2 text-right">Loans</th>
            <th className="w-[14%] px-2 py-2 text-right">Collections</th>
            <th className="w-[14%] px-2 py-2 text-right">Expected</th>
            <th className="w-[20%] px-2 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf1f5]">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                No agent float recorded.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row.floatId ?? row.agentId ?? index}>
                <td className="px-2 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                      {initials(row.agentName ?? "Agent")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-[var(--midnight-navy)]">
                        {row.agentName ?? "Agent"}
                      </p>
                      <p className="truncate text-[10px] text-slate-500">
                        {row.agentPublicId ?? "-"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 text-right font-bold tabular-nums">
                  {formatMoney(numberValue(row.amountGiven), currency)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatMoney(numberValue(row.amountDisbursed), currency)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatMoney(numberValue(row.amountCollected), currency)}
                </td>
                <td className="px-2 py-2 text-right font-bold tabular-nums">
                  {formatMoney(numberValue(row.expectedReturn), currency)}
                </td>
                <td className="px-2 py-2">
                  <OwnerStatus value={row.status ?? "PENDING"} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </ReportBlock>
  );
}

function ReportRecordList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ id: string; label: string; meta: string; value: string }>;
}) {
  return (
    <ReportBlock title={title}>
      {rows.length === 0 ? (
        <div className="grid min-h-[126px] place-items-center text-center">
          <div>
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50 text-[var(--forest-emerald)]">
              <FileText className="size-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-500">{empty}</p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-[#edf1f5]">
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-[1fr_auto] gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[var(--midnight-navy)]">
                  {row.label}
                </p>
                <p className="truncate text-xs text-slate-500">{row.meta}</p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-[var(--midnight-navy)]">
                {row.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </ReportBlock>
  );
}

function ReportOperationCard({
  openedBy,
  closedBy,
  sentAt,
}: {
  openedBy: string;
  closedBy: string;
  sentAt: string;
}) {
  return (
    <div className="rounded-xl border border-[#e6ebf0] bg-white p-4 text-xs">
      <OperationLine label="Opened by" value={openedBy} />
      <OperationLine label="Closed by" value={closedBy} />
      <OperationLine label="Sent to Owner" value={sentAt} />
    </div>
  );
}

function OperationLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[#edf1f5] py-2 first:pt-0 last:border-b-0 last:pb-0">
      <p className="font-semibold text-slate-500">{label}</p>
      <p className="mt-1 break-words font-semibold text-[var(--midnight-navy)]">
        {value}
      </p>
    </div>
  );
}

function SpreadsheetMergedRow({
  rowNumber,
  value,
  strong,
  muted,
}: {
  rowNumber: number;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <tr>
      <SpreadsheetRowNumber value={rowNumber} />
      <td
        colSpan={7}
        className={`border border-[#c6d2cc] bg-white px-2 py-2 text-center ${
          strong
            ? "text-sm font-bold text-[var(--midnight-navy)]"
            : muted
              ? "font-semibold text-slate-500"
              : "font-bold text-slate-700"
        }`}
      >
        {value}
      </td>
    </tr>
  );
}

function SpreadsheetRowNumber({ value }: { value: number }) {
  return (
    <td className="border border-[#c6d2cc] bg-[#e6ece8] px-1 py-2 text-center text-[10px] font-bold text-slate-500">
      {value}
    </td>
  );
}

function SpreadsheetSummaryCell({
  label,
  value,
  currency,
}: {
  label: string;
  value: number;
  currency: string;
}) {
  return (
    <td colSpan={2} className="border border-[#c6d2cc] bg-white px-2 py-2">
      <p className="text-[9px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 font-bold tabular-nums text-[var(--midnight-navy)]">
        {formatMoney(value, currency)}
      </p>
    </td>
  );
}

function SpreadsheetMoneyCell({
  value,
  tone,
  total,
  currency,
}: {
  value: number | null;
  tone: "in" | "out" | "balance";
  total?: boolean;
  currency: string;
}) {
  const color =
    tone === "in"
      ? "text-[var(--forest-emerald)]"
      : tone === "out"
        ? "text-red-700"
        : "text-[var(--midnight-navy)]";
  return (
    <td
      className={`border border-[#d5ddd9] px-2 py-2 text-right tabular-nums ${color} ${
        total ? "bg-[#e6ece8] font-bold" : "font-semibold"
      }`}
    >
      {value == null ? "-" : formatMoney(value, currency)}
    </td>
  );
}

function ReportQueueSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse bg-[linear-gradient(90deg,#eef3f0,#f8faf9,#eef3f0)] bg-[length:200%_100%]"
        />
      ))}
    </div>
  );
}

function readReportSnapshot(report: OwnerReport): ReportSnapshot {
  const root = objectValue(report.snapshot);
  return {
    summary: objectValue(root.summary),
    openingCash: objectValue(root.openingCash),
    cashPosition: objectValue(root.cashPosition),
    operation: objectValue(root.operation),
    agentReturns: arrayValue(root.agentReturns) as ReportAgentReturn[],
    topUps: arrayValue(root.topUps) as ReportRecord[],
    expenses: arrayValue(root.expenses) as ReportRecord[],
    closingNotes:
      typeof root.closingNotes === "string" && root.closingNotes.trim()
        ? root.closingNotes
        : null,
  };
}

function buildExcelRows(report: OwnerReport, snapshot: ReportSnapshot) {
  return [
    {
      section: "Opening",
      description: "Previous closing balance",
      count: "-",
      cashIn: null,
      cashOut: null,
      balance: numberValue(snapshot.openingCash.previousClosingBalance),
      note: "Carried from previous close",
    },
    {
      section: "Opening",
      description: "Top-ups added today",
      count: "-",
      cashIn: numberValue(snapshot.openingCash.cashAddedToday),
      cashOut: null,
      balance: null,
      note: "Cash added before and during day",
    },
    {
      section: "Float",
      description: "Float distributed",
      count: `${snapshot.agentReturns.length}`,
      cashIn: null,
      cashOut: numberValue(snapshot.summary.floatDistributed),
      balance: null,
      note: "Issued to agents",
    },
    {
      section: "Field",
      description: "Loans issued",
      count: formatNumber(numberValue(snapshot.summary.loansIssuedCount)),
      cashIn: null,
      cashOut: numberValue(snapshot.summary.loansIssuedPrincipal),
      balance: null,
      note: "Principal disbursed",
    },
    {
      section: "Field",
      description: "Collections received",
      count: formatNumber(numberValue(snapshot.summary.collectionsCount)),
      cashIn: numberValue(snapshot.summary.collectionsReceived),
      cashOut: null,
      balance: null,
      note: "Borrower repayments",
    },
    {
      section: "Field",
      description: "Processing fees",
      count: "-",
      cashIn: numberValue(snapshot.summary.processingFees),
      cashOut: null,
      balance: null,
      note: "Fees collected on issued loans",
    },
    {
      section: "Returns",
      description: "Cash returned by agents",
      count: `${snapshot.agentReturns.filter((row) => row.amountReturned != null).length}/${snapshot.agentReturns.length}`,
      cashIn: numberValue(snapshot.summary.cashReturnedByAgents),
      cashOut: null,
      balance: null,
      note: "Recorded handovers",
    },
    {
      section: "Expenses",
      description: "Branch expenses",
      count: formatNumber(snapshot.expenses.length),
      cashIn: null,
      cashOut: numberValue(snapshot.summary.expenses),
      balance: null,
      note: "Approved daily expenses",
    },
    {
      section: "Closing",
      description: "Expected closing balance",
      count: "-",
      cashIn: null,
      cashOut: null,
      balance: report.expectedClosingBalance,
      note: "System expected close",
    },
    {
      section: "Closing",
      description: "Counted cash",
      count: "-",
      cashIn: null,
      cashOut: null,
      balance: report.closingBalance ?? 0,
      note: "Manager counted cash",
    },
    {
      section: "Closing",
      description: "Variance",
      count: "-",
      cashIn: null,
      cashOut: null,
      balance: report.closingVariance ?? 0,
      note: "Counted cash less expected close",
    },
  ];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function textValue(value: unknown, fallback = "-") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function formatClock(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-UG", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Pending";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function categoryLabel(value: string | null | undefined) {
  if (!value) return "Expense";
  return titleCase(value.replaceAll("_", " ").toLowerCase());
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function statusLabel(value: string) {
  if (value === "SENT_TO_OWNER") return "Waiting Owner Approval";
  if (value === "OWNER_APPROVED") return "Owner Approved";
  if (value === "RETURNED_TO_MANAGER") return "Returned To Manager";
  return titleCase(value.replaceAll("_", " ").toLowerCase());
}

function statusHelp(value: string) {
  if (value === "SENT_TO_OWNER") {
    return "Review the figures and approve when everything is correct.";
  }
  if (value === "OWNER_APPROVED") {
    return "This report has been approved and locked for owner records.";
  }
  if (value === "RETURNED_TO_MANAGER") {
    return "This report was returned for branch manager correction.";
  }
  return "Report is available for owner review.";
}

async function exportReport(
  report: OwnerReport,
  snapshot: ReportSnapshot,
  currency: string,
  setExportingId: (id: string | null) => void,
) {
  setExportingId(report.id);
  try {
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Daily Report");
    worksheet.addRow(["REMBEH Daily Operations Report"]);
    worksheet.mergeCells(1, 1, 1, 7);
    worksheet.addRow([
      report.branchName,
      report.reportNumber,
      report.operationDate,
      statusLabel(report.status),
    ]);
    worksheet.mergeCells(2, 1, 2, 7);
    worksheet.addRow([]);
    const header = worksheet.addRow([
      "Section",
      "Description",
      "Count",
      "Cash In",
      "Cash Out",
      "Balance",
      "Notes",
    ]);
    buildExcelRows(report, snapshot).forEach((row) => {
      worksheet.addRow([
        row.section,
        row.description,
        row.count,
        row.cashIn ?? "",
        row.cashOut ?? "",
        row.balance ?? "",
        row.note,
      ]);
    });
    worksheet.columns = [
      { width: 16 },
      { width: 30 },
      { width: 12 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 30 },
    ];
    worksheet.getRow(1).font = {
      bold: true,
      size: 16,
      color: { argb: "FF14213D" },
    };
    worksheet.getRow(1).alignment = { horizontal: "center" };
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F8F68" },
    };
    [4, 5, 6].forEach((column) => {
      worksheet.getColumn(column).numFmt = `"${currency}" #,##0`;
    });
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFC6D2CC" } },
          bottom: { style: "thin", color: { argb: "FFC6D2CC" } },
          left: { style: "thin", color: { argb: "FFC6D2CC" } },
          right: { style: "thin", color: { argb: "FFC6D2CC" } },
        };
      });
    });
    const agentSheet = workbook.addWorksheet("Agent Handover");
    agentSheet.addRow([
      "Agent",
      "Float",
      "Loans",
      "Collections",
      "Fees",
      "Expected",
      "Returned",
      "Status",
    ]);
    snapshot.agentReturns.forEach((row) => {
      agentSheet.addRow([
        row.agentName ?? "Agent",
        numberValue(row.amountGiven),
        numberValue(row.amountDisbursed),
        numberValue(row.amountCollected),
        numberValue(row.processingFees),
        numberValue(row.expectedReturn),
        row.amountReturned == null ? "" : numberValue(row.amountReturned),
        row.status ?? "PENDING",
      ]);
    });
    agentSheet.columns = [
      { width: 24 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
    ];
    agentSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    agentSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F8F68" },
    };
    [2, 3, 4, 5, 6, 7].forEach((column) => {
      agentSheet.getColumn(column).numFmt = `"${currency}" #,##0`;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      `${report.reportNumber}-${report.branchName}`.replace(
        /[^a-z0-9-]+/gi,
        "_",
      ) + ".xlsx";
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    setExportingId(null);
  }
}
