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
  Loader2,
  Mail,
  MoreVertical,
  Phone,
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
  const [tab, setTab] = useState<"activity" | "account">("activity");
  const [applications, setApplications] = useState<ActivityApplication[]>([]);
  const [collections, setCollections] = useState<ActivityCollection[]>([]);
  const [otherActivity, setOtherActivity] = useState<OtherActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
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

  useEffect(() => {
    const boot = window.setTimeout(() => {
      if (!agentId) {
        setDetail(null);
        setApplications([]);
        setCollections([]);
        setOtherActivity([]);
        setTab("activity");
        setMenuOpen(false);
        setShowAllLoans(false);
        setShowAllRepayments(false);
        setShowAllOther(false);
        return;
      }
      void loadDetail(agentId);
      void loadActivity(agentId);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [agentId, loadDetail, loadActivity]);

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
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update status.",
      );
    } finally {
      setStatusBusy(false);
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(8,15,31,0.36)] backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close agent panel"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-[720px] flex-col border-l border-[#e6ebf0] bg-white shadow-[-18px_0_44px_rgba(15,23,42,0.18)]">
        <header className="border-b border-[#edf1f5] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <AgentPhoto
                src={detail?.photoUrl}
                name={detail?.name ?? "Agent"}
                publicId={detail?.publicId}
                size="lg"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-bold tracking-[-0.02em] text-[#0b1220]">
                    {detail?.name ?? "Agent"}
                  </h2>
                  {detail ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusBadgeClass(detail.status)}`}
                    >
                      {statusLabel(detail.status)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {detail?.publicId || "Agent ID pending"}
                </p>
                <div className="mt-2 space-y-1 text-xs font-medium text-slate-600">
                  <p className="flex items-center gap-1.5">
                    <Phone className="size-3.5 shrink-0 text-slate-400" />
                    <span>{detail?.phone || "No phone"}</span>
                  </p>
                  <p className="flex min-w-0 items-center gap-1.5">
                    <Mail className="size-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{detail?.email}</span>
                  </p>
                </div>
              </div>
            </div>
            <div className="relative flex items-center gap-1.5">
              {canManage && detail ? (
                <>
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#0b1220]"
                    aria-label="Agent actions"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((open) => !open)}
                  >
                    <MoreVertical className="size-4" />
                  </button>
                  {menuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-10 top-0 z-20 min-w-[160px] overflow-hidden rounded-xl border border-[#e6ebf0] bg-white py-1 shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
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
              <button
                type="button"
                className="grid size-8 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#0b1220]"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-1 border-b border-[#edf1f5]">
            <TabButton
              active={tab === "activity"}
              onClick={() => setTab("activity")}
              label="Activity"
            />
            <TabButton
              active={tab === "account"}
              onClick={() => setTab("account")}
              label="Account"
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && !detail ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : null}

          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

          {tab === "activity" ? (
            activityLoading &&
            issuedLoans.length === 0 &&
            collections.length === 0 &&
            otherActivity.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Loading activity…
              </div>
            ) : (
              <div className="space-y-5">
                <ActivitySection
                  title="Issued Loans"
                  actionLabel={
                    issuedLoans.length > PREVIEW_LIMIT
                      ? showAllLoans
                        ? "Show less"
                        : "View all issued loans →"
                      : null
                  }
                  onAction={
                    issuedLoans.length > PREVIEW_LIMIT
                      ? () => setShowAllLoans((value) => !value)
                      : undefined
                  }
                >
                  {issuedLoans.length === 0 ? (
                    <EmptyRow message="No issued loans yet." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left text-xs">
                        <thead className="bg-[#f8faf9] text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                          <tr>
                            <th className="px-3 py-2.5">Borrower</th>
                            <th className="px-3 py-2.5">Loan ID</th>
                            <th className="px-3 py-2.5 text-right">
                              Principal Amount
                            </th>
                            <th className="px-3 py-2.5">Issued On</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#edf1f5]">
                          {visibleLoans.map((loan) => (
                            <tr key={loan.id} className="bg-white">
                              <td className="px-3 py-2.5">
                                {loan.customerId ? (
                                  <Link
                                    href={`/clients/${loan.customerId}`}
                                    className="font-semibold text-[#0b1220] hover:text-[var(--forest-emerald)]"
                                  >
                                    {loan.clientName}
                                  </Link>
                                ) : (
                                  <span className="font-semibold text-[#0b1220]">
                                    {loan.clientName}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 font-bold tabular-nums text-[#0b1220]">
                                {shortLoanId(loan.loanId ?? loan.id)}
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#0b1220]">
                                {formatMoney(loan.principalAmount, currency)}
                              </td>
                              <td className="px-3 py-2.5 text-slate-600">
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
                  actionLabel={
                    collections.length > PREVIEW_LIMIT
                      ? showAllRepayments
                        ? "Show less"
                        : "View all collected repayments →"
                      : null
                  }
                  onAction={
                    collections.length > PREVIEW_LIMIT
                      ? () => setShowAllRepayments((value) => !value)
                      : undefined
                  }
                >
                  {collections.length === 0 ? (
                    <EmptyRow message="No repayments collected yet." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left text-xs">
                        <thead className="bg-[#f8faf9] text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                          <tr>
                            <th className="px-3 py-2.5">Borrower</th>
                            <th className="px-3 py-2.5 text-right">
                              Amount Collected
                            </th>
                            <th className="px-3 py-2.5">Loan Reference</th>
                            <th className="px-3 py-2.5">Collected On</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#edf1f5]">
                          {visibleRepayments.map((row) => (
                            <tr key={row.id} className="bg-white">
                              <td className="px-3 py-2.5">
                                <Link
                                  href={`/clients/${row.customerId}`}
                                  className="font-semibold text-[#0b1220] hover:text-[var(--forest-emerald)]"
                                >
                                  {row.clientName}
                                </Link>
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[var(--forest-emerald)]">
                                {formatMoney(row.amount, currency)}
                              </td>
                              <td className="px-3 py-2.5 font-bold tabular-nums text-[#0b1220]">
                                {shortLoanId(row.loanId)}
                              </td>
                              <td className="px-3 py-2.5 text-slate-600">
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
                  actionLabel={
                    otherActivity.length > PREVIEW_LIMIT
                      ? showAllOther
                        ? "Show less"
                        : "View full activity history →"
                      : null
                  }
                  onAction={
                    otherActivity.length > PREVIEW_LIMIT
                      ? () => setShowAllOther((value) => !value)
                      : undefined
                  }
                >
                  {otherActivity.length === 0 ? (
                    <EmptyRow message="No other activity yet." />
                  ) : (
                    <ul className="divide-y divide-[#edf1f5]">
                      {visibleOther.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-start gap-3 px-3 py-3"
                        >
                          <span
                            className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${otherActivityTone(item.type)}`}
                          >
                            {otherActivityIcon(item.type)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[#0b1220]">
                              {item.title}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {item.detail}
                            </p>
                          </div>
                          <p className="shrink-0 text-[11px] font-medium text-slate-500">
                            {formatDateTime(item.occurredAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </ActivitySection>
              </div>
            )
          ) : (
            <div className="space-y-4">
              <section className="rounded-2xl border border-[#e6ebf0] bg-[#fbfcfd] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Account
                </p>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <InfoRow label="Branch" value={detail?.branchName || "—"} />
                  <InfoRow
                    label="Role"
                    value={detail?.roleName || "Field agent"}
                  />
                  <InfoRow
                    label="Status"
                    value={detail ? statusLabel(detail.status) : "—"}
                  />
                  <InfoRow
                    label="Joined"
                    value={
                      detail?.createdAt
                        ? formatDateTime(detail.createdAt)
                        : "—"
                    }
                  />
                  <InfoRow label="Phone" value={detail?.phone || "—"} />
                  <InfoRow label="Email" value={detail?.email || "—"} />
                </dl>
              </section>

              {detail?.accountability ? (
                <section className="rounded-2xl border border-[#e6ebf0] bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Today&apos;s Float · {detail.accountability.date}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MiniStat
                      label="Given"
                      value={formatMoney(
                        detail.accountability.amountGiven,
                        currency,
                      )}
                    />
                    <MiniStat
                      label="Disbursed"
                      value={formatMoney(
                        detail.accountability.amountDisbursed,
                        currency,
                      )}
                    />
                    <MiniStat
                      label="Collected"
                      value={formatMoney(
                        detail.accountability.amountCollected,
                        currency,
                      )}
                    />
                    <MiniStat
                      label="Expected Cash"
                      value={formatMoney(
                        detail.accountability.expectedCash,
                        currency,
                      )}
                      emphasize
                    />
                  </div>
                </section>
              ) : null}

              {canManage && detail ? (
                <section className="rounded-2xl border border-[#e6ebf0] bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Status Controls
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.status === "ACTIVE" ? (
                      <button
                        type="button"
                        className="h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700"
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
                        className="h-9 rounded-xl bg-[var(--forest-emerald)] px-3 text-xs font-semibold text-white"
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
                </section>
              ) : null}
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
  children,
}: {
  title: string;
  actionLabel?: string | null;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e6ebf0] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#edf1f5] px-3 py-3">
        <h3 className="text-sm font-bold text-[#0b1220]">{title}</h3>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="text-xs font-semibold text-[var(--forest-emerald)] hover:underline"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      {children}
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
      className={`px-3 py-2 text-sm font-semibold ${
        active
          ? "border-b-2 border-[var(--forest-emerald)] text-[#0b1220]"
          : "text-slate-500"
      }`}
    >
      {label}
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-bold tabular-nums ${
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-[#0b1220]">{value}</dd>
    </div>
  );
}

function shortLoanId(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function formatMoney(value: number, currency: string) {
  return `${currency} ${Math.round(value).toLocaleString("en-UG")}`;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
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
