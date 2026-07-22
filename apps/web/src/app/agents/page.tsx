"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Loader2, MoreVertical, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { AgentDetailDrawer } from "../../components/app/agent-detail-drawer";
import { AppShell } from "../../components/app/app-shell";
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

type AgentRow = {
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
  collectionsToday: number;
  collectionsLifetime: number;
  applicationsToday: number;
  applicationsLifetime: number;
  amountCollectedLifetime: number;
  amountDisbursedLifetime: number;
  amountCollectedToday: number;
  amountDisbursedToday: number;
  floatToday: number | null;
};

type AgentsResponse = {
  agents: AgentRow[];
  counts: {
    total: number;
    active: number;
    suspended: number;
    inactive: number;
  };
};

type ActionMenuState = {
  agentId: string;
  top: number;
  left: number;
};

type FloatFormState = {
  agentId: string;
  amount: string;
  notes: string;
};

export default function AgentsPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [counts, setCounts] = useState<AgentsResponse["counts"] | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayInputValue);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const agentsRequestId = useRef(0);
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);
  const [floatForm, setFloatForm] = useState<FloatFormState>({
    agentId: "",
    amount: "",
    notes: "",
  });
  const [savingFloat, setSavingFloat] = useState(false);

  const canRead = Boolean(
    session?.permissions.includes("branch.staff.read") ||
      session?.permissions.includes("user.read") ||
      session?.permissions.includes("collection.read"),
  );
  const canManage = Boolean(
    session?.permissions.includes("branch.staff.invite") ||
      session?.permissions.includes("user.activate") ||
      session?.permissions.includes("branch.create"),
  );

  const loadAgents = useCallback(
    async (activeSession: RembehSession, q: string, date: string) => {
      const requestId = agentsRequestId.current + 1;
      agentsRequestId.current = requestId;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("date", date);
        if (q.trim()) params.set("q", q.trim());
        const url = `${apiBaseUrl}/agents?${params.toString()}`;
        const response = await fetch(url, {
          headers: {
            Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
          },
        });
        const payload = await readApiJson<
          AgentsResponse & { message?: string | string[] }
        >(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        if (requestId !== agentsRequestId.current) return;
        const nextAgents = payload.agents ?? [];
        setAgents(nextAgents);
        setFloatForm((current) => ({
          ...current,
          agentId:
            current.agentId && nextAgents.some((agent) => agent.id === current.agentId)
              ? current.agentId
              : nextAgents[0]?.id ?? "",
        }));
        setCounts(payload.counts ?? null);
      } catch (caught) {
        if (requestId !== agentsRequestId.current) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load agents.",
        );
      } finally {
        if (requestId === agentsRequestId.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const boot = window.setTimeout(() => {
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

      const allowed =
        auth.session.permissions.includes("branch.staff.read") ||
        auth.session.permissions.includes("user.read") ||
        auth.session.permissions.includes("collection.read");

      if (!allowed) {
        setError("You do not have access to agents.");
        setLoading(false);
        return;
      }

      void loadAgents(auth.session, query, selectedDate);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [router, query, selectedDate, loadAgents]);

  useEffect(() => {
    const searchSync = window.setTimeout(() => setQuery(search), 250);
    return () => window.clearTimeout(searchSync);
  }, [search]);

  useEffect(() => {
    if (!actionMenu) return;

    function closeMenu() {
      setActionMenu(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }

    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [actionMenu]);

  async function updateStatus(
    agentId: string,
    status: "ACTIVE" | "INACTIVE" | "SUSPENDED",
  ) {
    if (!session || statusBusyId) return;
    setStatusBusyId(agentId);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/agents/${agentId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      await loadAgents(session, query, selectedDate);
      setActionMenu(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update agent status.",
      );
    } finally {
      setStatusBusyId(null);
    }
  }

  async function saveFloat() {
    if (!session || savingFloat || !floatForm.agentId) return;
    const amount = Number(floatForm.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid float amount.");
      return;
    }

    setSavingFloat(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/agents/${floatForm.agentId}/floats`,
        {
          method: "POST",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amountGiven: amount,
            date: selectedDate,
            notes: floatForm.notes.trim() || undefined,
          }),
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      await loadAgents(session, query, selectedDate);
      setFloatForm((current) => ({ ...current, notes: "" }));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not record float.",
      );
    } finally {
      setSavingFloat(false);
    }
  }

  function openFloatForAgent(agent: AgentRow) {
    setFloatForm({
      agentId: agent.id,
      amount: agent.floatToday == null ? "" : String(agent.floatToday),
      notes: "",
    });
    window.setTimeout(() => {
      document
        .getElementById("daily-float-panel")
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
  }

  function toggleActionMenu(
    agentId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 152;
    setActionMenu((current) =>
      current?.agentId === agentId
        ? null
        : {
            agentId,
            top: rect.bottom + 6,
            left: Math.max(
              8,
              Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth),
            ),
          },
    );
  }

  const floatStats = useMemo(() => {
    const given = agents.filter((agent) => agent.floatToday != null).length;
    return {
      given,
      missing: Math.max(agents.length - given, 0),
    };
  }, [agents]);

  const selectedFloatAgent = useMemo(
    () => agents.find((agent) => agent.id === floatForm.agentId) ?? null,
    [agents, floatForm.agentId],
  );
  const actionMenuAgent = actionMenu
    ? agents.find((agent) => agent.id === actionMenu.agentId) ?? null
    : null;

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
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--midnight-navy)]">
              Agents
            </h1>
            {counts ? (
              <p className="mt-1 text-sm text-slate-500">
                {counts.total} total · {counts.active} active
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-ghost h-9 text-xs"
            onClick={() => void loadAgents(session, query, selectedDate)}
            disabled={loading}
          >
            <RefreshCw
              className={`size-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        {counts ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="total agents" value={String(counts.total)} />
            <StatCard
              label="active"
              value={String(counts.active)}
              tone="good"
            />
            <StatCard
              label="suspended"
              value={String(counts.suspended)}
              tone="bad"
            />
            <StatCard
              label="inactive"
              value={String(counts.inactive)}
              tone="warn"
            />
          </div>
        ) : null}

        <div
          id="daily-float-panel"
          className="panel flex flex-wrap items-end gap-3 px-3 py-3"
        >
          <label className="grid min-w-[150px] gap-1 text-xs font-semibold text-slate-500">
            <span>float day</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="h-9 border border-[var(--line)] bg-white px-2 text-sm text-[var(--midnight-navy)]"
            />
          </label>
          <div className="grid min-w-[120px] gap-1">
            <p className="text-[10px] font-semibold lowercase tracking-[0.08em] text-slate-500">
              given
            </p>
            <p className="text-lg font-bold tabular-nums text-[var(--forest-emerald)]">
              {floatStats.given}
            </p>
          </div>
          <div className="grid min-w-[120px] gap-1">
            <p className="text-[10px] font-semibold lowercase tracking-[0.08em] text-slate-500">
              missing
            </p>
            <p className="text-lg font-bold tabular-nums text-amber-700">
              {floatStats.missing}
            </p>
          </div>

          {canManage ? (
            <div className="grid flex-1 gap-2 md:grid-cols-[minmax(180px,1fr)_140px_minmax(180px,1fr)_auto]">
              <select
                value={floatForm.agentId}
                onChange={(event) =>
                  setFloatForm((current) => ({
                    ...current,
                    agentId: event.target.value,
                  }))
                }
                className="h-9 min-w-0 border border-[var(--line)] bg-white px-2 text-sm"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                    {agent.publicId ? ` · ${agent.publicId}` : ""}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                value={floatForm.amount}
                onChange={(event) =>
                  setFloatForm((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
                placeholder="Amount"
                className="h-9 min-w-0 border border-[var(--line)] bg-white px-2 text-sm"
              />
              <input
                type="text"
                value={floatForm.notes}
                onChange={(event) =>
                  setFloatForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Notes"
                className="h-9 min-w-0 border border-[var(--line)] bg-white px-2 text-sm"
              />
              <button
                type="button"
                className="btn btn-primary h-9 px-3 text-xs"
                disabled={savingFloat || !selectedFloatAgent}
                onClick={() => void saveFloat()}
              >
                {savingFloat ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                Save float
              </button>
            </div>
          ) : null}
        </div>

        <div className="panel flex flex-wrap items-center gap-2 bg-white/90 px-3 py-2 shadow-[0_8px_22px_rgba(20,33,61,0.05)]">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search agents"
            className="min-w-[200px] flex-1 bg-transparent py-1.5 text-sm text-[var(--midnight-navy)] outline-none placeholder:text-slate-400"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {loading && agents.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading agents…
          </div>
        ) : !canRead ? (
          <p className="panel px-4 py-6 text-sm text-slate-500">
            You do not have permission to view agents.
          </p>
        ) : agents.length === 0 ? (
          <p className="panel px-4 py-6 text-sm text-slate-500">
            No agents found in your scope.
          </p>
        ) : (
          <div className="panel overflow-hidden shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
            <table className="w-full table-fixed text-left text-[11px]">
              <thead className="border-b border-[var(--line)] bg-[#e5ece8] text-[9px] lowercase tracking-[0.06em] text-slate-500">
                <tr>
                  <th className="w-[9%] px-2 py-2.5 font-semibold">
                    agent id
                  </th>
                  <th className="w-[14%] px-2 py-2.5 font-semibold">name</th>
                  <th className="w-[15%] px-2 py-2.5 font-semibold">contact</th>
                  <th className="w-[9%] px-2 py-2.5 text-right font-semibold">
                    float
                  </th>
                  <th className="w-[10%] px-2 py-2.5 text-right font-semibold">
                    expected
                  </th>
                  <th className="w-[9%] px-2 py-2.5 text-right font-semibold">
                    collections
                  </th>
                  <th className="w-[9%] px-2 py-2.5 text-right font-semibold">
                    applications
                  </th>
                  <th className="w-[10%] px-2 py-2.5 text-right font-semibold">
                    collected
                  </th>
                  <th className="w-[10%] px-2 py-2.5 text-right font-semibold">
                    disbursed
                  </th>
                  {canManage ? (
                    <th className="w-[5%] px-2 py-2.5 text-right font-semibold">
                      actions
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {agents.map((agent) => (
                  <tr
                    key={agent.id}
                    className="cursor-pointer bg-white transition odd:bg-white even:bg-[#fbfdfc] hover:bg-[var(--soft-mist)]"
                    onClick={() => {
                      setActionMenu(null);
                      setSelectedAgentId(agent.id);
                    }}
                  >
                    <td className="px-2 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-bold tabular-nums text-[var(--midnight-navy)]">
                          {agent.publicId ?? "—"}
                        </p>
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <p className="truncate font-semibold text-[var(--midnight-navy)]">
                        {agent.name}
                      </p>
                      <StatusBadge status={agent.status} />
                    </td>
                    <td className="px-2 py-2.5 text-[11px] text-slate-600">
                      <p className="truncate">{agent.phone || "—"}</p>
                      <p className="truncate text-slate-500">{agent.email}</p>
                    </td>
                    <td
                      className="px-2 py-2.5 text-right tabular-nums"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <p
                        className={`truncate font-bold ${
                          agent.floatToday == null
                            ? "text-amber-700"
                            : "text-[var(--forest-emerald)]"
                        }`}
                      >
                        {agent.floatToday == null
                          ? "Not given"
                          : formatAmount(agent.floatToday)}
                      </p>
                      {canManage ? (
                        <button
                          type="button"
                          className="mt-1 text-[10px] font-semibold text-[var(--midnight-navy)] hover:underline"
                          onClick={() => openFloatForAgent(agent)}
                        >
                          {agent.floatToday == null ? "Set" : "Edit"}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      <p className="truncate font-bold text-[var(--midnight-navy)]">
                        {formatAmount(expectedCashForAgent(agent))}
                      </p>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      <p className="font-semibold text-[var(--midnight-navy)]">
                        {agent.collectionsToday} / {agent.collectionsLifetime}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        today / total
                      </p>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      <p className="font-semibold text-[var(--midnight-navy)]">
                        {agent.applicationsToday} /{" "}
                        {agent.applicationsLifetime}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        today / total
                      </p>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      <p className="whitespace-nowrap font-bold text-[var(--forest-emerald)]">
                        today {formatAmount(agent.amountCollectedToday)}
                      </p>
                      <p className="whitespace-nowrap text-[10px] text-slate-500">
                        total {formatAmount(agent.amountCollectedLifetime)}
                      </p>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      <p className="whitespace-nowrap font-bold text-[var(--midnight-navy)]">
                        today {formatAmount(agent.amountDisbursedToday)}
                      </p>
                      <p className="whitespace-nowrap text-[10px] text-slate-500">
                        total {formatAmount(agent.amountDisbursedLifetime)}
                      </p>
                    </td>
                    {canManage ? (
                      <td
                        className="px-2 py-2.5"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex flex-col items-end">
                          <button
                            type="button"
                            className="grid size-8 place-items-center border border-[var(--line)] bg-white text-[var(--midnight-navy)] transition hover:bg-[var(--soft-mist)] disabled:opacity-50"
                            aria-label={`Open actions for ${agent.name}`}
                            aria-haspopup="menu"
                            aria-expanded={actionMenu?.agentId === agent.id}
                            disabled={statusBusyId === agent.id}
                            onClick={(event) => toggleActionMenu(agent.id, event)}
                          >
                            {statusBusyId === agent.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <MoreVertical className="size-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AgentDetailDrawer
        agentId={selectedAgentId}
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        canManage={canManage}
        onClose={() => setSelectedAgentId(null)}
        onChanged={() => void loadAgents(session, query, selectedDate)}
      />
      {actionMenu && actionMenuAgent ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close actions"
            onClick={() => setActionMenu(null)}
          />
          <div
            role="menu"
            className="fixed z-50 w-[152px] border border-[var(--line)] bg-white p-1 text-left shadow-[0_10px_24px_rgba(20,33,61,0.18)]"
            style={{ top: actionMenu.top, left: actionMenu.left }}
          >
            {actionMenuAgent.status !== "ACTIVE" ? (
              <ActionMenuItem
                disabled={statusBusyId === actionMenuAgent.id}
                onClick={() => void updateStatus(actionMenuAgent.id, "ACTIVE")}
                label="Activate"
              />
            ) : null}
            {actionMenuAgent.status !== "INACTIVE" ? (
              <ActionMenuItem
                disabled={statusBusyId === actionMenuAgent.id}
                onClick={() => void updateStatus(actionMenuAgent.id, "INACTIVE")}
                label="Inactivate"
              />
            ) : null}
            {actionMenuAgent.status !== "SUSPENDED" ? (
              <ActionMenuItem
                disabled={statusBusyId === actionMenuAgent.id}
                onClick={() =>
                  void updateStatus(actionMenuAgent.id, "SUSPENDED")
                }
                label="Suspend"
                danger
              />
            ) : null}
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "warn";
}) {
  const valueClass =
    tone === "good"
      ? "text-[var(--forest-emerald)]"
      : tone === "bad"
        ? "text-red-700"
        : tone === "warn"
          ? "text-amber-700"
          : "text-[var(--midnight-navy)]";

  return (
    <div className="panel px-3 py-3 shadow-[0_1px_0_rgba(20,33,61,0.03)]">
      <p className="text-[10px] font-semibold lowercase tracking-[0.08em] text-slate-500">
        {label.toLowerCase()}
      </p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function ActionMenuItem({
  label,
  onClick,
  disabled,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`block w-full px-2.5 py-2 text-left text-[11px] font-semibold transition hover:bg-[var(--soft-mist)] ${
        danger ? "text-red-700" : "text-[var(--midnight-navy)]"
      } disabled:opacity-50`}
    >
      {label.toLowerCase()}
    </button>
  );
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-UG").format(value);
}

function expectedCashForAgent(agent: AgentRow) {
  return (
    (agent.floatToday ?? 0) -
    agent.amountDisbursedToday +
    agent.amountCollectedToday
  );
}

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "ACTIVE"
      ? "border-emerald-200 bg-emerald-50 text-[var(--forest-emerald)]"
      : status === "SUSPENDED"
        ? "border-red-200 bg-red-50 text-red-700"
        : status === "INACTIVE"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-[var(--line)] bg-[var(--soft-mist)] text-slate-600";

  return (
    <span
      className={`mt-1 inline-flex h-5 items-center border px-1.5 text-[9px] font-bold lowercase ${className}`}
    >
      {status.toLowerCase()}
    </span>
  );
}
