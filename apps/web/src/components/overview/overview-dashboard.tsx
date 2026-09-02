"use client";

import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Building2,
  ChartNoAxesCombined,
  ChartPie,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Folder,
  Inbox,
  Users,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppShell } from "../app/app-shell";
import { Money } from "../app/money";
import { AppBootSkeleton, SkeletonBlock } from "../app/skeleton";
import { StepTimeline } from "../app/step-timeline";
import {
  OwnerHeader,
  Tooltip,
} from "../../app/owner/owner-header";
import {
  buildBranchCollectionPerformance,
  type BranchCollectionPerformance,
} from "../../app/owner/branch-analytics";
import {
  OwnerBorrower,
  OwnerBranch,
  OwnerBranchDailyStatus,
  OwnerLoan,
  OwnerReport,
  OwnerRepayment,
  formatDate,
  formatMoney,
  formatNumber,
  isLoanScheduleOverdue,
  ownerFetch,
  previousDateLabel,
  sumBy,
} from "../../app/owner/owner-common";
import { useOwnerBranchScope } from "../../app/owner/owner-branch-scope";
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
import { useRouter } from "next/navigation";

const ACTIVE_STATUSES = new Set([
  "SUBMITTED",
  "APPROVED",
  "DISBURSED",
  "CURRENT",
  "IN_ARREARS",
  "RESTRUCTURED",
]);

type ActivityItem = {
  id: string;
  title: string;
  meta: string;
  amountValue?: number;
  amountCurrency?: string;
  time: string;
  tone: "green" | "blue" | "violet" | "gold";
  icon: "check" | "loan" | "report" | "cash";
  at: Date;
};

type AlertItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
  tone: "red" | "gold" | "blue";
  href?: string;
};

type BranchPerformance = {
  branch: OwnerBranch;
  loanTotal: number;
  collectedToday: number;
  overdueAmount: number;
  overdueLoanCount: number;
};

type PerformancePeriod = "7d" | "14d" | "30d" | "month" | "2m" | "3m";
type PerformanceView = "line" | "donut";

const PERFORMANCE_PERIODS: Array<{
  value: PerformancePeriod;
  label: string;
}> = [
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "2m", label: "Last 2 months" },
  { value: "3m", label: "Last 3 months" },
];

const RECEIVED_REPORT_STATUSES = new Set([
  "SENT_TO_OWNER",
  "OWNER_APPROVED",
  "RETURNED_TO_MANAGER",
]);

export type OverviewMode = "owner" | "manager";

type OverviewLinks = {
  settings: string;
  reports: string;
  branches: string;
  risk: string;
  loans: string;
};

const OVERVIEW_LINKS: Record<OverviewMode, OverviewLinks> = {
  owner: {
    settings: "/owner/settings",
    reports: "/owner/reports",
    branches: "/owner/branches",
    risk: "/owner/risk",
    loans: "/owner/portfolio",
  },
  manager: {
    settings: "/settings",
    reports: "/reports",
    branches: "/agents",
    risk: "/blacklist-watchlist",
    loans: "/loans",
  },
};

type OverviewSession = {
  session: RembehSession | null;
  workspace: RembehWorkspace | null;
  user: RembehUser | null;
  branch: RembehBranch | null;
  ready: boolean;
};

