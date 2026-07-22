"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import { formatClock } from "../../lib/date-groups";
import { AgentPhoto } from "./agent-photo";

type AgentAccountability = {
  date: string;
  amountGiven: number;
  amountDisbursed: number;
  amountCollected: number;
  expectedCash: number;
  formula: string;
};

type AgentFloat = {
  id: string;
  agentId: string;
  floatDate: string;
  amountGiven: number;
  notes: string | null;
  recordedByName: string;
  recordedAt: string;
};

type AgentDetail = {
  id: string;
  publicId: string | null;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  roleName: string | null;
  branchId: string | null;
  branchName: string | null;
  photoUrl: string | null;
  accountability: AgentAccountability;
  float: AgentFloat | null;
  collectionsToday: number;
  collectionsLifetime: number;
  applicationsToday: number;
  applicationsLifetime: number;
  amountCollectedLifetime: number;
  amountDisbursedLifetime: number;
};

type ActivityApplication = {
  id: string;
  customerId: string | null;
  clientName: string;
  phone: string | null;
  principalAmount: number;
  status: string;
  submittedAt: string;
  loanId: string | null;
};

type ActivityCollection = {
  id: string;
  loanId: string;
  customerId: string;
  clientName: string;
  phone: string | null;
  amount: number;
  method: string;
  note: string | null;
  paidAt: string;
};

