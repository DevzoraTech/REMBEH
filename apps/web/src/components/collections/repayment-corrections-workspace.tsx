"use client";

import {
  CheckCircle2,
  Edit3,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OwnerHeader } from "../../app/owner/owner-header";
import { useOwnerBranchScope } from "../../app/owner/owner-branch-scope";
import { useOwnerLiveReload } from "../../app/owner/use-owner-live-reload";
import {
  authHeaders,
  formatDate,
  formatMoney,
  ownerFetch,
  titleCase,
} from "../../app/owner/owner-common";
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
import { AppShell } from "../app/app-shell";
import { AppBootSkeleton } from "../app/skeleton";

type CorrectionsStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type RepaymentCorrectionsMode = "owner" | "manager";

type RepaymentCorrectionRequest = {
  id: string;
  repaymentId: string;
  loanId: string;
  tenantId: string;
  branchId: string;
  borrowerName: string;
  borrowerPhone: string | null;
  amount: number;
  paidAt: string;
  method: string;
  reason: string;
  requestedAmount: number | null;
  requestedMethod: string | null;
  requestedPaidAt: string | null;
  requestedNote: string | null;
  status: CorrectionsStatus;
  officerCanEdit: boolean;
  requestedByName: string;
  reviewedByName: string | null;
  correctionAppliedByName: string | null;
  reviewerFeedback: string | null;
  reviewedAt: string | null;
  correctionAppliedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CorrectionsSession = {
  session: RembehSession | null;
  workspace: RembehWorkspace | null;
  user: RembehUser | null;
  branch: RembehBranch | null;
  role: "owner" | "manager" | null;
  ready: boolean;
};

const STATUSES: CorrectionsStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

function useCorrectionsSession(
  mode: RepaymentCorrectionsMode,
): CorrectionsSession {
  const router = useRouter();
  const [state, setState] = useState<CorrectionsSession>({
    session: null,
    workspace: null,
    user: null,
    branch: null,
    role: null,
    ready: false,
  });

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const auth = readAuthState();
      if (!auth.session || isSessionExpired(auth.session)) {
        clearAuthState();
        router.replace(
          `/login?next=${encodeURIComponent(mode === "owner" ? "/owner/collections/corrections" : "/collections/corrections")}`,
        );
        return;
      }

      const role = resolveOperatorRole(auth.session, auth.user);
      if (mode === "owner" && role !== "owner") {
        router.replace(
          role === "manager" ? "/collections/corrections" : "/dashboard",
        );
        return;
      }
      if (mode === "manager" && role !== "manager") {
        router.replace(
          role === "owner" ? "/owner/collections/corrections" : "/dashboard",
        );
        return;
      }
      if (role !== "owner" && role !== "manager") {
        router.replace("/dashboard");
        return;
      }

      setState({
        session: auth.session,
        workspace: auth.workspace,
        user: auth.user,
        branch: auth.branch,
        role,
        ready: true,
      });
    }, 0);

    return () => window.clearTimeout(boot);
  }, [mode, router]);

  return state;
}

