"use client";

import {
  Banknote,
  Building2,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Filter,
  Grid2X2,
  List,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  UserCheck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../components/app/app-shell";
import { AppBootSkeleton } from "../../../components/app/skeleton";
import {
  FormError,
  PhoneField,
  PrimaryButton,
  TextField,
} from "../../../components/auth/form-controls";
import { RowActions } from "../../../components/app/row-actions";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../lib/api";
import type { RembehSession } from "../../../lib/auth-session";
import { formatInternationalPhone } from "../../../lib/phone";
import {
  ATTENTION_TABLE_TOOLTIP,
  attentionLabel,
  attentionReasonKind,
  attentionSeverityRank,
  buildBranchCollectionPerformance,
  repaymentBandLabel,
  type BranchCollectionPerformance,
} from "../branch-analytics";
import {
  OwnerHeader,
  Tooltip,
} from "../owner-header";
import {
  OwnerBorrower,
  OwnerBranch,
  OwnerBranchDailyStatus,
  OwnerLoan,
  OwnerRepayment,
  OwnerReport,
  OwnerStatus,
  authHeaders,
  formatDate,
  formatMoney,
  formatNumber,
  ownerFetch,
  previousDateLabel,
  sumBy,
  useOwnerSession,
} from "../owner-common";
import { Money } from "../../../components/app/money";
import { StepTimeline } from "../../../components/app/step-timeline";

const emptyBranchForm = {
  branchName: "",
  branchAddress: "",
  branchPhoneCountryCode: "+256",
  branchPhoneNationalNumber: "",
  gpsLatitude: "",
  gpsLongitude: "",
};

export default function OwnerBranchesPage() {
  return (
    <Suspense fallback={<AppBootSkeleton />}>
      <OwnerBranchesPageContent />
    </Suspense>
  );
}

function OwnerBranchesPageContent() {
  const state = useOwnerSession("/owner/branches");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [branches, setBranches] = useState<OwnerBranch[]>([]);
  const [loans, setLoans] = useState<OwnerLoan[]>([]);
  const [borrowers, setBorrowers] = useState<OwnerBorrower[]>([]);
  const [repayments, setRepayments] = useState<OwnerRepayment[]>([]);
  const [reports, setReports] = useState<OwnerReport[]>([]);
  const [dailyStatuses, setDailyStatuses] = useState<OwnerBranchDailyStatus[]>(
    [],
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [listMode, setListMode] = useState<"all" | "attention">("all");
  const [tableMode, setTableMode] = useState<"rows" | "compact">("rows");
  const [detailBranch, setDetailBranch] = useState<OwnerBranch | null>(null);
  const [attentionBranch, setAttentionBranch] = useState<OwnerBranch | null>(
    null,
  );
  const [inviteBranch, setInviteBranch] = useState<OwnerBranch | null>(null);
  const [createdBranch, setCreatedBranch] = useState<OwnerBranch | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [branchForm, setBranchForm] = useState(emptyBranchForm);
  const [loading, setLoading] = useState(true);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savingInvite, setSavingInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      const nextBranches = branchPayload.branches ?? [];
      setBranches(nextBranches);
      setLoans(loanPayload.loans ?? []);
      setBorrowers(borrowerPayload.customers ?? []);
      setRepayments(repaymentPayload.repayments ?? []);
      setReports(reportPayload.reports ?? []);
      setDailyStatuses(dailyStatusPayload.statuses ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load branches.",
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

  useEffect(() => {
    const view = searchParams.get("view");
    const status = searchParams.get("status");
    if (status === "pending" || status === "active" || status === "inactive") {
      setStatusFilter(status);
      setListMode("all");
      return;
    }
    if (view === "attention") {
      setListMode("attention");
      setStatusFilter("all");
    }
  }, [searchParams]);

  const openAttentionList = useCallback(() => {
    setListMode("attention");
    setStatusFilter("all");
    router.replace("/owner/branches?view=attention", { scroll: false });
  }, [router]);

  const openAllBranches = useCallback(() => {
    setListMode("all");
    router.replace("/owner/branches", { scroll: false });
  }, [router]);

  const filteredBranches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return branches.filter((branch) => {
      const status = branchStatus(branch);
      const region = branchRegion(branch);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesRegion = regionFilter === "all" || region === regionFilter;
      const matchesSearch =
        !q ||
        [
          branch.name,
          branch.address,
          branch.phone ?? "",
          branch.manager?.name ?? "",
          branch.manager?.email ?? "",
        ].some((value) => value.toLowerCase().includes(q));
      return matchesStatus && matchesRegion && matchesSearch;
    });
  }, [branches, regionFilter, search, statusFilter]);

  const assignedManagers = branches.filter((branch) =>
    activeManager(branch),
  ).length;
  const activeStaff = sumBy(branches, (branch) => branch.staffSummary.active);
  const sentReportCount = reports.length;
  const outstandingTotal = sumBy(loans, (loan) => loan.balance);
  const activeBranchCount = branches.filter(
    (branch) => branchStatus(branch) === "active",
  ).length;
  const pendingBranchCount = branches.filter(
    (branch) => branchStatus(branch) === "pending",
  ).length;
  const inactiveBranchCount = Math.max(
    0,
    branches.length - activeBranchCount - pendingBranchCount,
  );
  const regionOptions = useMemo(
    () => Array.from(new Set(branches.map(branchRegion))).sort(),
    [branches],
  );
  const filtersActive =
    search.trim().length > 0 || statusFilter !== "all" || regionFilter !== "all";
  const recentActivity = useMemo(
    () => buildBranchActivity(branches, loans, reports),
    [branches, loans, reports],
  );
  const collectionPerformance = useMemo(
    () =>
      buildBranchCollectionPerformance({
        branches,
        loans,
        repayments,
        dailyStatuses,
      }),
    [branches, dailyStatuses, loans, repayments],
  );
  const branchAttentionById = useMemo(
    () =>
      new Map(
        collectionPerformance.map((performance) => [
          performance.branchId,
          performance,
        ]),
      ),
    [collectionPerformance],
  );
  const branchesNeedingAttention = collectionPerformance.filter(
    (performance) => performance.level !== "healthy",
  );
  const branchesNeedingAttentionCount = branchesNeedingAttention.length;
  const criticalBranchCount = branchesNeedingAttention.filter(
    (performance) => performance.level === "critical",
  ).length;
  const highRiskBranchCount = branchesNeedingAttention.filter(
    (performance) => performance.level === "high_risk",
  ).length;
  const followUpBranchCount = branchesNeedingAttention.filter(
    (performance) => performance.level === "follow_up",
  ).length;

  const attentionBranches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const region = regionFilter;
    return [...branchesNeedingAttention]
      .filter((performance) => {
        const branch = branches.find((item) => item.id === performance.branchId);
        if (!branch) return false;
        if (region !== "all" && branchRegion(branch) !== region) return false;
        if (!q) return true;
        return [
          branch.name,
          branch.address,
          branch.phone ?? "",
          branch.manager?.name ?? "",
          branch.manager?.email ?? "",
          performance.reason,
          ...performance.reasons,
        ].some((value) => value.toLowerCase().includes(q));
      })
      .sort(
        (left, right) =>
          attentionSeverityRank(right.level) - attentionSeverityRank(left.level),
      );
  }, [branches, branchesNeedingAttention, regionFilter, search]);

  const displayedBranches =
    listMode === "attention"
      ? attentionBranches
          .map((performance) =>
            branches.find((branch) => branch.id === performance.branchId),
          )
          .filter((branch): branch is OwnerBranch => Boolean(branch))
      : filteredBranches;

  async function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.session) return;

    setSavingBranch(true);
    setFormError(null);
    setNotice(null);
    try {
      const branchPhone = branchForm.branchPhoneNationalNumber.trim()
        ? formatInternationalPhone(
            branchForm.branchPhoneCountryCode,
            branchForm.branchPhoneNationalNumber,
          )
        : undefined;

      if (branchForm.branchPhoneNationalNumber.trim() && !branchPhone) {
        throw new Error("Enter a valid branch phone number.");
      }

      const response = await fetch(`${apiBaseUrl}/branches`, {
        method: "POST",
        headers: {
          ...authHeaders(state.session),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchName: branchForm.branchName.trim(),
          branchAddress: branchForm.branchAddress.trim(),
          branchPhone,
          gpsLatitude: branchForm.gpsLatitude
            ? Number(branchForm.gpsLatitude)
            : undefined,
          gpsLongitude: branchForm.gpsLongitude
            ? Number(branchForm.gpsLongitude)
            : undefined,
        }),
      });
      const payload = await readApiJson<{
        branch?: OwnerBranch;
        message?: string | string[];
      }>(response);
      if (!response.ok) throw new Error(formatApiError(payload.message));

      setCreateOpen(false);
      setBranchForm(emptyBranchForm);
      setNotice(`${payload.branch?.name ?? "Branch"} created.`);
      await loadData();

      if (payload.branch) {
        setCreatedBranch(payload.branch);
        setInviteBranch(payload.branch);
      }
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : "Could not create branch.",
      );
    } finally {
      setSavingBranch(false);
    }
  }

  if (!state.ready || !state.session) return <AppBootSkeleton />;

  return (
    <AppShell
      session={state.session}
      workspace={state.workspace}
      user={state.user}
      branch={null}
    >
      <div className="mx-auto max-w-[1440px] space-y-4">
        <OwnerHeader
          eyebrow="Account Network"
          title="Branches"
          search={search}
          onSearchChange={setSearch}
          searchTooltip="Search branches, managers, locations and branch activity."
          actions={
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-3.5 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(0,135,95,0.22)]"
              onClick={() => {
                setFormError(null);
                setCreateOpen(true);
              }}
            >
              <Plus className="size-3.5" />
              Add Branch
            </button>
          }
        />

        {notice ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-[var(--forest-emerald)]">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <BranchStatCard
            icon={<Building2 className="size-5" />}
            label="Total Branches"
            value={formatNumber(branches.length)}
            detail={`${formatNumber(branchesNeedingAttentionCount)} need attention`}
            detailAction={
              branchesNeedingAttentionCount > 0
                ? {
                    label: "View branches that need attention",
                    onClick: openAttentionList,
                    active: listMode === "attention",
                  }
                : undefined
            }
            tone="green"
          />
          <BranchStatCard
            icon={<UserCheck className="size-5" />}
            label="Assigned Managers"
            value={formatNumber(assignedManagers)}
            detail="Active"
            tone="violet"
          />
          <BranchStatCard
            icon={<Users className="size-5" />}
            label="Active Staff"
            value={formatNumber(activeStaff)}
            detail="Across all branches"
            tone="blue"
          />
          <BranchStatCard
            icon={<ClipboardCheck className="size-5" />}
            label="Reports Sent"
            value={formatNumber(sentReportCount)}
            detail="Submitted reports"
            tone="gold"
          />
          <BranchStatCard
            icon={<WalletCards className="size-5" />}
            label="Total Outstanding"
            value={<Money value={outstandingTotal} currency={currency} />}
            detail="Across portfolio"
            tone="green"
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
          <section className="overflow-hidden rounded-[14px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.055)]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f5] px-4 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[15px] font-semibold text-[#0b1220]">
                    {listMode === "attention"
                      ? "Needs attention"
                      : "All Branches"}
                  </h2>
                  {listMode === "attention" ? (
                    <Tooltip label={ATTENTION_TABLE_TOOLTIP} align="left">
                      <span className="inline-flex size-6 cursor-help items-center justify-center rounded-full border border-[#e6ebf0] bg-[#f8faf9] text-slate-500 transition hover:border-emerald-200 hover:text-[var(--forest-emerald)]">
                        <CircleHelp className="size-3.5" />
                        <span className="sr-only">What this list means</span>
                      </span>
                    </Tooltip>
                  ) : null}
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {listMode === "attention"
                    ? "Branches with repayment, overdue, or daily-close issues"
                    : "Manage and monitor all your branches"}
                </p>
              </div>
              {listMode === "attention" ? (
                <button
                  type="button"
                  onClick={openAllBranches}
                  className="h-8 rounded-xl border border-[#e6ebf0] bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-[#f8faf9]"
                >
                  Show all branches
                </button>
              ) : null}
            </div>
            <div className="grid gap-2.5 border-b border-[#edf1f5] bg-white px-4 py-3 lg:grid-cols-[minmax(210px,1fr)_150px_150px_auto_auto]">
              <label className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
                <Search className="size-3.5 shrink-0 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent font-semibold text-[var(--midnight-navy)] outline-none placeholder:text-slate-400"
                  placeholder={
                    listMode === "attention"
                      ? "Search attention branches..."
                      : "Search branches..."
                  }
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                disabled={listMode === "attention"}
                className="h-9 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold text-[var(--midnight-navy)] outline-none shadow-[0_8px_18px_rgba(15,23,42,0.035)] disabled:cursor-not-allowed disabled:opacity-55"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>
              <select
                value={regionFilter}
                onChange={(event) => setRegionFilter(event.target.value)}
                className="h-9 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold text-[var(--midnight-navy)] outline-none shadow-[0_8px_18px_rgba(15,23,42,0.035)]"
              >
                <option value="all">All Regions</option>
                {regionOptions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="flex h-9 items-center justify-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.035)] disabled:cursor-not-allowed disabled:opacity-55"
                disabled={
                  listMode === "attention"
                    ? !search.trim() && regionFilter === "all"
                    : !filtersActive
                }
                onClick={() => {
                  setSearch("");
                  setRegionFilter("all");
                  if (listMode === "all") setStatusFilter("all");
                }}
              >
                <Filter className="size-3.5" />
                Clear filters
              </button>
              <div className="flex h-9 items-center rounded-xl border border-[#e6ebf0] bg-white p-1 shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
                <button
                  type="button"
                  className={`grid size-7 place-items-center rounded-lg ${
                    tableMode === "rows"
                      ? "bg-emerald-50 text-[var(--forest-emerald)]"
                      : "text-slate-500"
                  }`}
                  onClick={() => setTableMode("rows")}
                  aria-label="Rows view"
                >
                  <List className="size-3.5" />
                </button>
                <button
                  type="button"
                  className={`grid size-7 place-items-center rounded-lg ${
                    tableMode === "compact"
                      ? "bg-emerald-50 text-[var(--forest-emerald)]"
                      : "text-slate-500"
                  }`}
                  onClick={() => setTableMode("compact")}
                  aria-label="Compact view"
                >
                  <Grid2X2 className="size-3.5" />
                </button>
              </div>
            </div>

            {listMode === "attention" ? (
              <div className="hidden grid-cols-[1.35fr_1.2fr_72px_88px_88px_42px] gap-3 border-b border-[#edf1f5] bg-[#f8faf9] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500 xl:grid">
                <span>Branch</span>
                <span>Why it needs attention</span>
                <Tooltip label="Share of expected repayments received in the last 7 days. Exact rate is in the panel.">
                  <span className="cursor-help text-center">Repayment %</span>
                </Tooltip>
                <Tooltip label="Borrowers missing 2 or more repayment days.">
                  <span className="cursor-help text-center">Overdue</span>
                </Tooltip>
                <span className="text-center">Severity</span>
                <span className="text-right">Open</span>
              </div>
            ) : (
              <div className="hidden grid-cols-[1.4fr_1.05fr_1fr_64px_66px_104px_72px_42px] gap-3 border-b border-[#edf1f5] bg-[#f8faf9] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500 xl:grid">
                <span>Branch</span>
                <span>Location</span>
                <span>Manager</span>
                <span className="text-center">Staff</span>
                <span className="text-center">Loans</span>
                <span className="text-right">Outstanding</span>
                <span className="text-center">Status</span>
                <span className="text-right">Actions</span>
              </div>
            )}

            <div className="divide-y divide-[#edf1f5]">
              {loading ? (
                <BranchSkeleton />
              ) : displayedBranches.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <Building2 className="mx-auto size-7 text-[var(--forest-emerald)]" />
                  <h3 className="mt-3 text-base font-bold text-[var(--midnight-navy)]">
                    {listMode === "attention"
                      ? "No branches need attention"
                      : "No branches found"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {listMode === "attention"
                      ? "Repayment, overdue, and daily close look clear."
                      : "Adjust the filters or add a branch."}
                  </p>
                </div>
              ) : listMode === "attention" ? (
                attentionBranches.map((performance) => {
                  const branch = branches.find(
                    (item) => item.id === performance.branchId,
                  );
                  if (!branch) return null;
                  return (
                    <AttentionBranchRow
                      key={branch.id}
                      branch={branch}
                      performance={performance}
                      compact={tableMode === "compact"}
                      onOpenAttention={() => setAttentionBranch(branch)}
                    />
                  );
                })
              ) : (
                filteredBranches.map((branch) => (
                  <BranchRow
                    key={branch.id}
                    branch={branch}
                    metrics={branchMetrics(branch, loans, borrowers, reports)}
                    performance={branchAttentionById.get(branch.id) ?? null}
                    currency={currency}
                    compact={tableMode === "compact"}
                    onInvite={() => {
                      setCreatedBranch(null);
                      setInviteBranch(branch);
                    }}
                    onOpenDetails={() => setDetailBranch(branch)}
                  />
                ))
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#edf1f5] px-4 py-3 text-xs font-semibold text-slate-500">
              <p>
                Showing {formatNumber(displayedBranches.length)} of{" "}
                {formatNumber(
                  listMode === "attention"
                    ? branchesNeedingAttentionCount
                    : branches.length,
                )}{" "}
                branch
                {(listMode === "attention"
                  ? branchesNeedingAttentionCount
                  : branches.length) === 1
                  ? ""
                  : "es"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-xl border border-[#edf1f5] text-slate-400"
                  aria-label="Previous page"
                  disabled
                >
                  <ChevronRight className="size-3.5 rotate-180" />
                </button>
                <span className="grid size-8 place-items-center rounded-xl bg-[var(--forest-emerald)] text-xs font-semibold text-white">
                  1
                </span>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-xl border border-[#edf1f5] text-slate-400"
                  aria-label="Next page"
                  disabled
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          </section>

          <aside className="space-y-3">
            <BranchOverviewCard
              active={activeBranchCount}
              inactive={inactiveBranchCount}
              pending={pendingBranchCount}
              total={branches.length}
              selectedStatus={listMode === "all" ? statusFilter : "all"}
              onSelectStatus={(status) => {
                setListMode("all");
                setStatusFilter(status);
                if (status === "all") {
                  router.replace("/owner/branches", { scroll: false });
                } else {
                  router.replace(`/owner/branches?status=${status}`, {
                    scroll: false,
                  });
                }
              }}
            />
            <QuickActionsCard
              onAddBranch={() => {
                setFormError(null);
                setCreateOpen(true);
              }}
              onAssignManager={() => {
                const target =
                  branches.find((branch) => !activeManager(branch)) ??
                  branches[0] ??
                  null;
                if (target) {
                  setCreatedBranch(null);
                  setInviteBranch(target);
                }
              }}
            />
            <RecentBranchActivityCard activities={recentActivity} />
          </aside>
        </section>
      </div>

      {createOpen && state.session ? (
        <SidePanel
          title="Add Branch"
          description="Create the location first, then assign the branch manager."
          onClose={() => setCreateOpen(false)}
        >
          <form className="space-y-4" onSubmit={createBranch}>
            <TextField
              label="Branch name"
              value={branchForm.branchName}
              onChange={(value) =>
                setBranchForm((current) => ({
                  ...current,
                  branchName: value,
                }))
              }
              placeholder="Central Branch"
              required
            />
            <TextField
              label="Address"
              value={branchForm.branchAddress}
              onChange={(value) =>
                setBranchForm((current) => ({
                  ...current,
                  branchAddress: value,
                }))
              }
              placeholder="Street, town"
              required
            />
            <PhoneField
              label="Branch phone"
              countryCode={branchForm.branchPhoneCountryCode}
              nationalNumber={branchForm.branchPhoneNationalNumber}
              onCountryCodeChange={(value) =>
                setBranchForm((current) => ({
                  ...current,
                  branchPhoneCountryCode: value,
                }))
              }
              onNationalNumberChange={(value) =>
                setBranchForm((current) => ({
                  ...current,
                  branchPhoneNationalNumber: value,
                }))
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="GPS latitude"
                value={branchForm.gpsLatitude}
                onChange={(value) =>
                  setBranchForm((current) => ({
                    ...current,
                    gpsLatitude: value,
                  }))
                }
                placeholder="Optional"
              />
              <TextField
                label="GPS longitude"
                value={branchForm.gpsLongitude}
                onChange={(value) =>
                  setBranchForm((current) => ({
                    ...current,
                    gpsLongitude: value,
                  }))
                }
                placeholder="Optional"
              />
            </div>
            <FormError error={formError} />
            <PrimaryButton type="submit" loading={savingBranch}>
              Create Branch
            </PrimaryButton>
          </form>
        </SidePanel>
      ) : null}

      {inviteBranch && state.session ? (
        <InviteManagerPanel
          session={state.session}
          branch={inviteBranch}
          justCreated={createdBranch?.id === inviteBranch.id}
          saving={savingInvite}
          setSaving={setSavingInvite}
          onClose={() => {
            setInviteBranch(null);
            setCreatedBranch(null);
          }}
          onSaved={() => {
            setNotice("Manager invitation sent.");
            setInviteBranch(null);
            setCreatedBranch(null);
            void loadData();
          }}
        />
      ) : null}

      {detailBranch ? (
        <BranchDetailDrawer
          branch={detailBranch}
          metrics={branchMetrics(detailBranch, loans, borrowers, reports)}
          performance={branchAttentionById.get(detailBranch.id) ?? null}
          currency={currency}
          onClose={() => setDetailBranch(null)}
          onInvite={() => {
            setDetailBranch(null);
            setInviteBranch(detailBranch);
          }}
          onOpenAttention={
            (branchAttentionById.get(detailBranch.id)?.level ?? "healthy") !==
            "healthy"
              ? () => {
                  setDetailBranch(null);
                  setAttentionBranch(detailBranch);
                }
              : undefined
          }
        />
      ) : null}

      {attentionBranch ? (
        <AttentionBranchDrawer
          branch={attentionBranch}
          performance={
            branchAttentionById.get(attentionBranch.id) ?? null
          }
          currency={currency}
          onClose={() => setAttentionBranch(null)}
        />
      ) : null}
    </AppShell>
  );
}

function AttentionBranchRow({
  branch,
  performance,
  compact,
  onOpenAttention,
}: {
  branch: OwnerBranch;
  performance: BranchCollectionPerformance;
  compact: boolean;
  onOpenAttention: () => void;
}) {
  const manager = activeManager(branch);
  const primaryReason = performance.reasons[0] ?? performance.reason;
  const extraReasons = Math.max(0, performance.reasons.length - 1);

  return (
    <article
      className={`grid cursor-pointer gap-3 px-4 ${compact ? "py-2.5" : "py-4"} text-left transition-colors hover:bg-[#eef7f2] xl:grid-cols-[1.35fr_1.2fr_72px_88px_88px_42px] xl:items-center`}
      onClick={onOpenAttention}
    >
      <div className="flex min-w-0 items-start justify-between gap-3 xl:contents">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-xl ${
              performance.level === "critical"
                ? "bg-red-50 text-red-600"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            <Building2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[#111827]">
              {branch.name}
            </p>
            <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">
              {manager?.name ?? "No manager"} · {branchRegion(branch)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 xl:hidden">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              performance.level === "critical"
                ? "bg-red-50 text-red-600"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {attentionLabel(performance.level)}
          </span>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-xl border border-[#edf1f5] text-slate-500"
            aria-label={`Open attention for ${branch.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenAttention();
            }}
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      <BranchField label="Why">
        <p className="line-clamp-2 text-xs font-semibold leading-5 text-[#111827]">
          {primaryReason}
        </p>
        {extraReasons > 0 ? (
          <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
            +{extraReasons} more
          </p>
        ) : null}
      </BranchField>

      <div className="grid grid-cols-2 gap-2 xl:contents">
        <BranchField label="Repayment">
          <p className="text-xs font-semibold tabular-nums text-[#111827] xl:text-center">
            {repaymentBandLabel(
              performance.collectionLevel !== "healthy"
                ? performance.averageRate
                : null,
            )}
          </p>
        </BranchField>
        <BranchField label="Overdue">
          <p className="text-xs font-semibold tabular-nums text-[#111827] xl:text-center">
            {formatNumber(performance.overdueExposure.totalFlagged)}
          </p>
        </BranchField>
      </div>

      <div className="hidden xl:block xl:justify-self-center">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${
            performance.level === "critical"
              ? "bg-red-50 text-red-600"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {attentionLabel(performance.level)}
        </span>
      </div>
      <button
        type="button"
        className="hidden size-8 place-items-center justify-self-end rounded-xl border border-[#edf1f5] text-slate-500 transition hover:bg-white hover:text-[var(--forest-emerald)] xl:grid"
        aria-label={`Open attention for ${branch.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenAttention();
        }}
      >
        <ChevronRight className="size-3.5" />
      </button>
    </article>
  );
}

function BranchRow({
  branch,
  metrics,
  performance,
  currency,
  compact,
  onInvite,
  onOpenDetails,
}: {
  branch: OwnerBranch;
  metrics: BranchMetrics;
  performance: BranchCollectionPerformance | null;
  currency: string;
  compact: boolean;
  onInvite: () => void;
  onOpenDetails: () => void;
}) {
  const manager = activeManager(branch);
  const invitedManager =
    branch.manager && branch.manager.inviteStatus !== "ACTIVE"
      ? branch.manager
      : null;
  const status = branchStatus(branch);
  const statusLabel =
    status === "active"
      ? "Active"
      : status === "pending"
        ? "Pending"
        : "Inactive";
  const managerName = manager?.name ?? invitedManager?.name ?? "No manager";
  const managerEmail =
    manager?.email ?? invitedManager?.email ?? "Assign manager";

  return (
    <article
      className={`grid gap-3 px-4 ${compact ? "py-2.5" : "py-4"} text-left transition-colors hover:bg-[#eef7f2] xl:grid-cols-[1.4fr_1.05fr_1fr_64px_66px_104px_72px_42px] xl:items-center`}
      onClick={onOpenDetails}
    >
      <div className="flex min-w-0 items-start justify-between gap-3 xl:contents">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetails();
          }}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[var(--forest-emerald)]">
            <Building2 className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate text-xs font-semibold text-[#111827]">
                {branch.name}
              </span>
              {manager ? (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-[var(--forest-emerald)]">
                  Managed
                </span>
              ) : null}
              {performance && performance.level !== "healthy" ? (
                <Tooltip label={performance.reason} align="left">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                      performance.level === "critical"
                        ? "bg-red-50 text-red-600"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {attentionLabel(performance.level)}
                  </span>
                </Tooltip>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">
              {branchRegion(branch)}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2 xl:hidden">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              status === "active"
                ? "bg-emerald-50 text-[var(--forest-emerald)]"
                : status === "pending"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-slate-100 text-slate-600"
            }`}
          >
            {statusLabel}
          </span>
          <RowActions
            label={`Branch actions for ${branch.name}`}
            items={[
              { label: "View details", onSelect: onOpenDetails },
              {
                label: manager ? "Invite manager" : "Assign manager",
                onSelect: onInvite,
              },
              {
                label: "View reports",
                href: `/owner/reports?branchId=${branch.id}`,
              },
            ]}
          />
        </div>
      </div>

      <BranchField label="Location">
        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
          <MapPin className="size-3.5 shrink-0 text-[var(--forest-emerald)]" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-[#111827]">
              {branch.address}
            </p>
            <p className="truncate text-[10px] font-semibold text-slate-500 xl:hidden">
              {branchRegion(branch)}
            </p>
          </div>
        </div>
      </BranchField>

      <BranchField label="Manager">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
            {initials(managerName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[#111827]">
              {managerName}
            </p>
            <p className="truncate text-[10px] font-semibold text-slate-500">
              {managerEmail}
            </p>
          </div>
        </div>
      </BranchField>

      <div className="grid grid-cols-3 gap-2 xl:contents">
        <BranchField label="Staff">
          <p className="text-xs font-semibold tabular-nums text-[#111827] xl:text-center">
            {metrics.staffActive}/{metrics.staffTotal}
          </p>
        </BranchField>
        <BranchField label="Loans">
          <p className="text-xs font-semibold tabular-nums text-[#111827] xl:text-center">
            {formatNumber(metrics.activeLoans)}
          </p>
        </BranchField>
        <BranchField label="Outstanding">
          <p className="break-words text-xs font-semibold tabular-nums text-[var(--forest-emerald)] xl:text-right">
            <Money value={metrics.outstanding} currency={currency} />
          </p>
        </BranchField>
      </div>

      <div className="hidden xl:block xl:justify-self-center">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${
            status === "active"
              ? "bg-emerald-50 text-[var(--forest-emerald)]"
              : status === "pending"
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {statusLabel}
        </span>
      </div>
      <div className="hidden xl:block">
        <RowActions
          label={`Branch actions for ${branch.name}`}
          items={[
            { label: "View details", onSelect: onOpenDetails },
            {
              label: manager ? "Invite manager" : "Assign manager",
              onSelect: onInvite,
            },
            {
              label: "View reports",
              href: `/owner/reports?branchId=${branch.id}`,
            },
          ]}
        />
      </div>
    </article>
  );
}

function BranchField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400 xl:hidden">
        {label}
      </p>
      {children}
    </div>
  );
}

function BranchStatCard({
  icon,
  label,
  value,
  detail,
  tone,
  change,
  detailAction,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone: "green" | "violet" | "blue" | "gold";
  change?: string;
  detailAction?: {
    label: string;
    onClick: () => void;
    active?: boolean;
  };
}) {
  const toneClass = {
    green: "bg-emerald-50 text-[var(--forest-emerald)]",
    violet: "bg-violet-50 text-violet-600",
    blue: "bg-sky-50 text-sky-600",
    gold: "bg-orange-50 text-orange-600",
  }[tone];

  return (
    <article className="flex min-h-[96px] min-w-0 items-center gap-3 rounded-[14px] border border-[#e6ebf0] bg-white px-4 py-3.5 shadow-[0_12px_26px_rgba(15,23,42,0.055)]">
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${toneClass}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-bold text-slate-500">{label}</p>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
          <p className="break-words text-[clamp(0.82rem,1vw,1.08rem)] font-semibold leading-tight tabular-nums text-[#111827]">
            {value}
          </p>
          {change ? (
            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--forest-emerald)]">
              {change}
            </span>
          ) : null}
        </div>
        {detailAction ? (
          <button
            type="button"
            onClick={detailAction.onClick}
            aria-label={detailAction.label}
            className={`mt-1 text-left text-[11px] font-semibold underline-offset-2 transition hover:underline ${
              detailAction.active
                ? "text-amber-700"
                : "text-slate-500 hover:text-[var(--forest-emerald)]"
            }`}
          >
            {detail}
          </button>
        ) : (
          <p className="mt-1 text-[11px] font-semibold text-slate-500">{detail}</p>
        )}
      </div>
    </article>
  );
}

function BranchOverviewCard({
  active,
  inactive,
  pending,
  total,
  selectedStatus,
  onSelectStatus,
}: {
  active: number;
  inactive: number;
  pending: number;
  total: number;
  selectedStatus: string;
  onSelectStatus: (status: "all" | "active" | "inactive" | "pending") => void;
}) {
  const gradient = branchOverviewGradient(active, inactive, pending, total);
  const rows = [
    {
      key: "active" as const,
      label: "Active",
      value: active,
      color: "#059669",
    },
    {
      key: "inactive" as const,
      label: "Inactive",
      value: inactive,
      color: "#f97316",
    },
    {
      key: "pending" as const,
      label: "Pending",
      value: pending,
      color: "#cbd5e1",
    },
  ];

  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.055)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-[#0b1220]">
          Branch Overview
        </h2>
        <p className="text-[11px] font-semibold text-slate-500">Live</p>
      </div>
      <div className="mt-5 grid items-center gap-5 sm:grid-cols-[138px_1fr] xl:grid-cols-1 2xl:grid-cols-[138px_1fr]">
        <button
          type="button"
          onClick={() => onSelectStatus("all")}
          className={`relative mx-auto grid size-[138px] place-items-center rounded-full transition ${
            selectedStatus === "all"
              ? "ring-2 ring-[var(--forest-emerald)] ring-offset-2"
              : "hover:opacity-95"
          }`}
          aria-label="Show all branches"
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: gradient }}
          />
          <div className="absolute inset-[20px] rounded-full bg-white" />
          <div className="relative text-center">
            <p className="text-2xl font-semibold text-[#070b18]">
              {formatNumber(total)}
            </p>
            <p className="mt-0.5 text-[11px] font-bold text-slate-500">
              Total Branches
            </p>
          </div>
        </button>
        <div className="space-y-2">
          {rows.map((row) => {
            const selected = selectedStatus === row.key;
            return (
              <button
                key={row.key}
                type="button"
                onClick={() =>
                  onSelectStatus(selected ? "all" : row.key)
                }
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition ${
                  selected
                    ? "bg-emerald-50"
                    : "hover:bg-[#f8faf9]"
                }`}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span className="min-w-0 flex-1 text-xs font-semibold text-slate-600">
                  {row.label}
                </span>
                <span className="text-xs font-semibold tabular-nums text-[#111827]">
                  {formatNumber(row.value)}
                </span>
                <span className="w-12 text-right text-xs font-semibold text-slate-500">
                  {percent(row.value, total)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function QuickActionsCard({
  onAddBranch,
  onAssignManager,
}: {
  onAddBranch: () => void;
  onAssignManager: () => void;
}) {
  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.055)]">
      <h2 className="text-[15px] font-semibold text-[#0b1220]">
        Quick Actions
      </h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-[#edf1f5]">
        <QuickActionButton
          icon={<ClipboardCheck className="size-4" />}
          title="Add New Branch"
          detail="Create a new branch"
          tone="green"
          onClick={onAddBranch}
        />
        <QuickActionButton
          icon={<UserCheck className="size-4" />}
          title="Assign Manager"
          detail="Assign manager to branch"
          tone="green"
          onClick={onAssignManager}
        />
        <QuickActionLink
          icon={<SlidersHorizontal className="size-4" />}
          title="Branch Performance"
          detail="View branch analytics"
          tone="blue"
          href="/owner/portfolio"
        />
        <QuickActionLink
          icon={<ClipboardCheck className="size-4" />}
          title="Send Report"
          detail="Review submitted reports"
          tone="gold"
          href="/owner/reports"
        />
      </div>
    </section>
  );
}

function QuickActionButton({
  icon,
  title,
  detail,
  tone,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  tone: "green" | "blue" | "gold";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 border-b border-[#edf1f5] px-3 py-3 text-left last:border-b-0 transition-colors hover:bg-[#eef7f2]"
      onClick={onClick}
    >
      <QuickActionIcon tone={tone}>{icon}</QuickActionIcon>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-[#111827]">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">
          {detail}
        </span>
      </span>
      <ChevronRight className="size-4 text-slate-400" />
    </button>
  );
}

function QuickActionLink({
  icon,
  title,
  detail,
  tone,
  href,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  tone: "green" | "blue" | "gold";
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-[#edf1f5] px-3 py-3 text-left last:border-b-0 transition-colors hover:bg-[#eef7f2]"
    >
      <QuickActionIcon tone={tone}>{icon}</QuickActionIcon>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-[#111827]">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">
          {detail}
        </span>
      </span>
      <ChevronRight className="size-4 text-slate-400" />
    </Link>
  );
}

function QuickActionIcon({
  tone,
  children,
}: {
  tone: "green" | "blue" | "gold";
  children: ReactNode;
}) {
  const className = {
    green: "bg-emerald-50 text-[var(--forest-emerald)]",
    blue: "bg-sky-50 text-sky-600",
    gold: "bg-orange-50 text-orange-600",
  }[tone];
  return (
    <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${className}`}>
      {children}
    </span>
  );
}

function RecentBranchActivityCard({
  activities,
}: {
  activities: BranchActivity[];
}) {
  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.055)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-[#0b1220]">
          Recent Activity
        </h2>
        <Link
          href="/owner/reports"
          className="text-xs font-semibold text-[var(--forest-emerald)]"
        >
          View all
        </Link>
      </div>
      <div className="mt-3">
        <StepTimeline
          items={activities.slice(0, 5).map((activity) => ({
            id: activity.id,
            title: activity.title,
            detail: activity.detail,
            tone:
              activity.tone === "gold"
                ? "amber"
                : activity.tone === "blue"
                  ? "blue"
                  : "green",
            icon:
              activity.icon === "report" ? (
                <ClipboardCheck />
              ) : activity.icon === "loan" ? (
                <Banknote />
              ) : (
                <Users />
              ),
            meta: activity.time,
            href: activity.href,
          }))}
          empty={
            <p className="py-8 text-center text-sm font-semibold text-slate-500">
              No recent activity yet.
            </p>
          }
        />
      </div>
    </section>
  );
}

function InviteManagerPanel({
  session,
  branch,
  justCreated,
  saving,
  setSaving,
  onClose,
  onSaved,
}: {
  session: RembehSession;
  branch: OwnerBranch;
  justCreated: boolean;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ displayName: "", email: "" });
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/branches/${branch.id}/staff-invitations`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roleName: "Branch Manager",
            displayName: form.displayName.trim(),
            email: form.email.trim(),
          }),
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) throw new Error(formatApiError(payload.message));
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not send invitation.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel
      title="Assign Manager"
      description={
        justCreated
          ? `${branch.name} is ready. Invite the manager for this branch.`
          : `Invite a branch manager for ${branch.name}.`
      }
      onClose={onClose}
    >
      <div className="mb-4 border border-[var(--line)] bg-[var(--soft-mist)] p-3">
        <p className="text-sm font-bold text-[var(--midnight-navy)]">
          {branch.name}
        </p>
        <p className="mt-1 text-xs text-slate-500">{branch.address}</p>
      </div>
      <form className="space-y-4" onSubmit={submit}>
        <TextField
          label="Manager name"
          value={form.displayName}
          onChange={(value) =>
            setForm((current) => ({ ...current, displayName: value }))
          }
          required
        />
        <TextField
          label="Email"
          type="email"
          value={form.email}
          onChange={(value) =>
            setForm((current) => ({ ...current, email: value }))
          }
          required
        />
        <FormError error={error} />
        <PrimaryButton type="submit" loading={saving}>
          Send Manager Invitation
        </PrimaryButton>
      </form>
    </SidePanel>
  );
}

function BranchDetailDrawer({
  branch,
  metrics,
  performance,
  currency,
  onClose,
  onInvite,
  onOpenAttention,
}: {
  branch: OwnerBranch;
  metrics: BranchMetrics;
  performance: BranchCollectionPerformance | null;
  currency: string;
  onClose: () => void;
  onInvite: () => void;
  onOpenAttention?: () => void;
}) {
  const staff = branch.staff ?? [];
  const manager = activeManager(branch);
  const invitedManager =
    branch.manager && branch.manager.inviteStatus !== "ACTIVE"
      ? branch.manager
      : null;
  const status = branchStatus(branch);
  const statusLabel =
    status === "active"
      ? "Active"
      : status === "pending"
        ? "Pending"
        : "Inactive";
  const needsAttention = Boolean(
    performance && performance.level !== "healthy",
  );
  const recentReports = metrics.reports.slice(0, 3);

  return (
    <Sheet onClose={onClose} label="Close branch details">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#0b936b]">
            Branch
          </p>
          <h2 className="mt-1.5 truncate text-xl font-bold tracking-[-0.03em] text-[#0b1224]">
            {branch.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#e4e9ef] text-[#0b1224]"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-[#e5ebf0] bg-[#fbfcfd] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
              status === "active"
                ? "bg-[#daf5e8] text-[#087f5d]"
                : status === "pending"
                  ? "bg-[#fff4df] text-[#b56b00]"
                  : "bg-slate-100 text-slate-600"
            }`}
          >
            {statusLabel}
          </span>
          {needsAttention && onOpenAttention ? (
            <button
              type="button"
              onClick={onOpenAttention}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition hover:opacity-90 ${
                performance?.level === "critical"
                  ? "bg-red-50 text-red-600"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {attentionLabel(performance!.level)}
              <ChevronRight className="size-3" />
            </button>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <MiniMetric
            label="Outstanding"
            value={<Money value={metrics.outstanding} currency={currency} />}
          />
          <MiniMetric
            label="Borrowers"
            value={formatNumber(metrics.borrowers)}
          />
          <MiniMetric
            label="Staff"
            value={`${metrics.staffActive}/${metrics.staffTotal}`}
          />
          <MiniMetric
            label="Reports"
            value={formatNumber(metrics.reports.length)}
          />
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <InfoLine label="Region" value={branchRegion(branch)} />
        <InfoLine label="Address" value={branch.address || "-"} />
        <InfoLine label="Phone" value={branch.phone || "-"} />
        <InfoLine label="Opened" value={formatDate(branch.createdAt)} />
      </div>

      <section className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Manager
          </p>
          <button
            type="button"
            onClick={onInvite}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#0b936b] transition hover:bg-emerald-50"
          >
            <Mail className="size-3" />
            Invite
          </button>
        </div>
        {manager ? (
          <div className="rounded-2xl border border-[#e5ebf0] bg-white p-3">
            <p className="text-sm font-semibold text-[#0b1224]">{manager.name}</p>
            <p className="mt-1 truncate text-xs text-slate-500">
              {manager.email}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Phone className="size-3.5 text-[#0b936b]" />
              {manager.phone ?? "Phone after acceptance"}
            </p>
          </div>
        ) : invitedManager ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
            <p className="text-sm font-semibold text-[#0b1224]">
              {invitedManager.name}
            </p>
            <p className="mt-1 truncate text-xs text-slate-500">
              {invitedManager.email}
            </p>
            <p className="mt-2 text-xs font-medium text-amber-700">
              Waiting for acceptance
            </p>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-[#e5ebf0] px-3 py-4 text-center text-xs text-slate-500">
            No manager assigned
          </p>
        )}
      </section>

      <section className="mt-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          Team · {formatNumber(staff.length)}
        </p>
        {staff.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#e5ebf0] px-3 py-4 text-center text-xs text-slate-500">
            No staff yet
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#e5ebf0] bg-white">
            {staff.slice(0, 4).map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 border-b border-[#edf1f5] px-3 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[#0b1224]">
                    {member.name}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {member.roleName}
                  </p>
                </div>
                <OwnerStatus value={member.inviteStatus} />
              </div>
            ))}
            {staff.length > 4 ? (
              <p className="bg-[#fbfcfd] px-3 py-2 text-[11px] font-medium text-slate-500">
                +{staff.length - 4} more
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section className="mt-4 pb-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Recent reports
          </p>
          {metrics.reports.length > 0 ? (
            <Link
              href="/owner/reports"
              className="text-[11px] font-semibold text-[#0b936b] hover:underline"
            >
              View all
            </Link>
          ) : null}
        </div>
        {recentReports.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#e5ebf0] px-3 py-4 text-center text-xs text-slate-500">
            No reports yet
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#e5ebf0] bg-white">
            {recentReports.map((report) => (
              <Link
                key={report.id}
                href={`/owner/reports?reportId=${report.id}`}
                className="flex items-center justify-between gap-3 border-b border-[#edf1f5] px-3 py-2.5 transition hover:bg-[#fbfcfd] last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[#0b1224]">
                    {report.reportNumber}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {formatDate(report.operationDate)}
                  </p>
                </div>
                <OwnerStatus value={report.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </Sheet>
  );
}

function AttentionBranchDrawer({
  branch,
  performance,
  currency,
  onClose,
}: {
  branch: OwnerBranch;
  performance: BranchCollectionPerformance | null;
  currency: string;
  onClose: () => void;
}) {
  if (!performance || performance.level === "healthy") {
    return (
      <Sheet onClose={onClose} label="Close attention panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#0b936b]">
              Attention
            </p>
            <h2 className="mt-1.5 text-xl font-bold tracking-[-0.03em] text-[#0b1224]">
              {branch.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-xl border border-[#e4e9ef] text-[#0b1224]"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-4 text-center text-sm font-medium text-[#087f5d]">
          Nothing needs attention right now.
        </p>
      </Sheet>
    );
  }

  const critical = performance.level === "critical";
  const showCollections =
    performance.collectionLevel !== "healthy" ||
    performance.dailyRates.some((day) => day.expectedCount > 0);
  const showDailyClose =
    performance.dailyCompliance.missingReconciliation ||
    performance.dailyCompliance.missingReport ||
    performance.dailyCompliance.date != null;
  const showOverdue = performance.overdueExposure.totalFlagged > 0;
  const ratedDays = performance.dailyRates.filter((day) => day.rate != null);
  const weakDays = performance.dailyRates.filter(
    (day) => day.rate != null && day.rate <= 70,
  );
  const totalExpected = performance.dailyRates.reduce(
    (sum, day) => sum + day.expectedCount,
    0,
  );
  const totalCollected = performance.dailyRates.reduce(
    (sum, day) => sum + day.collectedCount,
    0,
  );

  return (
    <Sheet onClose={onClose} label="Close attention panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#0b936b]">
            Needs attention
          </p>
          <h2 className="mt-1.5 truncate text-xl font-bold tracking-[-0.03em] text-[#0b1224]">
            {branch.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#e4e9ef] text-[#0b1224]"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div
        className={`mt-4 rounded-2xl border p-3 ${
          critical
            ? "border-red-100 bg-red-50/80"
            : "border-amber-100 bg-amber-50/80"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              critical ? "bg-white text-red-600" : "bg-white text-amber-700"
            }`}
          >
            {attentionLabel(performance.level)}
          </span>
          {performance.averageRate != null ? (
            <p className="text-xs font-semibold text-slate-600">
              Avg {performance.averageRate}%
            </p>
          ) : null}
        </div>
        <div className="mt-3 space-y-2">
          {performance.reasons.map((reason) => {
            const meta = attentionReasonKind(reason);
            return (
              <div
                key={reason}
                className="rounded-xl border border-white/80 bg-white/90 px-3 py-2.5"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                  {meta.title}
                </p>
                <p className="mt-1 text-xs font-medium leading-5 text-[#0b1224]">
                  {reason}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {showCollections ? (
        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Repayments · 7 days
            </p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                performance.collectionLevel === "critical"
                  ? "bg-red-50 text-red-600"
                  : performance.collectionLevel === "attention"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-[#087f5d]"
              }`}
            >
              {attentionLabel(performance.collectionLevel)}
            </span>
          </div>

          <div className="mb-2 grid grid-cols-3 gap-1.5">
            <MiniMetric
              label="Expected"
              value={formatNumber(totalExpected)}
            />
            <MiniMetric
              label="Collected"
              value={formatNumber(totalCollected)}
            />
            <MiniMetric
              label="Weak days"
              value={formatNumber(weakDays.length)}
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#e5ebf0] bg-white">
            <div className="grid grid-cols-[1fr_52px_52px_48px] gap-2 border-b border-[#edf1f5] bg-[#fbfcfd] px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-400">
              <span>Day</span>
              <span className="text-right">Exp</span>
              <span className="text-right">Got</span>
              <span className="text-right">Rate</span>
            </div>
            {performance.dailyRates.map((day) => {
              const soft =
                day.rate != null && day.rate <= 70 && day.rate >= 50;
              const hard = day.rate != null && day.rate < 50;
              return (
                <div
                  key={day.date}
                  className="grid grid-cols-[1fr_52px_52px_48px] gap-2 border-b border-[#edf1f5] px-3 py-2 text-xs last:border-b-0"
                >
                  <span className="font-medium text-[#0b1224]">
                    {shortDayLabel(day.date)}
                  </span>
                  <span className="text-right tabular-nums text-slate-600">
                    {formatNumber(day.expectedCount)}
                  </span>
                  <span className="text-right tabular-nums text-slate-600">
                    {formatNumber(day.collectedCount)}
                  </span>
                  <span
                    className={`text-right font-semibold tabular-nums ${
                      hard
                        ? "text-red-600"
                        : soft
                          ? "text-amber-700"
                          : day.rate == null
                            ? "text-slate-400"
                            : "text-[#087f5d]"
                    }`}
                  >
                    {day.rate == null ? "—" : `${day.rate}%`}
                  </span>
                </div>
              );
            })}
            {ratedDays.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-slate-500">
                No expected repayments in this window.
              </p>
            ) : null}
          </div>
          {performance.collectionLevel !== "healthy" ? (
            <p className="mt-2 text-[11px] leading-4 text-slate-500">
              Under 70% needs review. Under 50% is critical.
            </p>
          ) : null}
        </section>
      ) : null}

      {showDailyClose ? (
        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Daily close
            </p>
            {performance.dailyCompliance.date ? (
              <p className="text-[11px] font-medium text-slate-500">
                {performance.dailyCompliance.date}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DailyCheckPill
              label="Reconciliation"
              ok={performance.dailyCompliance.reconciled}
              okText="Closed"
              alertText="Open"
            />
            <DailyCheckPill
              label="Report"
              ok={performance.dailyCompliance.reportSubmitted}
              okText="Submitted"
              alertText="Missing"
            />
          </div>
          <div className="mt-2 space-y-1.5">
            <InfoLine
              label="Operation"
              value={formatStatusLabel(
                performance.dailyCompliance.operationStatus,
              )}
            />
            <InfoLine
              label="Report status"
              value={formatStatusLabel(
                performance.dailyCompliance.reportStatus,
              )}
            />
          </div>
          {(performance.dailyCompliance.missingReconciliation ||
            performance.dailyCompliance.missingReport) && (
            <p className="mt-2 text-[11px] leading-4 text-slate-500">
              {performance.dailyCompliance.reason}
            </p>
          )}
        </section>
      ) : null}

      {showOverdue ? (
        <section className="mt-4 pb-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Overdue records
            </p>
            <p className="text-[11px] font-semibold text-slate-500">
              {formatNumber(performance.overdueExposure.totalFlagged)}
            </p>
          </div>
          <div className="mb-2 grid grid-cols-3 gap-1.5">
            <RiskMiniStat
              label="2–3 days"
              value={performance.overdueExposure.followUpCount}
              tone="gold"
            />
            <RiskMiniStat
              label="4–7 days"
              value={performance.overdueExposure.highRiskCount}
              tone="gold"
            />
            <RiskMiniStat
              label="8+ days"
              value={performance.overdueExposure.criticalCount}
              tone="red"
            />
          </div>
          <p className="mb-2 text-[11px] text-slate-500">
            Highest exposure {performance.overdueExposure.maxOverdueDays} day
            {performance.overdueExposure.maxOverdueDays === 1 ? "" : "s"}
          </p>
          <div className="overflow-hidden rounded-2xl border border-[#e5ebf0] bg-white">
            {performance.overdueExposure.borrowers.map((borrower) => {
              const short = Math.max(
                0,
                borrower.expectedAmount - borrower.paidAmount,
              );
              return (
                <div
                  key={`${borrower.customerId}-${borrower.loanId}`}
                  className="border-b border-[#edf1f5] px-3 py-2.5 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[#0b1224]">
                        {borrower.borrowerName}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {borrower.phone}
                        {borrower.nationalId
                          ? ` · ${borrower.nationalId}`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                        borrower.status === "critical"
                          ? "bg-red-50 text-red-600"
                          : borrower.status === "high_risk"
                            ? "bg-orange-50 text-orange-700"
                            : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {attentionLabel(borrower.status)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <p className="text-slate-400">Days</p>
                      <p className="mt-0.5 font-semibold tabular-nums text-[#0b1224]">
                        {borrower.overdueDays}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Installment</p>
                      <p className="mt-0.5 font-semibold tabular-nums text-[#0b1224]">
                        <Money
                          value={borrower.installmentAmount}
                          currency={currency}
                        />
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Short</p>
                      <p className="mt-0.5 font-semibold tabular-nums text-[#0b1224]">
                        <Money value={short} currency={currency} />
                      </p>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      Expected{" "}
                      <Money
                        value={borrower.expectedAmount}
                        currency={currency}
                      />
                    </span>
                    <span className="inline-flex items-center gap-1">
                      Paid{" "}
                      <Money value={borrower.paidAmount} currency={currency} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </Sheet>
  );
}

function shortDayLabel(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-UG", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatStatusLabel(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Sheet({
  onClose,
  label,
  children,
}: {
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(8,15,31,0.36)] backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={label}
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-[400px] flex-col overflow-y-auto bg-white p-4 shadow-[-18px_0_44px_rgba(15,23,42,0.18)]">
        {children}
      </aside>
    </div>
  );
}

function SidePanel({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(8,15,31,0.36)] backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={`Close ${title}`}
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-[400px] flex-col bg-white shadow-[-18px_0_44px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-3 border-b border-[#e5ebf0] px-4 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold tracking-[-0.02em] text-[#0b1224]">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-xs font-medium text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#e4e9ef] text-[#0b1224]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#edf1f4] bg-white px-2.5 py-2">
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums text-[#0b1224]">
        {value}
      </p>
    </div>
  );
}

function RiskMiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "gold" | "red";
}) {
  const toneClass =
    tone === "red"
      ? "border-red-100 bg-red-50 text-red-700"
      : "border-amber-100 bg-amber-50 text-amber-700";
  return (
    <div className={`rounded-xl border px-2 py-1.5 ${toneClass}`}>
      <p className="text-[9px] font-semibold">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums">
        {formatNumber(value)}
      </p>
    </div>
  );
}

function DailyCheckPill({
  label,
  ok,
  okText,
  alertText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  alertText: string;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        ok
          ? "border-emerald-100 bg-emerald-50 text-[#087f5d]"
          : "border-red-100 bg-red-50 text-red-700"
      }`}
    >
      <p className="text-[10px] font-semibold">{label}</p>
      <p className="mt-1 text-sm font-bold">{ok ? okText : alertText}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#edf1f4] bg-white px-3 py-2.5 text-xs">
      <span className="font-medium text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-[#0b1224]">
        {value}
      </span>
    </div>
  );
}

function BranchSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="h-20 animate-pulse bg-[linear-gradient(90deg,#eef3f0,#f8faf9,#eef3f0)] bg-[length:200%_100%]"
        />
      ))}
    </div>
  );
}

type BranchActivity = {
  id: string;
  title: string;
  detail: string;
  time: string;
  href: string;
  tone: "green" | "blue" | "gold";
  icon: "report" | "loan" | "staff";
  at: Date;
};

function activeManager(branch: OwnerBranch) {
  const manager = branch.staff?.find(
    (member) =>
      member.roleName === "Branch Manager" && member.inviteStatus === "ACTIVE",
  );
  if (manager) return manager;
  return branch.manager?.inviteStatus === "ACTIVE" ? branch.manager : null;
}

function branchStatus(branch: OwnerBranch) {
  if (activeManager(branch)) return "active";
  if (branch.manager) return "pending";
  return "inactive";
}

function branchRegion(branch: OwnerBranch) {
  const parts = branch.address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.at(-1) ?? "All regions";
}

function percent(value: number, total: number) {
  if (total <= 0) return "(0%)";
  return `(${Math.round((value / total) * 100)}%)`;
}

function branchOverviewGradient(
  active: number,
  inactive: number,
  pending: number,
  total: number,
) {
  if (total <= 0) return "conic-gradient(#e8eef2 0deg 360deg)";
  const items = [
    { value: active, color: "#059669" },
    { value: inactive, color: "#f97316" },
    { value: pending, color: "#cbd5e1" },
  ];
  let start = 0;
  const stops = items
    .filter((item) => item.value > 0)
    .map((item) => {
      const end = start + (item.value / total) * 360;
      const stop = `${item.color} ${start}deg ${end}deg`;
      start = end;
      return stop;
    });
  return `conic-gradient(${stops.join(", ")})`;
}

function buildBranchActivity(
  branches: OwnerBranch[],
  loans: OwnerLoan[],
  reports: OwnerReport[],
): BranchActivity[] {
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const reportItems = reports.slice(0, 8).map((report) => ({
    id: `report-${report.id}`,
    title: `Report sent from ${report.branchName}`,
    detail: report.reportNumber,
    time: timeAgo(report.generatedAt),
    href: `/owner/reports?reportId=${report.id}`,
    tone: "green" as const,
    icon: "report" as const,
    at: new Date(report.generatedAt),
  }));
  const loanItems = loans.slice(0, 8).map((loan) => {
    const branch = branchById.get(loan.branchId);
    return {
      id: `loan-${loan.id}`,
      title: `Loans updated in ${branch?.name ?? "branch"}`,
      detail: `${formatMoney(loan.principal, loan.currency)} principal`,
      time: timeAgo(loan.disbursedAt ?? loan.createdAt),
      href: "/owner/portfolio",
      tone: "gold" as const,
      icon: "loan" as const,
      at: new Date(loan.disbursedAt ?? loan.createdAt),
    };
  });
  const staffItems = branches.flatMap((branch) =>
    (branch.staff ?? []).slice(0, 3).map((member) => ({
      id: `staff-${member.id}`,
      title: `Staff added in ${branch.name}`,
      detail: `${member.name} · ${member.roleName}`,
      time: timeAgo(member.invitedAt ?? branch.createdAt),
      href: `/owner/branches?branchId=${branch.id}`,
      tone: "blue" as const,
      icon: "staff" as const,
      at: new Date(member.invitedAt ?? branch.createdAt),
    })),
  );
  return [...reportItems, ...loanItems, ...staffItems].sort(
    (a, b) => b.at.getTime() - a.at.getTime(),
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function timeAgo(value: string | null | undefined) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes} mins ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1d ago" : `${days}d ago`;
}

type BranchMetrics = {
  staffActive: number;
  staffTotal: number;
  activeLoans: number;
  outstanding: number;
  borrowers: number;
  reports: OwnerReport[];
  latestReport: OwnerReport | null;
};

function branchMetrics(
  branch: OwnerBranch,
  loans: OwnerLoan[],
  borrowers: OwnerBorrower[],
  reports: OwnerReport[],
): BranchMetrics {
  const branchLoans = loans.filter((loan) => loan.branchId === branch.id);
  const activeLoans = branchLoans.filter((loan) => loan.status !== "CLOSED");
  const branchReports = reports.filter(
    (report) => report.branchId === branch.id,
  );
  return {
    staffActive: branch.staffSummary.active,
    staffTotal: branch.staffSummary.total,
    activeLoans: activeLoans.length,
    outstanding: sumBy(activeLoans, (loan) => loan.balance),
    borrowers: borrowers.filter((borrower) => borrower.branchId === branch.id)
      .length,
    reports: branchReports,
    latestReport: branchReports[0] ?? null,
  };
}
