"use client";

import {
  Banknote,
  Bell,
  Building2,
  ChevronDown,
  ChevronRight,
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
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  OwnerBorrower,
  OwnerBranch,
  OwnerLoan,
  OwnerReport,
  OwnerStatus,
  authHeaders,
  formatDate,
  formatMoney,
  formatNumber,
  ownerFetch,
  sumBy,
  useOwnerSession,
} from "../owner-common";

const emptyBranchForm = {
  branchName: "",
  branchAddress: "",
  branchPhoneCountryCode: "+256",
  branchPhoneNationalNumber: "",
  gpsLatitude: "",
  gpsLongitude: "",
};

export default function OwnerBranchesPage() {
  const state = useOwnerSession("/owner/branches");
  const [branches, setBranches] = useState<OwnerBranch[]>([]);
  const [loans, setLoans] = useState<OwnerLoan[]>([]);
  const [borrowers, setBorrowers] = useState<OwnerBorrower[]>([]);
  const [reports, setReports] = useState<OwnerReport[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [tableMode, setTableMode] = useState<"rows" | "compact">("rows");
  const [detailBranch, setDetailBranch] = useState<OwnerBranch | null>(null);
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
      const [branchPayload, loanPayload, borrowerPayload, reportPayload] =
        await Promise.all([
          ownerFetch<{ branches?: OwnerBranch[] }>(state.session, "/branches"),
          ownerFetch<{ loans?: OwnerLoan[] }>(state.session, "/loans"),
          ownerFetch<{ customers?: OwnerBorrower[] }>(
            state.session,
            "/customers",
          ),
          ownerFetch<{ reports?: OwnerReport[] }>(
            state.session,
            "/operations/reports",
          ),
        ]);
      const nextBranches = branchPayload.branches ?? [];
      setBranches(nextBranches);
      setLoans(loanPayload.loans ?? []);
      setBorrowers(borrowerPayload.customers ?? []);
      setReports(reportPayload.reports ?? []);
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
  const recentActivity = useMemo(
    () => buildBranchActivity(branches, loans, reports),
    [branches, loans, reports],
  );

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
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 pt-1">
            <p className="text-xs font-extrabold text-[var(--forest-emerald)]">
              Account Network
            </p>
            <h1 className="mt-0.5 text-[clamp(1.28rem,1.45vw,1.65rem)] font-extrabold leading-tight tracking-[-0.02em] text-[#070b18]">
              Branches
            </h1>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <label className="flex h-9 min-w-[220px] max-w-[330px] flex-1 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
              <Search className="size-3.5 shrink-0 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
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
              {pendingBranchCount > 0 ? (
                <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#18a76f] text-[10px] font-extrabold text-white">
                  {Math.min(pendingBranchCount, 9)}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-3.5 text-xs font-extrabold text-white shadow-[0_10px_20px_rgba(0,135,95,0.22)]"
              onClick={() => {
                setFormError(null);
                setCreateOpen(true);
              }}
            >
              <Plus className="size-3.5" />
              Add Branch
            </button>
          </div>
        </header>

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
            detail="Across all regions"
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
            value={formatMoney(outstandingTotal, currency)}
            detail="Across portfolio"
            tone="green"
            change="+ 8.6%"
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
          <section className="overflow-hidden rounded-[14px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.055)]">
            <div className="border-b border-[#edf1f5] px-4 py-4">
              <h2 className="text-[15px] font-extrabold text-[#0b1220]">
                All Branches
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Manage and monitor all your branches
              </p>
            </div>
            <div className="grid gap-2.5 border-b border-[#edf1f5] bg-white px-4 py-3 lg:grid-cols-[minmax(210px,1fr)_150px_150px_auto_auto]">
              <label className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
                <Search className="size-3.5 shrink-0 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent font-semibold text-[var(--midnight-navy)] outline-none placeholder:text-slate-400"
                  placeholder="Search branches..."
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-9 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-extrabold text-[var(--midnight-navy)] outline-none shadow-[0_8px_18px_rgba(15,23,42,0.035)]"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>
              <select
                value={regionFilter}
                onChange={(event) => setRegionFilter(event.target.value)}
                className="h-9 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-extrabold text-[var(--midnight-navy)] outline-none shadow-[0_8px_18px_rgba(15,23,42,0.035)]"
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
                className="flex h-9 items-center justify-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-extrabold text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.035)]"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setRegionFilter("all");
                }}
              >
                <Filter className="size-3.5" />
                More filters
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

            <div className="hidden grid-cols-[1.4fr_1.05fr_1fr_64px_66px_104px_72px_42px] gap-3 border-b border-[#edf1f5] bg-[#f8faf9] px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.04em] text-slate-500 xl:grid">
              <span>Branch</span>
              <span>Location</span>
              <span>Manager</span>
              <span className="text-center">Staff</span>
              <span className="text-center">Loans</span>
              <span className="text-right">Outstanding</span>
              <span className="text-center">Status</span>
              <span className="text-right">Actions</span>
            </div>

            <div className="divide-y divide-[#edf1f5]">
              {loading ? (
                <BranchSkeleton />
              ) : filteredBranches.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <Building2 className="mx-auto size-7 text-[var(--forest-emerald)]" />
                  <h3 className="mt-3 text-base font-bold text-[var(--midnight-navy)]">
                    No branches found
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Adjust the filters or add a branch.
                  </p>
                </div>
              ) : (
                filteredBranches.map((branch) => (
                  <BranchRow
                    key={branch.id}
                    branch={branch}
                    metrics={branchMetrics(branch, loans, borrowers, reports)}
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
                Showing {formatNumber(filteredBranches.length)} of{" "}
                {formatNumber(branches.length)} branch
                {branches.length === 1 ? "" : "es"}
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
                <span className="grid size-8 place-items-center rounded-xl bg-[var(--forest-emerald)] text-xs font-extrabold text-white">
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
          currency={currency}
          onClose={() => setDetailBranch(null)}
          onInvite={() => {
            setDetailBranch(null);
            setInviteBranch(detailBranch);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function BranchRow({
  branch,
  metrics,
  currency,
  compact,
  onInvite,
  onOpenDetails,
}: {
  branch: OwnerBranch;
  metrics: BranchMetrics;
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

  return (
    <article
      className={`grid gap-3 px-4 ${compact ? "py-2.5" : "py-4"} text-left transition hover:bg-[#fbfdfc] xl:grid-cols-[1.4fr_1.05fr_1fr_64px_66px_104px_72px_42px] xl:items-center`}
      onClick={onOpenDetails}
    >
      <button
        type="button"
        className="flex min-w-0 items-center gap-3 text-left"
        onClick={onOpenDetails}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[var(--forest-emerald)]">
          <Building2 className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-extrabold text-[#111827]">
              {branch.name}
            </span>
            {manager ? (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-extrabold text-[var(--forest-emerald)]">
                Managed
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">
            Branch Code: {branch.id.slice(0, 6).toUpperCase()}
          </span>
        </span>
      </button>

      <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
        <MapPin className="size-3.5 shrink-0 text-[var(--forest-emerald)]" />
        <div className="min-w-0">
          <p className="truncate font-bold text-[#111827]">{branch.address}</p>
          <p className="truncate text-[10px] font-semibold text-slate-500">
            {branchRegion(branch)}
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-extrabold text-slate-600">
            {initials(manager?.name ?? invitedManager?.name ?? "No Manager")}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-extrabold text-[#111827]">
              {manager?.name ?? invitedManager?.name ?? "No manager"}
            </p>
            <p className="truncate text-[10px] font-semibold text-slate-500">
              {manager?.email ?? invitedManager?.email ?? "Assign manager"}
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs font-extrabold tabular-nums text-[#111827] xl:text-center">
        {metrics.staffActive}/{metrics.staffTotal}
      </p>
      <p className="text-xs font-extrabold tabular-nums text-[#111827] xl:text-center">
        {formatNumber(metrics.activeLoans)}
      </p>
      <p className="break-words text-xs font-extrabold tabular-nums text-[var(--forest-emerald)] xl:text-right">
        {formatMoney(metrics.outstanding, currency)}
      </p>
      <div className="xl:justify-self-center">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
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
      <RowActions
        label={`Branch actions for ${branch.name}`}
        items={[
          { label: "View details", onSelect: onOpenDetails },
          { label: manager ? "Invite manager" : "Assign manager", onSelect: onInvite },
          { label: "View reports", href: `/owner/reports?branchId=${branch.id}` },
        ]}
      />
    </article>
  );
}

function BranchStatCard({
  icon,
  label,
  value,
  detail,
  tone,
  change,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "green" | "violet" | "blue" | "gold";
  change?: string;
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
          <p className="break-words text-[clamp(0.82rem,1vw,1.08rem)] font-extrabold leading-tight tabular-nums text-[#111827]">
            {value}
          </p>
          {change ? (
            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-extrabold text-[var(--forest-emerald)]">
              {change}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">{detail}</p>
      </div>
    </article>
  );
}

function BranchOverviewCard({
  active,
  inactive,
  pending,
  total,
}: {
  active: number;
  inactive: number;
  pending: number;
  total: number;
}) {
  const gradient = branchOverviewGradient(active, inactive, pending, total);
  const rows = [
    { label: "Active", value: active, color: "#059669" },
    { label: "Inactive", value: inactive, color: "#f97316" },
    { label: "Pending", value: pending, color: "#cbd5e1" },
  ];

  return (
    <section className="rounded-[14px] border border-[#e6ebf0] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.055)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-extrabold text-[#0b1220]">
          Branch Overview
        </h2>
        <button
          type="button"
          className="flex h-8 items-center gap-2 rounded-xl border border-[#e6ebf0] px-3 text-[11px] font-extrabold text-slate-600"
        >
          This month
          <ChevronDown className="size-3.5" />
        </button>
      </div>
      <div className="mt-5 grid items-center gap-5 sm:grid-cols-[138px_1fr] xl:grid-cols-1 2xl:grid-cols-[138px_1fr]">
        <div className="relative mx-auto grid size-[138px] place-items-center rounded-full">
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: gradient }}
          />
          <div className="absolute inset-[20px] rounded-full bg-white" />
          <div className="relative text-center">
            <p className="text-2xl font-extrabold text-[#070b18]">
              {formatNumber(total)}
            </p>
            <p className="mt-0.5 text-[11px] font-bold text-slate-500">
              Total Branches
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              <span className="min-w-0 flex-1 text-xs font-semibold text-slate-600">
                {row.label}
              </span>
              <span className="text-xs font-extrabold tabular-nums text-[#111827]">
                {formatNumber(row.value)}
              </span>
              <span className="w-12 text-right text-xs font-semibold text-slate-500">
                {percent(row.value, total)}
              </span>
            </div>
          ))}
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
      <h2 className="text-[15px] font-extrabold text-[#0b1220]">
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
      className="flex w-full items-center gap-3 border-b border-[#edf1f5] px-3 py-3 text-left last:border-b-0 hover:bg-[#fbfdfc]"
      onClick={onClick}
    >
      <QuickActionIcon tone={tone}>{icon}</QuickActionIcon>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-extrabold text-[#111827]">
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
      className="flex items-center gap-3 border-b border-[#edf1f5] px-3 py-3 text-left last:border-b-0 hover:bg-[#fbfdfc]"
    >
      <QuickActionIcon tone={tone}>{icon}</QuickActionIcon>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-extrabold text-[#111827]">
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
        <h2 className="text-[15px] font-extrabold text-[#0b1220]">
          Recent Activity
        </h2>
        <Link
          href="/owner/reports"
          className="text-xs font-extrabold text-[var(--forest-emerald)]"
        >
          View all
        </Link>
      </div>
      <div className="mt-3 divide-y divide-[#edf1f5]">
        {activities.length === 0 ? (
          <p className="py-8 text-center text-sm font-semibold text-slate-500">
            No recent activity yet.
          </p>
        ) : (
          activities.slice(0, 3).map((activity) => (
            <Link
              key={activity.id}
              href={activity.href}
              className="flex items-center gap-3 py-3"
            >
              <QuickActionIcon tone={activity.tone}>
                {activity.icon === "report" ? (
                  <ClipboardCheck className="size-4" />
                ) : activity.icon === "loan" ? (
                  <Banknote className="size-4" />
                ) : (
                  <Users className="size-4" />
                )}
              </QuickActionIcon>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-extrabold text-[#111827]">
                  {activity.title}
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">
                  {activity.detail}
                </span>
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                {activity.time}
              </span>
            </Link>
          ))
        )}
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
  currency,
  onClose,
  onInvite,
}: {
  branch: OwnerBranch;
  metrics: BranchMetrics;
  currency: string;
  onClose: () => void;
  onInvite: () => void;
}) {
  const staff = branch.staff ?? [];
  const manager = activeManager(branch);
  const invitedManager =
    branch.manager && branch.manager.inviteStatus !== "ACTIVE"
      ? branch.manager
      : null;
  return (
    <SidePanel
      title={branch.name}
      description="Branch profile, team, portfolio and submitted reports."
      onClose={onClose}
      wide
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DetailStat
            icon={<Users className="size-4" />}
            label="Staff"
            value={`${metrics.staffActive}/${metrics.staffTotal}`}
          />
          <DetailStat
            icon={<WalletCards className="size-4" />}
            label="Outstanding"
            value={formatMoney(metrics.outstanding, currency)}
          />
          <DetailStat
            icon={<Building2 className="size-4" />}
            label="Borrowers"
            value={formatNumber(metrics.borrowers)}
          />
          <DetailStat
            icon={<ClipboardCheck className="size-4" />}
            label="Reports"
            value={formatNumber(metrics.reports.length)}
          />
        </div>

        <section className="border border-[var(--line)] bg-white">
          <PanelHeader title="Branch information" />
          <div className="grid gap-2 p-3 text-sm sm:grid-cols-2">
            <InfoLine label="Address" value={branch.address} />
            <InfoLine label="Phone" value={branch.phone ?? "-"} />
            <InfoLine
              label="GPS"
              value={
                branch.gpsLatitude || branch.gpsLongitude
                  ? `${branch.gpsLatitude ?? "-"}, ${branch.gpsLongitude ?? "-"}`
                  : "-"
              }
            />
            <InfoLine label="Created" value={formatDate(branch.createdAt)} />
          </div>
        </section>

        <section className="border border-[var(--line)] bg-white">
          <PanelHeader
            title="Manager"
            action={
              <button
                type="button"
                className="btn btn-ghost h-8 text-xs"
                onClick={onInvite}
              >
                <Mail className="size-3.5" />
                Invite
              </button>
            }
          />
          <div className="p-3">
            {manager ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <div>
                  <p className="text-sm font-bold text-[var(--midnight-navy)]">
                    {manager.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{manager.email}</p>
                </div>
                <p className="flex items-center gap-1 text-xs text-slate-500">
                  <Phone className="size-3.5 text-[var(--forest-emerald)]" />
                  {manager.phone ?? "Phone added after acceptance"}
                </p>
                <OwnerStatus value={manager.inviteStatus} />
              </div>
            ) : invitedManager ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <div>
                  <p className="text-sm font-bold text-[var(--midnight-navy)]">
                    {invitedManager.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {invitedManager.email}
                  </p>
                </div>
                <p className="text-xs text-amber-700">Waiting for acceptance</p>
                <OwnerStatus value={invitedManager.inviteStatus} />
              </div>
            ) : (
              <p className="text-sm text-slate-500">No active manager.</p>
            )}
          </div>
        </section>

        <section className="border border-[var(--line)] bg-white">
          <PanelHeader title="Team" />
          <div className="divide-y divide-[var(--line)]">
            {staff.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">
                No staff records yet.
              </p>
            ) : (
              staff.map((member) => (
                <div
                  key={member.id}
                  className="grid gap-2 px-3 py-3 text-xs sm:grid-cols-[1fr_1fr_120px] sm:items-center"
                >
                  <div>
                    <p className="font-bold text-[var(--midnight-navy)]">
                      {member.name}
                    </p>
                    <p className="mt-1 text-slate-500">{member.roleName}</p>
                  </div>
                  <p className="truncate text-slate-500">{member.email}</p>
                  <OwnerStatus value={member.inviteStatus} />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="border border-[var(--line)] bg-white">
          <PanelHeader title="Submitted reports" />
          <div className="divide-y divide-[var(--line)]">
            {metrics.reports.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">
                No submitted reports for this branch yet.
              </p>
            ) : (
              metrics.reports.map((report) => (
                <Link
                  key={report.id}
                  href={`/owner/reports?reportId=${report.id}`}
                  className="grid gap-2 px-3 py-3 text-xs hover:bg-[var(--soft-mist)] sm:grid-cols-[1fr_140px_140px_120px] sm:items-center"
                >
                  <div>
                    <p className="font-bold text-[var(--midnight-navy)]">
                      {report.reportNumber}
                    </p>
                    <p className="mt-1 text-slate-500">
                      {formatDate(report.operationDate)}
                    </p>
                  </div>
                  <p className="font-bold tabular-nums">
                    {formatMoney(report.expectedClosingBalance, currency)}
                  </p>
                  <p
                    className={`font-bold tabular-nums ${
                      (report.closingVariance ?? 0) !== 0
                        ? "text-red-700"
                        : "text-[var(--forest-emerald)]"
                    }`}
                  >
                    {formatMoney(report.closingVariance ?? 0, currency)}
                  </p>
                  <OwnerStatus value={report.status} />
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </SidePanel>
  );
}

function SidePanel({
  title,
  description,
  onClose,
  children,
  wide,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(10,18,32,0.35)]">
      <aside
        className={`ml-auto flex h-full w-full flex-col bg-white shadow-2xl ${
          wide ? "max-w-4xl" : "max-w-md"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-[var(--midnight-navy)]">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center border border-[var(--line)]"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-[var(--background)] p-4">
          {children}
        </div>
      </aside>
    </div>
  );
}

function DetailStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-[var(--line)] bg-white p-3">
      <span className="grid size-8 place-items-center bg-emerald-50 text-[var(--forest-emerald)]">
        {icon}
      </span>
      <p className="mt-2 text-[10px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-bold text-[var(--midnight-navy)]">
        {value}
      </p>
    </div>
  );
}

function PanelHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--soft-mist)] px-3 py-2">
      <h3 className="text-sm font-bold text-[var(--midnight-navy)]">{title}</h3>
      {action}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[var(--line)] py-2 last:border-b-0">
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-[var(--midnight-navy)]">{value}</p>
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