function useOverviewSession(mode: OverviewMode): OverviewSession {
  const router = useRouter();
  const [state, setState] = useState<OverviewSession>({
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
          `/login?next=${encodeURIComponent(mode === "owner" ? "/owner" : "/dashboard")}`,
        );
        return;
      }

      const role = resolveOperatorRole(auth.session, auth.user);
      if (mode === "owner") {
        if (role !== "owner") {
          router.replace("/dashboard");
          return;
        }
      } else if (role !== "manager") {
        if (role === "owner") {
          router.replace("/owner");
          return;
        }
        router.replace("/dashboard");
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

async function optionalOwnerFetch<T>(
  session: RembehSession,
  path: string,
  fallback: T,
): Promise<T> {
  try {
    return await ownerFetch<T>(session, path);
  } catch {
    return fallback;
  }
}

export function OverviewDashboard({ mode }: { mode: OverviewMode }) {
  const state = useOverviewSession(mode);
  const links = OVERVIEW_LINKS[mode];
  const isManager = mode === "manager";
  const {
    selectedBranchId,
    selectedBranchName,
    matchesBranch,
  } = useOwnerBranchScope();
  const [branches, setBranches] = useState<OwnerBranch[]>([]);
  const [loans, setLoans] = useState<OwnerLoan[]>([]);
  const [borrowers, setBorrowers] = useState<OwnerBorrower[]>([]);
  const [repayments, setRepayments] = useState<OwnerRepayment[]>([]);
  const [reports, setReports] = useState<OwnerReport[]>([]);
  const [dailyStatuses, setDailyStatuses] = useState<OwnerBranchDailyStatus[]>(
    [],
  );
  const [performancePeriod, setPerformancePeriod] =
    useState<PerformancePeriod>("7d");
  const [performanceView, setPerformanceView] =
    useState<PerformanceView>("line");
  const [activityBranchId, setActivityBranchId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currency = state.workspace?.currency ?? "UGX";

  const loadData = useCallback(async () => {
    if (!state.session) return;
    setLoading(true);
    setError(null);
    try {
      const [
        branchPayload,
        loanPayload,
        borrowerPayload,
        repaymentPayload,
        reportPayload,
        dailyStatusPayload,
      ] = await Promise.all([
        ownerFetch<{ branches?: OwnerBranch[] }>(state.session, "/branches"),
        ownerFetch<{ loans?: OwnerLoan[] }>(state.session, "/loans"),
        ownerFetch<{ customers?: OwnerBorrower[] }>(
          state.session,
          "/customers",
        ),
        ownerFetch<{ repayments?: OwnerRepayment[] }>(
          state.session,
          "/collections/repayments?filter=thisWeek",
        ),
        optionalOwnerFetch<{ reports?: OwnerReport[] }>(
          state.session,
          "/operations/reports",
          { reports: [] },
        ),
        optionalOwnerFetch<{ statuses?: OwnerBranchDailyStatus[] }>(
          state.session,
          `/operations/owner-daily-status?date=${previousDateLabel()}`,
          { statuses: [] },
        ),
      ]);
      const nextBranches = branchPayload.branches ?? [];
      setBranches(nextBranches);
      setLoans(loanPayload.loans ?? []);
      setBorrowers(borrowerPayload.customers ?? []);
      setRepayments(repaymentPayload.repayments ?? []);
      setReports(reportPayload.reports ?? []);
      setDailyStatuses(dailyStatusPayload.statuses ?? []);
      if (isManager) {
        const lockedBranchId =
          state.branch?.id ?? nextBranches[0]?.id ?? "all";
        setActivityBranchId(lockedBranchId);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load overview.",
      );
    } finally {
      setLoading(false);
    }
  }, [isManager, selectedBranchId, state.branch, state.session]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      if (state.ready && state.session) {
        void loadData();
      }
    }, 0);

    return () => window.clearTimeout(boot);
  }, [loadData, state.ready, state.session]);

  useEffect(() => {
    if (isManager) return;
    setActivityBranchId(selectedBranchId ?? "all");
  }, [isManager, selectedBranchId]);

  const scopedLoans = useMemo(
    () =>
      loans.filter(
        (loan) =>
          matchesBranch(loan.branchId) && !loan.customerVoidedAt,
      ),
    [loans, matchesBranch],
  );
  const scopedBorrowers = useMemo(
    () =>
      borrowers.filter(
        (borrower) => matchesBranch(borrower.branchId) && !borrower.voidedAt,
      ),
    [borrowers, matchesBranch],
  );
  const scopedRepayments = useMemo(
    () => repayments.filter((item) => matchesBranch(item.branchId)),
    [matchesBranch, repayments],
  );
  const scopedReports = useMemo(
    () => reports.filter((report) => matchesBranch(report.branchId)),
    [matchesBranch, reports],
  );
  const scopedDailyStatuses = useMemo(
    () => dailyStatuses.filter((row) => matchesBranch(row.branchId)),
    [dailyStatuses, matchesBranch],
  );
  const scopedBranches = useMemo(
    () =>
      selectedBranchId
        ? branches.filter((branch) => branch.id === selectedBranchId)
        : branches,
    [branches, selectedBranchId],
  );

  const activeLoans = useMemo(
    () => scopedLoans.filter((loan) => ACTIVE_STATUSES.has(loan.status)),
    [scopedLoans],
  );
  const pendingReports = useMemo(
    () => scopedReports.filter((report) => report.status === "SENT_TO_OWNER"),
    [scopedReports],
  );
  const reportsThisMonth = useMemo(
    () => scopedReports.filter((report) => isSameMonth(report.operationDate, new Date())),
    [scopedReports],
  );
  const receivedReportsThisMonth = useMemo(
    () =>
      reportsThisMonth.filter(
        (report) =>
          RECEIVED_REPORT_STATUSES.has(report.status),
      ),
    [reportsThisMonth],
  );
  const todayRepayments = useMemo(
    () => scopedRepayments.filter((repayment) => isToday(repayment.recordedAt)),
    [scopedRepayments],
  );
  const yesterdayRepayments = useMemo(
    () => scopedRepayments.filter((repayment) => isYesterday(repayment.recordedAt)),
    [scopedRepayments],
  );
  const todayLoans = useMemo(
    () =>
      scopedLoans.filter((loan) => isToday(loan.disbursedAt ?? loan.createdAt)),
    [scopedLoans],
  );
  const todayBorrowers = useMemo(
    () => scopedBorrowers.filter((borrower) => isToday(borrower.createdAt)),
    [scopedBorrowers],
  );
  const todaySettledLoans = useMemo(
    () =>
      scopedLoans.filter(
        (loan) => loan.status === "CLOSED" && isToday(loan.updatedAt),
      ),
    [scopedLoans],
  );
  const totalLoanBalance = sumBy(scopedLoans, (loan) => loan.balance);
  const collectedToday = sumBy(todayRepayments, (item) => item.amount);
  const collectedYesterday = sumBy(yesterdayRepayments, (item) => item.amount);
  const principalIssuedToday = sumBy(todayLoans, (loan) => loan.principal);
  const estimatedYesterdayLoanBalance = Math.max(
    0,
    totalLoanBalance - principalIssuedToday + collectedToday,
  );
  const loanBalanceChange = comparisonChange(
    totalLoanBalance,
    estimatedYesterdayLoanBalance,
  );
  const collectedTodayChange = comparisonChange(
    collectedToday,
    collectedYesterday,
  );
  const loanById = useMemo(
    () => new Map(scopedLoans.map((loan) => [loan.id, loan])),
    [scopedLoans],
  );
  const todayActivity = useMemo(() => {
    const matchesBranch = (branchId: string | null | undefined) =>
      activityBranchId === "all" || branchId === activityBranchId;

    return {
      loansIssued: todayLoans.filter((loan) => matchesBranch(loan.branchId)),
      collections: todayRepayments.filter((repayment) =>
        matchesBranch(loanById.get(repayment.loanId)?.branchId),
      ),
      newBorrowers: todayBorrowers.filter((borrower) =>
        matchesBranch(borrower.branchId),
      ),
      fullySettled: todaySettledLoans.filter((loan) =>
        matchesBranch(loan.branchId),
      ),
    };
  }, [
    activityBranchId,
    loanById,
    todayBorrowers,
    todayLoans,
    todayRepayments,
    todaySettledLoans,
  ]);
  const branchPerformance = useMemo(
    () => buildBranchPerformance(scopedBranches, scopedLoans, todayRepayments, loanById),
    [scopedBranches, scopedLoans, todayRepayments, loanById],
  );
  const branchAnalytics = useMemo(
    () =>
      buildBranchCollectionPerformance({
        branches: scopedBranches,
        loans: scopedLoans,
        repayments: scopedRepayments,
        dailyStatuses: scopedDailyStatuses,
      }),
    [scopedBranches, scopedDailyStatuses, scopedLoans, scopedRepayments],
  );
  const series = useMemo(
    () => buildPortfolioSeries(scopedLoans, scopedRepayments, performancePeriod),
    [performancePeriod, scopedLoans, scopedRepayments],
  );
  const activities = useMemo(
    () => buildActivities(todayRepayments, scopedLoans, scopedReports, currency),
    [currency, scopedLoans, scopedReports, todayRepayments],
  );
  const alerts = useMemo(
    () =>
      buildAlerts({
        branches: scopedBranches,
        loans: activeLoans,
        reports: scopedReports,
        pendingReports,
        currency,
        branchAnalytics,
        links,
        mode,
      }),
    [activeLoans, branchAnalytics, currency, links, mode, pendingReports, scopedBranches, scopedReports],
  );
  const alertsHref = alerts.some((alert) => alert.id === "overdue-paid-today")
    ? `${links.loans}?coverage=overdue_paid`
    : links.loans;
  const activityTotal =
    todayActivity.loansIssued.length +
    todayActivity.collections.length +
    todayActivity.newBorrowers.length +
    todayActivity.fullySettled.length;

  if (!state.ready || !state.session) return <AppBootSkeleton />;

  const branchScopeHint = isManager
    ? "This branch"
    : selectedBranchId
      ? selectedBranchName
      : "Across all branches";
  const shellBranch = isManager
    ? state.branch ??
      (branches[0]
        ? {
            id: branches[0].id,
            name: branches[0].name,
            address: branches[0].address,
          }
        : null)
    : null;

  return (
    <AppShell
      session={state.session}
      workspace={state.workspace}
      user={state.user}
      branch={shellBranch}
    >
      <div className="mx-auto max-w-[1440px] space-y-3.5">
        <OwnerHeader
          subtitle={`${greeting()}, ${firstName(state.user?.name ?? (isManager ? "Manager" : "Owner"))} 👋`}
          title="Here's what's happening today"
          settingsHref={links.settings}
          reportsHref={links.reports}
          notificationScope={mode}
        />

        {error ? (
          <p className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <section
          className={`grid grid-cols-1 gap-2.5 sm:grid-cols-2 ${
            isManager ? "xl:grid-cols-4" : "xl:grid-cols-5"
          }`}
        >
          <TopStatCard
            icon={<WalletCards className="size-5" />}
            label="Total Loan Balance"
            value={<Money value={totalLoanBalance} currency={currency} />}
            hint={branchScopeHint}
            change={loanBalanceChange}
            tone="green"
          />
          <TopStatCard
            icon={<Banknote className="size-5" />}
            label={isManager ? "Today's repayments" : "Collected Today"}
            value={<Money value={collectedToday} currency={currency} />}
            hint={branchScopeHint}
            change={collectedTodayChange}
            tone="green"
          />
          <TopStatCard
            icon={<Folder className="size-5" />}
            label="Active Loans"
            value={formatNumber(activeLoans.length)}
            hint={`${formatNumber(todayLoans.length)} New Today`}
            tone="blue"
          />
          <TopStatCard
            icon={<Users className="size-5" />}
            label="Borrowers"
            value={formatNumber(scopedBorrowers.length)}
            hint={`${formatNumber(todayBorrowers.length)} new today`}
            tone="violet"
          />
          {!isManager ? (
            <TopStatCard
              icon={<Clock3 className="size-5" />}
              label="Received Reports"
              value={`${formatNumber(receivedReportsThisMonth.length)} of ${formatNumber(reportsThisMonth.length)}`}
              hint={`${formatNumber(pendingReports.length)} pending approval`}
              tone="gold"
              className="sm:col-span-2 xl:col-span-1"
            />
          ) : null}
        </section>

        {loading ? (
          <OverviewSkeleton />
        ) : isManager ? (
          <>
            <section className="grid min-w-0 items-stretch gap-3 xl:grid-cols-3">
              <div className="min-w-0">
                <PortfolioPerformanceCard
                  series={series}
                  currency={currency}
                  period={performancePeriod}
                  view={performanceView}
                  onPeriodChange={setPerformancePeriod}
                  onViewChange={setPerformanceView}
                  title="Performance"
                  collectionsLabel="Repayments"
                />
              </div>
              <div className="min-w-0">
                <TodayActivityCard
                  total={activityTotal}
                  loansIssued={todayActivity.loansIssued.length}
                  collections={todayActivity.collections.length}
                  newBorrowers={todayActivity.newBorrowers.length}
                  fullySettled={todayActivity.fullySettled.length}
                  branches={branches}
                  branchId={activityBranchId}
                  onBranchChange={setActivityBranchId}
                  lockBranch
                  collectionsLabel="Repayments"
                />
              </div>
              <div className="min-w-0">
                <AlertsCard alerts={alerts} href={alertsHref} />
              </div>
            </section>

            <section className="grid items-stretch gap-3">
              <RecentActivityCard
                activities={activities}
                href={links.reports}
              />
            </section>
          </>
        ) : (
          <>
            <section className="grid gap-3 xl:grid-cols-[1.08fr_1fr_0.86fr]">
              <PortfolioPerformanceCard
                series={series}
                currency={currency}
                period={performancePeriod}
                view={performanceView}
                onPeriodChange={setPerformancePeriod}
                onViewChange={setPerformanceView}
              />
              <BranchPerformanceCard
                rows={branchPerformance}
                currency={currency}
                href={links.branches}
                title="Branch Performance"
                variant="owner"
              />
              <TodayActivityCard
                total={activityTotal}
                loansIssued={todayActivity.loansIssued.length}
                collections={todayActivity.collections.length}
                newBorrowers={todayActivity.newBorrowers.length}
                fullySettled={todayActivity.fullySettled.length}
                branches={scopedBranches}
                branchId={activityBranchId}
                onBranchChange={setActivityBranchId}
                lockBranch
                collectionsLabel="Repayments"
              />
            </section>

            <section className="grid items-stretch gap-3 xl:grid-cols-[2fr_1fr]">
              <RecentActivityCard
                activities={activities}
                href={links.reports}
              />
              <AlertsCard alerts={alerts} href={alertsHref} />
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function TopStatCard({
  icon,
  label,
  value,
  hint,
  change,
  tone,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint: ReactNode;
  change?: string;
  tone: "green" | "blue" | "violet" | "gold";
  className?: string;
}) {
  const toneClass = {
    green: "bg-[#e9f8ef] text-[#07885f]",
    blue: "bg-[#eaf4ff] text-[#2078dc]",
    violet: "bg-[#f2eaff] text-[#8b4ee8]",
    gold: "bg-[#fff3df] text-[#f28a17]",
  }[tone];
  const changeClass = !change || change === "0%"
    ? "bg-slate-100 text-slate-500"
    : change.startsWith("-")
      ? "bg-red-50 text-red-600"
      : "bg-[#e6f8ee] text-[#0c9b6d]";

  return (
    <div className={`min-w-0 ${className}`}>
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
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="min-w-0 break-words text-[clamp(0.72rem,0.9vw,1rem)] font-bold leading-tight tabular-nums text-[#0b1220]">
              {value}
            </p>
            {change ? (
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${changeClass}`}
              >
                {change}
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-[11px] font-medium text-slate-500">
            {hint}
          </p>
        </div>
      </article>
    </div>
  );
}

function PortfolioPerformanceCard({
  series,
  currency,
  period,
  view,
  onPeriodChange,
  onViewChange,
  title = "Overall Performance",
  collectionsLabel = "Repayments",
}: {
  series: ReturnType<typeof buildPortfolioSeries>;
  currency: string;
  period: PerformancePeriod;
  view: PerformanceView;
  onPeriodChange: (period: PerformancePeriod) => void;
  onViewChange: (view: PerformanceView) => void;
  title?: string;
  collectionsLabel?: string;
}) {
  const collectionsWord = collectionsLabel.toLowerCase();
  return (
    <section className="flex h-full flex-col rounded-[14px] border border-[#e6ebf0] bg-white p-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold text-[#0b1220]">{title}</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            className="flex h-8 items-center rounded-xl border border-[#e6ebf0] bg-white p-1 shadow-[0_8px_16px_rgba(15,23,42,0.04)]"
            aria-label="Performance view"
          >
            <Tooltip
              label={`Trend view: balance, ${collectionsWord} and issued over time.`}
            >
              <button
                type="button"
                onClick={() => onViewChange("line")}
                className={`grid size-6 place-items-center rounded-lg transition ${
                  view === "line"
                    ? "bg-emerald-50 text-[var(--forest-emerald)]"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
                aria-label="Line view"
              >
                <ChartNoAxesCombined className="size-3.5" />
              </button>
            </Tooltip>
            <Tooltip
              label={`Mix view: balance vs ${collectionsWord} vs issued.`}
            >
              <button
                type="button"
                onClick={() => onViewChange("donut")}
                className={`grid size-6 place-items-center rounded-lg transition ${
                  view === "donut"
                    ? "bg-emerald-50 text-[var(--forest-emerald)]"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
                aria-label="Donut view"
              >
                <ChartPie className="size-3.5" />
              </button>
            </Tooltip>
          </div>
          <label className="relative">
            <span className="sr-only">Performance period</span>
            <select
              value={period}
              onChange={(event) =>
                onPeriodChange(event.target.value as PerformancePeriod)
              }
              className="h-8 appearance-none rounded-xl border border-[#e6ebf0] bg-white pl-3 pr-8 text-[11px] font-medium text-slate-600 outline-none shadow-[0_8px_16px_rgba(15,23,42,0.04)] transition focus:border-[var(--forest-emerald)]"
            >
              {PERFORMANCE_PERIODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
          </label>
        </div>
      </div>
      {view === "line" ? (
        <LineChart
          series={series}
          currency={currency}
          collectedLabel={collectionsLabel}
        />
      ) : (
        <PerformanceDonutChart
          series={series}
          currency={currency}
          collectedLabel={collectionsLabel}
        />
      )}
    </section>
  );
}

function BranchPerformanceCard({
  rows,
  currency,
  href,
  title = "Branch Performance",
  variant = "owner",
}: {
  rows: BranchPerformance[];
  currency: string;
  href: string;
  title?: string;
  variant?: "owner" | "manager";
}) {
  const isManager = variant === "manager";
  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <PanelHeader title={title} href={href} />
      <div className="mt-3 -mx-1 grid grid-cols-[1fr_80px_86px_86px] gap-2 border-b border-[#dfe5eb] bg-[#e8edf2] px-2 py-2 text-[10px] font-semibold text-slate-600">
        <span>{isManager ? "Focus" : "Branch"}</span>
        <span className="block w-full text-right">Loan ({currency})</span>
        <span className="block w-full text-right">Collected</span>
        <span className="block w-full text-right">Overdue</span>
      </div>
      <div className="divide-y divide-[#edf1f5]">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-5" />}
            title={isManager ? "No activity yet" : "No branch activity"}
            text={
              isManager
                ? "Your loan book, repayments and overdue balances will show here as the day progresses."
                : "Branch performance will appear here once loans, repayments or overdue balances are recorded."
            }
          />
        ) : (
          rows.slice(0, 5).map((row) => (
            <div
              key={row.branch.id}
              className="grid w-full grid-cols-[1fr_80px_86px_86px] items-center gap-2 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-[var(--forest-emerald)]">
                  <Building2 className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium text-[#101827]">
                    {isManager ? "Your branch" : row.branch.name}
                  </p>
                  <p className="truncate text-[10px] font-normal text-slate-500">
                    {isManager
                      ? "Portfolio snapshot"
                      : (row.branch.manager?.name ?? "No manager assigned")}
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 justify-end text-right">
                <p className="max-w-full break-words text-[11px] font-medium tabular-nums text-[#111827]">
                  <Money value={row.loanTotal} currency={currency} />
                </p>
              </div>
              <div className="flex min-w-0 justify-end text-right">
                <p className="max-w-full break-words text-[11px] font-medium tabular-nums text-[#111827]">
                  <Money value={row.collectedToday} currency={currency} />
                </p>
              </div>
              <div className="flex min-w-0 flex-col items-end text-right">
                <p className="max-w-full break-words text-[11px] font-medium tabular-nums text-[#111827]">
                  <Money value={row.overdueAmount} currency={currency} />
                </p>
                <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500">
                  {formatNumber(row.overdueLoanCount)}{" "}
                  {row.overdueLoanCount === 1 ? "loan" : "loans"}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function TodayActivityCard({
  total,
  loansIssued,
  collections,
  newBorrowers,
  fullySettled,
  branches,
  branchId,
  onBranchChange,
  lockBranch = false,
  collectionsLabel = "Repayments",
}: {
  total: number;
  loansIssued: number;
  collections: number;
  newBorrowers: number;
  fullySettled: number;
  branches: OwnerBranch[];
  branchId: string;
  onBranchChange: (branchId: string) => void;
  lockBranch?: boolean;
  collectionsLabel?: string;
}) {
  const items = [
    { label: "Loans Issued", value: loansIssued, color: "#003f35" },
    { label: collectionsLabel, value: collections, color: "#10a06f" },
    { label: "New Borrowers", value: newBorrowers, color: "#9bd8ac" },
    { label: "Fully Settled", value: fullySettled, color: "#ccebd2" },
  ];
  const gradient = buildConicGradient(items, total);
  const lockedBranch = branches.find((branch) => branch.id === branchId);

  return (
    <section className="flex h-full flex-col rounded-[14px] border border-[#e6ebf0] bg-white p-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-[#0b1220]">
          Today&apos;s Activity
        </h2>
        {lockBranch ? (
          <span className="inline-flex h-8 max-w-[160px] items-center truncate rounded-xl border border-[#e6ebf0] bg-white px-3 text-[11px] font-medium text-slate-600 shadow-[0_8px_16px_rgba(15,23,42,0.04)]">
            {lockedBranch?.name ??
              (branchId === "all" ? "All branches" : "This branch")}
          </span>
        ) : (
          <label className="relative min-w-[128px]">
            <span className="sr-only">Activity branch</span>
            <select
              value={branchId}
              onChange={(event) => onBranchChange(event.target.value)}
              className="h-8 w-full appearance-none rounded-xl border border-[#e6ebf0] bg-white pl-3 pr-8 text-[11px] font-medium text-slate-600 outline-none shadow-[0_8px_16px_rgba(15,23,42,0.04)] transition focus:border-[var(--forest-emerald)]"
            >
              <option value="all">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
          </label>
        )}
      </div>
      <div className="mt-4 grid items-center gap-4 sm:grid-cols-[128px_1fr] xl:grid-cols-1 2xl:grid-cols-[128px_1fr]">
        <div className="relative mx-auto grid size-[128px] place-items-center rounded-full">
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: gradient }}
          />
          <div className="absolute inset-[18px] rounded-full bg-white" />
          <div className="relative text-center">
            <p className="text-2xl font-bold text-[#070b18]">
              {formatNumber(total)}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">Total</p>
          </div>
        </div>
        <div className="space-y-2.5">
          {items.map((item) => (
            <span key={item.label} className="flex w-full items-center gap-2.5">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-600">
                {item.label}
              </span>
              <span className="text-xs font-medium tabular-nums text-[#111827]">
                {formatNumber(item.value)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function OverviewSidePanel({
  title,
  href,
  emptyIcon,
  emptyTitle,
  emptyText,
  children,
  hasRows,
  listClassName = "divide-y divide-[#edf1f5]",
}: {
  title: string;
  href: string;
  emptyIcon: ReactNode;
  emptyTitle: string;
  emptyText: string;
  children: ReactNode;
  hasRows: boolean;
  listClassName?: string;
}) {
  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-[14px] border border-[#e6ebf0] bg-white p-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <PanelHeader title={title} href={href} />
      <div className="mt-3 flex min-h-0 min-w-0 flex-1 flex-col">
        {hasRows ? (
          <div className={`min-w-0 ${listClassName}`}>{children}</div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={emptyIcon}
              title={emptyTitle}
              text={emptyText}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function RecentActivityCard({
  activities,
  href,
}: {
  activities: ActivityItem[];
  href: string;
}) {
  const rows = activities.slice(0, 5);
  return (
    <OverviewSidePanel
      title="Recent Activity"
      href={href}
      emptyIcon={<Clock3 className="size-5" />}
      emptyTitle="No recent activity"
      emptyText="New loans, repayments and submitted reports will appear here as they happen."
      hasRows={rows.length > 0}
    >
      <StepTimeline
        items={rows.map((item) => ({
          id: item.id,
          title: item.title,
          detail: (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="truncate">{item.meta}</span>
              {item.amountValue != null ? (
                <span className="font-semibold tabular-nums text-[var(--forest-emerald)]">
                  <Money
                    value={item.amountValue}
                    currency={item.amountCurrency ?? "UGX"}
                  />
                </span>
              ) : null}
            </span>
          ),
          tone:
            item.tone === "gold"
              ? "amber"
              : item.tone === "violet"
                ? "violet"
                : item.tone === "blue"
                  ? "blue"
                  : "green",
          icon: (
            <ActivityIconGlyph icon={item.icon} />
          ),
          meta: item.time,
        }))}
      />
    </OverviewSidePanel>
  );
}

function AlertsCard({
  alerts,
  href,
}: {
  alerts: AlertItem[];
  href: string;
}) {
  const rows = alerts.slice(0, 5);
  return (
    <OverviewSidePanel
      title="Alerts"
      href={href}
      emptyIcon={<CheckCircle2 className="size-5" />}
      emptyTitle="No active alerts"
      emptyText="There are no overdue, approval or branch setup issues needing attention right now."
      hasRows={rows.length > 0}
      listClassName="space-y-2"
    >
      {rows.map((alert) => (
        <Link
          key={alert.id}
          href={alert.href ?? href}
          className={`flex w-full min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 transition hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${
            alert.tone === "red"
              ? "border-red-100 bg-red-50/80"
              : alert.tone === "gold"
                ? "border-amber-100 bg-amber-50/80"
                : "border-blue-100 bg-blue-50/75"
          }`}
        >
          <span
            className={`grid size-8 shrink-0 place-items-center rounded-xl ${
              alert.tone === "red"
                ? "bg-white/80 text-red-600"
                : alert.tone === "gold"
                  ? "bg-white/80 text-orange-600"
                  : "bg-white/80 text-blue-600"
            }`}
          >
            {alert.tone === "blue" ? (
              <Clock3 className="size-4" />
            ) : (
              <AlertTriangle className="size-4" />
            )}
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="truncate text-xs font-medium text-[#111827]">
              {alert.title}
            </p>
            <p className="mt-0.5 truncate text-[11px] font-normal text-slate-500">
              {alert.detail}
            </p>
          </div>
          <p className="w-14 shrink-0 text-right text-[11px] font-semibold text-slate-500">
            {alert.time}
          </p>
          <ArrowRight className="size-3.5 shrink-0 text-slate-400" />
        </Link>
      ))}
    </OverviewSidePanel>
  );
}

function PanelHeader({
  title,
  action,
  href,
}: {
  title: string;
  action?: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-bold text-[#0b1220]">{title}</h2>
      {href ? (
        <Link
          href={href}
          className="rounded-xl border border-[#e6ebf0] px-3 py-1.5 text-[11px] font-medium text-[#111827] shadow-[0_8px_16px_rgba(15,23,42,0.04)]"
        >
          View all
        </Link>
      ) : action ? (
        <button
          type="button"
          className="flex items-center gap-2 rounded-xl border border-[#e6ebf0] px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-[0_8px_16px_rgba(15,23,42,0.04)]"
        >
          {action}
          <ChevronDown className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

type ChartSeriesKey = "outstanding" | "collected" | "issued";

const CHART_SERIES: Array<{
  key: ChartSeriesKey;
  label: string;
  color: string;
}> = [
  { key: "outstanding", label: "Total Loan Balance", color: "#0f8f68" },
  { key: "collected", label: "Collected", color: "#0ea5e9" },
  { key: "issued", label: "Issued Loans", color: "#64748b" },
];

function chartSeries(collectedLabel = "Collected") {
  return CHART_SERIES.map((item) =>
    item.key === "collected" ? { ...item, label: collectedLabel } : item,
  );
}

function LineChart({
  series,
  currency,
  collectedLabel = "Collected",
}: {
  series: ReturnType<typeof buildPortfolioSeries>;
  currency: string;
  collectedLabel?: string;
}) {
  const seriesMeta = chartSeries(collectedLabel);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [showArea, setShowArea] = useState(true);
  const [visible, setVisible] = useState<Record<ChartSeriesKey, boolean>>({
    outstanding: true,
    collected: true,
    issued: true,
  });

  const width = 640;
  const height = 250;
  const padding = { top: 20, right: 18, bottom: 34, left: 48 };
  const activeSeries = seriesMeta.filter((item) => visible[item.key]);
  const maxValue = Math.max(
    1,
    ...series.flatMap((point) =>
      activeSeries.map((item) => point[item.key]),
    ),
  );

  const pointMaps = {
    outstanding: series.map((point, index) =>
      chartPoint(
        index,
        point.outstanding,
        series.length,
        maxValue,
        width,
        height,
        padding,
      ),
    ),
    collected: series.map((point, index) =>
      chartPoint(
        index,
        point.collected,
        series.length,
        maxValue,
        width,
        height,
        padding,
      ),
    ),
    issued: series.map((point, index) =>
      chartPoint(
        index,
        point.issued,
        series.length,
        maxValue,
        width,
        height,
        padding,
      ),
    ),
  } as const;

  const labelStep = series.length > 14 ? 5 : series.length > 7 ? 2 : 1;
  const activeIndex = pinnedIndex ?? hoverIndex;
  const active = activeIndex == null ? null : series[activeIndex];
  const previous =
    activeIndex == null || activeIndex === 0 ? null : series[activeIndex - 1];
  const activeX =
    activeIndex == null
      ? null
      : pointMaps.outstanding[activeIndex]?.x ?? null;
  const chartBottom = height - padding.bottom;
  const plotLeft = padding.left;
  const plotRight = width - padding.right;

  function indexFromClientX(
    event: ReactMouseEvent<SVGSVGElement>,
  ): number | null {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    if (x < plotLeft || x > plotRight || series.length === 0) return null;
    const ratio = (x - plotLeft) / Math.max(1, plotRight - plotLeft);
    return Math.max(
      0,
      Math.min(series.length - 1, Math.round(ratio * Math.max(0, series.length - 1))),
    );
  }

  function toggleSeries(key: ChartSeriesKey) {
    setVisible((current) => {
      const next = { ...current, [key]: !current[key] };
      if (!next.outstanding && !next.collected && !next.issued) {
        return current;
      }
      return next;
    });
  }

  function moveActive(delta: number) {
    if (series.length === 0) return;
    setPinnedIndex((current) => {
      const base = current ?? hoverIndex ?? series.length - 1;
      return Math.max(0, Math.min(series.length - 1, base + delta));
    });
  }

  if (series.length === 0) {
    return (
      <div className="mt-5 grid h-[250px] place-items-center rounded-[14px] border border-dashed border-[#d5dde5] bg-[#f8faf9] text-sm text-slate-500">
        No performance data for this period yet.
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {seriesMeta.map((item) => {
            const on = visible[item.key];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleSeries(item.key)}
                className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition ${
                  on
                    ? "border-[#e6ebf0] bg-white text-[#0b1220]"
                    : "border-transparent bg-[#f1f5f4] text-slate-400 line-through"
                }`}
                aria-pressed={on}
              >
                <span
                  className="size-2 rounded-full"
                  style={{
                    backgroundColor: on ? item.color : "#cbd5e1",
                  }}
                />
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowArea((value) => !value)}
            className={`h-7 rounded-lg border px-2.5 text-[11px] font-semibold transition ${
              showArea
                ? "border-emerald-200 bg-emerald-50 text-[var(--forest-emerald)]"
                : "border-[#e6ebf0] bg-white text-slate-500"
            }`}
            aria-pressed={showArea}
          >
            Area fill
          </button>
          {pinnedIndex != null ? (
            <button
              type="button"
              onClick={() => setPinnedIndex(null)}
              className="h-7 rounded-lg border border-[#e6ebf0] bg-white px-2.5 text-[11px] font-semibold text-slate-600"
            >
              Unpin
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="relative rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            moveActive(-1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            moveActive(1);
          }
          if (event.key === "Escape") {
            setPinnedIndex(null);
            setHoverIndex(null);
          }
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[250px] w-full cursor-crosshair"
          onMouseMove={(event) => {
            if (pinnedIndex != null) return;
            setHoverIndex(indexFromClientX(event));
          }}
          onMouseLeave={() => {
            if (pinnedIndex == null) setHoverIndex(null);
          }}
          onClick={(event) => {
            const index = indexFromClientX(event);
            if (index == null) return;
            setPinnedIndex((current) => (current === index ? null : index));
          }}
        >
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f8f68" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#0f8f68" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y =
              padding.top + (height - padding.top - padding.bottom) * ratio;
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="#e8edf2"
                  strokeDasharray="3 6"
                />
                <text
                  x={padding.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-semibold"
                >
                  {compactMoney(maxValue * (1 - ratio), currency)}
                </text>
              </g>
            );
          })}

          {showArea && visible.outstanding ? (
            <path
              d={pointsToAreaPath(pointMaps.outstanding, chartBottom)}
              fill="url(#balanceFill)"
            />
          ) : null}
          {showArea && visible.collected ? (
            <path
              d={pointsToAreaPath(pointMaps.collected, chartBottom)}
              fill="url(#collectedFill)"
            />
          ) : null}

          {visible.issued ? (
            <path
              d={pointsToSmoothPath(pointMaps.issued)}
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              strokeDasharray="4 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {visible.collected ? (
            <path
              d={pointsToSmoothPath(pointMaps.collected)}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {visible.outstanding ? (
            <path
              d={pointsToSmoothPath(pointMaps.outstanding)}
              fill="none"
              stroke="#0f8f68"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {activeX != null ? (
            <line
              x1={activeX}
              x2={activeX}
              y1={padding.top}
              y2={chartBottom}
              stroke="#0f8f68"
              strokeOpacity="0.35"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          ) : null}

          {activeIndex != null
            ? seriesMeta.filter((item) => visible[item.key]).map((item) => (
                <circle
                  key={item.key}
                  cx={pointMaps[item.key][activeIndex]?.x}
                  cy={pointMaps[item.key][activeIndex]?.y}
                  r={item.key === "outstanding" ? 5.5 : 5}
                  fill={item.color}
                  stroke="#fff"
                  strokeWidth="2.5"
                />
              ))
            : null}

          {series.map((point, index) => {
            if (
              index !== 0 &&
              index !== series.length - 1 &&
              index % labelStep !== 0
            ) {
              return null;
            }
            return (
              <text
                key={point.label}
                x={pointMaps.outstanding[index]?.x ?? 0}
                y={height - 10}
                textAnchor="middle"
                className={`text-[10px] font-semibold ${
                  activeIndex === index ? "fill-[#0f8f68]" : "fill-slate-400"
                }`}
              >
                {point.label}
              </text>
            );
          })}
        </svg>

        {active && activeX != null ? (
          <div
            className="pointer-events-none absolute top-2 z-10 w-[210px] rounded-xl border border-[#e6ebf0] bg-white/96 p-2.5 shadow-[0_16px_36px_rgba(15,23,42,0.12)] backdrop-blur"
            style={{
              left: `${Math.min(68, Math.max(6, (activeX / width) * 100 - 14))}%`,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-[#0b1220]">
                {active.tooltipLabel}
              </p>
              {pinnedIndex != null ? (
                <span className="text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--forest-emerald)]">
                  Pinned
                </span>
              ) : null}
            </div>
            <div className="mt-2 space-y-1 text-[11px]">
              {seriesMeta.filter((item) => visible[item.key]).map((item) => (
                <HoverStat
                  key={item.key}
                  color={item.color}
                  label={item.label}
                  value={
                    <Money value={active[item.key]} currency={currency} />
                  }
                  delta={
                    previous
                      ? active[item.key] - previous[item.key]
                      : null
                  }
                  currency={currency}
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] font-medium text-slate-400">
              Click to pin · ← → to move · Esc to clear
            </p>
          </div>
        ) : (
          <p className="mt-1 text-[10px] font-medium text-slate-400">
            Hover to inspect · click legend to show/hide series · click chart to
            pin a point
          </p>
        )}
      </div>
    </div>
  );
}

function HoverStat({
  color,
  label,
  value,
  delta,
  currency,
}: {
  color: string;
  label: string;
  value: ReactNode;
  delta?: number | null;
  currency?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 font-medium text-slate-500">
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
      <span className="text-right">
        <span className="block font-bold tabular-nums text-[#0b1220]">
          {value}
        </span>
        {delta != null && currency ? (
          <span
            className={`block text-[10px] font-semibold tabular-nums ${
              delta > 0
                ? "text-[var(--forest-emerald)]"
                : delta < 0
                  ? "text-red-600"
                  : "text-slate-400"
            }`}
          >
            {delta > 0 ? "+" : ""}
            {compactMoney(delta, currency)}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function PerformanceDonutChart({
  series,
  currency,
  collectedLabel = "Collected",
}: {
  series: ReturnType<typeof buildPortfolioSeries>;
  currency: string;
  collectedLabel?: string;
}) {
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [lockedLabel, setLockedLabel] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const latest = series[series.length - 1];
  const items = [
    {
      label: "Total Loan Balance",
      value: latest?.outstanding ?? 0,
      color: "#003f35",
      help: "Total loan balance at period end",
    },
    {
      label: collectedLabel,
      value: sumBy(series, (point) => point.collected),
      color: "#16a06d",
      help: "Repayments in this period",
    },
    {
      label: "Issued Loans",
      value: sumBy(series, (point) => point.issued),
      color: "#86efac",
      help: "Amount given in this period",
    },
  ];
  const visibleItems = items.filter((item) => !hidden[item.label]);
  const total = sumBy(visibleItems, (item) => item.value);
  const focusLabel = lockedLabel ?? hoverLabel;
  const activeItem =
    visibleItems.find((item) => item.label === focusLabel) ?? null;
  let offset = 0;

  function toggleHidden(label: string) {
    setHidden((current) => {
      const next = { ...current, [label]: !current[label] };
      const stillVisible = items.some((item) => !next[item.label]);
      if (!stillVisible) return current;
      if (lockedLabel === label) setLockedLabel(null);
      return next;
    });
  }

  return (
    <div className="mt-4 grid items-center gap-4 sm:grid-cols-[168px_1fr]">
      <div className="relative mx-auto grid size-[168px] place-items-center">
        <svg viewBox="0 0 120 120" className="size-[168px] -rotate-90">
          <circle
            cx="60"
            cy="60"
            r="42"
            fill="none"
            stroke="#eef3f0"
            strokeWidth="14"
          />
          {visibleItems.map((item) => {
            const share = total > 0 ? (item.value / total) * 100 : 0;
            const gap = share > 0 ? 1.1 : 0;
            const visible = Math.max(0, share - gap);
            const dashOffset = -offset;
            offset += share;
            const emphasized = focusLabel == null || focusLabel === item.label;
            return (
              <circle
                key={item.label}
                cx="60"
                cy="60"
                r="42"
                fill="none"
                pathLength="100"
                stroke={item.color}
                strokeWidth={emphasized ? 15 : 11}
                strokeOpacity={emphasized ? 1 : 0.28}
                strokeDasharray={`${visible} ${100 - visible}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
                className="cursor-pointer transition-all duration-300"
                onMouseEnter={() => setHoverLabel(item.label)}
                onMouseLeave={() => setHoverLabel(null)}
                onClick={() =>
                  setLockedLabel((current) =>
                    current === item.label ? null : item.label,
                  )
                }
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[11px] font-semibold text-slate-500">
              {activeItem?.label ?? "Total"}
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-[#070b18]">
              <Money value={activeItem?.value ?? total} currency={currency} />
            </p>
            <p className="mt-0.5 text-[10px] font-medium text-slate-400">
              {percent(activeItem?.value ?? total, total).replace(/[()]/g, "")}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        {items.map((item) => {
          const isHidden = Boolean(hidden[item.label]);
          const share =
            !isHidden && total > 0 ? (item.value / total) * 100 : 0;
          const focused = focusLabel === item.label;
          return (
            <div
              key={item.label}
              className={`flex items-center gap-2 rounded-lg px-2 py-2 transition ${
                focused ? "bg-emerald-50/70" : "hover:bg-[#f8faf9]"
              } ${isHidden ? "opacity-45" : ""}`}
              onMouseEnter={() => {
                if (!isHidden) setHoverLabel(item.label);
              }}
              onMouseLeave={() => setHoverLabel(null)}
            >
              <button
                type="button"
                onClick={() => toggleHidden(item.label)}
                className="grid size-6 place-items-center rounded-md border border-[#e6ebf0] bg-white"
                aria-label={
                  isHidden ? `Show ${item.label}` : `Hide ${item.label}`
                }
                title={isHidden ? "Show in chart" : "Hide from chart"}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{
                    backgroundColor: isHidden ? "#cbd5e1" : item.color,
                  }}
                />
              </button>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() =>
                  setLockedLabel((current) =>
                    current === item.label ? null : item.label,
                  )
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-[#0b1220]">
                    {item.label}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-[#111827]">
                    <Money value={item.value} currency={currency} />
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#edf2f0]">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${share}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
                <p className="mt-1 text-[10px] font-medium text-slate-500">
                  {item.help}
                  {lockedLabel === item.label ? " · locked" : ""}
                </p>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityIconGlyph({
  icon,
}: {
  icon: ActivityItem["icon"];
}) {
  if (icon === "check") return <CheckCircle2 />;
  if (icon === "loan") return <Folder />;
  if (icon === "report") return <FileText />;
  return <Banknote />;
}

function OverviewSkeleton() {
  return (
    <div className="grid gap-3 xl:grid-cols-[1.08fr_1fr_0.86fr]">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="rounded-[14px] border border-[#e6ebf0] bg-white p-4 shadow-[0_8px_18px_rgba(15,23,42,0.045)]"
        >
          <SkeletonBlock className="h-5 w-44" />
          <SkeletonBlock className="mt-5 h-48 w-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
  compact = false,
}: {
  icon?: ReactNode;
  title?: string;
  text: string;
  compact?: boolean;
}) {
  return (
    <div className={`text-center ${compact ? "px-5 py-8" : "px-6 py-10"}`}>
      <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-emerald-50 text-[var(--forest-emerald)]">
        {icon ?? <Inbox className="size-5" />}
      </span>
      <p className="mt-3 text-sm font-semibold text-[#0b1220]">
        {title ?? "No data yet"}
      </p>
      <p className="mx-auto mt-1 max-w-[260px] text-xs font-medium leading-5 text-slate-500">
        {text}
      </p>
    </div>
  );
}

function buildBranchPerformance(
  branches: OwnerBranch[],
  loans: OwnerLoan[],
  todayRepayments: OwnerRepayment[],
  loanById: Map<string, OwnerLoan>,
): BranchPerformance[] {
  return branches
    .map((branch) => {
      const branchLoans = loans.filter((loan) => loan.branchId === branch.id);
      const activeBranchLoans = branchLoans.filter((loan) =>
        ACTIVE_STATUSES.has(loan.status),
      );
      const overdue = activeBranchLoans.filter(isOverdueLoan);
      const overdueAmount = sumBy(overdue, (loan) => loan.balance);
      const collectedToday = sumBy(
        todayRepayments.filter((repayment) => loanById.get(repayment.loanId)?.branchId === branch.id),
        (repayment) => repayment.amount,
      );
      return {
        branch,
        loanTotal: sumBy(branchLoans, (loan) => loan.principal),
        collectedToday,
        overdueAmount,
        overdueLoanCount: overdue.length,
      };
    })
    .sort((a, b) => b.loanTotal - a.loanTotal);
}

function buildPortfolioSeries(
  loans: OwnerLoan[],
  repayments: OwnerRepayment[],
  period: PerformancePeriod,
) {
  return performanceBuckets(period).map((bucket) => {
    const outstanding = sumBy(
      loans.filter(
        (loan) =>
          !["DRAFT", "REJECTED", "WRITTEN_OFF"].includes(loan.status) &&
          new Date(loan.disbursedAt ?? loan.createdAt) <= bucket.end,
      ),
      (loan) => loan.balance,
    );
    const issued = sumBy(
      loans.filter((loan) =>
        isBetween(loan.disbursedAt ?? loan.createdAt, bucket.start, bucket.end),
      ),
      (loan) => loan.principal,
    );
    const collected = sumBy(
      repayments.filter((repayment) =>
        isBetween(repayment.recordedAt, bucket.start, bucket.end),
      ),
      (repayment) => repayment.amount,
    );
    return {
      label: bucket.label,
      tooltipLabel: bucket.tooltipLabel,
      outstanding,
      collected,
      issued,
    };
  });
}

function performanceBuckets(period: PerformancePeriod) {
  const today = startOfDay(new Date());
  if (period === "2m" || period === "3m") {
    const monthCount = period === "2m" ? 2 : 3;
    return Array.from({ length: monthCount }).map((_, index) => {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      start.setMonth(start.getMonth() - (monthCount - 1 - index));
      const end = endOfMonth(start);
      const cappedEnd = end > endOfDay(today) ? endOfDay(today) : end;
      return {
        start,
        end: cappedEnd,
        label: new Intl.DateTimeFormat("en-GB", {
          month: "short",
        }).format(start),
        tooltipLabel: new Intl.DateTimeFormat("en-GB", {
          month: "long",
          year: "numeric",
        }).format(start),
      };
    });
  }

  const start = new Date(today);
  if (period === "month") {
    start.setDate(1);
  } else {
    const days = period === "7d" ? 7 : period === "14d" ? 14 : 30;
    start.setDate(start.getDate() - (days - 1));
  }

  const days = Math.max(
    1,
    Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1,
  );
  return Array.from({ length: days }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      start: startOfDay(date),
      end: endOfDay(date),
      label: new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
      }).format(date),
      tooltipLabel: new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(date),
    };
  });
}

function buildActivities(
  todayRepayments: OwnerRepayment[],
  loans: OwnerLoan[],
  reports: OwnerReport[],
  currency: string,
): ActivityItem[] {
  const repaymentItems = todayRepayments.map((repayment) => ({
    id: `repayment-${repayment.id}`,
    title: `Payment collected from ${repayment.clientName}`,
    meta: `By ${repayment.recordedByName}`,
    amountValue: repayment.amount,
    amountCurrency: currency,
    time: timeAgo(repayment.recordedAt),
    tone: "green" as const,
    icon: "check" as const,
    at: new Date(repayment.recordedAt),
  }));
  const loanItems = loans.slice(0, 8).map((loan) => ({
    id: `loan-${loan.id}`,
    title: `New loan issued to ${loan.borrowerName}`,
    meta: [loan.officerName, loan.loanTypeName].filter(Boolean).join(" · ") || "Loan issued",
    amountValue: loan.principal,
    amountCurrency: currency,
    time: timeAgo(loan.disbursedAt ?? loan.createdAt),
    tone: "blue" as const,
    icon: "loan" as const,
    at: new Date(loan.disbursedAt ?? loan.createdAt),
  }));
  const reportItems = reports.slice(0, 8).map((report) => ({
    id: `report-${report.id}`,
    title: "Report submitted",
    meta: `${report.reportNumber} · ${report.branchName}`,
    time: timeAgo(report.generatedAt),
    tone: "violet" as const,
    icon: "report" as const,
    at: new Date(report.generatedAt),
  }));
  return [...repaymentItems, ...loanItems, ...reportItems].sort(
    (a, b) => b.at.getTime() - a.at.getTime(),
  );
}

function buildAlerts({
  branches,
  loans,
  reports,
  pendingReports,
  currency,
  branchAnalytics,
  links,
  mode,
}: {
  branches: OwnerBranch[];
  loans: OwnerLoan[];
  reports: OwnerReport[];
  pendingReports: OwnerReport[];
  currency: string;
  branchAnalytics: BranchCollectionPerformance[];
  links: OverviewLinks;
  mode: OverviewMode;
}): AlertItem[] {
  const overdueLoans = loans.filter(isOverdueLoan);
  const overdueAmount = sumBy(overdueLoans, (loan) => loan.balance);
  const missingManagers = branches.filter((branch) => !branch.manager);
  const returnedReports = reports.filter(
    (report) => report.status === "RETURNED_TO_MANAGER",
  );
  const varianceReports = reports.filter(
    (report) => Math.abs(report.closingVariance ?? 0) > 0,
  );
  const analytics = branchAnalytics[0] ?? null;
  const overduePaidLoans = loans.filter(
    (loan) => loan.dueDayCoverage === "overdue_paid",
  );
  const alerts: AlertItem[] = [];

  if (overduePaidLoans.length > 0) {
    alerts.push({
      id: "overdue-paid-today",
      title:
        overduePaidLoans.length === 1
          ? "An overdue borrower paid today"
          : `${overduePaidLoans.length} overdue borrowers paid today`,
      detail:
        "They paid something toward overdue days. Tap view all to see the list and follow up.",
      time: "Today",
      tone: "gold",
      href: `${links.loans}?coverage=overdue_paid`,
    });
  }

  if (mode === "manager") {
    const compliance = analytics?.dailyCompliance ?? null;
    const overdueExposure = analytics?.overdueExposure ?? null;
    const averageRate = analytics?.averageRate ?? null;

    if (returnedReports.length > 0) {
      alerts.push({
        id: "returned-reports",
        title:
          returnedReports.length === 1
            ? "Report returned"
            : `${returnedReports.length} reports returned`,
        detail: "Fix and resubmit your close-day report.",
        time: "Today",
        tone: "red",
        href: links.reports,
      });
    }

    if (compliance && compliance.level !== "healthy") {
      const closeDate = compliance.date
        ? formatDate(compliance.date)
        : "yesterday";
      alerts.push({
        id: "daily-close-attention",
        title: "Daily operations require attention",
        detail: `Complete outstanding reconciliation for ${closeDate}.`,
        time: "Today",
        tone: "red",
        href: links.reports,
      });
    }

    if (overdueLoans.length > 0) {
      alerts.push({
        id: "overdue-loans-action",
        title: "Overdue loans require immediate action",
        detail: `${overdueLoans.length} loan${
          overdueLoans.length === 1 ? "" : "s"
        } have missed their expected repayments.`,
        time: "Today",
        tone: "red",
        href: links.loans,
      });
    }

    if (overdueExposure) {
      if (overdueExposure.criticalCount > 0) {
        alerts.push({
          id: "repayments-overdue-critical",
          title: "Repayments overdue",
          detail: `${overdueExposure.criticalCount} borrower${
            overdueExposure.criticalCount === 1 ? "" : "s"
          } have missed repayments for more than 8 days.`,
          time: "Today",
          tone: "red",
          href: `${links.loans}?repayment=${encodeURIComponent("8+")}`,
        });
      }
      if (overdueExposure.highRiskCount > 0) {
        alerts.push({
          id: "repayments-overdue-high-risk",
          title: "Repayments overdue",
          detail: `${overdueExposure.highRiskCount} borrower${
            overdueExposure.highRiskCount === 1 ? "" : "s"
          } have missed repayments for more than 4 days.`,
          time: "Today",
          tone: "gold",
          href: `${links.loans}?repayment=${encodeURIComponent("4-7")}`,
        });
      }
      if (overdueExposure.followUpCount > 0) {
        alerts.push({
          id: "repayments-overdue-follow-up",
          title: "Repayments overdue",
          detail: `${overdueExposure.followUpCount} borrower${
            overdueExposure.followUpCount === 1 ? "" : "s"
          } have missed repayments for more than 2 days.`,
          time: "Today",
          tone: "gold",
          href: `${links.loans}?repayment=${encodeURIComponent("2-3")}`,
        });
      }
    }

    if (averageRate != null && averageRate < 50) {
      alerts.push({
        id: "collection-below-50",
        title: "Less than 50% repayments collected",
        detail:
          "The branch collected less than 50% of the expected repayments over the past 7 days. Review missed repayments.",
        time: "Today",
        tone: "red",
        href: links.loans,
      });
    } else if (averageRate != null && averageRate < 70) {
      alerts.push({
        id: "collection-below-70",
        title: "Less than 70% of repayments collected",
        detail:
          "The branch collected less than 70% of the expected repayments over the past 7 days. Review missed repayments.",
        time: "Today",
        tone: "gold",
        href: links.loans,
      });
    }

    if (overdueLoans.length > 0 && overdueAmount > 0) {
      alerts.push({
        id: "overdue-loan-payments",
        title: "Overdue loan payments",
        detail: `${formatMoney(overdueAmount, currency)} in loan repayments is overdue. Review affected loans.`,
        time: "Today",
        tone: "gold",
        href: links.loans,
      });
    }

    if (varianceReports.length > 0) {
      alerts.push({
        id: "report-variance",
        title: "Cash does not match the expected balance",
        detail:
          "The cash counted at closing is different from the amount the system expected. Review transactions.",
        time: "Today",
        tone: "red",
        href: links.reports,
      });
    }

    // Awaiting owner approval is shown as a header notification, not an alert.
    return alerts;
  }

  const missingReconciliationBranches = branchAnalytics.filter(
    (branch) =>
      branch.dailyCompliance.missingReconciliation ||
      branch.dailyCompliance.missingReport,
  );
  const highRiskBorrowerBranches = branchAnalytics.filter(
    (branch) => branch.overdueExposure.highRiskCount > 0,
  );
  const followUpBorrowerBranches = branchAnalytics.filter(
    (branch) => branch.overdueExposure.followUpCount > 0,
  );

  if (missingReconciliationBranches.length > 0) {
    const closeDate =
      missingReconciliationBranches.find((branch) => branch.dailyCompliance.date)
        ?.dailyCompliance.date ?? previousDateLabel();
    const count = missingReconciliationBranches.length;
    alerts.push({
      id: "branch-missing-reconciliation",
      title: count === 1 ? "Branch needs attention" : "Branches need attention",
      detail: `${count} branch${count === 1 ? " has" : "es have"} not submitted reconciliation report for ${formatDate(closeDate)}.`,
      time: "Today",
      tone: "red",
      href: `${links.branches}?view=attention`,
    });
  }

  if (highRiskBorrowerBranches.length > 0) {
    const count = highRiskBorrowerBranches.length;
    alerts.push({
      id: "branch-high-risk-exposure",
      title: count === 1 ? "Branch needs attention" : "Branches need attention",
      detail: `${count} branch${count === 1 ? " has" : "es have"} borrowers who are 4–7 days behind on repayments.`,
      time: "Today",
      tone: "gold",
      href: `${links.branches}?view=attention`,
    });
  }

  if (followUpBorrowerBranches.length > 0) {
    const count = followUpBorrowerBranches.length;
    alerts.push({
      id: "branch-follow-up-exposure",
      title: count === 1 ? "Branch needs attention" : "Branches need attention",
      detail: `${count} branch${count === 1 ? " has" : "es have"} borrowers who are 2–3 days behind on repayments.`,
      time: "Today",
      tone: "gold",
      href: `${links.branches}?view=attention`,
    });
  }

  if (overdueLoans.length > 0) {
    alerts.push({
      id: "overdue-loans",
      title: "Overdue repayments",
      detail: `${overdueLoans.length} loan${
        overdueLoans.length === 1 ? "" : "s"
      } have overdue repayments totalling to ${formatMoney(overdueAmount, currency)}.`,
      time: "Today",
      tone: "gold",
      href: links.loans,
    });
  }

  // Pending approvals, returned reports, and cash variance are not owner alerts.

  for (const branch of missingManagers) {
    alerts.push({
      id: `missing-manager-${branch.id}`,
      title: "Manager assignment needed",
      detail: `Assign a manager for ${branch.name}`,
      time: "Today",
      tone: "blue",
      href: `${links.branches}?status=pending`,
    });
  }

  return alerts;
}

function buildConicGradient(
  items: Array<{ value: number; color: string }>,
  total: number,
) {
  if (total <= 0) return "conic-gradient(#e8eef2 0deg 360deg)";
  let start = 0;
  const stops = items.map((item) => {
    const sweep = (item.value / total) * 360;
    const end = start + sweep;
    const stop = `${item.color} ${start}deg ${end}deg`;
    start = end;
    return stop;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function chartPoint(
  index: number,
  value: number,
  total: number,
  maxValue: number,
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
) {
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  return {
    x: padding.left + (chartWidth / Math.max(1, total - 1)) * index,
    y: padding.top + chartHeight - (value / maxValue) * chartHeight,
  };
}

function pointsToPath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function pointsToSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i === 0 ? 0 : i - 1]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function pointsToAreaPath(
  points: Array<{ x: number; y: number }>,
  bottomY: number,
) {
  if (points.length === 0) return "";
  const line = pointsToSmoothPath(points);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${line} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
}

function compactMoney(value: number, currency: string) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}${Math.round(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}K`;
  if (abs === 0) return currency === "UGX" ? "0" : "0";
  return `${sign}${Math.round(abs)}`;
}

function percent(value: number, total: number) {
  if (total <= 0) return "(0%)";
  return `(${Math.round((value / total) * 100)}%)`;
}

function comparisonChange(today: number, yesterday: number) {
  const average = (Math.abs(today) + Math.abs(yesterday)) / 2;
  if (average <= 0) return "0%";
  const rawChange = ((today - yesterday) / average) * 100;
  const rounded = Math.round(rawChange * 10) / 10;
  if (Math.abs(rounded) < 0.1) return "0%";
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("en-UG")}%`;
}

function firstName(name: string) {
  return name.split(" ").filter(Boolean)[0] ?? "Owner";
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function isToday(value: string | null | undefined) {
  if (!value) return false;
  return isSameDay(value, new Date());
}

function isYesterday(value: string | null | undefined) {
  if (!value) return false;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(value, yesterday);
}

function isSameMonth(value: string | Date, date: Date) {
  const parsed = typeof value === "string" ? new Date(value) : value;
  return (
    parsed.getFullYear() === date.getFullYear() &&
    parsed.getMonth() === date.getMonth()
  );
}

function isSameDay(value: string | Date, date: Date) {
  const parsed = typeof value === "string" ? new Date(value) : value;
  return (
    parsed.getFullYear() === date.getFullYear() &&
    parsed.getMonth() === date.getMonth() &&
    parsed.getDate() === date.getDate()
  );
}

function isBetween(
  value: string | null | undefined,
  start: Date,
  end: Date,
) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= start.getTime() && time <= end.getTime();
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function endOfMonth(date: Date) {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  next.setHours(23, 59, 59, 999);
  return next;
}

function isOverdueLoan(loan: OwnerLoan) {
  return isLoanScheduleOverdue(loan);
}

function timeAgo(value: string | null | undefined) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes} mins ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}
