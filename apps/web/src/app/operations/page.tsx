"use client";

import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  ReceiptText,
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
  floatRemaining: number;
  processingFeesTotal: number;
  cashReturnedByAgents: number;
  agentsWithFloatCount: number;
  agentsReturnedCount: number;
  expectedAgentReturnTotal: number;
  agentReturnVariance: number;
  agentReturns: DailyOperationAgentReturn[];
  expensesCount: number;
  expensesTotal: number;
  expenses: DailyOperationExpense[];
  branchCashRemaining: number;
  expectedClosingBalance: number;
  closingBalance: number | null;
  closingVariance: number | null;
  closingNotes: string | null;
  loansIssuedCount: number;
  loansIssuedPrincipal: number;
  collectionsCount: number;
  collectionsReceived: number;
  notes: string | null;
};

type OperationCarryover = {
  id: string;
  branchId: string;
  branchName: string;
  operationDate: string;
  status: "OPEN" | "CLOSING" | "CLOSED";
  openedAt: string;
};

type ExpenseCategory =
  | "TRANSPORT"
  | "FUEL"
  | "MEALS"
  | "AIRTIME"
  | "MOBILE_MONEY_CHARGES"
  | "STATIONERY"
  | "REPAIRS"
  | "UTILITIES"
  | "OTHER";

type DailyOperationExpense = {
  id: string;
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  incurredAt: string;
  recordedByName: string;
  approvedAt: string | null;
  approvedByName: string | null;
};

type AgentReturnStatus = "PENDING" | "RETURNED" | "SHORT" | "OVER";

type DailyOperationAgentReturn = {
  floatId: string;
  agentId: string;
  agentName: string;
  agentPublicId: string | null;
  amountGiven: number;
  amountDisbursed: number;
  amountCollected: number;
  processingFees: number;
  expectedReturn: number;
  amountReturned: number | null;
  variance: number | null;
  returnedAt: string | null;
  returnedByName: string | null;
  notes: string | null;
  status: AgentReturnStatus;
};

type OperationResponse = {
  date: string;
  branch: OperationBranch | null;
  openingBalance: number | null;
  openingBalanceSource: "PREVIOUS_CLOSING" | "MANUAL";
  previousClosedOperation: OperationCarryover | null;
  pendingClosureOperation: OperationCarryover | null;
  operation: DailyOperation | null;
  message?: string | string[];
};

type OpeningForm = {
  openingBalance: string;
  cashAddedToday: string;
  floatSetAside: string;
  notes: string;
};

type ExpenseForm = {
  category: ExpenseCategory;
  amount: string;
  description: string;
};

type AgentReturnForm = {
  agentId: string;
  amountReturned: string;
  notes: string;
};

type ClosingForm = {
  countedCash: string;
  notes: string;
};

const emptyOpeningForm: OpeningForm = {
  openingBalance: "",
  cashAddedToday: "",
  floatSetAside: "",
  notes: "",
};

const emptyExpenseForm: ExpenseForm = {
  category: "TRANSPORT",
  amount: "",
  description: "",
};

const emptyAgentReturnForm: AgentReturnForm = {
  agentId: "",
  amountReturned: "",
  notes: "",
};

const emptyClosingForm: ClosingForm = {
  countedCash: "",
  notes: "",
};

const expenseCategoryOptions: ExpenseCategory[] = [
  "TRANSPORT",
  "FUEL",
  "MEALS",
  "AIRTIME",
  "MOBILE_MONEY_CHARGES",
  "STATIONERY",
  "REPAIRS",
  "UTILITIES",
  "OTHER",
];

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

function validDateInputValue(value: string | null) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
}

function initialOperationDate() {
  if (typeof window === "undefined") return todayInputValue();
  const queryDate = new URLSearchParams(window.location.search).get("date");
  return validDateInputValue(queryDate) ? queryDate! : todayInputValue();
}

