"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Download,
  FileSpreadsheet,
  Gauge,
  Landmark,
  LineChart,
  RefreshCw,
  Search,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { controlCenterFetch } from "../../lib/control-center-api";
import type { ControlCenterSession } from "../../lib/control-center-session";

import type {
  ControlCenterBranch,
  ControlCenterClient,
  ControlCenterClientDetail,
  ControlCenterDashboard,
  ControlCenterReportsOverview,
} from "./types";

import {
  ccMoney,
  ccNumber,
} from "./formatters";

type ReportView =
  | "OVERVIEW"
  | "COMMERCIAL"
  | "OPERATIONS"
  | "EXPORTS";

type ReportRange =
  | "30_DAYS"
  | "90_DAYS"
  | "180_DAYS"
  | "THIS_YEAR"
  | "CUSTOM";

type TrendMetric =
  | "REPAYMENTS"
  | "PRINCIPAL"
  | "LOANS"
  | "BORROWERS"
  | "SUBSCRIPTION_REVENUE";

type OrganizationReportRow = {
  id: string;
  name: string;
  ownerName: string | null;
  status: string;

  branches: number;
  activeBranches: number;
  lockedBranches: number;

  users: number;
  borrowers: number;
  loans: number;

  repaymentsCollected: number;
  repaymentCount: number;

  subscriptionRevenue: number;
  subscriptionPayments: number;

  lastUsedAt: string | null;
};

type BranchReportRow = ControlCenterBranch & {
  organizationId: string;
  organizationName: string;
  currency: string;
};

