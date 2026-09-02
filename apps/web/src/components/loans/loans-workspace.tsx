"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Loader2,
  MessageSquare,
  Percent,
  Plus,
  RefreshCw,
  Search,
  User,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApplicationDetailDrawer } from "../app/application-detail-drawer";
import { LoanApplicationFormDrawer } from "../app/loan-application-form-drawer";
import { AppShell } from "../app/app-shell";
import {
  DEFAULT_PAGE_SIZE,
  PaginationControls,
  paginateItems,
} from "../app/pagination";
import { RowActions } from "../app/row-actions";
import { AppBootSkeleton, SkeletonBlock } from "../app/skeleton";
import {
  OwnerLoan,
  formatDate,
  formatMoneyAmount,
  formatNumber,
  isLoanScheduleOverdue,
  loanTotalRepayable,
  ownerFetch,
  sumBy,
  titleCase,
} from "../../app/owner/owner-common";
import { OwnerHeader } from "../../app/owner/owner-header";
import { useOwnerBranchScope } from "../../app/owner/owner-branch-scope";
import { Money } from "../app/money";
import { TableSearchField } from "../app/table-search-field";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  EMPTY_LOANS_FILTERS,
  LoansAdvancedFilters,
  LoansFiltersControl,
  loanMatchesDateIssued,
  loanMatchesOfficer,
  loanMatchesPrincipalRange,
  loanMatchesRepaymentPosition,
  loansFiltersFromSearchParams,
  type OfficerOption,
} from "./loans-filters";
import { RecordRepaymentModal } from "./record-repayment-modal";
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

export type LoansMode = "owner" | "manager";
export type LoansWorkspaceView = "loans" | "pending-disbursements";

type PortfolioFilter =
  | "all"
  | "active"
  | "closed"
  | "overdue"
  | "due_today"
  | "due_paid"
  | "overdue_paid";

type LoanRow = OwnerLoan & {
  applicationId?: string | null;
  officerPublicId?: string | null;
};

type ReminderFilter =
  | "overdue"
  | "due_today"
  | "repayment:2-3"
  | "repayment:4-7"
  | "repayment:8+"
  | "active";

type ReminderBatch = {
  id: string;
  filter: string;
  status: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  completedAt: string | null;
};

type BorrowerRow = {
  id: string;
  fullName: string;
  phone: string;
  nationalId: string | null;
  collateralType: string | null;
  loanCount: number;
  activeLoanCount?: number;
  activeLoanId?: string | null;
};

type LoanDisbursementRow = {
  id: string;
  loanId: string;
  amount: number;
  assignedFloatAmount: number;
  collectedRepaymentsAmount: number;
  source: "ASSIGNED_FLOAT" | "COLLECTED_REPAYMENTS" | "MIXED_CASH";
  disbursedAt: string;
  note: string | null;
  recordedByName: string;
  recordedByPublicId: string | null;
  createdAt: string;
};

type PendingDisbursementRow = {
  loanId: string;
  applicationId: string | null;
  customerId: string;
  borrowerName: string;
  phone: string;
  branchId: string;
  branchName: string | null;
  agreedAmount: number;
  disbursedAmount: number;
  remainingAmount: number;
  percentDisbursed: number;
  disbursementCount: number;
  lastDisbursementAt: string | null;
  lastDisbursementAmount: number | null;
  issuedByName: string | null;
  issuedByPublicId: string | null;
  status: string;
  createdAt: string;
  disbursements: LoanDisbursementRow[];
};

type PendingDisbursementsResponse = {
  summary?: {
    borrowersCount: number;
    totalRemaining: number;
  };
  pendingDisbursements?: PendingDisbursementRow[];
};

type DisbursementStaffOption = {
  id: string;
  publicId: string | null;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  roleName?: string | null;
  floatToday?: number | null;
  remainingFloatToday?: number | null;
  collectedRepaymentsAvailableToday?: number | null;
};

type AgentsResponse = {
  agents?: DisbursementStaffOption[];
  message?: string | string[];
};

const ACTIVE_STATUSES = new Set([
  "SUBMITTED",
  "APPROVED",
  "DISBURSED",
  "CURRENT",
  "IN_ARREARS",
  "RESTRUCTURED",
]);

type LoansSession = {
  session: RembehSession | null;
  workspace: RembehWorkspace | null;
  user: RembehUser | null;
  branch: RembehBranch | null;
  ready: boolean;
};

function useLoansSession(mode: LoansMode): LoansSession {
  const router = useRouter();
  const [state, setState] = useState<LoansSession>({
    session: null,
    workspace: null,
    user: null,
    branch: null,
    ready: false,
  });

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const auth = readAuthState();
      if (!auth.session || isSessionExpired(auth.session)) {
        clearAuthState();
        router.replace(
          `/login?next=${encodeURIComponent(mode === "owner" ? "/owner/portfolio" : "/loans")}`,
        );
        return;
      }
      const role = resolveOperatorRole(auth.session, auth.user);
      if (mode === "owner" && role !== "owner") {
        router.replace(role === "manager" ? "/loans" : "/dashboard");
        return;
      }
      if (mode === "manager" && role !== "manager") {
        router.replace(role === "owner" ? "/owner/portfolio" : "/dashboard");
        return;
      }
      setState({
        session: auth.session,
        workspace: auth.workspace,
        user: auth.user,
        branch: auth.branch,
        ready: true,
      });
    }, 0);
    return () => window.clearTimeout(boot);
  }, [mode, router]);

  return state;
}

