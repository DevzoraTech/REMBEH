"use client";

import { useEffect, useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import { formatClock, groupByLocalDate } from "../../lib/date-groups";
import {
  connectRealtime,
  type LoanApplicationEvent,
} from "../../lib/realtime";
import { ApplicationDetailDrawer } from "./application-detail-drawer";
import { DateGroupHeader } from "./date-group-header";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;
    const boot = window.setTimeout(() => {
      if (!canRead) {
        setLoading(false);
        return;
      }

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
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(boot);
      socket?.disconnect();
    };
  }, [accessToken, canRead, tokenType]);

  const groups = useMemo(
    () => groupByLocalDate(applications, (item) => item.registeredAt),
    [applications],
  );

  if (!canRead) return null;

  return (
    <>
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
          <div>
            <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
              loan applications
            </h2>
            <p className="text-[11px] text-slate-500">
              live from field agents · grouped by date · tap for detail
            </p>
          </div>
          <span className="text-[10px] font-semibold lowercase tracking-[0.08em] text-[var(--forest-emerald)]">
            live
          </span>
        </div>

        {loading ? (
          <p className="px-3 py-4 text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="px-3 py-4 text-sm text-red-600">{error}</p>
        ) : applications.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">
            no submitted applications yet.
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
                      onClick={() => setSelectedId(item.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--soft-mist)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--midnight-navy)]">
                          {item.clientName || "applicant"}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {item.phone} · {item.interestRatePercent}% ·{" "}
                          {formatClock(item.registeredAt)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold tabular-nums text-[var(--midnight-navy)]">
                        {formatAmount(item.amountRequested)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <ApplicationDetailDrawer
        applicationId={selectedId}
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
