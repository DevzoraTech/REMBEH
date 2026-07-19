"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { Socket } from "socket.io-client";
import { AgentPhoto } from "../../../components/app/agent-photo";
import { AppShell } from "../../../components/app/app-shell";
import { ApplicationDetailDrawer } from "../../../components/app/application-detail-drawer";
import { PaymentDetailDrawer } from "../../../components/app/payment-detail-drawer";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../lib/api";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  clearAuthState,
  isSessionExpired,
  readAuthState,
} from "../../../lib/auth-session";
import { formatClock } from "../../../lib/date-groups";
import {
  connectRealtime,
  type LoanApplicationEvent,
  type PaymentMadeEvent,
} from "../../../lib/realtime";
import { resolveOperatorRole } from "../../../lib/roles";

type DailyAgentSummary = {
  agentId: string;
  agentName: string;
  agentPublicId: string | null;
  agentPhotoUrl: string | null;
  roleName: string | null;
  branchId: string | null;
  branchName: string | null;
  applicationsCount: number;
  principalLent: number;
  paymentsCount: number;
  amountCollected: number;
  netCash: number;
};

type DailySummary = {
  date: string;
  agents: DailyAgentSummary[];
  totals: {
    applicationsCount: number;
    principalLent: number;
    paymentsCount: number;
    amountCollected: number;
    netCash: number;
  };
};

type AgentApplication = {
  id: string;
  clientName: string;
  phone: string | null;
  principalAmount: number;
  status: string;
  submittedAt: string;
  loanId: string | null;
};

type AgentPayment = {
  id: string;
  loanId: string;
  clientName: string;
  phone: string | null;
  amount: number;
  method: string;
  note: string | null;
  paidAt: string;
};

type AgentDetail = {
  date: string;
  agent: DailyAgentSummary;
  applications: AgentApplication[];
  payments: AgentPayment[];
};

function todayInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function DailyCollectionsPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [date, setDate] = useState(todayInputValue);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null,
  );
  const [selectedApplicationId, setSelectedApplicationId] = useState<
    string | null
  >(null);

  const canRead = Boolean(session?.permissions.includes("collection.read"));

  const loadSummary = useCallback(
    async (activeSession: RembehSession, selectedDate: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `${apiBaseUrl}/collections/daily-summary?date=${encodeURIComponent(selectedDate)}`,
          {
            headers: {
              Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
            },
          },
        );
        const payload = await readApiJson<{
          summary?: DailySummary;
          message?: string | string[];
        }>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        setSummary(payload.summary ?? null);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load daily summary.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const auth = readAuthState();
    if (!auth.session || isSessionExpired(auth.session)) {
      clearAuthState();
      router.replace("/login");
      return;
    }

    const role = resolveOperatorRole(auth.session, auth.user);
    if (role === "staff") {
      router.replace("/dashboard");
      return;
    }

    setSession(auth.session);
    setWorkspace(auth.workspace);
    setUser(auth.user);
    setBranch(auth.branch);

    if (!auth.session.permissions.includes("collection.read")) {
      setError("You need collection.read to view the daily close page.");
      setLoading(false);
      return;
    }

    void loadSummary(auth.session, date);
  }, [router, date, loadSummary]);

  useEffect(() => {
    if (!session || !canRead) return;

    const socket: Socket = connectRealtime(session.accessToken);
    const refresh = () => {
      void loadSummary(session, date);
      if (expandedId) {
        void loadAgentDetail(session, expandedId, date);
      }
    };
    const onPayment = (_event: PaymentMadeEvent) => refresh();
    const onApplication = (_event: LoanApplicationEvent) => refresh();

    socket.on("payment.made", onPayment);
    socket.on("loan_application.submitted", onApplication);
    socket.on("loan_application.updated", onApplication);

    return () => {
      socket.off("payment.made", onPayment);
      socket.off("loan_application.submitted", onApplication);
      socket.off("loan_application.updated", onApplication);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAgentDetail is stable enough via session/date
  }, [session, canRead, date, expandedId, loadSummary]);

  async function loadAgentDetail(
    activeSession: RembehSession,
    agentId: string,
    selectedDate: string,
  ) {
    setDetailLoading(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/collections/daily-summary/${agentId}?date=${encodeURIComponent(selectedDate)}`,
        {
          headers: {
            Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
          },
        },
      );
      const payload = await readApiJson<{
        detail?: AgentDetail;
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setDetail(payload.detail ?? null);
    } catch (caught) {
      setDetail(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load agent detail.",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function toggleAgent(agentId: string) {
    if (!session) return;
    if (expandedId === agentId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(agentId);
    await loadAgentDetail(session, agentId, date);
  }

  const totals = summary?.totals;

  const pageTitle = useMemo(() => {
    if (!summary) return "Close the day";
    return `Close the day · ${summary.date}`;
  }, [summary]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <AppShell
      session={session}
      workspace={workspace}
      user={user}
      branch={branch}
    >
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--forest-emerald)]">
              Collections
            </p>
            <h1 className="text-xl font-bold text-[var(--midnight-navy)]">
              {pageTitle}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Per-agent applications and cash collected for the selected day.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">
              Date
              <input
                type="date"
                value={date}
                onChange={(event) => {
                  setExpandedId(null);
                  setDetail(null);
                  setDate(event.target.value);
                }}
                className="ml-2 border border-[var(--line)] bg-white px-2 py-1.5 text-sm text-[var(--midnight-navy)]"
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost h-9 text-xs"
              onClick={() => void loadSummary(session, date)}
              disabled={loading}
            >
              <RefreshCw
                className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        {totals ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Applications"
              value={String(totals.applicationsCount)}
              hint={`${formatAmount(totals.principalLent)} lent`}
            />
            <StatCard
              label="Collected"
              value={formatAmount(totals.amountCollected)}
              hint={`${totals.paymentsCount} payments`}
            />
            <StatCard
              label="Principal lent"
              value={formatAmount(totals.principalLent)}
              hint="Submitted applications"
            />
            <StatCard
              label="Net cash"
              value={formatAmount(totals.netCash)}
              hint="Collected − lent"
              emphasize
            />
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : null}

        {loading && !summary ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading agents…
          </div>
        ) : summary && summary.agents.length === 0 ? (
          <p className="panel px-4 py-6 text-sm text-slate-500">
            No field agents in scope for this day.
          </p>
        ) : (
          <ul className="space-y-2">
            {summary?.agents.map((agent) => {
              const open = expandedId === agent.agentId;
              return (
                <li key={agent.agentId} className="panel overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[var(--soft-mist)]"
                    onClick={() => void toggleAgent(agent.agentId)}
                  >
                    {open ? (
                      <ChevronDown className="size-4 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-slate-400" />
                    )}
                    <AgentPhoto
                      src={agent.agentPhotoUrl}
                      name={agent.agentName}
                      publicId={agent.agentPublicId}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--midnight-navy)]">
                        {agent.agentName}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {[agent.agentPublicId, agent.roleName, agent.branchName]
                          .filter(Boolean)
                          .join(" · ") || "Field agent"}
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-xs text-slate-500">
                        {agent.applicationsCount} apps ·{" "}
                        {formatAmount(agent.principalLent)} lent
                      </p>
                      <p className="text-sm font-bold tabular-nums text-[var(--forest-emerald)]">
                        {formatAmount(agent.amountCollected)} collected
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Net {formatAmount(agent.netCash)}
                      </p>
                    </div>
                  </button>

                  <div className="grid grid-cols-3 gap-2 border-t border-[var(--line)] px-3 py-2 sm:hidden">
                    <MiniStat
                      label="Apps"
                      value={`${agent.applicationsCount}`}
                    />
                    <MiniStat
                      label="Lent"
                      value={formatAmount(agent.principalLent)}
                    />
                    <MiniStat
                      label="Collected"
                      value={formatAmount(agent.amountCollected)}
                    />
                  </div>

                  {open ? (
                    <div className="border-t border-[var(--line)] bg-white px-3 py-3">
                      {detailLoading && detail?.agent.agentId !== agent.agentId ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Loader2 className="size-4 animate-spin" />
                          Loading…
                        </div>
                      ) : detail?.agent.agentId === agent.agentId ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                              Applications ({detail.applications.length})
                            </h3>
                            {detail.applications.length === 0 ? (
                              <p className="text-sm text-slate-500">
                                None submitted this day.
                              </p>
                            ) : (
                              <ul className="divide-y divide-[var(--line)] border border-[var(--line)]">
                                {detail.applications.map((app) => (
                                  <li key={app.id}>
                                    <button
                                      type="button"
                                      className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-[var(--soft-mist)]"
                                      onClick={() =>
                                        setSelectedApplicationId(app.id)
                                      }
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-[var(--midnight-navy)]">
                                          {app.clientName}
                                        </p>
                                        <p className="text-[11px] text-slate-500">
                                          {formatClock(app.submittedAt)} ·{" "}
                                          {app.status}
                                        </p>
                                      </div>
                                      <p className="shrink-0 text-sm font-bold tabular-nums">
                                        {formatAmount(app.principalAmount)}
                                      </p>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                              Payments ({detail.payments.length})
                            </h3>
                            {detail.payments.length === 0 ? (
                              <p className="text-sm text-slate-500">
                                None collected this day.
                              </p>
                            ) : (
                              <ul className="divide-y divide-[var(--line)] border border-[var(--line)]">
                                {detail.payments.map((payment) => (
                                  <li key={payment.id}>
                                    <button
                                      type="button"
                                      className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-[var(--soft-mist)]"
                                      onClick={() =>
                                        setSelectedPaymentId(payment.id)
                                      }
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-[var(--midnight-navy)]">
                                          {payment.clientName}
                                        </p>
                                        <p className="text-[11px] text-slate-500">
                                          {formatClock(payment.paidAt)} ·{" "}
                                          {methodLabel(payment.method)}
                                        </p>
                                      </div>
                                      <p className="shrink-0 text-sm font-bold tabular-nums text-[var(--forest-emerald)]">
                                        {formatAmount(payment.amount)}
                                      </p>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <PaymentDetailDrawer
        repaymentId={selectedPaymentId}
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        onClose={() => setSelectedPaymentId(null)}
      />
      <ApplicationDetailDrawer
        applicationId={selectedApplicationId}
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        onClose={() => setSelectedApplicationId(null)}
      />
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  hint,
  emphasize = false,
}: {
  label: string;
  value: string;
  hint: string;
  emphasize?: boolean;
}) {
  return (
    <div className="panel px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-bold tabular-nums ${
          emphasize
            ? "text-[var(--forest-emerald)]"
            : "text-[var(--midnight-navy)]"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.06em] text-slate-500">
        {label}
      </p>
      <p className="text-sm font-bold tabular-nums text-[var(--midnight-navy)]">
        {value}
      </p>
    </div>
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
