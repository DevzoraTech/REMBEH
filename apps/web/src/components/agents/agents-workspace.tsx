"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  UserCheck,
  Users,
  UserX,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  useOwnerBranchScope,
  readStoredOwnerBranchId,
} from "../../app/owner/owner-branch-scope";
import { TableSearchField } from "../app/table-search-field";
import {
  FormError,
  PrimaryButton,
  SelectField,
  TextField,
} from "../auth/form-controls";
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
import { MANAGER_INVITE_ROLES, OWNER_INVITE_ROLES, resolveOperatorRole } from "../../lib/roles";
import {
  canResendStaffInvite,
  resendStaffInvitation,
} from "../../lib/staff-invitations";
import {
  StaffTransfersList,
  TransferStaffDialog,
  type StaffTransferRow,
  type TransferableStaff,
} from "../staff/transfer-staff-dialog";
import { PendingInvitesPanel } from "../staff/pending-invites-panel";

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
  const searchParams = useSearchParams();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [counts, setCounts] = useState<AgentsResponse["counts"] | null>(null);
  const [selectedDate] = useState(todayInputValue);
  const [search, setSearch] = useState("");
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
  const [transferStaff, setTransferStaff] = useState<TransferableStaff | null>(
    null,
  );
  const [transfers, setTransfers] = useState<StaffTransferRow[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [resendBusyId, setResendBusyId] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState<{
    roleName: string;
    displayName: string;
    email: string;
    branchId: string;
  }>({
    roleName: MANAGER_INVITE_ROLES[0],
    displayName: "",
    email: "",
    branchId: "",
  });
  const autoInviteHandled = useRef(false);

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
  const canInvite = Boolean(
    session?.permissions.includes("branch.staff.invite"),
  );
  const isOwner = Boolean(session?.permissions.includes("branch.create"));
  const { matchesBranch, selectedBranchName, selectedBranchId, branches: scopeBranches } =
    useOwnerBranchScope();

  const inviteRoles = isOwner
    ? [...OWNER_INVITE_ROLES, ...MANAGER_INVITE_ROLES]
    : [...MANAGER_INVITE_ROLES];
  const inviteBranchId = isOwner
    ? inviteForm.branchId || selectedBranchId || scopeBranches[0]?.id || ""
    : branch?.id ?? "";
  const pendingInvites = useMemo(
    () =>
      agents.filter((agent) => {
        if (!canResendStaffInvite(agent)) return false;
        if (!isOwner) return true;
        return matchesBranch(agent.branchId);
      }),
    [agents, isOwner, matchesBranch],
  );

  function openInvite() {
    setInviteError(null);
    setInviteNotice(null);
    setInviteForm({
      roleName: isOwner ? OWNER_INVITE_ROLES[0] : MANAGER_INVITE_ROLES[0],
      displayName: "",
      email: "",
      branchId: selectedBranchId ?? scopeBranches[0]?.id ?? "",
    });
    setInviteOpen(true);
  }

  useEffect(() => {
    if (
      autoInviteHandled.current ||
      !canInvite ||
      !session ||
      (!isOwner && !branch?.id)
    ) {
      return;
    }
    const invite = searchParams.get("invite");
    if (invite === "1" || invite === "agent" || invite === "agents") {
      autoInviteHandled.current = true;
      openInvite();
      router.replace("/agents", { scroll: false });
    }
  }, [branch?.id, canInvite, router, searchParams, session]);

  const loadAgents = useCallback(
    async (activeSession: RembehSession, date: string) => {
      const requestId = agentsRequestId.current + 1;
      agentsRequestId.current = requestId;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("date", date);
        if (activeSession.permissions.includes("branch.create")) {
          const scopedBranchId = selectedBranchId ?? readStoredOwnerBranchId();
          if (scopedBranchId) params.set("branchId", scopedBranchId);
        }
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
        if (activeSession.permissions.includes("branch.create")) {
          const transferResponse = await fetch(
            `${apiBaseUrl}/branches/staff-transfers`,
            {
              headers: {
                Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
              },
            },
          );
          const transferPayload = await readApiJson<{
            transfers?: StaffTransferRow[];
          }>(transferResponse);
          if (transferResponse.ok && requestId === agentsRequestId.current) {
            setTransfers(transferPayload.transfers ?? []);
          }
        }
      } catch (caught) {
        if (requestId !== agentsRequestId.current) return;
        setError(
          caught instanceof Error ? caught.message : "Could not load agents.",
        );
      } finally {
        if (requestId === agentsRequestId.current) setLoading(false);
      }
    },
    [selectedBranchId],
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
      if (role !== "manager" && role !== "owner") {
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

      void loadAgents(auth.session, selectedDate);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [router, selectedDate, loadAgents]);
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
      await loadAgents(session, selectedDate);
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

  async function handleInviteAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetBranchId = inviteBranchId;
    if (!session || !targetBranchId) {
      setInviteError("Select a branch for this invite.");
      return;
    }
    setInviteError(null);
    setIsInviting(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/branches/${targetBranchId}/staff-invitations`,
        {
          method: "POST",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roleName: inviteForm.roleName,
            displayName: inviteForm.displayName.trim(),
            email: inviteForm.email.trim(),
          }),
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setInviteOpen(false);
      setInviteNotice(
        `Invite sent to ${inviteForm.email.trim()}. They must accept before access is active.`,
      );
      await loadAgents(session, selectedDate);
    } catch (caught) {
      setInviteError(
        caught instanceof Error ? caught.message : "Could not send invite.",
      );
    } finally {
      setIsInviting(false);
    }
  }

  async function handleResendInvite(agent: AgentRow) {
    if (!session || !agent.branchId) {
      setInviteNotice(null);
      setError("This staff member is not assigned to a branch.");
      return;
    }
    setError(null);
    setInviteNotice(null);
    setResendBusyId(agent.id);
    try {
      await resendStaffInvitation({
        session,
        branchId: agent.branchId,
        userId: agent.id,
      });
      setInviteNotice(
        `Invite resent to ${agent.email}. Ask them to check inbox and spam.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not resend invite.",
      );
    } finally {
      setResendBusyId(null);
    }
  }

  function toggleActionMenu(
    agentId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 188;
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

  const filteredAgents = useMemo(() => {
    const scoped = isOwner
      ? agents.filter((agent) => matchesBranch(agent.branchId))
      : agents;
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    const digits = q.replace(/\D/g, "");
    return scoped.filter((agent) => {
      const haystack = [
        agent.name,
        agent.publicId ?? "",
        agent.phone ?? "",
        agent.email ?? "",
        agent.branchName ?? "",
        agent.status,
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(q)) return true;
      if (digits.length >= 3) {
        return [agent.phone ?? "", agent.publicId ?? ""].some((value) =>
          value.replace(/\D/g, "").includes(digits),
        );
      }
      return false;
    });
  }, [agents, isOwner, matchesBranch, search]);

  const summaryStats = useMemo(() => {
    const pool = isOwner ? filteredAgents : agents;
    const activeToday = pool.filter(
      (agent) =>
        agent.collectionsToday > 0 ||
        agent.applicationsToday > 0 ||
        agent.amountCollectedToday > 0 ||
        agent.amountDisbursedToday > 0 ||
        isActiveToday(agent.lastActiveAt),
    ).length;
    return {
      all: isOwner ? pool.length : (counts?.total ?? agents.length),
      activeToday,
      active: isOwner
        ? pool.filter((a) => a.status === "ACTIVE").length
        : (counts?.active ?? agents.filter((a) => a.status === "ACTIVE").length),
      suspended: isOwner
        ? pool.filter((a) => a.status === "SUSPENDED").length
        : (counts?.suspended ??
          agents.filter((a) => a.status === "SUSPENDED").length),
    };
  }, [agents, counts, filteredAgents, isOwner]);

  const actionMenuAgent = actionMenu
    ? (agents.find((agent) => agent.id === actionMenu.agentId) ?? null)
    : null;

  const pagedAgents = useMemo(
    () => paginateItems(filteredAgents, page, pageSize),
    [filteredAgents, page, pageSize],
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
          title={isOwner ? "Staff" : "Field Officers"}
          eyebrow={isOwner ? selectedBranchName : undefined}
          showReportsButton={false}
          settingsHref={isOwner ? "/owner/settings" : "/settings"}
          notificationScope={isOwner ? "owner" : "manager"}
          actions={
            <div className="flex items-center gap-2">
              {canInvite ? (
                <button
                  type="button"
                  onClick={openInvite}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#07885f] px-3.5 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(7,136,95,0.22)] transition hover:bg-[#067352]"
                >
                  <Plus className="size-3.5" />
                  {isOwner ? "Invite staff" : "Add field officer"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void loadAgents(session, selectedDate)}
                disabled={loading}
                aria-label="Refresh Officers"
                className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-emerald-50 disabled:opacity-60"
              >
                <RefreshCw
                  className={`size-4 ${loading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          }
        />
        <p className="-mt-2 text-sm font-medium text-slate-500">
          {isOwner
            ? selectedBranchId
              ? `Managers, cashiers, and field staff for ${selectedBranchName}. Transfer keeps the same login and drops the previous branch.`
              : "Managers, cashiers, and field staff across branches. Transfer keeps the same login and drops the previous branch."
            : "Browse branch field officers, review access status, and manage who can work in the field."}
        </p>

        {inviteNotice ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950">
            {inviteNotice}
          </p>
        ) : null}

        {canInvite ? (
          <PendingInvitesPanel
            items={pendingInvites.map((agent) => ({
              id: agent.id,
              name: agent.name,
              email: agent.email,
              roleName: agent.roleName || "Staff",
              branchName: agent.branchName,
            }))}
            busyId={resendBusyId}
            onResend={(item) => {
              const agent = agents.find((row) => row.id === item.id);
              if (agent) void handleResendInvite(agent);
            }}
          />
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AgentStat
            icon={<Users className="size-4" />}
            label={isOwner ? "All staff" : "All Officers"}
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
            label={isOwner ? "Active staff" : "Active Officers"}
            value={String(summaryStats.active)}
            hint="Can Access The System"
            tone="violet"
          />
          <AgentStat
            icon={<UserX className="size-4" />}
            label={isOwner ? "Suspended" : "Suspended Officers"}
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
          <TableSkeleton rows={6} columns={7} />
        ) : !canRead ? (
          <p className="rounded-[16px] border border-[#e6ebf0] bg-white px-4 py-6 text-sm text-slate-500">
            You do not have permission to view agents.
          </p>
        ) : agents.length === 0 ? (
          <div className="rounded-[16px] border border-[#e6ebf0] bg-white px-4 py-10 text-center">
            <p className="text-sm text-slate-500">
              No staff found in your scope.
            </p>
            {canInvite ? (
              <button
                type="button"
                onClick={openInvite}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#07885f] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(7,136,95,0.22)] transition hover:bg-[#067352]"
              >
                <Plus className="size-4" />
                {isOwner ? "Invite staff" : "Add field officer"}
              </button>
            ) : null}
          </div>
        ) : (
          <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f5] px-4 py-3.5">
              <h2 className="text-[15px] font-semibold text-[#0b1220]">
                {isOwner ? "Branch staff" : "Branch Officers"}
              </h2>
              <TableSearchField
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                placeholder={isOwner ? "Search staff..." : "Search Officers..."}
                title="Search by agent name, ID, phone, email or branch."
                className="ml-auto"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] table-fixed text-left text-xs">
                <thead className="border-b border-[#dfe5eb] bg-[#e8edf2] text-[10px] font-semibold text-slate-600">
                  <tr>
                    <th className="w-[22%] px-3 py-2.5">
                      {isOwner ? "Staff" : "Officer"}
                    </th>
                    <th className="w-[14%] px-3 py-2.5">Role</th>
                    <th className="w-[10%] px-3 py-2.5">Status</th>
                    <th className="w-[18%] px-3 py-2.5">Contact</th>
                    <th className="w-[12%] px-3 py-2.5">Joined</th>
                    <th className="w-[14%] px-3 py-2.5">Last Active</th>
                    <th className="w-[10%] px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f5]">
                  {pagedAgents.items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm text-slate-500"
                      >
                        No agents match this search.
                      </td>
                    </tr>
                  ) : (
                    pagedAgents.items.map((agent, index) => (
                    <tr
                      key={agent.id}
                      className="cursor-pointer transition-colors hover:bg-[#eef7f2]"
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
                              {agent.publicId ?? "No staff ID"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[11px] font-medium text-[#0b1220]">
                        {agent.roleName || "Staff"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={agent.status} />
                          {canInvite && canResendStaffInvite(agent) ? (
                            <button
                              type="button"
                              disabled={resendBusyId === agent.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleResendInvite(agent);
                              }}
                              className="text-[11px] font-semibold text-[#0b936b] hover:underline disabled:opacity-50"
                            >
                              {resendBusyId === agent.id
                                ? "Sending..."
                                : "Resend invite"}
                            </button>
                          ) : null}
                        </div>
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
                            disabled={
                              statusBusyId === agent.id ||
                              resendBusyId === agent.id
                            }
                            onClick={(event) =>
                              toggleActionMenu(agent.id, event)
                            }
                          >
                            {statusBusyId === agent.id ||
                            resendBusyId === agent.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <MoreVertical className="size-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={pagedAgents.currentPage}
              pageSize={pageSize}
              total={filteredAgents.length}
              itemLabel="officers"
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
            />
          </section>
        )}

        {isOwner ? (
          <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
            <h2 className="text-[15px] font-semibold text-[#0b1220]">
              Staff transfers
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Audit of managers and field officers moved between branches.
            </p>
            <div className="mt-3">
              <StaffTransfersList transfers={transfers.slice(0, 12)} />
            </div>
          </section>
        ) : null}
      </div>

      <AgentDetailDrawer
        agentId={selectedAgentId}
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        canManage={canManage}
        currency={workspace?.currency ?? "UGX"}
        onClose={() => setSelectedAgentId(null)}
        onChanged={() => void loadAgents(session, selectedDate)}
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
            className="fixed z-50 w-[188px] rounded-xl border border-[#e6ebf0] bg-white p-1 text-left shadow-[0_14px_34px_rgba(15,23,42,0.16)]"
            style={{ top: actionMenu.top, left: actionMenu.left }}
          >
            <ActionMenuItem
              onClick={() => {
                setActionMenu(null);
                setSelectedAgentId(actionMenuAgent.id);
              }}
              label="View Officer"
            />
            {canInvite && canResendStaffInvite(actionMenuAgent) ? (
              <ActionMenuItem
                disabled={resendBusyId === actionMenuAgent.id}
                onClick={() => {
                  setActionMenu(null);
                  void handleResendInvite(actionMenuAgent);
                }}
                label="Resend invite"
              />
            ) : null}
            {isOwner && actionMenuAgent.branchId ? (
              <ActionMenuItem
                onClick={() => {
                  setActionMenu(null);
                  setTransferStaff({
                    id: actionMenuAgent.id,
                    name: actionMenuAgent.name,
                    roleName: actionMenuAgent.roleName ?? "Field Officer",
                    branchId: actionMenuAgent.branchId ?? "",
                    branchName: actionMenuAgent.branchName,
                  });
                }}
                label="Transfer"
              />
            ) : null}
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
                label="Suspend Officer"
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
                label="Activate Officer"
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
      {session && transferStaff ? (
        <TransferStaffDialog
          session={session}
          staff={transferStaff}
          branches={scopeBranches}
          onClose={() => setTransferStaff(null)}
          onTransferred={() => {
            void loadAgents(session, selectedDate);
          }}
        />
      ) : null}

      {inviteOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0b1220]/45 px-0 sm:items-center sm:px-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close invite dialog"
            disabled={isInviting}
            onClick={() => {
              if (!isInviting) setInviteOpen(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-agent-title"
            className="relative z-10 w-full max-w-[440px] overflow-hidden rounded-t-[20px] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.28)] sm:rounded-[20px]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#edf1f5] px-5 py-4">
              <div className="min-w-0">
                <h2
                  id="invite-agent-title"
                  className="text-base font-bold tracking-[-0.02em] text-[#0b1220]"
                >
                  {isOwner ? "Invite staff" : "Add field officer"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {isOwner
                    ? "Invite a manager or other staff. They accept by email before access is active."
                    : `Invite field staff to ${branch?.name ?? "your branch"}. They accept by email before access is active.`}
                </p>
              </div>
              <button
                type="button"
                disabled={isInviting}
                onClick={() => setInviteOpen(false)}
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-[#e6ebf0] text-[#0b1220] hover:bg-slate-50 disabled:opacity-50"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <form className="space-y-3.5 px-5 py-4" onSubmit={handleInviteAgent}>
              {isOwner ? (
                selectedBranchId ? (
                  <div className="rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Branch
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#0b1220]">
                      {selectedBranchName}
                    </p>
                  </div>
                ) : (
                  <SelectField
                    label="Branch"
                    value={inviteForm.branchId}
                    onChange={(value) =>
                      setInviteForm((current) => ({
                        ...current,
                        branchId: value,
                      }))
                    }
                    options={scopeBranches.map((item) => ({
                      value: item.id,
                      label: item.name,
                    }))}
                    required
                  />
                )
              ) : null}
              <SelectField
                label="Role"
                value={inviteForm.roleName}
                onChange={(value) =>
                  setInviteForm((current) => ({ ...current, roleName: value }))
                }
                options={inviteRoles.map((role) => ({
                  value: role,
                  label: role,
                }))}
                required
              />
              <TextField
                label="Full name"
                value={inviteForm.displayName}
                onChange={(value) =>
                  setInviteForm((current) => ({
                    ...current,
                    displayName: value,
                  }))
                }
                placeholder="Person to invite"
                required
              />
              <TextField
                label="Work email"
                type="email"
                value={inviteForm.email}
                onChange={(value) =>
                  setInviteForm((current) => ({ ...current, email: value }))
                }
                placeholder="name@institution.com"
                required
              />
              <FormError error={inviteError} />
              <PrimaryButton type="submit" loading={isInviting}>
                Send invite
              </PrimaryButton>
            </form>
          </div>
        </div>
      ) : null}
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
  const normalized = status.toUpperCase();
  const pending =
    normalized === "INVITED" ||
    normalized === "INVITE_PENDING" ||
    normalized === "INVITE_EXPIRED" ||
    normalized === "PENDING_VERIFICATION";
  const active = normalized === "ACTIVE";
  const suspended = normalized === "SUSPENDED";
  const label = active
    ? "Active"
    : normalized === "INVITE_EXPIRED"
      ? "Invite expired"
      : normalized === "INVITED" || normalized === "INVITE_PENDING"
        ? "Invite pending"
        : pending
          ? "Pending"
          : suspended
            ? "Suspended"
            : "Inactive";
  const styles = active
    ? "bg-emerald-50 text-[var(--forest-emerald)]"
    : pending
      ? "bg-amber-50 text-amber-700"
      : suspended
        ? "bg-red-50 text-red-700"
        : "bg-slate-100 text-slate-600";

  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-semibold ${styles}`}
    >
      {label}
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
