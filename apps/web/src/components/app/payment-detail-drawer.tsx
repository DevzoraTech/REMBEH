"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import { AgentPhoto } from "./agent-photo";

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
};

type PaymentDetailDrawerProps = {
  repaymentId: string | null;
  accessToken: string;
  tokenType?: string;
  onClose: () => void;
};

export function PaymentDetailDrawer({
  repaymentId,
  accessToken,
  tokenType = "Bearer",
  onClose,
}: PaymentDetailDrawerProps) {
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            setDetail(payload.repayment ?? null);
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
            <p className="text-[10px] font-semibold lowercase tracking-[0.08em] text-slate-500">
              payment
            </p>
            <h2 className="text-lg font-bold text-[var(--midnight-navy)]">
              {detail
                ? `${formatAmount(detail.amount)} ${detail.currency || ""}`.trim()
                : "Loading…"}
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
                <Row label="amount" value={formatAmount(detail.amount)} />
                <Row label="method" value={methodLabel(detail.method)} />
                <Row
                  label="paid at"
                  value={formatDateTime(detail.recordedAt)}
                />
                <Row label="note" value={detail.note?.trim() || "—"} />
              </Section>

              <Section title="client">
                <Row label="name" value={detail.clientName || "—"} />
                <Row label="phone" value={detail.phone || "—"} />
              </Section>

              <Section title="loan">
                <Row
                  label="loan amount"
                  value={formatAmount(detail.loanAmount)}
                />
                <Row
                  label="total paid"
                  value={formatAmount(detail.amountPaid)}
                />
                <Row
                  label="outstanding"
                  value={
                    detail.loanOutstanding != null
                      ? formatAmount(detail.loanOutstanding)
                      : "—"
                  }
                />
                <Row
                  label="fines total"
                  value={
                    detail.finesTotal != null && detail.finesTotal > 0
                      ? formatAmount(detail.finesTotal)
                      : "—"
                  }
                />
                <Row
                  label="fined"
                  value={detail.isFined ? "yes" : "no"}
                />
                <Row label="status" value={detail.loanStatus || "—"} />
                <Row
                  label="loan id"
                  value={shortId(detail.loanId)}
                />
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

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold lowercase tracking-[0.08em] text-slate-500">
        {title.toLowerCase()}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-slate-500">{label.toLowerCase()}</span>
      <span className="max-w-[60%] text-right font-medium text-[var(--midnight-navy)]">
        {value}
      </span>
    </div>
  );
}

function formatAmount(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-UG").format(value);
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
