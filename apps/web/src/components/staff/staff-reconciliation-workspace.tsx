"use client";

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Coins,
  Loader2,
  ReceiptText,
  RefreshCw,
  Send,
  WalletCards,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { formatMoney, formatMoneyAmount } from "../../app/owner/owner-common";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import type { RembehSession, RembehUser } from "../../lib/auth-session";

type AgentDayStatus = {
  date: string;
  branch: {
    id: string;
    name: string;
    address: string | null;
  } | null;
  branchStatus: "OPEN" | "CLOSING" | "CLOSED" | null;
  canUseApp: boolean;
  canBrowseClients: boolean;
  lockReason:
    | "NO_BRANCH"
    | "BRANCH_NOT_OPEN"
    | "BRANCH_CLOSED"
    | "AGENT_DAY_CLOSED"
    | "BEFORE_OPEN_HOUR"
    | null;
  lockTitle: string | null;
  lockMessage: string | null;
  float: {
    amountReceived: number;
    amountDisbursed: number;
    processingFees: number;
    amountCollected: number;
    collectedRepaymentsAvailable: number;
    unusedFloat: number;
    expectedHandover: number;
    amountReturned: number | null;
    returnedAt: string | null;
  };
};

type StaffReconciliationWorkspaceProps = {
  session: RembehSession;
  user: RembehUser | null;
};

const SHORTAGE_REASONS = [
  {
    value: "CASH_NOT_RETURNED",
    label: "Cash was not returned",
  },
  {
    value: "COLLECTION_NOT_ACCOUNTED_FOR",
    label: "Collection not accounted for",
  },
  {
    value: "PROCESSING_FEE_NOT_ACCOUNTED_FOR",
    label: "Processing fee not accounted for",
  },
  {
    value: "FLOAT_NOT_ACCOUNTED_FOR",
    label: "Float not accounted for",
  },
  {
    value: "OTHER",
    label: "Other",
  },
] as const;

