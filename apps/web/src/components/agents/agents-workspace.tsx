"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  Banknote,
  Loader2,
  MoreVertical,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AgentDetailDrawer } from "../app/agent-detail-drawer";
import { AppShell } from "../app/app-shell";
import {
  DEFAULT_PAGE_SIZE,
  PaginationControls,
  paginateItems,
} from "../app/pagination";
import { AppBootSkeleton, TableSkeleton } from "../app/skeleton";
import { OwnerHeader } from "../../app/owner/owner-header";
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

type OperationSummaryResponse = {
  branch: { id: string; name: string } | null;
  operation: {
    id: string;
    status: "OPEN" | "CLOSING" | "CLOSED";
    floatSetAside: number;
    floatIssued: number;
    floatRemaining: number;
    branchCashRemaining: number;
  } | null;
  message?: string | string[];
};

type ActionMenuState = {
  agentId: string;
  top: number;
  left: number;
};

export function AgentsWorkspace() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [counts, setCounts] = useState<AgentsResponse["counts"] | null>(null);
  const [operationSummary, setOperationSummary] =
    useState<OperationSummaryResponse | null>(null);
  const [selectedDate] = useState(todayInputValue);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const agentsRequestId = useRef(0);
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);
  const operationRequestId = useRef(0);

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
        setAgents(payload.agents ?? []);
        setCounts(payload.counts ?? null);
      } catch (caught) {
        if (requestId !== agentsRequestId.current) return;
        setError(
          caught instanceof Error ? caught.message : "Could not load agents.",
        );
      } finally {
        if (requestId === agentsRequestId.current) setLoading(false);
      }
    },
    [],
  );

  const loadOperationSummary = useCallback(
    async (activeSession: RembehSession, activeDate: string) => {
      if (!activeSession.permissions.includes("operation.read")) {
        setOperationSummary(null);
        return;
      }

      const requestId = operationRequestId.current + 1;
      operationRequestId.current = requestId;
      try {
        const response = await fetch(
          `${apiBaseUrl}/operations/today?date=${encodeURIComponent(activeDate)}`,
          {
            headers: {
              Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
            },
          },
        );
        const payload = await readApiJson<OperationSummaryResponse>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        if (requestId !== operationRequestId.current) return;
        setOperationSummary(payload);
      } catch {
        if (requestId !== operationRequestId.current) return;
        setOperationSummary(null);
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
      if (role !== "manager") {
        router.replace(role === "owner" ? "/owner/overview" : "/dashboard");
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

      void Promise.all([
        loadAgents(auth.session, query, selectedDate),
        loadOperationSummary(auth.session, selectedDate),
      ]);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [router, query, selectedDate, loadAgents, loadOperationSummary]);

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
      const response = await fetch(`${apiBaseUrl}/agents/${agentId}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
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
              Math.min(
                window.innerWidth - menuWidth - 8,
                rect.right - menuWidth,
              ),
            ),
          },
    );
  }

  const floatStats = useMemo(() => {
    const withFloat = agents.filter((agent) => agent.floatToday != null);
    const amountGiven = withFloat.reduce(
      (sum, agent) => sum + (agent.floatToday ?? 0),
      0,
    );
    return {
      amountGiven,
      missing: Math.max(agents.length - withFloat.length, 0),
    };
  }, [agents]);

  const operationForSelectedDate = operationSummary?.operation ?? null;
  const floatLeftFromOperations = operationForSelectedDate?.floatRemaining ?? 0;
  const actionMenuAgent = actionMenu
    ? (agents.find((agent) => agent.id === actionMenu.agentId) ?? null)
    : null;

  const pagedAgents = useMemo(
    () => paginateItems(agents, page, pageSize),
    [agents, page, pageSize],
  );

  if (!session) {
    return <AppBootSkeleton />;
  }

  return (
    <AppShell
      session={session}
      workspace={workspace}
      user={user}
      branch={branch}
    >
      <div className="mx-auto max-w-[1400px] space-y-5 animate-rise">
        <OwnerHeader
          title="Agents"
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder="Search Agents..."
          searchTooltip="Search by agent name, ID, phone, email or branch."
          showReportsButton={false}
          settingsHref="/settings"
          notificationScope="manager"
          actions={
            <button
              type="button"
              onClick={() =>
                void Promise.all([
                  loadAgents(session, query, selectedDate),
                  loadOperationSummary(session, selectedDate),
                ])
              }
              disabled={loading}
              aria-label="Refresh agents"
              className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-emerald-50 disabled:opacity-60"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          }
        />
        <p className="-mt-2 text-sm font-medium text-slate-500">
          Manage agents, review their activity, and monitor daily performance.
        </p>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AgentsSummaryCard
            total={counts?.total ?? agents.length}
            active={counts?.active ?? 0}
            suspended={counts?.suspended ?? 0}
          />
          <AgentStat
            icon={<Wallet className="size-4" />}
            label="Float Given"
            value={`UGX ${formatAmount(floatStats.amountGiven)}`}
            hint={
              agents.length > 0 && floatStats.missing === 0
                ? "All Agents Given"
                : `${floatStats.missing} Missing`
            }
            tone="blue"
          />
          <AgentStat
            icon={<Banknote className="size-4" />}
            label="Unallocated Float"
            value={
              operationForSelectedDate
                ? `UGX ${formatAmount(floatLeftFromOperations)}`
                : "UGX 0"
            }
            hint={
              operationForSelectedDate
                ? "Available To Assign"
                : "Day Not Started"
            }
            tone="violet"
          />
        </section>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        {loading && agents.length === 0 ? (
          <TableSkeleton rows={6} columns={8} />
        ) : !canRead ? (
          <p className="rounded-[16px] border border-[#e6ebf0] bg-white px-4 py-6 text-sm text-slate-500">
            You do not have permission to view agents.
          </p>
        ) : agents.length === 0 ? (
          <p className="rounded-[16px] border border-[#e6ebf0] bg-white px-4 py-6 text-sm text-slate-500">
            No agents found in your scope.
          </p>
        ) : (
          <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
            <div className="border-b border-[#edf1f5] px-4 py-3.5">
              <h2 className="text-[15px] font-semibold text-[#0b1220]">
                Branch Agents
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] table-fixed text-left text-xs">
                <thead className="bg-[#f8faf9] text-[10px] font-semibold text-slate-500">
                  <tr>
                    <th className="w-[9%] px-3 py-2.5">Agent ID</th>
                    <th className="w-[14%] px-3 py-2.5">Name</th>
                    <th className="w-[15%] px-3 py-2.5">Contact</th>
                    <th className="w-[9%] px-3 py-2.5 text-right">Float</th>
                    <th className="w-[10%] px-3 py-2.5 text-right">Expected</th>
                    <th className="w-[9%] px-3 py-2.5 text-right">
                      Repayments
                    </th>
                    <th className="w-[9%] px-3 py-2.5 text-right">
                      Applications
                    </th>
                    <th className="w-[10%] px-3 py-2.5 text-right">Repaid</th>
                    <th className="w-[10%] px-3 py-2.5 text-right">Disbursed</th>
                    {canManage ? (
                      <th className="w-[5%] px-3 py-2.5 text-right">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f5]">
                  {pagedAgents.items.map((agent) => (
                    <tr
                      key={agent.id}
                      className="cursor-pointer transition hover:bg-[#fbfdfc]"
                      onClick={() => {
                        setActionMenu(null);
                        setSelectedAgentId(agent.id);
                      }}
                    >
                      <td className="px-3 py-3">
                        <p className="break-words font-bold tabular-nums text-[#0b1220]">
                          {agent.publicId ?? "—"}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="truncate font-semibold text-[#0b1220]">
                          {agent.name}
                        </p>
                        <StatusBadge status={agent.status} />
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-600">
                        <p className="truncate">{agent.phone || "—"}</p>
                        <p className="truncate text-slate-500">{agent.email}</p>
                      </td>
                      <td
                        className="px-3 py-3 text-right tabular-nums"
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
                            ? "Not Given"
                            : formatAmount(agent.floatToday)}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <p className="truncate font-bold text-[#0b1220]">
                          {formatAmount(expectedCashForAgent(agent))}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <p className="font-semibold text-[#0b1220]">
                          {agent.collectionsToday} /{" "}
                          {agent.collectionsLifetime}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Today / Total
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <p className="font-semibold text-[#0b1220]">
                          {agent.applicationsToday} /{" "}
                          {agent.applicationsLifetime}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Today / Total
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <p className="whitespace-nowrap font-bold text-[var(--forest-emerald)]">
                          Today {formatAmount(agent.amountCollectedToday)}
                        </p>
                        <p className="whitespace-nowrap text-[10px] text-slate-500">
                          Total {formatAmount(agent.amountCollectedLifetime)}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <p className="whitespace-nowrap font-bold text-[#0b1220]">
                          Today {formatAmount(agent.amountDisbursedToday)}
                        </p>
                        <p className="whitespace-nowrap text-[10px] text-slate-500">
                          Total {formatAmount(agent.amountDisbursedLifetime)}
                        </p>
                      </td>
                      {canManage ? (
                        <td
                          className="px-3 py-3"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="flex flex-col items-end">
                            <button
                              type="button"
                              className="grid size-8 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#0b1220] transition hover:bg-[#f8faf9] disabled:opacity-50"
                              aria-label={`Open actions for ${agent.name}`}
                              aria-haspopup="menu"
                              aria-expanded={actionMenu?.agentId === agent.id}
                              disabled={statusBusyId === agent.id}
                              onClick={(event) =>
                                toggleActionMenu(agent.id, event)
                              }
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
            <PaginationControls
              page={pagedAgents.currentPage}
              pageSize={pageSize}
              total={agents.length}
              itemLabel="agents"
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
            />
          </section>
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
            className="fixed z-50 w-[152px] rounded-xl border border-[#e6ebf0] bg-white p-1 text-left shadow-[0_14px_34px_rgba(15,23,42,0.16)]"
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
                onClick={() =>
                  void updateStatus(actionMenuAgent.id, "INACTIVE")
                }
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

function AgentsSummaryCard({
  total,
  active,
  suspended,
}: {
  total: number;
  active: number;
  suspended: number;
}) {
  return (
    <article className="flex h-full min-h-[92px] items-center gap-3 rounded-[13px] border border-[#e6ebf0] bg-white px-3 py-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e9f8ef] text-[#07885f]">
          <Users className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#0b1220]">Agents</p>
          <p className="mt-0.5 text-xl font-bold leading-none tabular-nums text-[#0b1220]">
            {total}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">Total</p>
        </div>
      </div>
      <span className="h-12 w-px shrink-0 bg-[#edf1f5]" aria-hidden />
      <div className="grid min-w-[108px] gap-1.5">
        <div className="flex items-center gap-2 rounded-lg bg-[#e9f8ef] px-2 py-1">
          <span className="size-1.5 shrink-0 rounded-full bg-[#12a066]" />
          <div className="min-w-0 leading-tight">
            <p className="text-xs font-bold tabular-nums text-[#0b1220]">
              {active}
            </p>
            <p className="text-[10px] font-medium text-slate-500">Active</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-[#fff1f0] px-2 py-1">
          <span className="size-1.5 shrink-0 rounded-full bg-[#e11d48]" />
          <div className="min-w-0 leading-tight">
            <p className="text-xs font-bold tabular-nums text-[#0b1220]">
              {suspended}
            </p>
            <p className="text-[10px] font-medium text-slate-500">Suspended</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function AgentStat({
  icon,
  label,
  value,
  hint,
  tone,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "green" | "blue" | "violet" | "gold";
  className?: string;
}) {
  const toneClass = {
    green: "bg-[#e9f8ef] text-[#07885f]",
    blue: "bg-[#eaf4ff] text-[#2078dc]",
    violet: "bg-[#f2eaff] text-[#8b4ee8]",
    gold: "bg-[#fff3df] text-[#f28a17]",
  }[tone];
  return (
    <div className={`min-w-0 ${className}`}>
      <article className="flex h-full min-h-[92px] items-center gap-2.5 rounded-[13px] border border-[#e6ebf0] bg-white px-3 py-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-xl ${toneClass}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-500">
            {label}
          </p>
          <p className="mt-0.5 break-words text-[clamp(0.78rem,0.95vw,1.05rem)] font-bold leading-tight tabular-nums text-[#0b1220]">
            {value}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
            {hint}
          </p>
        </div>
      </article>
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
      className={`block w-full rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold transition hover:bg-[#f8faf9] ${
        danger ? "text-red-700" : "text-[#0b1220]"
      } disabled:opacity-50`}
    >
      {label}
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
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const byType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const year = byType.year;
  const month = byType.month;
  const day = byType.day;
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
      className={`mt-1 inline-flex h-5 items-center rounded-md border px-1.5 text-[9px] font-bold capitalize ${className}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
