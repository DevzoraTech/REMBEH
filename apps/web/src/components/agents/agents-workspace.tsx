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
  Activity,
  Loader2,
  MoreVertical,
  RefreshCw,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AgentDetailDrawer } from "../app/agent-detail-drawer";
import { AppShell } from "../app/app-shell";
import {
  AgentStatusConfirmModal,
  type AgentStatusConfirm,
  type SuspendReason,
} from "./agent-status-confirm-modal";
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
  createdAt?: string | null;
  lastActiveAt?: string | null;
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

export function AgentsWorkspace() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [counts, setCounts] = useState<AgentsResponse["counts"] | null>(null);
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
  const [statusConfirm, setStatusConfirm] =
    useState<AgentStatusConfirm | null>(null);

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
    status: "ACTIVE" | "SUSPENDED",
    reason?: SuspendReason,
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
        body: JSON.stringify({
          status,
          ...(reason ? { reason } : {}),
        }),
      });
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      await loadAgents(session, query, selectedDate);
      setActionMenu(null);
      setStatusConfirm(null);
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
    const menuWidth = 168;
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

  const summaryStats = useMemo(() => {
    const activeToday = agents.filter(
      (agent) =>
        agent.collectionsToday > 0 ||
        agent.applicationsToday > 0 ||
        agent.amountCollectedToday > 0 ||
        agent.amountDisbursedToday > 0 ||
        isActiveToday(agent.lastActiveAt),
    ).length;
    return {
      all: counts?.total ?? agents.length,
      activeToday,
      active: counts?.active ?? agents.filter((a) => a.status === "ACTIVE").length,
      suspended:
        counts?.suspended ??
        agents.filter((a) => a.status === "SUSPENDED").length,
    };
  }, [agents, counts]);

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
              onClick={() => void loadAgents(session, query, selectedDate)}
              disabled={loading}
              aria-label="Refresh Agents"
              className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-emerald-50 disabled:opacity-60"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          }
        />
        <p className="-mt-2 text-sm font-medium text-slate-500">
          Browse branch agents, review access status, and manage who can work in
          the field.
        </p>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AgentStat
            icon={<Users className="size-4" />}
            label="All Agents"
            value={String(summaryStats.all)}
            hint="Registered At The Branch"
            tone="green"
          />
          <AgentStat
            icon={<Activity className="size-4" />}
            label="Active Today"
            value={String(summaryStats.activeToday)}
            hint="Recorded Work Today"
            tone="blue"
          />
          <AgentStat
            icon={<UserCheck className="size-4" />}
            label="Active Agents"
            value={String(summaryStats.active)}
            hint="Can Access The System"
            tone="violet"
          />
          <AgentStat
            icon={<UserX className="size-4" />}
            label="Suspended Agents"
            value={String(summaryStats.suspended)}
            hint="System Access Restricted"
            tone="gold"
          />
        </section>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        {loading && agents.length === 0 ? (
          <TableSkeleton rows={6} columns={6} />
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
              <table className="w-full min-w-[760px] table-fixed text-left text-xs">
                <thead className="bg-[#f8faf9] text-[10px] font-semibold text-slate-500">
                  <tr>
                    <th className="w-[28%] px-3 py-2.5">Agent</th>
                    <th className="w-[12%] px-3 py-2.5">Status</th>
                    <th className="w-[22%] px-3 py-2.5">Contact</th>
                    <th className="w-[14%] px-3 py-2.5">Joined</th>
                    <th className="w-[16%] px-3 py-2.5">Last Active</th>
                    <th className="w-[8%] px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f5]">
                  {pagedAgents.items.map((agent, index) => (
                    <tr
                      key={agent.id}
                      className="cursor-pointer transition hover:bg-[#fbfdfc]"
                      onClick={() => {
                        setActionMenu(null);
                        setSelectedAgentId(agent.id);
                      }}
                    >
                      <td className="px-3 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <AgentAvatar
                            name={agent.name}
                            photoUrl={agent.photoUrl}
                            toneIndex={index}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[#0b1220]">
                              {agent.name}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] font-medium tabular-nums text-slate-500">
                              {agent.publicId ?? "No Agent ID"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={agent.status} />
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-600">
                        <p className="truncate font-medium text-[#0b1220]">
                          {agent.phone || "—"}
                        </p>
                        <p className="mt-0.5 truncate text-slate-500">
                          {agent.email}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-[11px] font-medium text-[#0b1220]">
                        {formatJoinedDate(agent.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-[11px] font-medium text-[#0b1220]">
                        {formatLastActive(agent.lastActiveAt)}
                      </td>
                      <td
                        className="px-3 py-3"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex justify-end">
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
            aria-label="Close Actions"
            onClick={() => setActionMenu(null)}
          />
          <div
            role="menu"
            className="fixed z-50 w-[168px] rounded-xl border border-[#e6ebf0] bg-white p-1 text-left shadow-[0_14px_34px_rgba(15,23,42,0.16)]"
            style={{ top: actionMenu.top, left: actionMenu.left }}
          >
            <ActionMenuItem
              onClick={() => {
                setActionMenu(null);
                setSelectedAgentId(actionMenuAgent.id);
              }}
              label="View Agent"
            />
            {canManage && actionMenuAgent.status === "ACTIVE" ? (
              <ActionMenuItem
                disabled={statusBusyId === actionMenuAgent.id}
                onClick={() => {
                  setActionMenu(null);
                  setStatusConfirm({
                    action: "suspend",
                    agentId: actionMenuAgent.id,
                    agentName: actionMenuAgent.name,
                  });
                }}
                label="Suspend Agent"
                danger
              />
            ) : null}
            {canManage &&
            (actionMenuAgent.status === "SUSPENDED" ||
              actionMenuAgent.status === "INACTIVE") ? (
              <ActionMenuItem
                disabled={statusBusyId === actionMenuAgent.id}
                onClick={() => {
                  setActionMenu(null);
                  setStatusConfirm({
                    action: "activate",
                    agentId: actionMenuAgent.id,
                    agentName: actionMenuAgent.name,
                  });
                }}
                label="Activate Agent"
              />
            ) : null}
          </div>
        </>
      ) : null}
      <AgentStatusConfirmModal
        confirm={statusConfirm}
        busy={Boolean(statusBusyId)}
        onClose={() => {
          if (!statusBusyId) setStatusConfirm(null);
        }}
        onConfirm={(payload) =>
          void updateStatus(payload.agentId, payload.status, payload.reason)
        }
      />
    </AppShell>
  );
}

function AgentStat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "green" | "blue" | "violet" | "gold";
}) {
  const toneClass = {
    green: "bg-[#e9f8ef] text-[#07885f]",
    blue: "bg-[#eaf4ff] text-[#2078dc]",
    violet: "bg-[#f2eaff] text-[#8b4ee8]",
    gold: "bg-[#fff3df] text-[#f28a17]",
  }[tone];
  return (
    <article className="flex h-full min-h-[92px] items-center gap-2.5 rounded-[13px] border border-[#e6ebf0] bg-white px-3 py-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl ${toneClass}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-[#0b1220]">
          {label}
        </p>
        <p className="mt-0.5 text-xl font-bold leading-none tabular-nums text-[#0b1220]">
          {value}
        </p>
        <p className="mt-1 truncate text-[11px] font-medium text-slate-500">
          {hint}
        </p>
      </div>
    </article>
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

function AgentAvatar({
  name,
  photoUrl,
  toneIndex,
}: {
  name: string;
  photoUrl: string | null;
  toneIndex: number;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className="size-10 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-semibold ${avatarTone(toneIndex)}`}
    >
      {initials(name)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "ACTIVE";
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-semibold ${
        active
          ? "bg-emerald-50 text-[var(--forest-emerald)]"
          : "bg-red-50 text-red-700"
      }`}
    >
      {active ? "Active" : "Suspended"}
    </span>
  );
}

function formatJoinedDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatLastActive(value?: string | null) {
  if (!value) return "Never Signed In";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never Signed In";

  const dayDiff = kampalaDayDiff(date, new Date());

  if (dayDiff <= 0) {
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Kampala",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
    return `Today, ${time}`;
  }
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 30) return `${dayDiff} Days Ago`;
  return formatJoinedDate(value);
}

function isActiveToday(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return kampalaDayDiff(date, new Date()) <= 0;
}

function kampalaDayDiff(target: Date, now: Date) {
  const startOfToday = startOfDayKampala(now);
  const startOfTarget = startOfDayKampala(target);
  return Math.round(
    (startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000,
  );
}

function startOfDayKampala(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return new Date(`${byType.year}-${byType.month}-${byType.day}T00:00:00+03:00`);
}

function initials(name: string) {
  const value = name.trim();
  if (!value) return "A";
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function avatarTone(index: number) {
  const tones = [
    "bg-[#e3f7ed] text-[#087f5d]",
    "bg-[#fff2d9] text-[#c97900]",
    "bg-[#f0e4ff] text-[#7952e8]",
    "bg-[#eaf3ff] text-[#1f73f1]",
  ];
  return tones[index % tones.length];
}
