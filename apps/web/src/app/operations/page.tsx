"use client";

import {
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  Loader2,
  LockKeyhole,
  PlusCircle,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  UserRoundPlus,
  WalletCards,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { Worksheet } from "exceljs";
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
  closedByName: string | null;
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
  topUpsCount: number;
  topUpsTotal: number;
  topUps: DailyOperationTopUp[];
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

type OperationReportStatus =
  "MANAGER_REVIEW" | "SENT_TO_OWNER" | "OWNER_APPROVED" | "RETURNED_TO_MANAGER";

type DailyOperationReport = {
  id: string;
  operationId: string;
  reportNumber: string;
  operationDate: string;
  status: OperationReportStatus;
  generatedAt: string;
  managerReviewedAt: string | null;
  managerReviewedByName: string | null;
  managerNotes: string | null;
  ownerApprovedAt: string | null;
  ownerApprovedByName: string | null;
  ownerNotes: string | null;
  returnedAt: string | null;
  returnedByName: string | null;
  returnNotes: string | null;
  snapshot: unknown;
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

type DailyOperationTopUp = {
  id: string;
  amount: number;
  description: string | null;
  addedAt: string;
  recordedByName: string;
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
  report: DailyOperationReport | null;
  message?: string | string[];
};

type OperationAgentRow = {
  id: string;
  publicId: string | null;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  floatToday: number | null;
};

type AgentsResponse = {
  agents: OperationAgentRow[];
  message?: string | string[];
};

type OpeningForm = {
  openingBalance: string;
  cashAddedToday: string;
  floatSetAside: string;
  notes: string;
};

type TopUpForm = {
  amount: string;
  description: string;
};

type ExpenseForm = {
  category: ExpenseCategory;
  amount: string;
  description: string;
};

type FloatForm = {
  agentId: string;
  amount: string;
  notes: string;
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

type OperationActionPanel =
  | "top-up"
  | "expense"
  | "issue-float"
  | "add-float"
  | "agent-return"
  | "close-day"
  | null;

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

const emptyTopUpForm: TopUpForm = {
  amount: "",
  description: "",
};

const emptyAgentReturnForm: AgentReturnForm = {
  agentId: "",
  amountReturned: "",
  notes: "",
};

const emptyFloatForm: FloatForm = {
  agentId: "",
  amount: "",
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
  const [reportBranches, setReportBranches] = useState<OperationBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [agents, setAgents] = useState<OperationAgentRow[]>([]);
  const [form, setForm] = useState<OpeningForm>(emptyOpeningForm);
  const [topUpForm, setTopUpForm] = useState<TopUpForm>(emptyTopUpForm);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpenseForm);
  const [floatForm, setFloatForm] = useState<FloatForm>(emptyFloatForm);
  const [floatTopUpForm, setFloatTopUpForm] =
    useState<FloatForm>(emptyFloatForm);
  const [agentReturnForm, setAgentReturnForm] =
    useState<AgentReturnForm>(emptyAgentReturnForm);
  const [closingForm, setClosingForm] = useState<ClosingForm>(emptyClosingForm);
  const [reportView, setReportView] = useState<"report" | "excel">("report");
  const [managerReportNotes, setManagerReportNotes] = useState("");
  const [ownerReportNotes, setOwnerReportNotes] = useState("");
  const [activePanel, setActivePanel] = useState<OperationActionPanel>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [opening, setOpening] = useState(false);
  const [recordingTopUp, setRecordingTopUp] = useState(false);
  const [savingFloat, setSavingFloat] = useState(false);
  const [savingFloatTopUp, setSavingFloatTopUp] = useState(false);
  const [recordingExpense, setRecordingExpense] = useState(false);
  const [recordingAgentReturn, setRecordingAgentReturn] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reviewingReport, setReviewingReport] = useState(false);
  const [approvingReport, setApprovingReport] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const operatorRole = useMemo(
    () => (session ? resolveOperatorRole(session, user) : "staff"),
    [session, user],
  );
  const canOperateBranch = operatorRole === "manager";
  const canOpen = Boolean(
    canOperateBranch && session?.permissions.includes("operation.open"),
  );
  const canRecordReturn = Boolean(
    canOperateBranch && session?.permissions.includes("operation.float.return"),
  );
  const canRecordExpense = Boolean(
    canOperateBranch &&
    session?.permissions.includes("operation.expense.create"),
  );
  const canRecordTopUp = Boolean(
    canOperateBranch &&
    (session?.permissions.includes("operation.cash.topup") ||
      session?.permissions.includes("operation.open")),
  );
  const canManageFloat = Boolean(
    canOperateBranch && session?.permissions.includes("operation.float.manage"),
  );
  const canClose = Boolean(
    canOperateBranch && session?.permissions.includes("operation.close"),
  );
  const canReviewReport = Boolean(
    canOperateBranch &&
    session?.permissions.includes("operation.report.review"),
  );
  const canApproveReport = Boolean(
    session?.permissions.includes("operation.approve") &&
    session?.permissions.includes("branch.create"),
  );
  const activeBranch = data?.branch;
  const operation = data?.operation;
  const report = data?.report ?? null;
  const selectedReportBranch =
    reportBranches.find((item) => item.id === selectedBranchId) ?? activeBranch;
  const pendingClosureOperation = data?.pendingClosureOperation ?? null;
  const previousClosedOperation = data?.previousClosedOperation ?? null;
  const suggestedOpeningBalance = data?.openingBalance ?? null;
  const isToday = date === todayInputValue();
  const canFinishOpenOperation = Boolean(
    canOperateBranch && operation && operation.status === "OPEN",
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

  const loadAgentsForDay = useCallback(
    async (activeSession: RembehSession, selectedDate: string) => {
      setLoadingAgents(true);
      try {
        const response = await fetch(
          `${apiBaseUrl}/agents?date=${encodeURIComponent(selectedDate)}`,
          {
            headers: {
              Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
            },
          },
        );
        const payload = await readApiJson<AgentsResponse>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        const nextAgents = payload.agents ?? [];
        setAgents(nextAgents);
        setFloatForm((current) => ({
          ...current,
          agentId:
            current.agentId &&
            nextAgents.some(
              (agent) =>
                agent.id === current.agentId && agent.floatToday == null,
            )
              ? current.agentId
              : (nextAgents.find((agent) => agent.floatToday == null)?.id ??
                ""),
        }));
      } catch {
        setAgents([]);
      } finally {
        setLoadingAgents(false);
      }
    },
    [],
  );

  const loadBranchesForReports = useCallback(
    async (activeSession: RembehSession) => {
      const response = await fetch(`${apiBaseUrl}/branches`, {
        headers: {
          Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
        },
      });
      const payload = await readApiJson<{
        branches?: OperationBranch[];
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      const branches = payload.branches ?? [];
      setReportBranches(branches);
      return branches;
    },
    [],
  );

  const loadOperation = useCallback(
    async (
      activeSession: RembehSession,
      selectedDate: string,
      branchId?: string,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ date: selectedDate });
        if (branchId) params.set("branchId", branchId);
        const response = await fetch(
          `${apiBaseUrl}/operations/today?${params.toString()}`,
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
      void (async () => {
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

        if (role === "owner") {
          try {
            const branches = await loadBranchesForReports(auth.session);
            const branchId = selectedBranchId || branches[0]?.id || "";
            if (branchId && branchId !== selectedBranchId) {
              setSelectedBranchId(branchId);
            }
            if (!branchId) {
              setData(null);
              setAgents([]);
              setLoading(false);
              return;
            }
            await loadOperation(auth.session, date, branchId);
          } catch (caught) {
            setError(
              caught instanceof Error
                ? caught.message
                : "Could not load operation reports.",
            );
            setLoading(false);
          }
          return;
        }

        setReportBranches([]);
        setSelectedBranchId("");
        void Promise.all([
          loadOperation(auth.session, date),
          loadAgentsForDay(auth.session, date),
        ]);
      })();
    }, 0);

    return () => window.clearTimeout(boot);
  }, [
    router,
    date,
    selectedBranchId,
    loadOperation,
    loadAgentsForDay,
    loadBranchesForReports,
  ]);

  const openingTotal = useMemo(
    () => Number(form.openingBalance || 0) + Number(form.cashAddedToday || 0),
    [form.cashAddedToday, form.openingBalance],
  );

  const pendingAgentReturns = useMemo(
    () =>
      (operation?.agentReturns ?? []).filter(
        (agentReturn) => agentReturn.amountReturned == null,
      ),
    [operation?.agentReturns],
  );
  const addFloatOptions = pendingAgentReturns.filter(
    (agentReturn) => agentReturn.amountGiven > 0,
  );
  const assignableAgents = useMemo(
    () =>
      agents.filter(
        (agent) => agent.floatToday == null && agent.status === "ACTIVE",
      ),
    [agents],
  );
  const floatAmount = Number(floatForm.amount);
  const extraFloatAmount = Number(floatTopUpForm.amount);
  const floatAmountValid =
    floatForm.amount !== "" && Number.isFinite(floatAmount) && floatAmount > 0;
  const extraFloatAmountValid =
    floatTopUpForm.amount !== "" &&
    Number.isFinite(extraFloatAmount) &&
    extraFloatAmount > 0;
  const canSubmitFloat =
    canManageFloat &&
    canFinishOpenOperation &&
    Boolean(floatForm.agentId) &&
    floatAmountValid &&
    Boolean(operation) &&
    floatAmount <= (operation?.floatRemaining ?? 0);
  const canSubmitFloatTopUp =
    canManageFloat &&
    canFinishOpenOperation &&
    Boolean(floatTopUpForm.agentId) &&
    extraFloatAmountValid &&
    Boolean(operation) &&
    extraFloatAmount <= (operation?.floatRemaining ?? 0);

  function openActionPanel(panel: Exclude<OperationActionPanel, null>) {
    setError(null);
    setNotice(null);
    if (panel === "issue-float") {
      setFloatForm((current) => ({
        ...current,
        agentId:
          current.agentId ||
          assignableAgents.find((agent) => agent.status === "ACTIVE")?.id ||
          assignableAgents[0]?.id ||
          "",
      }));
    }
    if (panel === "add-float") {
      setFloatTopUpForm((current) => ({
        ...current,
        agentId: current.agentId || addFloatOptions[0]?.agentId || "",
      }));
    }
    if (panel === "agent-return") {
      const first = pendingAgentReturns[0];
      setAgentReturnForm((current) => ({
        ...current,
        agentId: current.agentId || first?.agentId || "",
        amountReturned:
          current.amountReturned || (first ? String(first.expectedReturn) : ""),
      }));
    }
    if (panel === "close-day" && operation) {
      setClosingForm((current) => ({
        ...current,
        countedCash:
          current.countedCash || String(operation.expectedClosingBalance),
      }));
    }
    setActivePanel(panel);
  }

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

  async function recordTopUp() {
    if (!session || !activeBranch || recordingTopUp) return;
    if (!canFinishOpenOperation) {
      setError("Only an open branch day can be changed.");
      return;
    }
    const amount = Number(topUpForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid top-up amount.");
      return;
    }
    setRecordingTopUp(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBaseUrl}/operations/top-ups`, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchId: activeBranch.id,
          date,
          amount,
          description: topUpForm.description.trim() || undefined,
        }),
      });
      const payload = await readApiJson<OperationResponse>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setData(payload);
      setTopUpForm(emptyTopUpForm);
      setActivePanel(null);
      setNotice("Top-up added.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not add cash.",
      );
    } finally {
      setRecordingTopUp(false);
    }
  }

  async function saveFloat(mode: "issue" | "add") {
    if (!session || savingFloat || savingFloatTopUp) return;
    if (!canFinishOpenOperation) {
      setError("Only an open branch day can be changed.");
      return;
    }
    const targetForm = mode === "issue" ? floatForm : floatTopUpForm;
    if (!targetForm.agentId) {
      setError("Choose an agent.");
      return;
    }
    const amount = Number(targetForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid float amount.");
      return;
    }
    if (operation && amount > operation.floatRemaining) {
      setError(
        `Float exceeds assignable float left. Available: ${formatMoney(
          operation.floatRemaining,
        )}.`,
      );
      return;
    }

    const savingSetter =
      mode === "issue" ? setSavingFloat : setSavingFloatTopUp;
    savingSetter(true);
    setError(null);
    setNotice(null);
    try {
      const path =
        mode === "issue"
          ? `${apiBaseUrl}/agents/${targetForm.agentId}/floats`
          : `${apiBaseUrl}/agents/${targetForm.agentId}/floats/top-ups`;
      const response = await fetch(path, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amountGiven: amount,
          date,
          notes: targetForm.notes.trim() || undefined,
        }),
      });
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      await Promise.all([
        loadOperation(session, date),
        loadAgentsForDay(session, date),
      ]);
      if (mode === "issue") {
        setFloatForm(emptyFloatForm);
        setNotice("Float issued.");
      } else {
        setFloatTopUpForm(emptyFloatForm);
        setNotice("More float added.");
      }
      setActivePanel(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save float.",
      );
    } finally {
      savingSetter(false);
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
      setActivePanel(null);
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
      setActivePanel(null);
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
      setActivePanel(null);
      setNotice("Branch closed.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not close branch.",
      );
    } finally {
      setClosing(false);
    }
  }

  async function managerConfirmReport() {
    if (!session || !report || reviewingReport) return;
    setReviewingReport(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/operations/reports/${report.id}/manager-confirm`,
        {
          method: "POST",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            notes: managerReportNotes.trim() || undefined,
          }),
        },
      );
      const payload = await readApiJson<OperationResponse>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setData(payload);
      setManagerReportNotes("");
      setNotice("Report sent to owner.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not send report to owner.",
      );
    } finally {
      setReviewingReport(false);
    }
  }

  async function ownerApproveReport() {
    if (!session || !report || approvingReport) return;
    setApprovingReport(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/operations/reports/${report.id}/owner-approve`,
        {
          method: "POST",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            notes: ownerReportNotes.trim() || undefined,
          }),
        },
      );
      const payload = await readApiJson<OperationResponse>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setData(payload);
      setOwnerReportNotes("");
      setNotice("Report approved.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not approve report.",
      );
    } finally {
      setApprovingReport(false);
    }
  }

  async function exportDailyOperationReport() {
    if (!operation || !report || exportingReport) return;
    setExportingReport(true);
    setError(null);
    setNotice(null);

    try {
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      const exportedAt = new Date();
      const currency = workspace?.currency ?? "UGX";
      const reportRows = buildExcelRows(operation);
      const headers = [
        "Section",
        "Description",
        "Count",
        "Cash In",
        "Cash Out",
        "Balance",
        "Notes",
      ];

      workbook.creator = "REMBEH";
      workbook.created = exportedAt;
      workbook.modified = exportedAt;

      const worksheet = workbook.addWorksheet("Daily Report");
      worksheet.addRow(["REMBEH Daily Operations Report"]);
      worksheet.mergeCells(1, 1, 1, headers.length);
      worksheet.addRow([
        `${workspace?.name ?? "Account"} · ${operation.branchName}`,
      ]);
      worksheet.mergeCells(2, 1, 2, headers.length);
      worksheet.addRow([
        `${report.reportNumber} · ${formatDateOnly(report.operationDate)} · ${reportStatusLabel(report.status)} · Exported ${formatDateTime(exportedAt.toISOString())}`,
      ]);
      worksheet.mergeCells(3, 1, 3, headers.length);
      worksheet.addRow([
        "Expected close",
        operation.expectedClosingBalance,
        "Counted cash",
        operation.closingBalance ?? 0,
        "Variance",
        operation.closingVariance ?? 0,
        "Loans issued",
        operation.loansIssuedCount,
      ]);
      worksheet.addRow([]);

      const headerRow = worksheet.addRow(headers);
      reportRows.forEach((row) => {
        worksheet.addRow([
          row.section,
          row.description,
          row.count,
          row.cashIn ?? "",
          row.cashOut ?? "",
          row.balance ?? "",
          row.note,
        ]);
      });

      const totalsRow = worksheet.addRow([
        "Closing",
        "Final report totals",
        "",
        operation.cashReturnedByAgents +
          operation.collectionsReceived +
          operation.processingFeesTotal,
        operation.floatIssued +
          operation.expensesTotal +
          operation.loansIssuedPrincipal,
        operation.expectedClosingBalance,
        formatVariance(operation.closingVariance),
      ]);

      worksheet.columns = [
        { width: 18 },
        { width: 30 },
        { width: 12 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 24 },
      ];
      worksheet.views = [{ state: "frozen", ySplit: headerRow.number }];
      worksheet.autoFilter = {
        from: { row: headerRow.number, column: 1 },
        to: { row: headerRow.number, column: headers.length },
      };

      styleReportWorksheet(
        worksheet,
        headerRow.number,
        totalsRow.number,
        currency,
      );

      const agentSheet = workbook.addWorksheet("Agent Handover");
      const agentHeaders = [
        "Agent",
        "Agent Id",
        "Float Received",
        "Loans Issued",
        "Collections",
        "Processing Fees",
        "Expected Handover",
        "Returned Cash",
        "Variance",
        "Status",
      ];
      const agentHeaderRow = agentSheet.addRow(agentHeaders);
      operation.agentReturns.forEach((agentReturn) => {
        agentSheet.addRow([
          agentReturn.agentName,
          agentReturn.agentPublicId ?? "",
          agentReturn.amountGiven,
          agentReturn.amountDisbursed,
          agentReturn.amountCollected,
          agentReturn.processingFees,
          agentReturn.expectedReturn,
          agentReturn.amountReturned ?? "",
          agentReturn.variance ?? "",
          returnStatusLabel(agentReturn.status),
        ]);
      });
      agentSheet.columns = [
        { width: 24 },
        { width: 14 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 18 },
        { width: 16 },
        { width: 14 },
        { width: 14 },
      ];
      styleTableSheet(
        agentSheet,
        agentHeaderRow.number,
        currency,
        [3, 4, 5, 6, 7, 8, 9],
      );

      const recordsSheet = workbook.addWorksheet("Records");
      const recordsHeaderRow = recordsSheet.addRow([
        "Type",
        "Description",
        "Amount",
        "Time",
        "Recorded By",
      ]);
      operation.topUps.forEach((topUp) => {
        recordsSheet.addRow([
          "Top-up",
          topUp.description || "Cash top-up",
          topUp.amount,
          formatDateTime(topUp.addedAt),
          topUp.recordedByName,
        ]);
      });
      operation.expenses.forEach((expense) => {
        recordsSheet.addRow([
          "Expense",
          `${categoryLabel(expense.category)}${expense.description ? ` · ${expense.description}` : ""}`,
          expense.amount,
          formatDateTime(expense.incurredAt),
          expense.recordedByName,
        ]);
      });
      recordsSheet.columns = [
        { width: 14 },
        { width: 42 },
        { width: 16 },
        { width: 22 },
        { width: 22 },
      ];
      styleTableSheet(recordsSheet, recordsHeaderRow.number, currency, [3]);

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFileName(
        `${workspace?.name ?? "rembeh"}-${operation.branchName}-${report.reportNumber}`,
      )}-${formatFileDate(exportedAt)}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Report exported.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not export report.",
      );
    } finally {
      setExportingReport(false);
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
      branch={operatorRole === "manager" ? branch : null}
    >
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[var(--forest-emerald)]">
              {operatorRole === "owner"
                ? "Operation Reports"
                : "Daily Operations"}
            </p>
            <h1 className="text-xl font-bold text-[var(--midnight-navy)]">
              {selectedReportBranch?.name ?? "Operations Hub"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {operatorRole === "owner" ? (
              <label className="flex h-9 items-center gap-2 border border-[var(--line)] bg-white px-2 text-xs font-bold text-[var(--midnight-navy)]">
                <Building2 className="size-3.5 text-slate-400" />
                <select
                  value={selectedBranchId}
                  onChange={(event) => {
                    setNotice(null);
                    setError(null);
                    setData(null);
                    setSelectedBranchId(event.target.value);
                  }}
                  className="min-w-[180px] bg-transparent outline-none"
                >
                  {reportBranches.length === 0 ? (
                    <option value="">No branches</option>
                  ) : null}
                  {reportBranches.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="flex h-9 items-center gap-2 border border-[var(--line)] bg-white px-2 text-xs font-bold text-[var(--midnight-navy)]">
              <CalendarDays className="size-3.5 text-slate-400" />
              <input
                type="date"
                value={date}
                onChange={(event) => {
                  setNotice(null);
                  setError(null);
                  setForm(emptyOpeningForm);
                  setTopUpForm(emptyTopUpForm);
                  setExpenseForm(emptyExpenseForm);
                  setFloatForm(emptyFloatForm);
                  setFloatTopUpForm(emptyFloatForm);
                  setAgentReturnForm(emptyAgentReturnForm);
                  setClosingForm(emptyClosingForm);
                  setManagerReportNotes("");
                  setOwnerReportNotes("");
                  setActivePanel(null);
                  setDate(event.target.value);
                }}
                className="bg-transparent outline-none"
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost h-9 text-xs"
              onClick={() =>
                void (operatorRole === "owner"
                  ? loadOperation(session, date, selectedBranchId)
                  : Promise.all([
                      loadOperation(session, date),
                      loadAgentsForDay(session, date),
                    ]))
              }
              disabled={
                loading || (operatorRole === "owner" && !selectedBranchId)
              }
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
            {operatorRole === "owner"
              ? "Create a branch before viewing operation reports."
              : "Create a branch before starting daily operations."}
          </div>
        ) : operatorRole === "owner" && !operation ? (
          <OwnerOperationEmptyView
            branch={activeBranch}
            date={date}
            pendingOperation={pendingClosureOperation}
          />
        ) : operation ? (
          <OpenOperationView
            operation={operation}
            canOperateBranch={canOperateBranch}
            editable={canFinishOpenOperation}
            canRecordTopUp={canRecordTopUp}
            canRecordReturn={canRecordReturn}
            canRecordExpense={canRecordExpense}
            canManageFloat={canManageFloat}
            canClose={canClose}
            loadingAgents={loadingAgents}
            pendingReturnsCount={pendingAgentReturns.length}
            assignableAgentsCount={assignableAgents.length}
            addFloatAgentsCount={addFloatOptions.length}
            report={report}
            reportView={reportView}
            canReviewReport={canReviewReport}
            canApproveReport={canApproveReport}
            managerReportNotes={managerReportNotes}
            ownerReportNotes={ownerReportNotes}
            reviewingReport={reviewingReport}
            approvingReport={approvingReport}
            exportingReport={exportingReport}
            setReportView={setReportView}
            setManagerReportNotes={setManagerReportNotes}
            setOwnerReportNotes={setOwnerReportNotes}
            onManagerConfirmReport={() => void managerConfirmReport()}
            onOwnerApproveReport={() => void ownerApproveReport()}
            onExportReport={() => void exportDailyOperationReport()}
            onAction={openActionPanel}
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
        <OperationActionDrawer
          panel={activePanel}
          operation={operation}
          assignableAgents={assignableAgents}
          addFloatOptions={addFloatOptions}
          pendingAgentReturns={pendingAgentReturns}
          editable={canFinishOpenOperation}
          canRecordTopUp={canRecordTopUp}
          canRecordExpense={canRecordExpense}
          canManageFloat={canManageFloat}
          canRecordReturn={canRecordReturn}
          canClose={canClose}
          topUpForm={topUpForm}
          expenseForm={expenseForm}
          floatForm={floatForm}
          floatTopUpForm={floatTopUpForm}
          agentReturnForm={agentReturnForm}
          closingForm={closingForm}
          recordingTopUp={recordingTopUp}
          recordingExpense={recordingExpense}
          savingFloat={savingFloat}
          savingFloatTopUp={savingFloatTopUp}
          recordingAgentReturn={recordingAgentReturn}
          closing={closing}
          canSubmitFloat={canSubmitFloat}
          canSubmitFloatTopUp={canSubmitFloatTopUp}
          onClosePanel={() => setActivePanel(null)}
          setTopUpForm={setTopUpForm}
          setExpenseForm={setExpenseForm}
          setFloatForm={setFloatForm}
          setFloatTopUpForm={setFloatTopUpForm}
          setAgentReturnForm={setAgentReturnForm}
          setClosingForm={setClosingForm}
          onRecordTopUp={() => void recordTopUp()}
          onRecordExpense={() => void recordExpense()}
          onSaveFloat={() => void saveFloat("issue")}
          onSaveFloatTopUp={() => void saveFloat("add")}
          onRecordAgentReturn={() => void recordAgentReturn()}
          onCloseDay={() => void closeBranch()}
        />
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

function OwnerOperationEmptyView({
  branch,
  date,
  pendingOperation,
}: {
  branch: OperationBranch;
  date: string;
  pendingOperation: OperationCarryover | null;
}) {
  return (
    <section className="panel overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_260px] lg:items-center">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-[var(--forest-emerald)]">
            Branch Report
          </p>
          <h2 className="mt-2 text-xl font-bold text-[var(--midnight-navy)]">
            No operation report for {formatDateOnly(date)}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {pendingOperation
              ? `The manager still needs to close ${formatDateOnly(
                  pendingOperation.operationDate,
                )} before the next report can be prepared.`
              : "This branch has not opened operations for the selected day."}
          </p>
        </div>
        <div className="border border-[var(--line)] bg-[var(--soft-mist)] p-4">
          <p className="text-xs font-bold text-slate-500">Branch</p>
          <p className="mt-1 text-lg font-bold text-[var(--midnight-navy)]">
            {branch.name}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {branch.address || "Address not set"}
          </p>
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
  canOperateBranch,
  editable,
  canRecordTopUp,
  canRecordReturn,
  canRecordExpense,
  canManageFloat,
  canClose,
  loadingAgents,
  pendingReturnsCount,
  assignableAgentsCount,
  addFloatAgentsCount,
  report,
  reportView,
  canReviewReport,
  canApproveReport,
  managerReportNotes,
  ownerReportNotes,
  reviewingReport,
  approvingReport,
  exportingReport,
  setReportView,
  setManagerReportNotes,
  setOwnerReportNotes,
  onManagerConfirmReport,
  onOwnerApproveReport,
  onExportReport,
  onAction,
}: {
  operation: DailyOperation;
  canOperateBranch: boolean;
  editable: boolean;
  canRecordTopUp: boolean;
  canRecordReturn: boolean;
  canRecordExpense: boolean;
  canManageFloat: boolean;
  canClose: boolean;
  loadingAgents: boolean;
  pendingReturnsCount: number;
  assignableAgentsCount: number;
  addFloatAgentsCount: number;
  report: DailyOperationReport | null;
  reportView: "report" | "excel";
  canReviewReport: boolean;
  canApproveReport: boolean;
  managerReportNotes: string;
  ownerReportNotes: string;
  reviewingReport: boolean;
  approvingReport: boolean;
  exportingReport: boolean;
  setReportView: (view: "report" | "excel") => void;
  setManagerReportNotes: (value: string) => void;
  setOwnerReportNotes: (value: string) => void;
  onManagerConfirmReport: () => void;
  onOwnerApproveReport: () => void;
  onExportReport: () => void;
  onAction: (panel: Exclude<OperationActionPanel, null>) => void;
}) {
  const allReturnsRecorded =
    operation.agentsReturnedCount === operation.agentsWithFloatCount;
  const cashPosition =
    operation.closingBalance ?? operation.branchCashRemaining;
  const cashPositionHint =
    operation.status === "CLOSED"
      ? "Closing balance"
      : "Float, returns, expenses";
  const unresolvedExpenses = operation.expenses.filter(
    (expense) => expense.approvedAt == null,
  ).length;
  const attentionItems = [
    pendingReturnsCount > 0
      ? `${pendingReturnsCount} agent${pendingReturnsCount === 1 ? "" : "s"} not yet returned`
      : null,
    operation.floatRemaining > 0
      ? `${formatMoney(operation.floatRemaining)} float still assignable`
      : null,
    unresolvedExpenses > 0
      ? `${unresolvedExpenses} expense${unresolvedExpenses === 1 ? "" : "s"} pending approval`
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      {canOperateBranch ? (
        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton
            icon={<PlusCircle className="size-4" />}
            label="Add Top-up"
            disabled={!editable || !canRecordTopUp}
            onClick={() => onAction("top-up")}
          />
          <ActionButton
            icon={<ReceiptText className="size-4" />}
            label="Record Expense"
            disabled={!editable || !canRecordExpense}
            onClick={() => onAction("expense")}
          />
          <ActionButton
            icon={<LockKeyhole className="size-4" />}
            label="Close Day"
            primary
            disabled={!editable || !canClose || !allReturnsRecorded}
            onClick={() => onAction("close-day")}
          />
        </div>
      ) : null}

      <section className="grid grid-cols-6 gap-1 sm:gap-1.5 xl:gap-2">
        <OperationStat
          label="Total opening balance"
          value={formatMoney(operation.cashAvailableAtOpening)}
          hint="Cash at start"
          tone="good"
          icon={<WalletCards className="size-4" />}
        />
        <OperationStat
          label="Float distributed"
          value={formatMoney(operation.floatIssued)}
          hint="Given to agents"
          tone="warn"
          icon={<UserRoundPlus className="size-4" />}
        />
        <OperationStat
          label="Branch cash available"
          value={formatMoney(cashPosition)}
          hint={cashPositionHint}
          tone="blue"
          icon={<Landmark className="size-4" />}
        />
        <OperationStat
          label="Expenses today"
          value={formatMoney(operation.expensesTotal)}
          hint={`${operation.expensesCount} recorded`}
          tone="bad"
          icon={<ReceiptText className="size-4" />}
        />
        <OperationStat
          label="Cash returned by agents"
          value={formatMoney(operation.cashReturnedByAgents)}
          hint={`${operation.agentsReturnedCount}/${operation.agentsWithFloatCount} returned`}
          tone="blue"
          icon={<RotateCcw className="size-4" />}
        />
        <OperationStat
          label="Expected closing balance"
          value={formatMoney(operation.expectedClosingBalance)}
          hint="Projected cash"
          tone="good"
          icon={<ShieldCheck className="size-4" />}
          featured
        />
      </section>

      {operation.status === "CLOSED" ? (
        report ? (
          <OperationReportSection
            operation={operation}
            report={report}
            view={reportView}
            canReviewReport={canReviewReport}
            canApproveReport={canApproveReport}
            managerNotes={managerReportNotes}
            ownerNotes={ownerReportNotes}
            reviewing={reviewingReport}
            approving={approvingReport}
            exporting={exportingReport}
            setView={setReportView}
            setManagerNotes={setManagerReportNotes}
            setOwnerNotes={setOwnerReportNotes}
            onManagerConfirm={onManagerConfirmReport}
            onOwnerApprove={onOwnerApproveReport}
            onExport={onExportReport}
          />
        ) : (
          <section className="panel bg-white p-4 text-sm font-semibold text-slate-500">
            Preparing close-day report...
          </section>
        )
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.45fr)]">
        <div className="space-y-3">
          <OpeningCashPanel
            operation={operation}
            onTopUp={() => onAction("top-up")}
          />
          <CashPositionPanel operation={operation} />
          <RecentExpensesPanel
            operation={operation}
            onRecordExpense={() => onAction("expense")}
          />
        </div>

        <div className="space-y-3">
          <AgentFloatStatusPanel operation={operation} />
          {canOperateBranch ? (
            <QuickActionsPanel
              editable={editable}
              canManageFloat={canManageFloat}
              canRecordReturn={canRecordReturn}
              loadingAgents={loadingAgents}
              assignableAgentsCount={assignableAgentsCount}
              addFloatAgentsCount={addFloatAgentsCount}
              pendingReturnsCount={pendingReturnsCount}
              operation={operation}
              onAction={onAction}
            />
          ) : null}
          <AttentionPanel
            items={attentionItems}
            closed={!editable && operation.status === "CLOSED"}
          />
        </div>
      </div>
    </div>
  );
}

function OperationReportSection({
  operation,
  report,
  view,
  canReviewReport,
  canApproveReport,
  managerNotes,
  ownerNotes,
  reviewing,
  approving,
  exporting,
  setView,
  setManagerNotes,
  setOwnerNotes,
  onManagerConfirm,
  onOwnerApprove,
  onExport,
}: {
  operation: DailyOperation;
  report: DailyOperationReport;
  view: "report" | "excel";
  canReviewReport: boolean;
  canApproveReport: boolean;
  managerNotes: string;
  ownerNotes: string;
  reviewing: boolean;
  approving: boolean;
  exporting: boolean;
  setView: (view: "report" | "excel") => void;
  setManagerNotes: (value: string) => void;
  setOwnerNotes: (value: string) => void;
  onManagerConfirm: () => void;
  onOwnerApprove: () => void;
  onExport: () => void;
}) {
  return (
    <section className="panel overflow-hidden bg-white shadow-[0_12px_30px_rgba(20,33,61,0.08)]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-[var(--forest-emerald)]">
            Close-Day Report
          </p>
          <h2 className="mt-1 text-lg font-bold text-[var(--midnight-navy)]">
            {report.reportNumber}
          </h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {operation.branchName} · {formatDateOnly(report.operationDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportStatusBadge status={report.status} />
          <div className="flex border border-[var(--line)] bg-[var(--soft-mist)] p-1">
            <ReportViewButton
              active={view === "report"}
              icon={<FileText className="size-3.5" />}
              label="Computerised Report"
              onClick={() => setView("report")}
            />
            <ReportViewButton
              active={view === "excel"}
              icon={<FileSpreadsheet className="size-3.5" />}
              label="Excel View"
              onClick={() => setView("excel")}
            />
          </div>
          <button
            type="button"
            className="btn btn-ghost h-10 text-xs"
            disabled={exporting}
            onClick={onExport}
          >
            {exporting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Export
          </button>
        </div>
      </header>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {view === "report" ? (
            <ComputerisedReportView operation={operation} report={report} />
          ) : (
            <ExcelReportView operation={operation} report={report} />
          )}
        </div>
        <ReportReviewPanel
          report={report}
          canReviewReport={canReviewReport}
          canApproveReport={canApproveReport}
          managerNotes={managerNotes}
          ownerNotes={ownerNotes}
          reviewing={reviewing}
          approving={approving}
          setManagerNotes={setManagerNotes}
          setOwnerNotes={setOwnerNotes}
          onManagerConfirm={onManagerConfirm}
          onOwnerApprove={onOwnerApprove}
        />
      </div>
    </section>
  );
}

function ReportViewButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 items-center gap-2 px-3 text-xs font-bold transition ${
        active
          ? "bg-white text-[var(--midnight-navy)] shadow-sm"
          : "text-slate-500 hover:text-[var(--midnight-navy)]"
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function ComputerisedReportView({
  operation,
  report,
}: {
  operation: DailyOperation;
  report: DailyOperationReport;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
        <ReportMetric
          label="Opening Cash"
          value={formatMoney(operation.cashAvailableAtOpening)}
        />
        <ReportMetric
          label="Float Distributed"
          value={formatMoney(operation.floatIssued)}
        />
        <ReportMetric
          label="Returned Cash"
          value={formatMoney(operation.cashReturnedByAgents)}
        />
        <ReportMetric
          label="Expenses"
          value={formatMoney(operation.expensesTotal)}
          danger
        />
        <ReportMetric
          label="Expected Close"
          value={formatMoney(operation.expectedClosingBalance)}
          highlight
        />
        <ReportMetric
          label="Counted Cash"
          value={formatMoney(operation.closingBalance ?? 0)}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ReportBlock title="Opening Cash">
          <StatementRow
            label="Previous closing balance"
            value={formatMoney(operation.openingBalance)}
          />
          <StatementRow
            label="Top-ups added today"
            value={formatMoney(operation.topUpsTotal)}
          />
          <StatementRow
            label="Total opening balance"
            value={formatMoney(operation.cashAvailableAtOpening)}
            strong
          />
        </ReportBlock>
        <ReportBlock title="Closing Result">
          <StatementRow
            label="Expected closing balance"
            value={formatMoney(operation.expectedClosingBalance)}
            strong
          />
          <StatementRow
            label="Counted cash"
            value={formatMoney(operation.closingBalance ?? 0)}
          />
          <StatementRow
            label="Variance"
            value={formatVariance(operation.closingVariance)}
            danger={(operation.closingVariance ?? 0) !== 0}
          />
        </ReportBlock>
      </div>

      <ReportBlock title="Field Activity">
        <div className="grid gap-2 sm:grid-cols-4">
          <ReportMiniStat
            label="Loans issued"
            value={`${operation.loansIssuedCount}`}
            hint={formatMoney(operation.loansIssuedPrincipal)}
          />
          <ReportMiniStat
            label="Collections"
            value={`${operation.collectionsCount}`}
            hint={formatMoney(operation.collectionsReceived)}
          />
          <ReportMiniStat
            label="Processing fees"
            value={formatMoney(operation.processingFeesTotal)}
            hint="Included in handover"
          />
          <ReportMiniStat
            label="Agents returned"
            value={`${operation.agentsReturnedCount}/${operation.agentsWithFloatCount}`}
            hint={formatMoney(operation.expectedAgentReturnTotal)}
          />
        </div>
      </ReportBlock>

      <ReportAgentTable operation={operation} />

      <div className="grid gap-3 lg:grid-cols-2">
        <ReportRecordList
          title="Top-ups"
          empty="No top-ups recorded."
          rows={operation.topUps.map((topUp) => ({
            id: topUp.id,
            label: topUp.description || "Cash top-up",
            meta: `${formatClock(topUp.addedAt)} · ${topUp.recordedByName}`,
            value: formatMoney(topUp.amount),
          }))}
        />
        <ReportRecordList
          title="Expenses"
          empty="No expenses recorded."
          rows={operation.expenses.map((expense) => ({
            id: expense.id,
            label: categoryLabel(expense.category),
            meta: `${formatClock(expense.incurredAt)} · ${expense.recordedByName}`,
            value: formatMoney(expense.amount),
          }))}
        />
      </div>

      <div className="grid gap-3 text-xs text-slate-600 sm:grid-cols-3">
        <ReportDetail label="Opened By" value={operation.openedByName} />
        <ReportDetail
          label="Closed By"
          value={operation.closedByName ?? "Not recorded"}
        />
        <ReportDetail
          label="Generated"
          value={formatDateTime(report.generatedAt)}
        />
      </div>
    </div>
  );
}

function ExcelReportView({
  operation,
  report,
}: {
  operation: DailyOperation;
  report: DailyOperationReport;
}) {
  const rows = buildExcelRows(operation);
  const columns = [
    "Section",
    "Description",
    "Count",
    "Cash In",
    "Cash Out",
    "Balance",
    "Notes",
  ];
  const finalRowNumber = rows.length + 6;

  return (
    <div className="overflow-hidden border border-[#c6d2cc] bg-[#f3f7f5] shadow-inner">
      <div className="flex items-center gap-2 border-b border-[#c6d2cc] bg-[#eef3f0] px-3 py-2 text-[11px] font-semibold text-slate-600">
        <span className="border border-[#c6d2cc] bg-white px-2 py-1 text-[10px] font-bold text-slate-500">
          fx
        </span>
        <span className="min-w-0 truncate">
          {report.reportNumber} / {operation.branchName} /{" "}
          {formatDateOnly(report.operationDate)}
        </span>
      </div>
      <table className="w-full table-fixed border-collapse text-left text-[10px]">
        <thead>
          <tr>
            <th className="w-8 border border-[#c6d2cc] bg-[#e6ece8]" />
            {["A", "B", "C", "D", "E", "F", "G"].map((letter, index) => (
              <th
                key={letter}
                className={`border border-[#c6d2cc] bg-[#e6ece8] px-2 py-1 text-center font-bold text-slate-500 ${
                  index === 0
                    ? "w-[13%]"
                    : index === 1
                      ? "w-[28%]"
                      : index === 2
                        ? "w-[8%]"
                        : "w-[12.75%]"
                }`}
              >
                {letter}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <SpreadsheetMergedRow
            rowNumber={1}
            value="REMBEH Daily Operations Report"
            strong
          />
          <SpreadsheetMergedRow
            rowNumber={2}
            value={`${operation.branchName} · ${formatDateOnly(report.operationDate)}`}
          />
          <SpreadsheetMergedRow
            rowNumber={3}
            value={`${report.reportNumber} · ${reportStatusLabel(report.status)}`}
            muted
          />
          <tr>
            <SpreadsheetRowNumber value={4} />
            <SpreadsheetSummaryCell
              label="Expected close"
              value={operation.expectedClosingBalance}
            />
            <SpreadsheetSummaryCell
              label="Counted cash"
              value={operation.closingBalance ?? 0}
            />
            <SpreadsheetSummaryCell
              label="Variance"
              value={operation.closingVariance ?? 0}
            />
            <td className="border border-[#c6d2cc] bg-white px-2 py-2 font-semibold text-slate-500" />
          </tr>
          <tr>
            <SpreadsheetRowNumber value={5} />
            {columns.map((column) => (
              <td
                key={column}
                className="border border-[#c6d2cc] bg-[var(--forest-emerald)] px-2 py-2 text-center font-bold text-white"
              >
                {column}
              </td>
            ))}
          </tr>
          {rows.map((row, index) => (
            <tr
              key={`${row.section}-${row.description}`}
              className={index % 2 === 0 ? "bg-white" : "bg-[#fbfdfc]"}
            >
              <SpreadsheetRowNumber value={index + 6} />
              <td className="border border-[#d5ddd9] px-2 py-2 font-bold text-[var(--midnight-navy)]">
                {row.section}
              </td>
              <td className="border border-[#d5ddd9] px-2 py-2 text-slate-600">
                {row.description}
              </td>
              <td className="border border-[#d5ddd9] px-2 py-2 text-right tabular-nums text-slate-600">
                {row.count}
              </td>
              <SpreadsheetMoneyCell value={row.cashIn} tone="in" />
              <SpreadsheetMoneyCell value={row.cashOut} tone="out" />
              <SpreadsheetMoneyCell value={row.balance} tone="balance" />
              <td className="border border-[#d5ddd9] px-2 py-2 text-slate-600">
                {row.note}
              </td>
            </tr>
          ))}
          <tr>
            <SpreadsheetRowNumber value={finalRowNumber} />
            <td className="border border-[#c6d2cc] bg-[#e6ece8] px-2 py-2 font-bold text-[var(--midnight-navy)]">
              Closing
            </td>
            <td className="border border-[#c6d2cc] bg-[#e6ece8] px-2 py-2 font-bold text-[var(--midnight-navy)]">
              Final report totals
            </td>
            <td className="border border-[#c6d2cc] bg-[#e6ece8] px-2 py-2 text-right font-bold tabular-nums text-[var(--midnight-navy)]">
              -
            </td>
            <SpreadsheetMoneyCell
              value={
                operation.cashReturnedByAgents +
                operation.collectionsReceived +
                operation.processingFeesTotal
              }
              tone="in"
              total
            />
            <SpreadsheetMoneyCell
              value={
                operation.floatIssued +
                operation.expensesTotal +
                operation.loansIssuedPrincipal
              }
              tone="out"
              total
            />
            <SpreadsheetMoneyCell
              value={operation.expectedClosingBalance}
              tone="balance"
              total
            />
            <td className="border border-[#c6d2cc] bg-[#e6ece8] px-2 py-2 font-bold text-[var(--midnight-navy)]">
              {formatVariance(operation.closingVariance)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SpreadsheetMergedRow({
  rowNumber,
  value,
  strong = false,
  muted = false,
}: {
  rowNumber: number;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <tr>
      <SpreadsheetRowNumber value={rowNumber} />
      <td
        colSpan={7}
        className={`border border-[#c6d2cc] px-2 py-2 text-center ${
          strong
            ? "bg-[var(--midnight-navy)] text-sm font-bold text-white"
            : muted
              ? "bg-white font-semibold text-slate-500"
              : "bg-white font-bold text-[var(--midnight-navy)]"
        }`}
      >
        {value}
      </td>
    </tr>
  );
}

function SpreadsheetRowNumber({ value }: { value: number }) {
  return (
    <td className="border border-[#c6d2cc] bg-[#e6ece8] px-1 py-2 text-center text-[9px] font-bold text-slate-500">
      {value}
    </td>
  );
}

function SpreadsheetSummaryCell({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <td colSpan={2} className="border border-[#c6d2cc] bg-white px-2 py-2">
      <span className="mr-2 font-bold text-slate-500">{label}</span>
      <span className="font-bold tabular-nums text-[var(--midnight-navy)]">
        {formatCompactMoney(value)}
      </span>
    </td>
  );
}

function SpreadsheetMoneyCell({
  value,
  tone,
  total = false,
}: {
  value: number | null;
  tone: "in" | "out" | "balance";
  total?: boolean;
}) {
  const toneClass =
    tone === "in"
      ? "text-[var(--forest-emerald)]"
      : tone === "out"
        ? "text-amber-700"
        : "text-[var(--midnight-navy)]";
  return (
    <td
      className={`border border-[#d5ddd9] px-2 py-2 text-right font-bold tabular-nums ${toneClass} ${
        total ? "bg-[#e6ece8]" : ""
      }`}
    >
      {value == null ? "-" : formatCompactMoney(value)}
    </td>
  );
}

function ReportReviewPanel({
  report,
  canReviewReport,
  canApproveReport,
  managerNotes,
  ownerNotes,
  reviewing,
  approving,
  setManagerNotes,
  setOwnerNotes,
  onManagerConfirm,
  onOwnerApprove,
}: {
  report: DailyOperationReport;
  canReviewReport: boolean;
  canApproveReport: boolean;
  managerNotes: string;
  ownerNotes: string;
  reviewing: boolean;
  approving: boolean;
  setManagerNotes: (value: string) => void;
  setOwnerNotes: (value: string) => void;
  onManagerConfirm: () => void;
  onOwnerApprove: () => void;
}) {
  const waitingForManager =
    report.status === "MANAGER_REVIEW" ||
    report.status === "RETURNED_TO_MANAGER";
  const waitingForOwner = report.status === "SENT_TO_OWNER";

  return (
    <aside className="border border-[var(--line)] bg-[var(--soft-mist)] p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center border border-emerald-100 bg-white text-[var(--forest-emerald)]">
          <ClipboardCheck className="size-4" />
        </span>
        <div>
          <p className="text-sm font-bold text-[var(--midnight-navy)]">
            Review Flow
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {reportStatusHelp(report.status)}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <ReviewStamp
          label="Manager"
          name={report.managerReviewedByName}
          date={report.managerReviewedAt}
          note={report.managerNotes}
        />
        <ReviewStamp
          label="Owner"
          name={report.ownerApprovedByName}
          date={report.ownerApprovedAt}
          note={report.ownerNotes}
        />
      </div>

      {waitingForManager && canReviewReport ? (
        <div className="mt-4 space-y-3">
          <TextAreaField
            label="Manager Notes"
            value={managerNotes}
            onChange={setManagerNotes}
          />
          <button
            type="button"
            className="btn btn-primary h-10 w-full text-xs"
            disabled={reviewing}
            onClick={onManagerConfirm}
          >
            {reviewing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            Send To Owner
          </button>
        </div>
      ) : null}

      {waitingForOwner && canApproveReport ? (
        <div className="mt-4 space-y-3">
          <TextAreaField
            label="Owner Notes"
            value={ownerNotes}
            onChange={setOwnerNotes}
          />
          <button
            type="button"
            className="btn btn-primary h-10 w-full text-xs"
            disabled={approving}
            onClick={onOwnerApprove}
          >
            {approving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            Approve Report
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function ReportMetric({
  label,
  value,
  highlight = false,
  danger = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`border px-2 py-2 ${
        highlight
          ? "border-emerald-200 bg-emerald-50"
          : danger
            ? "border-amber-200 bg-amber-50"
            : "border-[var(--line)] bg-[var(--soft-mist)]"
      }`}
    >
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
      <p
        className={`mt-1 truncate text-sm font-bold tabular-nums ${
          highlight
            ? "text-[var(--forest-emerald)]"
            : "text-[var(--midnight-navy)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ReportBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-[var(--line)]">
      <header className="border-b border-[var(--line)] bg-[#e5ece8] px-3 py-2">
        <p className="text-xs font-bold text-[var(--midnight-navy)]">{title}</p>
      </header>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  );
}

function ReportMiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold tabular-nums text-[var(--midnight-navy)]">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">
        {hint}
      </p>
    </div>
  );
}