export default function OperationsPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [date, setDate] = useState(initialOperationDate);
  const [data, setData] = useState<OperationResponse | null>(null);
  const [form, setForm] = useState<OpeningForm>(emptyOpeningForm);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpenseForm);
  const [agentReturnForm, setAgentReturnForm] =
    useState<AgentReturnForm>(emptyAgentReturnForm);
  const [closingForm, setClosingForm] = useState<ClosingForm>(emptyClosingForm);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [recordingExpense, setRecordingExpense] = useState(false);
  const [recordingAgentReturn, setRecordingAgentReturn] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canOpen = Boolean(session?.permissions.includes("operation.open"));
  const canRecordReturn = Boolean(
    session?.permissions.includes("operation.float.return"),
  );
  const canRecordExpense = Boolean(
    session?.permissions.includes("operation.expense.create"),
  );
  const canClose = Boolean(session?.permissions.includes("operation.close"));
  const activeBranch = data?.branch;
  const operation = data?.operation;
  const pendingClosureOperation = data?.pendingClosureOperation ?? null;
  const previousClosedOperation = data?.previousClosedOperation ?? null;
  const suggestedOpeningBalance = data?.openingBalance ?? null;
  const isToday = date === todayInputValue();
  const canFinishOpenOperation = Boolean(
    operation && operation.status === "OPEN",
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryDate = params.get("date");
    const prompt = params.get("prompt");
    if (validDateInputValue(queryDate)) {
      setDate((current) => (queryDate === current ? current : queryDate!));
    }
    if (prompt === "close") {
      setNotice("Close the previous branch day before opening a new day.");
    } else if (prompt === "open") {
      setNotice("Open today's branch before continuing.");
    }
  }, []);

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
        if (payload.pendingClosureOperation) {
          setNotice("Close the previous branch day before opening a new day.");
        }
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
    if (!isToday) {
      setError("Only today's records can be changed.");
      return;
    }
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
          floatSetAside: Number(form.floatSetAside),
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

  async function recordExpense() {
    if (!session || !activeBranch || recordingExpense) return;
    if (!canFinishOpenOperation) {
      setError("Only an open branch day can be changed.");
      return;
    }
    setRecordingExpense(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBaseUrl}/operations/expenses`, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchId: activeBranch.id,
          date,
          category: expenseForm.category,
          amount: Number(expenseForm.amount),
          description: expenseForm.description.trim() || undefined,
        }),
      });
      const payload = await readApiJson<OperationResponse>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setData(payload);
      setExpenseForm(emptyExpenseForm);
      setNotice("Expense recorded.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not record expense.",
      );
    } finally {
      setRecordingExpense(false);
    }
  }

  async function recordAgentReturn() {
    if (!session || !activeBranch || recordingAgentReturn) return;
    if (!canFinishOpenOperation) {
      setError("Only an open branch day can be changed.");
      return;
    }
    setRecordingAgentReturn(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBaseUrl}/operations/agent-returns`, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchId: activeBranch.id,
          date,
          agentId: agentReturnForm.agentId,
          amountReturned: Number(agentReturnForm.amountReturned),
          notes: agentReturnForm.notes.trim() || undefined,
        }),
      });
      const payload = await readApiJson<OperationResponse>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setData(payload);
      setAgentReturnForm(emptyAgentReturnForm);
      setNotice("Agent return recorded.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not record agent return.",
      );
    } finally {
      setRecordingAgentReturn(false);
    }
  }

  async function closeBranch() {
    if (!session || !activeBranch || closing) return;
    if (!canFinishOpenOperation) {
      setError("Only an open branch day can be closed.");
      return;
    }
    setClosing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBaseUrl}/operations/close`, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchId: activeBranch.id,
          date,
          countedCash: Number(closingForm.countedCash),
          notes: closingForm.notes.trim() || undefined,
        }),
      });
      const payload = await readApiJson<OperationResponse>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setData(payload);
      setClosingForm(emptyClosingForm);
      setNotice("Branch closed.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not close branch.",
      );
    } finally {
      setClosing(false);
    }
  }

  function goToPendingClosure() {
    if (!pendingClosureOperation) return;
    setNotice("Close this branch day before opening a new day.");
    setError(null);
    setForm(emptyOpeningForm);
    setExpenseForm(emptyExpenseForm);
    setAgentReturnForm(emptyAgentReturnForm);
    setClosingForm(emptyClosingForm);
    setDate(pendingClosureOperation.operationDate);
    router.replace(
      `/operations?date=${encodeURIComponent(
        pendingClosureOperation.operationDate,
      )}&prompt=close`,
    );
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
                  setError(null);
                  setForm(emptyOpeningForm);
                  setExpenseForm(emptyExpenseForm);
                  setAgentReturnForm(emptyAgentReturnForm);
                  setClosingForm(emptyClosingForm);
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
          <OpenOperationView
            operation={operation}
            editable={canFinishOpenOperation}
            canRecordReturn={canRecordReturn}
            canRecordExpense={canRecordExpense}
            canClose={canClose}
            agentReturnForm={agentReturnForm}
            closing={closing}
            closingForm={closingForm}
            expenseForm={expenseForm}
            recordingAgentReturn={recordingAgentReturn}
            recordingExpense={recordingExpense}
            setAgentReturnForm={setAgentReturnForm}
            setClosingForm={setClosingForm}
            setExpenseForm={setExpenseForm}
            onClose={() => void closeBranch()}
            onRecordAgentReturn={() => void recordAgentReturn()}
            onRecordExpense={() => void recordExpense()}
          />
        ) : pendingClosureOperation ? (
          <PendingClosureView
            pendingOperation={pendingClosureOperation}
            onReview={goToPendingClosure}
          />
        ) : (
          <OpeningView
            branch={activeBranch}
            canOpen={canOpen}
            editableDate={isToday}
            form={form}
            opening={opening}
            openingTotal={openingTotal}
            previousClosedOperation={previousClosedOperation}
            suggestedOpeningBalance={suggestedOpeningBalance}
            setForm={setForm}
            onOpen={() => void openBranch()}
          />
        )}
      </div>
    </AppShell>
  );
}

function PendingClosureView({
  pendingOperation,
  onReview,
}: {
  pendingOperation: OperationCarryover;
  onReview: () => void;
}) {
  return (
    <section className="panel overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_260px] lg:items-center">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-amber-700">
            Close Previous Day
          </p>
          <h2 className="mt-2 text-xl font-bold text-[var(--midnight-navy)]">
            Close {formatDateOnly(pendingOperation.operationDate)} first
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            This branch still has an open record from the previous day. Close it
            first so the next day starts with the correct opening balance.
          </p>
        </div>
        <div className="border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold text-amber-700">Open branch day</p>
          <p className="mt-1 text-lg font-bold text-[var(--midnight-navy)]">
            {formatDateOnly(pendingOperation.operationDate)}
          </p>
          <button
            type="button"
            onClick={onReview}
            className="btn btn-primary mt-4 h-9 w-full text-xs"
          >
            Close this day
          </button>
        </div>
      </div>
    </section>
  );
}

function OpeningView({
  branch,
  canOpen,
  editableDate,
  form,
  opening,
  openingTotal,
  previousClosedOperation,
  suggestedOpeningBalance,
  setForm,
  onOpen,
}: {
  branch: OperationBranch;
  canOpen: boolean;
  editableDate: boolean;
  form: OpeningForm;
  opening: boolean;
  openingTotal: number;
  previousClosedOperation: OperationCarryover | null;
  suggestedOpeningBalance: number | null;
  setForm: (next: OpeningForm) => void;
  onOpen: () => void;
}) {
  const valid =
    editableDate &&
    Number(form.openingBalance) >= 0 &&
    Number(form.cashAddedToday) >= 0 &&
    Number(form.floatSetAside) >= 0 &&
    Number(form.floatSetAside) <= openingTotal &&
    form.openingBalance !== "" &&
    form.cashAddedToday !== "" &&
    form.floatSetAside !== "";

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
            locked={!editableDate || suggestedOpeningBalance != null}
            onChange={(value) => setForm({ ...form, openingBalance: value })}
          />
          {suggestedOpeningBalance != null ? (
            <p className="self-end text-xs font-semibold leading-5 text-slate-500">
              From closing cash
              {previousClosedOperation
                ? ` on ${formatDateOnly(previousClosedOperation.operationDate)}`
                : ""}
              . This amount cannot be edited.
            </p>
          ) : null}
          <MoneyField
            label="Cash added today"
            value={form.cashAddedToday}
            locked={!editableDate}
            onChange={(value) => setForm({ ...form, cashAddedToday: value })}
          />
          <MoneyField
            label="Assignable float limit"
            value={form.floatSetAside}
            locked={!editableDate}
            onChange={(value) => setForm({ ...form, floatSetAside: value })}
          />
          <label className="sm:col-span-2">
            <span className="text-xs font-bold text-slate-600">Notes</span>
            <textarea
              value={form.notes}
              disabled={!editableDate}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
              rows={3}
              className="mt-1 w-full border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] disabled:bg-[var(--soft-mist)] disabled:text-slate-500"
            />
          </label>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] bg-[var(--soft-mist)] px-4 py-3">
          <div>
            <p className="text-sm font-bold tabular-nums text-[var(--midnight-navy)]">
              Available cash: {formatMoney(openingTotal)}
            </p>
            {form.floatSetAside !== "" &&
            Number(form.floatSetAside) > openingTotal ? (
              <p className="mt-1 text-xs font-semibold text-red-600">
                Assignable float limit cannot be more than available cash.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-primary h-9 text-xs"
            onClick={onOpen}
            disabled={!canOpen || !editableDate || !valid || opening}
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
          title={editableDate ? "Branch not open" : "Past day"}
          value={editableDate ? "Float locked" : "View only"}
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

function OpenOperationView({
  operation,
  editable,
  canRecordReturn,
  canRecordExpense,
  canClose,
  agentReturnForm,
  closing,
  closingForm,
  expenseForm,
  recordingAgentReturn,
  recordingExpense,
  setAgentReturnForm,
  setClosingForm,
  setExpenseForm,
  onClose,
  onRecordAgentReturn,
  onRecordExpense,
}: {
  operation: DailyOperation;
  editable: boolean;
  canRecordReturn: boolean;
  canRecordExpense: boolean;
  canClose: boolean;
  agentReturnForm: AgentReturnForm;
  closing: boolean;
  closingForm: ClosingForm;
  expenseForm: ExpenseForm;
  recordingAgentReturn: boolean;
  recordingExpense: boolean;
  setAgentReturnForm: (next: AgentReturnForm) => void;
  setClosingForm: (next: ClosingForm) => void;
  setExpenseForm: (next: ExpenseForm) => void;
  onClose: () => void;
  onRecordAgentReturn: () => void;
  onRecordExpense: () => void;
}) {
  const expenseAmount = Number(expenseForm.amount);
  const validExpense =
    canRecordExpense &&
    editable &&
    expenseForm.amount !== "" &&
    expenseAmount > 0 &&
    expenseAmount <= operation.branchCashRemaining;
  const allReturnsRecorded =
    operation.agentsReturnedCount === operation.agentsWithFloatCount;
  const cashPosition =
    operation.closingBalance ?? operation.branchCashRemaining;
  const cashPositionHint =
    operation.status === "CLOSED"
      ? "Closing balance"
      : "Float, returns, expenses";

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-6 gap-1 sm:gap-1.5 xl:gap-2">
        <OperationStat
          label="Expected closing"
          value={formatMoney(operation.expectedClosingBalance)}
          hint="Includes fees"
          tone="good"
          icon={<ShieldCheck className="size-4" />}
          featured
        />
        <OperationStat
          label="Available cash"
          value={formatMoney(operation.cashAvailableAtOpening)}
          hint="Opening + added"
          tone="blue"
        />
        <OperationStat
          label="Float limit"
          value={formatMoney(operation.floatSetAside)}
          hint={`${formatMoney(operation.floatIssued)} assigned`}
          tone="warn"
        />
        <OperationStat
          label="Returned cash"
          value={formatMoney(operation.cashReturnedByAgents)}
          hint={`${operation.agentsReturnedCount}/${operation.agentsWithFloatCount} agents`}
          tone="good"
        />
        <OperationStat
          label="Expenses"
          value={formatMoney(operation.expensesTotal)}
          hint={`${operation.expensesCount} recorded`}
          tone="bad"
          icon={<ReceiptText className="size-4" />}
        />
        <OperationStat
          label="Remaining cash"
          value={formatMoney(cashPosition)}
          hint={cashPositionHint}
          tone="blue"
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
              label="Assignable float limit"
              value={formatMoney(operation.floatSetAside)}
            />
            <DetailRow
              label="Float left for assigning"
              value={formatMoney(operation.floatRemaining)}
            />
            <DetailRow
              label="Float assigned"
              value={formatMoney(operation.floatIssued)}
            />
            <DetailRow
              label="Cash returned"
              value={formatMoney(operation.cashReturnedByAgents)}
            />
            <DetailRow
              label="Expenses"
              value={formatMoney(operation.expensesTotal)}
            />
            <DetailRow
              label="Collections"
              value={`${operation.collectionsCount} · ${formatMoney(
                operation.collectionsReceived,
              )}`}
            />
            <DetailRow
              label="Loans issued"
              value={`${operation.loansIssuedCount} · ${formatMoney(
                operation.loansIssuedPrincipal,
              )}`}
            />
            <DetailRow
              label="Loan processing fees"
              value={formatMoney(operation.processingFeesTotal)}
            />
            <DetailRow
              label="Expected closing"
              value={formatMoney(operation.expectedClosingBalance)}
            />
            {operation.closingBalance != null ? (
              <DetailRow
                label="Closing balance"
                value={formatMoney(operation.closingBalance)}
              />
            ) : null}
          </div>
          {operation.notes ? (
            <div className="border-t border-[var(--line)] px-4 py-3 text-sm text-slate-600">
              {operation.notes}
            </div>
          ) : null}
        </section>

        <aside className="space-y-3">
          {editable ? (
            <Link
              href="/agents"
              className="panel flex items-center justify-between gap-3 bg-white px-4 py-3 hover:bg-[var(--soft-mist)]"
            >
              <span>
                <span className="block text-sm font-bold text-[var(--midnight-navy)]">
                  Assign float
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Assignable left: {formatMoney(operation.floatRemaining)}
                </span>
              </span>
              <Send className="size-4 text-[var(--forest-emerald)]" />
            </Link>
          ) : (
            <StatusPanel
              icon={<LockKeyhole className="size-4" />}
              title="Past day"
              value="View only"
              tone="warn"
            />
          )}
          <ExpenseFormCard
            canRecordExpense={canRecordExpense}
            editable={editable}
            form={expenseForm}
            operation={operation}
            recording={recordingExpense}
            setForm={setExpenseForm}
            valid={validExpense}
            onRecord={onRecordExpense}
          />
          <CloseDayCard
            allReturnsRecorded={allReturnsRecorded}
            canClose={canClose}
            closing={closing}
            editable={editable}
            form={closingForm}
            operation={operation}
            setForm={setClosingForm}
            onClose={onClose}
          />
          <StatusPanel
            icon={<WalletCards className="size-4" />}
            title="Field work"
            value="Ready"
            tone="good"
          />
          <StatusPanel
            icon={<Banknote className="size-4" />}
            title="Cash position"
            value={formatMoney(cashPosition)}
            tone="blue"
          />
        </aside>
      </div>

      <AgentReturnsPanel
        canRecordReturn={canRecordReturn}
        editable={editable}
        form={agentReturnForm}
        operation={operation}
        recording={recordingAgentReturn}
        setForm={setAgentReturnForm}
        onRecord={onRecordAgentReturn}
      />
      <ExpenseList operation={operation} />
    </div>
  );
}

function AgentReturnsPanel({
  canRecordReturn,
  editable,
  form,
  operation,
  recording,
  setForm,
  onRecord,
}: {
  canRecordReturn: boolean;
  editable: boolean;
  form: AgentReturnForm;
  operation: DailyOperation;
  recording: boolean;
  setForm: (next: AgentReturnForm) => void;
  onRecord: () => void;
}) {
  const selectedReturn = operation.agentReturns.find(
    (agentReturn) => agentReturn.agentId === form.agentId,
  );
  const canSubmitReturn =
    editable &&
    canRecordReturn &&
    Boolean(selectedReturn) &&
    form.amountReturned !== "" &&
    Number(form.amountReturned) >= 0;

  return (
    <section className="panel overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
        <div>
          <p className="text-sm font-bold text-[var(--midnight-navy)]">
            Agent returns
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {operation.agentsReturnedCount} of {operation.agentsWithFloatCount}{" "}
            returned
          </p>
        </div>
        <span className="text-xs font-bold tabular-nums text-[var(--midnight-navy)]">
          {formatMoney(operation.cashReturnedByAgents)}
        </span>
      </header>
      {operation.agentReturns.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">
          No float has been assigned for this day.
        </div>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          <div className="hidden grid-cols-[minmax(0,1.1fr)_96px_96px_96px_90px_110px_90px] gap-3 bg-[#e5ece8] px-4 py-2.5 text-[10px] font-semibold text-slate-500 lg:grid">
            <span>Agent</span>
            <span className="text-right">Float</span>
            <span className="text-right">Loans</span>
            <span className="text-right">Collections</span>
            <span className="text-right">Fees</span>
            <span className="text-right">Expected</span>
            <span className="text-right">Return</span>
          </div>
          {operation.agentReturns.map((agentReturn) => {
            const selected = form.agentId === agentReturn.agentId;
            const returned = agentReturn.amountReturned != null;
            return (
              <div
                key={agentReturn.floatId}
                className="grid gap-3 px-4 py-3 text-sm text-[var(--midnight-navy)] lg:grid-cols-[minmax(0,1.1fr)_96px_96px_96px_90px_110px_90px] lg:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">{agentReturn.agentName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {agentReturn.agentPublicId ?? "No agent id"} ·{" "}
                    {returnStatusLabel(agentReturn.status)}
                  </p>
                </div>
                <MoneyCell value={agentReturn.amountGiven} />
                <MoneyCell value={agentReturn.amountDisbursed} />
                <MoneyCell value={agentReturn.amountCollected} />
                <MoneyCell value={agentReturn.processingFees} />
                <MoneyCell value={agentReturn.expectedReturn} strong />
                <div className="flex items-center justify-between gap-2 lg:justify-end">
                  {returned ? (
                    <span className="text-right">
                      <span className="block font-bold tabular-nums">
                        {formatCompactMoney(agentReturn.amountReturned ?? 0)}
                      </span>
                      <span
                        className={`mt-0.5 block text-[10px] font-semibold ${
                          (agentReturn.variance ?? 0) < 0
                            ? "text-red-600"
                            : (agentReturn.variance ?? 0) > 0
                              ? "text-amber-700"
                              : "text-[var(--forest-emerald)]"
                        }`}
                      >
                        {formatVariance(agentReturn.variance)}
                      </span>
                    </span>
                  ) : editable && canRecordReturn ? (
                    <button
                      type="button"
                      className="btn btn-ghost h-8 px-3 text-xs"
                      onClick={() =>
                        setForm({
                          agentId: agentReturn.agentId,
                          amountReturned: String(agentReturn.expectedReturn),
                          notes: "",
                        })
                      }
                    >
                      Record
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-slate-500">
                      Pending
                    </span>
                  )}
                </div>
                {selected && !returned ? (
                  <div className="grid gap-2 border-t border-[var(--line)] pt-3 lg:col-span-7 lg:grid-cols-[160px_minmax(0,1fr)_110px]">
                    <MoneyField
                      label="Returned cash"
                      value={form.amountReturned}
                      locked={!editable || !canRecordReturn}
                      onChange={(value) =>
                        setForm({ ...form, amountReturned: value })
                      }
                    />
                    <label>
                      <span className="text-xs font-bold text-slate-600">
                        Notes
                      </span>
                      <input
                        value={form.notes}
                        disabled={!editable || !canRecordReturn}
                        onChange={(event) =>
                          setForm({ ...form, notes: event.target.value })
                        }
                        className="mt-1 h-10 w-full border border-[var(--line)] bg-white px-3 text-sm text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] disabled:bg-[var(--soft-mist)] disabled:text-slate-500"
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary mt-5 h-10 text-xs lg:mt-6"
                      disabled={!canSubmitReturn || recording}
                      onClick={onRecord}
                    >
                      {recording ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-3.5" />
                      )}
                      Save
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CloseDayCard({
  allReturnsRecorded,
  canClose,
  closing,
  editable,
  form,
  operation,
  setForm,
  onClose,
}: {
  allReturnsRecorded: boolean;
  canClose: boolean;
  closing: boolean;
  editable: boolean;
  form: ClosingForm;
  operation: DailyOperation;
  setForm: (next: ClosingForm) => void;
  onClose: () => void;
}) {
  const countedCash = Number(form.countedCash || 0);
  const variance =
    form.countedCash === ""
      ? null
      : Math.round((countedCash - operation.expectedClosingBalance) * 100) /
        100;
  const needsNote = variance != null && variance !== 0;
  const canSubmit =
    editable &&
    canClose &&
    allReturnsRecorded &&
    form.countedCash !== "" &&
    (!needsNote || form.notes.trim().length > 0);

  if (operation.status === "CLOSED") {
    return (
      <section className="panel bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
        <header className="border-b border-[var(--line)] px-4 py-3">
          <p className="text-sm font-bold text-[var(--midnight-navy)]">
            Closed
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {operation.closedAt ? formatDateTime(operation.closedAt) : ""}
          </p>
        </header>
        <div className="space-y-2 p-4">
          <DetailRow
            label="Closing balance"
            value={formatMoney(operation.closingBalance ?? 0)}
          />
          <DetailRow
            label="Variance"
            value={formatVariance(operation.closingVariance)}
          />
          {operation.closingNotes ? (
            <p className="text-xs text-slate-600">{operation.closingNotes}</p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="panel bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
      <header className="border-b border-[var(--line)] px-4 py-3">
        <p className="text-sm font-bold text-[var(--midnight-navy)]">
          Close day
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Expected: {formatMoney(operation.expectedClosingBalance)}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Loan processing fees: {formatMoney(operation.processingFeesTotal)}
        </p>
      </header>
      <div className="space-y-3 p-4">
        {!allReturnsRecorded ? (
          <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            Record all agent returns first.
          </p>
        ) : null}
        <MoneyField
          label="Counted cash"
          value={form.countedCash}
          locked={!editable || !canClose}
          onChange={(value) => setForm({ ...form, countedCash: value })}
        />
        <button
          type="button"
          className="btn btn-ghost h-8 w-full text-xs"
          disabled={!editable || !canClose}
          onClick={() =>
            setForm({
              ...form,
              countedCash: String(operation.expectedClosingBalance),
            })
          }
        >
          Use expected cash
        </button>
        {variance != null ? (
          <p
            className={`text-xs font-bold ${
              variance === 0
                ? "text-[var(--forest-emerald)]"
                : variance < 0
                  ? "text-red-600"
                  : "text-amber-700"
            }`}
          >
            Variance: {formatVariance(variance)}
          </p>
        ) : null}
        <label>
          <span className="text-xs font-bold text-slate-600">Notes</span>
          <textarea
            value={form.notes}
            disabled={!editable || !canClose}
            onChange={(event) =>
              setForm({ ...form, notes: event.target.value })
            }
            rows={2}
            className="mt-1 w-full border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] disabled:bg-[var(--soft-mist)] disabled:text-slate-500"
          />
        </label>
      </div>
      <footer className="border-t border-[var(--line)] bg-[var(--soft-mist)] px-4 py-3">
        <button
          type="button"
          className="btn btn-primary h-9 w-full text-xs"
          disabled={!canSubmit || closing}
          onClick={onClose}
        >
          {closing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="size-3.5" />
          )}
          Close day
        </button>
      </footer>
    </section>
  );
}

function ExpenseFormCard({
  canRecordExpense,
  editable,
  form,
  operation,
  recording,
  setForm,
  valid,
  onRecord,
}: {
  canRecordExpense: boolean;
  editable: boolean;
  form: ExpenseForm;
  operation: DailyOperation;
  recording: boolean;
  setForm: (next: ExpenseForm) => void;
  valid: boolean;
  onRecord: () => void;
}) {
  return (
    <section className="panel bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
      <header className="border-b border-[var(--line)] px-4 py-3">
        <p className="text-sm font-bold text-[var(--midnight-navy)]">
          Record expense
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Remaining cash: {formatMoney(operation.branchCashRemaining)}
        </p>
      </header>
      <div className="space-y-3 p-4">
        {!editable ? (
          <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            Past days can be viewed only.
          </p>
        ) : !canRecordExpense ? (
          <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            Your account cannot record expenses.
          </p>
        ) : null}
        <label>
          <span className="text-xs font-bold text-slate-600">Category</span>
          <select
            value={form.category}
            disabled={!editable || !canRecordExpense}
            onChange={(event) =>
              setForm({
                ...form,
                category: event.target.value as ExpenseCategory,
              })
            }
            className="mt-1 h-10 w-full border border-[var(--line)] bg-white px-3 text-sm font-semibold text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] disabled:bg-[var(--soft-mist)] disabled:text-slate-500"
          >
            {expenseCategoryOptions.map((category) => (
              <option key={category} value={category}>
                {categoryLabel(category)}
              </option>
            ))}
          </select>
        </label>
        <MoneyField
          label="Amount"
          value={form.amount}
          locked={!editable || !canRecordExpense}
          onChange={(value) => setForm({ ...form, amount: value })}
        />
        <label>
          <span className="text-xs font-bold text-slate-600">Description</span>
          <textarea
            value={form.description}
            disabled={!editable || !canRecordExpense}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
            rows={3}
            className="mt-1 w-full border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] disabled:bg-[var(--soft-mist)] disabled:text-slate-500"
          />
        </label>
      </div>
      <footer className="border-t border-[var(--line)] bg-[var(--soft-mist)] px-4 py-3">
        <button
          type="button"
          className="btn btn-primary h-9 w-full text-xs"
          disabled={!valid || recording}
          onClick={onRecord}
        >
          {recording ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ReceiptText className="size-3.5" />
          )}
          Record expense
        </button>
      </footer>
    </section>
  );
}

function ExpenseList({ operation }: { operation: DailyOperation }) {
  return (
    <section className="panel overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <p className="text-sm font-bold text-[var(--midnight-navy)]">
          Expenses
        </p>
        <span className="text-xs font-bold tabular-nums text-[var(--midnight-navy)]">
          {formatMoney(operation.expensesTotal)}
        </span>
      </header>
      {operation.expenses.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">
          No expenses recorded for this day.
        </div>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          <div className="hidden grid-cols-[minmax(0,1.25fr)_120px_140px_160px] gap-3 bg-[#e5ece8] px-4 py-2.5 text-[10px] font-semibold text-slate-500 sm:grid">
            <span>Category</span>
            <span className="text-right">Amount</span>
            <span>Recorded by</span>
            <span>Time</span>
          </div>
          {operation.expenses.map((expense) => (
            <div
              key={expense.id}
              className="grid grid-cols-[minmax(0,1fr)_96px] gap-3 px-4 py-3 text-sm text-[var(--midnight-navy)] sm:grid-cols-[minmax(0,1.25fr)_120px_140px_160px]"
            >
              <span className="min-w-0">
                <span className="block truncate font-bold">
                  {categoryLabel(expense.category)}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  {expense.description || "No description"}
                </span>
              </span>
              <span className="text-right font-bold tabular-nums">
                {formatMoney(expense.amount)}
              </span>
              <span className="truncate text-xs text-slate-600">
                {expense.recordedByName}
              </span>
              <span className="text-xs text-slate-600">
                {formatDateTime(expense.incurredAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
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

function MoneyCell({
  value,
  strong = false,
}: {
  value: number;
  strong?: boolean;
}) {
  return (
    <span
      className={`flex justify-between gap-2 tabular-nums lg:block lg:text-right ${
        strong ? "font-bold" : "font-semibold"
      }`}
    >
      <span className="text-xs text-slate-500 lg:hidden">
        {strong ? "Expected" : "Amount"}
      </span>
      {formatCompactMoney(value)}
    </span>
  );
}

function OperationStat({
  icon,
  label,
  value,
  hint,
  tone,
  featured = false,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "good" | "blue" | "warn" | "bad";
  featured?: boolean;
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-100 bg-emerald-50 text-[var(--forest-emerald)]"
      : tone === "blue"
        ? "border-sky-100 bg-sky-50 text-sky-700"
        : tone === "warn"
          ? "border-amber-100 bg-amber-50 text-amber-700"
          : "border-rose-100 bg-rose-50 text-rose-700";
  const articleClass = featured
    ? "panel flex min-h-[78px] min-w-0 items-start gap-1.5 border-2 border-emerald-300 bg-emerald-50 px-1.5 py-2 shadow-[0_12px_28px_rgba(15,118,87,0.16)] sm:gap-2 sm:px-2 xl:px-3"
    : "panel flex min-h-[76px] min-w-0 items-start gap-1.5 bg-white px-1.5 py-2 shadow-[0_8px_20px_rgba(20,33,61,0.05)] sm:gap-2 sm:px-2 xl:px-3";

  return (
    <article className={articleClass}>
      <span
        className={`hidden size-7 shrink-0 place-items-center border md:grid xl:size-8 ${toneClass}`}
      >
        {icon ?? <Banknote className="size-4" />}
      </span>
      <div className="min-w-0">
        <p className="text-[8px] font-semibold tracking-[0.06em] text-slate-500 sm:text-[9px] xl:text-[10px]">
          {label}
        </p>
        <p
          className={`mt-1 break-words font-bold leading-tight tabular-nums ${
            featured
              ? "text-[clamp(0.6rem,1.25vw,1.1rem)] text-[var(--forest-emerald)]"
              : "text-[clamp(0.55rem,1.15vw,1rem)] text-[var(--midnight-navy)]"
          }`}
        >
          {value}
        </p>
        <p className="mt-0.5 break-words text-[clamp(0.5rem,0.9vw,0.7rem)] leading-tight text-slate-500">
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

function returnStatusLabel(status: AgentReturnStatus) {
  if (status === "PENDING") return "Pending";
  if (status === "RETURNED") return "Returned";
  if (status === "SHORT") return "Short";
  if (status === "OVER") return "Over";
  return status;
}

function categoryLabel(category: ExpenseCategory) {
  return category
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCompactMoney(value: number) {
  return new Intl.NumberFormat("en-UG", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMoney(value: number) {
  return `UGX ${formatCompactMoney(value)}`;
}

function formatVariance(value: number | null) {
  if (value == null) return "Not set";
  if (value === 0) return "Balanced";
  const absolute = formatMoney(Math.abs(value));
  return value < 0 ? `Short ${absolute}` : `Over ${absolute}`;
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

function formatDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}
