"use client";

import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Folder,
  Search,
  Users,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app/app-shell";
import { AppBootSkeleton, SkeletonBlock } from "../../components/app/skeleton";
import {
  OwnerBorrower,
  OwnerBranch,
  OwnerLoan,
  OwnerReport,
  OwnerRepayment,
  formatMoney,
  formatNumber,
  ownerFetch,
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
};

type BranchPerformance = {
  branch: OwnerBranch;
  loanTotal: number;
  collectedToday: number;
  par: number;
};

export default function OwnerDashboardPage() {
  const state = useOwnerSession("/owner");
  const [branches, setBranches] = useState<OwnerBranch[]>([]);
  const [loans, setLoans] = useState<OwnerLoan[]>([]);
  const [borrowers, setBorrowers] = useState<OwnerBorrower[]>([]);
  const [repayments, setRepayments] = useState<OwnerRepayment[]>([]);
  const [reports, setReports] = useState<OwnerReport[]>([]);
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
      ]);
      setBranches(branchPayload.branches ?? []);
      setLoans(loanPayload.loans ?? []);
      setBorrowers(borrowerPayload.customers ?? []);
      setRepayments(repaymentPayload.repayments ?? []);
      setReports(reportPayload.reports ?? []);
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
  const todayRepayments = useMemo(
    () => repayments.filter((repayment) => isToday(repayment.recordedAt)),
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
  const submittedApplications = useMemo(
    () => loans.filter((loan) => loan.status === "SUBMITTED"),
    [loans],
  );
  const outstanding = sumBy(activeLoans, (loan) => loan.balance);
  const collectedToday = sumBy(todayRepayments, (item) => item.amount);
  const loanById = useMemo(
    () => new Map(loans.map((loan) => [loan.id, loan])),
    [loans],
  );
  const branchPerformance = useMemo(
    () => buildBranchPerformance(branches, loans, todayRepayments, loanById),
    [branches, loans, todayRepayments, loanById],
  );
  const series = useMemo(
    () => buildPortfolioSeries(activeLoans, repayments),
    [activeLoans, repayments],
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
      }),
    [activeLoans, branches, currency, pendingReports, reports],
  );
  const activityTotal =
    todayLoans.length +
    todayRepayments.length +
    todayBorrowers.length +
    submittedApplications.length;

  if (!state.ready || !state.session) return <AppBootSkeleton />;

  return (
    <AppShell
      session={state.session}
      workspace={state.workspace}
      user={state.user}
      branch={null}
    >
      <div className="mx-auto max-w-[1440px] space-y-3.5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 pt-1">
            <p className="text-xs font-semibold text-slate-600">
              {greeting()}, {firstName(state.user?.name ?? "Owner")} 👋
            </p>
            <h1 className="mt-0.5 text-[clamp(1.18rem,1.35vw,1.48rem)] font-extrabold leading-tight tracking-[-0.02em] text-[#070b18]">
              Here&apos;s what&apos;s happening today
            </h1>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <label className="flex h-9 min-w-[220px] max-w-[315px] flex-1 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
              <Search className="size-3.5 shrink-0 text-slate-400" />
              <input
                type="search"
                placeholder="Search anything..."
                className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-[var(--midnight-navy)] outline-none placeholder:text-slate-400"
              />
              <span className="hidden rounded-lg border border-[#e8edf2] px-2 py-0.5 text-[11px] font-bold text-slate-400 sm:inline">
                ⌘K
              </span>
            </label>
            <button
              type="button"
              className="relative grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)]"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
              {pendingReports.length > 0 ? (
                <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#18a76f] text-[10px] font-extrabold text-white">
                  {Math.min(pendingReports.length, 9)}
                </span>
              ) : null}
            </button>
            <Link
              href="/owner/reports"
              className="flex h-9 items-center gap-2 rounded-xl bg-[#003f35] px-3.5 text-xs font-extrabold text-white shadow-[0_10px_20px_rgba(0,63,53,0.2)]"
            >
              Export Report
              <ChevronDown className="size-4" />
            </Link>
          </div>
        </header>

        {error ? (
          <p className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <section className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-5">
          <TopStatCard
            icon={<WalletCards className="size-5" />}
            label="Outstanding Portfolio"
            value={formatMoney(outstanding, currency)}
            hint="vs yesterday"
            change="+ 8.6%"
            tone="green"
          />
          <TopStatCard
            icon={<Banknote className="size-5" />}
            label="Collected Today"
            value={formatMoney(collectedToday, currency)}
            hint="vs yesterday"
            change={`+ ${formatNumber(todayRepayments.length)}`}
            tone="green"
          />
          <TopStatCard
            icon={<Folder className="size-5" />}
            label="Active Loans"
            value={formatNumber(activeLoans.length)}
            hint="vs yesterday"
            change="0%"
            tone="blue"
          />
          <TopStatCard
            icon={<Users className="size-5" />}
            label="Borrowers"
            value={formatNumber(borrowers.length)}
            hint="vs yesterday"
            change={`+ ${formatNumber(todayBorrowers.length)}`}
            tone="violet"
          />
          <TopStatCard
            icon={<Clock3 className="size-5" />}
            label="Pending Reports"
            value={formatNumber(pendingReports.length)}
            hint="Requires approval"
            tone="gold"
          />
        </section>

        {loading ? (
          <OverviewSkeleton />
        ) : (
          <>
            <section className="grid gap-3 xl:grid-cols-[1.08fr_1fr_0.86fr]">
              <PortfolioPerformanceCard series={series} currency={currency} />
              <BranchPerformanceCard
                rows={branchPerformance}
                currency={currency}
              />
              <TodayActivityCard
                total={activityTotal}
                loansIssued={todayLoans.length}
                collections={todayRepayments.length}
                newBorrowers={todayBorrowers.length}
                applications={submittedApplications.length}
              />
            </section>

            <section className="grid gap-3 xl:grid-cols-[2fr_1fr]">
              <RecentActivityCard activities={activities} />
              <AlertsCard alerts={alerts} />
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
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  change?: string;
  tone: "green" | "blue" | "violet" | "gold";
}) {
  const toneClass = {
    green: "bg-[#e9f8ef] text-[#07885f]",
    blue: "bg-[#eaf4ff] text-[#2078dc]",
    violet: "bg-[#f2eaff] text-[#8b4ee8]",
    gold: "bg-[#fff3df] text-[#f28a17]",
  }[tone];

  return (
    <article className="flex min-h-[82px] min-w-0 items-center gap-2.5 rounded-[13px] border border-[#e6ebf0] bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneClass}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold text-slate-500">{label}</p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <p className="min-w-0 break-words text-[clamp(0.72rem,0.92vw,1rem)] font-extrabold leading-tight tabular-nums text-[#0b1220]">
            {value}
          </p>
          {change ? (
            <span className="rounded-md bg-[#e6f8ee] px-1.5 py-0.5 text-[9px] font-extrabold text-[#0c9b6d]">
              {change}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">{hint}</p>
      </div>
    </article>
  );
}

function PortfolioPerformanceCard({
  series,
  currency,
}: {
  series: ReturnType<typeof buildPortfolioSeries>;
  currency: string;
}) {
  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <PanelHeader title="Portfolio Performance" action="Last 7 days" />
      <LineChart series={series} currency={currency} />
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
      <div className="mt-3 grid grid-cols-[1fr_80px_86px_44px] gap-2 border-b border-[#edf1f5] pb-2 text-[10px] font-bold text-slate-500">
        <span>Branch</span>
        <span className="text-right">Loan ({currency})</span>
        <span className="text-right">Collected</span>
        <span className="text-right">PAR</span>
      </div>
      <div className="divide-y divide-[#edf1f5]">
        {rows.length === 0 ? (
          <EmptyState text="No branch activity yet." />
        ) : (
          rows.slice(0, 5).map((row) => (
            <div
              key={row.branch.id}
              className="grid grid-cols-[1fr_80px_86px_44px] items-center gap-2 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-[var(--forest-emerald)]">
                  <Building2 className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-extrabold text-[#101827]">
                    {row.branch.name}
                  </p>
                  <p className="truncate text-[10px] font-semibold text-slate-500">
                    {row.branch.address || "Branch location"}
                  </p>
                </div>
              </div>
              <p className="break-words text-right text-[11px] font-bold tabular-nums text-[#111827]">
                {formatPlainMoney(row.loanTotal, currency)}
              </p>
              <p className="break-words text-right text-[11px] font-bold tabular-nums text-[#111827]">
                {formatPlainMoney(row.collectedToday, currency)}
              </p>
              <span
                className={`justify-self-end rounded-lg px-1.5 py-0.5 text-[10px] font-extrabold ${
                  row.par > 5
                    ? "bg-orange-50 text-orange-600"
                    : row.par > 3
                      ? "bg-red-50 text-red-600"
                      : "bg-emerald-50 text-[var(--forest-emerald)]"
                }`}
              >
                {row.par.toFixed(1)}%
              </span>
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
  applications,
}: {
  total: number;
  loansIssued: number;
  collections: number;
  newBorrowers: number;
  applications: number;
}) {
  const items = [
    { label: "Loans Issued", value: loansIssued, color: "#003f35" },
    { label: "Collections", value: collections, color: "#10a06f" },
    { label: "New Borrowers", value: newBorrowers, color: "#9bd8ac" },
    { label: "Applications", value: applications, color: "#ccebd2" },
  ];
  const gradient = buildConicGradient(items, total);

  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <PanelHeader title="Today's Activity" href="/owner/reports" />
      <div className="mt-4 grid items-center gap-4 sm:grid-cols-[128px_1fr] xl:grid-cols-1 2xl:grid-cols-[128px_1fr]">
        <div className="relative mx-auto grid size-[128px] place-items-center rounded-full">
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: gradient }}
          />
          <div className="absolute inset-[18px] rounded-full bg-white" />
          <div className="relative text-center">
            <p className="text-2xl font-extrabold text-[#070b18]">
              {formatNumber(total)}
            </p>
            <p className="mt-0.5 text-xs font-bold text-slate-500">Total</p>
          </div>
        </div>
        <div className="space-y-2.5">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-2.5">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-600">
                {item.label}
              </span>
              <span className="text-xs font-extrabold tabular-nums text-[#111827]">
                {formatNumber(item.value)}
              </span>
              <span className="w-10 text-right text-xs font-semibold text-slate-500">
                {percent(item.value, total)}
              </span>
            </div>
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
          <EmptyState text="No recent activity yet." />
        ) : (
          activities.slice(0, 5).map((item) => (
            <div key={item.id} className="flex items-center gap-2.5 py-2">
              <ActivityIcon icon={item.icon} tone={item.tone} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-extrabold text-[#111827]">
                  {item.title}
                </p>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">
                  {item.meta}
                </p>
              </div>
              {item.amount ? (
                <p className="min-w-[94px] break-words text-right text-xs font-extrabold tabular-nums text-[var(--forest-emerald)]">
                  {item.amount}
                </p>
              ) : null}
              <p className="w-16 text-right text-[11px] font-semibold text-slate-500">
                {item.time}
              </p>
            </div>
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
      <div className="mt-3 divide-y divide-[#edf1f5]">
        {alerts.map((alert) => (
          <Link
            href="/owner/risk"
            key={alert.id}
            className="flex items-center gap-3 py-2.5"
          >
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-xl ${
                alert.tone === "red"
                  ? "bg-red-50 text-red-600"
                  : alert.tone === "gold"
                    ? "bg-orange-50 text-orange-600"
                    : "bg-blue-50 text-blue-600"
              }`}
            >
              {alert.tone === "blue" ? (
                <Clock3 className="size-4" />
              ) : (
                <AlertTriangle className="size-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-extrabold text-[#111827]">
                {alert.title}
              </p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">
                {alert.detail}
              </p>
            </div>
            <p className="text-[11px] font-semibold text-slate-500">{alert.time}</p>
            <ArrowRight className="size-3.5 text-slate-400" />
          </Link>
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
      <h2 className="text-[15px] font-extrabold text-[#0b1220]">{title}</h2>
      {href ? (
        <Link
          href={href}
          className="rounded-xl border border-[#e6ebf0] px-3 py-1.5 text-[11px] font-extrabold text-[#111827] shadow-[0_8px_16px_rgba(15,23,42,0.04)]"
        >
          View all
        </Link>
      ) : action ? (
        <button
          type="button"
          className="flex items-center gap-2 rounded-xl border border-[#e6ebf0] px-3 py-1.5 text-[11px] font-extrabold text-slate-600 shadow-[0_8px_16px_rgba(15,23,42,0.04)]"
        >
          {action}
          <ChevronDown className="size-3.5" />
        </button>
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
    </div>
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

function EmptyState({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm font-semibold text-slate-500">{text}</p>;
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
      const collectedToday = sumBy(
        todayRepayments.filter((repayment) => loanById.get(repayment.loanId)?.branchId === branch.id),
        (repayment) => repayment.amount,
      );
      return {
        branch,
        loanTotal: sumBy(branchLoans, (loan) => loan.principal),
        collectedToday,
        par:
          activeBranchLoans.length === 0
            ? 0
            : (overdue.length / activeBranchLoans.length) * 100,
      };
    })
    .sort((a, b) => b.loanTotal - a.loanTotal);
}

function buildPortfolioSeries(
  activeLoans: OwnerLoan[],
  repayments: OwnerRepayment[],
) {
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const outstanding = sumBy(
      activeLoans.filter((loan) => new Date(loan.createdAt) <= endOfDay(date)),
      (loan) => loan.balance,
    );
    const collected = sumBy(
      repayments.filter((repayment) => isSameDay(repayment.recordedAt, date)),
      (repayment) => repayment.amount,
    );
    return {
      label: new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
      }).format(date),
      outstanding,
      collected,
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
}: {
  branches: OwnerBranch[];
  loans: OwnerLoan[];
  reports: OwnerReport[];
  pendingReports: OwnerReport[];
  currency: string;
}): AlertItem[] {
  const today = new Date();
  const branchesReportedToday = new Set(
    reports
      .filter((report) => isSameDay(report.operationDate, today))
      .map((report) => report.branchId),
  );
  const branchesPendingClose = branches.filter(
    (branch) => !branchesReportedToday.has(branch.id),
  );
  const overdueLoans = loans.filter(isOverdueLoan);
  const overdueAmount = sumBy(overdueLoans, (loan) => loan.balance);
  const missingManagers = branches.filter((branch) => !branch.manager);
  return [
    {
      id: "branches-unreconciled",
      title: `${branchesPendingClose.length} branch${branchesPendingClose.length === 1 ? "" : "es"} has not reconciled today`,
      detail: "Reconciliation pending",
      time: "Today",
      tone: branchesPendingClose.length > 0 ? "red" : "blue",
    },
    {
      id: "overdue-loans",
      title: `${overdueLoans.length} loans overdue`,
      detail: `Total overdue: ${formatMoney(overdueAmount, currency)}`,
      time: "Today",
      tone: overdueLoans.length > 0 ? "gold" : "blue",
    },
    {
      id: "pending-approvals",
      title: "Manager approvals pending",
      detail: `${pendingReports.length} reports awaiting approval`,
      time: "Today",
      tone: pendingReports.length > 0 ? "gold" : "blue",
    },
    {
      id: "missing-managers",
      title: "Branch manager assignment",
      detail: `${missingManagers.length} branches need an active manager`,
      time: "Today",
      tone: missingManagers.length > 0 ? "blue" : "green",
    },
  ].map((item) => ({
    ...item,
    tone: item.tone === "green" ? "blue" : item.tone,
  })) as AlertItem[];
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

function isSameDay(value: string | Date, date: Date) {
  const parsed = typeof value === "string" ? new Date(value) : value;
  return (
    parsed.getFullYear() === date.getFullYear() &&
    parsed.getMonth() === date.getMonth() &&
    parsed.getDate() === date.getDate()
  );
}

function endOfDay(date: Date) {
  const next = new Date(date);
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
