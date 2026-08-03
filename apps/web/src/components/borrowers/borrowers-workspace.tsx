"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarDays,
  Check,
  Download,
  MoreVertical,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../app/app-shell";
import {
  DEFAULT_PAGE_SIZE,
  PaginationControls,
  paginateItems,
} from "../app/pagination";
import { AppBootSkeleton, TableSkeleton } from "../app/skeleton";
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
import {
  BorrowersFiltersControl,
  EMPTY_BORROWERS_FILTERS,
  activeBorrowerFilterChips,
  borrowerMatchesDateRegistered,
  borrowerMatchesOfficer,
  type BorrowersAdvancedFilters,
  type OfficerOption,
} from "./borrowers-filters";

export type BorrowersMode = "owner" | "manager";

type BorrowersSession = {
  session: RembehSession | null;
  workspace: RembehWorkspace | null;
  user: RembehUser | null;
  branch: RembehBranch | null;
  ready: boolean;
};

type ActionMenuState = {
  borrowerId: string;
  top: number;
  left: number;
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
  const [advancedFilters, setAdvancedFilters] = useState<BorrowersAdvancedFilters>(
    EMPTY_BORROWERS_FILTERS,
  );
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [selectedBorrower, setSelectedBorrower] =
    useState<OwnerBorrower | null>(null);
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);
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

  useEffect(() => {
    setPage(1);
  }, [advancedFilters, branchFilter, search]);

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

  const officerOptions = useMemo<OfficerOption[]>(() => {
    const map = new Map<string, string>();
    for (const borrower of borrowers) {
      const label = borrower.registeredByName?.trim();
      if (!label) continue;
      const key = borrower.registeredByPublicId?.trim() || label.toLowerCase();
      if (!map.has(key)) map.set(key, label);
    }
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [borrowers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    return borrowers.filter((borrower) => {
      const matchesBranch =
        isManager ||
        branchFilter === "all" ||
        borrower.branchName === branchFilter;

      const status = resolveBorrowerVerification(borrower);
      const matchesVerification =
        advancedFilters.verification === "all" ||
        (advancedFilters.verification === "verified" &&
          status === "verified") ||
        (advancedFilters.verification === "pending" &&
          status === "not_verified") ||
        (advancedFilters.verification === "issue" && status === "issue");

      const activeCount = borrower.activeLoanCount ?? 0;
      const hasOverdue = Boolean(borrower.hasOverdueLoan);
      const matchesLoanStatus =
        advancedFilters.loanStatus === "all" ||
        (advancedFilters.loanStatus === "active" && activeCount > 0) ||
        (advancedFilters.loanStatus === "overdue" && hasOverdue) ||
        (advancedFilters.loanStatus === "closed_only" &&
          borrower.loanCount > 0 &&
          activeCount === 0);

      const matchesOfficer = borrowerMatchesOfficer(borrower, advancedFilters);
      const matchesDate = borrowerMatchesDateRegistered(
        borrower.createdAt,
        advancedFilters,
        now,
      );

      const digits = q.replace(/\D/g, "");
      const haystack = [
        borrower.fullName,
        borrower.phone,
        borrower.nationalId ?? "",
        borrower.collateralType ?? "",
        borrower.city ?? "",
        borrower.branchName ?? "",
        borrower.registeredByName ?? "",
        String(borrower.loanCount),
        resolveBorrowerVerification(borrower) === "verified"
          ? "verified confirmed"
          : resolveBorrowerVerification(borrower) === "issue"
            ? "verification issue needs correction"
            : "not verified unverified",
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
        matchesBranch &&
        matchesVerification &&
        matchesLoanStatus &&
        matchesOfficer &&
        matchesDate &&
        matchesSearch
      );
    });
  }, [advancedFilters, borrowers, branchFilter, isManager, search]);

  const summary = useMemo(() => buildBorrowersSummary(borrowers), [borrowers]);
  const paged = useMemo(
    () => paginateItems(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  const actionMenuBorrower = actionMenu
    ? (borrowers.find((row) => row.id === actionMenu.borrowerId) ?? null)
    : null;

  function updateSearch(value: string) {
    setSearch(value);
  }

  function toggleActionMenu(
    borrowerId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 168;
    setActionMenu((current) =>
      current?.borrowerId === borrowerId
        ? null
        : {
            borrowerId,
            top: rect.bottom + 6,
            left: Math.max(
              8,
              Math.min(
                window.innerWidth - menuWidth - 8,
                rect.right - menuWidth,
              ),
            ),
          },
    );
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
          searchTooltip="Search by name, phone, national ID, city or branch."
          showReportsButton={false}
          settingsHref={isManager ? "/settings" : "/owner/settings"}
          notificationScope={mode}
          actions={
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

        <section className="grid gap-3 md:grid-cols-3">
          <BorrowerSummaryCard
            icon={<Users className="size-4" />}
            title="Total Borrowers"
            value={formatNumber(summary.total)}
            context={
              isManager ? "Registered at this branch" : "Registered across branches"
            }
            rows={[
              {
                label: "Active loan",
                value: formatNumber(summary.activeLoan),
                tone: "good",
              },
              {
                label: "No active loan",
                value: formatNumber(summary.noActiveLoan),
                tone: "neutral",
              },
            ]}
          />
          <BorrowerSummaryCard
            icon={<ShieldCheck className="size-4" />}
            title="Verified Borrowers"
            value={formatNumber(summary.verified)}
            context="Identity details confirmed"
            pendingHint={
              summary.pending > 0
                ? `${formatNumber(summary.pending)} not verified`
                : null
            }
          />
          <BorrowerSummaryCard
            icon={<CalendarDays className="size-4" />}
            title="New Borrowers"
            value={formatNumber(summary.newThisMonth)}
            context="This month"
            monthDelta={summary.newThisMonth - summary.newLastMonth}
          />
        </section>

        {loading && borrowers.length === 0 ? (
          <TableSkeleton rows={6} columns={6} />
        ) : (
          <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
            <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f5] px-4 py-3.5">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <h2 className="text-[15px] font-semibold text-[#0b1220]">
                  Borrower Records
                </h2>
                {!isManager ? (
                  <label className="relative flex h-9 min-w-0 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-[#0b1224] shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
                    <Building2 className="size-3.5 shrink-0 text-slate-500" />
                    <select
                      value={branchFilter}
                      aria-label="Branch"
                      onChange={(event) => setBranchFilter(event.target.value)}
                      className="min-w-[140px] appearance-none bg-transparent pr-2 text-xs font-semibold outline-none"
                    >
                      <option value="all">All Branches</option>
                      {branchOptions.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <BorrowersFiltersControl
                  officers={officerOptions}
                  applied={advancedFilters}
                  onApply={setAdvancedFilters}
                />
              </div>
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
                      verification: advancedFilters.verification,
                      loanStatus: advancedFilters.loanStatus,
                      search,
                    },
                    setExporting,
                  )
                }
                className="ml-auto flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3.5 text-xs font-semibold text-[#111a2e] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-[#f8faf9] disabled:opacity-60"
              >
                <Download className="size-3.5" />
                {exporting ? "Exporting" : "Export"}
              </button>
            </div>

            {filtered.length === 0 ? (
              <EmptyBorrowersState
                hasFilters={
                  Boolean(search.trim()) ||
                  activeBorrowerFilterChips(advancedFilters).length > 0 ||
                  (!isManager && branchFilter !== "all")
                }
                onClear={() => {
                  setSearch("");
                  setBranchFilter("all");
                  setAdvancedFilters(EMPTY_BORROWERS_FILTERS);
                }}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed text-left text-xs">
                  <thead className="border-b border-[#dfe5eb] bg-[#e8edf2] text-[10px] font-semibold text-slate-600">
                    <tr>
                      <th className="w-[26%] px-3 py-2.5">Borrower</th>
                      <th className="w-[18%] px-3 py-2.5">Contact</th>
                      <th className="w-[12%] px-3 py-2.5">National ID</th>
                      {!isManager ? (
                        <th className="w-[12%] px-3 py-2.5">Branch</th>
                      ) : null}
                      <th className="w-[8%] px-3 py-2.5">Loans</th>
                      <th className="w-[12%] px-3 py-2.5">Verification</th>
                      <th className="w-[12%] px-3 py-2.5">Joined</th>
                      <th className="w-[8%] px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1f5]">
                    {paged.items.map((borrower, index) => (
                      <tr
                        key={borrower.id}
                        className="cursor-pointer transition-colors hover:bg-[#eef7f2]"
                        onClick={() => {
                          setActionMenu(null);
                          setSelectedBorrower(borrower);
                        }}
                      >
                        <td className="px-3 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-semibold ${avatarTone(index)}`}
                            >
                              {initials(borrower.fullName)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-[#0b1220]">
                                {borrower.fullName}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
                                {borrower.collateralType
                                  ? titleCase(borrower.collateralType)
                                  : "No security on file"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <p className="truncate text-[11px] font-medium text-[#0b1220]">
                            {borrower.phone || "—"}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
                            {borrower.email?.trim()
                              ? borrower.email.trim()
                              : "No email provide"}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-[11px] font-medium tabular-nums text-[#0b1220]">
                          {borrower.nationalId ?? "—"}
                        </td>
                        {!isManager ? (
                          <td className="px-3 py-3 text-[11px] font-medium text-[#0b1220]">
                            <span className="truncate">
                              {borrower.branchName ?? "—"}
                            </span>
                          </td>
                        ) : null}
                        <td className="px-3 py-3 text-[11px] font-medium tabular-nums text-[#0b1220]">
                          {formatNumber(borrower.loanCount)}
                        </td>
                        <td className="px-3 py-3">
                          <BorrowerStatus
                            status={resolveBorrowerVerification(borrower)}
                          />
                        </td>
                        <td className="px-3 py-3 text-[11px] font-medium text-[#0b1220]">
                          {formatDate(borrower.createdAt)}
                        </td>
                        <td
                          className="px-3 py-3"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="flex justify-end">
                            <button
                              type="button"
                              className="grid size-8 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#0b1220] transition hover:bg-[#f8faf9]"
                              aria-label={`Open actions for ${borrower.fullName}`}
                              aria-haspopup="menu"
                              aria-expanded={
                                actionMenu?.borrowerId === borrower.id
                              }
                              onClick={(event) =>
                                toggleActionMenu(borrower.id, event)
                              }
                            >
                              <MoreVertical className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <PaginationControls
              page={paged.currentPage}
              pageSize={paged.pageSize}
              total={paged.total}
              itemLabel="borrowers"
              onPageChange={setPage}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          </section>
        )}
      </div>

      {selectedBorrower ? (
        <BorrowerDetailDrawer
          borrower={selectedBorrower}
          onClose={() => setSelectedBorrower(null)}
        />
      ) : null}

      {actionMenu && actionMenuBorrower ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close Actions"
            onClick={() => setActionMenu(null)}
          />
          <div
            role="menu"
            className="fixed z-50 w-[168px] rounded-xl border border-[#e6ebf0] bg-white p-1 text-left shadow-[0_14px_34px_rgba(15,23,42,0.16)]"
            style={{ top: actionMenu.top, left: actionMenu.left }}
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6]"
              onClick={() => {
                setActionMenu(null);
                setSelectedBorrower(actionMenuBorrower);
              }}
            >
              View Borrower
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6]"
              onClick={() => {
                setActionMenu(null);
                void exportBorrowers(
                  [actionMenuBorrower],
                  {
                    branch: actionMenuBorrower.branchName ?? "all",
                    verification: resolveBorrowerVerification(actionMenuBorrower),
                    loanStatus: "all",
                    search: actionMenuBorrower.fullName,
                  },
                  setExporting,
                );
              }}
            >
              Export Borrower
            </button>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

function BorrowerSummaryCard({
  icon,
  title,
  value,
  context,
  rows,
  pendingHint,
  monthDelta,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  context: string;
  rows?: Array<{
    label: string;
    value: string;
    tone: "good" | "neutral" | "warn";
  }>;
  pendingHint?: string | null;
  monthDelta?: number;
}) {
  const toneClass = {
    good: { shell: "bg-[#eef9f2]", dot: "bg-[#17a36a]" },
    neutral: { shell: "bg-[#f3f5f7]", dot: "bg-[#94a3b8]" },
    warn: { shell: "bg-[#fff3e8]", dot: "bg-[#f0a04b]" },
  } as const;

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

      <div className={`mt-2.5 flex items-stretch gap-2 ${rows ? "" : ""}`}>
        <div className="flex min-w-0 flex-[1.15] flex-col justify-center overflow-hidden pr-0.5">
          <p className="text-[clamp(0.95rem,1.35vw,1.35rem)] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#0b1220]">
            {value}
          </p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="text-[11px] font-medium leading-tight text-slate-500">
              {context}
            </p>
            {typeof monthDelta === "number" ? (
              <MonthDeltaBadge delta={monthDelta} />
            ) : null}
          </div>
          {pendingHint ? (
            <p className="mt-1.5 text-[11px] font-semibold text-red-600">
              {pendingHint}
            </p>
          ) : null}
        </div>

        {rows && rows.length > 0 ? (
          <>
            <div className="w-px shrink-0 bg-[#edf1f5]" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
              {rows.map((row) => {
                const tone = toneClass[row.tone];
                return (
                  <div
                    key={row.label}
                    className={`flex min-w-0 items-start gap-1.5 rounded-lg px-1.5 py-1.5 ${tone.shell}`}
                  >
                    <span
                      className={`mt-1 size-2 shrink-0 rounded-full ${tone.dot}`}
                    />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="truncate text-[clamp(0.68rem,0.95vw,0.78rem)] font-bold leading-none tracking-[-0.02em] tabular-nums text-[#0b1220]">
                        {row.value}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] font-medium capitalize leading-tight text-slate-500">
                        {row.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}

function MonthDeltaBadge({ delta }: { delta: number }) {
  const up = delta > 0;
  const down = delta < 0;
  const absolute = Math.abs(delta);
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
        {formatNumber(absolute)}
      </span>
      <span className="text-[10px] font-medium text-slate-400">
        vs last month
      </span>
    </>
  );
}

function buildBorrowersSummary(borrowers: OwnerBorrower[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  let verified = 0;
  let activeLoan = 0;
  let newThisMonth = 0;
  let newLastMonth = 0;

  for (const borrower of borrowers) {
    if (resolveBorrowerVerification(borrower) === "verified") verified += 1;
    if ((borrower.activeLoanCount ?? 0) > 0) activeLoan += 1;
    const created = new Date(borrower.createdAt);
    if (
      created.getFullYear() === now.getFullYear() &&
      created.getMonth() === now.getMonth()
    ) {
      newThisMonth += 1;
    } else if (created >= lastMonthStart && created < monthStart) {
      newLastMonth += 1;
    }
  }

  return {
    total: borrowers.length,
    activeLoan,
    noActiveLoan: borrowers.length - activeLoan,
    verified,
    pending: borrowers.length - verified,
    newThisMonth,
    newLastMonth,
  };
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
      <h3 className="mt-3 text-sm font-semibold text-[#0b1220]">
        No borrowers found
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
          className="mt-3 rounded-xl bg-[#0b936b] px-3 py-2 text-xs font-semibold text-white"
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
        aria-label="Close Borrower Details"
        onClick={onClose}
      />
      <aside className="relative h-full w-full max-w-[400px] overflow-y-auto bg-white p-4 shadow-[-18px_0_44px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-[#0b936b]">
              Borrower Details
            </p>
            <h2 className="mt-1.5 text-xl font-bold tracking-[-0.03em] text-[#0b1220]">
              {borrower.fullName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-xl border border-[#e4e9ef] text-[#0b1220]"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-4 rounded-2xl border border-[#e5ebf0] bg-[#fbfcfd] p-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-[#e2f6ec] text-xs font-semibold text-[#087f5d]">
              {initials(borrower.fullName)}
            </span>
            <div className="min-w-0">
              <BorrowerStatus
                status={resolveBorrowerVerification(borrower)}
              />
              <p className="mt-1.5 text-xs font-medium text-slate-500">
                {formatNumber(borrower.loanCount)}{" "}
                {borrower.loanCount === 1 ? "loan" : "loans"}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <InfoLine label="Phone" value={borrower.phone || "—"} />
          <InfoLine
            label="Email"
            value={
              borrower.email?.trim() ? borrower.email.trim() : "No email provide"
            }
          />
          <InfoLine label="National ID" value={borrower.nationalId ?? "—"} />
          <InfoLine
            label="Security"
            value={
              borrower.collateralType ? titleCase(borrower.collateralType) : "—"
            }
          />
          <InfoLine label="Branch" value={borrower.branchName ?? "—"} />
          <InfoLine
            label="Registered by"
            value={borrower.registeredByName ?? "—"}
          />
          <InfoLine label="City" value={borrower.city ?? "—"} />
          <InfoLine label="Joined" value={formatDate(borrower.createdAt)} />
          <InfoLine
            label="Verified"
            value={borrower.verifiedAt ? formatDate(borrower.verifiedAt) : "—"}
          />
        </div>
      </aside>
    </div>
  );
}

function resolveBorrowerVerification(
  borrower: OwnerBorrower,
): "verified" | "not_verified" | "issue" {
  if (borrower.verificationStatus === "ISSUE") return "issue";
  if (borrower.verificationStatus === "VERIFIED") return "verified";
  if (borrower.verificationStatus === "NOT_VERIFIED") return "not_verified";
  return borrower.verifiedAt ? "verified" : "not_verified";
}

function BorrowerStatus({
  status,
}: {
  status: "verified" | "not_verified" | "issue";
}) {
  if (status === "verified") {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 text-[11px] font-semibold text-[var(--forest-emerald)]">
        <Check className="size-3" />
        Verified
      </span>
    );
  }
  if (status === "issue") {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-700">
        <AlertTriangle className="size-3" />
        Verification issue
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-600">
      Not verified
    </span>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#edf1f4] bg-white px-3 py-2.5 text-xs">
      <span className="font-medium text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold text-[#0b1220]">
        {value}
      </span>
    </div>
  );
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

async function exportBorrowers(
  rows: OwnerBorrower[],
  filters: {
    branch: string;
    verification: string;
    loanStatus: string;
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
    worksheet.mergeCells(1, 1, 1, 9);
    worksheet.addRow([`Generated: ${new Date().toLocaleString("en-UG")}`]);
    worksheet.mergeCells(2, 1, 2, 9);
    worksheet.addRow([
      "Filters",
      filters.search.trim() || "All searches",
      filters.branch === "all" ? "All branches" : filters.branch,
      filters.verification === "all"
        ? "All verification"
        : filters.verification === "verified"
          ? "Verified"
          : filters.verification === "issue"
            ? "Verification issue"
            : "Not verified",
      filters.loanStatus === "all"
        ? "All loan statuses"
        : titleCase(filters.loanStatus.replaceAll("_", " ")),
    ]);
    worksheet.mergeCells(3, 5, 3, 8);
    worksheet.addRow([]);
    worksheet.addRow([
      "Borrower",
      "Phone",
      "Email",
      "National ID",
      "Security",
      "Branch",
      "Loans",
      "Verification",
      "Joined",
    ]);

    rows.forEach((borrower) => {
      worksheet.addRow([
        borrower.fullName,
        borrower.phone,
        borrower.email?.trim() || "No email provide",
        borrower.nationalId ?? "",
        borrower.collateralType ? titleCase(borrower.collateralType) : "",
        borrower.branchName ?? "",
        borrower.loanCount,
        borrower.verificationStatus === "ISSUE"
          ? "Verification issue"
          : borrower.verifiedAt || borrower.verificationStatus === "VERIFIED"
            ? "Verified"
            : "Not verified",
        formatDate(borrower.createdAt),
      ]);
    });

    worksheet.columns = [
      { width: 28 },
      { width: 18 },
      { width: 28 },
      { width: 20 },
      { width: 24 },
      { width: 22 },
      { width: 10 },
      { width: 14 },
      { width: 16 },
    ];
    worksheet.views = [{ state: "frozen", ySplit: 5 }];
    worksheet.autoFilter = "A5:I5";
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
