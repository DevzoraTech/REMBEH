"use client";

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  History,
  Landmark,
  LockKeyhole,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { controlCenterFetch } from "../../lib/control-center-api";
import type { ControlCenterSession } from "../../lib/control-center-session";

import type {
  ControlCenterSubscriptionLifecycleStatus,
  ControlCenterSubscriptionRecord,
  ControlCenterSubscriptionsResponse,
} from "./types";

import {
  ccMoney,
  ccNumber,
} from "./formatters";

type SubscriptionView =
  | "ATTENTION"
  | "UPCOMING"
  | "ACTIVE"
  | "EXPIRED"
  | "LOCKED"
  | "HISTORY";

type LifecycleStatus = ControlCenterSubscriptionLifecycleStatus;

type SubscriptionRecord = ControlCenterSubscriptionRecord;

type AttentionSeverity =
  | "CRITICAL"
  | "ACTION"
  | "WARNING";

const EXPIRING_DAYS = 14;
const PAGE_SIZE = 10;

export function SubscriptionsSection({
  session,
  onOpenClient,
}: {
  session: ControlCenterSession;
  onOpenClient: (tenantId: string) => void;
}) {
  const [records, setRecords] = useState<SubscriptionRecord[]>([]);
  const [data, setData] =
    useState<ControlCenterSubscriptionsResponse | null>(
      null,
    );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [view, setView] =
    useState<SubscriptionView>("ATTENTION");

  const [query, setQuery] = useState("");
  const [organization, setOrganization] = useState("ALL");
  const [plan, setPlan] = useState("ALL");

  const [page, setPage] = useState(1);

  const [selected, setSelected] =
    useState<SubscriptionRecord | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const response =
          await controlCenterFetch<ControlCenterSubscriptionsResponse>(
            "/subscriptions",
            session,
          );

        const next = [
          ...(response.subscriptions ?? []),
        ].sort(compareSubscriptionPriority);

        if (cancelled) return;

        setData({
          ...response,
          subscriptions: next,
        });
        setRecords(next);
      } catch (error) {
        if (cancelled) return;

        setData(null);
        setRecords([]);
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not load subscription information.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [session]);

  const counts = useMemo(() => {
    const stats = data?.stats;

    if (stats) {
      return {
        all: stats.total,
        active: stats.active,
        expiring: stats.expiring,
        expired: stats.expired,
        locked: stats.locked,
        noSubscription: stats.noSubscription,
        attention: stats.attention,
      };
    }

    const active = records.filter(
      (item) => item.lifecycleStatus === "ACTIVE",
    ).length;

    const expiring = records.filter(
      (item) => item.lifecycleStatus === "EXPIRING",
    ).length;

    const expired = records.filter(
      (item) => item.lifecycleStatus === "EXPIRED",
    ).length;

    const locked = records.filter(
      (item) => item.lifecycleStatus === "LOCKED",
    ).length;

    const noSubscription = records.filter(
      (item) => item.lifecycleStatus === "NO_SUBSCRIPTION",
    ).length;

    const attention = records.filter((item) =>
      [
        "EXPIRING",
        "EXPIRED",
        "LOCKED",
        "NO_SUBSCRIPTION",
      ].includes(item.lifecycleStatus),
    ).length;

    return {
      all: records.length,
      active,
      expiring,
      expired,
      locked,
      noSubscription,
      attention,
    };
  }, [data?.stats, records]);

  const organizations = useMemo(
    () =>
      [...new Set(records.map((item) => item.organizationName))]
        .sort((a, b) => a.localeCompare(b)),
    [records],
  );

  const plans = useMemo(
    () =>
      [
        ...new Set(
          records
            .map((item) => item.planCode)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [records],
  );

  const filteredRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return records.filter((item) => {
      const matchesView =
        view === "ATTENTION"
          ? [
              "EXPIRING",
              "EXPIRED",
              "LOCKED",
              "NO_SUBSCRIPTION",
            ].includes(item.lifecycleStatus)
          : view === "UPCOMING"
            ? item.lifecycleStatus === "EXPIRING"
            : view === "ACTIVE"
              ? item.lifecycleStatus === "ACTIVE"
              : view === "EXPIRED"
                ? item.lifecycleStatus === "EXPIRED"
                : view === "LOCKED"
                  ? item.lifecycleStatus === "LOCKED"
                  : true;

      const matchesSearch =
        !needle ||
        [
          item.organizationName,
          item.branchName,
          item.branchAddress,
          item.planCode,
        ].some((value) =>
          (value ?? "")
            .toLowerCase()
            .includes(needle),
        );

      const matchesOrganization =
        organization === "ALL" ||
        item.organizationName === organization;

      const matchesPlan =
        plan === "ALL" ||
        item.planCode === plan;

      return (
        matchesView &&
        matchesSearch &&
        matchesOrganization &&
        matchesPlan
      );
    });
  }, [
    organization,
    plan,
    query,
    records,
    view,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRecords.length / PAGE_SIZE),
  );

  const currentPage = Math.min(page, totalPages);

  const pageRecords = filteredRecords.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function changeView(next: SubscriptionView) {
    setView(next);
    setPage(1);
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[1500px]">
        <PageHeader />

        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={AlertTriangle}
            tone="red"
            label="Needs attention"
            value={ccNumber(counts.attention)}
            secondary="Subscription issues requiring review"
          />

          <MetricCard
            icon={CalendarClock}
            tone="amber"
            label="Expiring soon"
            value={ccNumber(counts.expiring)}
            secondary={`Within ${EXPIRING_DAYS} days`}
          />

          <MetricCard
            icon={LockKeyhole}
            tone="red"
            label="Locked branches"
            value={ccNumber(
              counts.locked,
            )}
            secondary="Subscription access blocked"
          />

          <MetricCard
            icon={CheckCircle2}
            tone="green"
            label="Active subscriptions"
            value={ccNumber(counts.active)}
            secondary={
              records.length
                ? `${Math.round(
                    (counts.active / records.length) * 100,
                  )}% of branches`
                : "No branches"
            }
          />
        </div>

        <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <SubscriptionNavigation
            active={view}
            counts={counts}
            onChange={changeView}
          />

          {view !== "HISTORY" ? (
            <div className="flex flex-wrap items-center gap-2.5 border-t border-[#edf1f4] px-4 py-3">
              <SearchControl
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setPage(1);
                }}
              />

              <SelectControl
                icon={Building2}
                value={organization}
                onChange={(value) => {
                  setOrganization(value);
                  setPage(1);
                }}
                options={[
                  {
                    value: "ALL",
                    label: "All organizations",
                  },
                  ...organizations.map((name) => ({
                    value: name,
                    label: name,
                  })),
                ]}
              />

              <SelectControl
                icon={CreditCard}
                value={plan}
                onChange={(value) => {
                  setPlan(value);
                  setPage(1);
                }}
                options={[
                  {
                    value: "ALL",
                    label: "All plans",
                  },
                  ...plans.map((item) => ({
                    value: item,
                    label: formatPlan(item),
                  })),
                ]}
              />
            </div>
          ) : null}

          {loadError ? (
            <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-[11px] font-medium text-red-700">
              {loadError}
            </div>
          ) : null}

          {loading ? (
            <LoadingState />
          ) : view === "HISTORY" ? (
            <HistoryState />
          ) : view === "ATTENTION" ? (
            <AttentionWorkspace
              records={pageRecords}
              onReview={setSelected}
            />
          ) : (
            <LifecycleTable
              records={pageRecords}
              onReview={setSelected}
            />
          )}

          {!loading &&
          view !== "HISTORY" &&
          filteredRecords.length ? (
            <PaginationFooter
              page={currentPage}
              totalPages={totalPages}
              totalItems={filteredRecords.length}
              firstItem={
                (currentPage - 1) * PAGE_SIZE + 1
              }
              lastItem={Math.min(
                currentPage * PAGE_SIZE,
                filteredRecords.length,
              )}
              onPageChange={setPage}
            />
          ) : null}
        </section>
      </div>

      {selected ? (
        <SubscriptionReviewDrawer
          record={selected}
          onClose={() => setSelected(null)}
          onOpenClient={() => {
            setSelected(null);
            onOpenClient(selected.clientId);
          }}
        />
      ) : null}
    </>
  );
}

