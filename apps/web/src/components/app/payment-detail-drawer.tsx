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
    if (!repaymentId) {
      setDetail(null);
      setError(null);
      return;
    }

    let cancelled = false;
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

    return () => {
      cancelled = true;
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Payment
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
              <Section title="Payment">
                <Row label="Amount" value={formatAmount(detail.amount)} />
                <Row label="Method" value={methodLabel(detail.method)} />
                <Row
                  label="Paid at"
                  value={formatDateTime(detail.recordedAt)}
                />
                <Row label="Note" value={detail.note?.trim() || "—"} />
              </Section>

              <Section title="Client">
                <Row label="Name" value={detail.clientName || "—"} />
                <Row label="Phone" value={detail.phone || "—"} />
              </Section>

              <Section title="Loan">
                <Row
                  label="Loan amount"
                  value={formatAmount(detail.loanAmount)}
                />
                <Row
                  label="Total paid"
                  value={formatAmount(detail.amountPaid)}
                />
                <Row
                  label="Outstanding"
                  value={
                    detail.loanOutstanding != null
                      ? formatAmount(detail.loanOutstanding)
                      : "—"
                  }
                />
                <Row label="Status" value={detail.loanStatus || "—"} />
                <Row
                  label="Loan ID"
                  value={shortId(detail.loanId)}
                />
              </Section>

              <Section title="Field agent">
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

              <Section title="Company">
                <Row label="Workspace" value={detail.companyName || "—"} />
                <Row label="Branch" value={detail.branchName || "—"} />
                <Row label="Currency" value={detail.currency || "—"} />
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
      <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
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
  if (method === "MOBILE_MONEY") return "Mobile money";
  if (method === "BANK_TRANSFER") return "Bank";
  if (method === "CASH") return "Cash";
  return method;
}

function shortId(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}
