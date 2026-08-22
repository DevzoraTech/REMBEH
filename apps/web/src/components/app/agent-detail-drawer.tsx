"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Banknote,
  CheckCircle2,
  Clock3,
  Edit3,
  KeyRound,
  Laptop,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  MoreVertical,
  PauseCircle,
  Phone,
  Smartphone,
  UserPlus,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  AgentStatusConfirmModal,
  type AgentStatusConfirm,
  type SuspendReason,
} from "../agents/agent-status-confirm-modal";
import { AgentPhoto } from "./agent-photo";
import { Money } from "./money";
import { StepTimeline, type StepTone } from "./step-timeline";

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
  createdAt?: string;
  lastSignInAt?: string | null;
  lastActiveAt?: string | null;
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

type OtherActivity = {
  id: string;
  type:
    | "FLOAT_RECEIVED"
    | "RECONCILIATION_COMPLETED"
    | "ACCOUNT_SUSPENDED"
    | "ACCOUNT_ACTIVATED";
  title: string;
  detail: string;
  occurredAt: string;
};

type AgentDevice = {
  id: string;
  deviceName: string;
  deviceType: string;
  platform: string | null;
  lastUsedAt: string;
  status: "CURRENT" | "ACTIVE";
  canRemove: boolean;
};

type AccessHistoryItem = {
  id: string;
  type:
    | "ACCOUNT_CREATED"
    | "FIRST_SIGN_IN"
    | "ACCOUNT_SUSPENDED"
    | "ACCOUNT_REACTIVATED"
    | "PASSWORD_RESET"
    | "DEVICES_SIGNED_OUT";
  title: string;
  detail: string;
  occurredAt: string;
  actorName: string;
};

type AgentDetailDrawerProps = {
  agentId: string | null;
  accessToken: string;
  tokenType?: string;
  canManage: boolean;
  currency?: string;
  onClose: () => void;
  onChanged?: () => void;
};

type AgentProfileForm = {
  displayName: string;
  email: string;
  phone: string;
};

const PREVIEW_LIMIT = 5;