export function StaffReconciliationWorkspace({
  session,
  user,
}: StaffReconciliationWorkspaceProps) {
  const [status, setStatus] = useState<AgentDayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [amountReturned, setAmountReturned] = useState("");
  const [shortageReason, setShortageReason] = useState("");
  const [notes, setNotes] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/operations/agent-today`, {
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
        },
      });
      const payload = await readApiJson<
        AgentDayStatus & { message?: string | string[] }
      >(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setStatus(payload);
      if (payload.float.amountReturned != null) {
        setAmountReturned(String(Math.round(payload.float.amountReturned)));
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load your reconciliation.",
      );
    } finally {
      setLoading(false);
    }
  }, [session.accessToken, session.tokenType]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const parsedAmount = useMemo(
    () => parseMoney(amountReturned),
    [amountReturned],
  );

  const expected = Math.max(0, status?.float.expectedHandover ?? 0);
  const variance =
    amountReturned.trim().length === 0 ? null : parsedAmount - expected;
  const hasShortage = variance != null && variance < 0;
  const returned = status?.float.amountReturned != null;
  const canSubmit =
    Boolean(status?.branch) &&
    status?.branchStatus === "OPEN" &&
    !returned &&
    parsedAmount >= 0 &&
    amountReturned.trim().length > 0;

  async function submitHandover() {
    if (!status || saving) return;
    if (!canSubmit) {
      setError("Enter the cash amount you are handing over.");
      return;
    }
    if (hasShortage && !shortageReason) {
      setError("Choose a reason for the shortage before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBaseUrl}/operations/agent-return`, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: status.date,
          amountReturned: Math.round(parsedAmount),
          ...(hasShortage ? { shortageReason } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      const payload = await readApiJson<
        AgentDayStatus & { message?: string | string[] }
      >(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setStatus(payload);
      setNotice("Cash handover recorded.");
      setShortageReason("");
      setNotes("");
      if (payload.float.amountReturned != null) {
        setAmountReturned(String(Math.round(payload.float.amountReturned)));
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save cash handover.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading && !status) {
    return (
      <div className="mx-auto max-w-5xl rounded-[18px] border border-[#e6ebf0] bg-white px-6 py-10 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading your reconciliation...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--forest-emerald)]">
            Field officer
          </p>
          <h1 className="mt-1 text-2xl font-black text-[var(--midnight-navy)]">
            Daily reconciliation
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {user?.name ?? "Your account"}
            {status?.branch?.name ? ` · ${status.branch.name}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadStatus()}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dbe4ea] bg-white px-3 text-sm font-bold text-[#111a2e] shadow-[0_8px_18px_rgba(15,23,42,0.045)] disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      {error ? (
        <Feedback tone="danger" icon={<AlertTriangle className="size-4" />}>
          {error}
        </Feedback>
      ) : null}
      {notice ? (
        <Feedback tone="success" icon={<CheckCircle2 className="size-4" />}>
          {notice}
        </Feedback>
      ) : null}
      {status?.lockMessage && !returned ? (
        <Feedback tone="warning" icon={<AlertTriangle className="size-4" />}>
          <span className="font-bold">{status.lockTitle ?? "Access notice"}</span>
          <span className="ml-1">{status.lockMessage}</span>
        </Feedback>
      ) : null}

      <section className="rounded-[18px] border border-[#e6ebf0] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric
            icon={<WalletCards className="size-4" />}
            label="Float received"
            value={formatMoney(status?.float.amountReceived ?? 0)}
          />
          <Metric
            icon={<Banknote className="size-4" />}
            label="Loans disbursed"
            value={formatMoney(status?.float.amountDisbursed ?? 0)}
          />
          <Metric
            icon={<Coins className="size-4" />}
            label="Repayments held"
            value={formatMoney(
              status?.float.collectedRepaymentsAvailable ?? 0,
            )}
          />
          <Metric
            icon={<ReceiptText className="size-4" />}
            label="Processing fees"
            value={formatMoney(status?.float.processingFees ?? 0)}
          />
        </div>

        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">
            Expected handover
          </p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <p className="text-3xl font-black text-[var(--forest-emerald)]">
              {formatMoney(expected)}
            </p>
            {returned ? (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[var(--forest-emerald)]">
                Recorded
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-5 divide-y divide-[#edf1f5] rounded-2xl border border-[#edf1f5]">
          <BreakdownRow
            label="Unused assigned float"
            value={status?.float.unusedFloat ?? 0}
          />
          <BreakdownRow
            label="Collected repayments not used for disbursements"
            value={status?.float.collectedRepaymentsAvailable ?? 0}
          />
          <BreakdownRow
            label="Processing fees collected"
            value={status?.float.processingFees ?? 0}
          />
        </div>
      </section>

      <section className="rounded-[18px] border border-[#e6ebf0] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[var(--midnight-navy)]">
              Record cash handover
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Count your cash and submit what you are returning to the branch.
            </p>
          </div>
          {returned ? (
            <CheckCircle2 className="size-6 text-[var(--forest-emerald)]" />
          ) : null}
        </div>

        {returned ? (
          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
            <p className="text-sm font-bold text-[var(--forest-emerald)]">
              You returned {formatMoney(status?.float.amountReturned ?? 0)}.
            </p>
            <p className="mt-1 text-xs font-medium text-emerald-700">
              {status?.float.returnedAt
                ? `Recorded ${formatDateTime(status.float.returnedAt)}`
                : "Recorded for today."}
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4">
            <label className="block">
              <span className="text-sm font-bold text-[#111a2e]">
                Amount returned (UGX)
              </span>
              <div className="mt-2 flex h-12 overflow-hidden rounded-xl border border-[#dbe4ea] bg-white focus-within:border-[var(--forest-emerald)]">
                <span className="grid w-16 place-items-center border-r border-[#edf1f5] text-sm font-black text-[#111a2e]">
                  UGX
                </span>
                <input
                  value={amountReturned}
                  onChange={(event) => setAmountReturned(event.target.value)}
                  inputMode="numeric"
                  className="min-w-0 flex-1 px-3 text-sm font-bold outline-none"
                  placeholder="Enter amount"
                />
              </div>
            </label>

            {variance != null ? (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                  variance < 0
                    ? "border-red-100 bg-red-50 text-red-700"
                    : variance > 0
                      ? "border-sky-100 bg-sky-50 text-sky-700"
                      : "border-emerald-100 bg-emerald-50 text-[var(--forest-emerald)]"
                }`}
              >
                {variance < 0
                  ? `Short by UGX ${formatMoneyAmount(Math.abs(variance))}`
                  : variance > 0
                    ? `Extra returned: UGX ${formatMoneyAmount(variance)}`
                    : "Handover matches the expected amount."}
              </div>
            ) : null}

            {hasShortage ? (
              <label className="block">
                <span className="text-sm font-bold text-[#111a2e]">
                  Shortage reason
                </span>
                <select
                  value={shortageReason}
                  onChange={(event) => setShortageReason(event.target.value)}
                  className="mt-2 h-12 w-full rounded-xl border border-[#dbe4ea] bg-white px-3 text-sm font-bold text-[#111a2e] outline-none focus:border-[var(--forest-emerald)]"
                >
                  <option value="">Choose reason</option>
                  {SHORTAGE_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block">
              <span className="text-sm font-bold text-[#111a2e]">
                Notes (optional)
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-[#dbe4ea] bg-white px-3 py-3 text-sm font-medium outline-none focus:border-[var(--forest-emerald)]"
                placeholder="Add context for your manager"
              />
            </label>

            <button
              type="button"
              onClick={() => void submitHandover()}
              disabled={!canSubmit || saving}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-5 text-sm font-black text-white shadow-[0_12px_24px_rgba(0,112,60,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Record handover
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[#edf1f5] bg-[#fbfcfd] px-4 py-4">
      <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-[var(--forest-emerald)]">
        {icon}
      </span>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-black text-[#111a2e]">{value}</p>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="font-semibold text-slate-600">{label}</span>
      <span className="font-black tabular-nums text-[#111a2e]">
        {formatMoney(value)}
      </span>
    </div>
  );
}

function Feedback({
  tone,
  icon,
  children,
}: {
  tone: "danger" | "success" | "warning";
  icon: ReactNode;
  children: ReactNode;
}) {
  const className =
    tone === "danger"
      ? "border-red-100 bg-red-50 text-red-700"
      : tone === "success"
        ? "border-emerald-100 bg-emerald-50 text-[var(--forest-emerald)]"
        : "border-amber-100 bg-amber-50 text-amber-800";
  return (
    <div
      className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${className}`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p>{children}</p>
    </div>
  );
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return Number.NaN;
  return Number(cleaned);
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-UG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}
