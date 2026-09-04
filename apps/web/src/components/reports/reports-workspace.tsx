"use client";

import {
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Loader2,
  MoreVertical,
  Pencil,
  RefreshCw,
  Scale,
  Send,
  Users,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../app/app-shell";
import { AppBootSkeleton } from "../app/skeleton";
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
import { useRouter } from "next/navigation";
import {
  OwnerBranch,
  OwnerReport,
  authHeaders,
  formatDate,
  formatMoney,
  formatNumber,
  ownerFetch,
  sumBy,
  titleCase,
} from "../../app/owner/owner-common";
import { OwnerHeader } from "../../app/owner/owner-header";
import { useOwnerBranchScope } from "../../app/owner/owner-branch-scope";
import { invalidateOwnerNotifications } from "../../app/owner/owner-notifications";
import { useOwnerLiveReload } from "../../app/owner/use-owner-live-reload";
import { Money } from "../app/money";
import { TableSearchField } from "../app/table-search-field";
import {
  buildDailyReportDocumentFromSnapshot,
  type DailyReportStatus,
} from "./daily-reconciliation-report";
import { exportDailyReconciliationPdf } from "./daily-reconciliation-pdf";
import {
  EMPTY_REPORTS_FILTERS,
  ReportsFiltersControl,
  dailyReportCode,
  reportMatchesDate,
  reportStatusLabel,
  type ReportsAdvancedFilters,
} from "./reports-filters";

export type ReportsMode = "owner" | "manager";

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
  expensesTotal?: number;
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
  paidFrom?: string;
  agentName?: string | null;
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

type ReportsSession = {
  session: RembehSession | null;
  workspace: RembehWorkspace | null;
  user: RembehUser | null;
  branch: RembehBranch | null;
  ready: boolean;
};

function useReportsSession(mode: ReportsMode): ReportsSession {
  const router = useRouter();
  const [state, setState] = useState<ReportsSession>({
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
          `/login?next=${encodeURIComponent(mode === "owner" ? "/owner/reports" : "/reports")}`,
        );
        return;
      }
      const role = resolveOperatorRole(auth.session, auth.user);
      if (mode === "owner" && role !== "owner") {
        router.replace(role === "manager" ? "/reports" : "/dashboard");
        return;
      }
      if (mode === "manager" && role !== "manager") {
        router.replace(role === "owner" ? "/owner/reports" : "/dashboard");
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

export function ReportsWorkspace({ mode }: { mode: ReportsMode }) {
  const state = useReportsSession(mode);
  const router = useRouter();
  const isManager = mode === "manager";
  const { selectedBranchId } = useOwnerBranchScope();
  const [branches, setBranches] = useState<OwnerBranch[]>([]);
  const [reports, setReports] = useState<OwnerReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<ReportsAdvancedFilters>(
    EMPTY_REPORTS_FILTERS,
  );
  const [search, setSearch] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState<{
    reportId: string;
    top: number;
    left: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currency = state.workspace?.currency ?? "UGX";

  const loadReports = useCallback(async (opts?: { silent?: boolean }) => {
    if (!state.session) return;
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (!isManager && selectedBranchId) {
        params.set("branchId", selectedBranchId);
      }
      if (advancedFilters.status !== "all") {
        params.set("status", advancedFilters.status);
      }
      const range = dateRangeQuery(advancedFilters);
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      const reportsPath = `/operations/reports${params.toString() ? `?${params}` : ""}`;
      const [branchPayload, reportPayload] = await Promise.all([
        ownerFetch<{ branches?: OwnerBranch[] }>(state.session, "/branches"),
        ownerFetch<{ reports?: OwnerReport[] }>(
          state.session,
          reportsPath,
          { branchId: isManager ? null : selectedBranchId },
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
          router.replace(
            `${isManager ? "/reports" : "/owner/reports"}/${fromUrl}`,
          );
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
  }, [advancedFilters, isManager, router, selectedBranchId, state.session]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      if (state.ready && state.session) {
        void loadReports();
      }
    }, 0);
    return () => window.clearTimeout(boot);
  }, [loadReports, state.ready, state.session]);

  useOwnerLiveReload(loadReports, Boolean(state.ready && state.session));

  const scopedReports = useMemo(() => {
    return reports.filter((report) =>
      reportMatchesDate(report.operationDate, advancedFilters),
    );
  }, [advancedFilters, reports]);

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopedReports;
    return scopedReports.filter((report) => {
      const code = dailyReportCode(report.operationDate).toLowerCase();
      const statusText = reportStatusLabel(report.status).toLowerCase();
      return [
        code,
        report.reportNumber,
        report.branchName,
        report.operationDate,
        report.status,
        statusText,
        report.managerReviewedByName ?? "",
        report.ownerApprovedByName ?? "",
        state.user?.name ?? "",
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [scopedReports, search, state.user?.name]);

  const selectedReport =
    reports.find((report) => report.id === selectedId) ??
    scopedReports[0] ??
    null;
  const selectedSnapshot = selectedReport
    ? readReportSnapshot(selectedReport)
    : null;

  const waitingReports = reports.filter((r) => r.status === "SENT_TO_OWNER");
  const approvedReports = reports.filter((r) => r.status === "OWNER_APPROVED");
  const actionMenuReport =
    reports.find((report) => report.id === actionMenu?.reportId) ?? null;

  async function submitReportAction(report: OwnerReport) {
    if (!state.session || actingId) return;
    setActingId(report.id);
    setError(null);
    setNotice(null);
    try {
      const path = isManager
        ? `/operations/reports/${report.id}/manager-confirm`
        : `/operations/reports/${report.id}/owner-approve`;
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method: "POST",
        headers: {
          ...authHeaders(state.session),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes: actionNotes.trim() || undefined }),
      });
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) throw new Error(formatApiError(payload.message));
      setActionNotes("");
      setNotice(
        isManager
          ? report.status === "RETURNED_TO_MANAGER"
            ? "Report resubmitted to owner successfully."
            : "Report sent to owner successfully."
          : "Report approved successfully.",
      );
      invalidateOwnerNotifications();
      await loadReports();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : isManager
            ? "Could not send report to owner."
            : "Could not approve report.",
      );
    } finally {
      setActingId(null);
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
      <div className="mx-auto max-w-[1440px] space-y-5 animate-rise">
        <OwnerHeader
          title="Daily Reports"
          subtitle="Review reconciled branch operations, submit reports for approval, and track cash differences."
          showReportsButton={false}
          settingsHref={isManager ? "/settings" : "/owner/settings"}
          reportsHref={isManager ? "/reports" : "/owner/reports"}
          notificationScope={mode}
          actions={
            <button
              type="button"
              onClick={() => void loadReports()}
              disabled={loading}
              aria-label="Refresh reports"
              className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#25314b] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-[#f8faf9] disabled:opacity-60"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          }
        />

        {notice ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-[var(--forest-emerald)]">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<ClipboardList className="size-4" />}
            tone="green"
            label="Total Reports"
            value={formatNumber(scopedReports.length)}
            detail={
              advancedFilters.status === "all"
                ? isManager
                  ? "This Branch"
                  : "In This List"
                : reportStatusLabel(advancedFilters.status)
            }
          />
          <MetricCard
            icon={<Clock3 className="size-4" />}
            tone="gold"
            label={isManager ? "Awaiting Approval" : "Needs Your Review"}
            value={formatNumber(waitingReports.length)}
            detail={
              isManager
                ? "Waiting For Approval"
                : waitingReports.length === 0
                  ? "Nothing Waiting"
                  : "Tap To Review"
            }
            onClick={
              waitingReports.length > 0
                ? () =>
                    setAdvancedFilters((current) => ({
                      ...current,
                      status: "SENT_TO_OWNER",
                    }))
                : undefined
            }
            active={advancedFilters.status === "SENT_TO_OWNER"}
          />
          <MetricCard
            icon={<CheckCircle2 className="size-4" />}
            tone="violet"
            label="Approved Reports"
            value={formatNumber(approvedReports.length)}
            detail="Finished And Saved"
          />
          <MetricCard
            icon={<Scale className="size-4" />}
            tone="blue"
            label="Cash Difference"
            value={
              <Money
                value={sumBy(reports, (report) => report.closingVariance ?? 0)}
                currency={currency}
              />
            }
            detail="Counted Cash vs Expected"
          />
        </section>

        <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f5] px-4 py-4">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-[#0b1220]">
                Report Records
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                Select a report to inspect cash movements.
              </p>
            </div>
            <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-initial">
              <TableSearchField
                value={search}
                onChange={setSearch}
                placeholder="Search Reports..."
                title={
                  isManager
                    ? "Search report code, date or status for your branch."
                    : "Search report code, branch, date, status or manager."
                }
              />
              {advancedFilters.status === "SENT_TO_OWNER" ? (
                <button
                  type="button"
                  onClick={() =>
                    setAdvancedFilters((current) => ({
                      ...current,
                      status: "all",
                    }))
                  }
                  className="h-9 rounded-xl border border-[#e6ebf0] bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-[#f8faf9]"
                >
                  Show All Statuses
                </button>
              ) : null}
              <ReportsFiltersControl
                mode={mode}
                branches={branches.map((branch) => ({
                  id: branch.id,
                  name: branch.name,
                }))}
                applied={advancedFilters}
                onApply={setAdvancedFilters}
              />
            </div>
          </div>

          <div>
            <div className="hidden grid-cols-[0.9fr_0.85fr_1fr_1fr_1.15fr_1.05fr_0.95fr_0.7fr] gap-3 border-b border-[#dfe5eb] bg-[#e8edf2] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-600 lg:grid">
              <span>Report</span>
              <span>Date</span>
              <span className="text-right">Expected Cash</span>
              <span className="text-right">Counted Cash</span>
              <span>Variance</span>
              <span>Prepared By</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="max-h-[min(70vh,720px)] overflow-y-auto">
              {loading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-12 animate-pulse rounded-xl bg-[#f1f5f4]"
                    />
                  ))}
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <p className="text-sm font-semibold text-[#0b1220]">
                    No reports in this view
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Adjust filters or wait for managers to submit close-day
                    reports.
                  </p>
                </div>
              ) : (
                filteredReports.map((report) => {
                  const active = selectedReport?.id === report.id;
                  const snapshot = readReportSnapshot(report);
                  const closedBy = textValue(
                    snapshot.operation.closedByName,
                    "",
                  );
                  const preparedByName =
                    report.managerReviewedByName?.trim() ||
                    closedBy ||
                    (isManager
                      ? state.user?.name?.trim() || "Manager"
                      : "—");
                  return (
                    <div
                      key={report.id}
                      className={`grid w-full grid-cols-1 gap-2 border-b border-[#edf1f5] px-4 py-3 text-left transition last:border-b-0 lg:grid-cols-[0.9fr_0.85fr_1fr_1fr_1.15fr_1.05fr_0.95fr_0.7fr] lg:items-center lg:gap-3 ${
                        active
                          ? "bg-emerald-50/70"
                          : "bg-white hover:bg-[#f8faf9]"
                      }`}
                    >
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => {
                          setSelectedId(report.id);
                          router.push(
                            `${isManager ? "/reports" : "/owner/reports"}/${report.id}`,
                          );
                        }}
                      >
                        <p className="truncate text-sm font-semibold text-[#0b1220]">
                          {dailyReportCode(report.operationDate)}
                        </p>
                        {!isManager ? (
                          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
                            {report.branchName}
                          </p>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className="text-left text-xs font-semibold text-slate-600"
                        onClick={() => {
                          setSelectedId(report.id);
                          router.push(
                            `${isManager ? "/reports" : "/owner/reports"}/${report.id}`,
                          );
                        }}
                      >
                        {formatDate(report.operationDate)}
                      </button>
                      <p className="text-xs font-semibold tabular-nums text-[#0b1220] lg:text-right">
                        <Money
                          value={report.expectedClosingBalance}
                          currency={currency}
                        />
                      </p>
                      <p className="text-xs font-semibold tabular-nums text-[#0b1220] lg:text-right">
                        <Money
                          value={report.closingBalance ?? 0}
                          currency={currency}
                        />
                      </p>
                      <div>
                        <VarianceLabel
                          variance={report.closingVariance}
                          currency={currency}
                        />
                      </div>
                      <p className="truncate text-xs font-semibold text-slate-600">
                        {preparedByName}
                      </p>
                      <div>
                        <StatusPill status={report.status} />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg border border-[#e6ebf0] bg-white text-[#0b1220] hover:bg-slate-50"
                          aria-label="Report actions"
                          onClick={(event) => {
                            event.stopPropagation();
                            const rect = (
                              event.currentTarget as HTMLButtonElement
                            ).getBoundingClientRect();
                            const menuWidth = 188;
                            setActionMenu({
                              reportId: report.id,
                              top: rect.bottom + 6,
                              left: Math.min(
                                rect.right - menuWidth,
                                window.innerWidth - menuWidth - 12,
                              ),
                            });
                          }}
                        >
                          <MoreVertical className="size-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>

      {actionMenu && actionMenuReport ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close report actions"
            onClick={() => setActionMenu(null)}
          />
          <div
            role="menu"
            className="fixed z-50 w-[188px] rounded-xl border border-[#e6ebf0] bg-white p-1 text-left shadow-[0_14px_34px_rgba(15,23,42,0.16)]"
            style={{ top: actionMenu.top, left: actionMenu.left }}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6]"
              onClick={() => {
                setActionMenu(null);
                router.push(
                  `${isManager ? "/reports" : "/owner/reports"}/${actionMenuReport.id}`,
                );
              }}
            >
              <Eye className="size-3.5 text-slate-500" />
              View report
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={
                exportingId === actionMenuReport.id ||
                !readReportSnapshot(actionMenuReport)
              }
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6] disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => {
                const snapshot = readReportSnapshot(actionMenuReport);
                setActionMenu(null);
                if (!snapshot) return;
                void exportReport(
                  actionMenuReport,
                  snapshot,
                  currency,
                  "excel",
                  setExportingId,
                );
              }}
            >
              <FileSpreadsheet className="size-3.5 text-slate-500" />
              Excel
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={
                exportingId === actionMenuReport.id ||
                !readReportSnapshot(actionMenuReport)
              }
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6] disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => {
                const snapshot = readReportSnapshot(actionMenuReport);
                setActionMenu(null);
                if (!snapshot) return;
                void exportReport(
                  actionMenuReport,
                  snapshot,
                  currency,
                  "pdf",
                  setExportingId,
                );
              }}
            >
              <FileText className="size-3.5 text-slate-500" />
              PDF document
            </button>
            {isManager ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  disabled={
                    actionMenuReport.status !== "MANAGER_REVIEW" &&
                    actionMenuReport.status !== "RETURNED_TO_MANAGER"
                  }
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6] disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => {
                    setActionMenu(null);
                    router.push("/operations");
                  }}
                >
                  <Pencil className="size-3.5 text-slate-500" />
                  Edit returned report
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={
                    actionMenuReport.status !== "RETURNED_TO_MANAGER" ||
                    actingId === actionMenuReport.id
                  }
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6] disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => {
                    const report = actionMenuReport;
                    setActionMenu(null);
                    setSelectedId(report.id);
                    void submitReportAction(report);
                  }}
                >
                  <Send className="size-3.5 text-slate-500" />
                  Resubmit report
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
  onClick,
  active,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: string;
  tone: "green" | "gold" | "violet" | "blue";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneClass = {
    green: "bg-emerald-50 text-[var(--forest-emerald)]",
    gold: "bg-orange-50 text-orange-600",
    violet: "bg-violet-50 text-violet-600",
    blue: "bg-sky-50 text-sky-600",
  }[tone];

  const body = (
    <>
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneClass}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-slate-500">
          {label}
        </p>
        <p className="mt-1 break-words text-[clamp(0.85rem,1vw,1.1rem)] font-semibold leading-tight tabular-nums text-[#111827]">
          {value}
        </p>
        <p
          className={`mt-1 text-[11px] font-semibold ${
            active ? "text-amber-700" : "text-slate-500"
          }`}
        >
          {detail}
        </p>
      </div>
    </>
  );

  const className = `flex min-h-[92px] min-w-0 items-center gap-3 rounded-[14px] border border-[#e6ebf0] bg-white px-4 py-3.5 text-left shadow-[0_12px_26px_rgba(15,23,42,0.045)] ${
    onClick ? "transition hover:border-emerald-200 hover:bg-[#fbfefc]" : ""
  } ${active ? "ring-1 ring-amber-200" : ""}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <article className={className}>{body}</article>;
}

function StatusPill({ status }: { status: string }) {
  const style =
    status === "OWNER_APPROVED"
      ? "bg-emerald-50 text-[var(--forest-emerald)] ring-emerald-100"
      : status === "SENT_TO_OWNER"
        ? "bg-amber-50 text-amber-700 ring-amber-100"
        : status === "RETURNED_TO_MANAGER"
          ? "bg-red-50 text-red-700 ring-red-100"
          : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${style}`}
    >
      {reportStatusLabel(status)}
    </span>
  );
}