type AgentDetailDrawerProps = {
  agentId: string | null;
  accessToken: string;
  tokenType?: string;
  canManage: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

export function AgentDetailDrawer({
  agentId,
  accessToken,
  tokenType = "Bearer",
  canManage,
  onClose,
  onChanged,
}: AgentDetailDrawerProps) {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayInputValue);
  const [tab, setTab] = useState<"collections" | "applications">(
    "collections",
  );
  const [range, setRange] = useState<"today" | "week" | "all">("today");
  const [applications, setApplications] = useState<ActivityApplication[]>([]);
  const [collections, setCollections] = useState<ActivityCollection[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const authHeader = `${tokenType} ${accessToken}`;

  const loadDetail = useCallback(
    async (id: string, selectedDate: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `${apiBaseUrl}/agents/${id}?date=${encodeURIComponent(selectedDate)}`,
          { headers: { Authorization: authHeader } },
        );
        const payload = await readApiJson<{
          agent?: AgentDetail;
          message?: string | string[];
        }>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        const agent = payload.agent ?? null;
        setDetail(agent);
      } catch (caught) {
        setDetail(null);
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load agent detail.",
        );
      } finally {
        setLoading(false);
      }
    },
    [authHeader],
  );

  const loadActivity = useCallback(
    async (
      id: string,
      selectedDate: string,
      selectedRange: "today" | "week" | "all",
    ) => {
      setActivityLoading(true);
      try {
        const response = await fetch(
          `${apiBaseUrl}/agents/${id}/activity?date=${encodeURIComponent(selectedDate)}&range=${selectedRange}`,
          { headers: { Authorization: authHeader } },
        );
        const payload = await readApiJson<{
          applications?: ActivityApplication[];
          collections?: ActivityCollection[];
          message?: string | string[];
        }>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        setApplications(payload.applications ?? []);
        setCollections(payload.collections ?? []);
      } catch (caught) {
        setApplications([]);
        setCollections([]);
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load agent activity.",
        );
      } finally {
        setActivityLoading(false);
      }
    },
    [authHeader],
  );

  useEffect(() => {
    const boot = window.setTimeout(() => {
      if (!agentId) {
        setDetail(null);
        setApplications([]);
        setCollections([]);
        return;
      }
      void loadDetail(agentId, date);
      void loadActivity(agentId, date, range);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [agentId, date, range, loadDetail, loadActivity]);

  if (!agentId) return null;

  async function setStatus(status: "ACTIVE" | "INACTIVE" | "SUSPENDED") {
    if (!agentId || statusBusy) return;
    setStatusBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/agents/${agentId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        },
      );
      const payload = await readApiJson<{
        agent?: AgentDetail;
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      if (payload.agent) setDetail(payload.agent);
      onChanged?.();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update status.",
      );
    } finally {
      setStatusBusy(false);
    }
  }

  const accountability = detail?.accountability;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
        <button
          type="button"
          className="absolute inset-0"
          aria-label="Close agent panel"
          onClick={onClose}
        />
        <aside className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-[var(--line)] bg-[var(--soft-ivory)] shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <AgentPhoto
                src={detail?.photoUrl}
                name={detail?.name ?? "agent"}
                publicId={detail?.publicId}
                size="lg"
              />
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-[var(--midnight-navy)]">
                  {detail?.name ?? "agent"}
                </p>
                <p className="text-xs text-slate-500">
                  {[detail?.publicId, detail?.roleName]
                    .filter(Boolean)
                    .join(" · ") || "field agent"}
                </p>
                {detail ? (
                  <span
                    className={`mt-1 inline-block text-[10px] font-bold lowercase tracking-[0.08em] ${statusTone(detail.status)}`}
                  >
                    {detail.status.toLowerCase()}
                  </span>
                ) : null}
                <p className="mt-1 text-xs text-slate-600">
                  {detail?.phone || "no phone"}
                  <br />
                  {detail?.email}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="grid size-8 place-items-center border border-[var(--line)] bg-white"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {loading && !detail ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </div>
            ) : null}

            {error ? (
              <p className="mb-3 text-sm text-red-600">{error}</p>
            ) : null}

            <div className="panel mb-3 flex flex-wrap items-end justify-between gap-3 px-3 py-3">
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                <span>day</span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="h-9 border border-[var(--line)] bg-white px-2 text-sm"
                />
              </label>
              <div className="flex gap-1" aria-label="Activity range">
                {(["today", "week", "all"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`h-8 px-2.5 text-xs font-semibold lowercase ${
                      range === value
                        ? "bg-[var(--midnight-navy)] text-white"
                        : "border border-[var(--line)] bg-white text-slate-600"
                    }`}
                    onClick={() => setRange(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {accountability ? (
              <div className="panel mb-3 space-y-2 px-3 py-3">
                <p className="text-[10px] font-semibold lowercase tracking-[0.08em] text-slate-500">
                  float accountability · {accountability.date}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat
                    label="given"
                    value={formatAmount(accountability.amountGiven)}
                  />
                  <MiniStat
                    label="disbursed"
                    value={formatAmount(accountability.amountDisbursed)}
                  />
                  <MiniStat
                    label="collected"
                    value={formatAmount(accountability.amountCollected)}
                  />
                  <MiniStat
                    label="expected cash"
                    value={formatAmount(accountability.expectedCash)}
                    emphasize
                  />
                </div>
              </div>
            ) : null}

            {canManage ? (
              <div className="panel mb-3 space-y-2 px-3 py-3">
                <p className="text-[10px] font-semibold lowercase tracking-[0.08em] text-slate-500">
                  status controls
                </p>
                {detail?.float ? (
                  <p className="text-[11px] text-slate-500">
                    float recorded by {detail.float.recordedByName} ·{" "}
                    {formatClock(detail.float.recordedAt)}
                  </p>
                ) : null}
                {detail ? (
                  <div className="flex flex-wrap gap-2">
                    {detail.status !== "ACTIVE" ? (
                      <button
                        type="button"
                        className="btn btn-ghost h-8 text-xs"
                        disabled={statusBusy}
                        onClick={() => void setStatus("ACTIVE")}
                      >
                        activate
                      </button>
                    ) : null}
                    {detail.status !== "INACTIVE" ? (
                      <button
                        type="button"
                        className="btn btn-ghost h-8 text-xs"
                        disabled={statusBusy}
                        onClick={() => void setStatus("INACTIVE")}
                      >
                        inactivate
                      </button>
                    ) : null}
                    {detail.status !== "SUSPENDED" ? (
                      <button
                        type="button"
                        className="btn btn-ghost h-8 text-xs text-red-700"
                        disabled={statusBusy}
                        onClick={() => void setStatus("SUSPENDED")}
                      >
                        suspend
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mb-2 flex gap-1 border-b border-[var(--line)]">
              <TabButton
                active={tab === "collections"}
                onClick={() => setTab("collections")}
                label={`collections (${collections.length})`}
              />
              <TabButton
                active={tab === "applications"}
                onClick={() => setTab("applications")}
                label={`loan applications (${applications.length})`}
              />
            </div>

            {activityLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Loading activity…
              </div>
            ) : tab === "collections" ? (
              collections.length === 0 ? (
                <p className="text-sm text-slate-500">
                  no collections in this range.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--line)] border border-[var(--line)] bg-white">
                  {collections.map((row) => (
                    <li
                      key={row.id}
                      className="hover:bg-[var(--soft-mist)]"
                    >
                      <Link
                        href={`/clients/${row.customerId}`}
                        className="flex items-center justify-between gap-2 px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--midnight-navy)]">
                            {row.clientName}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {formatClock(row.paidAt)} ·{" "}
                            {methodLabel(row.method)}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-bold tabular-nums text-[var(--forest-emerald)]">
                          {formatAmount(row.amount)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            ) : applications.length === 0 ? (
              <p className="text-sm text-slate-500">
                no loan applications in this range.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line)] border border-[var(--line)] bg-white">
                {applications.map((app) => (
                  <li key={app.id}>
                    {app.customerId ? (
                    <Link
                      href={`/clients/${app.customerId}`}
                      className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-[var(--soft-mist)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--midnight-navy)]">
                          {app.clientName}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {formatClock(app.submittedAt)} · {app.status}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold tabular-nums">
                        {formatAmount(app.principalAmount)}
                      </p>
                    </Link>
                    ) : (
                      <div className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--midnight-navy)]">
                            {app.clientName}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {formatClock(app.submittedAt)} · {app.status}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-bold tabular-nums">
                          {formatAmount(app.principalAmount)}
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-xs font-bold lowercase tracking-[0.06em] ${
        active
          ? "border-b-2 border-[var(--forest-emerald)] text-[var(--midnight-navy)]"
          : "text-slate-500"
      }`}
    >
      {label.toLowerCase()}
    </button>
  );
}

function MiniStat({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] lowercase tracking-[0.06em] text-slate-500">
        {label.toLowerCase()}
      </p>
      <p
        className={`text-sm font-bold tabular-nums ${
          emphasize
            ? "text-[var(--forest-emerald)]"
            : "text-[var(--midnight-navy)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function todayInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-UG").format(value);
}

function methodLabel(method: string) {
  if (method === "MOBILE_MONEY") return "mobile money";
  if (method === "BANK_TRANSFER") return "bank";
  if (method === "CASH") return "cash";
  return method;
}

function statusTone(status: string) {
  if (status === "ACTIVE") return "text-[var(--forest-emerald)]";
  if (status === "SUSPENDED") return "text-red-700";
  if (status === "INACTIVE") return "text-amber-700";
  return "text-slate-500";
}
