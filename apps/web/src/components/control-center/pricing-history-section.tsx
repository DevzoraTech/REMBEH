"use client";

import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Landmark,
  Search,
  Tag,
  TimerReset,
  UserRound,
  XCircle,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import type {
  ControlCenterClient,
  ControlCenterPricingHistory,
} from "./types";

import {
  ccMoney,
  ccNumber,
} from "./formatters";

type HistoryView =
  | "ALL"
  | "ACTIVE"
  | "SCHEDULED"
  | "HISTORICAL"
  | "REVOKED";

type PricingScope =
  | "ALL"
  | "ORGANIZATION"
  | "BRANCH";

type HistoryRow =
  ControlCenterPricingHistory["history"][number];

type CommercialState =
  | "ACTIVE"
  | "SCHEDULED"
  | "EXPIRED"
  | "REVOKED";

const PAGE_SIZE = 10;

export function ControlCenterPricingHistorySection({
  client,
  history,
  loading,
  onBack,
}: {
  client:
    ControlCenterClient | null;

  history:
    ControlCenterPricingHistory | null;

  loading:
    boolean;

  onBack:
    () => void;
}) {
  const [view, setView] =
    useState<HistoryView>(
      "ALL",
    );

  const [query, setQuery] =
    useState("");

  const [scope, setScope] =
    useState<PricingScope>(
      "ALL",
    );

  const [plan, setPlan] =
    useState("ALL");

  const [changedBy, setChangedBy] =
    useState("ALL");

  const [page, setPage] =
    useState(1);

  const allRows =
    history?.history ??
    [];

  const normalizedRows =
    useMemo(
      () =>
        [...allRows]
          .map(
            (row) => ({
              row,

              state:
                resolveCommercialState(
                  row,
                ),
            }),
          )
          .sort(
            (
              a,
              b,
            ) =>
              new Date(
                b.row.createdAt,
              ).getTime() -
              new Date(
                a.row.createdAt,
              ).getTime(),
          ),
      [
        allRows,
      ],
    );

  const counts =
    useMemo(
      () => ({
        all:
          normalizedRows.length,

        active:
          normalizedRows.filter(
            (item) =>
              item.state ===
              "ACTIVE",
          ).length,

        scheduled:
          normalizedRows.filter(
            (item) =>
              item.state ===
              "SCHEDULED",
          ).length,

        historical:
          normalizedRows.filter(
            (item) =>
              item.state ===
              "EXPIRED",
          ).length,

        revoked:
          normalizedRows.filter(
            (item) =>
              item.state ===
              "REVOKED",
          ).length,
      }),
      [
        normalizedRows,
      ],
    );

  const organizationChanges =
    useMemo(
      () =>
        normalizedRows.filter(
          (item) =>
            item.row.scope ===
            "ORGANIZATION",
        ).length,
      [
        normalizedRows,
      ],
    );

  const branchChanges =
    useMemo(
      () =>
        normalizedRows.filter(
          (item) =>
            item.row.scope ===
            "BRANCH",
        ).length,
      [
        normalizedRows,
      ],
    );

  const plans =
    useMemo(
      () =>
        [
          ...new Set(
            normalizedRows.map(
              (item) =>
                item.row.planName,
            ),
          ),
        ].sort(
          (
            a,
            b,
          ) =>
            a.localeCompare(
              b,
            ),
        ),
      [
        normalizedRows,
      ],
    );

  const administrators =
    useMemo(
      () =>
        [
          ...new Set(
            normalizedRows
              .map(
                (item) =>
                  item.row.changedBy,
              )
              .filter(
                Boolean,
              ),
          ),
        ].sort(
          (
            a,
            b,
          ) =>
            a.localeCompare(
              b,
            ),
        ),
      [
        normalizedRows,
      ],
    );

  const filteredRows =
    useMemo(() => {
      const needle =
        query
          .trim()
          .toLowerCase();

      return normalizedRows.filter(
        ({
          row,
          state,
        }) => {
          const matchesView =
            view ===
            "ALL"
              ? true
              : view ===
                  "ACTIVE"
                ? state ===
                  "ACTIVE"
                : view ===
                    "SCHEDULED"
                  ? state ===
                    "SCHEDULED"
                  : view ===
                      "REVOKED"
                    ? state ===
                      "REVOKED"
                    : state ===
                      "EXPIRED";

          const matchesScope =
            scope ===
              "ALL" ||
            row.scope ===
              scope;

          const matchesPlan =
            plan ===
              "ALL" ||
            row.planName ===
              plan;

          const matchesAdmin =
            changedBy ===
              "ALL" ||
            row.changedBy ===
              changedBy;

          const matchesSearch =
            !needle ||
            [
              row.planName,
              row.planCode,
              row.reason,
              row.changedBy,
              row.branch?.name,
              row.scope,
            ].some(
              (value) =>
                (
                  value ??
                  ""
                )
                  .toLowerCase()
                  .includes(
                    needle,
                  ),
            );

          return (
            matchesView &&
            matchesScope &&
            matchesPlan &&
            matchesAdmin &&
            matchesSearch
          );
        },
      );
    }, [
      changedBy,
      normalizedRows,
      plan,
      query,
      scope,
      view,
    ]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredRows.length /
          PAGE_SIZE,
      ),
    );

  const currentPage =
    Math.min(
      page,
      totalPages,
    );

  const pageRows =
    filteredRows.slice(
      (
        currentPage -
        1
      ) *
        PAGE_SIZE,

      currentPage *
        PAGE_SIZE,
    );

  function changeView(
    value:
      HistoryView,
  ) {
    setView(
      value,
    );

    setPage(
      1,
    );
  }

  function resetFilters() {
    setQuery(
      "",
    );

    setScope(
      "ALL",
    );

    setPlan(
      "ALL",
    );

    setChangedBy(
      "ALL",
    );

    setPage(
      1,
    );
  }

  function exportCsv() {
    if (
      !filteredRows.length
    ) {
      return;
    }

    const header = [
      "Created",
      "Status",
      "Scope",
      "Branch",
      "Plan",
      "Plan Code",
      "Old Amount",
      "New Amount",
      "Currency",
      "Effective From",
      "Effective Until",
      "Revoked At",
      "Changed By",
      "Reason",
    ];

    const rows =
      filteredRows.map(
        ({
          row,
          state,
        }) => [
          row.createdAt,

          commercialStateLabel(
            state,
          ),

          row.scope,

          row.branch?.name ??
            "",

          row.planName,

          row.planCode,

          row.oldAmount,

          row.newAmount,

          row.currency,

          row.effectiveFrom,

          row.effectiveUntil ??
            "",

          row.revokedAt ??
            "",

          row.changedBy,

          row.reason,
        ],
      );

    const csv =
      [
        header,
        ...rows,
      ]
        .map(
          (line) =>
            line
              .map(
                (cell) =>
                  `"${String(
                    cell ??
                      "",
                  ).replace(
                    /"/g,
                    '""',
                  )}"`,
              )
              .join(
                ",",
              ),
        )
        .join(
          "\n",
        );

    const blob =
      new Blob(
        [
          csv,
        ],
        {
          type:
            "text/csv;charset=utf-8;",
        },
      );

    const url =
      URL.createObjectURL(
        blob,
      );

    const anchor =
      document.createElement(
        "a",
      );

    anchor.href =
      url;

    anchor.download =
      `${safeFileName(
        client?.name ??
          "client",
      )}-pricing-history-${new Date()
        .toISOString()
        .slice(
          0,
          10,
        )}.csv`;

    document.body.appendChild(
      anchor,
    );

    anchor.click();

    anchor.remove();

    URL.revokeObjectURL(
      url,
    );
  }

  const filtersActive =
    Boolean(
      query ||
        scope !==
          "ALL" ||
        plan !==
          "ALL" ||
        changedBy !==
          "ALL",
    );

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <PageHeader
        client={
          client
        }
        onBack={
          onBack
        }
        onExport={
          exportCsv
        }
        exportDisabled={
          !filteredRows.length
        }
      />

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={History}
          tone="green"
          label="Pricing changes"
          value={ccNumber(
            counts.all,
          )}
          secondary="Complete commercial history"
        />

        <MetricCard
          icon={CheckCircle2}
          tone="blue"
          label="Active agreements"
          value={ccNumber(
            counts.active,
          )}
          secondary="Currently effective changes"
        />

        <MetricCard
          icon={CalendarClock}
          tone="amber"
          label="Scheduled changes"
          value={ccNumber(
            counts.scheduled,
          )}
          secondary="Future effective pricing"
        />

        <MetricCard
          icon={Landmark}
          tone="purple"
          label="Branch overrides"
          value={ccNumber(
            branchChanges,
          )}
          secondary={`${ccNumber(
            organizationChanges,
          )} organization-wide changes`}
        />
      </div>

      <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
        <HistoryTabs
          active={
            view
          }
          counts={
            counts
          }
          onChange={
            changeView
          }
        />

        <div className="flex flex-wrap items-center gap-2.5 border-t border-[#edf1f4] px-4 py-3">
          <SearchControl
            value={
              query
            }
            onChange={(
              value,
            ) => {
              setQuery(
                value,
              );

              setPage(
                1,
              );
            }}
          />

          <SelectControl
            icon={
              Landmark
            }
            value={
              scope
            }
            onChange={(
              value,
            ) => {
              setScope(
                value as PricingScope,
              );

              setPage(
                1,
              );
            }}
            options={[
              {
                value:
                  "ALL",
                label:
                  "All scopes",
              },

              {
                value:
                  "ORGANIZATION",
                label:
                  "Organization",
              },

              {
                value:
                  "BRANCH",
                label:
                  "Branch overrides",
              },
            ]}
          />

          <SelectControl
            icon={
              Tag
            }
            value={
              plan
            }
            onChange={(
              value,
            ) => {
              setPlan(
                value,
              );

              setPage(
                1,
              );
            }}
            options={[
              {
                value:
                  "ALL",
                label:
                  "All plans",
              },

              ...plans.map(
                (
                  item,
                ) => ({
                  value:
                    item,

                  label:
                    item,
                }),
              ),
            ]}
          />

          <SelectControl
            icon={
              UserRound
            }
            value={
              changedBy
            }
            onChange={(
              value,
            ) => {
              setChangedBy(
                value,
              );

              setPage(
                1,
              );
            }}
            options={[
              {
                value:
                  "ALL",
                label:
                  "All administrators",
              },

              ...administrators.map(
                (
                  item,
                ) => ({
                  value:
                    item,

                  label:
                    item,
                }),
              ),
            ]}
          />

          {filtersActive ? (
            <button
              type="button"
              onClick={
                resetFilters
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[9.5px] font-semibold text-[#68768f] transition hover:bg-[#f3f5f7]"
            >
              <XCircle className="size-3.5" />
              Clear filters
            </button>
          ) : null}

          <button
            type="button"
            onClick={
              exportCsv
            }
            disabled={
              !filteredRows.length
            }
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-[#cde8d9] bg-[#f2fbf6] px-3.5 text-[10px] font-semibold text-[#168650] transition hover:bg-[#eaf7ef] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="size-3.5" />
            Export
          </button>
        </div>

        {loading ? (
          <HistoryLoadingState />
        ) : pageRows.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] table-fixed text-left">
                <thead>
                  <tr className="border-y border-[#edf1f4] bg-[#fcfdfe] text-[9.5px] font-semibold text-[#56647d]">
                    <th className="w-[19%] px-4 py-2.5">
                      Scope
                    </th>

                    <th className="w-[13%] px-3 py-2.5">
                      Plan
                    </th>

                    <th className="w-[17%] px-3 py-2.5">
                      Price change
                    </th>

                    <th className="w-[12%] px-3 py-2.5">
                      Status
                    </th>

                    <th className="w-[15%] px-3 py-2.5">
                      Effective period
                    </th>

                    <th className="w-[13%] px-3 py-2.5">
                      Changed by
                    </th>

                    <th className="w-[11%] px-3 py-2.5">
                      Reason
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#edf1f4]">
                  {pageRows.map(
                    ({
                      row,
                      state,
                    }) => (
                      <HistoryTableRow
                        key={
                          row.id
                        }
                        row={
                          row
                        }
                        state={
                          state
                        }
                      />
                    ),
                  )}
                </tbody>
              </table>
            </div>

            <PaginationFooter
              page={
                currentPage
              }
              totalPages={
                totalPages
              }
              totalItems={
                filteredRows.length
              }
              firstItem={
                filteredRows.length
                  ? (
                      currentPage -
                      1
                    ) *
                      PAGE_SIZE +
                    1
                  : 0
              }
              lastItem={Math.min(
                currentPage *
                  PAGE_SIZE,
                filteredRows.length,
              )}
              onPageChange={
                setPage
              }
            />
          </>
        ) : (
          <HistoryEmptyState
            view={
              view
            }
          />
        )}
      </section>

      <section className="mt-4 rounded-[10px] border border-[#dfe5eb] bg-white px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#edf4ff] text-[#3475de]">
            <TimerReset className="size-4" />
          </span>

          <div>
            <p className="text-[10.5px] font-semibold text-[#17233c]">
              How pricing history works
            </p>

            <p className="mt-1 max-w-5xl text-[9.5px] font-normal leading-5 text-[#69768e]">
              Each record represents a commercial pricing decision.
              Organization pricing applies across the client unless a
              branch-specific override takes precedence. Scheduled
              records become effective on their start date, while
              expired and revoked records remain here as an immutable
              commercial trail.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function PageHeader({
  client,
  onBack,
  onExport,
  exportDisabled,
}: {
  client:
    ControlCenterClient | null;

  onBack:
    () => void;

  onExport:
    () => void;

  exportDisabled:
    boolean;
}) {
  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={
          onBack
        }
        className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-md px-1 text-[10px] font-semibold text-[#526078] transition hover:text-[#168650]"
      >
        <ArrowLeft className="size-3.5" />
        Back to pricing
      </button>

      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[27px] font-bold tracking-[-0.025em] text-[#111d36]">
              Pricing History
            </h1>

            {client ? (
              <StatusBadge
                value={
                  client.status
                }
              />
            ) : null}
          </div>

          <p className="mt-1 text-[12.5px] font-normal text-[#63718b]">
            {client
              ? `Commercial pricing timeline for ${client.name}.`
              : "Commercial pricing timeline for this organization."}
          </p>
        </div>

        <button
          type="button"
          onClick={
            onExport
          }
          disabled={
            exportDisabled
          }
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[#cde8d9] bg-[#f2fbf6] px-3.5 text-[10px] font-semibold text-[#168650] transition hover:bg-[#eaf7ef] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="size-3.5" />
          Export history
        </button>
      </div>
    </div>
  );
}

function HistoryTabs({
  active,
  counts,
  onChange,
}: {
  active:
    HistoryView;

  counts: {
    all:
      number;

    active:
      number;

    scheduled:
      number;

    historical:
      number;

    revoked:
      number;
  };

  onChange:
    (
      value:
        HistoryView,
    ) => void;
}) {
  const items: Array<{
    value:
      HistoryView;

    label:
      string;

    count:
      number;
  }> = [
    {
      value:
        "ALL",
      label:
        "All changes",
      count:
        counts.all,
    },

    {
      value:
        "ACTIVE",
      label:
        "Active",
      count:
        counts.active,
    },

    {
      value:
        "SCHEDULED",
      label:
        "Scheduled",
      count:
        counts.scheduled,
    },

    {
      value:
        "HISTORICAL",
      label:
        "Historical",
      count:
        counts.historical,
    },

    {
      value:
        "REVOKED",
      label:
        "Revoked",
      count:
        counts.revoked,
    },
  ];

  return (
    <div className="flex min-h-[53px] items-end gap-1 overflow-x-auto px-3 sm:px-4">
      {items.map(
        (
          item,
        ) => {
          const selected =
            active ===
            item.value;

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
              className={`relative flex h-[52px] shrink-0 items-center gap-2 px-3 text-[11px] transition ${
                selected
                  ? "font-semibold text-[#168650]"
                  : "font-medium text-[#58677f] hover:text-[#17233c]"
              }`}
            >
              {
                item.label
              }

              <span
                className={`grid min-w-[21px] place-items-center rounded-full px-1.5 py-[2px] text-[9px] font-semibold ${
                  selected
                    ? "bg-[#e5f5eb] text-[#188651]"
                    : "bg-[#f1f3f6] text-[#6b7890]"
                }`}
              >
                {
                  item.count
                }
              </span>

              {selected ? (
                <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-t-full bg-[#21935e]" />
              ) : null}
            </button>
          );
        },
      )}
    </div>
  );
}

function HistoryTableRow({
  row,
  state,
}: {
  row:
    HistoryRow;

  state:
    CommercialState;
}) {
  const change =
    row.newAmount -
    row.oldAmount;

  return (
    <tr className="group h-[78px] transition hover:bg-[#fbfcfd]">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span
            className={`grid size-[35px] shrink-0 place-items-center rounded-[8px] ${
              row.scope ===
              "ORGANIZATION"
                ? "bg-[#eaf6ee] text-[#198b55]"
                : "bg-[#edf4ff] text-[#276de9]"
            }`}
          >
            <Landmark className="size-[16px]" />
          </span>

          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold text-[#17233c]">
              {row.scope ===
              "ORGANIZATION"
                ? "Organization pricing"
                : "Branch override"}
            </p>

            <p className="mt-1 truncate text-[9px] text-[#718099]">
              {row.scope ===
              "BRANCH"
                ? row.branch?.name ??
                  "Branch"
                : "All eligible branches"}
            </p>
          </div>
        </div>
      </td>

      <td className="px-3 py-2.5">
        <p className="text-[10.5px] font-semibold text-[#26344d]">
          {
            row.planName
          }
        </p>

        <p className="mt-1 text-[9px] text-[#718099]">
          {formatInterval(
            row.interval,
          )}
        </p>
      </td>

      <td className="px-3 py-2.5">
        <p className="text-[9px] text-[#718099]">
          {ccMoney(
            row.oldAmount,
            row.currency,
          )}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-semibold text-[#168650]">
            →{" "}
            {ccMoney(
              row.newAmount,
              row.currency,
            )}
          </span>

          {change !==
          0 ? (
            <ChangeBadge
              change={
                change
              }
              oldAmount={
                row.oldAmount
              }
            />
          ) : null}
        </div>
      </td>

      <td className="px-3 py-2.5">
        <CommercialStateBadge
          state={
            state
          }
        />

        {state ===
        "REVOKED" ? (
          <p className="mt-1.5 text-[8.5px] text-[#8490a1]">
            {row.revokedAt
              ? `Revoked ${formatDate(
                  row.revokedAt,
                )}`
              : "Revoked"}
          </p>
        ) : null}
      </td>

      <td className="px-3 py-2.5">
        <p className="text-[9.5px] font-medium text-[#526078]">
          {formatDate(
            row.effectiveFrom,
          )}
        </p>

        <p className="mt-1 text-[8.5px] text-[#8490a1]">
          {row.effectiveUntil
            ? `Until ${formatDate(
                row.effectiveUntil,
              )}`
            : "No scheduled expiry"}
        </p>
      </td>

      <td className="px-3 py-2.5">
        <p className="truncate text-[9.5px] font-medium text-[#526078]">
          {
            row.changedBy
          }
        </p>

        <p className="mt-1 text-[8.5px] text-[#8490a1]">
          {formatDateTime(
            row.createdAt,
          )}
        </p>
      </td>

      <td className="px-3 py-2.5">
        <p
          className="line-clamp-3 text-[9px] leading-4 text-[#718099]"
          title={
            row.reason
          }
        >
          {
            row.reason
          }
        </p>
      </td>
    </tr>
  );
}

function SearchControl({
  value,
  onChange,
}: {
  value:
    string;

  onChange:
    (
      value:
        string,
    ) => void;
}) {
  return (
    <label className="flex h-9 min-w-[270px] flex-[1.3] items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3 focus-within:border-[#87bfa1] focus-within:ring-2 focus-within:ring-[#e6f4eb]">
      <Search className="size-3.5 shrink-0 text-[#64738c]" />

      <input
        type="search"
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
        placeholder="Search plan, branch, reason or administrator..."
        className="min-w-0 flex-1 bg-transparent text-[10px] font-normal text-[#17233c] outline-none placeholder:text-[#8c97a9]"
      />
    </label>
  );
}

function SelectControl({
  icon:
    Icon,
  value,
  onChange,
  options,
}: {
  icon:
    LucideIcon;

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
    <label className="relative flex h-9 min-w-[165px] items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3">
      <Icon className="size-3.5 shrink-0 text-[#52627c]" />

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
        className="min-w-0 flex-1 appearance-none bg-transparent pr-5 text-[9.5px] font-medium text-[#34425b] outline-none"
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

      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-[#68768f]" />
    </label>
  );
}

function MetricCard({
  icon,
  tone,
  label,
  value,
  secondary,
}: {
  icon:
    LucideIcon;

  tone:
    IconTone;

  label:
    string;

  value:
    string;

  secondary:
    string;
}) {
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

      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-[#5e6c84]">
          {
            label
          }
        </p>

        <p className="mt-1 truncate text-[22px] font-bold leading-7 tracking-[-0.02em] text-[#101d37]">
          {
            value
          }
        </p>

        <p className="mt-1 text-[9.5px] font-normal text-[#68758d]">
          {
            secondary
          }
        </p>
      </div>
    </section>
  );
}

function CommercialStateBadge({
  state,
}: {
  state:
    CommercialState;
}) {
  const styles =
    state ===
    "ACTIVE"
      ? "bg-[#eaf6ee] text-[#1b804e]"
      : state ===
          "SCHEDULED"
        ? "bg-[#edf4ff] text-[#3569b8]"
        : state ===
            "REVOKED"
          ? "bg-[#fff0f0] text-[#c93f3f]"
          : "bg-[#eef2f6] text-[#59677d]";

  return (
    <span
      className={`inline-flex min-h-[21px] items-center rounded-[5px] px-2 text-[8.5px] font-semibold ${styles}`}
    >
      {commercialStateLabel(
        state,
      )}
    </span>
  );
}

function StatusBadge({
  value,
}: {
  value:
    string;
}) {
  const normalized =
    value
      .toUpperCase()
      .replace(
        /\s+/g,
        "_",
      );

  const styles =
    normalized ===
    "ACTIVE"
      ? "bg-[#eaf6ee] text-[#1b804e]"
      : normalized ===
          "SUSPENDED"
        ? "bg-[#fff0f0] text-[#c93f3f]"
        : "bg-[#eef2f6] text-[#59677d]";

  return (
    <span
      className={`inline-flex min-h-[21px] items-center rounded-[5px] px-2 text-[8.5px] font-semibold ${styles}`}
    >
      {labelFromValue(
        value,
      )}
    </span>
  );
}

function ChangeBadge({
  change,
  oldAmount,
}: {
  change:
    number;

  oldAmount:
    number;
}) {
  if (
    oldAmount <=
    0
  ) {
    return null;
  }

  const percentage =
    (
      change /
      oldAmount
    ) *
    100;

  return (
    <span
      className={`rounded-[4px] px-1.5 py-[2px] text-[8px] font-semibold ${
        change >
        0
          ? "bg-[#fff2df] text-[#a86112]"
          : "bg-[#eaf6ee] text-[#1b804e]"
      }`}
    >
      {change >
      0
        ? "+"
        : ""}
      {percentage.toFixed(
        1,
      )}
      %
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
  page:
    number;

  totalPages:
    number;

  totalItems:
    number;

  firstItem:
    number;

  lastItem:
    number;

  onPageChange:
    (
      value:
        number,
    ) => void;
}) {
  return (
    <div className="flex min-h-[48px] flex-wrap items-center justify-between gap-3 border-t border-[#edf1f4] px-4 py-2">
      <p className="text-[9.5px] font-normal text-[#68768f]">
        Showing{" "}
        {
          firstItem
        }{" "}
        to{" "}
        {
          lastItem
        }{" "}
        of{" "}
        {
          totalItems
        }{" "}
        changes
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={
            page <=
            1
          }
          onClick={() =>
            onPageChange(
              page -
                1,
            )
          }
          className="grid size-8 place-items-center rounded-md border border-[#dfe5eb] bg-white text-[#60708a] transition hover:bg-[#f7f9fa] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" />
        </button>

        {paginationPages(
          page,
          totalPages,
        ).map(
          (
            item,
            index,
          ) =>
            item ===
            "..." ? (
              <span
                key={`ellipsis-${index}`}
                className="grid size-8 place-items-center text-[10px] text-[#748097]"
              >
                …
              </span>
            ) : (
              <button
                key={
                  item
                }
                type="button"
                onClick={() =>
                  onPageChange(
                    item,
                  )
                }
                className={`grid size-8 place-items-center rounded-md border text-[10px] font-semibold transition ${
                  item ===
                  page
                    ? "border-[#24915d] bg-[#f0f8f3] text-[#168650]"
                    : "border-[#dfe5eb] bg-white text-[#53627a] hover:bg-[#f7f9fa]"
                }`}
              >
                {
                  item
                }
              </button>
            ),
        )}

        <button
          type="button"
          disabled={
            page >=
            totalPages
          }
          onClick={() =>
            onPageChange(
              page +
                1,
            )
          }
          className="grid size-8 place-items-center rounded-md border border-[#dfe5eb] bg-white text-[#60708a] transition hover:bg-[#f7f9fa] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="size-3.5" />
        </button>

        <div className="ml-2 flex h-8 items-center rounded-md border border-[#dfe5eb] bg-white px-3 text-[9.5px] font-medium text-[#53627a]">
          {PAGE_SIZE} / page
        </div>
      </div>
    </div>
  );
}

function HistoryEmptyState({
  view,
}: {
  view:
    HistoryView;
}) {
  const content =
    view ===
    "ACTIVE"
      ? {
          title:
            "No active pricing changes",
          description:
            "No pricing-history records are currently effective under the selected filters.",
        }
      : view ===
          "SCHEDULED"
        ? {
            title:
              "No scheduled pricing changes",
            description:
              "There are no future pricing changes matching the current filters.",
          }
        : view ===
            "REVOKED"
          ? {
              title:
                "No revoked pricing changes",
              description:
                "No revoked commercial pricing records match the selected filters.",
            }
          : view ===
              "HISTORICAL"
            ? {
                title:
                  "No historical pricing changes",
                description:
                  "There are no expired pricing agreements matching the selected filters.",
              }
            : {
                title:
                  "No pricing changes found",
                description:
                  "No commercial pricing records match the selected filters.",
              };

  return (
    <div className="grid min-h-[270px] place-items-center border-t border-[#edf1f4] px-6 py-12 text-center">
      <div>
        <div className="mx-auto grid size-11 place-items-center rounded-full bg-[#eef6f1] text-[#168650]">
          <History className="size-5" />
        </div>

        <p className="mt-3 text-[12px] font-semibold text-[#17233c]">
          {
            content.title
          }
        </p>

        <p className="mx-auto mt-1 max-w-md text-[9.5px] font-normal leading-5 text-[#6b7890]">
          {
            content.description
          }
        </p>
      </div>
    </div>
  );
}

function HistoryLoadingState() {
  return (
    <div className="border-t border-[#edf1f4]">
      <div className="h-9 animate-pulse border-b border-[#edf1f4] bg-[#fafcfd]" />

      {Array.from({
        length:
          7,
      }).map(
        (
          _,
          index,
        ) => (
          <div
            key={
              index
            }
            className="flex h-[78px] animate-pulse items-center gap-4 border-b border-[#edf1f4] px-4"
          >
            <div className="size-9 rounded-lg bg-slate-100" />

            <div className="h-3 w-[160px] rounded bg-slate-100" />

            <div className="h-3 w-[100px] rounded bg-slate-100" />

            <div className="h-3 w-[130px] rounded bg-slate-100" />

            <div className="ml-auto h-3 w-[100px] rounded bg-slate-100" />
          </div>
        ),
      )}
    </div>
  );
}

type IconTone =
  | "green"
  | "blue"
  | "amber"
  | "purple";

function LargeIcon({
  icon:
    Icon,
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
      <Icon
        className="size-[22px]"
        strokeWidth={
          1.9
        }
      />
    </span>
  );
}

function iconTone(
  tone:
    IconTone,
) {
  if (
    tone ===
    "blue"
  ) {
    return "bg-[#edf4ff] text-[#276de9]";
  }

  if (
    tone ===
    "amber"
  ) {
    return "bg-[#fff3df] text-[#e38012]";
  }

  if (
    tone ===
    "purple"
  ) {
    return "bg-[#f3edff] text-[#7146de]";
  }

  return "bg-[#eaf6ee] text-[#198b55]";
}

function resolveCommercialState(
  row:
    HistoryRow,
): CommercialState {
  if (
    row.revokedAt
  ) {
    return "REVOKED";
  }

  const now =
    Date.now();

  const start =
    new Date(
      row.effectiveFrom,
    );

  if (
    !Number.isNaN(
      start.getTime(),
    ) &&
    start.getTime() >
      now
  ) {
    return "SCHEDULED";
  }

  if (
    row.effectiveUntil
  ) {
    const end =
      new Date(
        row.effectiveUntil,
      );

    if (
      !Number.isNaN(
        end.getTime(),
      ) &&
      end.getTime() <
        now
    ) {
      return "EXPIRED";
    }
  }

  return "ACTIVE";
}

function commercialStateLabel(
  state:
    CommercialState,
) {
  if (
    state ===
    "SCHEDULED"
  ) {
    return "Scheduled";
  }

  if (
    state ===
    "EXPIRED"
  ) {
    return "Historical";
  }

  if (
    state ===
    "REVOKED"
  ) {
    return "Revoked";
  }

  return "Active";
}

function formatInterval(
  value:
    string,
) {
  return value
    .toLowerCase()
    .replace(
      /_/g,
      " ",
    )
    .replace(
      /\b\w/g,
      (
        letter,
      ) =>
        letter.toUpperCase(),
    );
}

function formatDate(
  value:
    string,
) {
  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric",
    },
  ).format(
    date,
  );
}

function formatDateTime(
  value:
    string,
) {
  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric",

      hour:
        "2-digit",

      minute:
        "2-digit",
    },
  ).format(
    date,
  );
}

function labelFromValue(
  value:
    string,
) {
  return value
    .replace(
      /_/g,
      " ",
    )
    .trim()
    .split(
      /\s+/,
    )
    .map(
      (
        word,
      ) =>
        word
          .charAt(
            0,
          )
          .toUpperCase() +
        word
          .slice(
            1,
          )
          .toLowerCase(),
    )
    .join(
      " ",
    );
}

function paginationPages(
  current:
    number,
  total:
    number,
): Array<
  number | "..."
> {
  if (
    total <=
    5
  ) {
    return Array.from(
      {
        length:
          total,
      },
      (
        _,
        index,
      ) =>
        index +
        1,
    );
  }

  if (
    current <=
    3
  ) {
    return [
      1,
      2,
      3,
      "...",
      total,
    ];
  }

  if (
    current >=
    total -
      2
  ) {
    return [
      1,
      "...",
      total -
        2,
      total -
        1,
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

function safeFileName(
  value:
    string,
) {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-",
    )
    .replace(
      /^-+|-+$/g,
      "",
    );
}