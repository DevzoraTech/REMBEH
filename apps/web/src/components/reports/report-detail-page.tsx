"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  OwnerReport,
  authHeaders,
  ownerFetch,
} from "../../app/owner/owner-common";
import { invalidateOwnerNotifications } from "../../app/owner/owner-notifications";
import {
  buildDailyReportDocumentFromSnapshot,
  DailyReconciliationReport,
  type DailyReportStatus,
  type DailyReportViewTab,
} from "./daily-reconciliation-report";
import { exportOwnedReport } from "./report-export";
import type { ReportsMode } from "./reports-workspace";

type DetailState = {
  ready: boolean;
  session: RembehSession | null;
  workspace: RembehWorkspace | null;
  user: RembehUser | null;
  branch: RembehBranch | null;
};

function useDetailSession(mode: ReportsMode) {
  const router = useRouter();
  const [state, setState] = useState<DetailState>({
    ready: false,
    session: null,
    workspace: null,
    user: null,
    branch: null,
  });

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const auth = readAuthState();
      if (!auth.session || isSessionExpired(auth.session)) {
        clearAuthState();
        router.replace("/login");
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

export function ReportDetailPage({
  mode,
  reportId,
}: {
  mode: ReportsMode;
  reportId: string;
}) {
  const state = useDetailSession(mode);
  const router = useRouter();
  const isManager = mode === "manager";
  const listHref = isManager ? "/reports" : "/owner/reports";
  const currency = state.workspace?.currency ?? "UGX";

  const [report, setReport] = useState<OwnerReport | null>(null);
  const [tab, setTab] = useState<DailyReportViewTab>("summary");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    if (!state.session) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await ownerFetch<{ report?: OwnerReport }>(
        state.session,
        `/operations/reports/${reportId}`,
      );
      if (!payload.report) {
        throw new Error("Report was not found.");
      }
      setReport(payload.report);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load report.",
      );
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [reportId, state.session]);

  useEffect(() => {
    if (state.ready && state.session) {
      void loadReport();
    }
  }, [loadReport, state.ready, state.session]);

  async function submitAction() {
    if (!state.session || !report || acting) return;
    setActing(true);
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
        body: JSON.stringify({ notes: comment.trim() || undefined }),
      });
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) throw new Error(formatApiError(payload.message));
      setComment("");
      setNotice(
        isManager
          ? report.status === "RETURNED_TO_MANAGER"
            ? "Report resubmitted to owner successfully."
            : "Report sent to owner successfully."
          : "Report approved successfully.",
      );
      invalidateOwnerNotifications();
      await loadReport();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : isManager
            ? "Could not send report to owner."
            : "Could not approve report.",
      );
    } finally {
      setActing(false);
    }
  }

  async function exportReport(format: "excel" | "pdf") {
    if (!report || exporting) return;
    setExporting(true);
    setError(null);
    try {
      await exportOwnedReport(report, currency, format);
      setNotice(
        format === "pdf"
          ? "PDF ready — use Print to save the document."
          : "Excel report downloaded.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not export report.",
      );
    } finally {
      setExporting(false);
    }
  }

  if (!state.ready || !state.session) return <AppBootSkeleton />;

  if (loading && !report) {
    return (
      <AppShell
        session={state.session}
        workspace={state.workspace}
        user={state.user}
        branch={isManager ? state.branch : null}
      >
        <div className="mx-auto max-w-[1440px] space-y-4 px-1 py-6">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-[#eef2f0]" />
          <div className="h-[420px] animate-pulse rounded-[16px] bg-[#eef2f0]" />
        </div>
      </AppShell>
    );
  }

  if (!report) {
    return (
      <AppShell
        session={state.session}
        workspace={state.workspace}
        user={state.user}
        branch={isManager ? state.branch : null}
      >
        <div className="mx-auto max-w-[1440px] space-y-4 px-1 py-6">
          <button
            type="button"
            onClick={() => router.push(listHref)}
            className="text-sm font-semibold text-slate-600 hover:text-[#0b1220]"
          >
            ← Back to Daily Reports
          </button>
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error ?? "Report was not found."}
          </p>
        </div>
      </AppShell>
    );
  }

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

  return (
    <AppShell
      session={state.session}
      workspace={state.workspace}
      user={state.user}
      branch={isManager ? state.branch : null}
    >
      <div className="mx-auto max-w-[1440px] space-y-4 animate-rise px-1 pb-8">
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
        <DailyReconciliationReport
          document={document}
          mode={isManager ? "manager" : "owner"}
          tab={tab}
          onTabChange={setTab}
          comment={comment}
          onCommentChange={setComment}
          acting={acting}
          exporting={exporting}
          showBack
          onBack={() => router.push(listHref)}
          onExportExcel={() => void exportReport("excel")}
          onExportPdf={() => void exportReport("pdf")}
          onPrimaryAction={
            (isManager &&
              (report.status === "MANAGER_REVIEW" ||
                report.status === "RETURNED_TO_MANAGER")) ||
            (!isManager && report.status === "SENT_TO_OWNER")
              ? () => void submitAction()
              : undefined
          }
        />
      </div>
    </AppShell>
  );
}
