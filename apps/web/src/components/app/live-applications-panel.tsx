"use client";

import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  connectRealtime,
  type LoanApplicationEvent,
} from "../../lib/realtime";

type ApplicationRow = {
  id: string;
  clientName: string;
  phone: string;
  amountRequested: number;
  interestRatePercent: number;
  registeredAt: string;
  synced: boolean;
  status: string;
};

type LiveApplicationsPanelProps = {
  accessToken: string;
  tokenType?: string;
  canRead: boolean;
};

export function LiveApplicationsPanel({
  accessToken,
  tokenType = "Bearer",
  canRead,
}: LiveApplicationsPanelProps) {
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    let socket: Socket | null = null;
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`${apiBaseUrl}/loan-applications`, {
          headers: {
            Authorization: `${tokenType} ${accessToken}`,
          },
        });
        const payload = await readApiJson<{
          applications?: ApplicationRow[];
          message?: string | string[];
        }>(response);

        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }

        if (!cancelled) {
          setApplications(
            (payload.applications ?? []).filter(
              (item) => item.status === "SUBMITTED",
            ),
          );
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load applications.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    socket = connectRealtime(accessToken);
    const onEvent = (event: LoanApplicationEvent) => {
      if (event.status && event.status !== "SUBMITTED") return;

      setApplications((current) => {
        const next: ApplicationRow = {
          id: event.applicationId,
          clientName: event.clientName,
          phone: event.phone,
          amountRequested: event.amountRequested ?? 0,
          interestRatePercent: event.interestRatePercent ?? 0,
          registeredAt: event.registeredAt,
          synced: event.synced,
          status: event.status || "SUBMITTED",
        };
        const without = current.filter((item) => item.id !== next.id);
        return [next, ...without];
      });
    };

    socket.on("loan_application.submitted", onEvent);
    socket.on("loan_application.updated", onEvent);

    return () => {
      cancelled = true;
      socket?.off("loan_application.submitted", onEvent);
      socket?.off("loan_application.updated", onEvent);
      socket?.disconnect();
    };
  }, [accessToken, canRead, tokenType]);

  if (!canRead) return null;

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
        <div>
          <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
            Loan applications
          </h2>
          <p className="text-[11px] text-slate-500">Live from field agents</p>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--forest-emerald)]">
          Live
        </span>
      </div>

      {loading ? (
        <p className="px-3 py-4 text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="px-3 py-4 text-sm text-red-600">{error}</p>
      ) : applications.length === 0 ? (
        <p className="px-3 py-4 text-sm text-slate-500">
          No submitted applications yet.
        </p>
      ) : (
        applications.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2.5 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--midnight-navy)]">
                {item.clientName || "Applicant"}
              </p>
              <p className="truncate text-xs text-slate-500">
                {item.phone} · {item.interestRatePercent}% ·{" "}
                {item.synced ? "Synced" : "Pending sync"}
              </p>
            </div>
            <p className="shrink-0 text-sm font-bold text-[var(--midnight-navy)]">
              {formatAmount(item.amountRequested)}
            </p>
          </div>
        ))
      )}
    </section>
  );
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-UG").format(value);
}
