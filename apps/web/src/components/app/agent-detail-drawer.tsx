"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Banknote,
  CheckCircle2,
  Clock3,
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
  const [menuOpen, setMenuOpen] = useState(false);
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
        <header className="border-b border-[#edf1f5] px-6 pt-5">
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
                          Suspend Agent
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
                          Activate Agent
                        </button>
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-5 mb-4 inline-flex rounded-xl bg-[#f1f4f6] p-1">
            <TabButton
              active={tab === "account"}
              onClick={() => setTab("account")}
              label="Account"
            />
            <TabButton
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
                          value={detail?.roleName || "Field Agent"}
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
                        isActive ? (
                          <button
                            type="button"
                            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-3 text-[13px] font-semibold text-red-700 transition hover:bg-red-50"
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
                            Suspend Agent
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-3 text-[13px] font-semibold text-white transition hover:opacity-95"
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
                            Activate Agent
                          </button>
                        )
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
                          <thead className="border-b border-[#edf1f5] text-[12px] font-medium text-slate-500">
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
                  <div className="mt-3 overflow-hidden rounded-2xl border border-[#e8edf2] bg-white">
                    {accessHistory.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-slate-500">
                        No access history yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-[#f0f3f6]">
                        {accessHistory.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-start gap-3 px-4 py-3.5"
                          >
                            <span
                              className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${accessHistoryTone(item.type)}`}
                            >
                              {accessHistoryIcon(item.type)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-semibold text-[#0b1220]">
                                {item.title}
                              </p>
                              <p className="mt-0.5 text-[12px] text-slate-500">
                                {item.detail}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="whitespace-nowrap text-[12px] font-medium text-slate-400">
                                {formatDateTime(item.occurredAt)}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-400">
                                by {item.actorName}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
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
                {issuedLoans.length === 0 ? (
                  <EmptyRow message="No issued loans yet." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-[13px]">
                      <thead className="border-b border-[#edf1f5] text-[12px] font-medium text-slate-500">
                        <tr>
                          <th className="px-3 py-2.5 font-medium">Borrower</th>
                          <th className="px-3 py-2.5 font-medium">Loan ID</th>
                          <th className="px-3 py-2.5 text-right font-medium">
                            Principal Amount
                          </th>
                          <th className="px-3 py-2.5 font-medium">Issued On</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f0f3f6]">
                        {visibleLoans.map((loan) => (
                          <tr key={loan.id} className="bg-white">
                            <td className="px-3 py-3">
                              {loan.customerId ? (
                                <Link
                                  href={`/clients/${loan.customerId}`}
                                  className="font-medium text-[#0b1220] hover:text-[var(--forest-emerald)]"
                                >
                                  {loan.clientName}
                                </Link>
                              ) : (
                                <span className="font-medium text-[#0b1220]">
                                  {loan.clientName}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 font-medium tabular-nums text-[#0b1220]">
                              {displayLoanId(loan.loanId ?? loan.id)}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#0b1220]">
                              {formatMoney(loan.principalAmount, currency)}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap text-slate-500">
                              {formatDateTime(loan.submittedAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ActivitySection>

              <ActivitySection
                title="Collected Repayments"
                actionLabel="View all collected repayments →"
                actionHref="/collections/daily"
              >
                {collections.length === 0 ? (
                  <EmptyRow message="No repayments collected yet." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-[13px]">
                      <thead className="border-b border-[#edf1f5] text-[12px] font-medium text-slate-500">
                        <tr>
                          <th className="px-3 py-2.5 font-medium">Borrower</th>
                          <th className="px-3 py-2.5 text-right font-medium">
                            Amount Collected
                          </th>
                          <th className="px-3 py-2.5 font-medium">
                            Loan Reference
                          </th>
                          <th className="px-3 py-2.5 font-medium">
                            Collected On
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f0f3f6]">
                        {visibleRepayments.map((row) => (
                          <tr key={row.id} className="bg-white">
                            <td className="px-3 py-3">
                              <Link
                                href={`/clients/${row.customerId}`}
                                className="font-medium text-[#0b1220] hover:text-[var(--forest-emerald)]"
                              >
                                {row.clientName}
                              </Link>
                            </td>
                            <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#0b1220]">
                              {formatMoney(row.amount, currency)}
                            </td>
                            <td className="px-3 py-3 font-medium tabular-nums text-[#0b1220]">
                              {displayLoanId(row.loanId)}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap text-slate-500">
                              {formatDateTime(row.paidAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ActivitySection>

              <ActivitySection
                title="Other Activity"
                actionLabel="View full activity history →"
                onAction={() => setShowAllOther(true)}
              >
                {otherActivity.length === 0 ? (
                  <EmptyRow message="No other activity yet." />
                ) : (
                  <ul className="divide-y divide-[#f0f3f6]">
                    {visibleOther.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start gap-3 px-3 py-3.5"
                      >
                        <span
                          className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${otherActivityTone(item.type)}`}
                        >
                          {otherActivityIcon(item.type)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] leading-snug text-[#0b1220]">
                            <span className="font-semibold">{item.title}</span>
                            <span className="text-slate-500">
                              {" "}
                              — {item.detail}
                            </span>
                          </p>
                        </div>
                        <p className="shrink-0 whitespace-nowrap pt-0.5 text-[12px] font-medium text-slate-400">
                          {formatDateTime(item.occurredAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </ActivitySection>
            </div>
          )}
        </div>

      </aside>

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
      className={`min-w-[104px] rounded-lg px-4 py-2 text-[13px] font-semibold transition ${
        active
          ? "bg-white text-[#07885f] shadow-[0_1px_3px_rgba(15,23,42,0.08)]"
          : "bg-transparent text-slate-500 hover:text-[#0b1220]"
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

function formatMoney(value: number, currency: string) {
  return `${currency} ${Math.round(value).toLocaleString("en-UG")}`;
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

function otherActivityTone(type: OtherActivity["type"]) {
  if (type === "FLOAT_RECEIVED") return "bg-[#eaf4ff] text-[#2078dc]";
  if (type === "RECONCILIATION_COMPLETED") return "bg-[#e9f8ef] text-[#07885f]";
  if (type === "ACCOUNT_SUSPENDED") return "bg-red-50 text-red-700";
  return "bg-[#e9f8ef] text-[#07885f]";
}

function otherActivityIcon(type: OtherActivity["type"]) {
  if (type === "FLOAT_RECEIVED") return <Banknote className="size-3.5" />;
  if (type === "RECONCILIATION_COMPLETED")
    return <CheckCircle2 className="size-3.5" />;
  if (type === "ACCOUNT_SUSPENDED") return <ShieldAlert className="size-3.5" />;
  return <ShieldCheck className="size-3.5" />;
}

function accessHistoryTone(type: AccessHistoryItem["type"]) {
  if (type === "ACCOUNT_CREATED") return "bg-[#eaf4ff] text-[#2078dc]";
  if (type === "FIRST_SIGN_IN") return "bg-[#eef2ff] text-[#4f46e5]";
  if (type === "ACCOUNT_SUSPENDED") return "bg-[#fff4e8] text-[#d97706]";
  if (type === "ACCOUNT_REACTIVATED") return "bg-[#e9f8ef] text-[#07885f]";
  if (type === "PASSWORD_RESET") return "bg-[#eaf4ff] text-[#2078dc]";
  return "bg-slate-100 text-slate-600";
}

function accessHistoryIcon(type: AccessHistoryItem["type"]) {
  if (type === "ACCOUNT_CREATED") return <UserPlus className="size-3.5" />;
  if (type === "FIRST_SIGN_IN") return <LogIn className="size-3.5" />;
  if (type === "ACCOUNT_SUSPENDED") return <PauseCircle className="size-3.5" />;
  if (type === "ACCOUNT_REACTIVATED")
    return <CheckCircle2 className="size-3.5" />;
  if (type === "PASSWORD_RESET") return <KeyRound className="size-3.5" />;
  return <LogOut className="size-3.5" />;
}