export function LoansWorkspace({
  mode,
  view = "loans",
}: {
  mode: LoansMode;
  view?: LoansWorkspaceView;
}) {
  const state = useLoansSession(mode);
  const router = useRouter();
  const isManager = mode === "manager";
  const { matchesBranch, selectedBranchName, selectedBranchId } =
    useOwnerBranchScope();
  const pendingOnly = view === "pending-disbursements";
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [borrowers, setBorrowers] = useState<BorrowerRow[]>([]);
  const [pendingDisbursements, setPendingDisbursements] = useState<
    PendingDisbursementRow[]
  >([]);
  const [pendingSummary, setPendingSummary] = useState({
    borrowersCount: 0,
    totalRemaining: 0,
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PortfolioFilter>("all");
  const [pendingSearch, setPendingSearch] = useState("");
  const [advancedFilters, setAdvancedFilters] =
    useState<LoansAdvancedFilters>(EMPTY_LOANS_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"new" | "existing">("new");
  const [borrowerSearch, setBorrowerSearch] = useState("");
  const [selectedBorrowerId, setSelectedBorrowerId] = useState("");
  const [borrowersLoading, setBorrowersLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detailLoan, setDetailLoan] = useState<LoanRow | null>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [editingApplicationId, setEditingApplicationId] = useState<
    string | null
  >(null);
  const [repaymentLoan, setRepaymentLoan] = useState<LoanRow | null>(null);
  const [agreementBusyId, setAgreementBusyId] = useState<string | null>(null);
  const [reminderBusyId, setReminderBusyId] = useState<string | null>(null);
  const [bulkSmsOpen, setBulkSmsOpen] = useState(false);
  const [bulkFilter, setBulkFilter] = useState<ReminderFilter>("overdue");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkBatch, setBulkBatch] = useState<ReminderBatch | null>(null);
  const [recordDisbursementLoan, setRecordDisbursementLoan] =
    useState<PendingDisbursementRow | null>(null);
  const [disbursementAmount, setDisbursementAmount] = useState("");
  const [disbursementRepaymentCash, setDisbursementRepaymentCash] =
    useState("");
  const [disbursementNote, setDisbursementNote] = useState("");
  const [disbursementDate, setDisbursementDate] = useState(() =>
    toDateInputValue(new Date()),
  );
  const [disbursementStaffId, setDisbursementStaffId] = useState("");
  const [disbursementBusy, setDisbursementBusy] = useState(false);
  const [staffOptions, setStaffOptions] = useState<DisbursementStaffOption[]>(
    [],
  );
  const [staffLoading, setStaffLoading] = useState(false);
  const currency = state.workspace?.currency ?? "UGX";
  const loansHref = isManager ? "/loans" : "/owner/portfolio";
  const pendingHref = isManager
    ? "/loans/pending-disbursements"
    : "/owner/portfolio/pending-disbursements";
  // Prefer mobile for new loans — web create flow is disabled.
  const canCreate = false;
  const canRecordRepayment = Boolean(
    state.session?.permissions.includes("collection.create"),
  );
  const canSendReminder =
    isManager && Boolean(state.session?.permissions.includes("loan.update"));
  const reminderBatchActive = Boolean(
    bulkBatch &&
    (bulkBatch.status === "QUEUED" || bulkBatch.status === "PROCESSING"),
  );

  useEffect(() => {
    if (!state.ready) return;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = loansFiltersFromSearchParams(params);
    if (Object.keys(fromUrl).length > 0) {
      setAdvancedFilters((current) => ({ ...current, ...fromUrl }));
      if (fromUrl.repayment && fromUrl.repayment !== "all") {
        setFilter("all");
      }
    }
    const coverage = params.get("coverage");
    if (
      coverage === "due_today" ||
      coverage === "due_paid" ||
      coverage === "overdue_paid"
    ) {
      setFilter(coverage);
    }
    if (canCreate && params.get("new") === "1") {
      setPanelError(null);
      setCreateMode("new");
      setAddOpen(true);
      params.delete("new");
      const next = params.toString();
      router.replace(
        `${isManager ? "/loans" : "/owner/portfolio"}${next ? `?${next}` : ""}`,
        { scroll: false },
      );
    }
  }, [canCreate, isManager, router, state.ready]);

  useEffect(() => {
    if (!loans.length) return;
    const params = new URLSearchParams(window.location.search);
    const loanId = params.get("loanId");
    if (!loanId) return;
    const match = loans.find((loan) => loan.id === loanId);
    if (!match) return;
    setDetailLoan(match);
    params.delete("loanId");
    const next = params.toString();
    router.replace(
      `${isManager ? "/loans" : "/owner/portfolio"}${next ? `?${next}` : ""}`,
      { scroll: false },
    );
  }, [isManager, loans, router]);

  const loadLoans = useCallback(async (): Promise<LoanRow[]> => {
    if (!state.session) return [];
    setLoading(true);
    setError(null);
    try {
      const payload = await ownerFetch<{ loans?: LoanRow[] }>(
        state.session,
        "/loans",
      );
      const next = payload.loans ?? [];
      const scoped =
        isManager && state.branch?.id
          ? next.filter((loan) => loan.branchId === state.branch?.id)
          : next;
      setLoans(scoped);
      const fallbackPending = pendingDisbursementsFromLoans(
        scoped,
        isManager ? (state.branch?.name ?? null) : null,
      );
      setPendingDisbursements(fallbackPending);
      setPendingSummary(summarizePendingDisbursements(fallbackPending));
      setDetailLoan((current) => {
        if (!current) return null;
        return scoped.find((loan) => loan.id === current.id) ?? current;
      });
      return scoped;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load portfolio.",
      );
      return [];
    } finally {
      setLoading(false);
    }
  }, [isManager, selectedBranchId, state.branch?.id, state.session]);

  const loadPendingDisbursements = useCallback(
    async (fallbackLoans: LoanRow[] = []) => {
      if (!state.session) return;
      setPendingLoading(true);
      const fallbackPending = pendingDisbursementsFromLoans(
        fallbackLoans,
        isManager ? (state.branch?.name ?? null) : null,
      );
      try {
        const payload = await ownerFetch<PendingDisbursementsResponse>(
          state.session,
          "/loans/pending-disbursements",
        );
        const rows = payload.pendingDisbursements ?? [];
        const scoped =
          isManager && state.branch?.id
            ? rows.filter((row) => row.branchId === state.branch?.id)
            : rows;
        const visibleRows = scoped.length > 0 ? scoped : fallbackPending;
        setPendingDisbursements(visibleRows);
        setPendingSummary(summarizePendingDisbursements(visibleRows));
      } catch {
        setPendingDisbursements(fallbackPending);
        setPendingSummary(summarizePendingDisbursements(fallbackPending));
      } finally {
        setPendingLoading(false);
      }
    },
    [isManager, selectedBranchId, state.branch?.id, state.branch?.name, state.session],
  );

  const loadDisbursementStaff = useCallback(async () => {
    if (!state.session || staffLoading) return;
    setStaffLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/agents?purpose=float`, {
        headers: {
          Authorization: `${state.session.tokenType} ${state.session.accessToken}`,
        },
      });
      const payload = await readApiJson<AgentsResponse>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setStaffOptions(
        (payload.agents ?? []).filter((agent) => agent.status === "ACTIVE"),
      );
    } catch {
      setStaffOptions([]);
    } finally {
      setStaffLoading(false);
    }
  }, [staffLoading, state.session]);

  const loadBorrowers = useCallback(async () => {
    if (!state.session) return;
    setBorrowersLoading(true);
    try {
      const payload = await ownerFetch<{ customers?: BorrowerRow[] }>(
        state.session,
        "/customers",
      );
      setBorrowers(payload.customers ?? []);
    } catch (caught) {
      setPanelError(
        caught instanceof Error ? caught.message : "Could not load borrowers.",
      );
    } finally {
      setBorrowersLoading(false);
    }
  }, [state.session]);

  const applyReminderToLoan = useCallback(
    (loanId: string, reminder: NonNullable<LoanRow["reminder"]>) => {
      setLoans((current) =>
        current.map((loan) =>
          loan.id === loanId ? { ...loan, reminder } : loan,
        ),
      );
      setDetailLoan((current) =>
        current?.id === loanId ? { ...current, reminder } : current,
      );
    },
    [],
  );

  const sendLoanReminder = useCallback(
    async (loan: LoanRow, resend = false) => {
      if (!state.session || !canSendReminder) return;
      if (reminderBusyId || reminderBatchActive) return;
      setReminderBusyId(loan.id);
      setError(null);
      setNotice(null);
      try {
        const response = await fetch(
          `${apiBaseUrl}/loans/${loan.id}/reminders`,
          {
            method: "POST",
            headers: {
              Authorization: `${state.session.tokenType} ${state.session.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ resend }),
          },
        );
        const payload = await readApiJson<{
          reminder?: LoanRow["reminder"];
          batch?: ReminderBatch;
          message?: string | string[];
        }>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        if (payload.reminder) {
          applyReminderToLoan(loan.id, payload.reminder);
        }
        if (payload.reminder?.status === "sent") {
          setNotice(
            resend
              ? `Reminder resent to ${loan.borrowerName}.`
              : `Reminder sent to ${loan.borrowerName}.`,
          );
        } else if (payload.reminder?.status === "failed") {
          setError(
            payload.reminder.lastFailureReason === "no_credits"
              ? "SMS not sent — branch has no SMS credit."
              : `Reminder failed: ${payload.reminder.lastFailureReason ?? "unknown"}.`,
          );
        } else {
          setNotice(`Sending reminder to ${loan.borrowerName}…`);
        }
        void loadLoans();
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not send reminder SMS.",
        );
      } finally {
        setReminderBusyId(null);
      }
    },
    [
      applyReminderToLoan,
      canSendReminder,
      loadLoans,
      reminderBatchActive,
      reminderBusyId,
      state.session,
    ],
  );

  const pollReminderBatch = useCallback(
    async (batchId: string) => {
      if (!state.session) return;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const response = await fetch(
          `${apiBaseUrl}/loans/reminders/batches/${batchId}`,
          {
            headers: {
              Authorization: `${state.session.tokenType} ${state.session.accessToken}`,
            },
          },
        );
        const payload = await readApiJson<
          ReminderBatch & { message?: string | string[] }
        >(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        setBulkBatch(payload);
        if (payload.status !== "QUEUED" && payload.status !== "PROCESSING") {
          setNotice(
            `Bulk SMS finished: ${payload.sentCount} sent, ${payload.skippedCount} skipped, ${payload.failedCount} failed.`,
          );
          void refreshLoansWorkspace();
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
    },
    [loadLoans, state.session],
  );

  const startBulkReminders = useCallback(async () => {
    if (!state.session || !canSendReminder || bulkBusy || reminderBatchActive) {
      return;
    }
    setBulkBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBaseUrl}/loans/reminders/bulk`, {
        method: "POST",
        headers: {
          Authorization: `${state.session.tokenType} ${state.session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filter: bulkFilter }),
      });
      const payload = await readApiJson<
        ReminderBatch & { message?: string | string[] }
      >(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setBulkBatch(payload);
      setBulkSmsOpen(false);
      setNotice(
        `Sending reminders to ${payload.totalCount} loan${payload.totalCount === 1 ? "" : "s"}…`,
      );
      await pollReminderBatch(payload.id);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not start bulk reminder SMS.",
      );
    } finally {
      setBulkBusy(false);
    }
  }, [
    bulkBusy,
    bulkFilter,
    canSendReminder,
    pollReminderBatch,
    reminderBatchActive,
    state.session,
  ]);

  const refreshLoansWorkspace = useCallback(async () => {
    const latestLoans = await loadLoans();
    await loadPendingDisbursements(latestLoans);
  }, [loadLoans, loadPendingDisbursements]);

  function openRecordDisbursement(row: PendingDisbursementRow) {
    setRecordDisbursementLoan(row);
    setDisbursementAmount("");
    setDisbursementRepaymentCash("");
    setDisbursementNote("");
    setDisbursementDate(toDateInputValue(new Date()));
    setDisbursementStaffId(state.user?.id ?? "");
    setError(null);
    setNotice(null);
    void loadDisbursementStaff();
  }

  async function recordPendingDisbursement() {
    if (!state.session || !recordDisbursementLoan || disbursementBusy) return;

    const amount = roundMoney(parseAmount(disbursementAmount));
    const collectedRepaymentsAmount = roundMoney(
      parseAmount(disbursementRepaymentCash),
    );

    if (amount <= 0) {
      setError("Enter the amount being given to the borrower.");
      return;
    }
    if (amount > recordDisbursementLoan.remainingAmount) {
      setError(
        `Amount exceeds the remaining disbursement. Maximum: ${currency} ${formatMoneyAmount(recordDisbursementLoan.remainingAmount)}.`,
      );
      return;
    }
    if (collectedRepaymentsAmount > amount) {
      setError("Repayment cash used cannot exceed the amount being disbursed.");
      return;
    }

    setDisbursementBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body: Record<string, unknown> = {
        amount,
        disbursedAt: dateInputToIso(disbursementDate),
        localId: `web-disbursement-${recordDisbursementLoan.loanId}-${Date.now()}`,
      };
      if (collectedRepaymentsAmount > 0) {
        body.collectedRepaymentsAmount = collectedRepaymentsAmount;
      }
      if (disbursementStaffId.trim()) {
        body.issuedByUserId = disbursementStaffId.trim();
      }
      if (disbursementNote.trim()) {
        body.note = disbursementNote.trim();
      }

      const response = await fetch(
        `${apiBaseUrl}/loans/${recordDisbursementLoan.loanId}/disbursements`,
        {
          method: "POST",
          headers: {
            Authorization: `${state.session.tokenType} ${state.session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setNotice(
        amount >= recordDisbursementLoan.remainingAmount
          ? `${recordDisbursementLoan.borrowerName}'s loan is now fully disbursed.`
          : `Disbursement recorded for ${recordDisbursementLoan.borrowerName}.`,
      );
      setRecordDisbursementLoan(null);
      await refreshLoansWorkspace();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not record disbursement.",
      );
    } finally {
      setDisbursementBusy(false);
    }
  }

  const bulkPreviewCount = useMemo(() => {
    const now = new Date();
    return loans.filter((loan) => {
      if (loan.balance <= 0 || loan.status === "CLOSED") return false;
      const overdueDays = resolveOverdueDays(loan, now);
      if (bulkFilter === "active") return ACTIVE_STATUSES.has(loan.status);
      if (bulkFilter === "overdue") return overdueDays >= 1;
      if (bulkFilter === "due_today") {
        return overdueDays === 0 && Boolean(loan.nextDueIsToday);
      }
      if (bulkFilter === "repayment:2-3") {
        return overdueDays >= 2 && overdueDays <= 3;
      }
      if (bulkFilter === "repayment:4-7") {
        return overdueDays >= 4 && overdueDays <= 7;
      }
      if (bulkFilter === "repayment:8+") return overdueDays >= 8;
      return false;
    }).length;
  }, [bulkFilter, loans]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      if (state.ready && state.session) {
        void refreshLoansWorkspace();
      }
    }, 0);
    return () => window.clearTimeout(boot);
  }, [refreshLoansWorkspace, state.ready, state.session]);

  const officerOptions = useMemo<OfficerOption[]>(() => {
    const map = new Map<string, string>();
    for (const loan of loans) {
      const label = loan.officerName?.trim();
      if (!label) continue;
      const key = loan.officerPublicId?.trim() || label.toLowerCase();
      if (!map.has(key)) map.set(key, label);
    }
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [loans]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    return loans.filter((loan) => {
      if (!isManager && !matchesBranch(loan.branchId)) return false;
      if (filter === "active" && !ACTIVE_STATUSES.has(loan.status))
        return false;
      if (filter === "closed" && loan.status !== "CLOSED") return false;
      if (filter === "overdue" && !isLoanScheduleOverdue(loan)) {
        return false;
      }
      if (filter === "due_today" && loan.dueDayCoverage !== "due_unpaid" && loan.dueDayCoverage !== "overdue_unpaid") {
        return false;
      }
      if (filter === "due_paid" && loan.dueDayCoverage !== "due_paid") {
        return false;
      }
      if (filter === "overdue_paid" && loan.dueDayCoverage !== "overdue_paid") {
        return false;
      }

      if (!loanMatchesOfficer(loan, advancedFilters)) return false;

      if (!loanMatchesDateIssued(loanIssueDate(loan), advancedFilters, now)) {
        return false;
      }

      const overdueDays = resolveOverdueDays(loan, now);
      if (
        !loanMatchesRepaymentPosition(overdueDays, advancedFilters.repayment)
      ) {
        return false;
      }

      if (!loanMatchesPrincipalRange(loan.principal, advancedFilters)) {
        return false;
      }

      if (!q) return true;
      const digits = q.replace(/\D/g, "");
      const haystack = [
        loan.id,
        shortLoanId(loan.id),
        loan.borrowerName,
        loan.phone,
        loan.nationalId ?? "",
        loan.loanTypeName ?? "",
        loan.officerName ?? "",
        loan.officerPublicId ?? "",
        loan.status,
        loan.status.replaceAll("_", " "),
        String(loan.principal),
        String(loan.balance),
        String(loan.paidAmount),
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(q)) return true;
      if (digits.length >= 3) {
        return [loan.phone, loan.nationalId ?? "", loan.id].some((value) =>
          value.replace(/\D/g, "").includes(digits),
        );
      }
      return false;
    });
  }, [advancedFilters, filter, isManager, loans, matchesBranch, search]);

  const filteredPendingDisbursements = useMemo(() => {
    const scoped = isManager
      ? pendingDisbursements
      : pendingDisbursements.filter((row) => matchesBranch(row.branchId));
    const q = pendingSearch.trim().toLowerCase();
    if (!q) return scoped;
    const digits = q.replace(/\D/g, "");
    return scoped.filter((row) => {
      const haystack = [
        row.loanId,
        shortLoanId(row.loanId),
        row.borrowerName,
        row.phone,
        row.branchName ?? "",
        row.issuedByName ?? "",
        row.status,
        String(row.agreedAmount),
        String(row.disbursedAmount),
        String(row.remainingAmount),
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(q)) return true;
      if (digits.length >= 3) {
        return [row.phone, row.loanId].some((value) =>
          value.replace(/\D/g, "").includes(digits),
        );
      }
      return false;
    });
  }, [isManager, matchesBranch, pendingDisbursements, pendingSearch]);

  useEffect(() => {
    setPage(1);
  }, [advancedFilters, filter, search]);

  useEffect(() => {
    if (!state.ready || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get("repayment");
    const next =
      advancedFilters.repayment === "all" ? null : advancedFilters.repayment;
    if (current === next) return;
    if (next) url.searchParams.set("repayment", next);
    else url.searchParams.delete("repayment");
    url.searchParams.delete("new");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [advancedFilters.repayment, router, state.ready]);

  const summary = useMemo(() => {
    const rows = isManager
      ? loans
      : loans.filter((loan) => matchesBranch(loan.branchId));
    return buildLoansSummary(rows);
  }, [isManager, loans, matchesBranch]);
  const paged = useMemo(
    () => paginateItems(filtered, page, pageSize),
    [filtered, page, pageSize],
  );
  const filteredBorrowers = useMemo(() => {
    const eligible = borrowers.filter(
      (borrower) => (borrower.activeLoanCount ?? 0) === 0,
    );
    const q = borrowerSearch.trim().toLowerCase();
    if (!q) return eligible.slice(0, 8);
    return eligible
      .filter((borrower) =>
        [
          borrower.fullName,
          borrower.phone,
          borrower.nationalId ?? "",
          borrower.collateralType ?? "",
        ].some((value) => value.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [borrowerSearch, borrowers]);

  async function downloadLoanAgreement(applicationId: string, loanId: string) {
    if (!state.session || agreementBusyId) return;
    setAgreementBusyId(loanId);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/loan-applications/${applicationId}/agreement.pdf`,
        {
          headers: {
            Authorization: `${state.session.tokenType} ${state.session.accessToken}`,
          },
        },
      );
      if (!response.ok) {
        let message = "Could not download loan agreement.";
        try {
          const payload = (await response.json()) as {
            message?: string | string[];
          };
          message = formatApiError(payload.message);
        } catch {
          // non-JSON body
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("content-disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/i);
      anchor.href = objectUrl;
      anchor.download =
        match?.[1] ?? `loan-agreement-${shortLoanId(loanId)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setNotice("Loan agreement downloaded.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not download loan agreement.",
      );
    } finally {
      setAgreementBusyId(null);
    }
  }

  async function startApplication() {
    if (!state.session || creating) return;
    setCreating(true);
    setPanelError(null);
    setNotice(null);
    try {
      const existing = createMode === "existing";
      if (existing && !selectedBorrowerId) {
        throw new Error("Choose a borrower first.");
      }
      const response = await fetch(
        existing
          ? `${apiBaseUrl}/loans/applications/from-borrower`
          : `${apiBaseUrl}/loans/applications`,
        {
          method: "POST",
          headers: {
            Authorization: `${state.session.tokenType} ${state.session.accessToken}`,
            ...(existing ? { "Content-Type": "application/json" } : {}),
          },
          body: existing
            ? JSON.stringify({ customerId: selectedBorrowerId })
            : undefined,
        },
      );
      const payload = await readApiJson<{
        application?: { id: string };
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      if (!payload.application?.id) {
        throw new Error("Application was not started.");
      }
      setEditingApplicationId(payload.application.id);
      setNotice("Application started.");
      setAddOpen(false);
      setSelectedBorrowerId("");
      setBorrowerSearch("");
      await refreshLoansWorkspace();
    } catch (caught) {
      setPanelError(
        caught instanceof Error
          ? caught.message
          : "Could not start application.",
      );
    } finally {
      setCreating(false);
    }
  }

  if (!state.ready || !state.session) return <AppBootSkeleton />;

  if (pendingOnly) {
    return (
      <AppShell
        session={state.session}
        workspace={state.workspace}
        user={state.user}
        branch={isManager ? state.branch : null}
      >
        <div className="mx-auto max-w-[1400px] space-y-5 animate-rise">
          <OwnerHeader
            eyebrow={isManager ? undefined : selectedBranchName}
            title="Pending Disbursements"
            showReportsButton={false}
            settingsHref={isManager ? "/settings" : "/owner/settings"}
            notificationScope={mode}
            actions={
              <button
                type="button"
                onClick={() => void refreshLoansWorkspace()}
                disabled={loading || pendingLoading}
                aria-label="Refresh pending disbursements"
                className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-emerald-50 disabled:opacity-60"
              >
                <RefreshCw
                  className={`size-4 ${loading || pendingLoading ? "animate-spin" : ""}`}
                />
              </button>
            }
          />
          <p className="-mt-2 text-sm font-medium text-slate-500">
            Borrowers have not received their full loan amounts yet.
          </p>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-[var(--forest-emerald)]">
              {notice}
            </p>
          ) : null}

          <PendingDisbursementsPanel
            rows={filteredPendingDisbursements}
            totalCount={pendingDisbursements.length}
            totalRemaining={pendingSummary.totalRemaining}
            currency={currency}
            search={pendingSearch}
            onSearch={setPendingSearch}
            loading={pendingLoading}
            onClose={() => router.push(loansHref)}
            onRecord={openRecordDisbursement}
          />
        </div>

        <RecordDisbursementDrawer
          row={recordDisbursementLoan}
          currency={currency}
          amount={disbursementAmount}
          repaymentCash={disbursementRepaymentCash}
          note={disbursementNote}
          date={disbursementDate}
          staffId={disbursementStaffId}
          staffOptions={staffOptions}
          staffLoading={staffLoading}
          busy={disbursementBusy}
          onAmountChange={setDisbursementAmount}
          onRepaymentCashChange={setDisbursementRepaymentCash}
          onNoteChange={setDisbursementNote}
          onDateChange={setDisbursementDate}
          onStaffChange={setDisbursementStaffId}
          onClose={() => !disbursementBusy && setRecordDisbursementLoan(null)}
          onSubmit={() => void recordPendingDisbursement()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      session={state.session}
      workspace={state.workspace}
      user={state.user}
      branch={isManager ? state.branch : null}
    >
      <div className="mx-auto max-w-[1400px] space-y-5 animate-rise">
        <OwnerHeader
          eyebrow={isManager ? undefined : selectedBranchName}
          title="Loans"
          showReportsButton={false}
          settingsHref={isManager ? "/settings" : "/owner/settings"}
          notificationScope={mode}
          actions={
            <button
              type="button"
              onClick={() => void refreshLoansWorkspace()}
              disabled={loading || pendingLoading}
              aria-label="Refresh loans"
              className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-emerald-50 disabled:opacity-60"
            >
              <RefreshCw
                className={`size-4 ${loading || pendingLoading ? "animate-spin" : ""}`}
              />
            </button>
          }
        />
        <p className="-mt-2 text-sm font-medium text-slate-500">
          {isManager
            ? "Track loans, monitor repayments, and follow up on overdue balances."
            : "Review loan portfolio performance across branches."}
        </p>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-[var(--forest-emerald)]">
            {notice}
          </p>
        ) : null}

        <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <LoansSummaryCard
            title="Loans Issued"
            icon={<FileText className="size-4" />}
            value={{ amount: formatNumber(summary.issuedThisMonth) }}
            context="this month"
            monthDelta={{
              value: summary.issuedThisMonth - summary.issuedLastMonth,
              format: "number",
            }}
            secondary={{
              amount: formatNumber(summary.issuedAllTime),
              suffix: "all time",
            }}
            rows={[
              {
                label: "active",
                value: { amount: formatNumber(summary.activeCount) },
                tone: "good",
              },
              {
                label: "closed",
                value: { amount: formatNumber(summary.closedCount) },
                tone: "neutral",
              },
            ]}
          />
          <LoansSummaryCard
            title="Overdue Loans"
            icon={<AlertCircle className="size-4" />}
            value={{ amount: formatNumber(summary.overdueCount) }}
            context={`${summary.overduePercentLabel} of active loans`}
            rows={[
              {
                label: "overdue balance",
                value: {
                  currency,
                  amount: formatMoneyAmount(summary.overdueBalance),
                },
                tone: "warn",
              },
              {
                label: "overdue by 2+ days",
                value: {
                  amount: formatNumber(summary.overdueBy2PlusCount),
                  suffix: "loans",
                },
                tone: "warn",
              },
            ]}
          />
          <LoansSummaryCard
            title="Principal Issued"
            icon={<Banknote className="size-4" />}
            value={{
              currency,
              amount: formatMoneyAmount(summary.principalThisMonth),
            }}
            context="this month"
            monthDelta={{
              value: summary.principalThisMonth - summary.principalLastMonth,
              format: "money",
            }}
            secondary={{
              currency,
              amount: formatMoneyAmount(summary.principalAllTime),
              suffix: "all time",
            }}
            rows={[
              {
                label: "outstanding",
                value: {
                  currency,
                  amount: formatMoneyAmount(summary.outstanding),
                },
                tone: "warn",
              },
              {
                label: "repaid",
                value: {
                  currency,
                  amount: formatMoneyAmount(summary.repaid),
                },
                tone: "good",
              },
            ]}
          />
          <LoansSummaryCard
            title="Expected Interest"
            icon={<Percent className="size-4" />}
            value={{
              currency,
              amount: formatMoneyAmount(summary.expectedInterest),
            }}
            context="from active loans"
            rows={[
              {
                label: "not overdue",
                value: {
                  currency,
                  amount: formatMoneyAmount(summary.interestNotOverdue),
                },
                tone: "good",
              },
              {
                label: "at risk",
                value: {
                  currency,
                  amount: formatMoneyAmount(summary.interestAtRisk),
                },
                tone: "warn",
              },
            ]}
          />
        </section>

        {pendingSummary.borrowersCount > 0 ? (
          <PendingDisbursementsBanner
            count={pendingSummary.borrowersCount}
            totalRemaining={pendingSummary.totalRemaining}
            currency={currency}
            onOpen={() => router.push(pendingHref)}
          />
        ) : null}

        <section className="rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f5] px-4 py-3.5">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h2 className="text-[15px] font-semibold text-[#0b1220]">
                {isManager ? "Loan Records" : "All Loans"}
              </h2>
              <TableSearchField
                value={search}
                onChange={setSearch}
                placeholder="Search Loans..."
                title="Search by borrower, loan ID, phone, national ID, loan type, officer, status or amount."
              />
              <select
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as PortfolioFilter)
                }
                className="h-9 w-full rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold outline-none sm:w-[210px]"
              >
                <option value="all">All Loans</option>
                <option value="active">Active Loans</option>
                <option value="closed">Closed Loans</option>
                <option value="due_today">Still due today</option>
                <option value="due_paid">Paid today</option>
                <option value="overdue_paid">Overdue paid today</option>
                <option value="overdue">Overdue Loans</option>
              </select>
              <LoansFiltersControl
                officers={officerOptions}
                applied={advancedFilters}
                onApply={setAdvancedFilters}
              />
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {canSendReminder ? (
                <button
                  type="button"
                  disabled={bulkBusy || reminderBatchActive}
                  onClick={() => {
                    setBulkSmsOpen(true);
                    setError(null);
                  }}
                  className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3.5 text-xs font-semibold text-[#111a2e] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-[#f8faf9] disabled:opacity-60"
                >
                  <MessageSquare className="size-3.5" />
                  {reminderBatchActive ? "Sending SMS…" : "Bulk SMS"}
                </button>
              ) : null}
              {canCreate ? (
                <button
                  type="button"
                  onClick={() => {
                    setPanelError(null);
                    setCreateMode("new");
                    setAddOpen(true);
                  }}
                  className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3.5 text-xs font-semibold text-[#111a2e] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-[#f8faf9]"
                >
                  <Plus className="size-3.5" />
                  New Loan
                </button>
              ) : null}
              <button
                type="button"
                disabled={exporting || filtered.length === 0}
                onClick={() =>
                  void exportPortfolio(filtered, currency, setExporting)
                }
                className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3.5 text-xs font-semibold text-[#111a2e] shadow-[0_8px_18px_rgba(15,23,42,0.045)] disabled:opacity-60"
              >
                <Download className="size-3.5" />
                {exporting ? "Exporting" : "Export"}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-b-[16px]">
            {/* Mobile / narrow: stacked loan cards — no horizontal scroll */}
            <div className="divide-y divide-[#edf1f5] xl:hidden">
              {loading ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  Loading loans...
                </p>
              ) : filtered.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  No loans match this view.
                </p>
              ) : (
                paged.items.map((loan) => {
                  const dueState = resolveLoanDueState(loan);
                  const selected = detailLoan?.id === loan.id;
                  return (
                    <article
                      key={loan.id}
                      className={`cursor-pointer px-4 py-3.5 transition-colors hover:bg-[#eef7f2] ${
                        selected
                          ? "bg-[#eef7f2] shadow-[inset_3px_0_0_0_#07885f]"
                          : ""
                      }`}
                      onClick={() => {
                        if (loan.applicationId) setDetailLoan(loan);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] font-semibold text-slate-500">
                            {shortLoanId(loan.id)}
                          </p>
                          <p className="mt-0.5 truncate text-[13px] font-semibold text-[#0b1220]">
                            {loan.borrowerName}
                          </p>
                          <p className="truncate text-[11px] text-slate-500">
                            {loan.phone}
                          </p>
                        </div>
                        <div
                          className="flex shrink-0 flex-col items-end gap-1"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <LoanStatusBadge dueState={dueState} />
                          <ReminderBadge reminder={loan.reminder} />
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <LoanCardMetric
                          label="Principal"
                          value={
                            <Money
                              value={loan.principal}
                              currency={currency}
                              stack
                            />
                          }
                        />
                        <LoanCardMetric
                          label="Total repayable"
                          value={
                            <Money
                              value={loanTotalRepayable(loan)}
                              currency={currency}
                              stack
                            />
                          }
                        />
                        <LoanCardMetric
                          label="Repaid"
                          value={
                            <Money
                              value={loan.paidAmount}
                              currency={currency}
                              stack
                              className="text-[var(--forest-emerald)]"
                            />
                          }
                        />
                        <LoanCardMetric
                          label="Outstanding"
                          value={
                            <Money
                              value={loan.balance}
                              currency={currency}
                              stack
                            />
                          }
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
                        <div className="min-w-0 text-[11px] text-slate-600">
                          <p className="truncate">
                            {loan.loanTypeName
                              ? titleCase(loan.loanTypeName)
                              : "—"}
                          </p>
                          <p className="mt-0.5 truncate">
                            By {loan.officerName?.trim() || "—"}
                          </p>
                          <div className="mt-1">
                            <NextDueCell loan={loan} dueState={dueState} />
                          </div>
                        </div>
                        <div onClick={(event) => event.stopPropagation()}>
                          <RowActions
                            label={`Actions for ${loan.borrowerName}`}
                            busy={
                              agreementBusyId === loan.id ||
                              reminderBusyId === loan.id
                            }
                            items={loanRowActions(
                              loan,
                              canRecordRepayment,
                              canSendReminder,
                              reminderBusyId === loan.id || reminderBatchActive,
                              setDetailLoan,
                              setRepaymentLoan,
                              openRecordDisbursement,
                              downloadLoanAgreement,
                              (resend) => void sendLoanReminder(loan, resend),
                            )}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {/* Desktop: full-width table, no horizontal scroll */}
            <div className="hidden xl:block">
              <table className="w-full table-fixed text-left text-[11px]">
                <thead className="border-b border-[#dfe5eb] bg-[#e8edf2] text-[10px] font-semibold text-slate-600">
                  <tr>
                    <th className="w-[7%] px-2 py-2.5">Loan ID</th>
                    <th className="w-[14%] px-2 py-2.5">Borrower</th>
                    <th className="w-[11%] px-2 py-2.5">Loan Type</th>
                    <th className="w-[9%] px-2 py-2.5 text-right">Principal</th>
                    <th className="w-[10%] px-2 py-2.5 text-right">
                      Total Repayable
                    </th>
                    <th className="w-[9%] px-2 py-2.5 text-right">Repaid</th>
                    <th className="w-[10%] px-2 py-2.5 text-right">
                      Outstanding
                    </th>
                    <th className="w-[11%] px-2 py-2.5">Next Due</th>
                    <th className="w-[8%] px-2 py-2.5">Status</th>
                    <th className="w-[8%] px-2 py-2.5">Reminder</th>
                    <th className="w-[7%] px-2 py-2.5">Issued By</th>
                    <th className="w-[3%] px-1 py-2.5 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f5]">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={12}
                        className="px-3 py-8 text-center text-slate-500"
                      >
                        Loading loans...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={12}
                        className="px-3 py-8 text-center text-slate-500"
                      >
                        No loans match this view.
                      </td>
                    </tr>
                  ) : (
                    paged.items.map((loan) => {
                      const dueState = resolveLoanDueState(loan);
                      const selected = detailLoan?.id === loan.id;
                      return (
                        <tr
                          key={loan.id}
                          className={`cursor-pointer transition-colors hover:bg-[#eef7f2] ${
                            selected
                              ? "bg-[#eef7f2] shadow-[inset_3px_0_0_0_#07885f]"
                              : ""
                          }`}
                          onClick={() => {
                            if (loan.applicationId) {
                              setDetailLoan(loan);
                            }
                          }}
                        >
                          <td className="px-2 py-2.5 align-top">
                            <p className="break-all font-bold tabular-nums text-[#0b1220]">
                              {shortLoanId(loan.id)}
                            </p>
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <p className="break-words font-semibold leading-snug text-[#0b1220]">
                              {loan.borrowerName}
                            </p>
                            <p className="mt-0.5 break-all text-[10px] text-slate-500">
                              {loan.phone}
                            </p>
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <p className="break-words leading-snug">
                              {loan.loanTypeName
                                ? titleCase(loan.loanTypeName)
                                : "-"}
                            </p>
                          </td>
                          <td className="px-2 py-2.5 align-top text-right">
                            <Money
                              value={loan.principal}
                              currency={currency}
                              stack
                            />
                          </td>
                          <td className="px-2 py-2.5 align-top text-right">
                            <Money
                              value={loanTotalRepayable(loan)}
                              currency={currency}
                              stack
                            />
                          </td>
                          <td className="px-2 py-2.5 align-top text-right text-[var(--forest-emerald)]">
                            <Money
                              value={loan.paidAmount}
                              currency={currency}
                              stack
                            />
                          </td>
                          <td className="px-2 py-2.5 align-top text-right">
                            <Money
                              value={loan.balance}
                              currency={currency}
                              stack
                            />
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <NextDueCell loan={loan} dueState={dueState} />
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <LoanStatusBadge dueState={dueState} />
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <ReminderBadge reminder={loan.reminder} />
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <p className="break-words leading-snug text-slate-700">
                              {loan.officerName?.trim() || "-"}
                            </p>
                          </td>
                          <td
                            className="px-1 py-2.5 align-top"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <RowActions
                              label={`Actions for ${loan.borrowerName}`}
                              busy={
                                agreementBusyId === loan.id ||
                                reminderBusyId === loan.id
                              }
                              items={loanRowActions(
                                loan,
                                canRecordRepayment,
                                canSendReminder,
                                reminderBusyId === loan.id ||
                                  reminderBatchActive,
                                setDetailLoan,
                                setRepaymentLoan,
                                openRecordDisbursement,
                                downloadLoanAgreement,
                                (resend) => void sendLoanReminder(loan, resend),
                              )}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={paged.currentPage}
              pageSize={paged.pageSize}
              total={paged.total}
              itemLabel="loans"
              onPageChange={setPage}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          </div>
        </section>
      </div>

      {bulkSmsOpen && canSendReminder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(8,15,31,0.36)] p-4 backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close bulk SMS"
            onClick={() => !bulkBusy && setBulkSmsOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#e6ebf0] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--forest-emerald)]">
                  Bulk SMS
                </p>
                <h2 className="mt-1 text-lg font-bold text-[#0b1220]">
                  Send loan reminders
                </h2>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Reminders are sent one by one. Sending stops if SMS credit
                  runs out.
                </p>
              </div>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-xl border border-[#e6ebf0]"
                onClick={() => !bulkBusy && setBulkSmsOpen(false)}
                aria-label="Close"
                disabled={bulkBusy}
              >
                <X className="size-4" />
              </button>
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-semibold text-slate-600">
                Reminder audience
              </span>
              <select
                value={bulkFilter}
                onChange={(event) =>
                  setBulkFilter(event.target.value as ReminderFilter)
                }
                disabled={bulkBusy}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#e6ebf0] bg-white px-3 text-sm font-semibold outline-none"
              >
                <option value="overdue">All overdue</option>
                <option value="due_today">Due today</option>
                <option value="repayment:2-3">Overdue 2–3 days</option>
                <option value="repayment:4-7">Overdue 4–7 days</option>
                <option value="repayment:8+">Overdue 8+ days</option>
                <option value="active">All active loans</option>
              </select>
            </label>
            <p className="mt-3 rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 py-2 text-xs font-semibold text-slate-600">
              {bulkPreviewCount} loan{bulkPreviewCount === 1 ? "" : "s"} match
              this filter
              {reminderBatchActive ? " · a batch is already running" : ""}
            </p>
            {bulkBatch && reminderBatchActive ? (
              <p className="mt-2 text-xs font-medium text-slate-500">
                Progress: {bulkBatch.sentCount} sent · {bulkBatch.skippedCount}{" "}
                skipped · {bulkBatch.failedCount} failed of{" "}
                {bulkBatch.totalCount}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="h-10 flex-1 rounded-xl border border-[#e6ebf0] text-xs font-semibold"
                disabled={bulkBusy}
                onClick={() => setBulkSmsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#003f35] text-xs font-semibold text-white disabled:opacity-55"
                disabled={
                  bulkBusy || reminderBatchActive || bulkPreviewCount === 0
                }
                onClick={() => void startBulkReminders()}
              >
                {bulkBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <MessageSquare className="size-3.5" />
                )}
                Send reminders
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addOpen && canCreate ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(8,15,31,0.36)] backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close new loan panel"
            onClick={() => setAddOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-[#e6ebf0] bg-white shadow-[-18px_0_44px_rgba(15,23,42,0.18)]">
            <header className="flex items-start justify-between gap-3 border-b border-[#edf1f5] px-4 py-3">
              <div>
                <h2 className="text-lg font-bold text-[#0b1220]">New loan</h2>
                <p className="text-xs text-slate-500">
                  Start from a new application or an existing borrower.
                </p>
              </div>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-xl border border-[#e6ebf0]"
                onClick={() => setAddOpen(false)}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {panelError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {panelError}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <ChoiceButton
                  active={createMode === "new"}
                  icon={<Plus className="size-4" />}
                  label="New application"
                  onClick={() => setCreateMode("new")}
                />
                <ChoiceButton
                  active={createMode === "existing"}
                  icon={<UserRound className="size-4" />}
                  label="Existing borrower"
                  onClick={() => {
                    setCreateMode("existing");
                    if (borrowers.length === 0 && !borrowersLoading) {
                      void loadBorrowers();
                    }
                  }}
                />
              </div>
              {createMode === "existing" ? (
                <div className="space-y-3">
                  <label className="flex h-10 items-center gap-2 rounded-xl border border-[#e6ebf0] px-3">
                    <Search className="size-4 text-slate-400" />
                    <input
                      type="search"
                      value={borrowerSearch}
                      onChange={(event) =>
                        setBorrowerSearch(event.target.value)
                      }
                      placeholder="Search borrowers"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    />
                  </label>
                  {borrowersLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <SkeletonBlock key={index} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : filteredBorrowers.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No eligible borrowers. Borrowers with an active loan
                      cannot start another.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#edf1f5] rounded-xl border border-[#e6ebf0]">
                      {filteredBorrowers.map((borrower) => (
                        <button
                          key={borrower.id}
                          type="button"
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[#f8faf9] ${
                            selectedBorrowerId === borrower.id
                              ? "bg-emerald-50"
                              : ""
                          }`}
                          onClick={() => setSelectedBorrowerId(borrower.id)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-[#0b1220]">
                              {borrower.fullName}
                            </span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {borrower.phone}
                            </span>
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {borrower.loanCount} loan
                            {borrower.loanCount === 1 ? "" : "s"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <div className="border-t border-[#edf1f5] px-4 py-3">
              <button
                type="button"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] text-xs font-semibold text-white disabled:opacity-55"
                disabled={
                  creating || (createMode === "existing" && !selectedBorrowerId)
                }
                onClick={() => void startApplication()}
              >
                {creating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Start application
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {state.session ? (
        <>
          <ApplicationDetailDrawer
            applicationId={detailLoan?.applicationId ?? null}
            accessToken={state.session.accessToken}
            tokenType={state.session.tokenType}
            customerId={detailLoan?.customerId}
            loanDisplayId={detailLoan ? shortLoanId(detailLoan.id) : null}
            loanStatusLabel={
              detailLoan
                ? loanDueStatusLabel(resolveLoanDueState(detailLoan))
                : null
            }
            loan={
              detailLoan
                ? {
                    id: detailLoan.id,
                    borrowerName: detailLoan.borrowerName,
                    phone: detailLoan.phone,
                    loanTypeName: detailLoan.loanTypeName,
                    principal: detailLoan.principal,
                    currency: detailLoan.currency || currency,
                    disbursedAt: detailLoan.disbursedAt,
                    officerName: detailLoan.officerName,
                    officerPublicId: detailLoan.officerPublicId ?? null,
                    balance: detailLoan.balance,
                    paidAmount: detailLoan.paidAmount,
                    totalRepayable: loanTotalRepayable(detailLoan),
                    openingBalance: detailLoan.openingBalance,
                    expectedInterest: expectedInterestForLoan(detailLoan),
                    processingFee: detailLoan.processingFee,
                    installmentAmount: detailLoan.installmentAmount,
                    overdueDays: resolveOverdueDays(detailLoan, new Date()),
                    nextDueDate: detailLoan.nextDueDate,
                    durationDays: detailLoan.durationDays,
                    dueDate: detailLoan.dueDate,
                    status: detailLoan.status,
                  }
                : null
            }
            canRecordRepayment={canRecordRepayment}
            canCorrect={!isManager}
            session={state.session}
            onCorrected={() => {
              setDetailRefreshKey((key) => key + 1);
              void refreshLoansWorkspace();
            }}
            onRecordRepayment={
              detailLoan && canRecordRepayment
                ? () => {
                    setRepaymentLoan(detailLoan);
                  }
                : undefined
            }
            refreshKey={detailRefreshKey}
            onClose={() => setDetailLoan(null)}
          />
          {isManager ? (
            <LoanApplicationFormDrawer
              applicationId={editingApplicationId}
              accessToken={state.session.accessToken}
              tokenType={state.session.tokenType}
              onClose={() => setEditingApplicationId(null)}
              onSubmitted={() => {
                setEditingApplicationId(null);
                setNotice("Loan given.");
                void refreshLoansWorkspace();
              }}
            />
          ) : null}
          <RecordRepaymentModal
            open={Boolean(repaymentLoan)}
            loan={
              repaymentLoan
                ? {
                    id: repaymentLoan.id,
                    borrowerName: repaymentLoan.borrowerName,
                    phone: repaymentLoan.phone,
                    balance: repaymentLoan.balance,
                    currency: repaymentLoan.currency || currency,
                  }
                : null
            }
            accessToken={state.session.accessToken}
            tokenType={state.session.tokenType}
            onClose={() => setRepaymentLoan(null)}
            onRecorded={() => {
              setNotice("Repayment recorded.");
              setDetailRefreshKey((key) => key + 1);
              void refreshLoansWorkspace();
            }}
          />
          <RecordDisbursementDrawer
            row={recordDisbursementLoan}
            currency={currency}
            amount={disbursementAmount}
            repaymentCash={disbursementRepaymentCash}
            note={disbursementNote}
            date={disbursementDate}
            staffId={disbursementStaffId}
            staffOptions={staffOptions}
            staffLoading={staffLoading}
            busy={disbursementBusy}
            onAmountChange={setDisbursementAmount}
            onRepaymentCashChange={setDisbursementRepaymentCash}
            onNoteChange={setDisbursementNote}
            onDateChange={setDisbursementDate}
            onStaffChange={setDisbursementStaffId}
            onClose={() => !disbursementBusy && setRecordDisbursementLoan(null)}
            onSubmit={() => void recordPendingDisbursement()}
          />
        </>
      ) : null}
    </AppShell>
  );
}

const SUMMARY_ROW_TONE = {
  good: {
    shell: "bg-[#eef9f2]",
    dot: "bg-[#17a36a]",
  },
  warn: {
    shell: "bg-[#fff3e8]",
    dot: "bg-[#f0a04b]",
  },
  neutral: {
    shell: "bg-[#f3f5f7]",
    dot: "bg-[#94a3b8]",
  },
} as const;

type SummaryAmount = {
  amount: string;
  currency?: string;
  suffix?: string;
};

type MonthDelta = {
  value: number;
  format: "number" | "money";
};

function LoansSummaryCard({
  title,
  icon,
  value,
  context,
  monthDelta,
  secondary,
  rows,
}: {
  title: string;
  icon: ReactNode;
  value: SummaryAmount;
  context: string;
  monthDelta?: MonthDelta;
  secondary?: SummaryAmount;
  rows: Array<{
    label: string;
    value: SummaryAmount;
    tone: keyof typeof SUMMARY_ROW_TONE;
  }>;
}) {
  return (
    <article className="overflow-hidden rounded-[14px] border border-[#e8edf2] bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e9f8ef] text-[#07885f] [&_svg]:size-3.5">
          {icon}
        </span>
        <h3 className="truncate text-[13px] font-bold tracking-[-0.02em] text-[#0b1220]">
          {title}
        </h3>
      </div>

      <div className="mt-2.5 flex items-stretch gap-2">
        <div className="flex min-w-0 flex-[1.15] flex-col justify-center overflow-hidden pr-0.5">
          <SummaryMetric value={value} size="lg" />
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="text-[11px] font-medium leading-tight text-slate-500">
              {context}
            </p>
            {monthDelta ? <MonthDeltaBadge delta={monthDelta} /> : null}
          </div>
          {secondary ? (
            <div className="mt-1 min-w-0">
              <SummaryMetric value={secondary} size="sm" />
            </div>
          ) : null}
        </div>

        <div className="w-px shrink-0 bg-[#edf1f5]" aria-hidden />

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          {rows.map((row) => {
            const tone = SUMMARY_ROW_TONE[row.tone];
            return (
              <div
                key={row.label}
                className={`flex min-w-0 items-start gap-1.5 rounded-lg px-1.5 py-1.5 ${tone.shell}`}
              >
                <span
                  className={`mt-1 size-2 shrink-0 rounded-full ${tone.dot}`}
                />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <SummaryMetric value={row.value} size="chip" />
                  <p className="mt-0.5 truncate text-[10px] font-medium capitalize leading-tight text-slate-500">
                    {row.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}

function MonthDeltaBadge({ delta }: { delta: MonthDelta }) {
  const up = delta.value > 0;
  const down = delta.value < 0;
  const absolute = Math.abs(delta.value);
  const label =
    delta.format === "money"
      ? formatMoneyAmount(absolute)
      : formatNumber(absolute);
  const tone = down
    ? "bg-[#fdecec] text-[#c23b3b]"
    : "bg-[#e9f8ef] text-[#07885f]";

  return (
    <>
      <span
        className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${tone}`}
      >
        {down ? (
          <ArrowDown className="size-2.5 stroke-[2.5]" />
        ) : (
          <ArrowUp className="size-2.5 stroke-[2.5]" />
        )}
        {up || down ? label : formatNumber(0)}
      </span>
      <span className="text-[10px] font-medium text-slate-400">
        vs last month
      </span>
    </>
  );
}

function SummaryMetric({
  value,
  size,
}: {
  value: SummaryAmount;
  size: "lg" | "sm" | "chip";
}) {
  const amountClass =
    size === "lg"
      ? "text-[clamp(0.95rem,1.35vw,1.35rem)] font-bold leading-none tracking-[-0.03em] text-[#0b1220]"
      : size === "sm"
        ? "text-[11px] font-semibold leading-none text-[#334155]"
        : "text-[clamp(0.68rem,0.95vw,0.78rem)] font-bold leading-none tracking-[-0.02em] text-[#0b1220]";

  const currencyClass =
    size === "lg"
      ? "text-[9px] font-semibold uppercase tracking-[0.04em] text-slate-500"
      : size === "sm"
        ? "text-[9px] font-semibold uppercase tracking-[0.03em] text-slate-500"
        : "text-[8px] font-semibold uppercase tracking-[0.03em] text-slate-500";

  // Money: stack currency above amount so full figures stay readable in tight cards.
  if (value.currency) {
    return (
      <div className="min-w-0 max-w-full tabular-nums">
        <p className={currencyClass}>{value.currency}</p>
        <p
          className={`mt-0.5 min-w-0 truncate whitespace-nowrap ${amountClass}`}
          title={`${value.currency} ${value.amount}`}
        >
          {value.amount}
        </p>
        {value.suffix ? (
          <p className="mt-0.5 text-[10px] font-medium text-slate-500">
            {value.suffix}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <p className="inline-flex max-w-full min-w-0 items-baseline gap-1 tabular-nums">
      <span className={`min-w-0 truncate ${amountClass}`}>{value.amount}</span>
      {value.suffix ? (
        <span className="shrink-0 text-[0.85em] font-medium text-slate-500">
          {value.suffix}
        </span>
      ) : null}
    </p>
  );
}

function PendingDisbursementsBanner({
  count,
  totalRemaining,
  currency,
  onOpen,
}: {
  count: number;
  totalRemaining: number;
  currency: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-wrap items-center justify-between gap-4 rounded-[14px] border border-red-100 bg-[#fff0f2] px-5 py-4 text-left shadow-[0_10px_26px_rgba(225,29,46,0.08)] transition hover:border-red-200 hover:bg-[#ffe8eb]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#ffe1e6] text-[#e11d2e]">
          <Wallet className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-bold text-[#0b1220]">
            Pending disbursements
          </span>
          <span className="mt-0.5 block text-xs font-semibold text-slate-600">
            {count} borrower{count === 1 ? "" : "s"} have not received their
            full loans
          </span>
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-6">
        <span className="hidden h-10 w-px bg-red-100 sm:block" />
        <span className="min-w-0">
          <span className="block text-sm font-black tabular-nums text-[#e11d2e]">
            {currency} {formatMoneyAmount(totalRemaining)}
          </span>
          <span className="mt-0.5 block text-[11px] font-semibold text-slate-600">
            Remaining to disburse
          </span>
        </span>
        <span className="text-sm font-bold text-[#e11d2e] transition group-hover:translate-x-0.5">
          View pending →
        </span>
      </span>
    </button>
  );
}

function PendingDisbursementsPanel({
  rows,
  totalCount,
  totalRemaining,
  currency,
  search,
  onSearch,
  loading,
  onClose,
  onRecord,
}: {
  rows: PendingDisbursementRow[];
  totalCount: number;
  totalRemaining: number;
  currency: string;
  search: string;
  onSearch: (value: string) => void;
  loading: boolean;
  onClose: () => void;
  onRecord: (row: PendingDisbursementRow) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f5] px-4 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 grid size-8 place-items-center rounded-xl border border-[#e6ebf0] text-[#0b1220] hover:bg-[#f8faf9]"
            aria-label="Back to loans"
          >
            ←
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-[#0b1220]">
              Pending Disbursements
            </h2>
            <p className="text-xs font-medium text-slate-500">
              Borrowers have not received their full loan amounts yet.
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-3 border-b border-[#edf1f5] p-4 lg:grid-cols-[1fr_1.7fr]">
        <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[#edf1f5] bg-[#fbfcfd]">
          <DisbursementSummaryCell
            icon={<Wallet className="size-5" />}
            label="Borrowers"
            value={formatNumber(totalCount)}
            tone="danger"
          />
          <DisbursementSummaryCell
            icon={<Banknote className="size-5" />}
            label="Total remaining"
            value={`${currency} ${formatMoneyAmount(totalRemaining)}`}
            tone="danger"
          />
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900">
          <Info className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm font-medium leading-6">
            These loans become active only when the borrower receives the full
            requested amount. The repayment schedule starts after the final
            disbursement is recorded.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f5] px-4 py-3">
        <TableSearchField
          value={search}
          onChange={onSearch}
          placeholder="Search borrower or loan ID..."
          title="Search by borrower, loan ID, phone, branch, staff or amount."
        />
        <p className="text-xs font-semibold text-slate-500">
          Showing {formatNumber(rows.length)} of {formatNumber(totalCount)}
        </p>
      </div>

      <div className="overflow-hidden">
        <table className="hidden w-full table-fixed text-left text-[11px] xl:table">
          <thead className="border-b border-[#dfe5eb] bg-[#e8edf2] text-[10px] font-semibold text-slate-600">
            <tr>
              <th className="w-[19%] px-3 py-2.5">Borrower</th>
              <th className="w-[12%] px-3 py-2.5">Loan ID</th>
              <th className="w-[12%] px-3 py-2.5 text-right">Agreed Amount</th>
              <th className="w-[12%] px-3 py-2.5 text-right">Disbursed</th>
              <th className="w-[11%] px-3 py-2.5 text-right">Remaining</th>
              <th className="w-[12%] px-3 py-2.5">% Disbursed</th>
              <th className="w-[12%] px-3 py-2.5">Last Disbursement</th>
              <th className="w-[10%] px-3 py-2.5">Issued By</th>
              <th className="w-[10%] px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf1f5]">
            {loading ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-slate-500"
                >
                  Loading pending disbursements...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-slate-500"
                >
                  No pending disbursements match this view.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.loanId} className="hover:bg-[#fff8f9]">
                  <td className="px-3 py-3 align-top">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eef9f2] text-[11px] font-black text-[#07885f]">
                        {initials(row.borrowerName)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-[#0b1220]">
                          {row.borrowerName}
                        </span>
                        <span className="block truncate text-[10px] text-slate-500">
                          {row.phone}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top font-mono font-bold text-slate-600">
                    {shortLoanId(row.loanId)}
                  </td>
                  <td className="px-3 py-3 text-right align-top font-bold tabular-nums text-[#0b1220]">
                    {formatMoneyAmount(row.agreedAmount)}
                  </td>
                  <td className="px-3 py-3 text-right align-top tabular-nums text-[#0b1220]">
                    <span className="font-bold">
                      {formatMoneyAmount(row.disbursedAmount)}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-slate-500">
                      {row.disbursementCount} payment
                      {row.disbursementCount === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right align-top font-black tabular-nums text-[#e11d2e]">
                    {formatMoneyAmount(row.remainingAmount)}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <DisbursementProgress percent={row.percentDisbursed} />
                  </td>
                  <td className="px-3 py-3 align-top text-slate-600">
                    {row.lastDisbursementAt ? (
                      <>
                        <span className="block font-semibold text-[#0b1220]">
                          {formatDate(row.lastDisbursementAt)}
                        </span>
                        <span className="text-[10px]">
                          {currency}{" "}
                          {formatMoneyAmount(row.lastDisbursementAmount ?? 0)}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className="block truncate font-semibold text-[#0b1220]">
                      {row.issuedByName ?? "—"}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Field Officer
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right align-top">
                    <button
                      type="button"
                      onClick={() => onRecord(row)}
                      className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[#07885f] px-3 text-[11px] font-bold text-[#07885f] transition hover:bg-[#eef9f2]"
                    >
                      Complete Disbursement
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="divide-y divide-[#edf1f5] xl:hidden">
          {rows.map((row) => (
            <article key={row.loanId} className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#0b1220]">
                    {row.borrowerName}
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    Loan: {shortLoanId(row.loanId)}
                  </p>
                </div>
                <p className="text-right text-sm font-black tabular-nums text-[#e11d2e]">
                  {currency} {formatMoneyAmount(row.remainingAmount)}
                  <span className="block text-[11px] font-semibold text-slate-500">
                    remaining
                  </span>
                </p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-[#edf1f5] bg-[#fbfcfd] p-2">
                <LoanCardMetric
                  label="Agreed"
                  value={
                    <Money value={row.agreedAmount} currency={currency} stack />
                  }
                />
                <LoanCardMetric
                  label="Disbursed"
                  value={
                    <Money
                      value={row.disbursedAmount}
                      currency={currency}
                      stack
                    />
                  }
                />
                <LoanCardMetric
                  label="Count"
                  value={<span>{row.disbursementCount}</span>}
                />
              </div>
              <button
                type="button"
                onClick={() => onRecord(row)}
                className="mt-3 h-10 w-full rounded-xl border border-[#07885f] text-xs font-bold text-[#07885f]"
              >
                Complete Disbursement
              </button>
            </article>
          ))}
          {!loading && rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              No pending disbursements match this view.
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-[#edf1f5] bg-[#f1fbf5] px-4 py-3 text-xs font-semibold text-[#05603a]">
        Once the full loan amount has been disbursed, the loan moves to active
        loans automatically.
      </div>
    </section>
  );
}

function DisbursementSummaryCell({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "danger" | "good";
}) {
  const color = tone === "danger" ? "text-[#e11d2e]" : "text-[#07885f]";
  const bg = tone === "danger" ? "bg-[#ffe7eb]" : "bg-[#e9f8ef]";
  return (
    <div className="flex min-w-0 items-center gap-3 border-r border-[#edf1f5] p-4 last:border-r-0">
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-2xl ${bg} ${color}`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span
          className={`block truncate text-lg font-black tabular-nums ${color}`}
        >
          {value}
        </span>
        <span className="block text-xs font-semibold text-slate-500">
          {label}
        </span>
      </span>
    </div>
  );
}

function DisbursementProgress({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="min-w-0">
      <div className="h-2 overflow-hidden rounded-full bg-[#dfe5eb]">
        <div
          className="h-full rounded-full bg-[#07885f]"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] font-bold tabular-nums text-slate-600">
        {clamped}%
      </p>
    </div>
  );
}

function RecordDisbursementDrawer({
  row,
  currency,
  amount,
  repaymentCash,
  note,
  date,
  staffId,
  staffOptions,
  staffLoading,
  busy,
  onAmountChange,
  onRepaymentCashChange,
  onNoteChange,
  onDateChange,
  onStaffChange,
  onClose,
  onSubmit,
}: {
  row: PendingDisbursementRow | null;
  currency: string;
  amount: string;
  repaymentCash: string;
  note: string;
  date: string;
  staffId: string;
  staffOptions: DisbursementStaffOption[];
  staffLoading: boolean;
  busy: boolean;
  onAmountChange: (value: string) => void;
  onRepaymentCashChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onStaffChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!row) return null;

  const amountValue = roundMoney(parseAmount(amount));
  const repaymentValue = roundMoney(parseAmount(repaymentCash));
  const assignedFloat = Math.max(0, amountValue - repaymentValue);
  const selectedStaff =
    staffOptions.find((staff) => staff.id === staffId) ?? null;
  const detectedRemainingFloat =
    optionalMoneyNumber(selectedStaff?.remainingFloatToday) ??
    optionalMoneyNumber(selectedStaff?.floatToday);
  const repaymentsAvailable =
    optionalMoneyNumber(selectedStaff?.collectedRepaymentsAvailableToday) ?? 0;
  const repaymentShortfall =
    detectedRemainingFloat != null
      ? Math.max(0, amountValue - detectedRemainingFloat)
      : 0;
  const needsRepaymentCash =
    detectedRemainingFloat != null && repaymentShortfall > 0;
  const showRepaymentCash = needsRepaymentCash || repaymentValue > 0;
  const repaymentWithinAvailable = repaymentValue <= repaymentsAvailable;
  const cashGapCovered =
    !needsRepaymentCash || repaymentValue >= repaymentShortfall;
  const canSubmit =
    !busy &&
    amountValue > 0 &&
    amountValue <= row.remainingAmount &&
    repaymentValue <= amountValue &&
    repaymentWithinAvailable &&
    cashGapCovered;

  function syncRepaymentCash(nextAmount: number, nextStaffId: string) {
    const staff = staffOptions.find((option) => option.id === nextStaffId);
    const remainingFloat =
      optionalMoneyNumber(staff?.remainingFloatToday) ??
      optionalMoneyNumber(staff?.floatToday);
    if (remainingFloat == null || nextAmount <= remainingFloat) {
      onRepaymentCashChange("");
      return;
    }
    const available =
      optionalMoneyNumber(staff?.collectedRepaymentsAvailableToday) ?? 0;
    const shortfall = Math.max(0, nextAmount - remainingFloat);
    const recommended = Math.min(shortfall, Math.max(0, available));
    onRepaymentCashChange(recommended > 0 ? String(recommended) : "");
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(8,15,31,0.36)] backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close record disbursement"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-[430px] flex-col border-l border-[#e6ebf0] bg-white shadow-[-18px_0_44px_rgba(15,23,42,0.18)]">
        <header className="flex items-start justify-between gap-3 border-b border-[#edf1f5] px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-[#0b1220]">
              Record Disbursement
            </h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              Complete or reduce the remaining borrower cash handover.
            </p>
          </div>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-xl border border-[#e6ebf0]"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#eef9f2] text-sm font-black text-[#07885f]">
              {initials(row.borrowerName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-black text-[#0b1220]">
                {row.borrowerName}
              </p>
              <p className="text-xs font-semibold text-slate-500">
                Loan ID: {shortLoanId(row.loanId)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-red-100 bg-[#fff4f5]">
            <DrawerMetric
              label="Agreed"
              value={`${currency} ${formatMoneyAmount(row.agreedAmount)}`}
            />
            <DrawerMetric
              label="Disbursed"
              value={`${currency} ${formatMoneyAmount(row.disbursedAmount)}`}
            />
            <DrawerMetric
              label="Remaining"
              value={`${currency} ${formatMoneyAmount(row.remainingAmount)}`}
              danger
            />
          </div>

          <label className="block">
            <span className="text-xs font-bold text-[#0b1220]">
              Amount to disburse ({currency})
            </span>
            <div className="mt-1.5 flex h-11 overflow-hidden rounded-xl border border-[#07885f] bg-white">
              <span className="grid w-14 place-items-center border-r border-[#e6ebf0] text-xs font-black text-[#0b1220]">
                {currency}
              </span>
              <input
                value={amount}
                onChange={(event) => {
                  const next = event.target.value;
                  onAmountChange(next);
                  syncRepaymentCash(roundMoney(parseAmount(next)), staffId);
                }}
                inputMode="numeric"
                placeholder="Enter amount"
                className="min-w-0 flex-1 px-3 text-sm font-semibold outline-none"
                disabled={busy}
              />
            </div>
            <span className="mt-1.5 block text-center text-xs font-semibold text-slate-500">
              Maximum: {currency} {formatMoneyAmount(row.remainingAmount)}
            </span>
          </label>

          {amountValue > 0 ? (
            <div
              className={`rounded-xl border px-3 py-2.5 text-xs font-semibold leading-5 ${
                needsRepaymentCash
                  ? "border-red-100 bg-[#fff0f2] text-[#e11d2e]"
                  : "border-emerald-100 bg-emerald-50 text-[#05603a]"
              }`}
            >
              {staffLoading ? (
                "Checking available staff cash..."
              ) : detectedRemainingFloat == null ? (
                "Select who is issuing the cash to check assigned float."
              ) : needsRepaymentCash ? (
                <>
                  Assigned float available: {currency}{" "}
                  {formatMoneyAmount(detectedRemainingFloat)}. Shortfall:{" "}
                  {currency} {formatMoneyAmount(repaymentShortfall)}.
                  {repaymentsAvailable > 0
                    ? ` Available collected repayments: ${currency} ${formatMoneyAmount(repaymentsAvailable)}.`
                    : " No collected repayments are available for this staff member."}
                </>
              ) : (
                <>
                  This uses assigned float only. Float left after: {currency}{" "}
                  {formatMoneyAmount(
                    Math.max(0, detectedRemainingFloat - amountValue),
                  )}
                  .
                </>
              )}
            </div>
          ) : null}

          {showRepaymentCash ? (
            <label className="block">
              <span className="text-xs font-bold text-[#0b1220]">
                Use collected repayments ({currency})
              </span>
              <div className="mt-1.5 flex h-10 overflow-hidden rounded-xl border border-[#e6ebf0] bg-white">
                <span className="grid w-14 place-items-center border-r border-[#e6ebf0] text-xs font-black text-[#0b1220]">
                  {currency}
                </span>
                <input
                  value={repaymentCash}
                  onChange={(event) =>
                    onRepaymentCashChange(event.target.value)
                  }
                  inputMode="numeric"
                  placeholder="0"
                  className="min-w-0 flex-1 px-3 text-sm font-semibold outline-none"
                  disabled={busy}
                />
              </div>
              <span className="mt-1.5 block text-xs font-semibold text-slate-500">
                Added from repayments: {currency}{" "}
                {formatMoneyAmount(repaymentValue)}. Assigned float used:{" "}
                {currency} {formatMoneyAmount(assignedFloat)}.
              </span>
            </label>
          ) : null}

          <label className="block">
            <span className="flex items-center gap-1.5 text-xs font-bold text-[#0b1220]">
              <CalendarDays className="size-3.5" />
              Disbursement date
            </span>
            <input
              type="date"
              value={date}
              onChange={(event) => onDateChange(event.target.value)}
              disabled={busy}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#e6ebf0] bg-white px-3 text-sm font-semibold outline-none"
            />
          </label>

          <label className="block">
            <span className="flex items-center gap-1.5 text-xs font-bold text-[#0b1220]">
              <User className="size-3.5" />
              Issued by
            </span>
            <select
              value={staffId}
              onChange={(event) => {
                const nextStaffId = event.target.value;
                onStaffChange(nextStaffId);
                syncRepaymentCash(amountValue, nextStaffId);
              }}
              disabled={busy || staffLoading}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#e6ebf0] bg-white px-3 text-sm font-semibold outline-none"
            >
              <option value="">Current signed-in user</option>
              {staffOptions.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name} {staff.roleName ? `· ${staff.roleName}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold text-[#0b1220]">
              Notes (optional)
            </span>
            <textarea
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              disabled={busy}
              rows={4}
              placeholder="Add a note..."
              className="mt-1.5 w-full resize-none rounded-xl border border-[#e6ebf0] bg-white px-3 py-2 text-sm font-medium outline-none"
            />
          </label>

          <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-semibold leading-5 text-blue-900">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              The loan becomes active only after the remaining amount reaches
              zero. Repayment cash used here stays visible in cash
              accountability.
            </p>
          </div>
        </div>

        <footer className="space-y-2 border-t border-[#edf1f5] px-5 py-4">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#07885f] text-sm font-bold text-white transition hover:bg-[#056b4c] disabled:opacity-55"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Save Disbursement
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-10 w-full rounded-xl border border-[#e6ebf0] text-sm font-bold text-[#0b1220] disabled:opacity-60"
          >
            Cancel
          </button>
        </footer>
      </aside>
    </div>
  );
}

function DrawerMetric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="border-r border-red-100 px-3 py-3 last:border-r-0">
      <p className="text-[10px] font-semibold text-slate-600">{label}</p>
      <p
        className={`mt-1 text-xs font-black tabular-nums ${
          danger ? "text-[#e11d2e]" : "text-[#0b1220]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function buildLoansSummary(loans: LoanRow[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const issuedThisMonth = loans.filter((loan) =>
    isOnOrAfter(loanIssueDate(loan), monthStart),
  );
  const issuedLastMonth = loans.filter((loan) => {
    const issued = loanIssueDate(loan);
    return isOnOrAfter(issued, lastMonthStart) && issued < monthStart;
  });
  const activeLoans = loans.filter((loan) => ACTIVE_STATUSES.has(loan.status));
  const closedCount = loans.filter((loan) => loan.status === "CLOSED").length;

  let interestNotOverdue = 0;
  let interestAtRisk = 0;
  let overdueCount = 0;
  let overdueBy2PlusCount = 0;
  let overdueBalance = 0;
  for (const loan of activeLoans) {
    const interest = expectedInterestForLoan(loan);
    const overdueDays = resolveOverdueDays(loan, now);
    if (overdueDays >= 4) {
      interestAtRisk += interest;
    } else {
      interestNotOverdue += interest;
    }
    if (overdueDays >= 1) {
      overdueCount += 1;
      overdueBalance += Math.max(0, loan.balance);
      if (overdueDays >= 2) overdueBy2PlusCount += 1;
    }
  }

  const overduePercent =
    activeLoans.length > 0 ? (overdueCount / activeLoans.length) * 100 : 0;
  const overduePercentLabel =
    overduePercent >= 10
      ? `${Math.round(overduePercent)}%`
      : `${overduePercent.toFixed(1)}%`;

  return {
    issuedThisMonth: issuedThisMonth.length,
    issuedLastMonth: issuedLastMonth.length,
    issuedAllTime: loans.length,
    activeCount: activeLoans.length,
    closedCount,
    overdueCount,
    overduePercentLabel,
    overdueBalance,
    overdueBy2PlusCount,
    principalThisMonth: sumBy(issuedThisMonth, loanIssuedCash),
    principalLastMonth: sumBy(issuedLastMonth, loanIssuedCash),
    principalAllTime: sumBy(loans, loanIssuedCash),
    outstanding: sumBy(activeLoans, (loan) => loan.balance),
    repaid: sumBy(loans, (loan) => loan.paidAmount),
    expectedInterest: interestNotOverdue + interestAtRisk,
    interestNotOverdue,
    interestAtRisk,
  };
}

function loanIssuedCash(loan: LoanRow) {
  if (typeof loan.disbursedAmount === "number") {
    return Math.max(0, loan.disbursedAmount);
  }
  if (
    isPartiallyDisbursedStatus(loan.status) &&
    typeof loan.pendingDisbursementAmount === "number"
  ) {
    return Math.max(0, loan.principal - loan.pendingDisbursementAmount);
  }
  return Math.max(0, loan.principal);
}

function pendingDisbursementsFromLoans(
  loans: LoanRow[],
  branchName: string | null = null,
) {
  return loans
    .map((loan) => pendingDisbursementFromLoan(loan, branchName))
    .filter((row): row is PendingDisbursementRow => Boolean(row))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pendingDisbursementFromLoan(
  loan: LoanRow,
  branchName: string | null = null,
): PendingDisbursementRow | null {
  const agreedAmount = Math.max(0, moneyNumber(loan.principal));
  if (agreedAmount <= 0) return null;

  const explicitRemaining = optionalMoneyNumber(loan.pendingDisbursementAmount);
  const explicitDisbursed = optionalMoneyNumber(loan.disbursedAmount);
  const partialStatus = isPartiallyDisbursedStatus(loan.status);
  const remainingAmount =
    explicitRemaining != null
      ? explicitRemaining
      : explicitDisbursed != null
        ? agreedAmount - explicitDisbursed
        : partialStatus
          ? agreedAmount
          : 0;

  if (!partialStatus && remainingAmount <= 0) return null;

  const safeRemaining = Math.max(0, Math.min(agreedAmount, remainingAmount));
  if (safeRemaining <= 0) return null;

  const disbursedAmount =
    explicitDisbursed != null
      ? Math.max(0, explicitDisbursed)
      : Math.max(0, agreedAmount - safeRemaining);
  const disbursementCount =
    typeof loan.disbursementCount === "number"
      ? Math.max(0, Math.round(loan.disbursementCount))
      : disbursedAmount > 0
        ? 1
        : 0;

  return {
    loanId: loan.id,
    applicationId: loan.applicationId ?? null,
    customerId: loan.customerId,
    borrowerName: loan.borrowerName,
    phone: loan.phone,
    branchId: loan.branchId,
    branchName,
    agreedAmount,
    disbursedAmount,
    remainingAmount: safeRemaining,
    percentDisbursed:
      agreedAmount > 0 ? Math.round((disbursedAmount / agreedAmount) * 100) : 0,
    disbursementCount,
    lastDisbursementAt: loan.disbursedAt ?? null,
    lastDisbursementAmount: disbursedAmount > 0 ? disbursedAmount : null,
    issuedByName: loan.officerName,
    issuedByPublicId: loan.officerPublicId ?? null,
    status: loan.status,
    createdAt: loan.createdAt,
    disbursements: [],
  };
}

function summarizePendingDisbursements(rows: PendingDisbursementRow[]) {
  return {
    borrowersCount: rows.length,
    totalRemaining: sumBy(rows, (row) => row.remainingAmount),
  };
}

function expectedInterestForLoan(loan: LoanRow) {
  if (typeof loan.expectedInterest === "number") {
    return Math.max(0, loan.expectedInterest);
  }
  const base =
    typeof loan.openingBalance === "number"
      ? loan.openingBalance
      : loanTotalRepayable(loan) - Math.max(0, loan.finesTotal ?? 0);
  return Math.max(
    0,
    base - loan.principal - Math.max(0, loan.processingFee ?? 0),
  );
}

function resolveOverdueDays(loan: LoanRow, today: Date) {
  if (typeof loan.overdueDays === "number")
    return Math.max(0, loan.overdueDays);
  return loanOverdueDaysFallback(loan, today);
}

type LoanDueState =
  "closed" | "pending_disbursement" | "overdue" | "due_today" | "active";

function resolveLoanDueState(loan: LoanRow): LoanDueState {
  if (
    loan.status === "CLOSED" ||
    loan.status === "WRITTEN_OFF" ||
    loan.balance <= 0
  ) {
    return "closed";
  }
  if (isPartiallyDisbursedStatus(loan.status)) {
    return "pending_disbursement";
  }
  const overdueDays = resolveOverdueDays(loan, new Date());
  const label = loan.nextDueLabel?.trim().toLowerCase() ?? "";
  if (overdueDays >= 2 || label === "overdue") return "overdue";
  if (loan.nextDueIsToday || overdueDays === 1 || label === "due today") {
    return "due_today";
  }
  return "active";
}

function loanDueStatusLabel(state: LoanDueState) {
  if (state === "overdue") return "Overdue";
  if (state === "due_today") return "Due Today";
  if (state === "pending_disbursement") return "Pending Disbursement";
  if (state === "closed") return "Closed";
  return "Active";
}

function LoanCardMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#f7faf8] px-2.5 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">
        {label}
      </p>
      <div className="mt-1 flex justify-end">{value}</div>
    </div>
  );
}

function loanRowActions(
  loan: LoanRow,
  canRecordRepayment: boolean,
  canSendReminder: boolean,
  reminderLocked: boolean,
  setDetailLoan: (loan: LoanRow) => void,
  setRepaymentLoan: (loan: LoanRow) => void,
  onRecordDisbursement: (row: PendingDisbursementRow) => void,
  downloadLoanAgreement: (applicationId: string, loanId: string) => void,
  onSendReminder: (resend: boolean) => void,
) {
  const reminder = loan.reminder;
  const pendingRow = pendingDisbursementFromLoan(loan);
  const canRemindLoan =
    canSendReminder &&
    loan.balance > 0 &&
    loan.status !== "CLOSED" &&
    !isPartiallyDisbursedStatus(loan.status) &&
    Boolean(loan.phone?.trim());
  const alreadySent =
    reminder?.status === "sent" || Boolean(reminder?.canResend);
  const inFlight =
    reminderLocked ||
    reminder?.status === "queued" ||
    reminder?.status === "sending";

  return [
    {
      label: "View details",
      disabled: !loan.applicationId,
      onSelect: () => {
        if (loan.applicationId) setDetailLoan(loan);
      },
    },
    ...(pendingRow
      ? [
          {
            label: "Complete disbursement",
            onSelect: () => onRecordDisbursement(pendingRow),
          },
        ]
      : []),
    {
      label: "Record repayment",
      disabled:
        !canRecordRepayment ||
        loan.balance <= 0 ||
        loan.status === "CLOSED" ||
        isPartiallyDisbursedStatus(loan.status),
      onSelect: () => setRepaymentLoan(loan),
    },
    {
      label: alreadySent ? "Resend reminder" : "Send reminder",
      disabled: !canRemindLoan || inFlight,
      onSelect: () => onSendReminder(Boolean(alreadySent)),
    },
    {
      label: "View borrower",
      href: `/clients/${loan.customerId}`,
    },
    {
      label: "Loan agreement",
      disabled: !loan.applicationId || isPartiallyDisbursedStatus(loan.status),
      onSelect: () => {
        if (loan.applicationId) {
          void downloadLoanAgreement(loan.applicationId, loan.id);
        }
      },
    },
  ];
}

function ReminderBadge({ reminder }: { reminder?: LoanRow["reminder"] }) {
  if (!reminder) {
    return (
      <span
        className="inline-flex rounded-full bg-[#fff3e8] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-[#d97706]"
        title="Reminder not sent"
      >
        Not sent
      </span>
    );
  }

  if (reminder.status === "queued" || reminder.status === "sending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-[#2563eb]">
        <Loader2 className="size-2.5 animate-spin" />
        Sending
      </span>
    );
  }

  if (reminder.status === "sent") {
    return (
      <span
        className="inline-flex rounded-full bg-[#e9f8ef] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-[#07885f]"
        title={
          reminder.lastSentAt
            ? `Sent ${formatDate(reminder.lastSentAt)}`
            : "Reminder sent"
        }
      >
        Sent
      </span>
    );
  }

  if (reminder.status === "failed") {
    const reason =
      reminder.lastFailureReason === "no_credits"
        ? "No SMS credit"
        : reminder.lastFailureReason === "no_phone"
          ? "No phone"
          : (reminder.lastFailureReason ?? "Failed");
    return (
      <span
        className="inline-flex rounded-full bg-[#fdecec] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-[#c23b3b]"
        title={reason}
      >
        Not sent
      </span>
    );
  }

  return (
    <span
      className="inline-flex rounded-full bg-[#fff3e8] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-[#d97706]"
      title="Reminder not sent"
    >
      Not sent
    </span>
  );
}

function NextDueCell({
  loan,
  dueState,
}: {
  loan: LoanRow;
  dueState: LoanDueState;
}) {
  if (dueState === "closed") {
    return <span className="text-slate-400">—</span>;
  }

  if (dueState === "pending_disbursement") {
    return (
      <span className="font-semibold text-[#e11d2e]">Pending disbursement</span>
    );
  }

  const dateLabel = formatDate(loan.nextDueDate ?? loan.dueDate);
  const overdueDays = resolveOverdueDays(loan, new Date());

  return (
    <div className="min-w-0">
      <p className="truncate font-medium tabular-nums text-[#0b1220]">
        {dateLabel}
      </p>
      {dueState === "overdue" ? (
        <p className="mt-0.5 truncate text-[10px] font-semibold text-[#c23b3b]">
          {overdueDays} day{overdueDays === 1 ? "" : "s"} overdue
        </p>
      ) : null}
      {dueState === "due_today" ? (
        <p className="mt-0.5 truncate text-[10px] font-semibold text-[#d97706]">
          Due today
        </p>
      ) : null}
    </div>
  );
}

function LoanStatusBadge({ dueState }: { dueState: LoanDueState }) {
  const tone =
    dueState === "closed"
      ? "bg-[#f3f5f7] text-slate-600"
      : dueState === "pending_disbursement"
        ? "bg-[#fdecec] text-[#c23b3b]"
        : dueState === "overdue"
          ? "bg-[#fdecec] text-[#c23b3b]"
          : dueState === "due_today"
            ? "bg-[#fff3e8] text-[#d97706]"
            : "bg-[#e9f8ef] text-[#07885f]";
  const label =
    dueState === "closed"
      ? "Closed"
      : dueState === "pending_disbursement"
        ? "Partially Disbursed"
        : dueState === "overdue"
          ? "Overdue"
          : dueState === "due_today"
            ? "Due Today"
            : "Active";

  return (
    <span
      className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

function formatLoanStatus(status: string, overdueDays?: number) {
  const normalized = loanStatusKey(status);
  if (normalized === "CLOSED") return "Closed";
  if (normalized === "WRITTEN_OFF") return "Written Off";
  if (isPartiallyDisbursedStatus(status)) return "Partially Disbursed";
  if (
    normalized === "IN_ARREARS" ||
    (typeof overdueDays === "number" && overdueDays >= 1)
  ) {
    return "Overdue";
  }
  if (
    normalized === "DISBURSED" ||
    normalized === "CURRENT" ||
    normalized === "RESTRUCTURED" ||
    normalized === "APPROVED" ||
    normalized === "SUBMITTED"
  ) {
    return "Active";
  }
  return titleCase(status.replaceAll("_", " "));
}

function isPartiallyDisbursedStatus(status: string) {
  const normalized = loanStatusKey(status);
  return (
    normalized === "PARTIALLY_DISBURSED" ||
    normalized === "PARTIAL_DISBURSED" ||
    normalized === "PARTIALLY_DISBURSE"
  );
}

function loanStatusKey(status: string) {
  return status
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function optionalMoneyNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return moneyNumber(value);
}

function moneyNumber(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** Fallback when API overdueDays is missing (legacy payloads). */
function loanOverdueDaysFallback(loan: LoanRow, today: Date) {
  if (loan.balance <= 0 || loan.installmentAmount <= 0) return 0;
  const startRaw = loan.paymentStartDate ?? loan.disbursedAt ?? loan.createdAt;
  const startAt = new Date(startRaw);
  if (Number.isNaN(startAt.getTime())) return 0;

  const start = startOfLocalDay(startAt);
  const todayStart = startOfLocalDay(today);
  if (todayStart < start) return 0;

  const dueAt = loan.dueDate ? new Date(loan.dueDate) : null;
  const end =
    dueAt && !Number.isNaN(dueAt.getTime()) && dueAt < todayStart
      ? startOfLocalDay(dueAt)
      : todayStart;
  const elapsedDays =
    Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const expectedDays =
    loan.durationDays != null && loan.durationDays > 0
      ? Math.min(elapsedDays, loan.durationDays)
      : elapsedDays;
  if (expectedDays <= 0) return 0;

  const coveredDays = Math.min(
    expectedDays,
    Math.floor(Math.max(0, loan.paidAmount) / loan.installmentAmount),
  );
  return Math.max(0, expectedDays - coveredDays);
}

function loanIssueDate(loan: LoanRow) {
  return new Date(loan.disbursedAt ?? loan.createdAt);
}

function isOnOrAfter(value: Date, boundary: Date) {
  if (Number.isNaN(value.getTime())) return false;
  return value.getTime() >= boundary.getTime();
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function ChoiceButton({
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
      className={`flex min-h-20 flex-col items-start justify-between rounded-xl border px-3 py-3 text-left text-sm font-bold ${
        active
          ? "border-[var(--forest-emerald)] bg-emerald-50 text-[#0b1220]"
          : "border-[#e6ebf0] bg-white text-slate-600"
      }`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

async function exportPortfolio(
  rows: LoanRow[],
  currency: string,
  setExporting: (exporting: boolean) => void,
) {
  setExporting(true);
  try {
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Portfolio");
    worksheet.addRow(["REMBEH Loan Records"]);
    worksheet.mergeCells(1, 1, 1, 11);
    worksheet.addRow([
      "Loan ID",
      "Borrower",
      "Phone",
      "Loan Type",
      "Principal",
      "Total Repayable",
      "Repaid",
      "Outstanding",
      "Next Due",
      "Status",
      "Issued By",
    ]);
    rows.forEach((loan) => {
      worksheet.addRow([
        loan.id,
        loan.borrowerName,
        loan.phone,
        loan.loanTypeName ? titleCase(loan.loanTypeName) : "",
        loan.principal,
        loanTotalRepayable(loan),
        loan.paidAmount,
        loan.balance,
        loan.nextDueLabel?.trim() ||
          formatDate(loan.nextDueDate ?? loan.dueDate),
        formatLoanStatus(loan.status, loan.overdueDays),
        loan.officerName?.trim() || "",
      ]);
    });
    worksheet.columns = [
      { width: 18 },
      { width: 24 },
      { width: 16 },
      { width: 18 },
      { width: 14 },
      { width: 16 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 12 },
      { width: 18 },
    ];
    worksheet.getRow(1).font = { bold: true, size: 16 };
    worksheet.getRow(2).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F8F68" },
    };
    [5, 6, 7, 8].forEach((column) => {
      worksheet.getColumn(column).numFmt = `"${currency}" #,##0`;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rembeh-loan-records.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    setExporting(false);
  }
}

/** Compact UI id — full database id stays for API/export/search. */
function shortLoanId(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return (parts.map((part) => part[0]).join("") || "RB").toUpperCase();
}

function parseAmount(value: string) {
  const raw = value.replaceAll(",", "").replaceAll(" ", "").trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round(value);
}

function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateInputToIso(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return new Date().toISOString();
  const now = new Date();
  return new Date(
    y,
    m - 1,
    d,
    now.getHours(),
    now.getMinutes(),
    0,
    0,
  ).toISOString();
}
