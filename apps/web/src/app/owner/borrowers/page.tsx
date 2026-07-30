"use client";

import {
  ArrowUpDown,
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Filter,
  Grid2X2,
  List,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../components/app/app-shell";
import { RowActions } from "../../../components/app/row-actions";
import { AppBootSkeleton, SkeletonBlock } from "../../../components/app/skeleton";
import {
  OwnerBorrower,
  formatDate,
  formatNumber,
  ownerFetch,
  titleCase,
  useOwnerSession,
} from "../owner-common";

type BorrowerTone = "green" | "blue" | "gold" | "violet";
type TableMode = "list" | "grid";

const PAGE_SIZE_OPTIONS = [10, 25, 50];

export default function OwnerBorrowersPage() {
  const state = useOwnerSession("/owner/borrowers");
  const [borrowers, setBorrowers] = useState<OwnerBorrower[]>([]);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [collateralFilter, setCollateralFilter] = useState("all");
  const [tableMode, setTableMode] = useState<TableMode>("list");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selectedBorrower, setSelectedBorrower] =
    useState<OwnerBorrower | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadBorrowers = useCallback(async () => {
    if (!state.session) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await ownerFetch<{ customers?: OwnerBorrower[] }>(
        state.session,
        "/customers",
      );
      setBorrowers(payload.customers ?? []);
    } catch {
      setError("Borrowers could not be loaded right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [state.session]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      if (state.ready && state.session) {
        void loadBorrowers();
      }
    }, 0);

    return () => window.clearTimeout(boot);
  }, [loadBorrowers, state.ready, state.session]);

  const branchOptions = useMemo(
    () =>
      Array.from(
        new Set(
          borrowers
            .map((borrower) => borrower.branchName?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [borrowers],
  );
  const collateralOptions = useMemo(
    () =>
      Array.from(
        new Set(
          borrowers
            .map((borrower) => borrower.collateralType?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [borrowers],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return borrowers.filter((borrower) => {
      const status = borrower.verifiedAt ? "verified" : "pending";
      const matchesBranch =
        branchFilter === "all" || borrower.branchName === branchFilter;
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesCollateral =
        collateralFilter === "all" ||
        borrower.collateralType === collateralFilter;
      const matchesSearch =
        !q ||
        [
          borrower.fullName,
          borrower.phone,
          borrower.nationalId ?? "",
          borrower.collateralType ?? "",
          borrower.city ?? "",
          borrower.branchName ?? "",
        ].some((value) => value.toLowerCase().includes(q));

      return (
        matchesBranch && matchesStatus && matchesCollateral && matchesSearch
      );
    });
  }, [borrowers, branchFilter, collateralFilter, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const activeFilterCount = [
    branchFilter !== "all",
    statusFilter !== "all",
    collateralFilter !== "all",
  ].filter(Boolean).length;
  const verifiedCount = borrowers.filter((borrower) => borrower.verifiedAt).length;
  const withLoansCount = borrowers.filter(
    (borrower) => borrower.loanCount > 0,
  ).length;
  const newThisMonthCount = borrowers.filter(isThisMonth).length;

  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function resetFilters() {
    setSearch("");
    setBranchFilter("all");
    setStatusFilter("all");
    setCollateralFilter("all");
    setPage(1);
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
        <header className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold">
                <span className="text-[#0b936b]">Account Register</span>
                <ChevronRight className="size-3.5 text-slate-400" />
                <span className="text-slate-500">Borrowers</span>
              </div>
              <h1 className="mt-1.5 text-[clamp(1.45rem,1.75vw,1.8rem)] font-extrabold leading-tight tracking-[-0.03em] text-[#090f21]">
                Borrowers
              </h1>
              <p className="mt-0.5 text-[13px] font-medium text-slate-500">
                View and manage all borrowers across your branches
              </p>
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2.5">
              <label className="flex h-9 min-w-[220px] max-w-[320px] flex-1 items-center gap-2 rounded-xl border border-[#e4e9ef] bg-white px-3 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
                <Search className="size-4 shrink-0 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => updateSearch(event.target.value)}
                  placeholder="Search anything..."
                  className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-[var(--midnight-navy)] outline-none placeholder:text-slate-400"
                />
                <span className="hidden rounded-md bg-[#f4f6f8] px-1.5 py-0.5 text-[10px] font-extrabold text-slate-400 sm:inline">
                  ⌘K
                </span>
              </label>
              <button
                type="button"
                className="relative grid size-9 place-items-center rounded-xl border border-[#e4e9ef] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)]"
                aria-label="Notifications"
              >
                <Bell className="size-4" />
                {newThisMonthCount > 0 ? (
                  <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#12a36f] text-[10px] font-extrabold text-white">
                    {Math.min(newThisMonthCount, 9)}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() =>
                  setNotice("Borrowers are added from a loan application.")
                }
                className="flex h-9 items-center gap-2 rounded-xl bg-[#0b936b] px-3 text-xs font-extrabold text-white shadow-[0_10px_22px_rgba(11,147,107,0.2)] transition hover:bg-[#087f5d]"
              >
                <Plus className="size-4" />
                Add Borrower
                <ChevronDown className="size-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={exporting}
              onClick={() =>
                void exportBorrowers(
                  filtered,
                  {
                    branch: branchFilter,
                    status: statusFilter,
                    collateral: collateralFilter,
                    search,
                  },
                  setExporting,
                )
              }
              className="flex h-9 items-center gap-2 rounded-xl border border-[#e3e8ee] bg-white px-3 text-xs font-extrabold text-[#111a2e] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-[#f8fafb] disabled:opacity-60"
            >
              <Download className="size-4" />
              {exporting ? "Exporting" : "Export"}
            </button>
            <RowActions
              label="Borrower page actions"
              items={[
                {
                  label: "Refresh",
                  onSelect: () => void loadBorrowers(),
                },
                {
                  label: "Clear filters",
                  onSelect: resetFilters,
                },
              ]}
              busy={loading}
            />
          </div>
        </header>

        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-[#087f5d]">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="grid size-7 place-items-center rounded-full bg-white/70"
              aria-label="Dismiss notice"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <BorrowerStatSkeleton key={index} />
            ))
          ) : (
            <>
              <BorrowerStatCard
                icon={<Users className="size-6" />}
                label="Total Borrowers"
                value={formatNumber(borrowers.length)}
                detail="All registered borrowers"
                change="—"
                tone="green"
              />
              <BorrowerStatCard
                icon={<ShieldCheck className="size-6" />}
                label="Verified Borrowers"
                value={formatNumber(verifiedCount)}
                detail="Identity & docs verified"
                change={percent(verifiedCount, borrowers.length)}
                tone="green"
              />
              <BorrowerStatCard
                icon={<UserCheck className="size-6" />}
                label="With Loans"
                value={formatNumber(withLoansCount)}
                detail="Active loan accounts"
                change={percent(withLoansCount, borrowers.length)}
                tone="blue"
              />
              <BorrowerStatCard
                icon={<ShieldCheck className="size-6" />}
                label="New This Month"
                value={formatNumber(newThisMonthCount)}
                detail="Joined this month"
                change={percent(newThisMonthCount, borrowers.length)}
                tone="gold"
              />
            </>
          )}
        </section>

        <section className="rounded-2xl border border-[#e5ebf0] bg-white p-3 shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
          <div className="grid gap-3 xl:grid-cols-[1.55fr_0.75fr_0.75fr_0.9fr_auto]">
            <label className="flex h-9 min-w-0 items-center gap-2 rounded-xl border border-[#e2e8ee] bg-white px-3 shadow-[0_7px_16px_rgba(15,23,42,0.03)]">
              <Search className="size-4 shrink-0 text-slate-400" />
              <input
                value={search}
                onChange={(event) => updateSearch(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-[var(--midnight-navy)] outline-none placeholder:text-slate-400"
                placeholder="Search by name, phone, national ID or branch..."
              />
            </label>
            <FilterSelect
              icon={<Building2 className="size-4" />}
              value={branchFilter}
              onChange={(value) => {
                setBranchFilter(value);
                setPage(1);
              }}
              label="All Branches"
            >
              <option value="all">All Branches</option>
              {branchOptions.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              icon={<ShieldCheck className="size-4" />}
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
              label="All Status"
            >
              <option value="all">All Status</option>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
            </FilterSelect>
            <FilterSelect
              icon={<ShieldCheck className="size-4" />}
              value={collateralFilter}
              onChange={(value) => {
                setCollateralFilter(value);
                setPage(1);
              }}
              label="All Collateral Types"
            >
              <option value="all">All Collateral Types</option>
              {collateralOptions.map((collateral) => (
                <option key={collateral} value={collateral}>
                  {titleCase(collateral)}
                </option>
              ))}
            </FilterSelect>
            <button
              type="button"
              className="flex h-9 items-center justify-center gap-2 rounded-xl border border-[#e2e8ee] bg-white px-3 text-xs font-extrabold text-[#111a2e] shadow-[0_7px_16px_rgba(15,23,42,0.03)] transition hover:bg-[#f8fafb]"
            >
              <Filter className="size-4" />
              Filters
              {activeFilterCount > 0 ? (
                <span className="grid size-5 place-items-center rounded-full bg-[#0b936b] text-[10px] font-extrabold text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#e5ebf0] bg-white shadow-[0_16px_38px_rgba(15,23,42,0.055)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f4] px-4 py-3.5">
            <div>
              <h2 className="text-base font-extrabold tracking-[-0.02em] text-[#0b1224]">
                Borrower Register
              </h2>
              <span className="mt-2 block h-0.5 w-7 rounded-full bg-[#0b936b]" />
            </div>
            <div className="flex items-center gap-2.5">
              <p className="text-xs font-semibold text-slate-500">
                {formatNumber(filtered.length)} results found
              </p>
              <div className="flex rounded-xl border border-[#e4e9ef] bg-white p-1">
                <button
                  type="button"
                  onClick={() => setTableMode("grid")}
                  className={`grid size-8 place-items-center rounded-lg transition ${
                    tableMode === "grid"
                      ? "bg-[#eef8f4] text-[#0b936b]"
                      : "text-slate-400 hover:bg-[#f7f9fb]"
                  }`}
                  aria-label="Grid view"
                >
                  <Grid2X2 className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setTableMode("list")}
                  className={`grid size-8 place-items-center rounded-lg transition ${
                    tableMode === "list"
                      ? "bg-[#eef8f4] text-[#0b936b]"
                      : "text-slate-400 hover:bg-[#f7f9fb]"
                  }`}
                  aria-label="List view"
                >
                  <List className="size-4" />
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <BorrowerTableSkeleton />
          ) : filtered.length === 0 ? (
            <EmptyBorrowersState
              hasFilters={Boolean(search.trim()) || activeFilterCount > 0}
              onClear={resetFilters}
            />
          ) : tableMode === "grid" ? (
            <BorrowerGrid
              rows={pageRows}
              onView={setSelectedBorrower}
              onExport={(borrower) =>
                void exportBorrowers(
                  [borrower],
                  {
                    branch: borrower.branchName ?? "all",
                    status: borrower.verifiedAt ? "verified" : "pending",
                    collateral: borrower.collateralType ?? "all",
                    search: borrower.fullName,
                  },
                  setExporting,
                )
              }
            />
          ) : (
            <BorrowerTable
              rows={pageRows}
              onView={setSelectedBorrower}
              onExport={(borrower) =>
                void exportBorrowers(
                  [borrower],
                  {
                    branch: borrower.branchName ?? "all",
                    status: borrower.verifiedAt ? "verified" : "pending",
                    collateral: borrower.collateralType ?? "all",
                    search: borrower.fullName,
                  },
                  setExporting,
                )
              }
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1f4] px-4 py-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              Show
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="h-9 rounded-xl border border-[#e2e8ee] bg-white px-3 text-xs font-extrabold text-[#0b1224] outline-none"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              per page
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() =>
                  setPage((current) =>
                    Math.max(1, Math.min(totalPages, current) - 1),
                  )
                }
                className="grid size-9 place-items-center rounded-xl border border-[#e4e9ef] bg-[#f6f8fb] text-slate-400 transition hover:bg-white disabled:opacity-45"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="grid size-9 place-items-center rounded-xl bg-[#0b936b] text-xs font-extrabold text-white shadow-[0_10px_20px_rgba(11,147,107,0.2)]">
                {currentPage}
              </span>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() =>
                  setPage((current) =>
                    Math.min(totalPages, Math.min(totalPages, current) + 1),
                  )
                }
                className="grid size-9 place-items-center rounded-xl border border-[#e4e9ef] bg-[#f6f8fb] text-slate-400 transition hover:bg-white disabled:opacity-45"
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </section>
      </div>

      {selectedBorrower ? (
        <BorrowerDetailDrawer
          borrower={selectedBorrower}
          onClose={() => setSelectedBorrower(null)}
        />
      ) : null}
    </AppShell>
  );
}

function BorrowerStatCard({
  icon,
  label,
  value,
  detail,
  change,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  change: string;
  tone: BorrowerTone;
}) {
  const styles = toneStyles(tone);
  return (
    <article className="flex min-h-[96px] min-w-0 items-center gap-3 rounded-2xl border border-[#e5ebf0] bg-white px-4 py-3 shadow-[0_14px_32px_rgba(15,23,42,0.055)]">
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl ${styles.icon}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="truncate text-xs font-semibold text-[#25314b]">
            {label}
          </p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${styles.badge}`}
          >
            {change}
          </span>
        </div>
        <p className="mt-1.5 break-words text-[clamp(1.18rem,1.55vw,1.55rem)] font-extrabold leading-none tracking-[-0.03em] text-[#090f21] tabular-nums">
          {value}
        </p>
        <p className="mt-1.5 truncate text-xs font-medium text-slate-500">
          {detail}
        </p>
      </div>
    </article>
  );
}

function BorrowerStatSkeleton() {
  return (
    <div className="min-h-[96px] rounded-2xl border border-[#e5ebf0] bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.055)]">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="size-11 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="h-6 w-16" />
          <SkeletonBlock className="h-3 w-36" />
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  icon,
  value,
  onChange,
  label,
  children,
}: {
  icon: ReactNode;
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="relative flex h-9 min-w-0 items-center gap-2 rounded-xl border border-[#e2e8ee] bg-white px-3 text-[#0b1224] shadow-[0_7px_16px_rgba(15,23,42,0.03)]">
      <span className="shrink-0 text-[#0b3145]">{icon}</span>
      <select
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 appearance-none bg-transparent pr-7 text-xs font-extrabold outline-none"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 size-4 text-slate-500" />
    </label>
  );
}

function BorrowerTable({
  rows,
  onView,
  onExport,
}: {
  rows: OwnerBorrower[];
  onView: (borrower: OwnerBorrower) => void;
  onExport: (borrower: OwnerBorrower) => void;
}) {
  return (
    <div>
      <div className="hidden grid-cols-[1.45fr_0.9fr_0.95fr_1fr_1fr_0.45fr_0.72fr_0.62fr] items-center gap-3 border-b border-[#edf1f4] bg-[#fbfcfd] px-4 py-2.5 text-[10px] font-extrabold text-slate-500 lg:grid">
        {[
          "Borrower",
          "Phone",
          "National ID",
          "Collateral",
          "Branch",
          "Loans",
          "Status",
          "Actions",
        ].map((label) => (
          <div
            key={label}
            className={`flex items-center gap-1 ${
              label === "Actions" ? "justify-end" : ""
            }`}
          >
            {label}
            <ArrowUpDown className="size-3 text-slate-300" />
          </div>
        ))}
      </div>
      <div className="divide-y divide-[#edf1f4]">
        {rows.map((borrower, index) => (
          <BorrowerListRow
            key={borrower.id}
            borrower={borrower}
            index={index}
            onView={onView}
            onExport={onExport}
          />
        ))}
      </div>
    </div>
  );
}

function BorrowerListRow({
  borrower,
  index,
  onView,
  onExport,
}: {
  borrower: OwnerBorrower;
  index: number;
  onView: (borrower: OwnerBorrower) => void;
  onExport: (borrower: OwnerBorrower) => void;
}) {
  return (
    <div className="grid gap-3 px-4 py-3 text-[13px] lg:grid-cols-[1.45fr_0.9fr_0.95fr_1fr_1fr_0.45fr_0.72fr_0.62fr] lg:items-center lg:gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-extrabold ${avatarTone(index)}`}
        >
          {initials(borrower.fullName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-extrabold text-[#0b1224]">
            {borrower.fullName}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
            Joined {formatDate(borrower.createdAt)}
          </p>
        </div>
      </div>
      <TableValue label="Phone">{borrower.phone || "-"}</TableValue>
      <TableValue label="National ID">{borrower.nationalId ?? "-"}</TableValue>
      <TableValue label="Collateral">
        {borrower.collateralType ? titleCase(borrower.collateralType) : "-"}
      </TableValue>
      <TableValue label="Branch">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <MapPin className="size-3 shrink-0 text-[#0b936b]" />
          <span className="truncate">{borrower.branchName ?? "-"}</span>
        </span>
      </TableValue>
      <TableValue label="Loans">{formatNumber(borrower.loanCount)}</TableValue>
      <div>
        <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 lg:hidden">
          Status
        </p>
        <BorrowerStatus verified={Boolean(borrower.verifiedAt)} />
      </div>
      <div className="flex items-center justify-start gap-2 lg:justify-end">
        <button
          type="button"
          onClick={() => onView(borrower)}
          className="grid size-8 place-items-center rounded-xl border border-[#e4e9ef] bg-white text-[#0b3145] shadow-[0_7px_14px_rgba(15,23,42,0.035)] transition hover:bg-[#f8fafb]"
          aria-label={`View ${borrower.fullName}`}
        >
          <Eye className="size-3.5" />
        </button>
        <RowActions
          label={`Actions for ${borrower.fullName}`}
          items={[
            { label: "View details", onSelect: () => onView(borrower) },
            { label: "Export borrower", onSelect: () => onExport(borrower) },
          ]}
        />
      </div>
    </div>
  );
}

function BorrowerGrid({
  rows,
  onView,
  onExport,
}: {
  rows: OwnerBorrower[];
  onView: (borrower: OwnerBorrower) => void;
  onExport: (borrower: OwnerBorrower) => void;
}) {
  return (
    <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((borrower, index) => (
        <article
          key={borrower.id}
          className="rounded-2xl border border-[#e6ebf0] bg-white p-3.5 shadow-[0_10px_22px_rgba(15,23,42,0.04)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-extrabold ${avatarTone(index)}`}
              >
                {initials(borrower.fullName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-extrabold text-[#0b1224]">
                  {borrower.fullName}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                  Joined {formatDate(borrower.createdAt)}
                </p>
              </div>
            </div>
            <RowActions
              label={`Actions for ${borrower.fullName}`}
              items={[
                { label: "View details", onSelect: () => onView(borrower) },
                { label: "Export borrower", onSelect: () => onExport(borrower) },
              ]}
            />
          </div>
          <div className="mt-3 grid gap-1.5 text-xs font-semibold text-[#17213a]">
            <InfoLine label="Phone" value={borrower.phone || "-"} />
            <InfoLine label="National ID" value={borrower.nationalId ?? "-"} />
            <InfoLine
              label="Collateral"
              value={
                borrower.collateralType
                  ? titleCase(borrower.collateralType)
                  : "-"
              }
            />
            <InfoLine label="Branch" value={borrower.branchName ?? "-"} />
          </div>
        </article>
      ))}
    </div>
  );
}

function BorrowerTableSkeleton() {
  return (
    <div className="divide-y divide-[#edf1f4]">
      {Array.from({ length: 5 }).map((_, row) => (
        <div
          key={row}
          className="grid gap-3 px-4 py-3 lg:grid-cols-[1.45fr_0.9fr_0.95fr_1fr_1fr_0.45fr_0.72fr_0.62fr]"
        >
          {Array.from({ length: 8 }).map((__, column) => (
            <SkeletonBlock
              key={column}
              className={`h-3.5 ${column === 0 ? "w-3/4" : "w-full"}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyBorrowersState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eef8f4] text-[#0b936b]">
        <Users className="size-5" />
      </div>
      <h3 className="mt-3 text-sm font-extrabold text-[#0b1224]">
        No borrowers found
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-xs font-medium text-slate-500">
        {hasFilters
          ? "Try another search or clear the filters to see more borrowers."
          : "Borrowers will appear here when loan applications are registered."}
      </p>
      {hasFilters ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-3 rounded-xl bg-[#0b936b] px-3 py-2 text-xs font-extrabold text-white"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function BorrowerDetailDrawer({
  borrower,
  onClose,
}: {
  borrower: OwnerBorrower;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(8,15,31,0.36)] backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close borrower details"
        onClick={onClose}
      />
      <aside className="relative h-full w-full max-w-[400px] overflow-y-auto bg-white p-4 shadow-[-18px_0_44px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#0b936b]">
              Borrower Details
            </p>
            <h2 className="mt-1.5 text-xl font-extrabold tracking-[-0.03em] text-[#0b1224]">
              {borrower.fullName}
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
        <div className="mt-4 rounded-2xl border border-[#e5ebf0] bg-[#fbfcfd] p-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-[#e2f6ec] text-xs font-extrabold text-[#087f5d]">
              {initials(borrower.fullName)}
            </span>
            <div className="min-w-0">
              <BorrowerStatus verified={Boolean(borrower.verifiedAt)} />
              <p className="mt-1.5 text-xs font-semibold text-slate-500">
                {formatNumber(borrower.loanCount)} loan
                {borrower.loanCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <InfoLine label="Phone" value={borrower.phone || "-"} />
          <InfoLine label="National ID" value={borrower.nationalId ?? "-"} />
          <InfoLine
            label="Collateral"
            value={
              borrower.collateralType ? titleCase(borrower.collateralType) : "-"
            }
          />
          <InfoLine label="Branch" value={borrower.branchName ?? "-"} />
          <InfoLine label="City" value={borrower.city ?? "-"} />
          <InfoLine label="Registered" value={formatDate(borrower.createdAt)} />
          <InfoLine
            label="Verified"
            value={borrower.verifiedAt ? formatDate(borrower.verifiedAt) : "-"}
          />
        </div>
      </aside>
    </div>
  );
}

function TableValue({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 font-semibold text-[#25314b]">
      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 lg:hidden">
        {label}
      </p>
      <div className="min-w-0 truncate">{children}</div>
    </div>
  );
}

function BorrowerStatus({ verified }: { verified: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
        verified
          ? "bg-[#daf5e8] text-[#087f5d]"
          : "bg-[#fff4df] text-[#b56b00]"
      }`}
    >
      {verified ? <Check className="size-3" /> : null}
      {verified ? "Verified" : "Pending"}
    </span>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#edf1f4] bg-white px-3 py-2.5 text-xs">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right font-extrabold text-[#0b1224]">
        {value}
      </span>
    </div>
  );
}

function toneStyles(tone: BorrowerTone) {
  return {
    green: {
      icon: "bg-[#def7eb] text-[#0b936b]",
      badge: "bg-[#def7eb] text-[#0b936b]",
    },
    blue: {
      icon: "bg-[#eaf3ff] text-[#1f73f1]",
      badge: "bg-[#eaf3ff] text-[#1f73f1]",
    },
    gold: {
      icon: "bg-[#fff1df] text-[#f27a12]",
      badge: "bg-[#fff1df] text-[#f27a12]",
    },
    violet: {
      icon: "bg-[#f0e7ff] text-[#7952e8]",
      badge: "bg-[#f0e7ff] text-[#7952e8]",
    },
  }[tone];
}

function avatarTone(index: number) {
  const tones = [
    "bg-[#e3f7ed] text-[#087f5d]",
    "bg-[#fff2d9] text-[#c97900]",
    "bg-[#f0e4ff] text-[#7952e8]",
    "bg-[#eaf3ff] text-[#1f73f1]",
  ];
  return tones[index % tones.length];
}

function initials(name: string) {
  const value = name.trim();
  if (!value) return "B";
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function percent(value: number, total: number) {
  if (total <= 0) return "—";
  return `${Math.round((value / total) * 100)}%`;
}

function isThisMonth(borrower: OwnerBorrower) {
  const createdAt = new Date(borrower.createdAt);
  const now = new Date();
  return (
    createdAt.getFullYear() === now.getFullYear() &&
    createdAt.getMonth() === now.getMonth()
  );
}

async function exportBorrowers(
  rows: OwnerBorrower[],
  filters: {
    branch: string;
    status: string;
    collateral: string;
    search: string;
  },
  setExporting: (exporting: boolean) => void,
) {
  setExporting(true);
  try {
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    workbook.creator = "REMBEH";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet("Borrowers");

    worksheet.addRow(["REMBEH Borrower Register"]);
    worksheet.mergeCells(1, 1, 1, 8);
    worksheet.addRow([`Generated: ${new Date().toLocaleString("en-UG")}`]);
    worksheet.mergeCells(2, 1, 2, 8);
    worksheet.addRow([
      "Filters",
      filters.search.trim() || "All searches",
      filters.branch === "all" ? "All branches" : filters.branch,
      filters.status === "all" ? "All statuses" : titleCase(filters.status),
      filters.collateral === "all"
        ? "All collateral types"
        : titleCase(filters.collateral),
    ]);
    worksheet.mergeCells(3, 5, 3, 8);
    worksheet.addRow([]);
    worksheet.addRow([
      "Borrower",
      "Phone",
      "National ID",
      "Collateral",
      "Branch",
      "Loans",
      "Status",
      "Joined",
    ]);

    rows.forEach((borrower) => {
      worksheet.addRow([
        borrower.fullName,
        borrower.phone,
        borrower.nationalId ?? "",
        borrower.collateralType ? titleCase(borrower.collateralType) : "",
        borrower.branchName ?? "",
        borrower.loanCount,
        borrower.verifiedAt ? "Verified" : "Pending",
        formatDate(borrower.createdAt),
      ]);
    });

    worksheet.columns = [
      { width: 28 },
      { width: 18 },
      { width: 20 },
      { width: 24 },
      { width: 22 },
      { width: 10 },
      { width: 14 },
      { width: 16 },
    ];
    worksheet.views = [{ state: "frozen", ySplit: 5 }];
    worksheet.autoFilter = "A5:H5";
    worksheet.getRow(1).height = 26;
    worksheet.getRow(1).font = {
      bold: true,
      size: 18,
      color: { argb: "FFFFFFFF" },
    };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF003F35" },
    };
    worksheet.getRow(1).alignment = { vertical: "middle" };
    worksheet.getRow(2).font = { color: { argb: "FF64748B" }, italic: true };
    worksheet.getRow(3).font = { bold: true, color: { argb: "FF0B1224" } };
    worksheet.getRow(5).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(5).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0B936B" },
    };
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          bottom: {
            style: rowNumber === 5 ? "medium" : "thin",
            color: { argb: "FFE2E8F0" },
          },
        };
        cell.alignment = { vertical: "middle" };
      });
    });
    worksheet.getColumn(6).alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rembeh-borrower-register.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    setExporting(false);
  }
}