export function RepaymentCorrectionsWorkspace({
  mode,
}: {
  mode: RepaymentCorrectionsMode;
}) {
  const state = useCorrectionsSession(mode);
  const { matchesBranch, selectedBranchId } = useOwnerBranchScope();
  const [requests, setRequests] = useState<RepaymentCorrectionRequest[]>([]);
  const [status, setStatus] = useState<CorrectionsStatus>("PENDING");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RepaymentCorrectionRequest | null>(
    null,
  );
  const currency = state.workspace?.currency ?? "UGX";
  const isManager = mode === "manager";

  const loadRequests = useCallback(async (opts?: { silent?: boolean }) => {
    if (!state.session) return;
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const payload = await ownerFetch<{
        requests?: RepaymentCorrectionRequest[];
      }>(
        state.session,
        `/collections/repayment-correction-requests?status=${status}`,
        { branchId: isManager ? (state.branch?.id ?? null) : selectedBranchId },
      );
      setRequests(payload.requests ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Correction requests could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [isManager, selectedBranchId, state.branch?.id, state.session, status]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useOwnerLiveReload(loadRequests, Boolean(state.ready && state.session));

  const filtered = useMemo(() => {
    const scoped =
      mode === "owner"
        ? requests.filter((request) => matchesBranch(request.branchId))
        : requests;
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((request) =>
      [
        request.borrowerName,
        request.borrowerPhone ?? "",
        request.requestedByName,
        request.reason,
        request.loanId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [matchesBranch, mode, requests, search]);

  const reviewRequest = async (
    request: RepaymentCorrectionRequest,
    payload: {
      status: "APPROVED" | "REJECTED";
      officerCanEdit?: boolean;
      feedback?: string;
    },
  ) => {
    if (!state.session) return;
    setBusyId(request.id);
    setError(null);
    setNotice(null);
    try {
      await apiPatch(
        state.session,
        `/collections/repayment-correction-requests/${request.id}`,
        payload,
      );
      setNotice(
        payload.status === "APPROVED"
          ? payload.officerCanEdit
            ? "Officer can now edit that repayment."
            : "Correction approved."
          : "Correction request rejected.",
      );
      await loadRequests();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Correction request could not be reviewed.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const applyManagerCorrection = async (
    request: RepaymentCorrectionRequest,
    payload: {
      amount: number;
      method: string;
      note: string;
      reason: string;
    },
  ) => {
    if (!state.session) return;
    setBusyId(request.id);
    setError(null);
    setNotice(null);
    try {
      await apiPatch(
        state.session,
        `/collections/repayments/${request.repaymentId}/correction`,
        {
          correctionRequestId: request.id,
          amount: payload.amount,
          method: payload.method,
          note: payload.note,
          reason: payload.reason,
        },
      );
      setEditing(null);
      setNotice("Repayment correction saved and the loan balance was updated.");
      await loadRequests();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Repayment correction could not be saved.",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!state.ready || !state.session) {
    return <AppBootSkeleton />;
  }

  return (
    <AppShell
      session={state.session}
      workspace={state.workspace}
      user={state.user}
      branch={isManager ? state.branch : null}
    >
      <div className="mx-auto max-w-[1400px] space-y-5 animate-rise">
        <OwnerHeader
          title="Repayment Corrections"
          showReportsButton={false}
          settingsHref={isManager ? "/settings" : "/owner/settings"}
          notificationScope={mode}
          actions={
            <button
              type="button"
              onClick={() => void loadRequests()}
              disabled={loading}
              aria-label="Refresh correction requests"
              className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#25314b] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-[#f8faf9] disabled:opacity-60"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          }
        />

        <section className="rounded-[18px] border border-[#e6ebf0] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.055)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ebf0] p-4">
            <div>
              <h2 className="text-base font-black text-[var(--midnight-navy)]">
                Correction queue
              </h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Approve field officer edits, apply manager corrections, or
                reject unsafe changes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-10 min-w-[280px] items-center gap-2 rounded-xl border border-[#dde4eb] bg-white px-3 text-sm">
                <Search className="size-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search borrower, officer, phone..."
                  className="min-w-0 flex-1 bg-transparent font-medium text-[var(--midnight-navy)] outline-none placeholder:text-slate-400"
                />
              </div>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as CorrectionsStatus)
                }
                className="h-10 rounded-xl border border-[#dde4eb] bg-white px-3 text-sm font-semibold text-[var(--midnight-navy)] outline-none"
              >
                {STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {titleCase(item)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? (
            <p className="m-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="m-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-[var(--forest-emerald)]">
              {notice}
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#edf1f4] text-left text-sm">
              <thead className="bg-[#f3f6f8] text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Borrower</th>
                  <th className="px-4 py-3">Recorded</th>
                  <th className="px-4 py-3">Requested change</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Officer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f4]">
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                      Loading correction requests...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      No {titleCase(status).toLowerCase()} correction requests.
                    </td>
                  </tr>
                ) : (
                  filtered.map((request) => (
                    <tr
                      key={request.id}
                      className="align-top hover:bg-[#fbfcfd]"
                    >
                      <td className="px-4 py-4">
                        <p className="font-bold text-[var(--midnight-navy)]">
                          {request.borrowerName}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          {request.borrowerPhone ?? "No phone"} ·{" "}
                          {request.loanId.slice(0, 8)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-black text-[var(--midnight-navy)]">
                          {formatMoney(request.amount, currency)}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          {titleCase(request.method)} ·{" "}
                          {formatDate(request.paidAt)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <CorrectionProposal
                          request={request}
                          currency={currency}
                        />
                      </td>
                      <td className="max-w-[320px] px-4 py-4 text-xs font-medium leading-5 text-slate-600">
                        {request.reason}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-[var(--midnight-navy)]">
                          {request.requestedByName}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(request.createdAt)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge request={request} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          {request.status === "PENDING" ? (
                            <>
                              <button
                                type="button"
                                disabled={busyId === request.id}
                                onClick={() => setEditing(request)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 text-xs font-bold text-[var(--midnight-navy)] hover:bg-[#f8faf9] disabled:opacity-60"
                              >
                                <Edit3 className="size-3.5" />
                                Edit now
                              </button>
                              <button
                                type="button"
                                disabled={busyId === request.id}
                                onClick={() =>
                                  void reviewRequest(request, {
                                    status: "APPROVED",
                                    officerCanEdit: true,
                                  })
                                }
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--forest-emerald)] px-3 text-xs font-bold text-white disabled:opacity-60"
                              >
                                <UserCheck className="size-3.5" />
                                Let officer edit
                              </button>
                              <button
                                type="button"
                                disabled={busyId === request.id}
                                onClick={() =>
                                  void reviewRequest(request, {
                                    status: "REJECTED",
                                    feedback: "Request rejected by manager.",
                                  })
                                }
                                className="grid size-9 place-items-center rounded-xl border border-red-200 bg-red-50 text-red-700 disabled:opacity-60"
                                aria-label="Reject correction"
                              >
                                <XCircle className="size-4" />
                              </button>
                            </>
                          ) : request.status === "APPROVED" &&
                            !request.correctionAppliedAt &&
                            !request.officerCanEdit ? (
                            <button
                              type="button"
                              disabled={busyId === request.id}
                              onClick={() => setEditing(request)}
                              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--forest-emerald)] bg-white px-3 text-xs font-bold text-[var(--forest-emerald)] disabled:opacity-60"
                            >
                              <Edit3 className="size-3.5" />
                              Apply correction
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          <div className="flex gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Payments already included in a submitted daily report are locked.
              Managers can correct open records directly; field officers need an
              approved request first.
            </p>
          </div>
        </div>
      </div>

      {editing ? (
        <ManagerCorrectionDrawer
          request={editing}
          currency={currency}
          busy={busyId === editing.id}
          onClose={() => setEditing(null)}
          onSave={(payload) => applyManagerCorrection(editing, payload)}
        />
      ) : null}
    </AppShell>
  );
}

function CorrectionProposal({
  request,
  currency,
}: {
  request: RepaymentCorrectionRequest;
  currency: string;
}) {
  const proposals = [
    request.requestedAmount != null
      ? `Amount: ${formatMoney(request.requestedAmount, currency)}`
      : null,
    request.requestedMethod
      ? `Method: ${titleCase(request.requestedMethod)}`
      : null,
    request.requestedPaidAt
      ? `Date: ${formatDate(request.requestedPaidAt)}`
      : null,
    request.requestedNote ? `Note: ${request.requestedNote}` : null,
  ].filter(Boolean);

  if (proposals.length === 0) {
    return (
      <span className="text-xs font-medium text-slate-500">
        No exact value proposed.
      </span>
    );
  }

  return (
    <div className="space-y-1">
      {proposals.map((proposal) => (
        <p
          key={proposal}
          className="text-xs font-bold text-[var(--midnight-navy)]"
        >
          {proposal}
        </p>
      ))}
    </div>
  );
}

function StatusBadge({ request }: { request: RepaymentCorrectionRequest }) {
  const applied = Boolean(request.correctionAppliedAt);
  const className = applied
    ? "bg-emerald-50 text-[var(--forest-emerald)]"
    : request.status === "PENDING"
      ? "bg-amber-50 text-amber-700"
      : request.status === "APPROVED"
        ? "bg-blue-50 text-blue-700"
        : "bg-red-50 text-red-700";
  const label = applied
    ? "Applied"
    : request.status === "APPROVED" && request.officerCanEdit
      ? "Officer edit approved"
      : titleCase(request.status);

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${className}`}
    >
      {label}
    </span>
  );
}

function ManagerCorrectionDrawer({
  request,
  currency,
  busy,
  onClose,
  onSave,
}: {
  request: RepaymentCorrectionRequest;
  currency: string;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: {
    amount: number;
    method: string;
    note: string;
    reason: string;
  }) => void;
}) {
  const [amount, setAmount] = useState(
    String(Math.round(request.requestedAmount ?? request.amount)),
  );
  const [method, setMethod] = useState(
    request.requestedMethod ?? request.method,
  );
  const [note, setNote] = useState(request.requestedNote ?? "");
  const [reason, setReason] = useState(
    request.reason.length >= 6 ? request.reason : "",
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    const parsed = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setLocalError("Enter a valid repayment amount.");
      return;
    }
    if (reason.trim().length < 6) {
      setLocalError("Add a clear reason before saving.");
      return;
    }
    setLocalError(null);
    onSave({
      amount: Math.round(parsed),
      method,
      note,
      reason,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
      <aside className="flex h-full w-full max-w-[430px] flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#e6ebf0] px-5 py-5">
          <div>
            <h2 className="text-xl font-black text-[var(--midnight-navy)]">
              Correct Repayment
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {request.borrowerName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="grid size-9 place-items-center rounded-xl border border-[#dde4eb] text-[var(--midnight-navy)]"
            aria-label="Close correction drawer"
          >
            <XCircle className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className="rounded-[14px] border border-red-100 bg-red-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.04em] text-red-700">
              Current recorded payment
            </p>
            <p className="mt-2 text-2xl font-black text-red-700">
              {formatMoney(request.amount, currency)}
            </p>
            <p className="mt-1 text-xs font-semibold text-red-700">
              {titleCase(request.method)} · {formatDate(request.paidAt)}
            </p>
          </div>

          <label className="block text-sm font-bold text-[var(--midnight-navy)]">
            Correct amount
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="numeric"
              className="mt-1 h-11 w-full rounded-xl border border-[#dde4eb] px-3 text-sm font-semibold outline-none focus:border-[var(--forest-emerald)]"
              placeholder={`${currency} amount`}
            />
          </label>

          <label className="block text-sm font-bold text-[var(--midnight-navy)]">
            Method
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-[#dde4eb] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--forest-emerald)]"
            >
              <option value="CASH">Cash</option>
              <option value="MOBILE_MONEY">Mobile money</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="OTHER">Other</option>
            </select>
          </label>

          <label className="block text-sm font-bold text-[var(--midnight-navy)]">
            Note
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 min-h-24 w-full rounded-xl border border-[#dde4eb] px-3 py-2 text-sm font-medium outline-none focus:border-[var(--forest-emerald)]"
              placeholder="Optional payment note"
            />
          </label>

          <label className="block text-sm font-bold text-[var(--midnight-navy)]">
            Reason
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 min-h-24 w-full rounded-xl border border-[#dde4eb] px-3 py-2 text-sm font-medium outline-none focus:border-[var(--forest-emerald)]"
              placeholder="Why is this repayment being corrected?"
            />
          </label>

          {localError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {localError}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-[#e6ebf0] px-5 py-4">
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-4 text-sm font-black text-white disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Save correction
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-11 w-full rounded-xl border border-[#dde4eb] bg-white px-4 text-sm font-bold text-[var(--midnight-navy)] disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </aside>
    </div>
  );
}

async function apiPatch<T>(
  session: RembehSession,
  path: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "PATCH",
    headers: {
      ...authHeaders(session),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await readApiJson<T & { message?: string | string[] }>(
    response,
  );
  if (!response.ok) {
    throw new Error(formatApiError(payload.message));
  }
  return payload;
}