export function ReportsSection({
  session,
  dashboard,
  clients = [],
  onOpenClient,
}: {
  session: ControlCenterSession;
  dashboard: ControlCenterDashboard | null;
  clients?: ControlCenterClient[];
  onOpenClient: (tenantId: string) => void;
}) {
  const clientRows =
    Array.isArray(clients)
      ? clients
      : [];

  const [view, setView] =
    useState<ReportView>("OVERVIEW");

  const [range, setRange] =
    useState<ReportRange>("30_DAYS");

  const [dateFrom, setDateFrom] =
    useState("");

  const [dateTo, setDateTo] =
    useState("");

  const [report, setReport] =
    useState<ControlCenterReportsOverview | null>(null);

  const [details, setDetails] =
    useState<ControlCenterClientDetail[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [detailsLoading, setDetailsLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [query, setQuery] =
    useState("");

  const [trendMetric, setTrendMetric] =
    useState<TrendMetric>("REPAYMENTS");

  async function loadReport() {
    setLoading(true);
    setError(null);

    try {
      const params =
        new URLSearchParams();

      params.set(
        "range",
        range,
      );

      if (
        range === "CUSTOM"
      ) {
        if (
          dateFrom
        ) {
          params.set(
            "dateFrom",
            dateFrom,
          );
        }

        if (
          dateTo
        ) {
          params.set(
            "dateTo",
            dateTo,
          );
        }
      }

      const data =
        await controlCenterFetch<ControlCenterReportsOverview>(
          `/reports/overview?${params.toString()}`,
          session,
        );

      setReport(
        data,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load reports.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (
      range === "CUSTOM" &&
      (!dateFrom || !dateTo)
    ) {
      return;
    }

    void loadReport();
  }, [
    range,
    session,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      if (!clientRows.length) {
        setDetails([]);
        setDetailsLoading(false);
        return;
      }

      setDetailsLoading(true);

      try {
        const results =
          await Promise.allSettled(
            clientRows.map(
              (client) =>
                controlCenterFetch<ControlCenterClientDetail>(
                  `/clients/${client.id}`,
                  session,
                ),
            ),
          );

        if (cancelled) {
          return;
        }

        setDetails(
          results.flatMap(
            (result) =>
              result.status === "fulfilled"
                ? [result.value]
                : [],
          ),
        );
      } finally {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [
    clientRows,
    session,
  ]);

  const branchRows =
    useMemo<BranchReportRow[]>(
      () =>
        details.flatMap((detail) =>
          detail.branches.map((branch) => ({
            ...branch,
            organizationId:
              detail.client.id,
            organizationName:
              detail.client.name,
            currency:
              detail.client.currency,
          })),
        ),
      [details],
    );

  const organizationRows =
    useMemo<OrganizationReportRow[]>(
      () =>
        details.map((detail) => ({
          id:
            detail.client.id,

          name:
            detail.client.name,

          ownerName:
            detail.client.owner?.name ??
            null,

          status:
            detail.client.status,

          branches:
            detail.client.summary.totalBranches,

          activeBranches:
            detail.client.summary.activeBranches,

          lockedBranches:
            detail.client.summary.suspendedBranches,

          users:
            detail.client.summary.totalUsers,

          borrowers:
            detail.branches.reduce(
              (sum, branch) =>
                sum +
                branch.borrowers,
              0,
            ),

          loans:
            detail.branches.reduce(
              (sum, branch) =>
                sum +
                branch.loans,
              0,
            ),

          repaymentsCollected:
            detail.branches.reduce(
              (sum, branch) =>
                sum +
                Number(
                  branch.repaymentsCollected ??
                    0,
                ),
              0,
            ),

          repaymentCount:
            detail.branches.reduce(
              (sum, branch) =>
                sum +
                branch.repaymentCount,
              0,
            ),

          subscriptionRevenue:
            detail.branches.reduce(
              (sum, branch) =>
                sum +
                Number(
                  branch.subscriptionRevenue ??
                    0,
                ),
              0,
            ),

          subscriptionPayments:
            detail.branches.reduce(
              (sum, branch) =>
                sum +
                branch.subscriptionPayments,
              0,
            ),

          lastUsedAt:
            latestDate(
              detail.branches
                .map(
                  (branch) =>
                    branch.lastUsedAt,
                )
                .filter(
                  (
                    value,
                  ): value is string =>
                    Boolean(value),
                ),
            ),
        })),
      [details],
    );

  const filteredOrganizations =
    useMemo(() => {
      const needle =
        query
          .trim()
          .toLowerCase();

      if (
        !needle
      ) {
        return organizationRows;
      }

      return organizationRows.filter(
        (row) =>
          [
            row.name,
            row.ownerName,
            row.status,
          ].some((value) =>
            String(
              value ?? "",
            )
              .toLowerCase()
              .includes(
                needle,
              ),
          ),
      );
    }, [
      organizationRows,
      query,
    ]);

  const period =
    report?.periodMetrics;

  const previous =
    report?.previousPeriod;

  const trendRows =
    report?.trends ?? [];

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <PageHeader
        range={range}
        setRange={setRange}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        loading={loading}
        onApplyCustom={() =>
          void loadReport()
        }
        onRefresh={() =>
          void loadReport()
        }
      />

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <ComparisonMetricCard
          icon={WalletCards}
          tone="green"
          label="Principal disbursed"
          value={ccMoney(
            period?.principalDisbursed ??
              0,
          )}
          current={
            period?.principalDisbursed ??
            0
          }
          previous={
            previous?.principalDisbursed ??
            0
          }
        />

        <ComparisonMetricCard
          icon={Activity}
          tone="blue"
          label="Repayments collected"
          value={ccMoney(
            period?.repaymentsCollected ??
              0,
          )}
          current={
            period?.repaymentsCollected ??
            0
          }
          previous={
            previous?.repaymentsCollected ??
            0
          }
        />

        <ComparisonMetricCard
          icon={Gauge}
          tone="amber"
          label="Loans disbursed"
          value={ccNumber(
            period?.disbursedLoans ??
              0,
          )}
          current={
            period?.disbursedLoans ??
            0
          }
          previous={
            previous?.disbursedLoans ??
            0
          }
        />

        <ComparisonMetricCard
          icon={CreditCard}
          tone="purple"
          label="Subscription revenue"
          value={ccMoney(
            period?.subscriptionRevenue ??
              0,
          )}
          current={
            period?.subscriptionRevenue ??
            0
          }
          previous={
            previous?.subscriptionRevenue ??
            0
          }
        />
      </div>

      <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
        <ReportTabs
          active={view}
          onChange={setView}
        />

        {error ? (
          <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-[10px] font-medium text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <ReportLoadingState />
        ) : view ===
          "OVERVIEW" ? (
          <OverviewView
            report={report}
            trendMetric={
              trendMetric
            }
            onTrendMetricChange={
              setTrendMetric
            }
            trendRows={
              trendRows
            }
            organizations={
              filteredOrganizations
            }
            query={query}
            onQueryChange={
              setQuery
            }
            onOpenClient={
              onOpenClient
            }
          />
        ) : view ===
          "COMMERCIAL" ? (
          <CommercialView
            report={report}
            organizations={
              filteredOrganizations
            }
            branchRows={
              branchRows
            }
            dashboard={
              dashboard
            }
            onOpenClient={
              onOpenClient
            }
          />
        ) : view ===
          "OPERATIONS" ? (
          <OperationsView
            report={report}
            organizations={
              filteredOrganizations
            }
            onOpenClient={
              onOpenClient
            }
          />
        ) : (
          <ExportsView
            organizations={
              organizationRows
            }
            branches={
              branchRows
            }
            report={
              report
            }
            detailsLoading={
              detailsLoading
            }
          />
        )}
      </section>
    </div>
  );
}

function PageHeader({
  range,
  setRange,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  loading,
  onApplyCustom,
  onRefresh,
}: {
  range: ReportRange;
  setRange: (
    value: ReportRange,
  ) => void;
  dateFrom: string;
  setDateFrom: (
    value: string,
  ) => void;
  dateTo: string;
  setDateTo: (
    value: string,
  ) => void;
  loading: boolean;
  onApplyCustom: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[27px] font-bold tracking-[-0.025em] text-[#111d36]">
          Reports
        </h1>

        <p className="mt-1 text-[12.5px] font-normal text-[#63718b]">
          Analyze lending activity, collections and subscription
          performance across Rembeh.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SelectControl
          value={range}
          onChange={(
            value,
          ) =>
            setRange(
              value as
                ReportRange,
            )
          }
          options={[
            {
              value:
                "30_DAYS",
              label:
                "Last 30 days",
            },
            {
              value:
                "90_DAYS",
              label:
                "Last 90 days",
            },
            {
              value:
                "180_DAYS",
              label:
                "Last 180 days",
            },
            {
              value:
                "THIS_YEAR",
              label:
                "This year",
            },
            {
              value:
                "CUSTOM",
              label:
                "Custom range",
            },
          ]}
        />

        {range ===
        "CUSTOM" ? (
          <>
            <input
              type="date"
              value={
                dateFrom
              }
              onChange={(
                event,
              ) =>
                setDateFrom(
                  event.target.value,
                )
              }
              className="h-9 rounded-md border border-[#dfe5eb] bg-white px-3 text-[10px] text-[#526078]"
            />

            <input
              type="date"
              value={
                dateTo
              }
              onChange={(
                event,
              ) =>
                setDateTo(
                  event.target.value,
                )
              }
              className="h-9 rounded-md border border-[#dfe5eb] bg-white px-3 text-[10px] text-[#526078]"
            />

            <button
              type="button"
              disabled={
                !dateFrom ||
                !dateTo ||
                loading
              }
              onClick={
                onApplyCustom
              }
              className="h-9 rounded-md bg-[#188653] px-3.5 text-[10px] font-semibold text-white disabled:opacity-40"
            >
              Apply
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={
            onRefresh
          }
          disabled={
            loading
          }
          className="grid size-9 place-items-center rounded-md border border-[#dfe5eb] bg-white text-[#61708a] hover:bg-[#f7f9fa] disabled:opacity-40"
        >
          <RefreshCw
            className={`size-3.5 ${
              loading
                ? "animate-spin"
                : ""
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function ReportTabs({
  active,
  onChange,
}: {
  active: ReportView;
  onChange: (
    value: ReportView,
  ) => void;
}) {
  const items: Array<{
    value: ReportView;
    label: string;
  }> = [
    {
      value: "OVERVIEW",
      label: "Overview",
    },
    {
      value: "COMMERCIAL",
      label: "Subscriptions & revenue",
    },
    {
      value: "OPERATIONS",
      label: "Client operations",
    },
    {
      value: "EXPORTS",
      label: "Exports",
    },
  ];

  return (
    <div className="flex min-h-[53px] items-end gap-1 overflow-x-auto px-3 sm:px-4">
      {items.map((item) => {
        const selected =
          active === item.value;

        return (
          <button
            key={
              item.value
            }
            type="button"
            onClick={() =>
              onChange(
                item.value,
              )
            }
            className={`relative flex h-[52px] shrink-0 items-center px-3 text-[11px] transition ${
              selected
                ? "font-semibold text-[#168650]"
                : "font-medium text-[#58677f] hover:text-[#17233c]"
            }`}
          >
            {
              item.label
            }

            {selected ? (
              <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-t-full bg-[#21935e]" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function OverviewView({
  report,
  trendMetric,
  onTrendMetricChange,
  trendRows,
  organizations,
  query,
  onQueryChange,
  onOpenClient,
}: {
  report:
    ControlCenterReportsOverview | null;
  trendMetric:
    TrendMetric;
  onTrendMetricChange:
    (
      value:
        TrendMetric,
    ) => void;
  trendRows:
    ControlCenterReportsOverview["trends"];
  organizations:
    OrganizationReportRow[];
  query:
    string;
  onQueryChange:
    (
      value:
        string,
    ) => void;
  onOpenClient:
    (
      tenantId:
        string,
    ) => void;
}) {
  const totals =
    report?.totals;

  const period =
    report?.periodMetrics;

  return (
    <div className="border-t border-[#edf1f4]">
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <SectionHeader
            title="Activity trend"
            subtitle="Daily activity within the selected reporting period."
            action={
              <SelectControl
                value={
                  trendMetric
                }
                onChange={(
                  value,
                ) =>
                  onTrendMetricChange(
                    value as
                      TrendMetric,
                  )
                }
                options={[
                  {
                    value:
                      "REPAYMENTS",
                    label:
                      "Repayments collected",
                  },
                  {
                    value:
                      "PRINCIPAL",
                    label:
                      "Principal disbursed",
                  },
                  {
                    value:
                      "LOANS",
                    label:
                      "Loans disbursed",
                  },
                  {
                    value:
                      "BORROWERS",
                    label:
                      "New borrowers",
                  },
                  {
                    value:
                      "SUBSCRIPTION_REVENUE",
                    label:
                      "Subscription revenue",
                  },
                ]}
              />
            }
          />

          <div className="border-t border-[#edf1f4] p-4">
            <TrendChart
              rows={
                trendRows
              }
              metric={
                trendMetric
              }
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <SectionHeader
            title="Platform snapshot"
            subtitle="Current cumulative platform scale."
          />

          <div className="grid grid-cols-2 border-t border-[#edf1f4]">
            <SnapshotMetric
              label="Organizations"
              value={
                totals?.organizations ??
                0
              }
            />
            <SnapshotMetric
              label="Branches"
              value={
                totals?.branches ??
                0
              }
            />
            <SnapshotMetric
              label="Users"
              value={
                totals?.users ??
                0
              }
            />
            <SnapshotMetric
              label="Borrowers"
              value={
                totals?.borrowers ??
                0
              }
            />
            <SnapshotMetric
              label="Disbursed loans"
              value={
                totals?.loans ??
                0
              }
            />
            <SnapshotMetric
              label="Repayments"
              value={
                totals?.repaymentCount ??
                0
              }
            />
          </div>
        </section>
      </div>

      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-4">
        <CompactMetric
          label="New borrowers"
          value={ccNumber(
            period?.newBorrowers ??
              0,
          )}
        />

        <CompactMetric
          label="New branches"
          value={ccNumber(
            period?.newBranches ??
              0,
          )}
        />

        <CompactMetric
          label="Repayments recorded"
          value={ccNumber(
            period?.repaymentCount ??
              0,
          )}
        />

        <CompactMetric
          label="Subscription payments"
          value={ccNumber(
            period?.subscriptionPayments ??
              0,
          )}
        />
      </div>

      <OrganizationComparison
        organizations={
          organizations
        }
        query={
          query
        }
        onQueryChange={
          onQueryChange
        }
        onOpenClient={
          onOpenClient
        }
      />
    </div>
  );
}

function CommercialView({
  report,
  organizations,
  branchRows,
  dashboard,
  onOpenClient,
}: {
  report:
    ControlCenterReportsOverview | null;
  organizations:
    OrganizationReportRow[];
  branchRows:
    BranchReportRow[];
  dashboard:
    ControlCenterDashboard | null;
  onOpenClient:
    (
      tenantId:
        string,
    ) => void;
}) {
  const period =
    report?.periodMetrics;

  const previous =
    report?.previousPeriod;

  const periodOrganizations =
    report?.organizations ??
    [];

  const planDistribution =
    useMemo(() => {
      const map =
        new Map<
          string,
          number
        >();

      for (
        const branch of
        branchRows
      ) {
        const plan =
          formatPlan(
            branch.planCode,
          );

        map.set(
          plan,
          (
            map.get(
              plan,
            ) ?? 0
          ) + 1,
        );
      }

      return [
        ...map.entries(),
      ]
        .map(
          ([
            plan,
            count,
          ]) => ({
            plan,
            count,
          }),
        )
        .sort(
          (a, b) =>
            b.count -
            a.count,
        );
    }, [
      branchRows,
    ]);

  return (
    <div className="border-t border-[#edf1f4]">
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        <ComparisonMiniCard
          label="Subscription revenue"
          value={ccMoney(
            period?.subscriptionRevenue ??
              0,
          )}
          current={
            period?.subscriptionRevenue ??
            0
          }
          previous={
            previous?.subscriptionRevenue ??
            0
          }
        />

        <ComparisonMiniCard
          label="Subscription payments"
          value={ccNumber(
            period?.subscriptionPayments ??
              0,
          )}
          current={
            period?.subscriptionPayments ??
            0
          }
          previous={
            previous?.subscriptionPayments ??
            0
          }
        />

        <CompactMetric
          label="Lifetime subscription revenue"
          value={ccMoney(
            report?.totals.subscriptionRevenue ??
              dashboard?.stats.completedRevenue ??
              0,
          )}
        />

        <CompactMetric
          label="Lifetime completed payments"
          value={ccNumber(
            report?.totals.subscriptionPayments ??
              dashboard?.stats.completedPayments ??
              0,
          )}
        />
      </div>

      <div className="grid gap-4 px-4 pb-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
        <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <SectionHeader
            title="Period revenue by organization"
            subtitle="Subscription revenue earned during the selected reporting period."
          />

          {periodOrganizations.length ? (
            <div className="divide-y divide-[#edf1f4] border-t border-[#edf1f4]">
              {[...periodOrganizations]
                .sort(
                  (a, b) =>
                    b.subscriptionRevenue -
                    a.subscriptionRevenue,
                )
                .map(
                  (
                    row,
                    index,
                  ) => (
                    <button
                      key={
                        row.tenantId
                      }
                      type="button"
                      onClick={() =>
                        onOpenClient(
                          row.tenantId,
                        )
                      }
                      className="grid w-full gap-4 px-4 py-3 text-left transition hover:bg-[#fbfcfd] md:grid-cols-[35px_minmax(0,1fr)_150px_120px] md:items-center"
                    >
                      <span className="text-[9px] font-semibold text-[#8490a1]">
                        #
                        {index +
                          1}
                      </span>

                      <span className="truncate text-[10px] font-semibold text-[#26344d]">
                        {
                          row.organizationName
                        }
                      </span>

                      <span className="text-[10px] font-semibold text-[#168650]">
                        {ccMoney(
                          row.subscriptionRevenue,
                        )}
                      </span>

                      <span className="text-[9px] text-[#718099]">
                        {ccNumber(
                          row.subscriptionPayments,
                        )}{" "}
                        payments
                      </span>
                    </button>
                  ),
                )}
            </div>
          ) : (
            <EmptyState
              title="No subscription revenue in this period"
            />
          )}
        </section>

        <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <SectionHeader
            title="Plan distribution"
            subtitle="Current branches grouped by subscription plan."
          />

          <div className="divide-y divide-[#edf1f4] border-t border-[#edf1f4]">
            {planDistribution.map(
              (row) => (
                <div
                  key={
                    row.plan
                  }
                  className="flex items-center justify-between px-4 py-3"
                >
                  <span className="text-[9.5px] text-[#526078]">
                    {
                      row.plan
                    }
                  </span>

                  <span className="text-[10.5px] font-semibold text-[#26344d]">
                    {ccNumber(
                      row.count,
                    )}
                  </span>
                </div>
              ),
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function OperationsView({
  report,
  organizations,
  onOpenClient,
}: {
  report:
    ControlCenterReportsOverview | null;
  organizations:
    OrganizationReportRow[];
  onOpenClient:
    (
      tenantId:
        string,
    ) => void;
}) {
  const period =
    report?.periodMetrics;

  const previous =
    report?.previousPeriod;

  const periodOrganizations =
    report?.organizations ??
    [];

  return (
    <div className="border-t border-[#edf1f4]">
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        <ComparisonMiniCard
          label="Principal disbursed"
          value={ccMoney(
            period?.principalDisbursed ??
              0,
          )}
          current={
            period?.principalDisbursed ??
            0
          }
          previous={
            previous?.principalDisbursed ??
            0
          }
        />

        <ComparisonMiniCard
          label="Repayments collected"
          value={ccMoney(
            period?.repaymentsCollected ??
              0,
          )}
          current={
            period?.repaymentsCollected ??
            0
          }
          previous={
            previous?.repaymentsCollected ??
            0
          }
        />

        <ComparisonMiniCard
          label="Loans disbursed"
          value={ccNumber(
            period?.disbursedLoans ??
              0,
          )}
          current={
            period?.disbursedLoans ??
            0
          }
          previous={
            previous?.disbursedLoans ??
            0
          }
        />

        <ComparisonMiniCard
          label="New borrowers"
          value={ccNumber(
            period?.newBorrowers ??
              0,
          )}
          current={
            period?.newBorrowers ??
            0
          }
          previous={
            previous?.newBorrowers ??
            0
          }
        />
      </div>

      <div className="px-4 pb-4">
        <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <SectionHeader
            title="Period performance by organization"
            subtitle="Lending and repayment activity during the selected reporting period."
          />

          {periodOrganizations.length ? (
            <div className="overflow-x-auto border-t border-[#edf1f4]">
              <table className="w-full min-w-[1100px] table-fixed text-left">
                <thead>
                  <tr className="bg-[#fcfdfe] text-[9.5px] font-semibold text-[#56647d]">
                    <th className="w-[25%] px-4 py-2.5">
                      Organization
                    </th>

                    <th className="w-[12%] px-3 py-2.5">
                      New borrowers
                    </th>

                    <th className="w-[12%] px-3 py-2.5">
                      Loans
                    </th>

                    <th className="w-[17%] px-3 py-2.5">
                      Principal disbursed
                    </th>

                    <th className="w-[12%] px-3 py-2.5">
                      Repayments
                    </th>

                    <th className="w-[17%] px-3 py-2.5">
                      Amount collected
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#edf1f4]">
                  {[...periodOrganizations]
                    .sort(
                      (a, b) =>
                        b.repaymentsCollected -
                        a.repaymentsCollected,
                    )
                    .map(
                      (row) => (
                        <tr
                          key={
                            row.tenantId
                          }
                          className="h-[62px] transition hover:bg-[#fbfcfd]"
                        >
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenClient(
                                  row.tenantId,
                                )
                              }
                              className="truncate text-left text-[10px] font-semibold text-[#26344d] hover:text-[#168650]"
                            >
                              {
                                row.organizationName
                              }
                            </button>
                          </td>

                          <td className="px-3 py-2.5 text-[10px] font-semibold text-[#526078]">
                            {ccNumber(
                              row.newBorrowers,
                            )}
                          </td>

                          <td className="px-3 py-2.5 text-[10px] font-semibold text-[#526078]">
                            {ccNumber(
                              row.disbursedLoans,
                            )}
                          </td>

                          <td className="px-3 py-2.5 text-[10px] font-semibold text-[#26344d]">
                            {ccMoney(
                              row.principalDisbursed,
                            )}
                          </td>

                          <td className="px-3 py-2.5 text-[10px] font-semibold text-[#526078]">
                            {ccNumber(
                              row.repaymentCount,
                            )}
                          </td>

                          <td className="px-3 py-2.5 text-[10px] font-semibold text-[#168650]">
                            {ccMoney(
                              row.repaymentsCollected,
                            )}
                          </td>
                        </tr>
                      ),
                    )}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No operational activity in this period"
            />
          )}
        </section>
      </div>
    </div>
  );
}

function ExportsView({
  organizations,
  branches,
  report,
  detailsLoading,
}: {
  organizations:
    OrganizationReportRow[];
  branches:
    BranchReportRow[];
  report:
    ControlCenterReportsOverview | null;
  detailsLoading:
    boolean;
}) {
  return (
    <div className="border-t border-[#edf1f4] p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ExportCard
          icon={Building2}
          title="Organization summary"
          description="Current organization scale and cumulative operating totals."
          count={
            organizations.length
          }
          disabled={
            detailsLoading
          }
          onExport={() =>
            exportOrganizationsCsv(
              organizations,
            )
          }
        />

        <ExportCard
          icon={Landmark}
          title="Branch summary"
          description="Branch-level subscription and operating data."
          count={
            branches.length
          }
          disabled={
            detailsLoading
          }
          onExport={() =>
            exportBranchesCsv(
              branches,
            )
          }
        />

        <ExportCard
          icon={LineChart}
          title="Period trend"
          description="Daily analytical series for the selected reporting period."
          count={
            report?.trends.length ??
            0
          }
          disabled={
            !report
          }
          onExport={() =>
            report
              ? exportTrendCsv(
                  report,
                )
              : undefined
          }
        />

        <ExportCard
          icon={BarChart3}
          title="Period organization performance"
          description="Organization-level period activity for lending, repayments and subscription revenue."
          count={
            report?.organizations.length ??
            0
          }
          disabled={
            !report
          }
          onExport={() =>
            report
              ? exportPeriodOrganizationsCsv(
                  report,
                )
              : undefined
          }
        />
      </div>
    </div>
  );
}

function TrendChart({
  rows,
  metric,
}: {
  rows:
    ControlCenterReportsOverview["trends"];
  metric:
    TrendMetric;
}) {
  if (
    !rows.length
  ) {
    return (
      <div className="grid h-[270px] place-items-center text-[10px] text-[#718099]">
        No trend data available.
      </div>
    );
  }

  const values =
    rows.map(
      (row) =>
        trendValue(
          row,
          metric,
        ),
    );

  const max =
    Math.max(
      1,
      ...values,
    );

  const width =
    1000;

  const height =
    250;

  const paddingX =
    18;

  const paddingY =
    22;

  const usableWidth =
    width -
    paddingX *
      2;

  const usableHeight =
    height -
    paddingY *
      2;

  const points =
    rows.map(
      (
        row,
        index,
      ) => {
        const x =
          rows.length ===
          1
            ? width /
              2
            : paddingX +
              (
                index /
                (
                  rows.length -
                  1
                )
              ) *
                usableWidth;

        const value =
          trendValue(
            row,
            metric,
          );

        const y =
          height -
          paddingY -
          (
            value /
            max
          ) *
            usableHeight;

        return {
          x,
          y,
          value,
          date:
            row.date,
        };
      },
    );

  const polyline =
    points
      .map(
        (point) =>
          `${point.x},${point.y}`,
      )
      .join(" ");

  return (
    <div>
      <div className="h-[270px] w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full"
          preserveAspectRatio="none"
        >
          <line
            x1={paddingX}
            y1={
              height -
              paddingY
            }
            x2={
              width -
              paddingX
            }
            y2={
              height -
              paddingY
            }
            stroke="#e7ebef"
            strokeWidth="1"
          />

          <polyline
            points={
              polyline
            }
            fill="none"
            stroke="#198b55"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />

          {points.map(
            (
              point,
              index,
            ) => (
              <circle
                key={
                  index
                }
                cx={
                  point.x
                }
                cy={
                  point.y
                }
                r="4"
                fill="#198b55"
                vectorEffect="non-scaling-stroke"
              />
            ),
          )}
        </svg>
      </div>

      <div className="mt-1 flex items-center justify-between text-[8.5px] text-[#8490a1]">
        <span>
          {formatShortDate(
            rows[0]
              .date,
          )}
        </span>

        <span>
          {formatShortDate(
            rows[
              rows.length -
                1
            ].date,
          )}
        </span>
      </div>
    </div>
  );
}

function OrganizationComparison({
  organizations,
  query,
  onQueryChange,
  onOpenClient,
}: {
  organizations:
    OrganizationReportRow[];
  query:
    string;
  onQueryChange:
    (
      value:
        string,
    ) => void;
  onOpenClient:
    (
      tenantId:
        string,
    ) => void;
}) {
  return (
    <div className="px-4 pb-4">
      <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
        <SectionHeader
          title="Current organization scale"
          subtitle="Cumulative operational footprint across client organizations."
          action={
            <label className="flex h-9 w-[300px] items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3">
              <Search className="size-3.5 text-[#64738c]" />

              <input
                value={
                  query
                }
                onChange={(
                  event,
                ) =>
                  onQueryChange(
                    event.target.value,
                  )
                }
                placeholder="Search organizations..."
                className="min-w-0 flex-1 bg-transparent text-[9.5px] outline-none"
              />
            </label>
          }
        />

        {organizations.length ? (
          <div className="overflow-x-auto border-t border-[#edf1f4]">
            <table className="w-full min-w-[1050px] table-fixed text-left">
              <thead>
                <tr className="bg-[#fcfdfe] text-[9.5px] font-semibold text-[#56647d]">
                  <th className="w-[26%] px-4 py-2.5">
                    Organization
                  </th>
                  <th className="w-[10%] px-3 py-2.5">
                    Branches
                  </th>
                  <th className="w-[10%] px-3 py-2.5">
                    Users
                  </th>
                  <th className="w-[12%] px-3 py-2.5">
                    Borrowers
                  </th>
                  <th className="w-[12%] px-3 py-2.5">
                    Loans
                  </th>
                  <th className="w-[15%] px-3 py-2.5">
                    Repayments
                  </th>
                  <th className="w-[15%] px-3 py-2.5">
                    Subscription revenue
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1f4]">
                {organizations.map(
                  (row) => (
                    <tr
                      key={
                        row.id
                      }
                      className="h-[62px] transition hover:bg-[#fbfcfd]"
                    >
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenClient(
                              row.id,
                            )
                          }
                          className="truncate text-left text-[10px] font-semibold text-[#26344d] hover:text-[#168650]"
                        >
                          {
                            row.name
                          }
                        </button>

                        <p className="mt-1 truncate text-[8.5px] text-[#8490a1]">
                          {row.ownerName ??
                            "No owner recorded"}
                        </p>
                      </td>

                      <td className="px-3 py-2.5 text-[10px] font-semibold text-[#526078]">
                        {ccNumber(
                          row.branches,
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-[10px] font-semibold text-[#526078]">
                        {ccNumber(
                          row.users,
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-[10px] font-semibold text-[#526078]">
                        {ccNumber(
                          row.borrowers,
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-[10px] font-semibold text-[#526078]">
                        {ccNumber(
                          row.loans,
                        )}
                      </td>

                      <td className="px-3 py-2.5">
                        <p className="text-[10px] font-semibold text-[#526078]">
                          {ccNumber(
                            row.repaymentCount,
                          )}
                        </p>

                        <p className="mt-1 text-[8.5px] text-[#168650]">
                          {ccMoney(
                            row.repaymentsCollected,
                          )}
                        </p>
                      </td>

                      <td className="px-3 py-2.5 text-[10px] font-semibold text-[#168650]">
                        {ccMoney(
                          row.subscriptionRevenue,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No organizations found"
          />
        )}
      </section>
    </div>
  );
}

function ComparisonMetricCard({
  icon,
  tone,
  label,
  value,
  current,
  previous,
}: {
  icon:
    LucideIcon;
  tone:
    IconTone;
  label:
    string;
  value:
    string;
  current:
    number;
  previous:
    number;
}) {
  const change =
    percentageChange(
      current,
      previous,
    );

  return (
    <section className="flex min-h-[108px] items-center gap-4 rounded-[10px] border border-[#dfe5eb] bg-white px-4">
      <LargeIcon
        icon={
          icon
        }
        tone={
          tone
        }
      />

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold text-[#5e6c84]">
          {label}
        </p>

        <p className="mt-1 truncate text-[22px] font-bold leading-7 tracking-[-0.02em] text-[#101d37]">
          {value}
        </p>

        <ChangeIndicator
          value={
            change
          }
        />
      </div>
    </section>
  );
}

function ComparisonMiniCard({
  label,
  value,
  current,
  previous,
}: {
  label:
    string;
  value:
    string;
  current:
    number;
  previous:
    number;
}) {
  return (
    <div className="rounded-[9px] border border-[#dfe5eb] bg-white p-4">
      <p className="text-[9px] text-[#718099]">
        {label}
      </p>

      <p className="mt-2 text-[19px] font-bold tracking-[-0.02em] text-[#17233c]">
        {value}
      </p>

      <ChangeIndicator
        value={percentageChange(
          current,
          previous,
        )}
      />
    </div>
  );
}

function ChangeIndicator({
  value,
}: {
  value:
    number | null;
}) {
  if (
    value == null
  ) {
    return (
      <p className="mt-1 text-[8.5px] text-[#8490a1]">
        No previous-period baseline
      </p>
    );
  }

  const positive =
    value >= 0;

  return (
    <div
      className={`mt-1 flex items-center gap-1 text-[8.5px] font-semibold ${
        positive
          ? "text-[#168650]"
          : "text-[#c94040]"
      }`}
    >
      {positive ? (
        <ArrowUpRight className="size-3" />
      ) : (
        <ArrowDownRight className="size-3" />
      )}

      {Math.abs(
        value,
      ).toFixed(
        1,
      )}
      % vs previous period
    </div>
  );
}

function CompactMetric({
  label,
  value,
}: {
  label:
    string;
  value:
    string;
}) {
  return (
    <div className="rounded-[9px] border border-[#dfe5eb] bg-white p-4">
      <p className="text-[9px] text-[#718099]">
        {label}
      </p>

      <p className="mt-2 text-[19px] font-bold text-[#17233c]">
        {value}
      </p>
    </div>
  );
}

function SnapshotMetric({
  label,
  value,
}: {
  label:
    string;
  value:
    number;
}) {
  return (
    <div className="border-b border-r border-[#edf1f4] px-4 py-4">
      <p className="text-[18px] font-bold text-[#17233c]">
        {ccNumber(
          value,
        )}
      </p>

      <p className="mt-1 text-[9px] text-[#718099]">
        {label}
      </p>
    </div>
  );
}

function ExportCard({
  icon: Icon,
  title,
  description,
  count,
  disabled,
  onExport,
}: {
  icon:
    LucideIcon;
  title:
    string;
  description:
    string;
  count:
    number;
  disabled?:
    boolean;
  onExport:
    () => void;
}) {
  return (
    <article className="rounded-[10px] border border-[#dfe5eb] bg-white p-4">
      <span className="grid size-9 place-items-center rounded-[8px] bg-[#eaf6ee] text-[#168650]">
        <Icon className="size-4" />
      </span>

      <p className="mt-4 text-[11px] font-semibold text-[#17233c]">
        {title}
      </p>

      <p className="mt-1 min-h-[58px] text-[9.5px] leading-5 text-[#718099]">
        {description}
      </p>

      <p className="mt-2 text-[8.5px] text-[#8490a1]">
        {ccNumber(
          count,
        )}{" "}
        rows
      </p>

      <button
        type="button"
        disabled={
          disabled ||
          !count
        }
        onClick={
          onExport
        }
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-[#cfe3d7] bg-[#f4faf6] px-3 text-[9.5px] font-semibold text-[#168650] disabled:opacity-40"
      >
        <Download className="size-3.5" />
        Export CSV
      </button>
    </article>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title:
    string;
  subtitle?:
    string;
  action?:
    React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div>
        <p className="text-[11px] font-semibold text-[#17233c]">
          {title}
        </p>

        {subtitle ? (
          <p className="mt-1 text-[9.5px] text-[#718099]">
            {subtitle}
          </p>
        ) : null}
      </div>

      {action}
    </div>
  );
}

function SelectControl({
  value,
  onChange,
  options,
}: {
  value:
    string;
  onChange:
    (
      value:
        string,
    ) => void;
  options:
    Array<{
      value:
        string;
      label:
        string;
    }>;
}) {
  return (
    <div className="relative min-w-[165px]">
      <select
        value={
          value
        }
        onChange={(
          event,
        ) =>
          onChange(
            event.target.value,
          )
        }
        className="h-9 w-full appearance-none rounded-md border border-[#dfe5eb] bg-white px-3 pr-8 text-[9.5px] font-medium text-[#526078] outline-none"
      >
        {options.map(
          (
            option,
          ) => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {
                option.label
              }
            </option>
          ),
        )}
      </select>

      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#64738c]" />
    </div>
  );
}

function EmptyState({
  title,
}: {
  title:
    string;
}) {
  return (
    <div className="grid min-h-[220px] place-items-center text-center">
      <div>
        <FileSpreadsheet className="mx-auto size-5 text-[#8b96a7]" />

        <p className="mt-3 text-[11px] font-semibold text-[#17233c]">
          {title}
        </p>
      </div>
    </div>
  );
}

function ReportLoadingState() {
  return (
    <div className="border-t border-[#edf1f4] p-4">
      <div className="h-[330px] animate-pulse rounded-[10px] bg-[#f7f9fa]" />

      <div className="mt-4 h-[300px] animate-pulse rounded-[10px] bg-[#f7f9fa]" />
    </div>
  );
}

type IconTone =
  | "green"
  | "blue"
  | "amber"
  | "purple";

function LargeIcon({
  icon: Icon,
  tone,
}: {
  icon:
    LucideIcon;
  tone:
    IconTone;
}) {
  return (
    <span
      className={`grid size-[52px] shrink-0 place-items-center rounded-[11px] ${iconTone(
        tone,
      )}`}
    >
      <Icon className="size-[22px]" />
    </span>
  );
}

function iconTone(
  tone:
    IconTone,
) {
  if (
    tone === "blue"
  ) {
    return "bg-[#edf4ff] text-[#276de9]";
  }

  if (
    tone === "amber"
  ) {
    return "bg-[#fff3df] text-[#e38012]";
  }

  if (
    tone === "purple"
  ) {
    return "bg-[#f3edff] text-[#7146de]";
  }

  return "bg-[#eaf6ee] text-[#198b55]";
}

function percentageChange(
  current:
    number,
  previous:
    number,
) {
  if (
    previous === 0
  ) {
    if (
      current ===
      0
    ) {
      return 0;
    }

    return null;
  }

  return (
    (
      current -
      previous
    ) /
    previous
  ) *
    100;
}

function trendValue(
  row:
    ControlCenterReportsOverview["trends"][number],
  metric:
    TrendMetric,
) {
  if (
    metric ===
    "PRINCIPAL"
  ) {
    return row.principalDisbursed;
  }

  if (
    metric ===
    "LOANS"
  ) {
    return row.loans;
  }

  if (
    metric ===
    "BORROWERS"
  ) {
    return row.borrowers;
  }

  if (
    metric ===
    "SUBSCRIPTION_REVENUE"
  ) {
    return row.subscriptionRevenue;
  }

  return row.repaymentsCollected;
}

function latestDate(
  values:
    string[],
) {
  if (
    !values.length
  ) {
    return null;
  }

  return values.reduce(
    (
      latest,
      current,
    ) =>
      new Date(
        current,
      ).getTime() >
      new Date(
        latest,
      ).getTime()
        ? current
        : latest,
  );
}

function formatPlan(
  value:
    string | null,
) {
  if (
    !value
  ) {
    return "No plan";
  }

  const normalized =
    value.toUpperCase();

  if (
    normalized.includes(
      "6M",
    )
  ) {
    return "6 Months";
  }

  if (
    normalized.includes(
      "3M",
    )
  ) {
    return "3 Months";
  }

  if (
    normalized.includes(
      "MONTH",
    ) ||
    normalized ===
      "PRO"
  ) {
    return "Monthly";
  }

  return value.replace(
    /_/g,
    " ",
  );
}

function formatShortDate(
  value:
    string,
) {
  const date =
    new Date(
      value,
    );

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day:
        "2-digit",
      month:
        "short",
    },
  ).format(
    date,
  );
}

function exportOrganizationsCsv(
  rows:
    OrganizationReportRow[],
) {
  downloadCsv(
    "rembeh-organization-summary",
    [
      [
        "Organization",
        "Owner",
        "Status",
        "Branches",
        "Active Branches",
        "Locked Branches",
        "Users",
        "Borrowers",
        "Loans",
        "Repayment Count",
        "Repayments Collected",
        "Subscription Payments",
        "Subscription Revenue",
        "Last Used",
      ],
      ...rows.map(
        (row) => [
          row.name,
          row.ownerName ??
            "",
          row.status,
          row.branches,
          row.activeBranches,
          row.lockedBranches,
          row.users,
          row.borrowers,
          row.loans,
          row.repaymentCount,
          row.repaymentsCollected,
          row.subscriptionPayments,
          row.subscriptionRevenue,
          row.lastUsedAt ??
            "",
        ],
      ),
    ],
  );
}

function exportBranchesCsv(
  rows:
    BranchReportRow[],
) {
  downloadCsv(
    "rembeh-branch-summary",
    [
      [
        "Organization",
        "Branch",
        "Address",
        "Status",
        "Plan",
        "Period End",
        "Users",
        "Borrowers",
        "Loans",
        "Repayment Count",
        "Repayments Collected",
        "Subscription Payments",
        "Subscription Revenue",
        "Last Used",
      ],
      ...rows.map(
        (row) => [
          row.organizationName,
          row.name,
          row.address,
          row.status,
          row.planCode ??
            "",
          row.currentPeriodEnd ??
            "",
          row.users,
          row.borrowers,
          row.loans,
          row.repaymentCount,
          row.repaymentsCollected,
          row.subscriptionPayments,
          row.subscriptionRevenue,
          row.lastUsedAt ??
            "",
        ],
      ),
    ],
  );
}

function exportTrendCsv(
  report:
    ControlCenterReportsOverview,
) {
  downloadCsv(
    "rembeh-report-trend",
    [
      [
        "Date",
        "New Borrowers",
        "Loans Disbursed",
        "Principal Disbursed",
        "Repayment Count",
        "Repayments Collected",
        "Subscription Payments",
        "Subscription Revenue",
      ],
      ...report.trends.map(
        (row) => [
          row.date,
          row.borrowers,
          row.loans,
          row.principalDisbursed,
          row.repaymentCount,
          row.repaymentsCollected,
          row.subscriptionPayments,
          row.subscriptionRevenue,
        ],
      ),
    ],
  );
}

function exportPeriodOrganizationsCsv(
  report:
    ControlCenterReportsOverview,
) {
  downloadCsv(
    "rembeh-period-organization-performance",
    [
      [
        "Organization",
        "New Borrowers",
        "Loans Disbursed",
        "Principal Disbursed",
        "Repayment Count",
        "Repayments Collected",
        "Subscription Payments",
        "Subscription Revenue",
      ],
      ...report.organizations.map(
        (row) => [
          row.organizationName,
          row.newBorrowers,
          row.disbursedLoans,
          row.principalDisbursed,
          row.repaymentCount,
          row.repaymentsCollected,
          row.subscriptionPayments,
          row.subscriptionRevenue,
        ],
      ),
    ],
  );
}

function downloadCsv(
  filename:
    string,
  rows:
    Array<
      Array<
        string |
        number
      >
    >,
) {
  const csv =
    rows
      .map((row) =>
        row
          .map(
            (cell) => {
              const value =
                String(
                  cell ??
                    "",
                ).replace(
                  /"/g,
                  '""',
                );

              return `"${value}"`;
            },
          )
          .join(","),
      )
      .join("\n");

  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8;",
      },
    );

  const url =
    URL.createObjectURL(
      blob,
    );

  const link =
    document.createElement(
      "a",
    );

  link.href =
    url;

  link.download =
    `${filename}-${new Date()
      .toISOString()
      .slice(
        0,
        10,
      )}.csv`;

  document.body.appendChild(
    link,
  );

  link.click();
  link.remove();

  URL.revokeObjectURL(
    url,
  );
}