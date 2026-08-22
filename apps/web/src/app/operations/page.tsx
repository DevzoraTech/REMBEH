"use client";

import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
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
import { Money } from "../../components/app/money";
import { AppBootSkeleton, SkeletonBlock } from "../../components/app/skeleton";
import { CashShortagesPanel } from "../../components/operations/cash-shortages-panel";
import {
  buildDailyReportDocumentFromOperation,
  DailyReconciliationReport,
  type DailyReportViewTab,
} from "../../components/reports/daily-reconciliation-report";
import { exportDailyReconciliationPdf } from "../../components/reports/daily-reconciliation-pdf";
import { formatMoney } from "../owner/owner-common";
import { OwnerHeader, Tooltip } from "../owner/owner-header";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  clearAuthState,
  isSessionExpired,
  readAuthState,
  refreshAuthSession,
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
  loansByProduct?: Array<{
    product: string;
    count: number;
    amount: number;
    recoveredToday?: number;
    outstandingBalance?: number;
  }>;
  repaymentsByProduct?: Array<{
    product: string;
    count?: number;
    transactions?: number;
    amount: number;
  }>;
  feesByProduct?: Array<{
    product: string;
    count?: number;
    transactions?: number;
    amount: number;
  }>;
  previousReportReference?: {
    reportNumber: string;
    operationDate: string;
    amount: number;
  } | null;
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
  awaitingReportOperation: OperationCarryover | null;
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
  shortageResponsibleUserId: string;
};

type OperationActionPanel =
  | "top-up"
  | "expense"
  | "issue-float"
  | "add-float"
  | "agent-return"
  | "close-day"
  | null;