function ReportAgentTable({ operation }: { operation: DailyOperation }) {
  return (
    <ReportBlock title="Agent Handover">
      {operation.agentReturns.length === 0 ? (
        <p className="py-2 text-sm text-slate-500">
          No agent float was issued for this day.
        </p>
      ) : (
        <table className="w-full table-fixed text-left text-[11px]">
          <thead className="text-[10px] font-bold text-slate-500">
            <tr>
              <th className="w-[25%] py-1 pr-2">Agent</th>
              <th className="w-[15%] px-2 py-1 text-right">Float</th>
              <th className="w-[15%] px-2 py-1 text-right">Loans</th>
              <th className="w-[15%] px-2 py-1 text-right">Collected</th>
              <th className="w-[15%] px-2 py-1 text-right">Fees</th>
              <th className="w-[15%] pl-2 py-1 text-right">Returned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {operation.agentReturns.map((agentReturn) => (
              <tr key={agentReturn.floatId}>
                <td className="py-2 pr-2">
                  <p className="truncate font-bold text-[var(--midnight-navy)]">
                    {agentReturn.agentName}
                  </p>
                  <p className="truncate text-[10px] text-slate-500">
                    {returnStatusLabel(agentReturn.status)}
                  </p>
                </td>
                <ReportAmount value={agentReturn.amountGiven} />
                <ReportAmount value={agentReturn.amountDisbursed} />
                <ReportAmount value={agentReturn.amountCollected} />
                <ReportAmount value={agentReturn.processingFees} />
                <ReportAmount value={agentReturn.amountReturned ?? 0} strong />
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportBlock>
  );
}

function ReportAmount({
  value,
  strong = false,
}: {
  value: number;
  strong?: boolean;
}) {
  return (
    <td
      className={`px-2 py-2 text-right tabular-nums ${
        strong ? "font-bold text-[var(--midnight-navy)]" : "font-semibold"
      }`}
    >
      {formatCompactMoney(value)}
    </td>
  );
}

function ReportRecordList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { id: string; label: string; meta: string; value: string }[];
}) {
  return (
    <ReportBlock title={title}>
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, 6).map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[minmax(0,1fr)_110px] gap-3 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate font-bold text-[var(--midnight-navy)]">
                  {row.label}
                </span>
                <span className="block truncate text-[10px] text-slate-500">
                  {row.meta}
                </span>
              </span>
              <span className="text-right font-bold tabular-nums text-[var(--midnight-navy)]">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </ReportBlock>
  );
}

function ReportDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--line)] bg-white px-3 py-2">
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 truncate font-bold text-[var(--midnight-navy)]">
        {value}
      </p>
    </div>
  );
}