function VarianceLabel({
  variance,
  currency,
}: {
  variance: number | null | undefined;
  currency: string;
}) {
  if (variance == null || !Number.isFinite(variance) || variance === 0) {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-[var(--forest-emerald)]">
        Matched
      </span>
    );
  }
  const amount = Math.abs(variance);
  if (variance > 0) {
    return (
      <span className="text-xs font-semibold text-amber-700">
        {formatMoney(amount, currency)} excess
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold text-red-600">
      {formatMoney(amount, currency)} shortage
    </span>
  );
}

function ViewTab({
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
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold transition ${
        active
          ? "bg-white text-[var(--forest-emerald)] shadow-[0_4px_12px_rgba(15,23,42,0.08)]"
          : "text-slate-500 hover:text-[#0b1220]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ReportSummaryView({
  report,
  snapshot,
  currency,
  notes,
  setNotes,
  approving,
  mode,
  onAction,
}: {
  report: OwnerReport;
  snapshot: ReportSnapshot;
  currency: string;
  notes: string;
  setNotes: (value: string) => void;
  approving: boolean;
  mode: ReportsMode;
  onAction: () => void;
}) {
  const opening = snapshot.openingCash;
  const summary = snapshot.summary;
  const variance = report.closingVariance ?? 0;
  const agentsReturned = snapshot.agentReturns.filter(
    (row) => row.amountReturned != null || row.status === "RETURNED",
  ).length;

  return (
    <div className="space-y-3">
      <section className="grid gap-2.5 md:grid-cols-3">
        <HeroStat
          icon={<WalletCards className="size-3.5" />}
          label="Expected Close"
          value={
            <Money
              value={report.expectedClosingBalance}
              currency={currency}
            />
          }
          tone="green"
        />
        <HeroStat
          icon={<Banknote className="size-3.5" />}
          label="Counted Cash"
          value={<Money value={report.closingBalance ?? 0} currency={currency} />}
          tone="blue"
        />
        <HeroStat
          icon={<Scale className="size-3.5" />}
          label="Cash Difference"
          value={<Money value={variance} currency={currency} />}
          tone={variance !== 0 ? "red" : "slate"}
          hint={variance === 0 ? "Balanced" : "Needs attention"}
        />
      </section>

      <section className="grid gap-2.5 lg:grid-cols-2">
        <Panel title="ADDITIONS" icon={<ArrowRightLeft className="size-3.5" />}>
          <LineRow
            label="Opening Balance"
            value={
              <Money
                value={
                  numberValue(opening.totalOpeningBalance) ||
                  numberValue(opening.previousClosingBalance) ||
                  numberValue(summary.openingCash)
                }
                currency={currency}
              />
            }
          />
          <LineRow
            label="Capital received"
            value={
              <Money
                value={
                  numberValue(opening.cashAddedToday) ||
                  numberValue(summary.topUpsAdded)
                }
                currency={currency}
              />
            }
          />
          <LineRow
            label="Cash in"
            value={
              <Money
                value={numberValue(summary.collectionsReceived)}
                currency={currency}
              />
            }
            positive={numberValue(summary.collectionsReceived) > 0}
          />
          <LineRow
            label="Processing fees"
            value={
              <Money
                value={numberValue(summary.processingFees)}
                currency={currency}
              />
            }
            positive={numberValue(summary.processingFees) > 0}
          />
          <LineRow
            label="Shortage cleared"
            value={
              <Money
                value={numberValue(summary.shortageRecoveries)}
                currency={currency}
              />
            }
            positive={numberValue(summary.shortageRecoveries) > 0}
          />
          <LineRow
            label="Total Additions"
            value={
              <Money
                value={
                  numberValue(summary.collectionsReceived) +
                  numberValue(summary.processingFees) +
                  numberValue(summary.shortageRecoveries)
                }
                currency={currency}
              />
            }
            strong
            positive
          />
        </Panel>
        <Panel title="CASHOUTS" icon={<HandCoins className="size-3.5" />}>
          <LineRow
            label="Total Expenses"
            value={
              <Money value={numberValue(summary.expenses)} currency={currency} />
            }
            danger={numberValue(summary.expenses) > 0}
          />
          <LineRow
            label="Salary"
            value={
              <Money
                value={numberValue(summary.salaries)}
                currency={currency}
              />
            }
            danger={numberValue(summary.salaries) > 0}
          />
          <LineRow
            label="Total Cashouts"
            value={
              <Money
                value={
                  numberValue(summary.expenses) +
                  numberValue(summary.salaries)
                }
                currency={currency}
              />
            }
            strong
            danger
          />
        </Panel>
      </section>

      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <MiniKpi
          icon={<FileText className="size-3.5" />}
          label="Loans Given"
          value={formatNumber(numberValue(summary.loansIssuedCount))}
          hint={
            <Money
              value={numberValue(summary.loansIssuedPrincipal)}
              currency={currency}
            />
          }
        />
        <MiniKpi
          icon={<HandCoins className="size-3.5" />}
          label="Repayments"
          value={formatNumber(numberValue(summary.collectionsCount))}
          hint={
            <Money
              value={numberValue(summary.collectionsReceived)}
              currency={currency}
            />
          }
        />
        <MiniKpi
          icon={<Banknote className="size-3.5" />}
          label="Processing Fees"
          value={
            <Money
              value={numberValue(summary.processingFees)}
              currency={currency}
            />
          }
          hint="From New Loans"
        />
        <MiniKpi
          icon={<Users className="size-3.5" />}
          label="Field Officers Back"
          value={`${agentsReturned}/${snapshot.agentReturns.length}`}
          hint={
            <Money
              value={sumBy(snapshot.agentReturns, (row) =>
                numberValue(row.expectedReturn),
              )}
              currency={currency}
            />
          }
        />
      </section>

      <Panel title="Officer handover" icon={<Users className="size-3.5" />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead>
              <tr className="border-b border-[#dfe5eb] bg-[#e8edf2] text-[10px] font-semibold text-slate-600">
                <th className="px-2 py-2 font-semibold">Field Officer</th>
                <th className="px-2 py-2 text-right font-semibold">Float</th>
                <th className="px-2 py-2 text-right font-semibold">Loans</th>
                <th className="px-2 py-2 text-right font-semibold">
                  Repayments
                </th>
                <th className="px-2 py-2 text-right font-semibold">Expenses</th>
                <th className="px-2 py-2 text-right font-semibold">Expected</th>
                <th className="px-2 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f5]">
              {snapshot.agentReturns.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-2 py-6 text-center text-[11px] font-medium text-slate-500"
                  >
                    No field officer float recorded for this day.
                  </td>
                </tr>
              ) : (
                snapshot.agentReturns.map((row, index) => {
                  const status = row.status ?? "PENDING";
                  return (
                    <tr
                      key={row.floatId ?? row.agentId ?? index}
                      className={`transition-colors hover:bg-[#eef7f2] ${
                        status === "PENDING"
                          ? "bg-amber-50/30"
                          : status === "SHORT"
                            ? "bg-red-50/30"
                            : status === "RETURNED"
                              ? "bg-emerald-50/20"
                              : ""
                      }`}
                    >
                      <td className="px-2 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#eef6f2] text-[10px] font-bold text-[var(--forest-emerald)]">
                            {initials(row.agentName ?? "Field Officer")}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold text-[#0b1220]">
                              {row.agentName ?? "Field Officer"}
                            </p>
                            <p className="truncate text-[10px] text-slate-500">
                              {row.agentPublicId ?? "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right text-[11px] font-semibold tabular-nums">
                        <Money
                          value={numberValue(row.amountGiven)}
                          currency={currency}
                        />
                      </td>
                      <td className="px-2 py-2 text-right text-[11px] tabular-nums text-slate-600">
                        <Money
                          value={numberValue(row.amountDisbursed)}
                          currency={currency}
                        />
                      </td>
                      <td className="px-2 py-2 text-right text-[11px] tabular-nums text-slate-600">
                        <Money
                          value={numberValue(row.amountCollected)}
                          currency={currency}
                        />
                      </td>
                      <td className="px-2 py-2 text-right text-[11px] tabular-nums text-slate-600">
                        <Money
                          value={numberValue(row.expensesTotal)}
                          currency={currency}
                        />
                      </td>
                      <td className="px-2 py-2 text-right text-[11px] font-semibold tabular-nums">
                        <Money
                          value={numberValue(row.expectedReturn)}
                          currency={currency}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <StatusPill status={status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <section className="grid gap-2.5 xl:grid-cols-[1.15fr_1.15fr_0.9fr]">
        <RecordList
          title="Capital top-ups"
          empty="No capital top-ups recorded."
          rows={snapshot.topUps.map((topUp, index) => ({
            id: topUp.id ?? `topup-${index}`,
            label: topUp.description || "Capital top-up",
            meta: `${formatClock(topUp.addedAt)} · ${topUp.recordedByName ?? "Manager"}`,
            value: (
              <Money
                value={numberValue(topUp.amount)}
                currency={currency}
              />
            ),
          }))}
        />
        <RecordList
          title="Expenses"
          empty="No expenses recorded."
          rows={snapshot.expenses.map((expense, index) => ({
            id: expense.id ?? `expense-${index}`,
            label:
              expense.description?.trim() ||
              (expense.paidFrom === "AGENT_FLOAT"
                ? "Field expense"
                : categoryLabel(expense.category)),
            meta: `${formatClock(expense.incurredAt)} · ${
              expense.paidFrom === "AGENT_FLOAT" ? "Field float" : "Branch cash"
            } · ${expense.agentName || expense.recordedByName || "Officer"}`,
            value: (
              <Money
                value={numberValue(expense.amount)}
                currency={currency}
              />
            ),
          }))}
        />
        <Panel title="Timeline" icon={<Clock3 className="size-3.5" />}>
          <TimelineRow
            label="Opened by"
            value={textValue(snapshot.operation.openedByName, "Not recorded")}
          />
          <TimelineRow
            label="Closed by"
            value={textValue(snapshot.operation.closedByName, "Not recorded")}
          />
          <TimelineRow
            label="Sent to owner"
            value={formatDateTime(report.managerReviewedAt)}
          />
        </Panel>
      </section>

      <section className="grid gap-2.5 lg:grid-cols-[1.2fr_0.8fr]">
        <ReportActionCard
          report={report}
          notes={notes}
          setNotes={setNotes}
          approving={approving}
          mode={mode}
          onAction={onAction}
        />
        <Panel title="Closing notes" icon={<FileText className="size-3.5" />}>
          <p className="text-xs font-medium leading-relaxed text-slate-600">
            {snapshot.closingNotes?.trim() ||
              "No closing notes were added for this day."}
          </p>
        </Panel>
      </section>
    </div>
  );
}

function HeroStat({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone: "green" | "blue" | "red" | "slate";
  hint?: ReactNode;
}) {
  const wrap = {
    green: "border-emerald-100 bg-emerald-50/50",
    blue: "border-sky-100 bg-sky-50/50",
    red: "border-red-100 bg-red-50/50",
    slate: "border-[#e6ebf0] bg-white",
  }[tone];
  const iconTone = {
    green: "bg-white text-[var(--forest-emerald)]",
    blue: "bg-white text-sky-700",
    red: "bg-white text-red-700",
    slate: "bg-slate-100 text-slate-600",
  }[tone];
  const valueTone = {
    green: "text-[var(--forest-emerald)]",
    blue: "text-sky-800",
    red: "text-red-700",
    slate: "text-[#0b1220]",
  }[tone];

  return (
    <article
      className={`flex min-h-[72px] items-center gap-2.5 rounded-[13px] border px-3 py-2.5 ${wrap}`}
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-lg ${iconTone}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
          {label}
        </p>
        <p
          className={`mt-0.5 break-words text-[clamp(0.8rem,1vw,1.05rem)] font-bold leading-tight tabular-nums ${valueTone}`}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-0.5 text-[10px] font-medium text-slate-500">{hint}</p>
        ) : null}
      </div>
    </article>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[14px] border border-[#e6ebf0] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2 border-b border-[#edf1f5] bg-[#f8faf9] px-3 py-2.5">
        {icon ? (
          <span className="text-[var(--forest-emerald)]">{icon}</span>
        ) : null}
        <h4 className="text-sm font-bold text-[#0b1220]">{title}</h4>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function LineRow({
  label,
  value,
  strong,
  danger,
  positive,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
  danger?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#edf1f5] py-1.5 last:border-b-0 last:pb-0 first:pt-0">
      <span
        className={`text-[12px] sm:text-[13px] ${strong ? "font-semibold text-[#0b1220]" : "font-medium text-slate-600"}`}
      >
        {label}
      </span>
      <span
        className={`shrink-0 text-[12px] font-bold tabular-nums sm:text-[13px] ${
          danger
            ? "text-red-700"
            : positive
              ? "text-emerald-700"
              : "text-[#0b1220]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function MiniKpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint: ReactNode;
}) {
  return (
    <article className="rounded-[13px] border border-[#e6ebf0] bg-white px-3 py-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.03)]">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-[#eef6f2] text-[var(--forest-emerald)]">
          {icon}
        </span>
        <p className="truncate text-[11px] font-medium text-slate-500">
          {label}
        </p>
      </div>
      <p className="mt-1.5 text-sm font-bold tabular-nums text-[#0b1220]">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500">
        {hint}
      </p>
    </article>
  );
}

function RecordList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ id: string; label: string; meta: string; value: ReactNode }>;
}) {
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-[11px] font-medium text-slate-500">
          {empty}
        </p>
      ) : (
        <div className="divide-y divide-[#edf1f5]">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-[#0b1220]">
                  {row.label}
                </p>
                <p className="truncate text-[10px] font-medium text-slate-500">
                  {row.meta}
                </p>
              </div>
              <p className="shrink-0 text-[11px] font-bold tabular-nums text-[#0b1220]">
                {row.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function TimelineRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[#edf1f5] py-1.5 first:pt-0 last:border-b-0 last:pb-0">
      <p className="text-[10px] font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 text-[11px] font-semibold text-[#0b1220]">{value}</p>
    </div>
  );
}

function ReportActionCard({
  report,
  notes,
  setNotes,
  approving,
  mode,
  onAction,
}: {
  report: OwnerReport;
  notes: string;
  setNotes: (value: string) => void;
  approving: boolean;
  mode: ReportsMode;
  onAction: () => void;
}) {
  const isManager = mode === "manager";
  const canAct = isManager
    ? report.status === "MANAGER_REVIEW" ||
      report.status === "RETURNED_TO_MANAGER"
    : report.status === "SENT_TO_OWNER";
  return (
    <section className="overflow-hidden rounded-[14px] border border-[#e6ebf0] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#edf1f5] bg-[#f8faf9] px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-amber-700">
          {isManager ? "Manager review" : "Owner review"}
        </p>
        <h4 className="mt-0.5 text-sm font-bold text-[#0b1220]">
          {statusLabel(report.status)}
        </h4>
        <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-slate-500">
          {statusHelp(report.status)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 border-b border-[#edf1f5] px-3 py-2.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
            Manager
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-[#0b1220]">
            {report.managerReviewedByName ?? "Pending"}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {formatDateTime(report.managerReviewedAt)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
            Owner
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-[#0b1220]">
            {report.ownerApprovedByName ?? "Pending"}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {formatDateTime(report.ownerApprovedAt)}
          </p>
        </div>
      </div>
      <div className="p-3">
        {canAct ? (
          <>
            <label className="text-[11px] font-semibold text-[#0b1220]">
              {isManager ? "Notes for owner" : "Approval notes"}
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-1.5 min-h-[72px] w-full rounded-xl border border-[#e6ebf0] bg-[#fbfcfd] px-3 py-2 text-xs font-medium outline-none transition focus:border-[var(--forest-emerald)]"
                placeholder={
                  isManager
                    ? "Optional note before sending to owner"
                    : "Optional note before approval"
                }
              />
            </label>
            <button
              type="button"
              className="mt-2.5 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-4 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(15,143,104,0.25)] disabled:opacity-55"
              onClick={onAction}
              disabled={approving}
            >
              {approving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              {isManager
                ? report.status === "RETURNED_TO_MANAGER"
                  ? "Resubmit report"
                  : "Send to owner"
                : "Approve report"}
            </button>
          </>
        ) : (
          <p className="text-[11px] font-medium text-slate-500">
            {report.status === "OWNER_APPROVED"
              ? "This report is approved and locked."
              : report.status === "SENT_TO_OWNER" && isManager
                ? "This report is with the owner for approval."
                : isManager
                  ? "No manager action is required right now."
                  : "No owner action is required right now."}
          </p>
        )}
      </div>
    </section>
  );
}

function LedgerTable({
  report,
  snapshot,
  currency,
}: {
  report: OwnerReport;
  snapshot: ReportSnapshot;
  currency: string;
}) {
  const [sheet, setSheet] = useState<"daily" | "agents">("daily");
  const rows = buildExcelRows(report, snapshot);
  const columns = [
    "Section",
    "Description",
    "Count",
    "Inflow",
    "Cash Out",
    "Balance",
    "Notes",
  ];
  const letters = ["A", "B", "C", "D", "E", "F", "G"];
  const headerRow = 5;
  const firstDataRow = 6;
  const finalRowNumber = rows.length + firstDataRow;
  const selectedCell = sheet === "daily" ? `A${headerRow}` : "A3";
  const formulaLabel =
    sheet === "daily"
      ? `REMBEH Daily Operations Report · ${formatDate(report.operationDate)} · ${statusLabel(report.status)}`
      : `Officer handover · ${snapshot.agentReturns.length} agent${snapshot.agentReturns.length === 1 ? "" : "s"} · ${report.branchName}`;

  return (
    <div className="overflow-hidden rounded-[10px] border border-[#9aa5a0] bg-[#f3f7f5] shadow-[0_16px_40px_rgba(15,23,42,0.1)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#8f9a94] bg-[#217346] px-3 py-2 text-white">
        <FileSpreadsheet className="size-4 shrink-0 opacity-90" />
        <p className="min-w-0 flex-1 truncate text-xs font-semibold tracking-wide">
          {dailyReportCode(report.operationDate)}.xlsx — {report.branchName}
        </p>
        <span className="rounded bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]">
          Excel view
        </span>
      </div>

      <div className="border-b border-[#c6d2cc] bg-[#e7eee9] px-2 py-1.5">
        <div className="mb-1.5 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSheet("daily")}
            className={`rounded-t-md border px-3 py-1 text-[11px] font-bold transition ${
              sheet === "daily"
                ? "border-b-0 border-[#c6d2cc] bg-white text-[#217346]"
                : "border-transparent text-slate-500 hover:bg-white/50"
            }`}
          >
            Daily Report
          </button>
          <button
            type="button"
            onClick={() => setSheet("agents")}
            className={`rounded-t-md border px-3 py-1 text-[11px] font-bold transition ${
              sheet === "agents"
                ? "border-b-0 border-[#c6d2cc] bg-white text-[#217346]"
                : "border-transparent text-slate-500 hover:bg-white/50"
            }`}
          >
            Officer handover
          </button>
        </div>
        <div className="flex items-center gap-2 rounded border border-[#c6d2cc] bg-white px-2 py-1">
          <span className="grid size-6 place-items-center rounded border border-[#c6d2cc] bg-[#f4f7f5] text-[10px] font-bold text-slate-500">
            fx
          </span>
          <span className="w-14 shrink-0 border-r border-[#e2e8e4] pr-2 text-[11px] font-bold text-slate-600">
            {selectedCell}
          </span>
          <span className="min-w-0 truncate text-[11px] font-semibold text-slate-700">
            {formulaLabel}
          </span>
        </div>
      </div>

      {sheet === "daily" ? (
        <div className="overflow-x-auto bg-[#eef3f0]">
          <table className="w-full min-w-[880px] table-fixed border-collapse text-left text-[11px]">
            <colgroup>
              <col className="w-9" />
              <col className="w-[12%]" />
              <col className="w-[26%]" />
              <col className="w-[8%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead>
              <tr>
                <th className="border border-[#c6d2cc] bg-[#dbe4df]" />
                {letters.map((letter) => (
                  <th
                    key={letter}
                    className="border border-[#c6d2cc] bg-[#dbe4df] px-1 py-1 text-center text-[10px] font-bold text-slate-600"
                  >
                    {letter}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <ExcelMergedRow
                rowNumber={1}
                cols={7}
                value="REMBEH Daily Operations Report"
                strong
              />
              <ExcelMergedRow
                rowNumber={2}
                cols={7}
                value={`${report.branchName} — ${formatDate(report.operationDate)}`}
              />
              <ExcelMergedRow
                rowNumber={3}
                cols={7}
                value={`${dailyReportCode(report.operationDate)} — ${statusLabel(report.status)}`}
                muted
              />
              <tr>
                <ExcelRowNumber value={4} />
                <ExcelSummaryCell
                  label="Expected Close"
                  value={report.expectedClosingBalance}
                  currency={currency}
                />
                <ExcelSummaryCell
                  label="Counted Cash"
                  value={report.closingBalance ?? 0}
                  currency={currency}
                />
                <ExcelSummaryCell
                  label="Cash Difference"
                  value={report.closingVariance ?? 0}
                  currency={currency}
                  danger={(report.closingVariance ?? 0) !== 0}
                />
                <td className="border border-[#c6d2cc] bg-white" />
              </tr>
              <tr>
                <ExcelRowNumber value={headerRow} />
                {columns.map((column) => (
                  <td
                    key={column}
                    className="border border-[#1f6b45] bg-[#217346] px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.03em] text-white"
                  >
                    {column}
                  </td>
                ))}
              </tr>
              {rows.map((row, index) => (
                <tr
                  key={`${row.section}-${row.description}`}
                  className={index % 2 === 0 ? "bg-white" : "bg-[#f7fbf8]"}
                >
                  <ExcelRowNumber value={firstDataRow + index} />
                  <td className="border border-[#d0d9d4] px-2 py-1.5 font-bold text-[#1a2b22]">
                    {row.section}
                  </td>
                  <td className="border border-[#d0d9d4] px-2 py-1.5 text-slate-700">
                    {row.description}
                  </td>
                  <td className="border border-[#d0d9d4] px-2 py-1.5 text-right tabular-nums text-slate-600">
                    {row.count}
                  </td>
                  <ExcelMoneyCell
                    value={row.cashIn}
                    tone="in"
                    currency={currency}
                  />
                  <ExcelMoneyCell
                    value={row.cashOut}
                    tone="out"
                    currency={currency}
                  />
                  <ExcelMoneyCell
                    value={row.balance}
                    tone="balance"
                    currency={currency}
                  />
                  <td className="border border-[#d0d9d4] px-2 py-1.5 text-slate-500">
                    {row.note}
                  </td>
                </tr>
              ))}
              <tr>
                <ExcelRowNumber value={finalRowNumber} />
                <td className="border border-[#c6d2cc] bg-[#dfe8e3] px-2 py-1.5 font-bold text-[#1a2b22]">
                  Closing
                </td>
                <td className="border border-[#c6d2cc] bg-[#dfe8e3] px-2 py-1.5 font-bold text-[#1a2b22]">
                  Final report totals
                </td>
                <td className="border border-[#c6d2cc] bg-[#dfe8e3] px-2 py-1.5 text-right font-bold tabular-nums">
                  —
                </td>
                <ExcelMoneyCell
                  value={
                    numberValue(snapshot.summary.cashReturnedByAgents) +
                    numberValue(snapshot.summary.collectionsReceived) +
                    numberValue(snapshot.summary.processingFees)
                  }
                  tone="in"
                  total
                  currency={currency}
                />
                <ExcelMoneyCell
                  value={
                    numberValue(snapshot.summary.floatDistributed) +
                    numberValue(snapshot.summary.expenses) +
                    numberValue(snapshot.summary.salaries) +
                    numberValue(snapshot.summary.loansIssuedPrincipal)
                  }
                  tone="out"
                  total
                  currency={currency}
                />
                <ExcelMoneyCell
                  value={report.expectedClosingBalance}
                  tone="balance"
                  total
                  currency={currency}
                />
                <td className="border border-[#c6d2cc] bg-[#dfe8e3] px-2 py-1.5 font-semibold text-slate-600">
                  Ready for owner
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <AgentHandoverExcel
          report={report}
          agents={snapshot.agentReturns}
          currency={currency}
        />
      )}

      <div className="flex items-center justify-between gap-2 border-t border-[#c6d2cc] bg-[#e7eee9] px-3 py-1.5 text-[10px] font-semibold text-slate-500">
        <span>
          Sheet {sheet === "daily" ? "1" : "2"} of 2 ·{" "}
          {sheet === "daily" ? "Daily Report" : "Officer handover"}
        </span>
        <span>Use Export → Excel for the real .xlsx file</span>
      </div>
    </div>
  );
}

function AgentHandoverExcel({
  report,
  agents,
  currency,
}: {
  report: OwnerReport;
  agents: ReportAgentReturn[];
  currency: string;
}) {
  const columns = [
    "Field Officer",
    "Float",
    "Loans",
    "Repayments",
    "Fees",
    "Expenses",
    "Expected",
    "Returned",
    "Status",
  ];
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const returnedCount = agents.filter(
    (row) => row.amountReturned != null,
  ).length;

  return (
    <div className="overflow-x-auto bg-[#eef3f0]">
      <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-[11px]">
        <colgroup>
          <col className="w-9" />
          <col className="w-[16%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[9%]" />
          <col className="w-[9%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead>
          <tr>
            <th className="border border-[#c6d2cc] bg-[#dbe4df]" />
            {letters.map((letter) => (
              <th
                key={letter}
                className="border border-[#c6d2cc] bg-[#dbe4df] px-1 py-1 text-center text-[10px] font-bold text-slate-600"
              >
                {letter}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <ExcelMergedRow
            rowNumber={1}
            cols={9}
            value="REMBEH Officer handover"
            strong
          />
          <ExcelMergedRow
            rowNumber={2}
            cols={9}
            value={`${report.branchName} — ${formatDate(report.operationDate)} · ${returnedCount}/${agents.length} returned`}
          />
          <tr>
            <ExcelRowNumber value={3} />
            {columns.map((column) => (
              <td
                key={column}
                className="border border-[#1f6b45] bg-[#217346] px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.03em] text-white"
              >
                {column}
              </td>
            ))}
          </tr>
          {agents.length === 0 ? (
            <tr className="bg-white">
              <ExcelRowNumber value={4} />
              <td
                colSpan={9}
                className="border border-[#d0d9d4] px-2 py-6 text-center font-semibold text-slate-500"
              >
                No field officer float returns on this report
              </td>
            </tr>
          ) : (
            agents.map((row, index) => {
              const variance = row.variance ?? null;
              return (
                <tr
                  key={`${row.agentId ?? row.agentName ?? "agent"}-${index}`}
                  className={index % 2 === 0 ? "bg-white" : "bg-[#f7fbf8]"}
                >
                  <ExcelRowNumber value={4 + index} />
                  <td className="border border-[#d0d9d4] px-2 py-1.5 font-bold text-[#1a2b22]">
                    {row.agentName ?? "Field Officer"}
                    {row.agentPublicId ? (
                      <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                        {row.agentPublicId}
                      </span>
                    ) : null}
                  </td>
                  <ExcelMoneyCell
                    value={numberValue(row.amountGiven)}
                    tone="out"
                    currency={currency}
                  />
                  <ExcelMoneyCell
                    value={numberValue(row.amountDisbursed)}
                    tone="out"
                    currency={currency}
                  />
                  <ExcelMoneyCell
                    value={numberValue(row.amountCollected)}
                    tone="in"
                    currency={currency}
                  />
                  <ExcelMoneyCell
                    value={numberValue(row.processingFees)}
                    tone="in"
                    currency={currency}
                  />
                  <ExcelMoneyCell
                    value={numberValue(row.expensesTotal)}
                    tone="out"
                    currency={currency}
                  />
                  <ExcelMoneyCell
                    value={numberValue(row.expectedReturn)}
                    tone="balance"
                    currency={currency}
                  />
                  <ExcelMoneyCell
                    value={
                      row.amountReturned == null
                        ? null
                        : numberValue(row.amountReturned)
                    }
                    tone={
                      variance != null && variance !== 0 ? "out" : "balance"
                    }
                    currency={currency}
                  />
                  <td className="border border-[#d0d9d4] px-2 py-1.5 font-semibold text-slate-600">
                    {titleCase((row.status ?? "PENDING").replaceAll("_", " "))}
                    {variance != null && variance !== 0 ? (
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-red-700">
                        Var{" "}
                        <Money value={variance} currency={currency} />
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })
          )}
          {agents.length > 0 ? (
            <tr>
              <ExcelRowNumber value={4 + agents.length} />
              <td className="border border-[#c6d2cc] bg-[#dfe8e3] px-2 py-1.5 font-bold text-[#1a2b22]">
                Totals
              </td>
              <ExcelMoneyCell
                value={sumBy(agents, (row) => numberValue(row.amountGiven))}
                tone="out"
                total
                currency={currency}
              />
              <ExcelMoneyCell
                value={sumBy(agents, (row) => numberValue(row.amountDisbursed))}
                tone="out"
                total
                currency={currency}
              />
              <ExcelMoneyCell
                value={sumBy(agents, (row) => numberValue(row.amountCollected))}
                tone="in"
                total
                currency={currency}
              />
              <ExcelMoneyCell
                value={sumBy(agents, (row) => numberValue(row.processingFees))}
                tone="in"
                total
                currency={currency}
              />
              <ExcelMoneyCell
                value={sumBy(agents, (row) => numberValue(row.expensesTotal))}
                tone="out"
                total
                currency={currency}
              />
              <ExcelMoneyCell
                value={sumBy(agents, (row) => numberValue(row.expectedReturn))}
                tone="balance"
                total
                currency={currency}
              />
              <ExcelMoneyCell
                value={sumBy(agents, (row) =>
                  row.amountReturned == null
                    ? 0
                    : numberValue(row.amountReturned),
                )}
                tone="balance"
                total
                currency={currency}
              />
              <td className="border border-[#c6d2cc] bg-[#dfe8e3] px-2 py-1.5 font-semibold text-slate-600">
                {returnedCount}/{agents.length} settled
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ExcelMergedRow({
  rowNumber,
  value,
  strong,
  muted,
  cols = 7,
}: {
  rowNumber: number;
  value: string;
  strong?: boolean;
  muted?: boolean;
  cols?: number;
}) {
  return (
    <tr>
      <ExcelRowNumber value={rowNumber} />
      <td
        colSpan={cols}
        className={`border border-[#c6d2cc] bg-white px-2 py-2 text-center ${
          strong
            ? "text-sm font-bold text-[#1a2b22]"
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

function ExcelRowNumber({ value }: { value: number }) {
  return (
    <td className="border border-[#c6d2cc] bg-[#dbe4df] px-1 py-1.5 text-center text-[10px] font-bold text-slate-500">
      {value}
    </td>
  );
}

function ExcelSummaryCell({
  label,
  value,
  currency,
  danger,
}: {
  label: string;
  value: number;
  currency: string;
  danger?: boolean;
}) {
  return (
    <td colSpan={2} className="border border-[#c6d2cc] bg-white px-2 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.04em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 font-bold tabular-nums ${
          danger ? "text-red-700" : "text-[#1a2b22]"
        }`}
      >
        <Money value={value} currency={currency} />
      </p>
    </td>
  );
}

function ExcelMoneyCell({
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
      ? "text-[#0f7a4d]"
      : tone === "out"
        ? "text-red-700"
        : "text-[#1a2b22]";
  return (
    <td
      className={`border border-[#d0d9d4] px-2 py-1.5 text-right tabular-nums ${color} ${
        total ? "border-[#c6d2cc] bg-[#dfe8e3] font-bold" : "font-semibold"
      }`}
    >
      {value == null ? "—" : <Money value={value} currency={currency} />}
    </td>
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
  const opening =
    numberValue(snapshot.openingCash.totalOpeningBalance) ||
    numberValue(snapshot.openingCash.previousClosingBalance) ||
    numberValue(snapshot.summary.openingCash);
  const capitalReceived =
    numberValue(snapshot.openingCash.cashAddedToday) ||
    numberValue(snapshot.summary.topUpsAdded);
  const cashIn = numberValue(snapshot.summary.collectionsReceived);
  const processingFees = numberValue(snapshot.summary.processingFees);
  const shortageCleared = numberValue(snapshot.summary.shortageRecoveries);
  const totalAdditions = cashIn + processingFees + shortageCleared;
  const totalExpenses = numberValue(snapshot.summary.expenses);
  const salary = numberValue(snapshot.summary.salaries);
  const totalCashouts = totalExpenses + salary;

  return [
    {
      section: "ADDITIONS",
      description: "Opening Balance",
      count: "-",
      cashIn: null as number | null,
      cashOut: null as number | null,
      balance: opening,
      note: "Carried into the day",
    },
    {
      section: "ADDITIONS",
      description: "Capital received",
      count: "-",
      cashIn: capitalReceived,
      cashOut: null,
      balance: null,
      note: "Capital added during the day",
    },
    {
      section: "ADDITIONS",
      description: "Cash in",
      count: formatNumber(numberValue(snapshot.summary.collectionsCount)),
      cashIn: cashIn,
      cashOut: null,
      balance: null,
      note: "Borrower repayments",
    },
    {
      section: "ADDITIONS",
      description: "Processing fees",
      count: "-",
      cashIn: processingFees,
      cashOut: null,
      balance: null,
      note: "Fees collected on issued loans",
    },
    {
      section: "ADDITIONS",
      description: "Shortage cleared",
      count: formatNumber(numberValue(snapshot.summary.shortageRecoveriesCount)),
      cashIn: shortageCleared,
      cashOut: null,
      balance: null,
      note: "Employee shortage paid off as cash in",
    },
    {
      section: "ADDITIONS",
      description: "Total Additions",
      count: "-",
      cashIn: totalAdditions,
      cashOut: null,
      balance: null,
      note: "Cash in + Processing fees + Shortage cleared",
    },
    {
      section: "CASHOUTS",
      description: "Total Expenses",
      count: formatNumber(snapshot.expenses.length),
      cashIn: null,
      cashOut: totalExpenses,
      balance: null,
      note: "Approved daily expenses",
    },
    {
      section: "CASHOUTS",
      description: "Salary",
      count: formatNumber(numberValue(snapshot.summary.salariesCount)),
      cashIn: null,
      cashOut: salary,
      balance: null,
      note: "Taken from the open branch day’s cash",
    },
    {
      section: "CASHOUTS",
      description: "Total Cashouts",
      count: "-",
      cashIn: null,
      cashOut: totalCashouts,
      balance: null,
      note: "Total Expenses + Salary",
    },
    {
      section: "Closing",
      description: "Expected closing balance",
      count: "-",
      cashIn: null,
      cashOut: null,
      balance: report.expectedClosingBalance,
      note: "Day’s cash position after officer handovers",
    },
    {
      section: "Closing",
      description: "Counted closing balance",
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
  return reportStatusLabel(value);
}

function dateRangeQuery(filters: ReportsAdvancedFilters): {
  from?: string;
  to?: string;
} {
  if (filters.datePreset === "all") return {};
  if (filters.datePreset === "custom") {
    return {
      from: filters.customFrom || undefined,
      to: filters.customTo || undefined,
    };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const toIso = (value: Date) => {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  if (filters.datePreset === "today") {
    const day = toIso(today);
    return { from: day, to: day };
  }
  if (filters.datePreset === "this_week") {
    const weekStart = new Date(today);
    const day = weekStart.getDay();
    const diff = day === 0 ? 6 : day - 1;
    weekStart.setDate(weekStart.getDate() - diff);
    return { from: toIso(weekStart), to: toIso(today) };
  }
  if (filters.datePreset === "this_month") {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toIso(monthStart), to: toIso(today) };
  }
  if (filters.datePreset === "last_month") {
    const lastMonthStart = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: toIso(lastMonthStart), to: toIso(lastMonthEnd) };
  }
  return {};
}

function statusHelp(value: string) {
  if (value === "MANAGER_REVIEW") {
    return "Day is closed. Check the figures, then send the report to the owner.";
  }
  if (value === "SENT_TO_OWNER") {
    return "Check the figures and approve when everything looks correct.";
  }
  if (value === "OWNER_APPROVED") {
    return "This report is finished and saved.";
  }
  if (value === "RETURNED_TO_MANAGER") {
    return "Returned for correction before it can be submitted again.";
  }
  return "This report is ready to review.";
}

async function exportReport(
  report: OwnerReport,
  snapshot: ReportSnapshot,
  currency: string,
  format: "excel" | "pdf",
  setExportingId: (id: string | null) => void,
) {
  setExportingId(report.id);
  try {
    if (format === "pdf") {
      const document = buildDailyReportDocumentFromSnapshot(
        {
          ...report,
          status: report.status as DailyReportStatus,
        },
        currency,
        {
          managerNotes: report.managerNotes ?? null,
          ownerNotes: report.ownerNotes ?? null,
          returnedAt: report.returnedAt ?? null,
          returnedByName: report.returnedByName ?? null,
          returnNotes: report.returnNotes ?? null,
        },
      );
      exportDailyReconciliationPdf(document);
      return;
    }

    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Daily Report");
    worksheet.addRow(["REMBEH Daily Operations Report"]);
    worksheet.mergeCells(1, 1, 1, 7);
    worksheet.addRow([
      report.branchName,
      dailyReportCode(report.operationDate),
      report.operationDate,
      statusLabel(report.status),
    ]);
    worksheet.mergeCells(2, 1, 2, 7);
    worksheet.addRow([]);
    const header = worksheet.addRow([
      "Section",
      "Description",
      "Count",
      "Inflow",
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
    const agentSheet = workbook.addWorksheet("Officer handover");
    agentSheet.addRow([
      "Field Officer",
      "Float",
      "Loans",
      "Repayments",
      "Fees",
      "Expenses",
      "Expected",
      "Returned",
      "Status",
    ]);
    snapshot.agentReturns.forEach((row) => {
      agentSheet.addRow([
        row.agentName ?? "Field Officer",
        numberValue(row.amountGiven),
        numberValue(row.amountDisbursed),
        numberValue(row.amountCollected),
        numberValue(row.processingFees),
        numberValue(row.expensesTotal),
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
      { width: 16 },
    ];
    agentSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    agentSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F8F68" },
    };
    [2, 3, 4, 5, 6, 7, 8].forEach((column) => {
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
      `${dailyReportCode(report.operationDate)}-${report.branchName}`.replace(
        /[^a-z0-9-]+/gi,
        "_",
      ) + ".xlsx";
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    setExportingId(null);
  }
}


