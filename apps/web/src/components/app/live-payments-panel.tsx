"use client";

import { useEffect, useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import { formatClock, groupByLocalDate } from "../../lib/date-groups";
import { connectRealtime, type PaymentMadeEvent } from "../../lib/realtime";
import { AgentPhoto } from "./agent-photo";
import { DateGroupHeader } from "./date-group-header";
import { PaymentDetailDrawer } from "./payment-detail-drawer";

type PaymentRow = {
  id: string;
  loanId: string;
  clientName: string;
  phone: string;
  amount: number;
  recordedAt: string;
  method: string;
  recordedByName: string;
  recordedByPublicId?: string | null;
  agentPhotoUrl?: string | null;
  note: string | null;
};

type LivePaymentsPanelProps = {
  accessToken: string;
  tokenType?: string;
  canRead: boolean;
};

export function LivePaymentsPanel({
  accessToken,
  tokenType = "Bearer",
  canRead,
}: LivePaymentsPanelProps) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    let socket: Socket | null = null;
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`${apiBaseUrl}/collections/repayments`, {
          headers: {
            Authorization: `${tokenType} ${accessToken}`,
          },
        });
        const payload = await readApiJson<{
          repayments?: PaymentRow[];
          message?: string | string[];
        }>(response);

        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }

        if (!cancelled) {
          setPayments(payload.repayments ?? []);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load payments.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    socket = connectRealtime(accessToken);
    const onPayment = (event: PaymentMadeEvent) => {
      const next: PaymentRow = {
        id: event.repaymentId,
        loanId: event.loanId,
        clientName: event.clientName,
        phone: event.phone,
        amount: event.amount,
        recordedAt: event.recordedAt,
        method: event.method ?? "CASH",
        recordedByName: event.recordedByName ?? "Agent",
        recordedByPublicId: null,
        agentPhotoUrl: event.agentPhotoUrl ?? null,
        note: event.note ?? null,
      };
      setPayments((current) => {
        const without = current.filter((item) => item.id !== next.id);
        return [next, ...without];
      });
    };

    socket.on("payment.made", onPayment);

    return () => {
      cancelled = true;
      socket?.off("payment.made", onPayment);
      socket?.disconnect();
    };
  }, [accessToken, canRead, tokenType]);

  const groups = useMemo(
    () => groupByLocalDate(payments, (item) => item.recordedAt),
    [payments],
  );

  if (!canRead) return null;

  return (
    <>
      <section id="payments" className="panel overflow-hidden scroll-mt-20">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
          <div>
            <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
              Payments
            </h2>
            <p className="text-[11px] text-slate-500">
              Field repayments · newest first by date
            </p>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--forest-emerald)]">
            Live
          </span>
        </div>

        {loading ? (
          <p className="px-3 py-4 text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="px-3 py-4 text-sm text-red-600">{error}</p>
        ) : payments.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">
            No payments recorded yet.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="relative">
              <DateGroupHeader label={group.label} count={group.items.length} />
              <ul className="divide-y divide-[var(--line)]">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-[var(--soft-mist)]"
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <AgentPhoto
                          src={item.agentPhotoUrl}
                          name={item.recordedByName}
                          publicId={item.recordedByPublicId}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--midnight-navy)]">
                            {item.clientName || "Client"}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {item.recordedByName} · {methodLabel(item.method)} ·{" "}
                            {formatClock(item.recordedAt)}
                          </p>
                        </div>
                      </div>
                      <p className="shrink-0 text-sm font-bold tabular-nums text-[var(--forest-emerald)]">
                        {formatAmount(item.amount)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <PaymentDetailDrawer
        repaymentId={selectedId}
        accessToken={accessToken}
        tokenType={tokenType}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-UG").format(value);
}

function methodLabel(method: string) {
  if (method === "MOBILE_MONEY") return "Mobile money";
  if (method === "BANK_TRANSFER") return "Bank";
  if (method === "CASH") return "Cash";
  return method;
}
