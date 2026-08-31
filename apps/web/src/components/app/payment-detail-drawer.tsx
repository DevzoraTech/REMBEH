"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Edit3, Loader2, X } from "lucide-react";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import { AgentPhoto } from "./agent-photo";
import { Money } from "./money";

type PaymentDetail = {
  id: string;
  loanId: string;
  customerId: string;
  clientName: string;
  phone: string;
  amount: number;
  amountPaid: number;
  loanAmount: number;
  recordedAt: string;
  method: string;
  note: string | null;
  recordedByName: string;
  recordedByPublicId: string | null;
  agentPhotoUrl: string | null;
  companyName: string;
  branchName: string | null;
  currency: string;
  loanOutstanding: number | null;
  loanStatus: string | null;
  isFined?: boolean;
  finesTotal?: number;
  correctionLocked?: boolean;
  canRequestCorrection?: boolean;
  pendingCorrectionRequestId?: string | null;
  approvedCorrectionRequestId?: string | null;
  officerCanEdit?: boolean;
  correctionAppliedAt?: string | null;
};

type PaymentDetailDrawerProps = {
  repaymentId: string | null;
  accessToken: string;
  tokenType?: string;
  canCorrect?: boolean;
  onClose: () => void;
  onCorrected?: () => void;
};

export function PaymentDetailDrawer({
  repaymentId,
  accessToken,
  tokenType = "Bearer",
  canCorrect = false,
  onClose,
  onCorrected,
}: PaymentDetailDrawerProps) {
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [correctionAmount, setCorrectionAmount] = useState("");
  const [correctionMethod, setCorrectionMethod] = useState("CASH");
  const [correctionPaidAt, setCorrectionPaidAt] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    const boot = window.setTimeout(() => {
      if (!repaymentId) {
        setDetail(null);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      void (async () => {
        try {
          const response = await fetch(
            `${apiBaseUrl}/collections/repayments/${repaymentId}`,
            {
              headers: {
                Authorization: `${tokenType} ${accessToken}`,
              },
            },
          );
          const payload = await readApiJson<{
            repayment?: PaymentDetail;
            message?: string | string[];
          }>(response);
          if (!response.ok) {
            throw new Error(formatApiError(payload.message));
          }
          if (!cancelled) {
            const next = payload.repayment ?? null;
            setDetail(next);
            setCorrectionOpen(false);
            setCorrectionError(null);
            setCorrectionAmount(next ? String(Math.round(next.amount)) : "");
            setCorrectionMethod(next?.method ?? "CASH");
            setCorrectionPaidAt(next ? toDateTimeInput(next.recordedAt) : "");
            setCorrectionNote(next?.note ?? "");
            setCorrectionReason("");
          }
        } catch (caught) {
          if (!cancelled) {
            setError(
              caught instanceof Error
                ? caught.message
                : "Could not load payment.",
            );
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(boot);
    };
  }, [repaymentId, accessToken, tokenType]);

  if (!repaymentId) return null;

  async function submitCorrection() {
    if (!detail || correctionSaving) return;

    const amount = Number(correctionAmount.replace(/,/g, "").trim());
    const paidAt = new Date(correctionPaidAt);
    const reason = correctionReason.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      setCorrectionError("Enter a valid repayment amount.");
      return;
    }
    if (Number.isNaN(paidAt.getTime())) {
      setCorrectionError("Choose a valid payment date and time.");
      return;
    }
    if (reason.length < 6) {
      setCorrectionError("Add a clear reason for this correction.");
      return;
    }

    setCorrectionSaving(true);
    setCorrectionError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/collections/repayments/${detail.id}/correction`,
        {
          method: "PATCH",
          headers: {
            Authorization: `${tokenType} ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: Math.round(amount),
            method: correctionMethod,
            paidAt: paidAt.toISOString(),
            note: correctionNote,
            reason,
          }),
        },
      );
      const payload = await readApiJson<{
        repayment?: PaymentDetail;
        message?: string | string[];
      }>(response);
      if (!response.ok || !payload.repayment) {
        throw new Error(formatApiError(payload.message));
      }
      setDetail(payload.repayment);
      setCorrectionOpen(false);
      setCorrectionAmount(String(Math.round(payload.repayment.amount)));
      setCorrectionMethod(payload.repayment.method);
      setCorrectionPaidAt(toDateTimeInput(payload.repayment.recordedAt));
      setCorrectionNote(payload.repayment.note ?? "");
      setCorrectionReason("");
      onCorrected?.();
    } catch (caught) {
      setCorrectionError(
        caught instanceof Error
          ? caught.message
          : "Could not save repayment correction.",
      );
    } finally {
      setCorrectionSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close detail"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col bg-[var(--soft-ivory)] shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold capitalize tracking-[0.08em] text-slate-500">
              payment
            </p>
            <h2 className="text-lg font-bold text-[var(--midnight-navy)]">
              {detail ? (
                <Money
                  value={detail.amount}
                  currency={detail.currency || "UGX"}
                />
              ) : (
                "Loading…"
              )}
            </h2>
            {detail ? (
              <p className="text-xs text-slate-500">
                {detail.clientName} · {methodLabel(detail.method)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-ghost h-9 w-9 p-0"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading detail…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : detail ? (
            <div className="space-y-5">
              <Section title="payment">
                <Row
                  label="amount"
                  value={
                    <Money
                      value={detail.amount}
                      currency={detail.currency || "UGX"}
                    />
                  }
                />
                <Row label="method" value={methodLabel(detail.method)} />
                <Row
                  label="paid at"
                  value={formatDateTime(detail.recordedAt)}
                />
                <Row label="note" value={detail.note?.trim() || "—"} />
              </Section>

              <Section title="correction">
                {detail.correctionLocked ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    This payment is locked because its daily report has already
                    been submitted.
                  </div>
                ) : canCorrect ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--forest-emerald)] bg-white px-3 text-xs font-bold text-[var(--forest-emerald)] transition hover:bg-emerald-50"
                      onClick={() => setCorrectionOpen((open) => !open)}
                    >
                      <Edit3 className="size-3.5" />
                      {correctionOpen
                        ? "Close correction form"
                        : "Correct payment"}
                    </button>
                    {correctionOpen ? (
                      <CorrectionForm
                        amount={correctionAmount}
                        method={correctionMethod}
                        paidAt={correctionPaidAt}
                        note={correctionNote}
                        reason={correctionReason}
                        saving={correctionSaving}
                        error={correctionError}
                        onAmountChange={setCorrectionAmount}
                        onMethodChange={setCorrectionMethod}
                        onPaidAtChange={setCorrectionPaidAt}
                        onNoteChange={setCorrectionNote}
                        onReasonChange={setCorrectionReason}
                        onSubmit={submitCorrection}
                      />
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-500">
                    Managers can correct open repayment records from this panel.
                  </p>
                )}
              </Section>

              <Section title="client">
                <Row label="name" value={detail.clientName || "—"} />
                <Row label="phone" value={detail.phone || "—"} />
              </Section>

              <Section title="loan">
                <Row
                  label="loan amount"
                  value={
                    <Money
                      value={detail.loanAmount}
                      currency={detail.currency || "UGX"}
                    />
                  }
                />
                <Row
                  label="total paid"
                  value={
                    <Money
                      value={detail.amountPaid}
                      currency={detail.currency || "UGX"}
                    />
                  }
                />
                <Row
                  label="outstanding"
                  value={
                    detail.loanOutstanding != null ? (
                      <Money
                        value={detail.loanOutstanding}
                        currency={detail.currency || "UGX"}
                      />
                    ) : (
                      "—"
                    )
                  }
                />
                <Row
                  label="fines total"
                  value={
                    detail.finesTotal != null && detail.finesTotal > 0 ? (
                      <Money
                        value={detail.finesTotal}
                        currency={detail.currency || "UGX"}
                      />
                    ) : (
                      "—"
                    )
                  }
                />
                <Row label="fined" value={detail.isFined ? "yes" : "no"} />
                <Row label="status" value={detail.loanStatus || "—"} />
                <Row label="loan id" value={shortId(detail.loanId)} />
              </Section>

              <Section title="field agent">
                <div className="flex items-center gap-3">
                  <AgentPhoto
                    src={detail.agentPhotoUrl}
                    name={detail.recordedByName || "Agent"}
                    publicId={detail.recordedByPublicId}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--midnight-navy)]">
                      {detail.recordedByName || "Agent"}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {detail.recordedByPublicId || "Public ID pending"}
                    </p>
                  </div>
                </div>
              </Section>

              <Section title="company">
                <Row label="account" value={detail.companyName || "—"} />
                <Row label="branch" value={detail.branchName || "—"} />
                <Row label="currency" value={detail.currency || "—"} />
              </Section>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function CorrectionForm({
  amount,
  method,
  paidAt,
  note,
  reason,
  saving,
  error,
  onAmountChange,
  onMethodChange,
  onPaidAtChange,
  onNoteChange,
  onReasonChange,
  onSubmit,
}: {
  amount: string;
  method: string;
  paidAt: string;
  note: string;
  reason: string;
  saving: boolean;
  error: string | null;
  onAmountChange: (value: string) => void;
  onMethodChange: (value: string) => void;
  onPaidAtChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-[#dfe7ef] bg-white p-3">
      <label className="block text-xs font-bold text-[var(--midnight-navy)]">
        Correct amount
        <input
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          inputMode="numeric"
          className="mt-1 h-10 w-full rounded-xl border border-[#dfe7ef] px-3 text-sm font-semibold outline-none focus:border-[var(--forest-emerald)]"
        />
      </label>
      <label className="block text-xs font-bold text-[var(--midnight-navy)]">
        Method
        <select
          value={method}
          onChange={(event) => onMethodChange(event.target.value)}
          className="mt-1 h-10 w-full rounded-xl border border-[#dfe7ef] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--forest-emerald)]"
        >
          <option value="CASH">Cash</option>
          <option value="MOBILE_MONEY">Mobile money</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label className="block text-xs font-bold text-[var(--midnight-navy)]">
        Payment date and time
        <input
          value={paidAt}
          onChange={(event) => onPaidAtChange(event.target.value)}
          type="datetime-local"
          className="mt-1 h-10 w-full rounded-xl border border-[#dfe7ef] px-3 text-sm font-semibold outline-none focus:border-[var(--forest-emerald)]"
        />
      </label>
      <label className="block text-xs font-bold text-[var(--midnight-navy)]">
        Note
        <textarea
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          className="mt-1 min-h-20 w-full rounded-xl border border-[#dfe7ef] px-3 py-2 text-sm font-medium outline-none focus:border-[var(--forest-emerald)]"
          placeholder="Optional payment note"
        />
      </label>
      <label className="block text-xs font-bold text-[var(--midnight-navy)]">
        Correction reason
        <textarea
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          className="mt-1 min-h-20 w-full rounded-xl border border-[#dfe7ef] px-3 py-2 text-sm font-medium outline-none focus:border-[var(--forest-emerald)]"
          placeholder="Why is this payment being corrected?"
        />
      </label>
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onSubmit}
        disabled={saving}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-3 text-xs font-black text-white disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="size-3.5" />
        )}
        Save correction
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold capitalize tracking-[0.08em] text-slate-500">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-slate-500 capitalize">{label}</span>
      <span className="max-w-[60%] text-right font-medium text-[var(--midnight-navy)]">
        {value}
      </span>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-UG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function methodLabel(method: string) {
  if (method === "MOBILE_MONEY") return "mobile money";
  if (method === "BANK_TRANSFER") return "bank";
  if (method === "CASH") return "cash";
  return method;
}

function shortId(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}

function toDateTimeInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
