"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { AgentDetailDrawer } from "../../components/app/agent-detail-drawer";
import { AgentPhoto } from "../../components/app/agent-photo";
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

export default function AgentsPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [counts, setCounts] = useState<AgentsResponse["counts"] | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

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
    async (activeSession: RembehSession, q: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = q.trim()
          ? `${apiBaseUrl}/agents?q=${encodeURIComponent(q.trim())}`
          : `${apiBaseUrl}/agents`;
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
        setAgents(payload.agents ?? []);
        setCounts(payload.counts ?? null);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load agents.",
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

    const allowed =
      auth.session.permissions.includes("branch.staff.read") ||
      auth.session.permissions.includes("user.read") ||
      auth.session.permissions.includes("collection.read");

    if (!allowed) {
      setError("You need staff read permission to view agents.");
      setLoading(false);
      return;
    }

    void loadAgents(auth.session, query);
  }, [router, query, loadAgents]);

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
      await loadAgents(session, query);
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

  const filteredHint = useMemo(() => {
    if (!counts) return null;
    return `${counts.total} agents`;
  }, [counts]);

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
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--forest-emerald)]">
              Field team
            </p>
            <h1 className="text-xl font-bold text-[var(--midnight-navy)]">
              Agents
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage field agents, daily float, and accountability.
              {filteredHint ? ` · ${filteredHint}` : null}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost h-9 text-xs"
            onClick={() => void loadAgents(session, query)}
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
            <StatCard label="Total agents" value={String(counts.total)} />
            <StatCard
              label="Active"
              value={String(counts.active)}
              tone="good"
            />
            <StatCard
              label="Suspended"
              value={String(counts.suspended)}
              tone="bad"
            />
            <StatCard
              label="Inactive"
              value={String(counts.inactive)}
              tone="warn"
            />
          </div>
        ) : null}

        <div className="panel flex flex-wrap items-center gap-2 px-3 py-2">
          <Search className="size-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") setQuery(search);
            }}
            placeholder="Search name, phone, email, or A-… ID"
            className="min-w-[200px] flex-1 bg-transparent py-1.5 text-sm outline-none"
          />
          <button
            type="button"
            className="btn btn-ghost h-8 text-xs"
            onClick={() => setQuery(search)}
          >
            Search
          </button>
        </div>

        <p className="text-[11px] text-slate-500">
          End-of-day cash:{" "}
          <span className="font-semibold text-slate-700">
            float given − disbursed (new loans) + collected (repayments)
          </span>
          . Record float before fieldwork; reconcile on Close the day.
        </p>

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
          <div className="panel overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--soft-mist)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Assigned ID</th>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Contact</th>
                  <th className="px-3 py-2 font-semibold">Collections</th>
                  <th className="px-3 py-2 font-semibold">Applications</th>
                  <th className="px-3 py-2 font-semibold">Collected</th>
                  <th className="px-3 py-2 font-semibold">Disbursed</th>
                  {canManage ? (
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {agents.map((agent) => (
                  <tr
                    key={agent.id}
                    className="cursor-pointer hover:bg-[var(--soft-mist)]"
                    onClick={() => setSelectedAgentId(agent.id)}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <AgentPhoto
                          src={agent.photoUrl}
                          name={agent.name}
                          publicId={agent.publicId}
                          size="sm"
                        />
                        <div>
                          <p className="font-bold tabular-nums text-[var(--midnight-navy)]">
                            {agent.publicId ?? "—"}
                          </p>
                          <p
                            className={`text-[10px] font-bold uppercase ${statusTone(agent.status)}`}
                          >
                            {agent.status}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-[var(--midnight-navy)]">
                        {agent.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {[agent.roleName, agent.branchName]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      <p>{agent.phone || "—"}</p>
                      <p className="text-slate-500">{agent.email}</p>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      <p className="font-semibold">
                        {agent.collectionsToday} / {agent.collectionsLifetime}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        today / lifetime
                      </p>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      <p className="font-semibold">
                        {agent.applicationsToday} /{" "}
                        {agent.applicationsLifetime}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        today / lifetime
                      </p>
                    </td>
                    <td className="px-3 py-2.5 font-bold tabular-nums text-[var(--forest-emerald)]">
                      {formatAmount(agent.amountCollectedLifetime)}
                    </td>
                    <td className="px-3 py-2.5 font-bold tabular-nums">
                      {formatAmount(agent.amountDisbursedLifetime)}
                    </td>
                    {canManage ? (
                      <td
                        className="px-3 py-2.5"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex flex-wrap gap-1">
                          {agent.status !== "ACTIVE" ? (
                            <ActionButton
                              disabled={statusBusyId === agent.id}
                              onClick={() =>
                                void updateStatus(agent.id, "ACTIVE")
                              }
                              label="Activate"
                            />
                          ) : null}
                          {agent.status !== "INACTIVE" ? (
                            <ActionButton
                              disabled={statusBusyId === agent.id}
                              onClick={() =>
                                void updateStatus(agent.id, "INACTIVE")
                              }
                              label="Inactivate"
                            />
                          ) : null}
                          {agent.status !== "SUSPENDED" ? (
                            <ActionButton
                              disabled={statusBusyId === agent.id}
                              onClick={() =>
                                void updateStatus(agent.id, "SUSPENDED")
                              }
                              label="Suspend"
                              danger
                            />
                          ) : null}
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
        onChanged={() => void loadAgents(session, query)}
      />
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
    <div className="panel px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function ActionButton({
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
      disabled={disabled}
      onClick={onClick}
      className={`h-7 border border-[var(--line)] bg-white px-2 text-[11px] font-semibold ${
        danger ? "text-red-700" : "text-[var(--midnight-navy)]"
      } disabled:opacity-50`}
    >
      {label}
    </button>
  );
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-UG").format(value);
}

function statusTone(status: string) {
  if (status === "ACTIVE") return "text-[var(--forest-emerald)]";
  if (status === "SUSPENDED") return "text-red-700";
  if (status === "INACTIVE") return "text-amber-700";
  return "text-slate-500";
}
