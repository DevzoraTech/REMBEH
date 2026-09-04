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
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  Send,
  Smartphone,
  TrendingUp,
  Users,
  FileText,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../app/app-shell";
import { PaymentDetailDrawer } from "../app/payment-detail-drawer";
import { RowActions } from "../app/row-actions";
import { AppBootSkeleton } from "../app/skeleton";
import {
  OwnerRepayment,
  formatNumber,
  ownerFetch,
  sumBy,
  titleCase,
} from "../../app/owner/owner-common";
import { OwnerHeader } from "../../app/owner/owner-header";
import { useOwnerBranchScope } from "../../app/owner/owner-branch-scope";
import { useOwnerLiveReload } from "../../app/owner/use-owner-live-reload";
import { Money } from "../app/money";
import { TableSearchField } from "../app/table-search-field";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
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

type RepaymentSmsResult = {
  repaymentId: string;
  clientName: string;
  phone: string | null;
  sms: NonNullable<OwnerRepayment["sms"]>;
  sent: boolean;
  alreadySent: boolean;
  skipped: boolean;
  reason: string | null;
};

type RepaymentBulkSmsResult = {
  totalCount: number;
  sentCount: number;
  alreadySentCount: number;
  failedCount: number;
  skippedCount: number;
  results: RepaymentSmsResult[];
  failures: RepaymentSmsResult[];
};

