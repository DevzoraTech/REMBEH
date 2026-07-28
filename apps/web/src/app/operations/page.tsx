"use client";

import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Send,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app/app-shell";
import { AppBootSkeleton, SkeletonBlock } from "../../components/app/skeleton";
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

type OperationBranch = {
  id: string;
  name: string;
  address: string;
};

type DailyOperation = {
  id: string;
  branchId: string;
  branchName: string;
  operationDate: string;
  status: "OPEN" | "CLOSING" | "CLOSED";
  openedAt: string;
  openedByName: string;
  closedAt: string | null;
  openingBalance: number;
  cashAddedToday: number;
  cashAvailableAtOpening: number;
  floatIssued: number;
  floatSetAside: number;
  branchCashRemaining: number;
  closingBalance: number | null;
  loansIssuedCount: number;
  loansIssuedPrincipal: number;
  collectionsCount: number;
  collectionsReceived: number;
  notes: string | null;
};

type OperationResponse = {
  date: string;
  branch: OperationBranch | null;
  openingBalance: number | null;
  operation: DailyOperation | null;
  message?: string | string[];
};

type OpeningForm = {
  openingBalance: string;
  cashAddedToday: string;
  notes: string;
};

const emptyOpeningForm: OpeningForm = {
  openingBalance: "",
  cashAddedToday: "",
  notes: "",
};

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function OperationsPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [date, setDate] = useState(todayInputValue);
  const [data, setData] = useState<OperationResponse | null>(null);
  const [form, setForm] = useState<OpeningForm>(emptyOpeningForm);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canOpen = Boolean(session?.permissions.includes("operation.open"));
  const activeBranch = data?.branch;
  const operation = data?.operation;
  const suggestedOpeningBalance = data?.openingBalance ?? null;

  const loadOperation = useCallback(
    async (activeSession: RembehSession, selectedDate: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `${apiBaseUrl}/operations/today?date=${encodeURIComponent(selectedDate)}`,
          {
            headers: {
              Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
            },
          },
        );
        const payload = await readApiJson<OperationResponse>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        setData(payload);
        if (!payload.operation && payload.openingBalance != null) {
          setForm((current) =>
            current.openingBalance
              ? current
              : {
                  ...current,
                  openingBalance: String(payload.openingBalance),
                },
          );
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load daily operations.",
        );
      } finally {
        setLoading(false);
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

      if (!auth.session.permissions.includes("operation.read")) {
        setError("You do not have access to daily operations.");
        setLoading(false);
        return;
      }

      void loadOperation(auth.session, date);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [router, date, loadOperation]);

  const openingTotal = useMemo(
    () => Number(form.openingBalance || 0) + Number(form.cashAddedToday || 0),
    [form.cashAddedToday, form.openingBalance],
  );

  async function openBranch() {
    if (!session || !activeBranch || opening) return;
    setOpening(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBaseUrl}/operations/open`, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchId: activeBranch.id,
          date,
          openingBalance: Number(form.openingBalance),
          cashAddedToday: Number(form.cashAddedToday),
          notes: form.notes.trim() || undefined,
        }),
      });
      const payload = await readApiJson<OperationResponse>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setData(payload);
      setForm(emptyOpeningForm);
      setNotice("Branch opened.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not open branch.",
      );
    } finally {
      setOpening(false);
    }
  }

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
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[var(--forest-emerald)]">
              Daily Operations
            </p>
            <h1 className="text-xl font-bold text-[var(--midnight-navy)]">
              {activeBranch?.name ?? "Operations Hub"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-9 items-center gap-2 border border-[var(--line)] bg-white px-2 text-xs font-bold text-[var(--midnight-navy)]">
              <CalendarDays className="size-3.5 text-slate-400" />
              <input
                type="date"
                value={date}
                onChange={(event) => {
                  setNotice(null);
                  setForm(emptyOpeningForm);
                  setDate(event.target.value);
                }}
                className="bg-transparent outline-none"
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost h-9 text-xs"
              onClick={() => void loadOperation(session, date)}
              disabled={loading}
            >
              <RefreshCw
                className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        {notice ? (
          <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-[var(--forest-emerald)]">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {loading && !data ? (
          <OperationsSkeleton />
        ) : !activeBranch ? (
          <div className="panel bg-white px-4 py-6 text-sm text-slate-500">
            Create a branch before starting daily operations.
          </div>
        ) : operation ? (
          <OpenOperationView operation={operation} />
        ) : (
          <OpeningView
            branch={activeBranch}
            canOpen={canOpen}
            form={form}
            opening={opening}
            openingTotal={openingTotal}
            suggestedOpeningBalance={suggestedOpeningBalance}
            setForm={setForm}
            onOpen={() => void openBranch()}
          />
        )}
      </div>
    </AppShell>
  );
}

function OpeningView({
  branch,
  canOpen,
  form,
  opening,
  openingTotal,
  suggestedOpeningBalance,
  setForm,
  onOpen,
}: {
  branch: OperationBranch;
  canOpen: boolean;
  form: OpeningForm;
  opening: boolean;
  openingTotal: number;
  suggestedOpeningBalance: number | null;
  setForm: (next: OpeningForm) => void;
  onOpen: () => void;
}) {
  const valid =
    Number(form.openingBalance) >= 0 &&
    Number(form.cashAddedToday) >= 0 &&
    form.openingBalance !== "" &&
    form.cashAddedToday !== "";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section className="panel bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
        <header className="border-b border-[var(--line)] px-4 py-3">
          <p className="text-sm font-bold text-[var(--midnight-navy)]">
            Open branch
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{branch.address}</p>
        </header>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <MoneyField
            label="Opening balance"
            value={form.openingBalance}
            locked={suggestedOpeningBalance != null}
            onChange={(value) => setForm({ ...form, openingBalance: value })}
          />
          <MoneyField
            label="Cash added today"
            value={form.cashAddedToday}
            onChange={(value) => setForm({ ...form, cashAddedToday: value })}
          />
          <label className="sm:col-span-2">
            <span className="text-xs font-bold text-slate-600">Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
              rows={3}
              className="mt-1 w-full border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)]"
            />
          </label>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] bg-[var(--soft-mist)] px-4 py-3">
          <p className="text-sm font-bold tabular-nums text-[var(--midnight-navy)]">
            Available cash: {formatMoney(openingTotal)}
          </p>
          <button
            type="button"
            className="btn btn-primary h-9 text-xs"
            onClick={onOpen}
            disabled={!canOpen || !valid || opening}
          >
            {opening ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            Open branch
          </button>
        </footer>
      </section>

      <aside className="space-y-3">
        <StatusPanel
          icon={<LockKeyhole className="size-4" />}
          title="Branch not open"
          value="Float locked"
          tone="warn"
        />
        <StatusPanel
          icon={<ShieldCheck className="size-4" />}
          title="Opening formula"
          value="Balance + cash"
          tone="good"
        />
      </aside>
    </div>
  );
}

function OpenOperationView({ operation }: { operation: DailyOperation }) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-6 gap-1 sm:gap-1.5 xl:gap-2">
        <OperationStat
          label="Status"
          value={operationLabel(operation.status)}
          hint={`Opened ${formatClock(operation.openedAt)}`}
          tone="good"
        />
        <OperationStat
          label="Available cash"
          value={formatMoney(operation.cashAvailableAtOpening)}
          hint="Opening + added"
          tone="blue"
        />
        <OperationStat
          label="Float issued"
          value={formatMoney(operation.floatSetAside)}
          hint="Set aside for agents"
          tone="warn"
        />
        <OperationStat
          label="Remaining cash"
          value={formatMoney(operation.branchCashRemaining)}
          hint="After float"
          tone="blue"
        />
        <OperationStat
          label="Loans issued"
          value={String(operation.loansIssuedCount)}
          hint={formatMoney(operation.loansIssuedPrincipal)}
          tone="bad"
        />
        <OperationStat
          label="Collections"
          value={formatMoney(operation.collectionsReceived)}
          hint={`${operation.collectionsCount} payments`}
          tone="good"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="panel overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
          <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <p className="text-sm font-bold text-[var(--midnight-navy)]">
              Opening record
            </p>
            <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-[var(--forest-emerald)]">
              {operationLabel(operation.status)}
            </span>
          </header>
          <div className="grid gap-0 p-4 sm:grid-cols-2">
            <DetailRow label="Opened by" value={operation.openedByName} />
            <DetailRow
              label="Opened at"
              value={formatDateTime(operation.openedAt)}
            />
            <DetailRow
              label="Opening balance"
              value={formatMoney(operation.openingBalance)}
            />
            <DetailRow
              label="Cash added today"
              value={formatMoney(operation.cashAddedToday)}
            />
            <DetailRow
              label="Available at opening"
              value={formatMoney(operation.cashAvailableAtOpening)}
            />
            <DetailRow
              label="Float set aside"
              value={formatMoney(operation.floatSetAside)}
            />
          </div>
          {operation.notes ? (
            <div className="border-t border-[var(--line)] px-4 py-3 text-sm text-slate-600">
              {operation.notes}
            </div>
          ) : null}
        </section>

        <aside className="space-y-3">
          <Link
            href="/agents"
            className="panel flex items-center justify-between gap-3 bg-white px-4 py-3 hover:bg-[var(--soft-mist)]"
          >
            <span>
              <span className="block text-sm font-bold text-[var(--midnight-navy)]">
                Assign float
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Remaining cash: {formatMoney(operation.branchCashRemaining)}
              </span>
            </span>
            <Send className="size-4 text-[var(--forest-emerald)]" />
          </Link>
          <StatusPanel
            icon={<WalletCards className="size-4" />}
            title="Field work"
            value="Ready"
            tone="good"
          />
          <StatusPanel
            icon={<Banknote className="size-4" />}
            title="Cash position"
            value={formatMoney(operation.branchCashRemaining)}
            tone="blue"
          />
        </aside>
      </div>
    </div>
  );
}

function MoneyField({
  label,
  value,
  locked = false,
  onChange,
}: {
  label: string;
  value: string;
  locked?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <input
        type="number"
        min="0"
        step="100"
        value={value}
        disabled={locked}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full border border-[var(--line)] bg-white px-3 text-sm font-semibold tabular-nums text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] disabled:bg-[var(--soft-mist)] disabled:text-slate-500"
      />
    </label>
  );
}

function OperationStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "good" | "blue" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-100 bg-emerald-50 text-[var(--forest-emerald)]"
      : tone === "blue"
        ? "border-sky-100 bg-sky-50 text-sky-700"
        : tone === "warn"
          ? "border-amber-100 bg-amber-50 text-amber-700"
          : "border-rose-100 bg-rose-50 text-rose-700";

  return (
    <article className="panel flex min-h-[76px] min-w-0 items-start gap-1.5 bg-white px-1.5 py-2 shadow-[0_8px_20px_rgba(20,33,61,0.05)] sm:gap-2 sm:px-2 xl:px-3">
      <span
        className={`hidden size-7 shrink-0 place-items-center border md:grid xl:size-8 ${toneClass}`}
      >
        <Banknote className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[8px] font-semibold tracking-[0.06em] text-slate-500 sm:text-[9px] xl:text-[10px]">
          {label}
        </p>
        <p className="mt-1 truncate text-xs font-bold tabular-nums text-[var(--midnight-navy)] sm:text-sm xl:text-base">
          {value}
        </p>
        <p className="mt-0.5 truncate text-[9px] text-slate-500 sm:text-[10px] xl:text-[11px]">
          {hint}
        </p>
      </div>
    </article>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[var(--line)] px-1 py-2">
      <p className="text-[10px] font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-[var(--midnight-navy)]">
        {value}
      </p>
    </div>
  );
}

function StatusPanel({
  icon,
  title,
  value,
  tone,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  tone: "good" | "blue" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-100 bg-emerald-50 text-[var(--forest-emerald)]"
      : tone === "blue"
        ? "border-sky-100 bg-sky-50 text-sky-700"
        : "border-amber-100 bg-amber-50 text-amber-700";
  return (
    <div className="panel flex items-center gap-3 bg-white px-4 py-3">
      <span className={`grid size-9 place-items-center border ${toneClass}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-slate-500">
          {title}
        </span>
        <span className="block truncate text-sm font-bold text-[var(--midnight-navy)]">
          {value}
        </span>
      </span>
    </div>
  );
}

function OperationsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-20" />
        ))}
      </div>
      <SkeletonBlock className="h-72" />
    </div>
  );
}

function operationLabel(status: string) {
  if (status === "OPEN") return "Open";
  if (status === "CLOSING") return "Closing";
  if (status === "CLOSED") return "Closed";
  return status;
}

function formatMoney(value: number) {
  return `UGX ${new Intl.NumberFormat("en-UG", {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

function formatClock(value: string) {
  return new Date(value).toLocaleTimeString("en-UG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-UG", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