type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  tone: "red" | "gold" | "blue";
  action?: Exclude<OperationActionPanel, null>;
  actionLabel?: string;
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
  shortageResponsibleUserId: "",
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
  const [topUpForm, setTopUpForm] = useState<TopUpForm>(emptyTopUpForm);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpenseForm);
  const [floatForm, setFloatForm] = useState<FloatForm>(emptyFloatForm);
  const [floatTopUpForm, setFloatTopUpForm] =
    useState<FloatForm>(emptyFloatForm);
  const [agentReturnForm, setAgentReturnForm] =
    useState<AgentReturnForm>(emptyAgentReturnForm);
  const [closingForm, setClosingForm] = useState<ClosingForm>(emptyClosingForm);
  const [reportView, setReportView] = useState<DailyReportViewTab>("summary");
  const [managerReportNotes, setManagerReportNotes] = useState("");
  const [ownerReportNotes, setOwnerReportNotes] = useState("");
  const [activePanel, setActivePanel] = useState<OperationActionPanel>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(false);
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
  const awaitingReportOperation = data?.awaitingReportOperation ?? null;
  const canFinishOpenOperation = Boolean(
    canOperateBranch && operation && operation.status === "OPEN",
  );
  const canReconcileOperation = Boolean(
    canOperateBranch &&
      operation &&
      (operation.status === "OPEN" || operation.status === "CLOSING"),
  );

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const queryDate = params.get("date");
      const prompt = params.get("prompt");
      if (validDateInputValue(queryDate)) {
        setDate((current) => (queryDate === current ? current : queryDate!));
      }
      if (prompt === "close") {
        setNotice(
          "Close the previous branch day and submit its report. The next day opens automatically.",
        );
      } else if (prompt === "open") {
        setNotice(
          "Branch days open automatically after the previous close report is submitted.",
        );
      }
    }, 0);

    return () => window.clearTimeout(boot);
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
          setNotice(
            "Close the previous branch day, then submit its report. The next day opens automatically.",
          );
        } else if (payload.awaitingReportOperation) {
          setNotice(
            `Submit the close report for ${payload.awaitingReportOperation.operationDate} so the next day can open.`,
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
        let activeSession = auth.session;
        if (activeSession && isSessionExpired(activeSession)) {
          activeSession = await refreshAuthSession(activeSession, apiBaseUrl);
        }
        if (!activeSession) {
          clearAuthState();
          router.replace("/login");
          return;
        }

        const role = resolveOperatorRole(activeSession, auth.user);
        if (role === "staff") {
          router.replace("/dashboard");
          return;
        }

        setSession(activeSession);
        setWorkspace(auth.workspace);
        setUser(auth.user);
        setBranch(auth.branch);

        if (!activeSession.permissions.includes("operation.read")) {
          setError("You do not have access to daily operations.");
          setLoading(false);
          return;
        }

        if (role === "owner") {
          try {
            const branches = await loadBranchesForReports(activeSession);
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
            await loadOperation(activeSession, date, branchId);
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
          loadOperation(activeSession, date),
          loadAgentsForDay(activeSession, date),
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

  async function recordTopUp() {
    if (!session || !activeBranch || recordingTopUp) return;
    if (!canFinishOpenOperation) {
      setError("Only an open branch day can be changed.");
      return;
    }
    const amount = Number(topUpForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid capital top-up amount.");
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
      setNotice("Capital top-up recorded.");
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
      setError("Choose a field officer.");
      return;
    }
    const amount = Number(targetForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid float amount.");
      return;
    }
    if (operation && amount > operation.floatRemaining) {
      setError(
        `Float exceeds available branch cash. Available: ${formatMoney(
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
      setNotice("Field officer return recorded.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not record field officer return.",
      );
    } finally {
      setRecordingAgentReturn(false);
    }
  }

  async function closeBranch() {
    if (!session || !activeBranch || closing) return;
    if (!canReconcileOperation) {
      setError("Only an active branch day can be reconciled.");
      return;
    }
    const countedCash = Number(closingForm.countedCash);
    if (!Number.isFinite(countedCash) || countedCash < 0) {
      setError("Enter counted branch cash.");
      return;
    }
    setClosing(true);
    setError(null);
    setNotice(null);
    try {
      const headers = {
        Authorization: `${session.tokenType} ${session.accessToken}`,
        "Content-Type": "application/json",
      };
      const body = {
        branchId: activeBranch.id,
        date,
        notes: closingForm.notes.trim() || undefined,
      };
      const startResponse = await fetch(
        `${apiBaseUrl}/operations/reconciliation/start`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        },
      );
      const startPayload = await readApiJson<OperationResponse>(startResponse);
      if (!startResponse.ok) {
        throw new Error(formatApiError(startPayload.message));
      }

      const countResponse = await fetch(
        `${apiBaseUrl}/operations/reconciliation/cash-count`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...body,
            countedCash,
          }),
        },
      );
      const countPayload = await readApiJson<OperationResponse>(countResponse);
      if (!countResponse.ok) {
        throw new Error(formatApiError(countPayload.message));
      }

      const response = await fetch(
        `${apiBaseUrl}/operations/reconciliation/submit`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...body,
            shortageResponsibleUserId:
              closingForm.shortageResponsibleUserId || undefined,
          }),
        },
      );
      const payload = await readApiJson<OperationResponse>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setData(payload);
      if (payload.date) {
        setDate(payload.date);
        router.replace(`/operations?date=${encodeURIComponent(payload.date)}`);
      }
      setClosingForm(emptyClosingForm);
      setActivePanel(null);
      setNotice(
        payload.operation?.status === "OPEN"
          ? "Report sent. Next day is open."
          : "Report sent to owner.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not send reconciliation report.",
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
      if (payload.date) {
        setDate(payload.date);
        router.replace(`/operations?date=${encodeURIComponent(payload.date)}`);
      }
      setManagerReportNotes("");
      setNotice(
        payload.operation?.status === "OPEN"
          ? "Report sent. Next day is open."
          : "Report sent to owner.",
      );
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

  async function exportDailyOperationReport(format: "excel" | "pdf") {
    if (!operation || !report || exportingReport) return;
    setExportingReport(true);
    setError(null);
    setNotice(null);

    try {
      if (format === "pdf") {
        const document = buildDailyReportDocumentFromOperation(
          operation,
          report,
          workspace?.currency ?? "UGX",
        );
        exportDailyReconciliationPdf(document);
        setNotice("PDF ready — use Print to save the document.");
        return;
      }

      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      const exportedAt = new Date();
      const currency = workspace?.currency ?? "UGX";
      const reportRows = buildExcelRows(operation);
      const headers = [
        "Section",
        "Description",
        "Count",
        "Inflow",
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

      const agentSheet = workbook.addWorksheet("Officer handover");
      const agentHeaders = [
        "Agent",
        "Agent Id",
        "Float Received",
        "Loans Issued",
        "Repayments",
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
          "Capital top-up",
          topUp.description || "Capital top-up",
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
      setNotice("Excel report downloaded.");
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
    setNotice(
      "Close this branch day and submit its report. The next day opens automatically.",
    );
    setError(null);
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

  function goToAwaitingReport() {
    if (!awaitingReportOperation) return;
    setNotice(
      "Submit this close report so the next day can open automatically.",
    );
    setError(null);
    setDate(awaitingReportOperation.operationDate);
    router.replace(
      `/operations?date=${encodeURIComponent(
        awaitingReportOperation.operationDate,
      )}`,
    );
  }

  if (!session) {
    return <AppBootSkeleton />;
  }

  const operationStatusLabel = operation
    ? operation.status === "OPEN"
      ? "Day open"
      : operation.status === "CLOSED"
        ? "Day closed"
        : "Closing"
    : pendingClosureOperation
      ? "Previous day open"
      : awaitingReportOperation
        ? "Report needed"
        : "Opening day…";

  return (
    <AppShell
      session={session}
      workspace={workspace}
      user={user}
      branch={operatorRole === "manager" ? branch : null}
    >
      <div className="mx-auto max-w-[1440px] space-y-3.5">
        <OwnerHeader
          subtitle={`${selectedReportBranch?.name ?? "Operations"} · ${formatDateOnly(date)}`}
          title={
            operatorRole === "owner" ? "Operation Reports" : "Daily Operations"
          }
          showReportsButton={operatorRole === "manager"}
          settingsHref={
            operatorRole === "owner" ? "/owner/settings" : "/settings"
          }
          reportsHref={operatorRole === "owner" ? "/owner/reports" : "/reports"}
          notificationScope={operatorRole === "owner" ? "owner" : "manager"}
          actions={
            <>
              {operatorRole === "owner" ? (
                <Tooltip label="Choose which branch report to inspect.">
                  <label className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold text-[#0b1220] shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
                    <Building2 className="size-3.5 text-slate-400" />
                    <select
                      value={selectedBranchId}
                      onChange={(event) => {
                        setNotice(null);
                        setError(null);
                        setData(null);
                        setSelectedBranchId(event.target.value);
                      }}
                      className="min-w-[160px] bg-transparent outline-none"
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
                </Tooltip>
              ) : (
                <span className="inline-flex h-9 items-center rounded-xl border border-[#e6ebf0] bg-white px-3 text-[11px] font-semibold text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
                  {operationStatusLabel}
                </span>
              )}
              <Tooltip label="Choose the operations day.">
                <label className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold text-[#0b1220] shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
                  <CalendarDays className="size-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => {
                      setNotice(null);
                      setError(null);
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
              </Tooltip>
              <Tooltip label="Refresh this day's operations.">
                <button
                  type="button"
                  className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:border-emerald-200 hover:bg-emerald-50 disabled:opacity-60"
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
                  aria-label="Refresh operations"
                >
                  <RefreshCw
                    className={`size-4 ${loading ? "animate-spin" : ""}`}
                  />
                </button>
              </Tooltip>
            </>
          }
        />

        {notice ? (
          <p className="rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-[var(--forest-emerald)]">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {loading && !data ? (
          <OperationsSkeleton />
        ) : !activeBranch ? (
          <div className="rounded-[16px] border border-[#e6ebf0] bg-white px-5 py-8 text-sm font-medium text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
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
          <>
            <OpenOperationView
              operation={operation}
              currency={workspace?.currency ?? "UGX"}
              canOperateBranch={canOperateBranch}
              editable={canFinishOpenOperation}
              canRecordTopUp={canRecordTopUp}
              canRecordReturn={canRecordReturn}
              canRecordExpense={canRecordExpense}
              canManageFloat={canManageFloat}
              canClose={canClose}
              canReconcile={canReconcileOperation}
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
              onExportReport={(format) =>
                void exportDailyOperationReport(format)
              }
              onAction={openActionPanel}
            />
            {session && activeBranch && canOperateBranch ? (
              <div className="mt-3">
                <CashShortagesPanel
                  session={session}
                  branchId={activeBranch.id}
                  canRecordPayment={canClose}
                />
              </div>
            ) : null}
          </>
        ) : pendingClosureOperation ? (
          <PendingClosureView
            pendingOperation={pendingClosureOperation}
            onReview={goToPendingClosure}
          />
        ) : awaitingReportOperation ? (
          <AwaitingReportView
            awaitingOperation={awaitingReportOperation}
            onReview={goToAwaitingReport}
          />
        ) : (
          <AutoOpenPendingView branch={activeBranch} date={date} />
        )}
        <OperationActionDrawer
          panel={activePanel}
          operation={operation}
          agents={agents}
          assignableAgents={assignableAgents}
          addFloatOptions={addFloatOptions}
          pendingAgentReturns={pendingAgentReturns}
          editable={canFinishOpenOperation}
          canReconcile={canReconcileOperation}
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
    <section className="overflow-hidden rounded-[16px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_280px] lg:items-center">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-amber-700">
            Action required
          </p>
          <h2 className="mt-2 text-[clamp(1.2rem,1.5vw,1.55rem)] font-bold tracking-[-0.02em] text-[#0b1220]">
            Close {formatDateOnly(pendingOperation.operationDate)} first
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">
            Finish returns, close cash, and submit that report. The next day
            opens automatically afterward — no separate open step.
          </p>
        </div>
        <div className="rounded-[14px] border border-amber-200 bg-white p-4 shadow-[0_10px_24px_rgba(245,158,11,0.12)]">
          <p className="text-[11px] font-semibold text-amber-700">Open day</p>
          <p className="mt-1 text-xl font-bold text-[#0b1220]">
            {formatDateOnly(pendingOperation.operationDate)}
          </p>
          <button
            type="button"
            onClick={onReview}
            className="mt-4 flex h-10 w-full items-center justify-center rounded-xl bg-[#003f35] text-xs font-semibold text-white shadow-[0_10px_20px_rgba(0,63,53,0.2)]"
          >
            Close this day
          </button>
        </div>
      </div>
    </section>
  );
}

function AwaitingReportView({
  awaitingOperation,
  onReview,
}: {
  awaitingOperation: OperationCarryover;
  onReview: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[16px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_280px] lg:items-center">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-amber-700">
            Report required
          </p>
          <h2 className="mt-2 text-[clamp(1.2rem,1.5vw,1.55rem)] font-bold tracking-[-0.02em] text-[#0b1220]">
            Submit the {formatDateOnly(awaitingOperation.operationDate)} report
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">
            That day is closed. Send the report to open the next day
            automatically with the closing balance carried forward.
          </p>
        </div>
        <div className="rounded-[14px] border border-amber-200 bg-white p-4 shadow-[0_10px_24px_rgba(245,158,11,0.12)]">
          <p className="text-[11px] font-semibold text-amber-700">Closed day</p>
          <p className="mt-1 text-xl font-bold text-[#0b1220]">
            {formatDateOnly(awaitingOperation.operationDate)}
          </p>
          <button
            type="button"
            onClick={onReview}
            className="mt-4 flex h-10 w-full items-center justify-center rounded-xl bg-[#003f35] text-xs font-semibold text-white shadow-[0_10px_20px_rgba(0,63,53,0.2)]"
          >
            Open report
          </button>
        </div>
      </div>
    </section>
  );
}

function AutoOpenPendingView({
  branch,
  date,
}: {
  branch: OperationBranch;
  date: string;
}) {
  return (
    <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--forest-emerald)]">
        Daily operations
      </p>
      <h2 className="mt-2 text-lg font-bold tracking-[-0.02em] text-[#0b1220]">
        Preparing {formatDateOnly(date)} for {branch.name}
      </h2>
      <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">
        Branch days open automatically after the previous day is closed and its
        report is submitted. Refresh if this stays empty.
      </p>
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
    <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_280px] lg:items-center">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--forest-emerald)]">
            Branch report
          </p>
          <h2 className="mt-2 text-[clamp(1.2rem,1.5vw,1.55rem)] font-bold tracking-[-0.02em] text-[#0b1220]">
            No operation report for {formatDateOnly(date)}
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">
            {pendingOperation
              ? `The manager still needs to close ${formatDateOnly(
                  pendingOperation.operationDate,
                )} before the next report can be prepared.`
              : "This branch has not opened operations for the selected day."}
          </p>
        </div>
        <div className="rounded-[14px] border border-[#e6ebf0] bg-[#f8faf9] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500">
            Branch
          </p>
          <p className="mt-1 text-lg font-bold text-[#0b1220]">{branch.name}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {branch.address || "Address not set"}
          </p>
        </div>
      </div>
    </section>
  );
}

function OpenOperationView({
  operation,
  currency,
  canOperateBranch,
  editable,
  canRecordTopUp,
  canRecordReturn,
  canRecordExpense,
  canManageFloat,
  canClose,
  canReconcile,
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
  currency: string;
  canOperateBranch: boolean;
  editable: boolean;
  canRecordTopUp: boolean;
  canRecordReturn: boolean;
  canRecordExpense: boolean;
  canManageFloat: boolean;
  canClose: boolean;
  canReconcile: boolean;
  loadingAgents: boolean;
  pendingReturnsCount: number;
  assignableAgentsCount: number;
  addFloatAgentsCount: number;
  report: DailyOperationReport | null;
  reportView: DailyReportViewTab;
  canReviewReport: boolean;
  canApproveReport: boolean;
  managerReportNotes: string;
  ownerReportNotes: string;
  reviewingReport: boolean;
  approvingReport: boolean;
  exportingReport: boolean;
  setReportView: (view: DailyReportViewTab) => void;
  setManagerReportNotes: (value: string) => void;
  setOwnerReportNotes: (value: string) => void;
  onManagerConfirmReport: () => void;
  onOwnerApproveReport: () => void;
  onExportReport: (format: "excel" | "pdf") => void;
  onAction: (panel: Exclude<OperationActionPanel, null>) => void;
}) {
  if (operation.status === "CLOSED") {
    if (!report) {
      return (
        <section className="rounded-[14px] border border-[#e6ebf0] bg-white px-4 py-4 text-sm font-medium text-slate-500">
          Preparing close-day report...
        </section>
      );
    }

    const document = buildDailyReportDocumentFromOperation(
      operation,
      report,
      currency,
    );
    const mode = canApproveReport
      ? "owner"
      : canReviewReport
        ? "manager"
        : "readonly";
    const comment = canApproveReport ? ownerReportNotes : managerReportNotes;
    const setComment = canApproveReport
      ? setOwnerReportNotes
      : setManagerReportNotes;

    return (
      <DailyReconciliationReport
        document={document}
        mode={mode}
        tab={reportView}
        onTabChange={setReportView}
        comment={comment}
        onCommentChange={setComment}
        acting={reviewingReport || approvingReport}
        exporting={exportingReport}
        onExportExcel={() => onExportReport("excel")}
        onExportPdf={() => onExportReport("pdf")}
        onPrimaryAction={
          canApproveReport && report.status === "SENT_TO_OWNER"
            ? onOwnerApproveReport
            : canReviewReport &&
                (report.status === "MANAGER_REVIEW" ||
                  report.status === "RETURNED_TO_MANAGER")
              ? onManagerConfirmReport
              : undefined
        }
      />
    );
  }

  const allReturnsRecorded =
    operation.agentsReturnedCount === operation.agentsWithFloatCount;
  const cashPosition =
    operation.closingBalance ?? operation.branchCashRemaining;
  const unresolvedExpenses = operation.expenses.filter(
    (expense) => expense.approvedAt == null,
  ).length;
  const agentsOut = operation.agentsWithFloatCount;
  const agentsBack = operation.agentsReturnedCount;
  const attentionItems: AttentionItem[] = [
    pendingReturnsCount > 0
      ? {
          id: "pending-returns",
          title: `${pendingReturnsCount} field officer return${pendingReturnsCount === 1 ? "" : "s"} outstanding`,
          detail:
            "Field officers still out with float must hand cash back before close.",
          tone: "red" as const,
          action: "agent-return" as const,
          actionLabel: "Record return",
        }
      : null,
    operation.floatRemaining > 0 && editable
      ? {
          id: "float-left",
          title: `${formatMoney(operation.floatRemaining)} cash available for float`,
          detail: "Issue float to field officers from branch cash on hand.",
          tone: "gold" as const,
          action: "issue-float" as const,
          actionLabel: "Issue float",
        }
      : null,
    unresolvedExpenses > 0
      ? {
          id: "expenses-pending",
          title: `${unresolvedExpenses} expense${unresolvedExpenses === 1 ? "" : "s"} need review`,
          detail: "Recorded expenses are still pending approval or follow-up.",
          tone: "blue" as const,
          action: "expense" as const,
          actionLabel: "Review",
        }
      : null,
  ].filter(Boolean) as AttentionItem[];

  return (
    <div className="space-y-3">
      <section className="rounded-[14px] border border-[#e6ebf0] bg-white px-3.5 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <StatusChip
              tone={
                operation.status === "OPEN"
                  ? "green"
                  : operation.status === "CLOSING"
                    ? "amber"
                    : "slate"
              }
              label={
                operation.status === "OPEN"
                  ? "Open"
                  : operation.status === "CLOSING"
                    ? "Closing"
                    : "Closed"
              }
            />
            <StatusChip
              tone="slate"
              label={`${agentsBack}/${agentsOut || 0} officers back`}
            />
            <StatusChip
              tone={operation.floatRemaining > 0 ? "amber" : "slate"}
              label={`${formatMoney(operation.floatRemaining)} cash for float`}
            />
            {pendingReturnsCount > 0 ? (
              <StatusChip
                tone="amber"
                label={`${pendingReturnsCount} return${pendingReturnsCount === 1 ? "" : "s"} due`}
              />
            ) : null}
          </div>
          {canOperateBranch ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <ActionChip
                icon={<PlusCircle className="size-3.5" />}
                label="Capital"
                disabled={!editable || !canRecordTopUp}
                onClick={() => onAction("top-up")}
              />
              <ActionChip
                icon={<ReceiptText className="size-3.5" />}
                label="Expense"
                disabled={!editable || !canRecordExpense}
                onClick={() => onAction("expense")}
              />
              <ActionChip
                icon={<UserRoundPlus className="size-3.5" />}
                label="Issue float"
                disabled={
                  !editable ||
                  !canManageFloat ||
                  loadingAgents ||
                  assignableAgentsCount === 0 ||
                  operation.floatRemaining <= 0
                }
                onClick={() => onAction("issue-float")}
              />
              <ActionChip
                icon={<CircleDollarSign className="size-3.5" />}
                label="Add float"
                disabled={
                  !editable ||
                  !canManageFloat ||
                  addFloatAgentsCount === 0 ||
                  operation.floatRemaining <= 0
                }
                onClick={() => onAction("add-float")}
              />
              <ActionChip
                icon={<RotateCcw className="size-3.5" />}
                label="Return"
                disabled={
                  !editable || !canRecordReturn || pendingReturnsCount === 0
                }
                tone={pendingReturnsCount > 0 ? "amber" : "default"}
                onClick={() => onAction("agent-return")}
              />
              <ActionChip
                icon={<LockKeyhole className="size-3.5" />}
                label="Close day"
                primary
                disabled={!canReconcile || !canClose || !allReturnsRecorded}
                onClick={() => onAction("close-day")}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
        <DayTopStat
          icon={<WalletCards className="size-5" />}
          label="Cash Left"
          value={<Money value={cashPosition} currency="UGX" />}
          hint={
            <>
              Opening{" "}
              <Money value={operation.cashAvailableAtOpening} currency="UGX" />
            </>
          }
          tooltip="Cash currently on hand at the branch for this operations day."
          tone="green"
        />
        <DayTopStat
          icon={<Landmark className="size-5" />}
          label="Expected Close"
          value={
            <Money value={operation.expectedClosingBalance} currency="UGX" />
          }
          hint="Target Cash Left"
          tooltip="Expected cash left after float, returns, and expenses."
          tone="green"
        />
        <DayTopStat
          icon={<UserRoundPlus className="size-5" />}
          label="Float out"
          value={<Money value={operation.floatIssued} currency="UGX" />}
          hint={
            <>
              <Money value={operation.floatRemaining} currency="UGX" /> cash
              available
            </>
          }
          tooltip="Total float issued to field officers today, with branch cash still available to issue."
          tone="gold"
        />
        <DayTopStat
          icon={<RotateCcw className="size-5" />}
          label="Cash returned"
          value={
            <Money value={operation.cashReturnedByAgents} currency="UGX" />
          }
          hint={`${agentsBack} of ${agentsOut || 0} officers back`}
          tooltip="Cash returned by field officers so far today."
          tone="blue"
        />
        <DayTopStat
          icon={<Banknote className="size-5" />}
          label="Repayments"
          value={<Money value={operation.collectionsReceived} currency="UGX" />}
          hint={
            <>
              {operation.loansIssuedCount} loans ·{" "}
              <Money value={operation.expensesTotal} currency="UGX" /> expenses
            </>
          }
          tooltip="Repayments received today, with loans issued and expenses recorded."
          tone="violet"
          className="sm:col-span-2 xl:col-span-1"
        />
      </section>

      <section className="grid gap-3 xl:grid-cols-[0.95fr_1.35fr]">
        <CashMovementCard operation={operation} />
        <AgentFloatBoard
          operation={operation}
          onIssueFloat={
            canOperateBranch ? () => onAction("issue-float") : undefined
          }
          canIssue={
            editable &&
            canManageFloat &&
            !loadingAgents &&
            assignableAgentsCount > 0 &&
            operation.floatRemaining > 0
          }
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <DayExpensesStrip
          operation={operation}
          onRecordExpense={() => onAction("expense")}
          canRecord={editable && canRecordExpense}
        />
        <DayAttentionCard
          items={attentionItems}
          closed={false}
          canOperate={canOperateBranch && editable}
          onAction={onAction}
          onCloseDay={
            canOperateBranch && canReconcile && canClose && allReturnsRecorded
              ? () => onAction("close-day")
              : undefined
          }
        />
      </section>
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
  onExport: (format: "excel" | "pdf") => void;
}) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f5] bg-[#f8faf9]/80 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--forest-emerald)]">
            Close-day report
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[#0b1220]">
            {report.reportNumber}
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {operation.branchName} · {formatDateOnly(report.operationDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportStatusBadge status={report.status} />
          <div className="flex rounded-xl border border-[#e6ebf0] bg-white p-1 shadow-[0_6px_16px_rgba(15,23,42,0.04)]">
            <ReportViewButton
              active={view === "report"}
              icon={<FileText className="size-3.5" />}
              label="Summary"
              onClick={() => setView("report")}
            />
            <ReportViewButton
              active={view === "excel"}
              icon={<FileSpreadsheet className="size-3.5" />}
              label="Ledger"
              onClick={() => setView("excel")}
            />
          </div>
          <div className="relative">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3.5 text-xs font-semibold text-[#0b1220] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-emerald-50 disabled:opacity-55"
              disabled={exporting}
              aria-expanded={exportMenuOpen}
              aria-haspopup="menu"
              onClick={() => setExportMenuOpen((open) => !open)}
            >
              {exporting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Export
              <ChevronDown className="size-3.5 text-slate-400" />
            </button>
            {exportMenuOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  aria-label="Close export menu"
                  onClick={() => setExportMenuOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-1.5 w-[220px] rounded-xl border border-[#e6ebf0] bg-white p-1 shadow-[0_14px_34px_rgba(15,23,42,0.16)]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6]"
                    onClick={() => {
                      setExportMenuOpen(false);
                      onExport("excel");
                    }}
                  >
                    <FileSpreadsheet className="size-3.5 text-slate-500" />
                    <span>
                      <span className="block">Excel</span>
                      <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                        Matches ledger view
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6]"
                    onClick={() => {
                      setExportMenuOpen(false);
                      onExport("pdf");
                    }}
                  >
                    <FileText className="size-3.5 text-slate-500" />
                    <span>
                      <span className="block">PDF document</span>
                      <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                        Matches summary view
                      </span>
                    </span>
                  </button>
                </div>
              </>
            ) : null}
          </div>
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
      className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition ${
        active
          ? "bg-emerald-50 text-[var(--forest-emerald)]"
          : "text-slate-500 hover:bg-[#f8faf9] hover:text-[#0b1220]"
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
          value={
            <Money value={operation.cashAvailableAtOpening} currency="UGX" />
          }
        />
        <ReportMetric
          label="Float Distributed"
          value={<Money value={operation.floatIssued} currency="UGX" />}
        />
        <ReportMetric
          label="Returned Cash"
          value={
            <Money value={operation.cashReturnedByAgents} currency="UGX" />
          }
        />
        <ReportMetric
          label="Expenses"
          value={<Money value={operation.expensesTotal} currency="UGX" />}
          danger
        />
        <ReportMetric
          label="Expected Close"
          value={
            <Money value={operation.expectedClosingBalance} currency="UGX" />
          }
          highlight
        />
        <ReportMetric
          label="Counted Cash"
          value={<Money value={operation.closingBalance ?? 0} currency="UGX" />}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ReportBlock title="Opening Cash">
          <StatementRow
            label="Previous closing balance"
            value={<Money value={operation.openingBalance} currency="UGX" />}
          />
          <StatementRow
            label="Capital top-ups today"
            value={<Money value={operation.topUpsTotal} currency="UGX" />}
          />
          <StatementRow
            label="Opening capital"
            value={
              <Money value={operation.cashAvailableAtOpening} currency="UGX" />
            }
            strong
          />
        </ReportBlock>
        <ReportBlock title="Closing Result">
          <StatementRow
            label="Expected closing balance"
            value={
              <Money value={operation.expectedClosingBalance} currency="UGX" />
            }
            strong
          />
          <StatementRow
            label="Counted cash"
            value={
              <Money value={operation.closingBalance ?? 0} currency="UGX" />
            }
          />
          <StatementRow
            label="Variance"
            value={<VarianceLabel value={operation.closingVariance} />}
            danger={(operation.closingVariance ?? 0) !== 0}
          />
        </ReportBlock>
      </div>

      <ReportBlock title="Field Activity">
        <div className="grid gap-2 sm:grid-cols-4">
          <ReportMiniStat
            label="Loans issued"
            value={`${operation.loansIssuedCount}`}
            hint={
              <Money value={operation.loansIssuedPrincipal} currency="UGX" />
            }
          />
          <ReportMiniStat
            label="Repayments"
            value={`${operation.collectionsCount}`}
            hint={
              <Money value={operation.collectionsReceived} currency="UGX" />
            }
          />
          <ReportMiniStat
            label="Processing fees"
            value={
              <Money value={operation.processingFeesTotal} currency="UGX" />
            }
            hint="Included in handover"
          />
          <ReportMiniStat
            label="Officers returned"
            value={`${operation.agentsReturnedCount}/${operation.agentsWithFloatCount}`}
            hint={
              <Money
                value={operation.expectedAgentReturnTotal}
                currency="UGX"
              />
            }
          />
        </div>
      </ReportBlock>

      <ReportAgentTable operation={operation} />

      <div className="grid gap-3 lg:grid-cols-2">
        <ReportRecordList
          title="Capital top-ups"
          empty="No capital top-ups recorded."
          rows={operation.topUps.map((topUp) => ({
            id: topUp.id,
            label: topUp.description || "Capital top-up",
            meta: `${formatClock(topUp.addedAt)} · ${topUp.recordedByName}`,
            value: <Money value={topUp.amount} currency="UGX" />,
          }))}
        />
        <ReportRecordList
          title="Expenses"
          empty="No expenses recorded."
          rows={operation.expenses.map((expense) => ({
            id: expense.id,
            label: categoryLabel(expense.category),
            meta: `${formatClock(expense.incurredAt)} · ${expense.recordedByName}`,
            value: <Money value={expense.amount} currency="UGX" />,
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
    "Inflow",
    "Cash Out",
    "Balance",
    "Notes",
  ];
  const finalRowNumber = rows.length + 6;

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#d7e3de] bg-[#f3f7f5] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <div className="flex items-center gap-2 border-b border-[#d7e3de] bg-[#eef3f0] px-3.5 py-2.5 text-[11px] font-semibold text-slate-600">
        <span className="rounded-md border border-[#d7e3de] bg-white px-2 py-1 text-[10px] font-bold text-slate-500">
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
    <aside className="rounded-[14px] border border-[#e6ebf0] bg-[#f8faf9] p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[var(--forest-emerald)] shadow-[0_6px_16px_rgba(15,23,42,0.05)]">
          <ClipboardCheck className="size-4" />
        </span>
        <div>
          <p className="text-sm font-bold text-[#0b1220]">Review flow</p>
          <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
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
            label="Manager notes"
            value={managerNotes}
            onChange={setManagerNotes}
          />
          <button
            type="button"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#003f35] text-xs font-semibold text-white shadow-[0_12px_24px_rgba(0,63,53,0.22)] disabled:opacity-55"
            disabled={reviewing}
            onClick={onManagerConfirm}
          >
            {reviewing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            Send to owner
          </button>
        </div>
      ) : null}

      {waitingForOwner && canApproveReport ? (
        <div className="mt-4 space-y-3">
          <TextAreaField
            label="Owner notes"
            value={ownerNotes}
            onChange={setOwnerNotes}
          />
          <button
            type="button"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#003f35] text-xs font-semibold text-white shadow-[0_12px_24px_rgba(0,63,53,0.22)] disabled:opacity-55"
            disabled={approving}
            onClick={onOwnerApprove}
          >
            {approving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            Approve report
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
  value: ReactNode;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        highlight
          ? "border-emerald-200 bg-emerald-50"
          : danger
            ? "border-amber-200 bg-amber-50"
            : "border-[#e6ebf0] bg-[#f8faf9]"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-sm font-bold tabular-nums ${
          highlight ? "text-[var(--forest-emerald)]" : "text-[#0b1220]"
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
    <section className="overflow-hidden rounded-[14px] border border-[#e6ebf0] bg-white">
      <header className="border-b border-[#edf1f5] bg-[#f8faf9] px-3.5 py-2.5">
        <p className="text-xs font-bold text-[#0b1220]">{title}</p>
      </header>
      <div className="space-y-1.5 p-3.5">{children}</div>
    </section>
  );
}

function ReportMiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#edf1f5] bg-[#fbfcfd] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold tabular-nums text-[#0b1220]">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
        {hint}
      </p>
    </div>
  );
}

function ReportAgentTable({ operation }: { operation: DailyOperation }) {
  return (
    <ReportBlock title="Officer handover">
      {operation.agentReturns.length === 0 ? (
        <p className="py-2 text-sm text-slate-500">
          No agent float was issued for this day.
        </p>
      ) : (
        <table className="w-full table-fixed text-left text-[11px]">
          <thead className="bg-[#e8edf2] text-[10px] font-bold text-slate-600">
            <tr>
              <th className="w-[25%] py-1 pr-2">Agent</th>
              <th className="w-[15%] px-2 py-1 text-right">Float</th>
              <th className="w-[15%] px-2 py-1 text-right">Loans</th>
              <th className="w-[15%] px-2 py-1 text-right">Repayments</th>
              <th className="w-[15%] px-2 py-1 text-right">Fees</th>
              <th className="w-[15%] pl-2 py-1 text-right">Returned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf1f5]">
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
      <Money value={value} currency="UGX" />
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
  rows: { id: string; label: string; meta: string; value: ReactNode }[];
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
    <div className="rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-[#0b1220]">{value}</p>
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
    <div className="rounded-xl border border-[#e6ebf0] bg-white px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-[#0b1220]">
        {name ?? "Pending"}
      </p>
      {date ? (
        <p className="mt-0.5 text-[11px] font-medium text-slate-500">
          {formatDateTime(date)}
        </p>
      ) : null}
      {note ? (
        <p className="mt-2 text-xs font-medium leading-5 text-slate-600">
          {note}
        </p>
      ) : null}
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
          : "border-[#e6ebf0] bg-[#f8faf9] text-slate-600";
  return (
    <span
      className={`inline-flex rounded-xl border px-3 py-2 text-xs font-bold ${className}`}
    >
      {label}
    </span>
  );
}

function StatusChip({
  label,
  tone = "slate",
}: {
  label: string;
  tone?: "slate" | "green" | "amber" | "rose" | "blue";
}) {
  const tones = {
    slate: "border-[#e6ebf0] bg-[#f8fafc] text-slate-600",
    green: "border-emerald-200 bg-emerald-50 text-[#0c6b4f]",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    blue: "border-sky-200 bg-sky-50 text-sky-800",
  } as const;
  return (
    <span
      className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-semibold ${tones[tone]}`}
    >
      {label}
    </span>
  );
}

function ActionChip({
  icon,
  label,
  disabled,
  primary = false,
  tone = "default",
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  tone?: "default" | "amber";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? "bg-[#003f35] text-white hover:brightness-110"
          : tone === "amber"
            ? "border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
            : "border border-[#e6ebf0] bg-white text-[#0b1220] hover:border-emerald-200 hover:bg-emerald-50/70"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function DayTopStat({
  icon,
  label,
  value,
  hint,
  tooltip,
  tone,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint: ReactNode;
  tooltip: string;
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
      <Tooltip label={tooltip} block>
        <article className="flex h-full min-h-[88px] w-full min-w-0 items-center gap-2.5 rounded-[13px] border border-[#e6ebf0] bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneClass}`}
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium text-slate-500">
              {label}
            </p>
            <p className="mt-1 min-w-0 break-words text-[clamp(0.72rem,0.9vw,1rem)] font-bold leading-tight tabular-nums text-[#0b1220]">
              {value}
            </p>
            <p className="mt-1 truncate text-[11px] font-medium text-slate-500">
              {hint}
            </p>
          </div>
        </article>
      </Tooltip>
    </div>
  );
}

function CashMovementCard({ operation }: { operation: DailyOperation }) {
  const rows = [
    {
      label: "Previous close",
      detail: "Opening Cash",
      amount: operation.openingBalance,
      signed: "neutral" as const,
      tone: "slate" as const,
    },
    {
      label: "Capital",
      detail: `${operation.topUpsCount} recorded`,
      amount: operation.topUpsTotal ?? operation.cashAddedToday,
      signed: "plus" as const,
      tone: "green" as const,
    },
    {
      label: "Float out",
      detail: `${operation.agentsWithFloatCount} agent${operation.agentsWithFloatCount === 1 ? "" : "s"}`,
      amount: operation.floatIssued,
      signed: "minus" as const,
      tone: "amber" as const,
    },
    {
      label: "Returns in",
      detail: `${operation.agentsReturnedCount} back`,
      amount: operation.cashReturnedByAgents,
      signed: "plus" as const,
      tone: "blue" as const,
    },
    {
      label: "Expenses",
      detail: `${operation.expensesCount} logged`,
      amount: operation.expensesTotal,
      signed: "minus" as const,
      tone: "rose" as const,
    },
  ];

  const dot = {
    slate: "bg-slate-300",
    green: "bg-[#19a876]",
    amber: "bg-amber-500",
    blue: "bg-sky-500",
    rose: "bg-rose-500",
  } as const;
  const amountTone = {
    slate: "text-[#0b1220]",
    green: "text-[var(--forest-emerald)]",
    amber: "text-amber-700",
    blue: "text-sky-700",
    rose: "text-rose-700",
  } as const;

  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-3 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#0b1220]">Cash movement</p>
          <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500">
            {operation.openedByName} · {formatDateTime(operation.openedAt)}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-[0.04em] text-[#0c6b4f]">
            Close
          </p>
          <p className="text-[11px] font-bold tabular-nums text-[var(--forest-emerald)]">
            <Money value={operation.expectedClosingBalance} currency="UGX" />
          </p>
        </div>
      </div>

      <div className="mt-2.5 -mx-1 grid grid-cols-[1fr_88px] gap-2 border-b border-[#dfe5eb] bg-[#e8edf2] px-2 py-1.5 text-[10px] font-semibold text-slate-600">
        <span>Line item</span>
        <span className="text-right">Amount</span>
      </div>
      <div className="divide-y divide-[#edf1f5]">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[1fr_88px] items-center gap-2 py-1.5"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`size-1.5 shrink-0 rounded-full ${dot[row.tone]}`}
              />
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-[#0b1220]">
                  {row.label}
                </p>
                <p className="truncate text-[10px] font-medium text-slate-500">
                  {row.detail}
                </p>
              </div>
            </div>
            <p
              className={`text-right text-[11px] font-bold tabular-nums ${amountTone[row.tone]}`}
            >
              <Money
                value={row.amount}
                currency="UGX"
                sign={
                  row.signed === "plus"
                    ? "+"
                    : row.signed === "minus"
                      ? "−"
                      : undefined
                }
              />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AgentFloatBoard({
  operation,
  onIssueFloat,
  canIssue,
}: {
  operation: DailyOperation;
  onIssueFloat?: () => void;
  canIssue?: boolean;
}) {
  const pendingCount = operation.agentReturns.filter(
    (row) => row.status === "PENDING",
  ).length;

  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-3 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#0b1220]">Officer float</p>
          <p className="mt-0.5 inline-flex flex-wrap items-baseline gap-1 text-[10px] font-medium text-slate-500">
            <span>
              {operation.agentReturns.length} agent
              {operation.agentReturns.length === 1 ? "" : "s"} ·
            </span>
            <Money value={operation.floatIssued} currency="UGX" />
            <span>
              issued
              {pendingCount > 0 ? ` · ${pendingCount} pending` : ""}
            </span>
          </p>
        </div>
        {onIssueFloat ? (
          <ActionChip
            icon={<UserRoundPlus className="size-3.5" />}
            label="Issue"
            primary
            disabled={!canIssue}
            onClick={onIssueFloat}
          />
        ) : null}
      </div>

      {operation.agentReturns.length === 0 ? (
        <div className="mt-2.5 rounded-xl border border-dashed border-[#e6ebf0] bg-[#fbfcfd] px-3 py-5 text-center">
          <p className="text-xs font-semibold text-[#0b1220]">
            No float issued yet
          </p>
          <p className="mt-1 text-[10px] font-medium text-slate-500">
            Issue float to start tracking field cash.
          </p>
          {onIssueFloat ? (
            <div className="mt-2.5 flex justify-center">
              <ActionChip
                icon={<UserRoundPlus className="size-3.5" />}
                label="Issue first float"
                disabled={!canIssue}
                onClick={onIssueFloat}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-2.5 hidden grid-cols-[minmax(0,1.25fr)_repeat(4,minmax(0,0.7fr))_68px] gap-2 border-b border-[#dfe5eb] bg-[#e8edf2] px-2 py-1.5 text-[10px] font-semibold text-slate-600 sm:grid">
            <span>Agent</span>
            <span className="text-right">Float</span>
            <span className="text-right">Loans</span>
            <span className="text-right">Collected</span>
            <span className="text-right">Handover</span>
            <span className="text-right">Status</span>
          </div>
          <div className="divide-y divide-[#edf1f5]">
            {operation.agentReturns.map((agentReturn) => (
              <div
                key={agentReturn.floatId}
                className={`grid gap-2 px-2 py-2 sm:grid-cols-[minmax(0,1.25fr)_repeat(4,minmax(0,0.7fr))_68px] sm:items-center ${
                  agentReturn.status === "PENDING"
                    ? "bg-amber-50/35"
                    : agentReturn.status === "SHORT"
                      ? "bg-red-50/35"
                      : agentReturn.status === "RETURNED"
                        ? "bg-emerald-50/25"
                        : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${
                      agentReturn.status === "RETURNED"
                        ? "bg-[#e9f8ef] text-[#07885f]"
                        : agentReturn.status === "PENDING"
                          ? "bg-[#fff3df] text-[#f28a17]"
                          : agentReturn.status === "SHORT"
                            ? "bg-red-50 text-red-600"
                            : "bg-[#eaf4ff] text-[#2078dc]"
                    }`}
                  >
                    {agentInitials(agentReturn.agentName)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-[#0b1220]">
                      {agentReturn.agentName}
                    </p>
                    <p className="truncate text-[10px] font-medium text-slate-500">
                      {agentReturn.agentPublicId ?? "No officer ID"}
                    </p>
                  </div>
                </div>
                <AgentTableCell label="Float" value={agentReturn.amountGiven} />
                <AgentTableCell
                  label="Loans"
                  value={agentReturn.amountDisbursed}
                />
                <AgentTableCell
                  label="Collected"
                  value={agentReturn.amountCollected}
                />
                <AgentTableCell
                  label="Handover"
                  value={agentReturn.expectedReturn}
                  strong
                />
                <div className="flex justify-start sm:justify-end">
                  <ReturnBadge status={agentReturn.status} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function AgentTableCell({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 sm:block sm:text-right">
      <span className="text-[10px] font-medium text-slate-400 sm:hidden">
        {label}
      </span>
      <p
        className={`text-[11px] tabular-nums ${
          strong
            ? "font-bold text-[var(--forest-emerald)]"
            : "font-semibold text-[#111827]"
        }`}
      >
        <Money value={value} currency="UGX" />
      </p>
    </div>
  );
}

function agentInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function DayExpensesStrip({
  operation,
  onRecordExpense,
  canRecord,
}: {
  operation: DailyOperation;
  onRecordExpense: () => void;
  canRecord: boolean;
}) {
  const latest = operation.expenses.slice(0, 8);
  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-[#0b1220]">Expenses</p>
          <p className="mt-0.5 inline-flex flex-wrap items-baseline gap-1 text-[11px] font-medium text-slate-500">
            <span>{operation.expensesCount} recorded ·</span>
            <Money value={operation.expensesTotal} currency="UGX" />
          </p>
        </div>
        <ActionChip
          icon={<ReceiptText className="size-3.5" />}
          label="Record"
          disabled={!canRecord}
          onClick={onRecordExpense}
        />
      </div>

      {latest.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-[#e6ebf0] bg-[#fbfcfd] px-4 py-6 text-center">
          <p className="text-xs font-semibold text-[#0b1220]">
            No expenses yet
          </p>
          <p className="mt-1 text-[11px] font-medium text-slate-500">
            Transport, meals and other day costs will show here.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 -mx-1 grid grid-cols-[1fr_96px_64px_72px] gap-2 border-b border-[#dfe5eb] bg-[#e8edf2] px-2 py-2 text-[10px] font-semibold text-slate-600">
            <span>Category</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Time</span>
            <span className="text-right">Status</span>
          </div>
          <div className="divide-y divide-[#edf1f5]">
            {latest.map((expense) => (
              <div
                key={expense.id}
                className="grid grid-cols-[1fr_96px_64px_72px] items-center gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-[#0b1220]">
                    {categoryLabel(expense.category)}
                  </p>
                  <p className="truncate text-[10px] font-medium text-slate-500">
                    {expense.description?.trim() || expense.recordedByName}
                  </p>
                </div>
                <p className="text-right text-[11px] font-bold tabular-nums text-[#0b1220]">
                  <Money value={expense.amount} currency="UGX" />
                </p>
                <p className="text-right text-[10px] font-medium tabular-nums text-slate-500">
                  {formatClock(expense.incurredAt)}
                </p>
                <div className="flex justify-end">
                  <span
                    className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                      expense.approvedAt
                        ? "border-emerald-200 bg-emerald-50 text-[var(--forest-emerald)]"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {expense.approvedAt ? "Approved" : "Pending"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function DayAttentionCard({
  items,
  closed,
  canOperate,
  onAction,
  onCloseDay,
}: {
  items: AttentionItem[];
  closed: boolean;
  canOperate: boolean;
  onAction: (panel: Exclude<OperationActionPanel, null>) => void;
  onCloseDay?: () => void;
}) {
  const clear = !closed && items.length === 0;
  const urgentCount = items.filter((item) => item.tone === "red").length;

  return (
    <section
      className={`overflow-hidden rounded-[14px] border shadow-[0_8px_18px_rgba(15,23,42,0.045)] ${
        closed || clear
          ? "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white"
          : urgentCount > 0
            ? "border-red-200 bg-gradient-to-br from-red-50 via-white to-white"
            : "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white"
      }`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-black/5 px-3.5 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-xl border bg-white ${
              closed || clear
                ? "border-emerald-200 text-[var(--forest-emerald)]"
                : urgentCount > 0
                  ? "border-red-200 text-red-600"
                  : "border-amber-200 text-amber-700"
            }`}
          >
            {closed || clear ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <AlertTriangle className="size-4" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#0b1220]">
              {closed
                ? "Day complete"
                : clear
                  ? "All clear"
                  : "Needs attention"}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-600">
              {closed
                ? "Review and send the close-day report when ready."
                : clear
                  ? "No blockers — close the day when field officers are back."
                  : `${items.length} issue${items.length === 1 ? "" : "s"} blocking a clean close.`}
            </p>
          </div>
        </div>
        <StatusChip
          tone={closed || clear ? "green" : urgentCount > 0 ? "rose" : "amber"}
          label={
            closed
              ? "Closed"
              : clear
                ? "Clear"
                : urgentCount > 0
                  ? "Urgent"
                  : "Watch"
          }
        />
      </header>

      <div className="space-y-2 p-3.5">
        {closed || clear ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-white/80 px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[var(--forest-emerald)]">
              <ShieldCheck className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#0b1220]">
                {closed ? "Operations day sealed" : "Ready for close"}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                {closed
                  ? "Cash, float and returns are locked for this day."
                  : "Float and returns look healthy right now."}
              </p>
            </div>
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!canOperate || !item.action}
              onClick={() => {
                if (item.action) onAction(item.action);
              }}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-default ${
                item.tone === "red"
                  ? "border-red-100 bg-red-50/90 hover:bg-red-50"
                  : item.tone === "gold"
                    ? "border-amber-100 bg-amber-50/90 hover:bg-amber-50"
                    : "border-sky-100 bg-sky-50/90 hover:bg-sky-50"
              }`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-xl bg-white/85 ${
                  item.tone === "red"
                    ? "text-red-600"
                    : item.tone === "gold"
                      ? "text-amber-700"
                      : "text-sky-700"
                }`}
              >
                {item.tone === "red" ? (
                  <RotateCcw className="size-3.5" />
                ) : item.tone === "gold" ? (
                  <UserRoundPlus className="size-3.5" />
                ) : (
                  <ReceiptText className="size-3.5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-[#111827]">
                  {item.title}
                </p>
                <p className="mt-0.5 truncate text-[11px] font-medium text-slate-600">
                  {item.detail}
                </p>
              </div>
              {canOperate && item.action ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-slate-600">
                  {item.actionLabel ?? "Open"}
                  <ArrowRight className="size-3" />
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>

      {onCloseDay ? (
        <div className="border-t border-black/5 px-3.5 py-3">
          <ActionChip
            icon={<LockKeyhole className="size-3.5" />}
            label="Close day"
            primary
            onClick={onCloseDay}
          />
        </div>
      ) : null}
    </section>
  );
}

function OperationActionDrawer({
  panel,
  operation,
  agents,
  assignableAgents,
  addFloatOptions,
  pendingAgentReturns,
  editable,
  canReconcile,
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
  agents: OperationAgentRow[];
  assignableAgents: OperationAgentRow[];
  addFloatOptions: DailyOperationAgentReturn[];
  pendingAgentReturns: DailyOperationAgentReturn[];
  editable: boolean;
  canReconcile: boolean;
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

  const meta = panelMeta(panel);
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
  const returnVariance =
    selectedReturn && agentReturnForm.amountReturned !== ""
      ? Math.round(
          (Number(agentReturnForm.amountReturned) -
            selectedReturn.expectedReturn) *
            100,
        ) / 100
      : null;
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
  const closingCashToSave =
    variance == null ? null : Math.round(countedCash * 100) / 100;
  const needsCloseNote = variance != null && variance !== 0;
  const needsShortageOwner = false;
  const canSubmitClose =
    canReconcile &&
    canClose &&
    allReturnsRecorded &&
    closingForm.countedCash !== "" &&
    (!needsCloseNote || closingForm.notes.trim().length > 0) &&
    (!needsShortageOwner || Boolean(closingForm.shortageResponsibleUserId));
  const submitting =
    recordingTopUp ||
    recordingExpense ||
    savingFloat ||
    savingFloatTopUp ||
    recordingAgentReturn ||
    closing;
  const canSubmit =
    panel === "top-up"
      ? validTopUp && !recordingTopUp
      : panel === "expense"
        ? validExpense && !recordingExpense
        : panel === "issue-float"
          ? canSubmitFloat && !savingFloat
          : panel === "add-float"
            ? canSubmitFloatTopUp && !savingFloatTopUp
            : panel === "agent-return"
              ? canSubmitReturn && !recordingAgentReturn
              : canSubmitClose && !closing;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(8,16,28,0.48)] backdrop-blur-[3px]">
      <button
        type="button"
        className="hidden flex-1 cursor-default bg-transparent sm:block"
        aria-label="Close panel"
        onClick={onClosePanel}
      />
      <aside className="flex h-full w-full max-w-[440px] flex-col bg-[#f4f7f6] shadow-[-28px_0_70px_rgba(15,23,42,0.22)]">
        <header className="relative overflow-hidden bg-[linear-gradient(135deg,#003f35_0%,#0a6b55_58%,#12805f_100%)] px-5 pb-5 pt-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/12">
                {meta.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/65">
                  {operation.branchName}
                </p>
                <h2 className="mt-1 text-lg font-bold tracking-[-0.02em]">
                  {meta.title}
                </h2>
                <p className="mt-1 text-xs font-medium text-white/72">
                  {meta.subtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/18"
              aria-label="Close panel"
              onClick={onClosePanel}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {meta.stats(operation).map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-sm"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-white/65">
                  {stat.label}
                </p>
                <p className="mt-1 truncate text-xs font-bold tabular-nums text-white">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="rounded-[16px] border border-[#e6ebf0] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            {panel === "top-up" ? (
              <div className="space-y-3.5">
                <DrawerSection title="Capital top-up details" />
                <MoneyField
                  label="Capital amount"
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
              <div className="space-y-3.5">
                <DrawerSection title="Expense details" />
                <SelectField
                  label="Category"
                  value={expenseForm.category}
                  locked={!editable || !canRecordExpense}
                  onChange={(value) =>
                    setExpenseForm({
                      ...expenseForm,
                      category: value as ExpenseCategory,
                    })
                  }
                  options={expenseCategoryOptions.map((category) => ({
                    id: category,
                    label: categoryLabel(category),
                  }))}
                />
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
                  <DrawerAlert tone="red">
                    Expense is more than remaining branch cash.
                  </DrawerAlert>
                ) : null}
              </div>
            ) : null}

            {panel === "issue-float" ? (
              <FloatPanelForm
                form={floatForm}
                options={assignableAgents.map((agent) => ({
                  id: agent.id,
                  label: agent.name,
                  meta: agent.publicId ?? "No officer ID",
                }))}
                amountLeft={operation.floatRemaining}
                emptyMessage="All field officers already have float for this day."
                locked={!editable || !canManageFloat}
                onChange={setFloatForm}
              />
            ) : null}

            {panel === "add-float" ? (
              <FloatPanelForm
                form={floatTopUpForm}
                options={addFloatOptions.map((agentReturn) => ({
                  id: agentReturn.agentId,
                  label: agentReturn.agentName,
                  meta: agentReturn.agentPublicId ?? "No officer ID",
                }))}
                amountLeft={operation.floatRemaining}
                emptyMessage="No active float can receive more right now."
                locked={!editable || !canManageFloat}
                onChange={setFloatTopUpForm}
              />
            ) : null}

            {panel === "agent-return" ? (
              <div className="space-y-3.5">
                <DrawerSection title="Select field officer" />
                {pendingAgentReturns.length === 0 ? (
                  <DrawerAlert tone="green">
                    All field officers with float have returned.
                  </DrawerAlert>
                ) : (
                  <div className="space-y-2">
                    {pendingAgentReturns.map((agentReturn) => {
                      const selected =
                        agentReturnForm.agentId === agentReturn.agentId;
                      return (
                        <button
                          key={agentReturn.floatId}
                          type="button"
                          disabled={!editable || !canRecordReturn}
                          onClick={() =>
                            setAgentReturnForm({
                              ...agentReturnForm,
                              agentId: agentReturn.agentId,
                              amountReturned: String(
                                agentReturn.expectedReturn,
                              ),
                            })
                          }
                          className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                            selected
                              ? "border-emerald-300 bg-emerald-50"
                              : "border-[#e6ebf0] bg-[#fbfcfd] hover:border-emerald-200"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-[#0b1220]">
                              {agentReturn.agentName}
                            </p>
                            <p className="inline-flex max-w-full flex-wrap items-baseline gap-1 truncate text-[10px] font-medium text-slate-500">
                              <span>
                                {agentReturn.agentPublicId ?? "No officer ID"} ·
                                expected
                              </span>
                              <Money
                                value={agentReturn.expectedReturn}
                                currency="UGX"
                              />
                            </p>
                          </div>
                          <ReturnBadge status={agentReturn.status} />
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedReturn ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <PanelHint
                        label="Float given"
                        value={
                          <Money
                            value={selectedReturn.amountGiven}
                            currency="UGX"
                          />
                        }
                      />
                      <PanelHint
                        label="Expected back"
                        value={
                          <Money
                            value={selectedReturn.expectedReturn}
                            currency="UGX"
                          />
                        }
                      />
                    </div>
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
                    {returnVariance != null ? (
                      <DrawerAlert
                        tone={
                          returnVariance === 0
                            ? "green"
                            : returnVariance < 0
                              ? "red"
                              : "amber"
                        }
                      >
                        <>
                          Variance <VarianceLabel value={returnVariance} />
                        </>
                      </DrawerAlert>
                    ) : null}
                    <TextAreaField
                      label="Notes"
                      value={agentReturnForm.notes}
                      locked={!editable || !canRecordReturn}
                      onChange={(value) =>
                        setAgentReturnForm({
                          ...agentReturnForm,
                          notes: value,
                        })
                      }
                    />
                  </>
                ) : null}
              </div>
            ) : null}

            {panel === "close-day" ? (
              <div className="space-y-3.5">
                <DrawerSection title="Count and confirm" />
                {!allReturnsRecorded ? (
                  <DrawerAlert tone="amber">
                    Record all field officer returns before closing the day.
                  </DrawerAlert>
                ) : (
                  <DrawerAlert tone="green">
                    All field officer returns are recorded. Ready to close.
                  </DrawerAlert>
                )}
                <PanelHint
                  label="Expected closing balance"
                  value={
                    <Money
                      value={operation.expectedClosingBalance}
                      currency="UGX"
                    />
                  }
                  accent
                />
                <MoneyField
                  label="Counted cash"
                  value={closingForm.countedCash}
                  locked={!canReconcile || !canClose}
                  onChange={(value) =>
                    setClosingForm({ ...closingForm, countedCash: value })
                  }
                />
                {variance != null ? (
                  <CloseDayVarianceSummary
                    variance={variance}
                    closingCash={closingCashToSave ?? 0}
                    notesRequired={needsCloseNote}
                    shortageOwnerRequired={needsShortageOwner}
                  />
                ) : null}
                {needsShortageOwner ? (
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">
                      Shortage assigned to
                    </span>
                    <select
                      value={closingForm.shortageResponsibleUserId}
                      disabled={!canReconcile || !canClose}
                      onChange={(event) =>
                        setClosingForm({
                          ...closingForm,
                          shortageResponsibleUserId: event.target.value,
                        })
                      }
                      className="mt-1.5 h-10 w-full rounded-xl border border-[#e6ebf0] bg-white px-3 text-sm font-semibold outline-none disabled:bg-[#f5f7f8]"
                    >
                      <option value="">Select field officer or cashier</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <TextAreaField
                  label={needsCloseNote ? "Notes required" : "Notes"}
                  value={closingForm.notes}
                  locked={!canReconcile || !canClose}
                  onChange={(value) =>
                    setClosingForm({ ...closingForm, notes: value })
                  }
                />
              </div>
            ) : null}
          </div>
        </div>

        <footer className="border-t border-[#e6ebf0] bg-white px-4 py-3.5">
          <div className="grid grid-cols-[1fr_1.4fr] gap-2">
            <button
              type="button"
              onClick={onClosePanel}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[#e6ebf0] bg-white text-xs font-semibold text-[#0b1220] transition hover:bg-[#f8faf9]"
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#003f35] text-xs font-semibold text-white shadow-[0_12px_24px_rgba(0,63,53,0.22)] transition hover:brightness-110 disabled:opacity-50"
              disabled={!canSubmit}
              onClick={() => {
                if (panel === "top-up") onRecordTopUp();
                if (panel === "expense") onRecordExpense();
                if (panel === "issue-float") onSaveFloat();
                if (panel === "add-float") onSaveFloatTopUp();
                if (panel === "agent-return") onRecordAgentReturn();
                if (panel === "close-day") onCloseDay();
              }}
            >
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              {meta.cta}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function panelMeta(panel: Exclude<OperationActionPanel, null>) {
  const configs = {
    "top-up": {
      title: "Add capital",
      subtitle: "Increase cash on hand for today’s operations.",
      cta: "Save capital top-up",
      icon: <PlusCircle className="size-5" />,
      stats: (operation: DailyOperation) => [
        {
          label: "Cash Left",
          value: <Money value={operation.branchCashRemaining} currency="UGX" />,
        },
        {
          label: "Capital top-ups today",
          value: (
            <Money
              value={operation.topUpsTotal ?? operation.cashAddedToday}
              currency="UGX"
            />
          ),
        },
      ],
    },
    expense: {
      title: "Record expense",
      subtitle: "Log day costs against cash on hand.",
      cta: "Save expense",
      icon: <ReceiptText className="size-5" />,
      stats: (operation: DailyOperation) => [
        {
          label: "Cash Left",
          value: <Money value={operation.branchCashRemaining} currency="UGX" />,
        },
        {
          label: "Expenses",
          value: <Money value={operation.expensesTotal} currency="UGX" />,
        },
      ],
    },
    "issue-float": {
      title: "Issue float",
      subtitle: "Assign float to a field officer for the field day.",
      cta: "Issue float",
      icon: <UserRoundPlus className="size-5" />,
      stats: (operation: DailyOperation) => [
        {
          label: "Cash for float",
          value: <Money value={operation.floatRemaining} currency="UGX" />,
        },
        {
          label: "Already out",
          value: <Money value={operation.floatIssued} currency="UGX" />,
        },
      ],
    },
    "add-float": {
      title: "Add more float",
      subtitle: "Add float to a field officer who already has float today.",
      cta: "Add float",
      icon: <CircleDollarSign className="size-5" />,
      stats: (operation: DailyOperation) => [
        {
          label: "Cash for float",
          value: <Money value={operation.floatRemaining} currency="UGX" />,
        },
        {
          label: "Officers out",
          value: String(operation.agentsWithFloatCount),
        },
      ],
    },
    "agent-return": {
      title: "Record return",
      subtitle: "Capture cash handed back by a field officer.",
      cta: "Save return",
      icon: <RotateCcw className="size-5" />,
      stats: (operation: DailyOperation) => [
        {
          label: "Expected back",
          value: (
            <Money value={operation.expectedAgentReturnTotal} currency="UGX" />
          ),
        },
        {
          label: "Officers back",
          value: `${operation.agentsReturnedCount}/${operation.agentsWithFloatCount || 0}`,
        },
      ],
    },
    "close-day": {
      title: "Close day",
      subtitle: "Count the cash left and seal today’s operations.",
      cta: "Close day",
      icon: <LockKeyhole className="size-5" />,
      stats: (operation: DailyOperation) => [
        {
          label: "Expected close",
          value: (
            <Money value={operation.expectedClosingBalance} currency="UGX" />
          ),
        },
        {
          label: "Returns",
          value: `${operation.agentsReturnedCount}/${operation.agentsWithFloatCount || 0}`,
        },
      ],
    },
  };
  return configs[panel];
}

function DrawerSection({ title }: { title: string }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
      {title}
    </p>
  );
}

function DrawerAlert({
  tone,
  children,
}: {
  tone: "green" | "amber" | "red";
  children: ReactNode;
}) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-[#0c6b4f]",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-700",
  } as const;
  return (
    <p
      className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </p>
  );
}

function CloseDayVarianceSummary({
  variance,
  closingCash,
  notesRequired,
  shortageOwnerRequired,
}: {
  variance: number;
  closingCash: number;
  notesRequired: boolean;
  shortageOwnerRequired: boolean;
}) {
  if (variance === 0) {
    return <DrawerAlert tone="green">Variance Balanced</DrawerAlert>;
  }

  const isShortage = variance < 0;
  const tone = isShortage ? "red" : "amber";
  const label = isShortage ? "Shortage calculated" : "Surplus calculated";
  const guidance = isShortage
    ? "The shortage is separated from closing cash."
    : "The surplus is separated from closing cash.";

  return (
    <div className="space-y-2">
      <DrawerAlert tone={tone}>
        <span className="inline-flex flex-wrap items-baseline gap-1">
          <span>{label}</span>
          <Money value={Math.abs(variance)} currency="UGX" />
          {notesRequired ? <span>· notes required</span> : null}
          {shortageOwnerRequired ? (
            <span>· assign who must account for the shortage</span>
          ) : null}
        </span>
      </DrawerAlert>
      <div className="grid gap-2 sm:grid-cols-2">
        <PanelHint
          label="Closing cash saved"
          value={<Money value={closingCash} currency="UGX" />}
        />
        <PanelHint
          label={isShortage ? "Shortage amount" : "Surplus amount"}
          value={<Money value={Math.abs(variance)} currency="UGX" />}
        />
      </div>
      <p className="text-[11px] font-medium leading-5 text-slate-500">
        {guidance} The close-day record will save only the physical cash counted
        as closing cash.
      </p>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  locked = false,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  locked?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
      <select
        value={value}
        disabled={locked}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-11 w-full rounded-xl border border-[#e6ebf0] bg-[#fbfcfd] px-3 text-sm font-semibold text-[#0b1220] outline-none transition focus:border-[var(--forest-emerald)] focus:bg-white disabled:bg-[#f5f7f8] disabled:text-slate-500"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
  value: ReactNode;
  strong?: boolean;
  muted?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl px-2.5 py-2 text-sm ${
        strong ? "bg-emerald-50/70" : ""
      }`}
    >
      <span
        className={`min-w-0 truncate text-xs font-semibold ${
          strong
            ? "text-[#0b1220]"
            : muted
              ? "text-slate-500"
              : "text-slate-600"
        }`}
      >
        {label}
      </span>
      <span
        className={`shrink-0 text-right text-xs font-bold tabular-nums ${
          strong
            ? "text-[var(--forest-emerald)]"
            : danger
              ? "text-amber-700"
              : "text-[#0b1220]"
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
  value: ReactNode;
  meta: string;
  status?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#edf1f5] bg-[#fbfcfd] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[#0b1220]">{label}</p>
        <p className="mt-0.5 text-[11px] font-medium text-slate-500">{meta}</p>
      </div>
      <p className="shrink-0 text-xs font-bold tabular-nums text-[#0b1220]">
        {value}
      </p>
      {status ? (
        <span className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-[var(--forest-emerald)]">
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
      <Money value={value} currency="UGX" />
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
      className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function PanelHint({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        accent
          ? "border-emerald-200 bg-emerald-50"
          : "border-[#edf1f5] bg-[#f8faf9]"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-bold tabular-nums ${
          accent ? "text-[var(--forest-emerald)]" : "text-[#0b1220]"
        }`}
      >
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
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
      <textarea
        value={value}
        disabled={locked}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-1.5 w-full rounded-xl border border-[#e6ebf0] bg-[#fbfcfd] px-3 py-2.5 text-sm font-medium text-[#0b1220] outline-none transition focus:border-[var(--forest-emerald)] focus:bg-white disabled:bg-[#f5f7f8] disabled:text-slate-500"
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
  options: { id: string; label: string; meta?: string }[];
  amountLeft: number;
  emptyMessage: string;
  locked: boolean;
  onChange: (next: FloatForm) => void;
}) {
  const amount = Number(form.amount);
  const exceeds = form.amount !== "" && amount > amountLeft;
  return (
    <div className="space-y-3.5">
      <DrawerSection title="Assign float" />
      <PanelHint
        label="Cash available for float"
        value={<Money value={amountLeft} currency="UGX" />}
        accent
      />
      {options.length === 0 ? (
        <DrawerAlert tone="amber">{emptyMessage}</DrawerAlert>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-slate-600">Agent</p>
          {options.map((option) => {
            const selected = form.agentId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={locked}
                onClick={() => onChange({ ...form, agentId: option.id })}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                  selected
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-[#e6ebf0] bg-[#fbfcfd] hover:border-emerald-200"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-[#0b1220]">
                    {option.label}
                  </p>
                  {option.meta ? (
                    <p className="truncate text-[10px] font-medium text-slate-500">
                      {option.meta}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`grid size-5 place-items-center rounded-full border ${
                    selected
                      ? "border-[var(--forest-emerald)] bg-[var(--forest-emerald)] text-white"
                      : "border-[#d7dee7] bg-white"
                  }`}
                >
                  {selected ? <CheckCircle2 className="size-3" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <MoneyField
        label="Amount"
        value={form.amount}
        locked={locked || options.length === 0}
        onChange={(value) => onChange({ ...form, amount: value })}
      />
      {exceeds ? (
        <DrawerAlert tone="red">
          Float is more than the assignable amount left.
        </DrawerAlert>
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
    <div className="border-t border-[#edf1f5] pt-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
          Capital top-ups today
        </p>
        <span className="text-[11px] font-semibold text-slate-500">
          {operation.topUps.length}
        </span>
      </div>
      {operation.topUps.length === 0 ? (
        <p className="mt-2 text-xs font-medium text-slate-500">
          No capital top-ups recorded yet.
        </p>
      ) : (
        <div className="mt-2 divide-y divide-[#edf1f5] rounded-xl border border-[#edf1f5]">
          {operation.topUps.map((topUp) => (
            <div
              key={topUp.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[#0b1220]">
                  {topUp.description || "Capital top-up"}
                </p>
                <p className="text-[10px] font-medium text-slate-500">
                  {formatClock(topUp.addedAt)} · {topUp.recordedByName}
                </p>
              </div>
              <p className="shrink-0 text-xs font-bold tabular-nums text-[var(--forest-emerald)]">
                <Money value={topUp.amount} currency="UGX" sign="+" />
              </p>
            </div>
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
    <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#edf1f5] bg-[#f8faf9]/80 px-4 py-3.5">
        <div>
          <p className="text-sm font-bold text-[var(--midnight-navy)]">
            Officer returns
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {operation.agentsReturnedCount} of {operation.agentsWithFloatCount}{" "}
            returned
          </p>
        </div>
        <span className="text-xs font-bold tabular-nums text-[var(--midnight-navy)]">
          <Money value={operation.cashReturnedByAgents} currency="UGX" />
        </span>
      </header>
      {operation.agentReturns.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">
          No float has been assigned for this day.
        </div>
      ) : (
        <div className="divide-y divide-[#edf1f5]">
          <div className="hidden grid-cols-[minmax(0,1.1fr)_96px_96px_96px_90px_110px_90px] gap-3 bg-[#e5ece8] px-4 py-2.5 text-[10px] font-semibold text-slate-500 lg:grid">
            <span>Agent</span>
            <span className="text-right">Float</span>
            <span className="text-right">Loans</span>
            <span className="text-right">Repayments</span>
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
                    {agentReturn.agentPublicId ?? "No officer ID"} ·{" "}
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
                        <Money
                          value={agentReturn.amountReturned ?? 0}
                          currency="UGX"
                        />
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
                        <VarianceLabel value={agentReturn.variance} />
                      </span>
                    </span>
                  ) : editable && canRecordReturn ? (
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#e6ebf0] bg-white px-3 text-xs font-semibold text-[#0b1220] transition hover:bg-emerald-50"
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
                  <div className="grid gap-2 border-t border-[#e6ebf0] pt-3 lg:col-span-7 lg:grid-cols-[160px_minmax(0,1fr)_110px]">
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
                        className="mt-1.5 h-11 w-full rounded-xl border border-[#e6ebf0] bg-[#fbfcfd] px-3 text-sm font-medium text-[#0b1220] outline-none transition focus:border-[var(--forest-emerald)] disabled:bg-[#f5f7f8] disabled:text-slate-500"
                      />
                    </label>
                    <button
                      type="button"
                      className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#003f35] px-4 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(0,63,53,0.22)] disabled:opacity-55 lg:mt-6"
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
      <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
        <header className="border-b border-[#edf1f5] bg-[#f8faf9]/80 px-4 py-3.5">
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
            value={
              <Money value={operation.closingBalance ?? 0} currency="UGX" />
            }
          />
          <DetailRow
            label="Variance"
            value={<VarianceLabel value={operation.closingVariance} />}
          />
          {operation.closingNotes ? (
            <p className="text-xs text-slate-600">{operation.closingNotes}</p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
      <header className="border-b border-[#edf1f5] bg-[#f8faf9]/80 px-4 py-3.5">
        <p className="text-sm font-bold text-[var(--midnight-navy)]">
          Close day
        </p>
        <p className="mt-0.5 inline-flex flex-wrap items-baseline gap-1 text-xs text-slate-500">
          <span>Expected:</span>
          <Money value={operation.expectedClosingBalance} currency="UGX" />
        </p>
        <p className="mt-0.5 inline-flex flex-wrap items-baseline gap-1 text-xs text-slate-500">
          <span>Loan processing fees:</span>
          <Money value={operation.processingFeesTotal} currency="UGX" />
        </p>
      </header>
      <div className="space-y-3 p-4">
        {!allReturnsRecorded ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-700">
            Record all field officer returns first.
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
          className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-[#e6ebf0] bg-white px-3 text-xs font-semibold text-[#0b1220] transition hover:bg-emerald-50"
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
            <>
              Variance: <VarianceLabel value={variance} />
            </>
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
            className="mt-1.5 w-full rounded-xl border border-[#e6ebf0] bg-[#fbfcfd] px-3 py-2.5 text-sm font-medium text-[#0b1220] outline-none transition focus:border-[var(--forest-emerald)] disabled:bg-[#f5f7f8] disabled:text-slate-500"
          />
        </label>
      </div>
      <footer className="border-t border-[#edf1f5] bg-[#f8faf9] px-4 py-3.5">
        <button
          type="button"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#003f35] text-xs font-semibold text-white shadow-[0_12px_24px_rgba(0,63,53,0.22)] disabled:opacity-55"
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
    <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
      <header className="border-b border-[#edf1f5] bg-[#f8faf9]/80 px-4 py-3.5">
        <p className="text-sm font-bold text-[var(--midnight-navy)]">
          Record expense
        </p>
        <p className="mt-0.5 inline-flex flex-wrap items-baseline gap-1 text-xs text-slate-500">
          <span>Remaining cash:</span>
          <Money value={operation.branchCashRemaining} currency="UGX" />
        </p>
      </header>
      <div className="space-y-3 p-4">
        {!editable ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-700">
            Past days can be viewed only.
          </p>
        ) : !canRecordExpense ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-700">
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
            className="mt-1.5 h-11 w-full rounded-xl border border-[#e6ebf0] bg-[#fbfcfd] px-3 text-sm font-semibold text-[#0b1220] outline-none transition focus:border-[var(--forest-emerald)] disabled:bg-[#f5f7f8] disabled:text-slate-500"
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
            className="mt-1.5 w-full rounded-xl border border-[#e6ebf0] bg-[#fbfcfd] px-3 py-2.5 text-sm font-medium text-[#0b1220] outline-none transition focus:border-[var(--forest-emerald)] disabled:bg-[#f5f7f8] disabled:text-slate-500"
          />
        </label>
      </div>
      <footer className="border-t border-[#edf1f5] bg-[#f8faf9] px-4 py-3.5">
        <button
          type="button"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#003f35] text-xs font-semibold text-white shadow-[0_12px_24px_rgba(0,63,53,0.22)] disabled:opacity-55"
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
    <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
      <header className="flex items-center justify-between gap-3 border-b border-[#edf1f5] bg-[#f8faf9]/80 px-4 py-3.5">
        <p className="text-sm font-bold text-[var(--midnight-navy)]">
          Expenses
        </p>
        <span className="text-xs font-bold tabular-nums text-[var(--midnight-navy)]">
          <Money value={operation.expensesTotal} currency="UGX" />
        </span>
      </header>
      {operation.expenses.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">
          No expenses recorded for this day.
        </div>
      ) : (
        <div className="divide-y divide-[#edf1f5]">
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
                <Money value={expense.amount} currency="UGX" />
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
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
      <div className="relative mt-1.5">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500">
          UGX
        </span>
        <input
          type="number"
          min="0"
          step="100"
          value={value}
          disabled={locked}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full rounded-xl border border-[#e6ebf0] bg-[#fbfcfd] py-2 pl-12 pr-3 text-sm font-semibold tabular-nums text-[#0b1220] outline-none transition focus:border-[var(--forest-emerald)] focus:bg-white disabled:bg-[#f5f7f8] disabled:text-slate-500"
        />
      </div>
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
      <Money value={value} currency="UGX" />
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-b border-[#edf1f5] px-1 py-2.5 last:border-b-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-bold text-[#0b1220]">
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
    <div className="flex items-center gap-3 rounded-[14px] border border-[#e6ebf0] bg-white px-4 py-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <span
        className={`grid size-9 place-items-center rounded-xl border ${toneClass}`}
      >
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
    <div className="space-y-3.5">
      <div className="h-[72px] animate-pulse rounded-[16px] border border-[#e6ebf0] bg-white" />
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-[92px] rounded-[14px]" />
        ))}
      </div>
      <div className="grid gap-3.5 xl:grid-cols-[0.9fr_1.45fr]">
        <SkeletonBlock className="h-72 rounded-[16px]" />
        <SkeletonBlock className="h-72 rounded-[16px]" />
      </div>
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
      description: "Capital top-ups today",
      count: operation.topUpsCount,
      cashIn: operation.topUpsTotal,
      cashOut: null,
      balance: afterTopUps,
      note: "Capital added at opening or during the day",
    },
    {
      section: "Float",
      description: "Float distributed to field officers",
      count: operation.agentsWithFloatCount,
      cashIn: null,
      cashOut: operation.floatIssued,
      balance: afterFloat,
      note: "Cash issued to field officers",
    },
    {
      section: "Field",
      description: "Cash returned by field officers",
      count: operation.agentsReturnedCount,
      cashIn: operation.cashReturnedByAgents,
      cashOut: null,
      balance: afterReturns,
      note: "Officer handover received",
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
      section: "Repayments",
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
  if (status === "MANAGER_REVIEW") return "Ready to send";
  if (status === "SENT_TO_OWNER") return "Awaiting Approval";
  if (status === "OWNER_APPROVED") return "Approved";
  if (status === "RETURNED_TO_MANAGER") return "Returned";
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

/** Plain-string variance for excel exports and alerts that must stay text. */
function formatVariance(value: number | null) {
  if (value == null) return "Not set";
  if (value === 0) return "Balanced";
  const absolute = formatMoney(Math.abs(value));
  return value < 0 ? `Short ${absolute}` : `Over ${absolute}`;
}

function VarianceLabel({ value }: { value: number | null }) {
  if (value == null) return <>Not set</>;
  if (value === 0) return <>Balanced</>;
  return (
    <span className="inline-flex items-baseline gap-1">
      <span>{value < 0 ? "Short" : "Over"}</span>
      <Money value={Math.abs(value)} currency="UGX" />
    </span>
  );
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