export function AgentDetailDrawer({
  agentId,
  accessToken,
  tokenType = "Bearer",
  canManage,
  currency = "UGX",
  onClose,
  onChanged,
}: AgentDetailDrawerProps) {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"account" | "activity">("account");
  const [applications, setApplications] = useState<ActivityApplication[]>([]);
  const [collections, setCollections] = useState<ActivityCollection[]>([]);
  const [otherActivity, setOtherActivity] = useState<OtherActivity[]>([]);
  const [devices, setDevices] = useState<AgentDevice[]>([]);
  const [accessHistory, setAccessHistory] = useState<AccessHistoryItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<AgentProfileForm>({
    displayName: "",
    email: "",
    phone: "",
  });
  const [showAllLoans, setShowAllLoans] = useState(false);
  const [showAllRepayments, setShowAllRepayments] = useState(false);
  const [showAllOther, setShowAllOther] = useState(false);
  const [statusConfirm, setStatusConfirm] =
    useState<AgentStatusConfirm | null>(null);

  const authHeader = `${tokenType} ${accessToken}`;

  const loadDetail = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${apiBaseUrl}/agents/${id}`, {
          headers: { Authorization: authHeader },
        });
        const payload = await readApiJson<{
          agent?: AgentDetail;
          message?: string | string[];
        }>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        setDetail(payload.agent ?? null);
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
    async (id: string) => {
      setActivityLoading(true);
      try {
        const response = await fetch(
          `${apiBaseUrl}/agents/${id}/activity?range=all`,
          { headers: { Authorization: authHeader } },
        );
        const payload = await readApiJson<{
          applications?: ActivityApplication[];
          collections?: ActivityCollection[];
          otherActivity?: OtherActivity[];
          message?: string | string[];
        }>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        setApplications(payload.applications ?? []);
        setCollections(payload.collections ?? []);
        setOtherActivity(payload.otherActivity ?? []);
      } catch (caught) {
        setApplications([]);
        setCollections([]);
        setOtherActivity([]);
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

  const loadAccount = useCallback(
    async (id: string) => {
      setAccountLoading(true);
      try {
        const response = await fetch(`${apiBaseUrl}/agents/${id}/account`, {
          headers: { Authorization: authHeader },
        });
        const payload = await readApiJson<{
          devices?: AgentDevice[];
          accessHistory?: AccessHistoryItem[];
          message?: string | string[];
        }>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        setDevices(payload.devices ?? []);
        setAccessHistory(payload.accessHistory ?? []);
      } catch (caught) {
        setDevices([]);
        setAccessHistory([]);
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load account details.",
        );
      } finally {
        setAccountLoading(false);
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
        setOtherActivity([]);
        setDevices([]);
        setAccessHistory([]);
        setTab("account");
        setMenuOpen(false);
        setShowAllLoans(false);
        setShowAllRepayments(false);
        setShowAllOther(false);
        setEditOpen(false);
        return;
      }
      void loadDetail(agentId);
      void loadActivity(agentId);
      void loadAccount(agentId);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [agentId, loadDetail, loadActivity, loadAccount]);

  const issuedLoans = useMemo(
    () => applications.filter((app) => Boolean(app.loanId)),
    [applications],
  );

  if (!agentId) return null;

  async function setStatus(
    status: "ACTIVE" | "SUSPENDED",
    reason?: SuspendReason,
  ) {
    if (!agentId || statusBusy) return;
    setStatusBusy(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/agents/${agentId}/status`, {
        method: "PATCH",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          ...(reason ? { reason } : {}),
        }),
      });
      const payload = await readApiJson<{
        agent?: AgentDetail;
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      if (payload.agent) setDetail(payload.agent);
      setStatusConfirm(null);
      setMenuOpen(false);
      onChanged?.();
      void loadActivity(agentId);
      void loadAccount(agentId);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update status.",
      );
    } finally {
      setStatusBusy(false);
    }
  }

  function openEditProfile() {
    if (!detail) return;
    setEditForm({
      displayName: detail.name,
      email: detail.email,
      phone: detail.phone ?? "",
    });
    setError(null);
    setMenuOpen(false);
    setEditOpen(true);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agentId || !detail || profileBusy) return;

    const displayName = editForm.displayName.trim();
    const email = editForm.email.trim();
    const phone = editForm.phone.trim();

    if (displayName.length < 2) {
      setError("Enter the agent name.");
      return;
    }

    if (!email.includes("@") || !email.includes(".")) {
      setError("Enter a valid email address.");
      return;
    }

    setProfileBusy(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/agents/${agentId}`, {
        method: "PATCH",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName,
          email,
          phone,
        }),
      });
      const payload = await readApiJson<{
        agent?: AgentDetail;
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      if (payload.agent) setDetail(payload.agent);
      setEditOpen(false);
      onChanged?.();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update profile.",
      );
    } finally {
      setProfileBusy(false);
    }
  }

  async function removeDevice(sessionId: string) {
    if (!agentId || deviceBusy) return;
    setDeviceBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/agents/${agentId}/sessions/${sessionId}`,
        {
          method: "DELETE",
          headers: { Authorization: authHeader },
        },
      );
      const payload = await readApiJson<{
        devices?: AgentDevice[];
        accessHistory?: AccessHistoryItem[];
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setDevices(payload.devices ?? []);
      setAccessHistory(payload.accessHistory ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not remove device.",
      );
    } finally {
      setDeviceBusy(false);
    }
  }

  async function signOutAllDevices() {
    if (!agentId || deviceBusy) return;
    setDeviceBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/agents/${agentId}/sessions/revoke-all`,
        {
          method: "POST",
          headers: { Authorization: authHeader },
        },
      );
      const payload = await readApiJson<{
        devices?: AgentDevice[];
        accessHistory?: AccessHistoryItem[];
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setDevices(payload.devices ?? []);
      setAccessHistory(payload.accessHistory ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not sign out devices.",
      );
    } finally {
      setDeviceBusy(false);
    }
  }

  const visibleLoans = showAllLoans
    ? issuedLoans
    : issuedLoans.slice(0, PREVIEW_LIMIT);
  const visibleRepayments = showAllRepayments
    ? collections
    : collections.slice(0, PREVIEW_LIMIT);
  const visibleOther = showAllOther
    ? otherActivity
    : otherActivity.slice(0, PREVIEW_LIMIT);

  const isActive = detail?.status === "ACTIVE";
  const lastSeenLabel = formatHeaderActive(
    detail?.lastSignInAt || detail?.lastActiveAt || null,
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(8,15,31,0.36)] backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close agent panel"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-[780px] flex-col border-l border-[#e6ebf0] bg-white shadow-[-18px_0_44px_rgba(15,23,42,0.18)]">
        <header className="px-6 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3.5">
              <AgentPhoto
                src={detail?.photoUrl}
                name={detail?.name ?? "Agent"}
                publicId={detail?.publicId}
                size="lg"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-[22px] font-bold leading-tight tracking-[-0.03em] text-[#0b1220]">
                    {detail?.name ?? "Agent"}
                  </h2>
                  {detail ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass(detail.status)}`}
                    >
                      <span className="text-[14px] leading-none">•</span>
                      {statusLabel(detail.status)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[13px] font-medium text-slate-500">
                  {detail?.publicId || "Agent ID pending"}
                </p>
                <div className="mt-2.5 grid gap-1.5 text-[13px] font-medium text-slate-600 sm:grid-cols-2">
                  <p className="flex items-center gap-2">
                    <Phone className="size-3.5 shrink-0 text-slate-400" />
                    <span>{formatPhone(detail?.phone) || "No phone"}</span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2">
                    <Mail className="size-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{detail?.email}</span>
                  </p>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
                  <Clock3 className="size-3.5 text-slate-400" />
                  {lastSeenLabel}
                </p>
              </div>
            </div>
            <div className="relative flex flex-col items-end gap-1">
              <button
                type="button"
                className="grid size-9 place-items-center rounded-lg text-[#0b1220] transition hover:bg-[#f4f7f6]"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
              {canManage && detail ? (
                <>
                  <button
                    type="button"
                    className="grid size-9 place-items-center rounded-lg text-[#0b1220] transition hover:bg-[#f4f7f6]"
                    aria-label="Agent actions"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((open) => !open)}
                  >
                    <MoreVertical className="size-4" />
                  </button>
                  {menuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 top-20 z-20 min-w-[168px] overflow-hidden rounded-xl border border-[#e6ebf0] bg-white py-1 shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3 py-2 text-left text-xs font-semibold text-[#07885f] hover:bg-[#f8faf9]"
                        disabled={profileBusy}
                        onClick={openEditProfile}
                      >
                        Edit profile
                      </button>
                      {detail.status === "ACTIVE" ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="block w-full px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50"
                          disabled={statusBusy}
                          onClick={() =>
                            setStatusConfirm({
                              action: "suspend",
                              agentId: detail.id,
                              agentName: detail.name,
                            })
                          }
                        >
                          Suspend Field Officer
                        </button>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          className="block w-full px-3 py-2 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f8faf9]"
                          disabled={statusBusy}
                          onClick={() =>
                            setStatusConfirm({
                              action: "activate",
                              agentId: detail.id,
                              agentName: detail.name,
                            })
                          }
                        >
                          Activate Field Officer
                        </button>
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-5 -mx-6 flex gap-6 border-b border-[#edf1f5] px-6">
            <DrawerTab
              active={tab === "account"}
              onClick={() => setTab("account")}
              label="Account"
            />
            <DrawerTab
              active={tab === "activity"}
              onClick={() => setTab("activity")}
              label="Activity"
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && !detail ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : null}

          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

          {tab === "account" ? (
            accountLoading && devices.length === 0 && accessHistory.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Loading account…
              </div>
            ) : (
              <div className="space-y-6">
                <section>
                  <h3 className="text-[15px] font-bold tracking-[-0.01em] text-[#0b1220]">
                    1. Access Status
                  </h3>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[1.35fr_1fr]">
                    <div className="rounded-2xl border border-[#e8edf2] bg-white p-4">
                      <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
                        <div>
                          <dt className="text-[11px] font-semibold text-slate-500">
                            Current status
                          </dt>
                          <dd className="mt-1">
                            {detail ? (
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusBadgeClass(detail.status)}`}
                              >
                                {statusLabel(detail.status)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </dd>
                        </div>
                        <InfoRow
                          label="Last sign-in"
                          value={formatRelativeDayTime(detail?.lastSignInAt)}
                        />
                        <InfoRow
                          label="Last active"
                          value={formatRelativeDayTime(
                            detail?.lastActiveAt || detail?.lastSignInAt,
                          )}
                        />
                        <InfoRow
                          label="Account created"
                          value={
                            detail?.createdAt
                              ? formatDateTime(detail.createdAt)
                              : "—"
                          }
                        />
                        <InfoRow
                          label="Branch"
                          value={detail?.branchName || "—"}
                        />
                        <InfoRow
                          label="Role"
                          value={detail?.roleName || "Field Officer"}
                        />
                      </dl>
                    </div>

                    <div className="flex flex-col justify-between rounded-2xl border border-[#e8edf2] bg-[#f8fafb] p-4">
                      <p className="text-[13px] leading-relaxed text-slate-600">
                        {isActive
                          ? "The agent can access the system and perform all assigned activities."
                          : "The agent is locked out and cannot sign in until the account is activated."}
                      </p>
                      {canManage && detail ? (
                        <div className="mt-4 flex flex-col gap-2">
                          <button
                            type="button"
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#b7ddc7] bg-white px-3 text-[13px] font-semibold text-[#07885f] transition hover:bg-[#f4fbf7]"
                            disabled={profileBusy}
                            onClick={openEditProfile}
                          >
                            <Edit3 className="size-4" />
                            Edit profile
                          </button>
                          {isActive ? (
                          <button
                            type="button"
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-3 text-[13px] font-semibold text-red-700 transition hover:bg-red-50"
                            disabled={statusBusy}
                            onClick={() =>
                              setStatusConfirm({
                                action: "suspend",
                                agentId: detail.id,
                                agentName: detail.name,
                              })
                            }
                          >
                            <PauseCircle className="size-4" />
                            Suspend Field Officer
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-3 text-[13px] font-semibold text-white transition hover:opacity-95"
                            disabled={statusBusy}
                            onClick={() =>
                              setStatusConfirm({
                                action: "activate",
                                agentId: detail.id,
                                agentName: detail.name,
                              })
                            }
                          >
                            <ShieldCheck className="size-4" />
                            Activate Field Officer
                          </button>
                        )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-[15px] font-bold tracking-[-0.01em] text-[#0b1220]">
                    2. Device Access
                  </h3>
                  <div className="mt-3 overflow-hidden rounded-2xl border border-[#e8edf2] bg-white">
                    {devices.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-slate-500">
                        No devices have signed in yet.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-[13px]">
                          <thead className="border-b border-[#dfe5eb] bg-[#e8edf2] text-[12px] font-semibold text-slate-600">
                            <tr>
                              <th className="px-4 py-2.5 font-medium">Device</th>
                              <th className="px-4 py-2.5 font-medium">Type</th>
                              <th className="px-4 py-2.5 font-medium">
                                Last used
                              </th>
                              <th className="px-4 py-2.5 font-medium">Status</th>
                              <th className="px-4 py-2.5 font-medium">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#f0f3f6]">
                            {devices.map((device) => (
                              <tr key={device.id}>
                                <td className="px-4 py-3">
                                  <span className="inline-flex items-center gap-2 font-medium text-[#0b1220]">
                                    {deviceIcon(device.platform, device.deviceType)}
                                    {device.deviceName}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-600">
                                  {device.deviceType}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                                  {formatRelativeDayTime(device.lastUsedAt)}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                      device.status === "CURRENT"
                                        ? "bg-[#efe9ff] text-[#6b4ce6]"
                                        : "bg-[#e9f8ef] text-[#07885f]"
                                    }`}
                                  >
                                    {device.status === "CURRENT"
                                      ? "This device"
                                      : "Active"}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  {device.canRemove ? (
                                    <button
                                      type="button"
                                      className="text-[13px] font-semibold text-red-600 hover:underline disabled:opacity-50"
                                      disabled={deviceBusy}
                                      onClick={() =>
                                        void removeDevice(device.id)
                                      }
                                    >
                                      Remove
                                    </button>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {canManage ? (
                      <div className="flex justify-end border-t border-[#edf1f5] px-4 py-3">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-[13px] font-semibold text-[#0b1220] transition hover:bg-[#f8faf9] disabled:opacity-50"
                          disabled={deviceBusy || devices.length === 0}
                          onClick={() => void signOutAllDevices()}
                        >
                          {deviceBusy ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <LogOut className="size-3.5" />
                          )}
                          Sign out all devices
                        </button>
                      </div>
                    ) : null}
                  </div>
                </section>

                <section>
                  <h3 className="text-[15px] font-bold tracking-[-0.01em] text-[#0b1220]">
                    3. Access History
                  </h3>
                  <div className="mt-3 overflow-hidden rounded-2xl border border-[#e8edf2] bg-white px-4 py-4">
                    <StepTimeline
                      items={accessHistory.map((item) => ({
                        id: item.id,
                        title: item.title,
                        detail: (
                          <span>
                            {item.detail}
                            <span className="text-slate-400">
                              {" "}
                              · by {item.actorName}
                            </span>
                          </span>
                        ),
                        tone: accessHistoryStepTone(item.type),
                        icon: accessHistoryIcon(item.type),
                        meta: formatDateTime(item.occurredAt),
                      }))}
                      empty={
                        <p className="py-4 text-center text-sm text-slate-500">
                          No access history yet.
                        </p>
                      }
                    />
                  </div>
                </section>
              </div>
            )
          ) : activityLoading &&
            issuedLoans.length === 0 &&
            collections.length === 0 &&
            otherActivity.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading activity…
            </div>
          ) : (
            <div className="space-y-6">
              <ActivitySection
                title="Issued Loans"
                actionLabel="View all issued loans →"
                actionHref="/loans"
              >
                <div className="px-3 py-3">
                  <StepTimeline
                    items={visibleLoans.map((loan) => ({
                      id: loan.id,
                      title: "Loan issued",
                      detail: (
                        <span>
                          {loan.clientName} ·{" "}
                          <Money
                            value={loan.principalAmount}
                            currency={currency}
                          />
                          {" · "}
                          {displayLoanId(loan.loanId ?? loan.id)}
                        </span>
                      ),
                      tone: "green",
                      icon: <Banknote />,
                      meta: formatDateTime(loan.submittedAt),
                      href: loan.customerId
                        ? `/clients/${loan.customerId}`
                        : undefined,
                    }))}
                    empty={<EmptyRow message="No issued loans yet." />}
                  />
                </div>
              </ActivitySection>

              <ActivitySection
                title="Collected Repayments"
                actionLabel="View all collected repayments →"
                actionHref="/collections/daily"
              >
                <div className="px-3 py-3">
                  <StepTimeline
                    items={visibleRepayments.map((row) => ({
                      id: row.id,
                      title: "Repayment recorded",
                      detail: (
                        <span>
                          {row.clientName} ·{" "}
                          <Money value={row.amount} currency={currency} />
                          {" · "}
                          {displayLoanId(row.loanId)}
                        </span>
                      ),
                      tone: "green",
                      icon: <Banknote />,
                      meta: formatDateTime(row.paidAt),
                      href: `/clients/${row.customerId}`,
                    }))}
                    empty={<EmptyRow message="No repayments collected yet." />}
                  />
                </div>
              </ActivitySection>

              <ActivitySection
                title="Other Activity"
                actionLabel="View full activity history →"
                onAction={() => setShowAllOther(true)}
              >
                <div className="px-3 py-3">
                  <StepTimeline
                    items={visibleOther.map((item) => ({
                      id: item.id,
                      title: item.title,
                      detail: item.detail,
                      tone: otherActivityStepTone(item.type),
                      icon: otherActivityIcon(item.type),
                      meta: formatDateTime(item.occurredAt),
                    }))}
                    empty={<EmptyRow message="No other activity yet." />}
                  />
                </div>
              </ActivitySection>
            </div>
          )}
        </div>

      </aside>

      {editOpen && detail ? (
        <AgentProfileEditModal
          form={editForm}
          busy={profileBusy}
          onChange={setEditForm}
          onClose={() => {
            if (!profileBusy) setEditOpen(false);
          }}
          onSubmit={saveProfile}
        />
      ) : null}

      <AgentStatusConfirmModal
        confirm={statusConfirm}
        busy={statusBusy}
        onClose={() => {
          if (!statusBusy) setStatusConfirm(null);
        }}
        onConfirm={(payload) => void setStatus(payload.status, payload.reason)}
      />
    </div>
  );
}

function AgentProfileEditModal({
  form,
  busy,
  onChange,
  onClose,
  onSubmit,
}: {
  form: AgentProfileForm;
  busy: boolean;
  onChange: (next: AgentProfileForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(8,15,31,0.44)] px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[460px] rounded-2xl border border-[#e6ebf0] bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.24)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold tracking-[-0.02em] text-[#0b1220]">
              Edit agent profile
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Update the officer details used across mobile and web.
            </p>
          </div>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100"
            onClick={onClose}
            disabled={busy}
            aria-label="Close profile editor"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-1.5 text-sm font-semibold text-[#0b1220]">
            Full name
            <input
              value={form.displayName}
              disabled={busy}
              onChange={(event) =>
                onChange({ ...form, displayName: event.target.value })
              }
              className="h-11 rounded-xl border border-[#d7dee7] px-3 text-sm font-medium outline-none transition focus:border-[#07885f] focus:ring-4 focus:ring-[#07885f]/10"
              placeholder="Agent name"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-semibold text-[#0b1220]">
            Email
            <input
              type="email"
              value={form.email}
              disabled={busy}
              onChange={(event) =>
                onChange({ ...form, email: event.target.value })
              }
              className="h-11 rounded-xl border border-[#d7dee7] px-3 text-sm font-medium outline-none transition focus:border-[#07885f] focus:ring-4 focus:ring-[#07885f]/10"
              placeholder="agent@example.com"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-semibold text-[#0b1220]">
            Phone
            <input
              value={form.phone}
              disabled={busy}
              onChange={(event) =>
                onChange({ ...form, phone: event.target.value })
              }
              className="h-11 rounded-xl border border-[#d7dee7] px-3 text-sm font-medium outline-none transition focus:border-[#07885f] focus:ring-4 focus:ring-[#07885f]/10"
              placeholder="+256..."
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[#d7dee7] px-4 text-sm font-semibold text-[#0b1220] transition hover:bg-[#f8faf9]"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-4 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
            disabled={busy}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Edit3 className="size-4" />}
            Save profile
          </button>
        </div>
      </form>
    </div>
  );
}

function ActivitySection({
  title,
  actionLabel,
  onAction,
  actionHref,
  children,
}: {
  title: string;
  actionLabel: string;
  onAction?: () => void;
  actionHref?: string;
  children: ReactNode;
}) {
  const actionClassName =
    "shrink-0 text-[13px] font-semibold text-[var(--forest-emerald)] transition hover:underline";

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8edf2] bg-white">
      <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-4">
        <h3 className="text-[15px] font-bold tracking-[-0.01em] text-[#0b1220]">
          {title}
        </h3>
        {actionHref ? (
          <Link href={actionHref} className={actionClassName}>
            {actionLabel}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className={actionClassName}
          >
            {actionLabel}
          </button>
        )}
      </div>
      <div className="px-1 pb-2">{children}</div>
    </section>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <p className="px-3 py-6 text-center text-sm text-slate-500">{message}</p>;
}

function DrawerTab({
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
      className={`-mb-px border-b-2 pb-2.5 text-[13px] font-semibold transition ${
        active
          ? "border-[#07885f] text-[#07885f]"
          : "border-transparent text-slate-500 hover:text-[#0b1220]"
      }`}
    >
      {label}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-[#0b1220]">{value}</dd>
    </div>
  );
}

function deviceIcon(platform: string | null, deviceType: string) {
  const value = `${platform ?? ""} ${deviceType}`.toUpperCase();
  if (value.includes("WEB") || value.includes("MAC") || value.includes("LAPTOP")) {
    return <Laptop className="size-4 text-slate-500" />;
  }
  return <Smartphone className="size-4 text-slate-500" />;
}

function displayLoanId(id: string) {
  if (/^LN[-_]/i.test(id)) return id.toUpperCase();
  const compact = id.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `LN-${compact}`;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
}

function formatRelativeDayTime(value: string | null | undefined) {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);

  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);

  if (parsed >= startToday) return `Today, ${time}`;
  if (parsed >= startYesterday) return `Yesterday, ${time}`;
  return formatDateTime(value);
}

function formatHeaderActive(value: string | null | undefined) {
  if (!value) return "No recent activity";
  const relative = formatRelativeDayTime(value);
  if (relative.startsWith("Today,")) {
    return `Active today,${relative.slice("Today,".length)}`;
  }
  return relative;
}

function formatPhone(value: string | null | undefined) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("256")) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  if (digits.length === 9) {
    return `+256 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return value;
}

function statusLabel(status: string) {
  if (status === "ACTIVE") return "Active";
  if (status === "SUSPENDED") return "Suspended";
  if (status === "INACTIVE") return "Inactive";
  return status.replaceAll("_", " ");
}

function statusBadgeClass(status: string) {
  if (status === "ACTIVE") return "bg-[#e9f8ef] text-[#07885f]";
  if (status === "SUSPENDED") return "bg-red-50 text-red-700";
  if (status === "INACTIVE") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function otherActivityStepTone(type: OtherActivity["type"]): StepTone {
  if (type === "FLOAT_RECEIVED") return "blue";
  if (type === "RECONCILIATION_COMPLETED") return "green";
  if (type === "ACCOUNT_SUSPENDED") return "red";
  return "green";
}

function otherActivityIcon(type: OtherActivity["type"]) {
  if (type === "FLOAT_RECEIVED") return <Banknote />;
  if (type === "RECONCILIATION_COMPLETED") return <CheckCircle2 />;
  if (type === "ACCOUNT_SUSPENDED") return <ShieldAlert />;
  return <ShieldCheck />;
}

function accessHistoryStepTone(type: AccessHistoryItem["type"]): StepTone {
  if (type === "ACCOUNT_CREATED") return "blue";
  if (type === "FIRST_SIGN_IN") return "violet";
  if (type === "ACCOUNT_SUSPENDED") return "amber";
  if (type === "ACCOUNT_REACTIVATED") return "green";
  if (type === "PASSWORD_RESET") return "blue";
  return "slate";
}

function accessHistoryIcon(type: AccessHistoryItem["type"]) {
  if (type === "ACCOUNT_CREATED") return <UserPlus />;
  if (type === "FIRST_SIGN_IN") return <LogIn />;
  if (type === "ACCOUNT_SUSPENDED") return <PauseCircle />;
  if (type === "ACCOUNT_REACTIVATED") return <CheckCircle2 />;
  if (type === "PASSWORD_RESET") return <KeyRound />;
  return <LogOut />;
}