function PageHeader() {
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="mb-5 flex items-start justify-between gap-5">
      <div>
        <h1 className="text-[27px] font-bold tracking-[-0.025em] text-[#111d36]">
          Subscriptions
        </h1>

        <p className="mt-1 text-[12.5px] font-normal text-[#63718b]">
          Manage subscription lifecycle, renewals and branch
          access.
        </p>
      </div>

      <p className="mt-2 hidden text-[11px] font-medium text-[#61708a] md:block">
        {date}
      </p>
    </div>
  );
}

function SubscriptionNavigation({
  active,
  counts,
  onChange,
}: {
  active: SubscriptionView;

  counts: {
    all: number;
    active: number;
    expiring: number;
    expired: number;
    locked: number;
    noSubscription: number;
    attention: number;
  };

  onChange: (value: SubscriptionView) => void;
}) {
  const items: Array<{
    value: SubscriptionView;
    label: string;
    count?: number;
  }> = [
    {
      value: "ATTENTION",
      label: "Needs attention",
      count: counts.attention,
    },
    {
      value: "UPCOMING",
      label: "Upcoming renewals",
      count: counts.expiring,
    },
    {
      value: "ACTIVE",
      label: "Active",
      count: counts.active,
    },
    {
      value: "EXPIRED",
      label: "Expired",
      count: counts.expired,
    },
    {
      value: "LOCKED",
      label: "Locked",
      count: counts.locked,
    },
    {
      value: "HISTORY",
      label: "History",
    },
  ];

  return (
    <div className="flex min-h-[53px] items-end gap-1 overflow-x-auto px-3 sm:px-4">
      {items.map((item) => {
        const selected = active === item.value;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`relative flex h-[52px] shrink-0 items-center gap-2 px-3 text-[11px] transition ${
              selected
                ? "font-semibold text-[#168650]"
                : "font-medium text-[#58677f] hover:text-[#17233c]"
            }`}
          >
            {item.label}

            {typeof item.count === "number" ? (
              <span
                className={`grid min-w-[21px] place-items-center rounded-full px-1.5 py-[2px] text-[9px] font-semibold ${
                  selected
                    ? "bg-[#e5f5eb] text-[#188651]"
                    : "bg-[#f1f3f6] text-[#6b7890]"
                }`}
              >
                {item.count}
              </span>
            ) : null}

            {selected ? (
              <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-t-full bg-[#21935e]" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function AttentionWorkspace({
  records,
  onReview,
}: {
  records: SubscriptionRecord[];
  onReview: (record: SubscriptionRecord) => void;
}) {
  if (!records.length) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No subscription issues"
        description="There are currently no subscriptions requiring administrator attention."
      />
    );
  }

  return (
    <div className="border-t border-[#edf1f4]">
      <div className="border-b border-[#edf1f4] bg-[#fcfdfe] px-4 py-3">
        <p className="text-[10.5px] font-semibold text-[#17233c]">
          Requires action
        </p>

        <p className="mt-1 text-[9.5px] font-normal text-[#69768f]">
          Resolve the most urgent subscription lifecycle issues
          first.
        </p>
      </div>

      <div className="divide-y divide-[#edf1f4]">
        {records.map((record) => (
          <AttentionRow
            key={record.id}
            record={record}
            onReview={() => onReview(record)}
          />
        ))}
      </div>
    </div>
  );
}

function AttentionRow({
  record,
  onReview,
}: {
  record: SubscriptionRecord;
  onReview: () => void;
}) {
  const severity = getAttentionSeverity(record);

  const Icon =
    severity === "CRITICAL"
      ? LockKeyhole
      : severity === "ACTION"
        ? AlertTriangle
        : Clock3;

  const tone =
    severity === "CRITICAL"
      ? "red"
      : "amber";

  return (
    <div className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(150px,0.6fr)_minmax(150px,0.6fr)_auto] md:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <SmallIcon
          icon={Icon}
          tone={tone}
        />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[11px] font-semibold text-[#15223a]">
              {record.branchName}
            </p>

            <LifecycleBadge
              value={record.lifecycleStatus}
            />
          </div>

          <p className="mt-1 truncate text-[9.5px] font-medium text-[#61708a]">
            {record.organizationName}
          </p>

          {record.branchAddress ? (
            <p className="mt-0.5 truncate text-[9px] font-normal text-[#8a94a5]">
              {record.branchAddress}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <p className="text-[9px] font-medium uppercase tracking-[0.04em] text-[#8a94a5]">
          Subscription
        </p>

        <p className="mt-1 text-[10.5px] font-semibold text-[#26344d]">
          {subscriptionIssueTitle(record)}
        </p>

        <p className="mt-0.5 text-[9px] font-normal text-[#6b7890]">
          {subscriptionIssueDescription(record)}
        </p>
      </div>

      <div>
        <p className="text-[9px] font-medium uppercase tracking-[0.04em] text-[#8a94a5]">
          Current plan
        </p>

        <p className="mt-1 text-[10.5px] font-semibold text-[#26344d]">
          {formatPlan(record.planCode)}
        </p>

        <p className="mt-0.5 text-[9px] font-normal text-[#6b7890]">
          {record.currentPeriodEnd
            ? `Period ends ${formatDate(
                record.currentPeriodEnd,
              )}`
            : "No active period"}
        </p>
      </div>

      <button
        type="button"
        onClick={onReview}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#cfe3d7] bg-[#f4faf6] px-3 text-[10px] font-semibold text-[#168650] transition hover:bg-[#eaf6ef]"
      >
        Review
        <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
}

function LifecycleTable({
  records,
  onReview,
}: {
  records: SubscriptionRecord[];
  onReview: (record: SubscriptionRecord) => void;
}) {
  if (!records.length) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No subscriptions found"
        description="No branch subscriptions match the selected view and filters."
      />
    );
  }

  return (
    <div className="overflow-x-auto border-t border-[#edf1f4]">
      <table className="w-full min-w-[980px] table-fixed text-left">
        <thead>
          <tr className="bg-[#fcfdfe] text-[9.5px] font-semibold text-[#56647d]">
            <th className="w-[29%] px-4 py-2.5">
              Branch
            </th>

            <th className="w-[15%] px-3 py-2.5">
              Plan
            </th>

            <th className="w-[16%] px-3 py-2.5">
              Status
            </th>

            <th className="w-[17%] px-3 py-2.5">
              Current period
            </th>

            <th className="w-[11%] px-3 py-2.5">
              Activity
            </th>

            <th className="w-[12%] px-3 py-2.5 text-right">
              Action
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-[#edf1f4]">
          {records.map((record, index) => (
            <tr
              key={record.id}
              className="h-[66px] transition hover:bg-[#fbfcfd]"
            >
              <td className="px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <SmallIcon
                    icon={Landmark}
                    tone={
                      index % 3 === 0
                        ? "green"
                        : index % 3 === 1
                          ? "blue"
                          : "amber"
                    }
                  />

                  <div className="min-w-0">
                    <p className="truncate text-[10.5px] font-semibold text-[#17233c]">
                      {record.branchName}
                    </p>

                    <p className="mt-1 truncate text-[9.5px] font-normal text-[#64738d]">
                      {record.organizationName}
                    </p>
                  </div>
                </div>
              </td>

              <td className="px-3 py-2.5">
                <p className="text-[10.5px] font-semibold text-[#26344d]">
                  {formatPlan(record.planCode)}
                </p>
              </td>

              <td className="px-3 py-2.5">
                <LifecycleBadge
                  value={record.lifecycleStatus}
                />
              </td>

              <td className="px-3 py-2.5">
                <p className="text-[10px] font-medium text-[#26344d]">
                  {record.currentPeriodEnd
                    ? formatDate(
                        record.currentPeriodEnd,
                      )
                    : "—"}
                </p>

                {record.daysRemaining !== null ? (
                  <p
                    className={`mt-1 text-[9px] font-medium ${
                      record.daysRemaining < 0
                        ? "text-[#cf4141]"
                        : record.daysRemaining <=
                            EXPIRING_DAYS
                          ? "text-[#c77813]"
                          : "text-[#168650]"
                    }`}
                  >
                    {formatRemainingDays(
                      record.daysRemaining,
                    )}
                  </p>
                ) : null}
              </td>

              <td className="px-3 py-2.5">
                <p className="text-[9.5px] font-medium text-[#526078]">
                  {record.lastUsedAt
                    ? formatDate(record.lastUsedAt)
                    : "Not available"}
                </p>
              </td>

              <td className="px-3 py-2.5 text-right">
                <button
                  type="button"
                  onClick={() => onReview(record)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold text-[#168650] transition hover:bg-[#f0f8f3]"
                >
                  Review
                  <ChevronRight className="size-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubscriptionReviewDrawer({
  record,
  onClose,
  onOpenClient,
}: {
  record: SubscriptionRecord;
  onClose: () => void;
  onOpenClient: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        className="absolute inset-0 bg-[#0f172a]/30 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Close subscription review"
      />

      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[470px] flex-col border-l border-[#dfe5eb] bg-white shadow-[-12px_0_35px_rgba(15,23,42,0.1)]">
        <div className="flex h-[68px] shrink-0 items-center justify-between border-b border-[#e7ebef] px-5">
          <div>
            <p className="text-[13px] font-semibold text-[#15223a]">
              Subscription review
            </p>

            <p className="mt-0.5 text-[9.5px] font-normal text-[#718099]">
              Review lifecycle and branch access.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-[#64738d] transition hover:bg-[#f4f6f8]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-[#edf1f4] px-5 py-5">
            <div className="flex items-start gap-3">
              <SmallIcon
                icon={Landmark}
                tone="green"
              />

              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#15223a]">
                  {record.branchName}
                </p>

                <p className="mt-1 text-[10px] font-medium text-[#61708a]">
                  {record.organizationName}
                </p>

                {record.branchAddress ? (
                  <p className="mt-1 text-[9.5px] leading-4 text-[#7b879a]">
                    {record.branchAddress}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-4">
              <LifecycleBadge
                value={record.lifecycleStatus}
              />
            </div>
          </div>

          <DrawerSection title="Current subscription">
            <DetailRow
              label="Plan"
              value={formatPlan(record.planCode)}
            />

            <DetailRow
              label="Period end"
              value={
                record.currentPeriodEnd
                  ? formatDate(record.currentPeriodEnd)
                  : "No active period"
              }
            />

            <DetailRow
              label="Time remaining"
              value={
                record.daysRemaining === null
                  ? "Not available"
                  : formatRemainingDays(
                      record.daysRemaining,
                    )
              }
            />

            <DetailRow
              label="Branch access"
              value={
                record.lifecycleStatus === "LOCKED"
                  ? "Locked"
                  : record.branchStatus
              }
            />
          </DrawerSection>

          <DrawerSection title="Branch usage">
            <DetailRow
              label="Users"
              value={ccNumber(record.users)}
            />

            <DetailRow
              label="Borrowers"
              value={ccNumber(record.borrowers)}
            />

            <DetailRow
              label="Loans"
              value={ccNumber(record.loans)}
            />

            <DetailRow
              label="Last used"
              value={
                record.lastUsedAt
                  ? formatDate(record.lastUsedAt)
                  : "Not available"
              }
            />
          </DrawerSection>

          <DrawerSection title="Subscription payments">
            <DetailRow
              label="Payments recorded"
              value={ccNumber(
                record.subscriptionPayments,
              )}
            />

            <DetailRow
              label="Subscription revenue"
              value={ccMoney(
                record.subscriptionRevenue,
                record.currency,
              )}
            />
          </DrawerSection>

          {record.lifecycleStatus !== "ACTIVE" ? (
            <div className="mx-5 mb-5 rounded-lg border border-[#f0dfc4] bg-[#fffaf1] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#c77917]" />

                <div>
                  <p className="text-[10.5px] font-semibold text-[#4a371c]">
                    Administrator review required
                  </p>

                  <p className="mt-1 text-[9.5px] font-normal leading-4 text-[#7b6748]">
                    {drawerIssueDescription(record)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-[#e7ebef] bg-[#fbfcfd] px-5 py-4">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-md border border-[#dce2e8] bg-white px-3.5 text-[10px] font-semibold text-[#526078] transition hover:bg-[#f6f8fa]"
            >
              Close
            </button>

            <button
              type="button"
              onClick={onOpenClient}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#188653] px-3.5 text-[10px] font-semibold text-white transition hover:bg-[#147849]"
            >
              Open client
              <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function HistoryState() {
  return (
    <div className="border-t border-[#edf1f4]">
      <EmptyState
        icon={History}
        title="Subscription history"
        description="Subscription lifecycle history will appear here once the Control Center API exposes subscription period and access-history records."
      />
    </div>
  );
}

function MetricCard({
  icon,
  tone,
  label,
  value,
  secondary,
}: {
  icon: LucideIcon;
  tone: IconTone;
  label: string;
  value: string;
  secondary: string;
}) {
  return (
    <section className="flex min-h-[108px] items-center gap-4 rounded-[10px] border border-[#dfe5eb] bg-white px-4">
      <LargeIcon
        icon={icon}
        tone={tone}
      />

      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-[#5e6c84]">
          {label}
        </p>

        <p className="mt-1 truncate text-[22px] font-bold leading-7 tracking-[-0.02em] text-[#101d37]">
          {value}
        </p>

        <p className="mt-1 text-[9.5px] font-normal text-[#68758d]">
          {secondary}
        </p>
      </div>
    </section>
  );
}

function SearchControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex h-9 min-w-[280px] flex-1 items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3 focus-within:border-[#87bfa1] focus-within:ring-2 focus-within:ring-[#e6f4eb]">
      <Search className="size-3.5 shrink-0 text-[#64738c]" />

      <input
        type="search"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder="Search branch or organization..."
        className="min-w-0 flex-1 bg-transparent text-[10.5px] font-normal text-[#17233c] outline-none placeholder:text-[#8c97a9]"
      />
    </label>
  );
}

function SelectControl({
  icon: Icon,
  value,
  onChange,
  options,
}: {
  icon: LucideIcon;

  value: string;

  onChange: (value: string) => void;

  options: Array<{
    value: string;
    label: string;
  }>;
}) {
  return (
    <label className="relative flex h-9 min-w-[190px] items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3">
      <Icon className="size-3.5 shrink-0 text-[#52627c]" />

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="min-w-0 flex-1 appearance-none bg-transparent pr-5 text-[10px] font-medium text-[#34425b] outline-none"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>

      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-[#68768f]" />
    </label>
  );
}

function LifecycleBadge({
  value,
}: {
  value: LifecycleStatus;
}) {
  const styles =
    value === "ACTIVE"
      ? "bg-[#eaf6ee] text-[#1b804e]"
      : value === "EXPIRING"
        ? "bg-[#fff3df] text-[#ba6a12]"
        : value === "EXPIRED"
          ? "bg-[#fff0f0] text-[#c94040]"
          : value === "LOCKED"
            ? "bg-[#fff0f0] text-[#c94040]"
            : "bg-[#eef2f6] text-[#59677d]";

  return (
    <span
      className={`inline-flex min-h-[21px] items-center rounded-[5px] px-2 text-[9px] font-semibold ${styles}`}
    >
      {value === "ACTIVE"
        ? "Active"
        : value === "EXPIRING"
          ? "Expiring soon"
          : value === "EXPIRED"
            ? "Expired"
            : value === "LOCKED"
              ? "Locked"
              : "No subscription"}
    </span>
  );
}

function PaginationFooter({
  page,
  totalPages,
  totalItems,
  firstItem,
  lastItem,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  firstItem: number;
  lastItem: number;
  onPageChange: (page: number) => void;
}) {
  const pages = paginationPages(
    page,
    totalPages,
  );

  return (
    <div className="flex min-h-[48px] flex-wrap items-center justify-between gap-3 border-t border-[#edf1f4] px-4 py-2">
      <p className="text-[9.5px] font-normal text-[#68768f]">
        Showing {firstItem} to {lastItem} of{" "}
        {totalItems}
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() =>
            onPageChange(page - 1)
          }
          className="grid size-8 place-items-center rounded-md border border-[#dfe5eb] bg-white text-[#60708a] disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" />
        </button>

        {pages.map((item, index) =>
          item === "..." ? (
            <span
              key={`ellipsis-${index}`}
              className="grid size-8 place-items-center text-[10px] text-[#748097]"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() =>
                onPageChange(item)
              }
              className={`grid size-8 place-items-center rounded-md border text-[10px] font-semibold ${
                item === page
                  ? "border-[#24915d] bg-[#f0f8f3] text-[#168650]"
                  : "border-[#dfe5eb] bg-white text-[#53627a]"
              }`}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() =>
            onPageChange(page + 1)
          }
          className="grid size-8 place-items-center rounded-md border border-[#dfe5eb] bg-white text-[#60708a] disabled:opacity-40"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-[250px] place-items-center px-6 py-12 text-center">
      <div>
        <div className="mx-auto grid size-11 place-items-center rounded-full bg-[#eef6f1] text-[#168650]">
          <Icon className="size-5" />
        </div>

        <p className="mt-3 text-[12px] font-semibold text-[#17233c]">
          {title}
        </p>

        <p className="mx-auto mt-1 max-w-md text-[10px] font-normal leading-5 text-[#6b7890]">
          {description}
        </p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="border-t border-[#edf1f4]">
      {Array.from({ length: 5 }).map(
        (_, index) => (
          <div
            key={index}
            className="flex h-[76px] animate-pulse items-center gap-4 border-b border-[#edf1f4] px-4"
          >
            <div className="size-9 rounded-lg bg-slate-100" />

            <div className="h-3 w-[190px] rounded bg-slate-100" />

            <div className="ml-auto h-3 w-[110px] rounded bg-slate-100" />

            <div className="h-3 w-[85px] rounded bg-slate-100" />
          </div>
        ),
      )}
    </div>
  );
}

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[#edf1f4] px-5 py-5">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#728097]">
        {title}
      </p>

      <div className="space-y-3">
        {children}
      </div>
    </section>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[10px] font-normal text-[#718099]">
        {label}
      </span>

      <span className="max-w-[240px] text-right text-[10.5px] font-semibold text-[#26344d]">
        {value}
      </span>
    </div>
  );
}

type IconTone =
  | "green"
  | "blue"
  | "amber"
  | "red";

function LargeIcon({
  icon: Icon,
  tone,
}: {
  icon: LucideIcon;
  tone: IconTone;
}) {
  return (
    <span
      className={`grid size-[52px] shrink-0 place-items-center rounded-[11px] ${iconTone(
        tone,
      )}`}
    >
      <Icon
        className="size-[22px]"
        strokeWidth={1.9}
      />
    </span>
  );
}

function SmallIcon({
  icon: Icon,
  tone,
}: {
  icon: LucideIcon;
  tone: IconTone;
}) {
  return (
    <span
      className={`grid size-[35px] shrink-0 place-items-center rounded-[8px] ${iconTone(
        tone,
      )}`}
    >
      <Icon
        className="size-[16px]"
        strokeWidth={1.9}
      />
    </span>
  );
}

function iconTone(
  tone: IconTone,
) {
  if (tone === "blue") {
    return "bg-[#edf4ff] text-[#276de9]";
  }

  if (tone === "amber") {
    return "bg-[#fff3df] text-[#e38012]";
  }

  if (tone === "red") {
    return "bg-[#fff0f0] text-[#df4545]";
  }

  return "bg-[#eaf6ee] text-[#198b55]";
}

function compareSubscriptionPriority(
  a: SubscriptionRecord,
  b: SubscriptionRecord,
) {
  const priority: Record<
    LifecycleStatus,
    number
  > = {
    LOCKED: 0,
    EXPIRED: 1,
    NO_SUBSCRIPTION: 2,
    EXPIRING: 3,
    ACTIVE: 4,
  };

  const difference =
    priority[a.lifecycleStatus] -
    priority[b.lifecycleStatus];

  if (difference !== 0) {
    return difference;
  }

  if (
    a.daysRemaining !== null &&
    b.daysRemaining !== null
  ) {
    return (
      a.daysRemaining -
      b.daysRemaining
    );
  }

  return a.organizationName.localeCompare(
    b.organizationName,
  );
}

function getAttentionSeverity(
  record: SubscriptionRecord,
): AttentionSeverity {
  if (
    record.lifecycleStatus === "LOCKED" ||
    record.lifecycleStatus === "EXPIRED"
  ) {
    return "CRITICAL";
  }

  if (
    record.lifecycleStatus ===
    "NO_SUBSCRIPTION"
  ) {
    return "ACTION";
  }

  return "WARNING";
}

function subscriptionIssueTitle(
  record: SubscriptionRecord,
) {
  if (
    record.lifecycleStatus === "LOCKED"
  ) {
    return "Branch access locked";
  }

  if (
    record.lifecycleStatus === "EXPIRED"
  ) {
    return "Subscription expired";
  }

  if (
    record.lifecycleStatus ===
    "NO_SUBSCRIPTION"
  ) {
    return "No active subscription";
  }

  if (
    record.daysRemaining === 0
  ) {
    return "Expires today";
  }

  return `Expires in ${record.daysRemaining ?? 0} ${
    record.daysRemaining === 1
      ? "day"
      : "days"
  }`;
}

function subscriptionIssueDescription(
  record: SubscriptionRecord,
) {
  if (
    record.lifecycleStatus === "LOCKED"
  ) {
    return "Subscription access is currently blocked.";
  }

  if (
    record.lifecycleStatus === "EXPIRED"
  ) {
    return record.currentPeriodEnd
      ? `Expired ${formatDate(
          record.currentPeriodEnd,
        )}`
      : "Subscription period has ended.";
  }

  if (
    record.lifecycleStatus ===
    "NO_SUBSCRIPTION"
  ) {
    return "Branch has no current subscription period.";
  }

  return "Renewal should be reviewed.";
}

function drawerIssueDescription(
  record: SubscriptionRecord,
) {
  if (
    record.lifecycleStatus === "LOCKED"
  ) {
    return "This branch is currently locked. Review its payment and subscription status before restoring access.";
  }

  if (
    record.lifecycleStatus === "EXPIRED"
  ) {
    return "The current subscription period has expired. Review recent payments and renewal status.";
  }

  if (
    record.lifecycleStatus ===
    "NO_SUBSCRIPTION"
  ) {
    return "This branch does not currently have an active subscription period.";
  }

  return "This subscription is approaching its renewal date. Review whether payment or client follow-up is required.";
}

function formatRemainingDays(
  days: number,
) {
  if (days < 0) {
    const absolute = Math.abs(days);

    return `${absolute} ${
      absolute === 1 ? "day" : "days"
    } overdue`;
  }

  if (days === 0) {
    return "Expires today";
  }

  return `${days} ${
    days === 1 ? "day" : "days"
  } remaining`;
}

function formatPlan(
  value: string | null,
) {
  if (!value) {
    return "No plan";
  }

  const normalized =
    value.toUpperCase();

  if (
    normalized.includes("6M") ||
    normalized.includes("6_MONTH")
  ) {
    return "6 Months";
  }

  if (
    normalized.includes("3M") ||
    normalized.includes("3_MONTH")
  ) {
    return "3 Months";
  }

  if (
    normalized.includes("MONTH") ||
    normalized === "PRO"
  ) {
    return "Monthly";
  }

  return value
    .replace(/^PRO_?/i, "")
    .replace(/_/g, " ");
}

function formatDate(
  value: string,
) {
  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

function paginationPages(
  current: number,
  total: number,
): Array<number | "..."> {
  if (total <= 5) {
    return Array.from(
      { length: total },
      (_, index) => index + 1,
    );
  }

  if (current <= 3) {
    return [
      1,
      2,
      3,
      "...",
      total,
    ];
  }

  if (current >= total - 2) {
    return [
      1,
      "...",
      total - 2,
      total - 1,
      total,
    ];
  }

  return [
    1,
    "...",
    current,
    "...",
    total,
  ];
}
