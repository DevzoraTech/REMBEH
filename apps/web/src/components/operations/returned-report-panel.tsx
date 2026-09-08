"use client";

import {
  ChevronDown,
  ChevronUp,
  FileWarning,
  Loader2,
  Minimize2,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  authHeaders,
  type OwnerReport,
} from "../../app/owner/owner-common";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import type { RembehSession } from "../../lib/auth-session";
import {
  buildDailyReportDocumentFromSnapshot,
  DailyReconciliationReport,
  type DailyReportViewTab,
} from "../reports/daily-reconciliation-report";
import { exportOwnedReport } from "../reports/report-export";

export type ReturnedReportSummary = {
  id: string;
  reportNumber: string;
  operationDate: string;
  status: string;
  returnNotes?: string | null;
  returnedAt?: string | null;
};

type CorrectionRow = {
  id: string;
  status: string;
  operationDate: string | null;
  correctionAppliedAt: string | null;
  ownerAuthorizedAt: string | null;
};

function formatReturnedDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

async function fetchPendingCorrectionBlockers(
  session: RembehSession,
  operationDate: string,
): Promise<boolean> {
  const headers = authHeaders(session);
  const statuses = ["APPROVED", "PENDING"] as const;
  const payloads = await Promise.all(
    statuses.map(async (status) => {
      const response = await fetch(
        `${apiBaseUrl}/collections/repayment-correction-requests?status=${status}`,
        { headers },
      );
      const payload = await readApiJson<{
        requests?: CorrectionRow[];
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      return payload.requests ?? [];
    }),
  );

  return payloads.flat().some((request) => {
    if (request.operationDate !== operationDate) return false;
    if (request.correctionAppliedAt) return false;
    if (request.status === "APPROVED") return true;
    return Boolean(request.ownerAuthorizedAt);
  });
}

export function ReturnedReportPanel({
  session,
  reports,
  expandedReportId,
  onExpand,
  onMinimize,
  onBackToToday,
  canReviewReport,
  currency,
  organizationName,
  branchLocation,
  onResubmitted,
}: {
  session: RembehSession;
  reports: ReturnedReportSummary[];
  expandedReportId: string | null;
  onExpand: (reportId: string) => void;
  onMinimize: () => void;
  onBackToToday?: () => void;
  canReviewReport: boolean;
  currency: string;
  organizationName?: string | null;
  branchLocation?: string | null;
  onResubmitted?: () => void;
}) {
  const [detail, setDetail] = useState<OwnerReport | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [tab, setTab] = useState<DailyReportViewTab>("summary");
  const [comment, setComment] = useState("");
  const [acting, setActing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [correctionsBlocking, setCorrectionsBlocking] = useState(false);
  const [checkingCorrections, setCheckingCorrections] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const loadDetail = useCallback(
    async (reportId: string) => {
      setLoadingDetail(true);
      setDetailError(null);
      setActionNotice(null);
      try {
        const response = await fetch(
          `${apiBaseUrl}/operations/reports/${reportId}`,
          { headers: authHeaders(session) },
        );
        const payload = await readApiJson<{
          report?: OwnerReport;
          message?: string | string[];
        }>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        if (!payload.report) {
          throw new Error("Returned report was not found.");
        }
        setDetail(payload.report);
        setComment("");
        setTab("summary");

        setCheckingCorrections(true);
        try {
          const blocking = await fetchPendingCorrectionBlockers(
            session,
            payload.report.operationDate,
          );
          setCorrectionsBlocking(blocking);
        } catch {
          setCorrectionsBlocking(false);
        } finally {
          setCheckingCorrections(false);
        }
      } catch (caught) {
        setDetail(null);
        setDetailError(
          caught instanceof Error
            ? caught.message
            : "Could not load returned report.",
        );
      } finally {
        setLoadingDetail(false);
      }
    },
    [session],
  );

  useEffect(() => {
    if (!expandedReportId) {
      setDetail(null);
      setDetailError(null);
      setCorrectionsBlocking(false);
      return;
    }
    void loadDetail(expandedReportId);
  }, [expandedReportId, loadDetail]);

  async function confirmReturnedReport() {
    if (!detail || acting || correctionsBlocking) return;
    setActing(true);
    setDetailError(null);
    setActionNotice(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/operations/reports/${detail.id}/manager-confirm`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            notes: comment.trim() || undefined,
          }),
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setActionNotice("Returned report resubmitted to owner.");
      onMinimize();
      onResubmitted?.();
    } catch (caught) {
      setDetailError(
        caught instanceof Error
          ? caught.message
          : "Could not resubmit returned report.",
      );
    } finally {
      setActing(false);
    }
  }

  async function exportReport(format: "excel" | "pdf") {
    if (!detail || exporting) return;
    setExporting(true);
    setDetailError(null);
    try {
      await exportOwnedReport(detail, currency, format, {
        organizationName,
        branchLocation,
      });
      setActionNotice(
        format === "pdf" ? "PDF downloaded." : "Excel report downloaded.",
      );
    } catch (caught) {
      setDetailError(
        caught instanceof Error ? caught.message : "Could not export report.",
      );
    } finally {
      setExporting(false);
    }
  }

  if (reports.length === 0) return null;

  const expandedSummary =
    reports.find((report) => report.id === expandedReportId) ?? null;
  const document =
    detail &&
    buildDailyReportDocumentFromSnapshot(
      {
        ...detail,
        status: detail.status as
          | "MANAGER_REVIEW"
          | "SENT_TO_OWNER"
          | "OWNER_APPROVED"
          | "RETURNED_TO_MANAGER",
      },
      currency,
      {
        managerNotes: detail.managerNotes,
        ownerNotes: detail.ownerNotes,
        returnedAt: detail.returnedAt,
        returnedByName: detail.returnedByName,
        returnNotes: detail.returnNotes,
        organizationName,
        branchLocation,
      },
    );

  return (
    <div className="space-y-2.5">
      {reports.map((report) => {
        const expanded = report.id === expandedReportId;
        const dateLabel = formatReturnedDate(report.operationDate);
        return (
          <section
            key={report.id}
            className="overflow-hidden rounded-[14px] border border-amber-200/90 bg-[#fffaf3] shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
              <button
                type="button"
                onClick={() =>
                  expanded ? onMinimize() : onExpand(report.id)
                }
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-amber-700 shadow-[0_4px_12px_rgba(15,23,42,0.05)]">
                  <FileWarning className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-amber-800">
                    Returned report
                  </span>
                  <span className="mt-0.5 block truncate text-sm font-bold text-[#0b1220]">
                    {dateLabel}
                    <span className="font-semibold text-slate-500">
                      {" "}
                      · {expanded ? "open below" : "tap to view"}
                    </span>
                  </span>
                </span>
              </button>
              <div className="flex flex-wrap items-center gap-1.5">
                {onBackToToday ? (
                  <button
                    type="button"
                    onClick={onBackToToday}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e6ebf0] bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition hover:bg-white"
                  >
                    <RotateCcw className="size-3" />
                    Back to today
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    expanded ? onMinimize() : onExpand(report.id)
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 text-[11px] font-semibold text-amber-900 transition hover:bg-amber-50"
                >
                  {expanded ? (
                    <>
                      <Minimize2 className="size-3" />
                      Minimize
                    </>
                  ) : (
                    <>
                      <ChevronDown className="size-3" />
                      View
                    </>
                  )}
                </button>
              </div>
            </div>

            {expanded ? (
              <div className="border-t border-amber-200/80 bg-white px-3.5 py-3">
                {actionNotice ? (
                  <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-[var(--forest-emerald)]">
                    {actionNotice}
                  </p>
                ) : null}
                {detailError ? (
                  <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    {detailError}
                  </p>
                ) : null}
                {correctionsBlocking ? (
                  <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                    Apply payment corrections first, then re-check this report
                    before resubmitting.
                  </p>
                ) : null}
                {loadingDetail || !document ? (
                  <div className="flex items-center gap-2 py-8 text-sm font-medium text-slate-500">
                    <Loader2 className="size-4 animate-spin" />
                    Loading returned report…
                  </div>
                ) : (
                  <DailyReconciliationReport
                    document={document}
                    mode={canReviewReport ? "manager" : "readonly"}
                    tab={tab}
                    onTabChange={setTab}
                    comment={comment}
                    onCommentChange={setComment}
                    acting={acting || checkingCorrections}
                    exporting={exporting}
                    onExportExcel={() => void exportReport("excel")}
                    onExportPdf={() => void exportReport("pdf")}
                    primaryDisabled={correctionsBlocking}
                    primaryDisabledReason="Apply payment corrections first"
                    onPrimaryAction={
                      canReviewReport &&
                      detail?.status === "RETURNED_TO_MANAGER"
                        ? () => void confirmReturnedReport()
                        : undefined
                    }
                  />
                )}
                {expandedSummary?.returnNotes ? (
                  <p className="mt-3 text-xs font-medium leading-5 text-slate-500">
                    Return note: {expandedSummary.returnNotes}
                  </p>
                ) : null}
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={onMinimize}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 text-xs font-semibold text-slate-700 transition hover:bg-white"
                  >
                    <ChevronUp className="size-3.5" />
                    Minimize report
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