function ReviewStamp({
  label,
  name,
  date,
  note,
}: {
  label: string;
  name: string | null;
  date: string | null;
  note: string | null;
}) {
  return (
    <div className="border-t border-[var(--line)] pt-3">
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-[var(--midnight-navy)]">
        {name ?? "Pending"}
      </p>
      {date ? (
        <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
          {formatDateTime(date)}
        </p>
      ) : null}
      {note ? <p className="mt-2 text-xs text-slate-600">{note}</p> : null}
    </div>
  );
}

function ReportStatusBadge({ status }: { status: OperationReportStatus }) {
  const label = reportStatusLabel(status);
  const className =
    status === "OWNER_APPROVED"
      ? "border-emerald-200 bg-emerald-50 text-[var(--forest-emerald)]"
      : status === "SENT_TO_OWNER"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : status === "RETURNED_TO_MANAGER"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-[var(--soft-mist)] text-slate-600";
  return (
    <span className={`inline-flex px-3 py-2 text-xs font-bold ${className}`}>
      {label}
    </span>
  );
}

function ActionButton({
  icon,
  label,
  disabled,
  primary = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${primary ? "btn btn-primary" : "btn btn-ghost"} h-10 min-w-[136px] text-xs shadow-[0_8px_20px_rgba(20,33,61,0.05)]`}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function OpeningCashPanel({
  operation,
  onTopUp,
}: {
  operation: DailyOperation;
  onTopUp: () => void;
}) {
  const latestTopUps = operation.topUps.slice(0, 3);
  return (
    <section className="panel overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
      <RecordHeader
        icon={<WalletCards className="size-4" />}
        title="Opening Cash"
      />
      <div className="space-y-2 px-4 pb-4 pt-3">
        <StatementRow
          label="Previous closing balance"
          value={formatMoney(operation.openingBalance)}
        />
        <StatementRow
          label="Top-ups added today"
          value={formatMoney(operation.topUpsTotal ?? operation.cashAddedToday)}
        />
        <StatementRow label="Opened by" value={operation.openedByName} muted />
        <StatementRow
          label="Opened at"
          value={formatDateTime(operation.openedAt)}
          muted
        />
        <div className="border-t border-[var(--line)] pt-3">
          <StatementRow
            label="Total opening balance"
            value={formatMoney(operation.cashAvailableAtOpening)}
            strong
          />
        </div>
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[var(--forest-emerald)]"
          onClick={onTopUp}
        >
          View top-ups
          <span aria-hidden>›</span>
        </button>
        {latestTopUps.length > 0 ? (
          <div className="mt-2 space-y-1.5 border-t border-[var(--line)] pt-3">
            {latestTopUps.map((topUp) => (
              <MiniRecord
                key={topUp.id}
                label={topUp.description || "Cash top-up"}
                value={formatMoney(topUp.amount)}
                meta={formatClock(topUp.addedAt)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CashPositionPanel({ operation }: { operation: DailyOperation }) {
  return (
    <section className="panel overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
      <RecordHeader
        icon={<Landmark className="size-4" />}
        title="Today's Cash Position"
      />
      <div className="space-y-2 px-4 pb-4 pt-3">
        <StatementRow
          label="Float distributed"
          value={formatMoney(operation.floatIssued)}
        />
        <StatementRow
          label="Branch expenses"
          value={formatMoney(operation.expensesTotal)}
        />
        <StatementRow
          label="Cash returned by agents"
          value={formatMoney(operation.cashReturnedByAgents)}
        />
        <StatementRow
          label="Branch repayments"
          value={formatMoney(operation.collectionsReceived)}
        />
        <StatementRow
          label="Loan processing fees"
          value={formatMoney(operation.processingFeesTotal)}
        />
        <StatementRow
          label="Loans issued"
          value={formatMoney(operation.loansIssuedPrincipal)}
          danger
        />
        <div className="border-t border-[var(--line)] pt-3">
          <StatementRow
            label="Expected closing balance"
            value={formatMoney(operation.expectedClosingBalance)}
            strong
          />
        </div>
      </div>
    </section>
  );
}

function RecentExpensesPanel({
  operation,
  onRecordExpense,
}: {
  operation: DailyOperation;
  onRecordExpense: () => void;
}) {
  const latestExpenses = operation.expenses.slice(0, 3);
  return (
    <section className="panel overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
      <RecordHeader
        icon={<ReceiptText className="size-4" />}
        title="Recent Expenses"
        end={formatMoney(operation.expensesTotal)}
      />
      <div className="px-4 pb-4 pt-3">
        {latestExpenses.length === 0 ? (
          <p className="py-3 text-sm text-slate-500">
            No expenses recorded for this day.
          </p>
        ) : (
          <div className="space-y-2">
            {latestExpenses.map((expense) => (
              <MiniRecord
                key={expense.id}
                label={categoryLabel(expense.category)}
                value={formatMoney(expense.amount)}
                meta={formatClock(expense.incurredAt)}
                status="Recorded"
              />
            ))}
          </div>
        )}
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[var(--forest-emerald)]"
          onClick={onRecordExpense}
        >
          View all expenses
          <span aria-hidden>›</span>
        </button>
      </div>
    </section>
  );
}

function AgentFloatStatusPanel({ operation }: { operation: DailyOperation }) {
  return (
    <section className="panel overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
      <RecordHeader
        icon={<UserRoundPlus className="size-4" />}
        title="Agent Float Status"
      />
      {operation.agentReturns.length === 0 ? (
        <div className="px-4 py-8 text-sm text-slate-500">
          No agent has received float for this day.
        </div>
      ) : (
        <table className="w-full table-fixed text-left text-[11px]">
          <thead className="border-y border-[var(--line)] bg-[#e5ece8] text-[9px] font-semibold text-slate-500">
            <tr>
              <th className="w-[22%] px-3 py-2">Agent</th>
              <th className="w-[15%] px-2 py-2 text-right">Float Received</th>
              <th className="w-[14%] px-2 py-2 text-right">Loans Issued</th>
              <th className="w-[14%] px-2 py-2 text-right">Collections</th>
              <th className="w-[14%] px-2 py-2 text-right">Fees</th>
              <th className="w-[14%] px-2 py-2 text-right">Handover</th>
              <th className="w-[7%] px-2 py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {operation.agentReturns.map((agentReturn) => (
              <tr
                key={agentReturn.floatId}
                className="bg-white even:bg-[#fbfdfc]"
              >
                <td className="px-3 py-2.5">
                  <p className="truncate font-bold text-[var(--midnight-navy)]">
                    {agentReturn.agentName}
                  </p>
                  <p className="truncate text-[10px] text-slate-500">
                    {agentReturn.agentPublicId ?? "No agent id"}
                  </p>
                </td>
                <TableMoney value={agentReturn.amountGiven} />
                <TableMoney value={agentReturn.amountDisbursed} />
                <TableMoney value={agentReturn.amountCollected} />
                <TableMoney value={agentReturn.processingFees} />
                <TableMoney value={agentReturn.expectedReturn} strong />
                <td className="px-2 py-2.5 text-right">
                  <ReturnBadge status={agentReturn.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function QuickActionsPanel({
  editable,
  canManageFloat,
  canRecordReturn,
  loadingAgents,
  assignableAgentsCount,
  addFloatAgentsCount,
  pendingReturnsCount,
  operation,
  onAction,
}: {
  editable: boolean;
  canManageFloat: boolean;
  canRecordReturn: boolean;
  loadingAgents: boolean;
  assignableAgentsCount: number;
  addFloatAgentsCount: number;
  pendingReturnsCount: number;
  operation: DailyOperation;
  onAction: (panel: Exclude<OperationActionPanel, null>) => void;
}) {
  return (
    <section className="panel overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
      <RecordHeader icon={<Send className="size-4" />} title="Quick Actions" />
      <div className="grid gap-2 p-3 sm:grid-cols-3">
        <QuickActionButton
          icon={<UserRoundPlus className="size-4" />}
          label="Issue Float"
          hint={
            loadingAgents
              ? "Loading agents"
              : `${assignableAgentsCount} available`
          }
          disabled={
            !editable ||
            !canManageFloat ||
            loadingAgents ||
            assignableAgentsCount === 0 ||
            operation.floatRemaining <= 0
          }
          onClick={() => onAction("issue-float")}
        />
        <QuickActionButton
          icon={<CircleDollarSign className="size-4" />}
          label="Add More Float"
          hint={`${formatMoney(operation.floatRemaining)} left`}
          disabled={
            !editable ||
            !canManageFloat ||
            addFloatAgentsCount === 0 ||
            operation.floatRemaining <= 0
          }
          onClick={() => onAction("add-float")}
        />
        <QuickActionButton
          icon={<RotateCcw className="size-4" />}
          label="Record Agent Return"
          hint={`${pendingReturnsCount} pending`}
          disabled={!editable || !canRecordReturn || pendingReturnsCount === 0}
          onClick={() => onAction("agent-return")}
        />
      </div>
    </section>
  );
}

function AttentionPanel({
  items,
  closed,
}: {
  items: string[];
  closed: boolean;
}) {
  return (
    <section className="panel border-amber-200 bg-amber-50/70 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center border border-amber-200 bg-white text-amber-700">
          <ClipboardCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--midnight-navy)]">
            Attention Needed
          </p>
          {closed ? (
            <p className="mt-1 text-xs font-semibold text-[var(--forest-emerald)]">
              This day is closed.
            </p>
          ) : items.length === 0 ? (
            <p className="mt-1 text-xs font-semibold text-[var(--forest-emerald)]">
              No attention needed right now.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs font-semibold text-amber-800">
              {items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function OperationActionDrawer({
  panel,
  operation,
  assignableAgents,
  addFloatOptions,
  pendingAgentReturns,
  editable,
  canRecordTopUp,
  canRecordExpense,
  canManageFloat,
  canRecordReturn,
  canClose,
  topUpForm,
  expenseForm,
  floatForm,
  floatTopUpForm,
  agentReturnForm,
  closingForm,
  recordingTopUp,
  recordingExpense,
  savingFloat,
  savingFloatTopUp,
  recordingAgentReturn,
  closing,
  canSubmitFloat,
  canSubmitFloatTopUp,
  onClosePanel,
  setTopUpForm,
  setExpenseForm,
  setFloatForm,
  setFloatTopUpForm,
  setAgentReturnForm,
  setClosingForm,
  onRecordTopUp,
  onRecordExpense,
  onSaveFloat,
  onSaveFloatTopUp,
  onRecordAgentReturn,
  onCloseDay,
}: {
  panel: OperationActionPanel;
  operation: DailyOperation | null | undefined;
  assignableAgents: OperationAgentRow[];
  addFloatOptions: DailyOperationAgentReturn[];
  pendingAgentReturns: DailyOperationAgentReturn[];
  editable: boolean;
  canRecordTopUp: boolean;
  canRecordExpense: boolean;
  canManageFloat: boolean;
  canRecordReturn: boolean;
  canClose: boolean;
  topUpForm: TopUpForm;
  expenseForm: ExpenseForm;
  floatForm: FloatForm;
  floatTopUpForm: FloatForm;
  agentReturnForm: AgentReturnForm;
  closingForm: ClosingForm;
  recordingTopUp: boolean;
  recordingExpense: boolean;
  savingFloat: boolean;
  savingFloatTopUp: boolean;
  recordingAgentReturn: boolean;
  closing: boolean;
  canSubmitFloat: boolean;
  canSubmitFloatTopUp: boolean;
  onClosePanel: () => void;
  setTopUpForm: (next: TopUpForm) => void;
  setExpenseForm: (next: ExpenseForm) => void;
  setFloatForm: (next: FloatForm) => void;
  setFloatTopUpForm: (next: FloatForm) => void;
  setAgentReturnForm: (next: AgentReturnForm) => void;
  setClosingForm: (next: ClosingForm) => void;
  onRecordTopUp: () => void;
  onRecordExpense: () => void;
  onSaveFloat: () => void;
  onSaveFloatTopUp: () => void;
  onRecordAgentReturn: () => void;
  onCloseDay: () => void;
}) {
  if (!panel || !operation) return null;

  const title =
    panel === "top-up"
      ? "Add Top-up"
      : panel === "expense"
        ? "Record Expense"
        : panel === "issue-float"
          ? "Issue Float"
          : panel === "add-float"
            ? "Add More Float"
            : panel === "agent-return"
              ? "Record Agent Return"
              : "Close Day";
  const expenseAmount = Number(expenseForm.amount);
  const validExpense =
    canRecordExpense &&
    editable &&
    expenseForm.amount !== "" &&
    expenseAmount > 0 &&
    expenseAmount <= operation.branchCashRemaining;
  const topUpAmount = Number(topUpForm.amount);
  const validTopUp =
    canRecordTopUp &&
    editable &&
    topUpForm.amount !== "" &&
    Number.isFinite(topUpAmount) &&
    topUpAmount > 0;
  const selectedReturn = pendingAgentReturns.find(
    (agentReturn) => agentReturn.agentId === agentReturnForm.agentId,
  );
  const canSubmitReturn =
    editable &&
    canRecordReturn &&
    Boolean(selectedReturn) &&
    agentReturnForm.amountReturned !== "" &&
    Number(agentReturnForm.amountReturned) >= 0;
  const allReturnsRecorded =
    operation.agentsReturnedCount === operation.agentsWithFloatCount;
  const countedCash = Number(closingForm.countedCash || 0);
  const variance =
    closingForm.countedCash === ""
      ? null
      : Math.round((countedCash - operation.expectedClosingBalance) * 100) /
        100;
  const needsCloseNote = variance != null && variance !== 0;
  const canSubmitClose =
    editable &&
    canClose &&
    allReturnsRecorded &&
    closingForm.countedCash !== "" &&
    (!needsCloseNote || closingForm.notes.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
      <button
        type="button"
        className="hidden flex-1 cursor-default bg-transparent sm:block"
        aria-label="Close panel"
        onClick={onClosePanel}
      />
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-[var(--forest-emerald)]">
              Daily Operations
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--midnight-navy)]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="grid size-8 place-items-center border border-[var(--line)] bg-white text-[var(--midnight-navy)] hover:bg-[var(--soft-mist)]"
            aria-label="Close panel"
            onClick={onClosePanel}
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {panel === "top-up" ? (
            <div className="space-y-4">
              <PanelHint
                label="Available cash"
                value={formatMoney(operation.branchCashRemaining)}
              />
              <MoneyField
                label="Top-up amount"
                value={topUpForm.amount}
                locked={!editable || !canRecordTopUp}
                onChange={(value) =>
                  setTopUpForm({ ...topUpForm, amount: value })
                }
              />
              <TextAreaField
                label="Description"
                value={topUpForm.description}
                locked={!editable || !canRecordTopUp}
                onChange={(value) =>
                  setTopUpForm({ ...topUpForm, description: value })
                }
              />
              <TopUpList operation={operation} />
            </div>
          ) : null}

          {panel === "expense" ? (
            <div className="space-y-4">
              <PanelHint
                label="Remaining cash"
                value={formatMoney(operation.branchCashRemaining)}
              />
              <label>
                <span className="text-xs font-bold text-slate-600">
                  Category
                </span>
                <select
                  value={expenseForm.category}
                  disabled={!editable || !canRecordExpense}
                  onChange={(event) =>
                    setExpenseForm({
                      ...expenseForm,
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
                value={expenseForm.amount}
                locked={!editable || !canRecordExpense}
                onChange={(value) =>
                  setExpenseForm({ ...expenseForm, amount: value })
                }
              />
              <TextAreaField
                label="Description"
                value={expenseForm.description}
                locked={!editable || !canRecordExpense}
                onChange={(value) =>
                  setExpenseForm({ ...expenseForm, description: value })
                }
              />
              {expenseForm.amount !== "" &&
              expenseAmount > operation.branchCashRemaining ? (
                <p className="text-xs font-semibold text-red-600">
                  Expense is more than remaining branch cash.
                </p>
              ) : null}
            </div>
          ) : null}

          {panel === "issue-float" ? (
            <FloatPanelForm
              form={floatForm}
              options={assignableAgents.map((agent) => ({
                id: agent.id,
                label: `${agent.name}${agent.publicId ? ` · ${agent.publicId}` : ""}`,
              }))}
              amountLeft={operation.floatRemaining}
              emptyMessage="All agents have float for this day."
              locked={!editable || !canManageFloat}
              onChange={setFloatForm}
            />
          ) : null}

          {panel === "add-float" ? (
            <FloatPanelForm
              form={floatTopUpForm}
              options={addFloatOptions.map((agentReturn) => ({
                id: agentReturn.agentId,
                label: `${agentReturn.agentName}${
                  agentReturn.agentPublicId
                    ? ` · ${agentReturn.agentPublicId}`
                    : ""
                }`,
              }))}
              amountLeft={operation.floatRemaining}
              emptyMessage="No active float can receive more right now."
              locked={!editable || !canManageFloat}
              onChange={setFloatTopUpForm}
            />
          ) : null}

          {panel === "agent-return" ? (
            <div className="space-y-4">
              <PanelHint
                label="Expected agent handover"
                value={formatMoney(operation.expectedAgentReturnTotal)}
              />
              <label>
                <span className="text-xs font-bold text-slate-600">Agent</span>
                <select
                  value={agentReturnForm.agentId}
                  disabled={!editable || !canRecordReturn}
                  onChange={(event) => {
                    const next = pendingAgentReturns.find(
                      (agentReturn) =>
                        agentReturn.agentId === event.target.value,
                    );
                    setAgentReturnForm({
                      ...agentReturnForm,
                      agentId: event.target.value,
                      amountReturned: next ? String(next.expectedReturn) : "",
                    });
                  }}
                  className="mt-1 h-10 w-full border border-[var(--line)] bg-white px-3 text-sm font-semibold text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] disabled:bg-[var(--soft-mist)] disabled:text-slate-500"
                >
                  {pendingAgentReturns.length === 0 ? (
                    <option value="">All agents returned</option>
                  ) : null}
                  {pendingAgentReturns.map((agentReturn) => (
                    <option
                      key={agentReturn.floatId}
                      value={agentReturn.agentId}
                    >
                      {agentReturn.agentName}
                      {agentReturn.agentPublicId
                        ? ` · ${agentReturn.agentPublicId}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              {selectedReturn ? (
                <div className="grid grid-cols-2 gap-2">
                  <PanelHint
                    label="Float received"
                    value={formatMoney(selectedReturn.amountGiven)}
                  />
                  <PanelHint
                    label="Expected handover"
                    value={formatMoney(selectedReturn.expectedReturn)}
                  />
                </div>
              ) : null}
              <MoneyField
                label="Cash received"
                value={agentReturnForm.amountReturned}
                locked={!editable || !canRecordReturn}
                onChange={(value) =>
                  setAgentReturnForm({
                    ...agentReturnForm,
                    amountReturned: value,
                  })
                }
              />
              <TextAreaField
                label="Notes"
                value={agentReturnForm.notes}
                locked={!editable || !canRecordReturn}
                onChange={(value) =>
                  setAgentReturnForm({ ...agentReturnForm, notes: value })
                }
              />
            </div>
          ) : null}

          {panel === "close-day" ? (
            <div className="space-y-4">
              {!allReturnsRecorded ? (
                <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                  Record all agent returns before closing.
                </p>
              ) : null}
              <PanelHint
                label="Expected closing balance"
                value={formatMoney(operation.expectedClosingBalance)}
              />
              <MoneyField
                label="Counted cash"
                value={closingForm.countedCash}
                locked={!editable || !canClose}
                onChange={(value) =>
                  setClosingForm({ ...closingForm, countedCash: value })
                }
              />
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
              <TextAreaField
                label={needsCloseNote ? "Notes required" : "Notes"}
                value={closingForm.notes}
                locked={!editable || !canClose}
                onChange={(value) =>
                  setClosingForm({ ...closingForm, notes: value })
                }
              />
            </div>
          ) : null}
        </div>

        <footer className="border-t border-[var(--line)] bg-[var(--soft-mist)] px-5 py-4">
          <button
            type="button"
            className="btn btn-primary h-10 w-full text-xs"
            disabled={
              panel === "top-up"
                ? !validTopUp || recordingTopUp
                : panel === "expense"
                  ? !validExpense || recordingExpense
                  : panel === "issue-float"
                    ? !canSubmitFloat || savingFloat
                    : panel === "add-float"
                      ? !canSubmitFloatTopUp || savingFloatTopUp
                      : panel === "agent-return"
                        ? !canSubmitReturn || recordingAgentReturn
                        : !canSubmitClose || closing
            }
            onClick={() => {
              if (panel === "top-up") onRecordTopUp();
              if (panel === "expense") onRecordExpense();
              if (panel === "issue-float") onSaveFloat();
              if (panel === "add-float") onSaveFloatTopUp();
              if (panel === "agent-return") onRecordAgentReturn();
              if (panel === "close-day") onCloseDay();
            }}
          >
            {recordingTopUp ||
            recordingExpense ||
            savingFloat ||
            savingFloatTopUp ||
            recordingAgentReturn ||
            closing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            {title}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function RecordHeader({
  icon,
  title,
  end,
}: {
  icon: ReactNode;
  title: string;
  end?: string;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center border border-emerald-100 bg-emerald-50 text-[var(--forest-emerald)]">
          {icon}
        </span>
        <p className="truncate text-sm font-bold text-[var(--midnight-navy)]">
          {title}
        </p>
      </div>
      {end ? (
        <span className="shrink-0 text-xs font-bold tabular-nums text-[var(--midnight-navy)]">
          {end}
        </span>
      ) : null}
    </header>
  );
}

function StatementRow({
  label,
  value,
  strong = false,
  muted = false,
  danger = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span
        className={`min-w-0 truncate ${
          strong
            ? "font-bold text-[var(--midnight-navy)]"
            : muted
              ? "text-slate-500"
              : "text-[var(--midnight-navy)]"
        }`}
      >
        {label}
      </span>
      <span
        className={`shrink-0 text-right font-bold tabular-nums ${
          strong
            ? "text-[var(--forest-emerald)]"
            : danger
              ? "text-amber-700"
              : "text-[var(--midnight-navy)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function MiniRecord({
  label,
  value,
  meta,
  status,
}: {
  label: string;
  value: string;
  meta: string;
  status?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_105px_58px_auto] items-center gap-2 text-sm">
      <span className="truncate text-[var(--midnight-navy)]">{label}</span>
      <span className="text-right font-bold tabular-nums text-[var(--midnight-navy)]">
        {value}
      </span>
      <span className="text-right text-xs text-slate-500">{meta}</span>
      {status ? (
        <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-right text-[10px] font-bold text-[var(--forest-emerald)]">
          {status}
        </span>
      ) : null}
    </div>
  );
}

function TableMoney({
  value,
  strong = false,
}: {
  value: number;
  strong?: boolean;
}) {
  return (
    <td
      className={`px-2 py-2.5 text-right tabular-nums ${
        strong ? "font-bold text-[var(--midnight-navy)]" : "font-semibold"
      }`}
    >
      {formatCompactMoney(value)}
    </td>
  );
}

function ReturnBadge({ status }: { status: AgentReturnStatus }) {
  const label = returnStatusLabel(status);
  const className =
    status === "RETURNED"
      ? "border-emerald-200 bg-emerald-50 text-[var(--forest-emerald)]"
      : status === "PENDING"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : status === "SHORT"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-sky-200 bg-sky-50 text-sky-700";
  return (
    <span
      className={`inline-flex px-2 py-1 text-[10px] font-bold ${className}`}
    >
      {label}
    </span>
  );
}

function QuickActionButton({
  icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-16 items-center gap-3 border border-[var(--line)] bg-white px-3 py-3 text-left transition hover:bg-[var(--soft-mist)] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="grid size-9 shrink-0 place-items-center border border-emerald-100 bg-emerald-50 text-[var(--forest-emerald)]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold text-[var(--midnight-navy)]">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">
          {hint}
        </span>
      </span>
    </button>
  );
}

function PanelHint({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--line)] bg-[var(--soft-mist)] px-3 py-3">
      <p className="text-[10px] font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-base font-bold tabular-nums text-[var(--midnight-navy)]">
        {value}
      </p>
    </div>
  );
}

function TextAreaField({
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
      <textarea
        value={value}
        disabled={locked}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-1 w-full border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] disabled:bg-[var(--soft-mist)] disabled:text-slate-500"
      />
    </label>
  );
}

function FloatPanelForm({
  form,
  options,
  amountLeft,
  emptyMessage,
  locked,
  onChange,
}: {
  form: FloatForm;
  options: { id: string; label: string }[];
  amountLeft: number;
  emptyMessage: string;
  locked: boolean;
  onChange: (next: FloatForm) => void;
}) {
  const amount = Number(form.amount);
  const exceeds = form.amount !== "" && amount > amountLeft;
  return (
    <div className="space-y-4">
      <PanelHint
        label="Assignable float left"
        value={formatMoney(amountLeft)}
      />
      <label>
        <span className="text-xs font-bold text-slate-600">Agent</span>
        <select
          value={form.agentId}
          disabled={locked || options.length === 0}
          onChange={(event) =>
            onChange({ ...form, agentId: event.target.value })
          }
          className="mt-1 h-10 w-full border border-[var(--line)] bg-white px-3 text-sm font-semibold text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] disabled:bg-[var(--soft-mist)] disabled:text-slate-500"
        >
          {options.length === 0 ? (
            <option value="">{emptyMessage}</option>
          ) : null}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <MoneyField
        label="Amount"
        value={form.amount}
        locked={locked || options.length === 0}
        onChange={(value) => onChange({ ...form, amount: value })}
      />
      {exceeds ? (
        <p className="text-xs font-semibold text-red-600">
          Float is more than the assignable amount left.
        </p>
      ) : null}
      <TextAreaField
        label="Notes"
        value={form.notes}
        locked={locked || options.length === 0}
        onChange={(value) => onChange({ ...form, notes: value })}
      />
    </div>
  );
}

function TopUpList({ operation }: { operation: DailyOperation }) {
  return (
    <div className="border-t border-[var(--line)] pt-4">
      <p className="text-xs font-bold text-[var(--midnight-navy)]">Top-ups</p>
      {operation.topUps.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No top-ups recorded yet.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {operation.topUps.map((topUp) => (
            <MiniRecord
              key={topUp.id}
              label={topUp.description || "Cash top-up"}
              value={formatMoney(topUp.amount)}
              meta={formatClock(topUp.addedAt)}
            />
          ))}
        </div>
      )}
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

function buildExcelRows(operation: DailyOperation) {
  const openingBalance = operation.openingBalance;
  const afterTopUps = operation.cashAvailableAtOpening;
  const afterFloat = afterTopUps - operation.floatIssued;
  const afterReturns = afterFloat + operation.cashReturnedByAgents;
  const afterExpenses = afterReturns - operation.expensesTotal;

  return [
    {
      section: "Opening",
      description: "Previous closing balance",
      count: "-",
      cashIn: openingBalance,
      cashOut: null,
      balance: openingBalance,
      note: "Previous day closing cash",
    },
    {
      section: "Opening",
      description: "Top-ups added today",
      count: operation.topUpsCount,
      cashIn: operation.topUpsTotal,
      cashOut: null,
      balance: afterTopUps,
      note: "Cash added at opening or during day",
    },
    {
      section: "Float",
      description: "Float distributed to agents",
      count: operation.agentsWithFloatCount,
      cashIn: null,
      cashOut: operation.floatIssued,
      balance: afterFloat,
      note: "Cash issued to field agents",
    },
    {
      section: "Field",
      description: "Cash returned by agents",
      count: operation.agentsReturnedCount,
      cashIn: operation.cashReturnedByAgents,
      cashOut: null,
      balance: afterReturns,
      note: "Agent handover received",
    },
    {
      section: "Expenses",
      description: "Expenses recorded",
      count: operation.expensesCount,
      cashIn: null,
      cashOut: operation.expensesTotal,
      balance: afterExpenses,
      note: "Branch operating expenses",
    },
    {
      section: "Loans",
      description: "Principal issued",
      count: operation.loansIssuedCount,
      cashIn: null,
      cashOut: operation.loansIssuedPrincipal,
      balance: null,
      note: "Principal issued to borrowers",
    },
    {
      section: "Collections",
      description: "Repayments received",
      count: operation.collectionsCount,
      cashIn: operation.collectionsReceived,
      cashOut: null,
      balance: null,
      note: "Repayments recorded",
    },
    {
      section: "Fees",
      description: "Processing fees received",
      count: "-",
      cashIn: operation.processingFeesTotal,
      cashOut: null,
      balance: null,
      note: "Loan processing fees recorded",
    },
    {
      section: "Closing",
      description: "Expected closing balance",
      count: "-",
      cashIn: null,
      cashOut: null,
      balance: operation.expectedClosingBalance,
      note: "Expected cash after all movement",
    },
    {
      section: "Closing",
      description: "Counted cash",
      count: "-",
      cashIn: null,
      cashOut: null,
      balance: operation.closingBalance ?? 0,
      note: "Cash counted at closing",
    },
    {
      section: "Closing",
      description: "Variance",
      count: "-",
      cashIn:
        (operation.closingVariance ?? 0) > 0 ? operation.closingVariance : null,
      cashOut:
        (operation.closingVariance ?? 0) < 0
          ? Math.abs(operation.closingVariance ?? 0)
          : null,
      balance: operation.closingVariance ?? 0,
      note: formatVariance(operation.closingVariance),
    },
  ];
}

function reportStatusLabel(status: OperationReportStatus) {
  if (status === "MANAGER_REVIEW") return "Manager Review";
  if (status === "SENT_TO_OWNER") return "Sent To Owner";
  if (status === "OWNER_APPROVED") return "Owner Approved";
  if (status === "RETURNED_TO_MANAGER") return "Returned To Manager";
  return status;
}

function reportStatusHelp(status: OperationReportStatus) {
  if (status === "MANAGER_REVIEW") {
    return "Manager should check the figures and send the report to owner.";
  }
  if (status === "SENT_TO_OWNER") {
    return "Waiting for owner approval.";
  }
  if (status === "OWNER_APPROVED") {
    return "This report has been approved.";
  }
  if (status === "RETURNED_TO_MANAGER") {
    return "Manager should review the returned report.";
  }
  return "Report review is in progress.";
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

function styleReportWorksheet(
  worksheet: Worksheet,
  headerRowNumber: number,
  totalsRowNumber: number,
  currency: string,
) {
  worksheet.getRow(1).height = 24;
  worksheet.getRow(1).font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
    size: 16,
  };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF14213D" },
  };
  worksheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };

  [2, 3].forEach((rowNumber) => {
    const row = worksheet.getRow(rowNumber);
    row.font = {
      bold: rowNumber === 2,
      color: { argb: rowNumber === 2 ? "FF14213D" : "FF516171" },
      size: rowNumber === 2 ? 12 : 10,
    };
    row.alignment = { horizontal: "center" };
  });

  const summaryRow = worksheet.getRow(4);
  summaryRow.eachCell((cell, columnNumber) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: columnNumber % 2 === 1 ? "FFE8EEEB" : "FFFFFFFF" },
    };
    cell.border = excelBorder();
    cell.font = { bold: true, color: { argb: "FF14213D" }, size: 10 };
    if ([2, 4, 6].includes(columnNumber)) {
      cell.numFmt = `"${currency}" #,##0`;
    }
  });

  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F8A6C" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = excelBorder();
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    row.eachCell((cell, columnNumber) => {
      cell.border = excelBorder();
      cell.alignment = {
        vertical: "middle",
        horizontal: columnNumber >= 4 && columnNumber <= 6 ? "right" : "left",
      };
      if ([4, 5, 6].includes(columnNumber)) {
        cell.numFmt = `"${currency}" #,##0`;
      }
      if (rowNumber % 2 === 0 && rowNumber !== totalsRowNumber) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFBFDFC" },
        };
      }
    });
  });

  const totalsRow = worksheet.getRow(totalsRowNumber);
  totalsRow.eachCell((cell, columnNumber) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8EEEB" },
    };
    cell.font = { bold: true, color: { argb: "FF14213D" }, size: 10 };
    if ([4, 5, 6].includes(columnNumber)) {
      cell.numFmt = `"${currency}" #,##0`;
    }
  });
}

function styleTableSheet(
  worksheet: Worksheet,
  headerRowNumber: number,
  currency: string,
  moneyColumns: number[],
) {
  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F8A6C" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = excelBorder();
  });
  worksheet.views = [{ state: "frozen", ySplit: headerRowNumber }];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    row.eachCell((cell, columnNumber) => {
      cell.border = excelBorder();
      cell.alignment = {
        vertical: "middle",
        horizontal: moneyColumns.includes(columnNumber) ? "right" : "left",
      };
      if (moneyColumns.includes(columnNumber)) {
        cell.numFmt = `"${currency}" #,##0`;
      }
      if (rowNumber % 2 === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFBFDFC" },
        };
      }
    });
  });
}

function excelBorder() {
  return {
    top: { style: "thin" as const, color: { argb: "FFD5DDD9" } },
    left: { style: "thin" as const, color: { argb: "FFD5DDD9" } },
    bottom: { style: "thin" as const, color: { argb: "FFD5DDD9" } },
    right: { style: "thin" as const, color: { argb: "FFD5DDD9" } },
  };
}

function formatFileDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
