"use client";

import {
  ArrowUpDown,
  Banknote,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Filter,
  Funnel,
  Phone,
  RefreshCw,
  Search,
  Smartphone,
  TrendingUp,
  Users,
  FileText,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../app/app-shell";
import { RowActions } from "../app/row-actions";
import { AppBootSkeleton } from "../app/skeleton";
import {
  OwnerRepayment,
  formatMoney,
  formatNumber,
  ownerFetch,
  sumBy,
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

export type CollectionsMode = "owner" | "manager";

type PaymentFilter = "collectedToday" | "all" | "yesterday" | "thisWeek";
type MethodFilter = "all" | "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER" | "OTHER";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const FILTER_LABELS: Record<PaymentFilter, string> = {
  collectedToday: "Collected today",
  all: "All Payments",
  yesterday: "Yesterday",
  thisWeek: "This week",
};

type CollectionsSession = {
  session: RembehSession | null;
  workspace: RembehWorkspace | null;
  user: RembehUser | null;
  branch: RembehBranch | null;
  ready: boolean;
};

function useCollectionsSession(mode: CollectionsMode): CollectionsSession {
  const router = useRouter();
  const [state, setState] = useState<CollectionsSession>({
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
          `/login?next=${encodeURIComponent(mode === "owner" ? "/owner/collections" : "/collections/daily")}`,
        );
        return;
      }
      const role = resolveOperatorRole(auth.session, auth.user);
      if (mode === "owner" && role !== "owner") {
        router.replace(role === "manager" ? "/collections/daily" : "/dashboard");
        return;
      }
      if (mode === "manager" && role !== "manager") {
        router.replace(role === "owner" ? "/owner/collections" : "/dashboard");
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

export function CollectionsWorkspace({ mode }: { mode: CollectionsMode }) {
  const state = useCollectionsSession(mode);
  const isManager = mode === "manager";
  const [repayments, setRepayments] = useState<OwnerRepayment[]>([]);
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const currency = state.workspace?.currency ?? "UGX";

  const loadPayments = useCallback(async () => {
    if (!state.session) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await ownerFetch<{ repayments?: OwnerRepayment[] }>(
        state.session,
        `/collections/repayments?filter=${filter}`,
      );
      setRepayments(payload.repayments ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load payments.",
      );
    } finally {
      setLoading(false);
    }
  }, [filter, state.session]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      if (state.ready && state.session) {
        void loadPayments();
      }
    }, 0);
    return () => window.clearTimeout(boot);
  }, [loadPayments, state.ready, state.session]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filter, methodFilter, search, pageSize]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return repayments.filter((payment) => {
      const method = payment.method.toUpperCase().replace(/\s+/g, "_");
      const matchesMethod =
        methodFilter === "all" || method === methodFilter;
      const matchesSearch =
        !q ||
        [
          payment.clientName,
          payment.phone,
          payment.loanId,
          payment.method,
          payment.recordedByName,
        ].some((value) => value.toLowerCase().includes(q));
      return matchesMethod && matchesSearch;
    });
  }, [methodFilter, repayments, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, filtered.length);
  const paged = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const uniqueBorrowers = useMemo(
    () => new Set(filtered.map((item) => item.customerId)).size,
    [filtered],
  );
  const collectedTotal = useMemo(
    () => sumBy(filtered, (payment) => payment.amount),
    [filtered],
  );
  const dateRangeLabel = useMemo(
    () => rangeLabelForFilter(filter, filtered),
    [filter, filtered],
  );

  async function copyValue(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(key);
      window.setTimeout(() => setCopiedId(null), 1200);
    } catch {
      // Ignore clipboard failures.
    }
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
          eyebrow={isManager ? "Your branch" : "All Branches"}
          title="Collections"
          search={search}
          onSearchChange={setSearch}
          searchTooltip="Search borrower, phone, loan ID or officer."
          searchPlaceholder="Search borrower, phone, loan ID or officer..."
          showReportsButton={false}
          settingsHref={isManager ? "/settings" : "/owner/settings"}
          notificationScope={mode}
          actions={
            <>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold text-[#25314b] shadow-[0_8px_18px_rgba(15,23,42,0.045)]"
              >
                <CalendarDays className="size-3.5 text-[var(--forest-emerald)]" />
                {dateRangeLabel}
              </button>
              <button
                type="button"
                onClick={() => void loadPayments()}
                disabled={loading}
                aria-label="Refresh payments"
                className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#25314b] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-[#f8faf9] disabled:opacity-60"
              >
                <RefreshCw
                  className={`size-4 ${loading ? "animate-spin" : ""}`}
                />
              </button>
              <button
                type="button"
                onClick={() =>
                  void exportPayments(filtered, currency, setExporting)
                }
                disabled={exporting || filtered.length === 0}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-3.5 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(15,143,104,0.28)] transition hover:brightness-105 disabled:opacity-60"
              >
                <Download className="size-3.5" />
                {exporting ? "Exporting" : "Export"}
              </button>
            </>
          }
        />
        <p className="-mt-2 text-sm font-medium text-slate-500">
          {isManager
            ? "Track and manage repayment collections for your branch."
            : "Track and manage all repayment collections in one place."}
        </p>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<Banknote className="size-4" />}
            tone="green"
            label="Payments"
            value={formatNumber(filtered.length)}
            detail={filter === "collectedToday" ? "Today" : "In view"}
          />
          <MetricCard
            icon={<TrendingUp className="size-4" />}
            tone="green"
            label="Collected"
            value={formatMoney(collectedTotal, currency)}
            detail="Total amount"
          />
          <MetricCard
            icon={<Users className="size-4" />}
            tone="blue"
            label="Borrowers served"
            value={formatNumber(uniqueBorrowers)}
            detail="Unique borrowers"
          />
          <MetricCard
            icon={<Funnel className="size-4" />}
            tone="violet"
            label="Current view"
            value={FILTER_LABELS[filter]}
            detail={
              methodFilter === "all"
                ? "All methods"
                : titleCase(methodFilter.replace(/_/g, " "))
            }
          />
        </section>

        <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f5] px-4 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[#0b1220]">
                Payment Records
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {formatNumber(filtered.length)} repayment
                {filtered.length === 1 ? "" : "s"} in this view
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 border-b border-[#edf1f5] px-4 py-3">
            <label className="flex h-10 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
              <Search className="size-3.5 shrink-0 text-slate-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs font-medium text-[#0b1224] outline-none placeholder:text-slate-400"
                placeholder="Search borrower, phone, loan ID or officer..."
              />
              <span className="hidden rounded-md border border-[#e8edf2] px-1.5 py-0.5 text-[10px] font-bold text-slate-400 sm:inline">
                ⌘K
              </span>
            </label>

            <div className="relative">
              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold shadow-[0_8px_18px_rgba(15,23,42,0.035)] ${
                  methodFilter !== "all"
                    ? "border-emerald-200 bg-emerald-50 text-[var(--forest-emerald)]"
                    : "border-[#e6ebf0] bg-white text-slate-600"
                }`}
              >
                <Filter className="size-3.5" />
                Filter
              </button>
              {filtersOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-52 overflow-hidden rounded-2xl border border-[#e6ebf0] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
                  {(
                    [
                      ["all", "All methods"],
                      ["CASH", "Cash"],
                      ["MOBILE_MONEY", "Mobile money"],
                      ["BANK_TRANSFER", "Bank transfer"],
                      ["OTHER", "Other"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setMethodFilter(value);
                        setFiltersOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold ${
                        methodFilter === value
                          ? "bg-emerald-50 text-[var(--forest-emerald)]"
                          : "text-slate-600 hover:bg-[#f8faf9]"
                      }`}
                    >
                      {label}
                      {methodFilter === value ? (
                        <Check className="size-3.5" />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <select
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as PaymentFilter)
              }
              className="h-10 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold text-[#0b1224] outline-none shadow-[0_8px_18px_rgba(15,23,42,0.035)]"
            >
              <option value="all">All Payments</option>
              <option value="collectedToday">Collected today</option>
              <option value="yesterday">Yesterday</option>
              <option value="thisWeek">This week</option>
            </select>
          </div>

          <div className="hidden grid-cols-[1.45fr_1.05fr_1fr_0.95fr_0.9fr_0.85fr_1.05fr_42px] gap-3 border-b border-[#edf1f5] bg-[#f8faf9] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500 xl:grid">
            <span>Borrower</span>
            <span>Phone</span>
            <span>Loan ID</span>
            <span className="text-right">Amount</span>
            <span>Method</span>
            <span>Officer</span>
            <span className="inline-flex items-center gap-1">
              Date & Time
              <ArrowUpDown className="size-3 text-slate-300" />
            </span>
            <span className="text-right"> </span>
          </div>

          <div className="divide-y divide-[#edf1f5]">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-16 animate-pulse rounded-xl bg-[linear-gradient(90deg,#eef3f0,#f8faf9,#eef3f0)] bg-[length:200%_100%]"
                  />
                ))}
              </div>
            ) : paged.length === 0 ? (
              <div className="px-4 py-14 text-center">
                <Banknote className="mx-auto size-7 text-[var(--forest-emerald)]" />
                <h3 className="mt-3 text-base font-bold text-[#0b1224]">
                  No payments found
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Adjust the filters or date range to see repayments.
                </p>
              </div>
            ) : (
              paged.map((payment, index) => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  currency={currency}
                  toneIndex={index}
                  copiedId={copiedId}
                  onCopy={copyValue}
                />
              ))
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1f5] px-4 py-3 text-xs font-semibold text-slate-500">
            <p>
              Showing {formatNumber(pageStart)} to {formatNumber(pageEnd)} of{" "}
              {formatNumber(filtered.length)} payment
              {filtered.length === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="grid size-8 place-items-center rounded-xl border border-[#edf1f5] text-slate-400 disabled:opacity-40"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, index) => {
                const pageNumber = index + 1;
                return (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setPage(pageNumber)}
                    className={`grid size-8 place-items-center rounded-xl text-xs font-semibold ${
                      currentPage === pageNumber
                        ? "bg-[var(--forest-emerald)] text-white"
                        : "border border-[#edf1f5] text-slate-500"
                    }`}
                  >
                    {pageNumber}
                  </button>
                );
              })}
              <button
                type="button"
                className="grid size-8 place-items-center rounded-xl border border-[#edf1f5] text-slate-400 disabled:opacity-40"
                disabled={currentPage >= totalPages}
                onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
                aria-label="Next page"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="h-8 rounded-xl border border-[#edf1f5] bg-white px-2.5 text-xs font-semibold text-slate-600 outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function PaymentRow({
  payment,
  currency,
  toneIndex,
  copiedId,
  onCopy,
}: {
  payment: OwnerRepayment;
  currency: string;
  toneIndex: number;
  copiedId: string | null;
  onCopy: (key: string, value: string) => void;
}) {
  const methodKey = payment.method.toUpperCase().replace(/\s+/g, "_");
  const isMobile = methodKey.includes("MOBILE");
  const loanShort =
    payment.loanId.length > 10
      ? `${payment.loanId.slice(0, 8)}…`
      : payment.loanId;

  return (
    <article className="grid gap-3 px-4 py-3.5 transition hover:bg-[#fbfdfc] xl:grid-cols-[1.45fr_1.05fr_1fr_0.95fr_0.9fr_0.85fr_1.05fr_42px] xl:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-semibold ${avatarTone(toneIndex)}`}
        >
          {initials(payment.clientName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#0b1224]">
            {payment.clientName}
          </p>
          <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-[var(--forest-emerald)]">
            Active
          </span>
        </div>
      </div>

      <Field label="Phone">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-[#25314b]">
          <Phone className="size-3.5 shrink-0 text-[var(--forest-emerald)]" />
          <span className="truncate">{payment.phone || "—"}</span>
          {payment.phone ? (
            <button
              type="button"
              className="grid size-6 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Copy phone"
              onClick={() => onCopy(`${payment.id}-phone`, payment.phone)}
            >
              {copiedId === `${payment.id}-phone` ? (
                <Check className="size-3 text-[var(--forest-emerald)]" />
              ) : (
                <Copy className="size-3" />
              )}
            </button>
          ) : null}
        </div>
      </Field>

      <Field label="Loan ID">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-[#25314b]">
          <FileText className="size-3.5 shrink-0 text-slate-400" />
          <span className="truncate font-mono">{loanShort}</span>
          <button
            type="button"
            className="grid size-6 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Copy loan ID"
            onClick={() => onCopy(`${payment.id}-loan`, payment.loanId)}
          >
            {copiedId === `${payment.id}-loan` ? (
              <Check className="size-3 text-[var(--forest-emerald)]" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
        </div>
      </Field>

      <Field label="Amount">
        <p className="text-sm font-bold tabular-nums text-[var(--forest-emerald)] xl:text-right">
          {formatMoney(payment.amount, currency)}
        </p>
      </Field>

      <Field label="Method">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            isMobile
              ? "bg-sky-50 text-sky-700"
              : "bg-emerald-50 text-[var(--forest-emerald)]"
          }`}
        >
          {isMobile ? (
            <Smartphone className="size-3" />
          ) : (
            <Banknote className="size-3" />
          )}
          {titleCase(payment.method.replace(/_/g, " "))}
        </span>
      </Field>

      <Field label="Officer">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
            {initials(payment.recordedByName)}
          </span>
          <p className="truncate text-xs font-semibold text-[#0b1224]">
            {payment.recordedByName || "—"}
          </p>
        </div>
      </Field>

      <Field label="Date & Time">
        <p className="text-xs font-medium text-[#25314b]">
          {formatDateTime(payment.recordedAt)}
        </p>
      </Field>

      <div className="flex justify-end">
        <RowActions
          label={`Payment actions for ${payment.clientName}`}
          items={[
            {
              label: "Copy loan ID",
              onSelect: () => onCopy(`${payment.id}-loan`, payment.loanId),
            },
            {
              label: "Copy phone",
              onSelect: () => onCopy(`${payment.id}-phone`, payment.phone),
              disabled: !payment.phone,
            },
          ]}
        />
      </div>
    </article>
  );
}

function MetricCard({
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
  tone: "green" | "blue" | "violet";
}) {
  const toneClass = {
    green: "bg-emerald-50 text-[var(--forest-emerald)]",
    blue: "bg-sky-50 text-sky-600",
    violet: "bg-violet-50 text-violet-600",
  }[tone];

  return (
    <article className="flex min-h-[96px] items-center gap-3 rounded-[14px] border border-[#e6ebf0] bg-white px-4 py-3.5 shadow-[0_12px_26px_rgba(15,23,42,0.045)]">
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-2xl ${toneClass}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-500">{label}</p>
        <p className="mt-1 truncate text-[clamp(0.95rem,1.1vw,1.2rem)] font-semibold leading-tight tabular-nums text-[#111827]">
          {value}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">{detail}</p>
      </div>
    </article>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400 xl:hidden">
        {label}
      </p>
      {children}
    </div>
  );
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(parsed)
    .replace(",", "");
}

function rangeLabelForFilter(
  filter: PaymentFilter,
  rows: OwnerRepayment[],
) {
  const format = (date: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);

  if (rows.length > 0) {
    const times = rows
      .map((row) => new Date(row.recordedAt).getTime())
      .filter((value) => Number.isFinite(value));
    if (times.length > 0) {
      const min = new Date(Math.min(...times));
      const max = new Date(Math.max(...times));
      if (format(min) === format(max)) return format(max);
      return `${format(min)} – ${format(max)}`;
    }
  }

  const today = new Date();
  if (filter === "collectedToday") return format(today);
  if (filter === "yesterday") {
    const previous = new Date(today);
    previous.setDate(previous.getDate() - 1);
    return format(previous);
  }
  if (filter === "thisWeek") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return `${format(start)} – ${format(today)}`;
  }
  return "All time";
}

function initials(name: string) {
  const value = name.trim();
  if (!value) return "P";
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function avatarTone(index: number) {
  const tones = [
    "bg-[#e3f7ed] text-[#087f5d]",
    "bg-[#fff2d9] text-[#c97900]",
    "bg-[#f0e4ff] text-[#7952e8]",
    "bg-[#eaf3ff] text-[#1f73f1]",
    "bg-[#ffe8ef] text-[#d6336c]",
  ];
  return tones[index % tones.length];
}

async function exportPayments(
  rows: OwnerRepayment[],
  currency: string,
  setExporting: (exporting: boolean) => void,
) {
  setExporting(true);
  try {
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Payments");
    worksheet.addRow(["REMBEH Owner Payments"]);
    worksheet.mergeCells(1, 1, 1, 7);
    worksheet.addRow([
      "Borrower",
      "Phone",
      "Loan",
      "Amount",
      "Method",
      "Officer",
      "Date",
    ]);
    rows.forEach((payment) => {
      worksheet.addRow([
        payment.clientName,
        payment.phone,
        payment.loanId,
        payment.amount,
        payment.method,
        payment.recordedByName,
        payment.recordedAt,
      ]);
    });
    worksheet.columns = [
      { width: 24 },
      { width: 18 },
      { width: 18 },
      { width: 16 },
      { width: 14 },
      { width: 20 },
      { width: 24 },
    ];
    worksheet.getRow(1).font = { bold: true, size: 16 };
    worksheet.getRow(2).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F8F68" },
    };
    worksheet.getColumn(4).numFmt = `"${currency}" #,##0`;
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rembeh-owner-payments.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    setExporting(false);
  }
}