const FILTER_LABELS: Record<PaymentFilter, string> = {
  collectedToday: "Collected Today",
  all: "All Payments",
  yesterday: "Yesterday",
  thisWeek: "This Week",
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
        router.replace(
          role === "manager" ? "/collections/daily" : "/dashboard",
        );
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
  const { matchesBranch, selectedBranchId, selectedBranchName } =
    useOwnerBranchScope();
  const [repayments, setRepayments] = useState<OwnerRepayment[]>([]);
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [smsBusyIds, setSmsBusyIds] = useState<Set<string>>(new Set());
  const [bulkSmsOpen, setBulkSmsOpen] = useState(false);
  const [bulkSmsBusy, setBulkSmsBusy] = useState(false);
  const [smsFailures, setSmsFailures] = useState<RepaymentSmsResult[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null,
  );
  const currency = state.workspace?.currency ?? "UGX";
  const canSendRepaymentSms = Boolean(
    state.session?.permissions.includes("collection.create"),
  );
  const canCorrectRepayments = Boolean(
    state.session &&
      (state.session.permissions.includes("collection.reconcile") ||
        state.session.permissions.includes("operation.close") ||
        state.session.permissions.includes("operation.report.review") ||
        (state.session.permissions.includes("operation.approve") &&
          state.session.permissions.includes("branch.create"))),
  );

  const loadPayments = useCallback(async (opts?: { silent?: boolean }) => {
    if (!state.session) return;
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const payload = await ownerFetch<{ repayments?: OwnerRepayment[] }>(
        state.session,
        `/collections/repayments?filter=${filter}`,
        { branchId: isManager ? (state.branch?.id ?? null) : selectedBranchId },
      );
      setRepayments(payload.repayments ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load payments.",
      );
    } finally {
      setLoading(false);
    }
  }, [filter, isManager, selectedBranchId, state.branch?.id, state.session]);

  const applySmsResults = useCallback((results: RepaymentSmsResult[]) => {
    if (results.length === 0) return;
    const smsById = new Map(
      results.map((result) => [result.repaymentId, result.sms]),
    );
    setRepayments((current) =>
      current.map((payment) => {
        const sms = smsById.get(payment.id);
        return sms ? { ...payment, sms } : payment;
      }),
    );
  }, []);

  const setBusyForIds = useCallback((ids: string[], busy: boolean) => {
    setSmsBusyIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => {
        if (busy) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }, []);

  const sendRepaymentSms = useCallback(
    async (payment: OwnerRepayment, resend = false) => {
      if (
        !state.session ||
        !canSendRepaymentSms ||
        smsBusyIds.has(payment.id)
      ) {
        return;
      }
      setBusyForIds([payment.id], true);
      setError(null);
      setNotice(null);
      setSmsFailures([]);
      try {
        const response = await fetch(
          `${apiBaseUrl}/collections/repayments/${payment.id}/sms`,
          {
            method: "POST",
            headers: {
              Authorization: `${state.session.tokenType} ${state.session.accessToken}`,
              "Content-Type": "application/json",
              "Idempotency-Key": createClientIdempotencyKey(
                `repayment_sms_${payment.id}`,
              ),
            },
            body: JSON.stringify({ resend }),
          },
        );
        const payload = await readApiJson<{
          result?: RepaymentSmsResult;
          message?: string | string[];
        }>(response);
        if (!response.ok || !payload.result) {
          throw new Error(formatApiError(payload.message));
        }
        applySmsResults([payload.result]);
        if (payload.result.sent) {
          setNotice(`SMS sent to ${payment.clientName}.`);
        } else if (payload.result.alreadySent) {
          setNotice(`SMS was already sent to ${payment.clientName}.`);
        } else if (payload.result.skipped) {
          setNotice(smsResultMessage(payload.result));
        } else {
          setSmsFailures([payload.result]);
          setError(smsResultMessage(payload.result));
        }
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Could not send SMS.",
        );
      } finally {
        setBusyForIds([payment.id], false);
      }
    },
    [
      applySmsResults,
      canSendRepaymentSms,
      setBusyForIds,
      smsBusyIds,
      state.session,
    ],
  );

  const sendBulkRepaymentSms = useCallback(
    async (ids: string[], retryFailed = false) => {
      if (!state.session || !canSendRepaymentSms || bulkSmsBusy) return;
      const repaymentIds = [...new Set(ids)];
      if (repaymentIds.length === 0) return;
      setBulkSmsBusy(true);
      setBusyForIds(repaymentIds, true);
      setError(null);
      setNotice(null);
      setSmsFailures([]);
      try {
        const response = await fetch(
          `${apiBaseUrl}/collections/repayments/sms/bulk`,
          {
            method: "POST",
            headers: {
              Authorization: `${state.session.tokenType} ${state.session.accessToken}`,
              "Content-Type": "application/json",
              "Idempotency-Key": createClientIdempotencyKey(
                retryFailed ? "repayment_sms_bulk_retry" : "repayment_sms_bulk",
              ),
            },
            body: JSON.stringify({
              repaymentIds,
              resendFailed: retryFailed,
            }),
          },
        );
        const payload = await readApiJson<
          RepaymentBulkSmsResult & { message?: string | string[] }
        >(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        applySmsResults(payload.results ?? []);
        setSmsFailures(payload.failures ?? []);
        setBulkSmsOpen(false);
        const sentPart = `${payload.sentCount} sent`;
        const alreadyPart =
          payload.alreadySentCount > 0
            ? `, ${payload.alreadySentCount} already sent`
            : "";
        if (payload.failedCount > 0) {
          setError(
            `Some SMS messages were not sent: ${sentPart}${alreadyPart}, ${payload.failedCount} failed.`,
          );
        } else {
          setNotice(`Bulk SMS finished: ${sentPart}${alreadyPart}.`);
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not send bulk repayment SMS.",
        );
      } finally {
        setBusyForIds(repaymentIds, false);
        setBulkSmsBusy(false);
      }
    },
    [
      applySmsResults,
      bulkSmsBusy,
      canSendRepaymentSms,
      setBusyForIds,
      state.session,
    ],
  );

  useEffect(() => {
    const boot = window.setTimeout(() => {
      if (state.ready && state.session) {
        void loadPayments();
      }
    }, 0);
    return () => window.clearTimeout(boot);
  }, [loadPayments, state.ready, state.session]);

  useOwnerLiveReload(loadPayments, Boolean(state.ready && state.session));

  useEffect(() => {
    setPage(1);
  }, [filter, methodFilter, search, pageSize]);

  const scopedPayments = useMemo(() => {
    return repayments.filter((payment) => {
      if (!isManager && !matchesBranch(payment.branchId)) return false;
      const method = payment.method.toUpperCase().replace(/\s+/g, "_");
      return methodFilter === "all" || method === methodFilter;
    });
  }, [isManager, matchesBranch, methodFilter, repayments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopedPayments;
    return scopedPayments.filter((payment) => {
      const digits = q.replace(/\D/g, "");
      const shortLoan = payment.loanId.slice(0, 8);
      const haystack = [
        payment.clientName,
        payment.phone,
        payment.loanId,
        shortLoan,
        payment.method,
        payment.method.replaceAll("_", " "),
        payment.recordedByName,
        String(payment.amount),
        String(payment.amountPaid),
      ]
        .join(" ")
        .toLowerCase();
      return (
        haystack.includes(q) ||
        (digits.length >= 3 &&
          [payment.phone, payment.loanId].some((value) =>
            value.replace(/\D/g, "").includes(digits),
          ))
      );
    });
  }, [scopedPayments, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart =
    filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, filtered.length);
  const paged = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const uniqueBorrowers = useMemo(
    () => new Set(scopedPayments.map((item) => item.customerId)).size,
    [scopedPayments],
  );
  const collectedTotal = useMemo(
    () => sumBy(scopedPayments, (payment) => payment.amount),
    [scopedPayments],
  );
  const dateRangeLabel = useMemo(
    () => rangeLabelForFilter(filter, scopedPayments),
    [filter, scopedPayments],
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
          title="Repayments"
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
                aria-label="Refresh Repayments"
                className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#25314b] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-[#f8faf9] disabled:opacity-60"
              >
                <RefreshCw
                  className={`size-4 ${loading ? "animate-spin" : ""}`}
                />
              </button>
            </>
          }
        />
        <p className="-mt-2 text-sm font-medium text-slate-500">
          {isManager
            ? "Track repayments, review payment activity, and manage cash coming in at your branch."
            : selectedBranchId
              ? `Track repayments and payment activity for ${selectedBranchName}.`
              : "Track repayments, review payment activity, and manage cash coming in across branches."}
        </p>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-[var(--forest-emerald)]">
            {notice}
          </p>
        ) : null}
        {smsFailures.length > 0 ? (
          <section className="rounded-[16px] border border-red-200 bg-red-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-red-800">SMS not sent</h2>
                <p className="mt-1 text-xs font-medium text-red-700">
                  Review these repayments and retry after fixing the issue.
                </p>
              </div>
              <button
                type="button"
                disabled={bulkSmsBusy || !canSendRepaymentSms}
                onClick={() =>
                  void sendBulkRepaymentSms(
                    smsFailures.map((failure) => failure.repaymentId),
                    true,
                  )
                }
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-red-700 px-3 text-xs font-semibold text-white disabled:opacity-60"
              >
                {bulkSmsBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Retry failed
              </button>
            </div>
            <div className="mt-3 divide-y divide-red-100 overflow-hidden rounded-xl border border-red-100 bg-white">
              {smsFailures.slice(0, 8).map((failure) => (
                <div
                  key={failure.repaymentId}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-[#0b1224]">
                    {failure.clientName}
                  </span>
                  <span className="font-medium text-red-700">
                    {friendlySmsReason(
                      failure.reason ?? failure.sms.lastFailureReason,
                    )}
                  </span>
                </div>
              ))}
              {smsFailures.length > 8 ? (
                <p className="px-3 py-2 text-xs font-medium text-red-700">
                  + {smsFailures.length - 8} more not sent
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<Banknote className="size-4" />}
            tone="green"
            label="Total Payments"
            value={formatNumber(scopedPayments.length)}
            detail={
              filter === "collectedToday" ? "Collected Today" : "In This List"
            }
          />
          <MetricCard
            icon={<TrendingUp className="size-4" />}
            tone="green"
            label="Amount Collected"
            value={<Money value={collectedTotal} currency={currency} />}
            detail="Total Received"
          />
          <MetricCard
            icon={<Users className="size-4" />}
            tone="blue"
            label="Borrowers Paid"
            value={formatNumber(uniqueBorrowers)}
            detail="People Who Paid"
          />
          <MetricCard
            icon={<Funnel className="size-4" />}
            tone="violet"
            label="Showing"
            value={FILTER_LABELS[filter]}
            detail={
              methodFilter === "all"
                ? "All Methods"
                : titleCase(methodFilter.replace(/_/g, " "))
            }
          />
        </section>

        <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f5] px-4 py-4">
            <h2 className="text-[15px] font-semibold text-[#0b1220]">
              {isManager
                ? "Branch Payments"
                : selectedBranchId
                  ? `${selectedBranchName} Payments`
                  : "All Payments"}
            </h2>
            <button
              type="button"
              onClick={() => setBulkSmsOpen(true)}
              disabled={
                !canSendRepaymentSms || bulkSmsBusy || filtered.length === 0
              }
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-semibold text-[var(--forest-emerald)] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-emerald-100 disabled:opacity-60"
            >
              {bulkSmsBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <MessageSquare className="size-3.5" />
              )}
              Bulk SMS
            </button>
            <button
              type="button"
              onClick={() =>
                void exportPayments(filtered, currency, setExporting)
              }
              disabled={exporting || filtered.length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3.5 text-xs font-semibold text-[#111a2e] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-[#f8faf9] disabled:opacity-60"
            >
              <Download className="size-3.5" />
              {exporting ? "Exporting" : "Export"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 border-b border-[#edf1f5] px-4 py-3">
            <TableSearchField
              value={search}
              onChange={setSearch}
              placeholder="Search Repayments..."
              title="Search by borrower, phone, loan ID, payment method, amount or officer."
            />
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
                Method
              </button>
              {filtersOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-52 overflow-hidden rounded-2xl border border-[#e6ebf0] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
                  {(
                    [
                      ["all", "All Methods"],
                      ["CASH", "Cash"],
                      ["MOBILE_MONEY", "Mobile Money"],
                      ["BANK_TRANSFER", "Bank Transfer"],
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
              <option value="collectedToday">Collected Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="thisWeek">This Week</option>
            </select>
          </div>

          <div className="hidden grid-cols-[1.35fr_1fr_0.95fr_0.85fr_0.85fr_0.8fr_1fr_0.9fr_42px] gap-3 border-b border-[#dfe5eb] bg-[#e8edf2] px-4 py-3 text-[10px] font-semibold text-slate-600 xl:grid">
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
            <span>SMS</span>
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
                  No Payments Found
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Try another search or change the filters to see repayments.
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
                  canSendSms={canSendRepaymentSms}
                  smsBusy={smsBusyIds.has(payment.id)}
                  onSendSms={(resend) => void sendRepaymentSms(payment, resend)}
                  onViewDetails={() => setSelectedPaymentId(payment.id)}
                />
              ))
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1f5] px-4 py-3 text-xs font-semibold text-slate-500">
            <p>
              Showing {formatNumber(pageStart)} to {formatNumber(pageEnd)} of{" "}
              {formatNumber(filtered.length)}{" "}
              {filtered.length === 1 ? "payment" : "payments"}
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
              {Array.from({ length: Math.min(totalPages, 5) }).map(
                (_, index) => {
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
                },
              )}
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
                  {size} Per Page
                </option>
              ))}
            </select>
          </div>
        </section>
      </div>

      {bulkSmsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(8,15,31,0.36)] p-4 backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close bulk SMS"
            onClick={() => !bulkSmsBusy && setBulkSmsOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#e6ebf0] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--forest-emerald)]">
                  Bulk SMS
                </p>
                <h2 className="mt-1 text-lg font-bold text-[#0b1220]">
                  Send repayment messages
                </h2>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Messages use your SMS notification settings. Already sent
                  repayments will be skipped.
                </p>
              </div>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-xl border border-[#e6ebf0]"
                onClick={() => !bulkSmsBusy && setBulkSmsOpen(false)}
                aria-label="Close"
                disabled={bulkSmsBusy}
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="mt-4 rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 py-2 text-xs font-semibold text-slate-600">
              {formatNumber(filtered.length)} repayment
              {filtered.length === 1 ? "" : "s"} match your current filters.
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="h-10 flex-1 rounded-xl border border-[#e6ebf0] text-xs font-semibold"
                disabled={bulkSmsBusy}
                onClick={() => setBulkSmsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#003f35] text-xs font-semibold text-white disabled:opacity-55"
                disabled={
                  bulkSmsBusy || !canSendRepaymentSms || filtered.length === 0
                }
                onClick={() =>
                  void sendBulkRepaymentSms(
                    filtered.map((payment) => payment.id),
                  )
                }
              >
                {bulkSmsBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <MessageSquare className="size-3.5" />
                )}
                Send messages
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PaymentDetailDrawer
        repaymentId={selectedPaymentId}
        accessToken={state.session.accessToken}
        tokenType={state.session.tokenType}
        canCorrect={canCorrectRepayments}
        onClose={() => setSelectedPaymentId(null)}
        onCorrected={() => void loadPayments()}
      />
    </AppShell>
  );
}

function PaymentRow({
  payment,
  currency,
  toneIndex,
  copiedId,
  onCopy,
  canSendSms,
  smsBusy,
  onSendSms,
  onViewDetails,
}: {
  payment: OwnerRepayment;
  currency: string;
  toneIndex: number;
  copiedId: string | null;
  onCopy: (key: string, value: string) => void;
  canSendSms: boolean;
  smsBusy: boolean;
  onSendSms: (resend: boolean) => void;
  onViewDetails: () => void;
}) {
  const methodKey = payment.method.toUpperCase().replace(/\s+/g, "_");
  const isMobile = methodKey.includes("MOBILE");
  const loanShort =
    payment.loanId.length > 10
      ? `${payment.loanId.slice(0, 8)}…`
      : payment.loanId;
  const sms = payment.sms ?? emptySmsStatus();
  const smsCanSend =
    canSendSms &&
    !smsBusy &&
    sms.status !== "sent" &&
    sms.status !== "sending" &&
    (sms.status !== "failed" || sms.canRetry) &&
    Boolean(payment.phone?.trim());
  const smsActionLabel = sms.status === "failed" ? "Retry SMS" : "Send SMS";

  return (
    <article className="grid gap-3 px-4 py-3.5 transition-colors hover:bg-[#eef7f2] xl:grid-cols-[1.35fr_1fr_0.95fr_0.85fr_0.85fr_0.8fr_1fr_0.9fr_42px] xl:items-center">
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
          <Money value={payment.amount} currency={currency} />
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

      <Field label="SMS">
        <div className="flex flex-wrap items-center gap-1.5">
          <RepaymentSmsBadge sms={sms} />
          {sms.status !== "sent" ? (
            <button
              type="button"
              disabled={!smsCanSend}
              onClick={() => onSendSms(sms.status === "failed")}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 text-[10px] font-bold text-[var(--forest-emerald)] transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {smsBusy || sms.status === "sending" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Send className="size-3" />
              )}
              {smsBusy || sms.status === "sending" ? "Sending" : smsActionLabel}
            </button>
          ) : null}
        </div>
      </Field>

      <div className="flex justify-end">
        <RowActions
          label={`Actions For ${payment.clientName}`}
          busy={smsBusy}
          items={[
            {
              label: "View Details",
              onSelect: onViewDetails,
            },
            {
              label: "Copy Loan ID",
              onSelect: () => onCopy(`${payment.id}-loan`, payment.loanId),
            },
            {
              label: "Copy Phone",
              onSelect: () => onCopy(`${payment.id}-phone`, payment.phone),
              disabled: !payment.phone,
            },
            {
              label: smsActionLabel,
              onSelect: () => onSendSms(sms.status === "failed"),
              disabled: !smsCanSend || sms.status === "sent",
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
  value: ReactNode;
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
        <p className="mt-1 text-[11px] font-semibold text-slate-500">
          {detail}
        </p>
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

function RepaymentSmsBadge({
  sms,
}: {
  sms: NonNullable<OwnerRepayment["sms"]>;
}) {
  if (sms.status === "sent") {
    return (
      <span
        className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-[var(--forest-emerald)]"
        title={
          sms.lastSentAt ? `Sent ${formatDateTime(sms.lastSentAt)}` : "SMS sent"
        }
      >
        Sent
      </span>
    );
  }

  if (sms.status === "sending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-sky-700">
        <Loader2 className="size-2.5 animate-spin" />
        Sending
      </span>
    );
  }

  if (sms.status === "failed") {
    return (
      <span
        className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-red-700"
        title={friendlySmsReason(sms.lastFailureReason)}
      >
        Failed
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-slate-500">
      Not sent
    </span>
  );
}

function emptySmsStatus(): NonNullable<OwnerRepayment["sms"]> {
  return {
    status: "not_sent",
    messageId: null,
    lastSentAt: null,
    lastFailureReason: null,
    canRetry: false,
  };
}

function smsResultMessage(result: RepaymentSmsResult) {
  return `SMS not sent to ${result.clientName}: ${friendlySmsReason(
    result.reason ?? result.sms.lastFailureReason,
  )}.`;
}

function friendlySmsReason(reason?: string | null) {
  switch (reason) {
    case "already_sending":
      return "a message is already being sent";
    case "already_sent":
      return "the message was already sent";
    case "invalid_phone":
    case "no_phone":
      return "there is no valid phone number";
    case "no_credits":
      return "the branch has no SMS credit";
    case "sms_setting_disabled":
      return "repayment SMS is turned off in settings";
    case "provider_unavailable":
      return "the SMS service is unavailable";
    case "provider_rejected":
    case "provider_failed":
    case "provider_skipped":
      return "the SMS provider rejected the message";
    case "provider_ambiguous":
      return "the provider has not confirmed the message yet";
    default:
      return reason ? titleCase(reason.replace(/_/g, " ")) : "unknown reason";
  }
}

function createClientIdempotencyKey(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
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

function rangeLabelForFilter(filter: PaymentFilter, rows: OwnerRepayment[]) {
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
  return "All Time";
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
      "Loan ID",
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
