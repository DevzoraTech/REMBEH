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
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app/app-shell";
import { AppBootSkeleton, SkeletonBlock } from "../../components/app/skeleton";
import {
  OwnerHeader,
  type OwnerNotificationItem,
  Tooltip,
} from "./owner-header";
import {
  buildBranchCollectionPerformance,
  type BranchCollectionPerformance,
} from "./branch-analytics";
import {
  OwnerBorrower,
  OwnerBranch,
  OwnerBranchDailyStatus,
  OwnerLoan,
  OwnerReport,
  OwnerRepayment,
  formatMoney,
  formatNumber,
  ownerFetch,
  previousDateLabel,
  sumBy,
  useOwnerSession,
} from "./owner-common";

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
  amount?: string;
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

export default function OwnerDashboardPage() {
  const state = useOwnerSession("/owner");
  const [branches, setBranches] = useState<OwnerBranch[]>([]);
  const [loans, setLoans] = useState<OwnerLoan[]>([]);
  const [borrowers, setBorrowers] = useState<OwnerBorrower[]>([]);
  const [repayments, setRepayments] = useState<OwnerRepayment[]>([]);
  const [reports, setReports] = useState<OwnerReport[]>([]);
  const [dailyStatuses, setDailyStatuses] = useState<OwnerBranchDailyStatus[]>(
    [],
  );
  const [search, setSearch] = useState("");
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
          "/collections/repayments?filter=all",
        ),
        ownerFetch<{ reports?: OwnerReport[] }>(
          state.session,
          "/operations/reports",
        ),
        ownerFetch<{ statuses?: OwnerBranchDailyStatus[] }>(
          state.session,
          `/operations/owner-daily-status?date=${previousDateLabel()}`,
        ),
      ]);
      setBranches(branchPayload.branches ?? []);
      setLoans(loanPayload.loans ?? []);
      setBorrowers(borrowerPayload.customers ?? []);
      setRepayments(repaymentPayload.repayments ?? []);
      setReports(reportPayload.reports ?? []);
      setDailyStatuses(dailyStatusPayload.statuses ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load owner dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, [state.session]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      if (state.ready && state.session) {
        void loadData();
      }
    }, 0);

    return () => window.clearTimeout(boot);
  }, [loadData, state.ready, state.session]);

  const activeLoans = useMemo(
    () => loans.filter((loan) => ACTIVE_STATUSES.has(loan.status)),
    [loans],
  );
  const pendingReports = useMemo(
    () => reports.filter((report) => report.status === "SENT_TO_OWNER"),
    [reports],
  );
  const reportsThisMonth = useMemo(
    () => reports.filter((report) => isSameMonth(report.operationDate, new Date())),
    [reports],
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
    () => repayments.filter((repayment) => isToday(repayment.recordedAt)),
    [repayments],
  );
  const yesterdayRepayments = useMemo(
    () => repayments.filter((repayment) => isYesterday(repayment.recordedAt)),
    [repayments],
  );
  const todayLoans = useMemo(
    () =>
      loans.filter((loan) => isToday(loan.disbursedAt ?? loan.createdAt)),
    [loans],
  );
  const todayBorrowers = useMemo(
    () => borrowers.filter((borrower) => isToday(borrower.createdAt)),
    [borrowers],
  );
  const todaySettledLoans = useMemo(
    () =>
      loans.filter(
        (loan) => loan.status === "CLOSED" && isToday(loan.updatedAt),
      ),
    [loans],
  );
  const totalLoanBalance = sumBy(loans, (loan) => loan.balance);
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
    () => new Map(loans.map((loan) => [loan.id, loan])),
    [loans],
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
    () => buildBranchPerformance(branches, loans, todayRepayments, loanById),
    [branches, loans, todayRepayments, loanById],
  );
  const branchAnalytics = useMemo(
    () =>
      buildBranchCollectionPerformance({
        branches,
        loans,
        repayments,
        dailyStatuses,
      }),
    [branches, dailyStatuses, loans, repayments],
  );
  const series = useMemo(
    () => buildPortfolioSeries(loans, repayments, performancePeriod),
    [loans, performancePeriod, repayments],
  );
  const activities = useMemo(
    () => buildActivities(todayRepayments, loans, reports, currency),
    [currency, loans, reports, todayRepayments],
  );
  const alerts = useMemo(
    () =>
      buildAlerts({
        branches,
        loans: activeLoans,
        reports,
        pendingReports,
        currency,
        branchAnalytics,
      }),
    [activeLoans, branchAnalytics, branches, currency, pendingReports, reports],
  );
  const notifications = useMemo(
    () =>
      buildNotifications({
        alerts,
        pendingReports,
      }),
    [alerts, pendingReports],
  );
  const activityTotal =
    todayActivity.loansIssued.length +
    todayActivity.collections.length +
    todayActivity.newBorrowers.length +
    todayActivity.fullySettled.length;
  const query = search.trim().toLowerCase();
  const visibleBranchPerformance = useMemo(
    () =>
      query
        ? branchPerformance.filter((row) =>
            [row.branch.name, row.branch.address, row.branch.manager?.name ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(query),
          )
        : branchPerformance,
    [branchPerformance, query],
  );
  const visibleActivities = useMemo(
    () =>
      query
        ? activities.filter((item) =>
            [item.title, item.meta, item.amount ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(query),
          )
        : activities,
    [activities, query],
  );
  const visibleAlerts = useMemo(
    () =>
      query
        ? alerts.filter((alert) =>
            [alert.title, alert.detail].join(" ").toLowerCase().includes(query),
          )
        : alerts,
    [alerts, query],
  );

  if (!state.ready || !state.session) return <AppBootSkeleton />;

  return (
    <AppShell
      session={state.session}
      workspace={state.workspace}
      user={state.user}
      branch={null}
    >
      <div className="mx-auto max-w-[1440px] space-y-3.5">
        <OwnerHeader
          subtitle={`${greeting()}, ${firstName(state.user?.name ?? "Owner")} 👋`}
          title="Here's what's happening today"
          search={search}
          onSearchChange={setSearch}
          searchTooltip="Search branches, reports, borrowers, activity and alerts on this overview."
          notifications={notifications}
        />

        {error ? (
          <p className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <section className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-5">
          <TopStatCard
            icon={<WalletCards className="size-5" />}
            label="Total Loan Balance"
            value={formatMoney(totalLoanBalance, currency)}
            hint="Across all branches"
            change={loanBalanceChange}
            tooltip="Total outstanding loan balance from all loan records visible to the owner."
            tone="green"
          />
          <TopStatCard
            icon={<Banknote className="size-5" />}
            label="Collected Today"
            value={formatMoney(collectedToday, currency)}
            hint="Across all branches"
            change={collectedTodayChange}
            tooltip="Total repayments recorded today across every branch."
            tone="green"
          />
          <TopStatCard
            icon={<Folder className="size-5" />}
            label="Active Loans"
            value={formatNumber(activeLoans.length)}
            hint={`${formatNumber(todayLoans.length)} New Today`}
            tooltip="Loans currently open or in progress, with new loans issued today below."
            tone="blue"
          />
          <TopStatCard
            icon={<Users className="size-5" />}
            label="Borrowers"
            value={formatNumber(borrowers.length)}
            hint={`${formatNumber(todayBorrowers.length)} new today`}
            tooltip="All registered borrowers visible to the owner, with today's new borrowers below."
            tone="violet"
          />
          <TopStatCard
            icon={<Clock3 className="size-5" />}
            label="Received Reports"
            value={`${formatNumber(receivedReportsThisMonth.length)} of ${formatNumber(reportsThisMonth.length)}`}
            hint={`${formatNumber(pendingReports.length)} pending approval`}
            tooltip="Reports received this month out of report records available this month. Pending approval shows reports waiting for owner action."
            tone="gold"
          />
        </section>

        {loading ? (
          <OverviewSkeleton />
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
                rows={visibleBranchPerformance}
                currency={currency}
              />
              <TodayActivityCard
                total={activityTotal}
                loansIssued={todayActivity.loansIssued.length}
                collections={todayActivity.collections.length}
                newBorrowers={todayActivity.newBorrowers.length}
                fullySettled={todayActivity.fullySettled.length}
                branches={branches}
                branchId={activityBranchId}
                onBranchChange={setActivityBranchId}
              />
            </section>

            <section className="grid gap-3 xl:grid-cols-[2fr_1fr]">
              <RecentActivityCard activities={visibleActivities} />
              <AlertsCard alerts={visibleAlerts} />
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
  tooltip,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  change?: string;
  tooltip: string;
  tone: "green" | "blue" | "violet" | "gold";
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
    <Tooltip label={tooltip}>
    <article className="flex min-h-[82px] min-w-0 items-center gap-2.5 rounded-[13px] border border-[#e6ebf0] bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneClass}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-slate-500">{label}</p>
        <div className="mt-1 flex min-w-0 flex-nowrap items-center gap-1.5">
          <p className="min-w-0 whitespace-nowrap text-[clamp(0.6rem,0.78vw,0.95rem)] font-bold leading-tight tabular-nums text-[#0b1220]">
            {value}
          </p>
          {change ? (
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${changeClass}`}>
              {change}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] font-medium text-slate-500">{hint}</p>
      </div>
    </article>
    </Tooltip>
  );
}

function PortfolioPerformanceCard({
  series,
  currency,
  period,
  view,
  onPeriodChange,
  onViewChange,
}: {
  series: ReturnType<typeof buildPortfolioSeries>;
  currency: string;
  period: PerformancePeriod;
  view: PerformanceView;
  onPeriodChange: (period: PerformancePeriod) => void;
  onViewChange: (view: PerformanceView) => void;
}) {
  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold text-[#0b1220]">
          Overall Performance
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            className="flex h-8 items-center rounded-xl border border-[#e6ebf0] bg-white p-1 shadow-[0_8px_16px_rgba(15,23,42,0.04)]"
            aria-label="Performance view"
          >
            <Tooltip label="Line view shows loan balance and collections over time.">
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
            <Tooltip label="Donut view compares loan balance, collections and issued principal for the selected period.">
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
          <Tooltip label="Choose the period used to calculate this performance view." align="right">
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
          </Tooltip>
        </div>
      </div>
      {view === "line" ? (
        <LineChart series={series} currency={currency} />
      ) : (
        <PerformanceDonutChart series={series} currency={currency} />
      )}
    </section>
  );
}

function BranchPerformanceCard({
  rows,
  currency,
}: {
  rows: BranchPerformance[];
  currency: string;
}) {
  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <PanelHeader title="Branch Performance" href="/owner/branches" />
      <div className="mt-3 grid grid-cols-[1fr_80px_86px_86px] gap-2 border-b border-[#edf1f5] pb-2 text-[10px] font-medium text-slate-500">
        <Tooltip label="Branch name with the active manager under it." align="left" block>
          <span>Branch</span>
        </Tooltip>
        <Tooltip label="Total principal issued by this branch." align="right" block>
          <span className="block w-full text-right">Loan ({currency})</span>
        </Tooltip>
        <Tooltip label="Repayments collected today by this branch." align="right" block>
          <span className="block w-full text-right">Collected</span>
        </Tooltip>
        <Tooltip label="Overdue balance with the overdue loan count below." align="right" block>
          <span className="block w-full text-right">Overdue</span>
        </Tooltip>
      </div>
      <div className="divide-y divide-[#edf1f5]">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-5" />}
            title="No branch activity"
            text="Branch performance will appear here once loans, collections or overdue balances are recorded."
          />
        ) : (
          rows.slice(0, 5).map((row) => (
            <Tooltip
              key={row.branch.id}
              label={`${row.branch.name}: ${formatMoney(row.loanTotal, currency)} issued, ${formatMoney(row.collectedToday, currency)} collected today, ${formatMoney(row.overdueAmount, currency)} overdue.`}
              align="right"
              block
            >
              <div
                className="grid w-full grid-cols-[1fr_80px_86px_86px] items-center gap-2 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-[var(--forest-emerald)]">
                    <Building2 className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-[#101827]">
                      {row.branch.name}
                    </p>
                    <p className="truncate text-[10px] font-normal text-slate-500">
                      {row.branch.manager?.name ?? "No manager assigned"}
                    </p>
                  </div>
                </div>
                <div className="flex min-w-0 justify-end text-right">
                  <p className="max-w-full break-words text-[11px] font-medium tabular-nums text-[#111827]">
                    {formatPlainMoney(row.loanTotal, currency)}
                  </p>
                </div>
                <div className="flex min-w-0 justify-end text-right">
                  <p className="max-w-full break-words text-[11px] font-medium tabular-nums text-[#111827]">
                    {formatPlainMoney(row.collectedToday, currency)}
                  </p>
                </div>
                <div className="flex min-w-0 flex-col items-end text-right">
                  <p className="max-w-full break-words text-[11px] font-medium tabular-nums text-[#111827]">
                    {formatPlainMoney(row.overdueAmount, currency)}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500">
                    {formatNumber(row.overdueLoanCount)}{" "}
                    {row.overdueLoanCount === 1 ? "loan" : "loans"}
                  </p>
                </div>
              </div>
            </Tooltip>
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
}: {
  total: number;
  loansIssued: number;
  collections: number;
  newBorrowers: number;
  fullySettled: number;
  branches: OwnerBranch[];
  branchId: string;
  onBranchChange: (branchId: string) => void;
}) {
  const items = [
    { label: "Loans Issued", value: loansIssued, color: "#003f35" },
    { label: "Collections", value: collections, color: "#10a06f" },
    { label: "New Borrowers", value: newBorrowers, color: "#9bd8ac" },
    { label: "Fully Settled", value: fullySettled, color: "#ccebd2" },
  ];
  const gradient = buildConicGradient(items, total);

  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-[#0b1220]">
          Today&apos;s Activity
        </h2>
        <Tooltip label="Choose one branch, or keep All branches to show network activity today." align="right">
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
        </Tooltip>
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
            <Tooltip
              key={item.label}
              label={`${item.label}: ${formatNumber(item.value)} today for the selected branch filter.`}
              align="right"
              block
            >
              <span className="flex w-full items-center gap-2.5">
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
                <span className="w-10 text-right text-xs font-semibold text-slate-500">
                  {percent(item.value, total)}
                </span>
              </span>
            </Tooltip>
          ))}
        </div>
      </div>
    </section>
  );
}

function RecentActivityCard({ activities }: { activities: ActivityItem[] }) {
  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <PanelHeader title="Recent Activity" href="/owner/reports" />
      <div className="mt-3 divide-y divide-[#edf1f5]">
        {activities.length === 0 ? (
          <EmptyState
            icon={<Clock3 className="size-5" />}
            title="No recent activity"
            text="New loans, repayments and submitted reports will appear here as they happen."
          />
        ) : (
          activities.slice(0, 5).map((item) => (
            <Tooltip
              key={item.id}
              label={`${item.title}. ${item.meta}${item.amount ? `, ${item.amount}` : ""}.`}
              align="right"
              block
            >
              <div className="flex w-full items-center gap-2.5 py-2">
                <ActivityIcon icon={item.icon} tone={item.tone} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-[#111827]">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] font-normal text-slate-500">
                    {item.meta}
                  </p>
                </div>
                {item.amount ? (
                  <p className="min-w-[94px] break-words text-right text-xs font-medium tabular-nums text-[var(--forest-emerald)]">
                    {item.amount}
                  </p>
                ) : null}
                <p className="w-16 text-right text-[11px] font-semibold text-slate-500">
                  {item.time}
                </p>
              </div>
            </Tooltip>
          ))
        )}
      </div>
    </section>
  );
}

function AlertsCard({ alerts }: { alerts: AlertItem[] }) {
  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <PanelHeader title="Alerts" href="/owner/risk" />
      <div className="mt-3 space-y-2">
        {alerts.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="size-5" />}
            title="No active alerts"
            text="There are no overdue, approval or branch setup issues needing attention right now."
          />
        ) : alerts.map((alert) => (
          <Tooltip
            key={alert.id}
            label={`${alert.title}. ${alert.detail}.`}
            align="right"
            block
          >
            <Link
              href={alert.href ?? "/owner/risk"}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 transition hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${
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
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[#111827]">
                  {alert.title}
                </p>
                <p className="mt-0.5 truncate text-[11px] font-normal text-slate-500">
                  {alert.detail}
                </p>
              </div>
              <p className="text-[11px] font-semibold text-slate-500">{alert.time}</p>
              <ArrowRight className="size-3.5 text-slate-400" />
            </Link>
          </Tooltip>
        ))}
      </div>
    </section>
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
        <Tooltip label={`Open the full ${title.toLowerCase()} page.`} align="right">
          <Link
            href={href}
            className="rounded-xl border border-[#e6ebf0] px-3 py-1.5 text-[11px] font-medium text-[#111827] shadow-[0_8px_16px_rgba(15,23,42,0.04)]"
          >
            View all
          </Link>
        </Tooltip>
      ) : action ? (
        <Tooltip label={`Change ${title.toLowerCase()} options.`} align="right">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-[#e6ebf0] px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-[0_8px_16px_rgba(15,23,42,0.04)]"
          >
            {action}
            <ChevronDown className="size-3.5" />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}

function LineChart({
  series,
  currency,
}: {
  series: ReturnType<typeof buildPortfolioSeries>;
  currency: string;
}) {
  const width = 620;
  const height = 235;
  const padding = { top: 18, right: 16, bottom: 30, left: 46 };
  const maxValue = Math.max(
    1,
    ...series.map((point) => point.outstanding),
    ...series.map((point) => point.collected),
  );
  const outstandingPoints = series.map((point, index) =>
    chartPoint(index, point.outstanding, series.length, maxValue, width, height, padding),
  );
  const collectedPoints = series.map((point, index) =>
    chartPoint(index, point.collected, series.length, maxValue, width, height, padding),
  );
  const labelStep = series.length > 14 ? 5 : series.length > 7 ? 2 : 1;

  return (
    <div className="mt-5">
      <div className="mb-2.5 ml-12 flex items-center gap-4 text-[11px] font-semibold text-slate-600">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full bg-[#119a6b]" />
          Outstanding
        </span>
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full border-t-2 border-dashed border-[#6bd1ad]" />
          Collected
        </span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[235px] w-full">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + (height - padding.top - padding.bottom) * ratio;
            const label = compactMoney(maxValue * (1 - ratio), currency);
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="#e8edf2"
                  strokeDasharray="4 5"
                />
                <text
                  x={padding.left - 14}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[11px] font-semibold"
                >
                  {label}
                </text>
              </g>
            );
          })}
          <path
            d={pointsToPath(outstandingPoints)}
            fill="none"
            stroke="#119a6b"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={pointsToPath(collectedPoints)}
            fill="none"
            stroke="#69cfa8"
            strokeWidth="3"
            strokeDasharray="7 8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {outstandingPoints.map((point, index) => (
            <circle
              key={`out-${index}`}
              cx={point.x}
              cy={point.y}
              r="4"
              fill="#119a6b"
            />
          ))}
          {collectedPoints.map((point, index) => (
            <circle
              key={`col-${index}`}
              cx={point.x}
              cy={point.y}
              r="4"
              fill="#69cfa8"
            />
          ))}
          {series.map((point, index) => {
            if (
              index !== 0 &&
              index !== series.length - 1 &&
              index % labelStep !== 0
            ) {
              return null;
            }
            const x = chartPoint(index, 0, series.length, maxValue, width, height, padding).x;
            return (
              <text
                key={point.label}
                x={x}
                y={height - 10}
                textAnchor="middle"
                className="fill-slate-500 text-[11px] font-semibold"
              >
                {point.label}
              </text>
            );
          })}
        </svg>
        {outstandingPoints.map((point, index) => (
          <ChartPointTooltip
            key={`out-tip-${index}`}
            x={(point.x / width) * 100}
            y={(point.y / height) * 100}
            label={`${series[index].tooltipLabel}: balance ${formatMoney(series[index].outstanding, currency)}, collected ${formatMoney(series[index].collected, currency)}, issued ${formatMoney(series[index].issued, currency)}`}
          />
        ))}
        {collectedPoints.map((point, index) => (
          <ChartPointTooltip
            key={`col-tip-${index}`}
            x={(point.x / width) * 100}
            y={(point.y / height) * 100}
            label={`${series[index].tooltipLabel}: collected ${formatMoney(series[index].collected, currency)}`}
          />
        ))}
      </div>
    </div>
  );
}

function PerformanceDonutChart({
  series,
  currency,
}: {
  series: ReturnType<typeof buildPortfolioSeries>;
  currency: string;
}) {
  const latest = series[series.length - 1];
  const items = [
    {
      label: "Loan Balance",
      value: latest?.outstanding ?? 0,
      color: "#003f35",
      help: "Current outstanding balance at the end of the selected period.",
    },
    {
      label: "Collected",
      value: sumBy(series, (point) => point.collected),
      color: "#16a06d",
      help: "Total collections recorded within the selected period.",
    },
    {
      label: "Issued",
      value: sumBy(series, (point) => point.issued),
      color: "#6fd0ad",
      help: "Principal issued within the selected period.",
    },
  ];
  const total = sumBy(items, (item) => item.value);
  let offset = 0;

  return (
    <div className="mt-4 grid items-center gap-4 sm:grid-cols-[156px_1fr]">
      <div className="relative mx-auto grid size-[156px] place-items-center">
        <svg viewBox="0 0 120 120" className="size-[156px] -rotate-90">
          <circle
            cx="60"
            cy="60"
            r="43"
            fill="none"
            stroke="#edf2f0"
            strokeWidth="18"
          />
          {items.map((item) => {
            const share = total > 0 ? (item.value / total) * 100 : 0;
            const dashOffset = -offset;
            offset += share;
            return (
              <circle
                key={item.label}
                cx="60"
                cy="60"
                r="43"
                fill="none"
                pathLength="100"
                stroke={item.color}
                strokeWidth="18"
                strokeDasharray={`${share} ${100 - share}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
              >
              </circle>
            );
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-lg font-bold tabular-nums text-[#070b18]">
              {compactMoney(total, currency)}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
              Total
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-2.5">
        {items.map((item) => (
          <Tooltip
            key={item.label}
            label={`${item.help} ${formatMoney(item.value, currency)}.`}
            align="right"
          >
            <span className="flex w-full items-center gap-2.5">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-600">
                {item.label}
              </span>
              <span className="text-xs font-medium tabular-nums text-[#111827]">
                {formatPlainMoney(item.value, currency)}
              </span>
              <span className="w-10 text-right text-xs font-semibold text-slate-500">
                {percent(item.value, total)}
              </span>
            </span>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function ChartPointTooltip({
  x,
  y,
  label,
}: {
  x: number;
  y: number;
  label: string;
}) {
  return (
    <span
      className="group/chart absolute z-10 size-5 -translate-x-1/2 -translate-y-1/2 cursor-help rounded-full"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" />
      <span className="pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 z-50 w-max max-w-[280px] -translate-x-1/2 rounded-lg border border-[#dfe8e4] bg-[#071611] px-2.5 py-1.5 text-[11px] font-medium leading-4 text-white opacity-0 shadow-[0_14px_32px_rgba(7,22,17,0.24)] transition duration-150 group-hover/chart:opacity-100">
        {label}
      </span>
    </span>
  );
}

function ActivityIcon({
  icon,
  tone,
}: {
  icon: ActivityItem["icon"];
  tone: ActivityItem["tone"];
}) {
  const toneClass = {
    green: "bg-emerald-50 text-[var(--forest-emerald)]",
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
    gold: "bg-orange-50 text-orange-600",
  }[tone];
  const Icon =
    icon === "check"
      ? CheckCircle2
      : icon === "loan"
        ? Folder
        : icon === "report"
          ? FileText
          : Banknote;
  return (
    <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${toneClass}`}>
      <Icon className="size-4" />
    </span>
  );
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
    amount: formatMoney(repayment.amount, currency),
    time: timeAgo(repayment.recordedAt),
    tone: "green" as const,
    icon: "check" as const,
    at: new Date(repayment.recordedAt),
  }));
  const loanItems = loans.slice(0, 8).map((loan) => ({
    id: `loan-${loan.id}`,
    title: `New loan issued to ${loan.borrowerName}`,
    meta: [loan.officerName, loan.loanTypeName].filter(Boolean).join(" · ") || "Loan issued",
    amount: formatMoney(loan.principal, currency),
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
}: {
  branches: OwnerBranch[];
  loans: OwnerLoan[];
  reports: OwnerReport[];
  pendingReports: OwnerReport[];
  currency: string;
  branchAnalytics: BranchCollectionPerformance[];
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
  const criticalBranches = branchAnalytics.filter(
    (branch) => branch.level === "critical",
  );
  const highRiskBranches = branchAnalytics.filter(
    (branch) => branch.level === "high_risk",
  );
  const followUpBranches = branchAnalytics.filter(
    (branch) => branch.level === "follow_up",
  );
  const collectionAttentionBranches = branchAnalytics.filter(
    (branch) => branch.level === "attention",
  );
  const alerts: AlertItem[] = [];

  if (criticalBranches.length > 0) {
    alerts.push({
      id: "branch-critical-exposure",
      title: `${criticalBranches.length} branches critical`,
      detail:
        "Daily close or overdue exposure needs urgent action.",
      time: "Today",
      tone: "red",
      href: "/owner/branches?view=attention",
    });
  }

  if (highRiskBranches.length > 0) {
    alerts.push({
      id: "branch-high-risk-exposure",
      title: `${highRiskBranches.length} branches high risk`,
      detail: "Borrowers with 4–7 uncovered repayment days.",
      time: "Today",
      tone: "gold",
      href: "/owner/branches?view=attention",
    });
  }

  if (followUpBranches.length > 0) {
    alerts.push({
      id: "branch-follow-up-exposure",
      title: `${followUpBranches.length} branches need follow-up`,
      detail: "Borrowers with 2–3 uncovered repayment days.",
      time: "Today",
      tone: "gold",
      href: "/owner/branches?view=attention",
    });
  }

  if (collectionAttentionBranches.length > 0) {
    alerts.push({
      id: "branch-collection-attention",
      title: `${collectionAttentionBranches.length} branches need repayment review`,
      detail: "Repayment rate is 70% or less over the last 7 days.",
      time: "Today",
      tone: "gold",
      href: "/owner/branches?view=attention",
    });
  }

  if (overdueLoans.length > 0) {
    alerts.push({
      id: "overdue-loans",
      title: `${overdueLoans.length} loans overdue`,
      detail: `Total overdue: ${formatMoney(overdueAmount, currency)}`,
      time: "Today",
      tone: "gold",
    });
  }

  if (pendingReports.length > 0) {
    alerts.push({
      id: "pending-approvals",
      title: "Manager approvals pending",
      detail: `${pendingReports.length} reports awaiting approval`,
      time: "Today",
      tone: "gold",
    });
  }

  if (returnedReports.length > 0) {
    alerts.push({
      id: "returned-reports",
      title: `${returnedReports.length} returned reports`,
      detail: "Reports returned to managers need follow-up",
      time: "Today",
      tone: "blue",
    });
  }

  if (varianceReports.length > 0) {
    alerts.push({
      id: "report-variance",
      title: `${varianceReports.length} reports have cash variance`,
      detail: "Review counted cash against expected closing cash",
      time: "Today",
      tone: "red",
    });
  }

  if (missingManagers.length > 0) {
    alerts.push({
      id: "missing-managers",
      title: "Branch manager assignment",
      detail: `${missingManagers.length} branches need an active manager`,
      time: "Today",
      tone: "blue",
      href: "/owner/branches?status=pending",
    });
  }

  return alerts;
}

function buildNotifications({
  alerts,
  pendingReports,
}: {
  alerts: AlertItem[];
  pendingReports: OwnerReport[];
}): OwnerNotificationItem[] {
  const approvalItems = pendingReports.slice(0, 5).map((report) => ({
    id: `report-${report.id}`,
    title: `Approve ${report.branchName}`,
    detail: `${report.reportNumber} is waiting for owner approval`,
    href: `/owner/reports?reportId=${encodeURIComponent(report.id)}`,
    tone: "green" as const,
    icon: "report" as const,
    time: timeAgo(report.generatedAt),
  }));
  const alertItems = alerts
    .filter((alert) => alert.id !== "pending-approvals")
    .map((alert) => ({
      id: `alert-${alert.id}`,
      title: alert.title,
      detail: alert.detail,
      href:
        alert.href ??
        (alert.id.startsWith("branch-")
          ? "/owner/branches?view=attention"
          : "/owner/risk"),
      tone: alert.tone,
      icon: alert.id.includes("loan") ? ("loan" as const) : ("alert" as const),
      time: alert.time,
    }));

  return [...approvalItems, ...alertItems].slice(0, 9);
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
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function compactMoney(value: number, currency: string) {
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return currency === "UGX" ? "0" : String(Math.round(value));
}

function formatPlainMoney(value: number, currency: string) {
  return formatMoney(value, currency).replace(`${currency} `, "");
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
  if (!loan.dueDate || loan.status === "CLOSED") return false;
  const due = new Date(loan.dueDate);
  due.setHours(23, 59, 59, 999);
  return due < new Date() && loan.balance > 0;
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
