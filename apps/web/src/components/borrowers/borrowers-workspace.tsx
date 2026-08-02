"use client";

import {
  ArrowUpDown,
  Building2,
  CalendarDays,
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
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../app/app-shell";
import { RowActions } from "../app/row-actions";
import { AppBootSkeleton, SkeletonBlock } from "../app/skeleton";
import {
  OwnerBorrower,
  formatDate,
  formatNumber,
  ownerFetch,
  titleCase,
} from "../../app/owner/owner-common";
import { OwnerHeader } from "../../app/owner/owner-header";
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

export type BorrowersMode = "owner" | "manager";

type BorrowerTone = "green" | "blue" | "gold" | "violet";
type TableMode = "list" | "grid";

const PAGE_SIZE_OPTIONS = [10, 25, 50];

type BorrowersSession = {
  session: RembehSession | null;
  workspace: RembehWorkspace | null;
  user: RembehUser | null;
  branch: RembehBranch | null;
  ready: boolean;
};

function useBorrowersSession(mode: BorrowersMode): BorrowersSession {
  const router = useRouter();
  const [state, setState] = useState<BorrowersSession>({
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
          `/login?next=${encodeURIComponent(mode === "owner" ? "/owner/borrowers" : "/clients")}`,
        );
        return;
      }
      const role = resolveOperatorRole(auth.session, auth.user);
      if (mode === "owner" && role !== "owner") {
        router.replace(role === "manager" ? "/clients" : "/dashboard");
        return;
      }
      if (mode === "manager" && role !== "manager") {
        router.replace(role === "owner" ? "/owner/borrowers" : "/dashboard");
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

export function BorrowersWorkspace({ mode }: { mode: BorrowersMode }) {
  const state = useBorrowersSession(mode);
  const isManager = mode === "manager";
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
      const next = payload.customers ?? [];
      setBorrowers(
        isManager && state.branch?.id
          ? next.filter((borrower) => borrower.branchId === state.branch?.id)
          : next,
      );
    } catch {
      setError("Borrowers could not be loaded right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [isManager, state.branch?.id, state.session]);

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
        isManager ||
        branchFilter === "all" ||
        borrower.branchName === branchFilter;
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesCollateral =
        collateralFilter === "all" ||
        borrower.collateralType === collateralFilter;
      const digits = q.replace(/\D/g, "");
      const haystack = [
        borrower.fullName,
        borrower.phone,
        borrower.nationalId ?? "",
        borrower.collateralType ?? "",
        borrower.city ?? "",
        borrower.branchName ?? "",
        String(borrower.loanCount),
        borrower.verifiedAt ? "verified confirmed" : "pending awaiting check",
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch =
        !q ||
        haystack.includes(q) ||
        (digits.length >= 3 &&
          [borrower.phone, borrower.nationalId ?? ""].some((value) =>
            value.replace(/\D/g, "").includes(digits),
          ));

      return (
        matchesBranch && matchesStatus && matchesCollateral && matchesSearch
      );
    });
  }, [
    borrowers,
    branchFilter,
    collateralFilter,
    isManager,
    search,
    statusFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const activeFilterCount = [
    !isManager && branchFilter !== "all",
    statusFilter !== "all",
    collateralFilter !== "all",
  ].filter(Boolean).length;
  const verifiedCount = borrowers.filter((borrower) => borrower.verifiedAt).length;
  const withLoansCount = borrowers.filter(
    (borrower) => borrower.loanCount > 0,
  ).length;
  const newThisMonthCount = borrowers.filter(isThisMonth).length;
  const pendingVerificationCount = borrowers.length - verifiedCount;
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
      branch={isManager ? state.branch : null}
    >
      <div className="mx-auto max-w-[1400px] space-y-5 animate-rise">
        <OwnerHeader
          title="Borrowers"
          search={search}
          onSearchChange={updateSearch}
          searchPlaceholder="Search Borrowers..."
          searchTooltip="Search by name, phone, national ID, security, city or branch."
          showReportsButton={false}
          settingsHref={isManager ? "/settings" : "/owner/settings"}
          notificationScope={mode}
          actions={
            <>
              <button
                type="button"
                onClick={() => void loadBorrowers()}
                disabled={loading}
                aria-label="Refresh Borrowers"
                className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-emerald-50 disabled:opacity-60"
              >
                <RefreshCw
                  className={`size-4 ${loading ? "animate-spin" : ""}`}
                />
              </button>
              <button
                type="button"
                onClick={() =>
                  setNotice("Borrowers are added when you create a loan.")
                }
                className="flex h-9 items-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-3.5 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(15,143,104,0.28)] transition hover:brightness-105"
              >
                <Plus className="size-3.5" />
                Add Borrower
              </button>
              <button
                type="button"
                disabled={exporting || filtered.length === 0}
                onClick={() =>
                  void exportBorrowers(
                    filtered,
                    {
                      branch: isManager
                        ? state.branch?.name ?? "Your branch"
                        : branchFilter,
                      status: statusFilter,
                      collateral: collateralFilter,
                      search,
                    },
                    setExporting,
                  )
                }
                className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3.5 text-xs font-semibold text-[#111a2e] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-[#f8faf9] disabled:opacity-60"
              >
                <Download className="size-3.5" />
                {exporting ? "Exporting" : "Export"}
              </button>
            </>
          }
        />
        <p className="-mt-2 text-sm font-medium text-slate-500">
          {isManager
            ? "Manage borrowers, review their details, and track loan activity at your branch."
            : "Manage borrowers, review their details, and track loan activity across branches."}
        </p>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-[#087f5d]">
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
                icon={<Users className="size-4" />}
                label="Total Borrowers"
                value={formatNumber(borrowers.length)}
                detail={isManager ? "This Branch" : "All Branches"}
                tone="green"
              />
              <BorrowerStatCard
                icon={<ShieldCheck className="size-4" />}
                label="Confirmed"
                value={formatNumber(verifiedCount)}
                detail={`${formatNumber(pendingVerificationCount)} Awaiting Check`}
                tone="green"
              />
              <BorrowerStatCard
                icon={<UserCheck className="size-4" />}
                label="Have Loans"
                value={formatNumber(withLoansCount)}
                detail="Borrowers With Loans"
                tone="blue"
              />
              <BorrowerStatCard
                icon={<CalendarDays className="size-4" />}
                label="New This Month"
                value={formatNumber(newThisMonthCount)}
                detail="Added This Month"
                tone="gold"
              />
            </>
          )}
        </section>

        <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f5] px-4 py-4">
            <h2 className="text-[15px] font-semibold text-[#0b1220]">
              {isManager ? "Branch Borrowers" : "All Borrowers"}
            </h2>
            <div className="flex h-9 items-center rounded-xl border border-[#e6ebf0] bg-white p-1 shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
              <button
                type="button"
                onClick={() => setTableMode("list")}
                className={`grid size-7 place-items-center rounded-lg transition ${
                  tableMode === "list"
                    ? "bg-emerald-50 text-[var(--forest-emerald)]"
                    : "text-slate-400 hover:bg-[#f8faf9]"
                }`}
                aria-label="List view"
              >
                <List className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setTableMode("grid")}
                className={`grid size-7 place-items-center rounded-lg transition ${
                  tableMode === "grid"
                    ? "bg-emerald-50 text-[var(--forest-emerald)]"
                    : "text-slate-400 hover:bg-[#f8faf9]"
                }`}
                aria-label="Grid view"
              >
                <Grid2X2 className="size-3.5" />
              </button>
            </div>
          </div>

          <div
            className={`grid gap-2.5 border-b border-[#edf1f5] px-4 py-3 ${
              isManager
                ? "lg:grid-cols-[140px_170px_auto]"
                : "lg:grid-cols-[160px_140px_170px_auto]"
            }`}
          >
            {!isManager ? (
              <FilterSelect
                icon={<Building2 className="size-3.5" />}
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
            ) : null}
            <FilterSelect
              icon={<ShieldCheck className="size-3.5" />}
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
              label="All Statuses"
            >
              <option value="all">All Statuses</option>
              <option value="verified">Confirmed</option>
              <option value="pending">Awaiting Check</option>
            </FilterSelect>
            <FilterSelect
              icon={<MapPin className="size-3.5" />}
              value={collateralFilter}
              onChange={(value) => {
                setCollateralFilter(value);
                setPage(1);
              }}
              label="All Security"
            >
              <option value="all">All Security</option>
              {collateralOptions.map((collateral) => (
                <option key={collateral} value={collateral}>
                  {titleCase(collateral)}
                </option>
              ))}
            </FilterSelect>
            <button
              type="button"
              disabled={!search.trim() && activeFilterCount === 0}
              onClick={resetFilters}
              className="flex h-9 items-center justify-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.035)] transition hover:bg-[#f8faf9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Filter className="size-3.5" />
              Clear
              {activeFilterCount > 0 ? (
                <span className="grid size-5 place-items-center rounded-full bg-[var(--forest-emerald)] text-[10px] font-semibold text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
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

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1f5] px-4 py-3 text-xs font-semibold text-slate-500">
            <p>
              Showing{" "}
              {formatNumber(
                filtered.length === 0
                  ? 0
                  : (currentPage - 1) * pageSize + 1,
              )}{" "}
              to{" "}
              {formatNumber(
                Math.min(currentPage * pageSize, filtered.length),
              )}{" "}
              of {formatNumber(filtered.length)}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() =>
                  setPage((current) => Math.max(1, current - 1))
                }
                className="grid size-8 place-items-center rounded-xl border border-[#edf1f5] text-slate-400 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <span className="grid size-8 place-items-center rounded-xl bg-[var(--forest-emerald)] text-xs font-semibold text-white">
                {currentPage}
              </span>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                className="grid size-8 place-items-center rounded-xl border border-[#edf1f5] text-slate-400 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="h-8 rounded-xl border border-[#edf1f5] bg-white px-2.5 text-xs font-semibold text-slate-600 outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} per page
                </option>
              ))}
            </select>
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
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: BorrowerTone;
}) {
  const styles = toneStyles(tone);
  return (
    <article className="flex min-h-[96px] min-w-0 items-center gap-3 rounded-[14px] border border-[#e6ebf0] bg-white px-4 py-3.5 shadow-[0_12px_26px_rgba(15,23,42,0.045)]">
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-2xl ${styles.icon}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold text-slate-500">{label}</p>
        <p className="mt-1.5 break-words text-[clamp(0.95rem,1.1vw,1.2rem)] font-semibold leading-tight tracking-[-0.02em] text-[#111827] tabular-nums">
          {value}
        </p>
        <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
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
    <label className="relative flex h-9 min-w-0 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-[#0b1224] shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
      <span className="shrink-0 text-slate-500">{icon}</span>
      <select
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 appearance-none bg-transparent pr-7 text-xs font-semibold outline-none"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 size-3.5 text-slate-400" />
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
      <div className="hidden grid-cols-[1.45fr_0.9fr_0.95fr_1fr_1fr_0.45fr_0.72fr_0.62fr] items-center gap-3 border-b border-[#edf1f4] bg-[#fbfcfd] px-4 py-2.5 text-[10px] font-medium text-slate-500 lg:grid">
        {[
          "Borrower",
          "Phone",
          "National ID",
          "Security",
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
    <article
      className="grid cursor-pointer gap-3 px-4 py-3.5 text-[13px] transition hover:bg-[#fbfdfc] lg:grid-cols-[1.45fr_0.9fr_0.95fr_1fr_1fr_0.45fr_0.72fr_0.62fr] lg:items-center lg:gap-3"
      onClick={() => onView(borrower)}
    >
      <div className="flex min-w-0 items-start justify-between gap-3 lg:contents">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-semibold ${avatarTone(index)}`}
          >
            {initials(borrower.fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#0b1224]">
              {borrower.fullName}
            </p>
            <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
              Joined {formatDate(borrower.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          <BorrowerStatus verified={Boolean(borrower.verifiedAt)} />
          <RowActions
            label={`Actions For ${borrower.fullName}`}
            items={[
              { label: "View Details", onSelect: () => onView(borrower) },
              { label: "Export Borrower", onSelect: () => onExport(borrower) },
            ]}
          />
        </div>
      </div>
      <TableValue label="Phone">{borrower.phone || "—"}</TableValue>
      <TableValue label="National ID">{borrower.nationalId ?? "—"}</TableValue>
      <TableValue label="Security">
        {borrower.collateralType ? titleCase(borrower.collateralType) : "—"}
      </TableValue>
      <TableValue label="Branch">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <MapPin className="size-3 shrink-0 text-[var(--forest-emerald)]" />
          <span className="truncate">{borrower.branchName ?? "—"}</span>
        </span>
      </TableValue>
      <TableValue label="Loans">{formatNumber(borrower.loanCount)}</TableValue>
      <div className="hidden lg:block">
        <BorrowerStatus verified={Boolean(borrower.verifiedAt)} />
      </div>
      <div
        className="hidden items-center justify-end gap-2 lg:flex"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onView(borrower)}
          className="grid size-8 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#0b3145] shadow-[0_7px_14px_rgba(15,23,42,0.035)] transition hover:bg-[#f8faf9]"
          aria-label={`View ${borrower.fullName}`}
        >
          <Eye className="size-3.5" />
        </button>
        <RowActions
          label={`Actions For ${borrower.fullName}`}
          items={[
            { label: "View Details", onSelect: () => onView(borrower) },
            { label: "Export Borrower", onSelect: () => onExport(borrower) },
          ]}
        />
      </div>
    </article>
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
                className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-medium ${avatarTone(index)}`}
              >
                {initials(borrower.fullName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-[#0b1224]">
                  {borrower.fullName}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                  Joined {formatDate(borrower.createdAt)}
                </p>
              </div>
            </div>
            <RowActions
              label={`Actions For ${borrower.fullName}`}
              items={[
                { label: "View Details", onSelect: () => onView(borrower) },
                { label: "Export Borrower", onSelect: () => onExport(borrower) },
              ]}
            />
          </div>
          <div className="mt-3 grid gap-1.5 text-xs font-medium text-[#17213a]">
            <InfoLine label="Phone" value={borrower.phone || "-"} />
            <InfoLine label="National ID" value={borrower.nationalId ?? "-"} />
            <InfoLine
              label="Security"
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
      <h3 className="mt-3 text-sm font-medium text-[#0b1224]">
        No Borrowers Found
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-xs font-medium text-slate-500">
        {hasFilters
          ? "Try another search or clear the filters to see more borrowers."
          : "Borrowers will appear here when you create loans."}
      </p>
      {hasFilters ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-3 rounded-xl bg-[#0b936b] px-3 py-2 text-xs font-medium text-white"
        >
          Clear Filters
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
        aria-label="Close Borrower Details"
        onClick={onClose}
      />
      <aside className="relative h-full w-full max-w-[400px] overflow-y-auto bg-white p-4 shadow-[-18px_0_44px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-[#0b936b]">
              Borrower Details
            </p>
            <h2 className="mt-1.5 text-xl font-bold tracking-[-0.03em] text-[#0b1224]">
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
            <span className="grid size-10 place-items-center rounded-full bg-[#e2f6ec] text-xs font-medium text-[#087f5d]">
              {initials(borrower.fullName)}
            </span>
            <div className="min-w-0">
              <BorrowerStatus verified={Boolean(borrower.verifiedAt)} />
              <p className="mt-1.5 text-xs font-medium text-slate-500">
                {formatNumber(borrower.loanCount)}{" "}
                {borrower.loanCount === 1 ? "Loan" : "Loans"}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <InfoLine label="Phone" value={borrower.phone || "-"} />
          <InfoLine label="National ID" value={borrower.nationalId ?? "-"} />
          <InfoLine
            label="Security"
            value={
              borrower.collateralType ? titleCase(borrower.collateralType) : "-"
            }
          />
          <InfoLine label="Branch" value={borrower.branchName ?? "-"} />
          <InfoLine label="City" value={borrower.city ?? "-"} />
          <InfoLine label="Joined" value={formatDate(borrower.createdAt)} />
          <InfoLine
            label="Confirmed"
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
    <div className="min-w-0 font-medium text-[#25314b]">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400 lg:hidden">
        {label}
      </p>
      <div className="min-w-0 truncate">{children}</div>
    </div>
  );
}

function BorrowerStatus({ verified }: { verified: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
        verified
          ? "bg-[#daf5e8] text-[#087f5d]"
          : "bg-[#fff4df] text-[#b56b00]"
      }`}
    >
      {verified ? <Check className="size-3" /> : null}
      {verified ? "Confirmed" : "Awaiting Check"}
    </span>
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
      filters.search.trim() || "All Searches",
      filters.branch === "all" ? "All Branches" : filters.branch,
      filters.status === "all"
        ? "All Statuses"
        : filters.status === "verified"
          ? "Confirmed"
          : filters.status === "pending"
            ? "Awaiting Check"
            : titleCase(filters.status),
      filters.collateral === "all"
        ? "All Security"
        : titleCase(filters.collateral),
    ]);
    worksheet.mergeCells(3, 5, 3, 8);
    worksheet.addRow([]);
    worksheet.addRow([
      "Borrower",
      "Phone",
      "National ID",
      "Security",
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
        borrower.verifiedAt ? "Confirmed" : "Awaiting Check",
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
