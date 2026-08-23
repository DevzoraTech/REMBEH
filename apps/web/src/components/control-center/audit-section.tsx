"use client";

import {
  Activity,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Download,
  Eye,
  FileClock,
  FilterX,
  Megaphone,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X,
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
  ControlCenterAuditCategory,
  ControlCenterAuditLog,
  ControlCenterAuditResponse,
} from "./types";

import {
  ccDateTime,
  ccNumber,
  compactAction,
} from "./formatters";

type AuditView =
  | "ALL"
  | "SECURITY"
  | "COMMERCIAL"
  | "COMMUNICATIONS";

export function AuditSection({
  session,
}: {
  session: ControlCenterSession;
}) {
  const [view, setView] =
    useState<AuditView>("ALL");

  const [data, setData] =
    useState<ControlCenterAuditResponse | null>(
      null,
    );

  const [query, setQuery] =
    useState("");

  const [debouncedQuery, setDebouncedQuery] =
    useState("");

  const [adminId, setAdminId] =
    useState("ALL");

  const [action, setAction] =
    useState("ALL");

  const [entityType, setEntityType] =
    useState("ALL");

  const [dateFrom, setDateFrom] =
    useState("");

  const [dateTo, setDateTo] =
    useState("");

  const [page, setPage] =
    useState(1);

  const [pageSize, setPageSize] =
    useState(20);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [selectedLog, setSelectedLog] =
    useState<ControlCenterAuditLog | null>(
      null,
    );

  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          setDebouncedQuery(
            query.trim(),
          );

          setPage(
            1,
          );
        },
        350,
      );

    return () =>
      window.clearTimeout(
        timer,
      );
  }, [
    query,
  ]);

  useEffect(() => {
    let cancelled =
      false;

    async function load() {
      setLoading(
        true,
      );

      setError(
        null,
      );

      try {
        const params =
          new URLSearchParams();

        params.set(
          "page",
          String(
            page,
          ),
        );

        params.set(
          "pageSize",
          String(
            pageSize,
          ),
        );

        if (
          view !==
          "ALL"
        ) {
          params.set(
            "category",
            view,
          );
        }

        if (
          debouncedQuery
        ) {
          params.set(
            "search",
            debouncedQuery,
          );
        }

        if (
          adminId !==
          "ALL"
        ) {
          params.set(
            "adminId",
            adminId,
          );
        }

        if (
          action !==
          "ALL"
        ) {
          params.set(
            "action",
            action,
          );
        }

        if (
          entityType !==
          "ALL"
        ) {
          params.set(
            "entityType",
            entityType,
          );
        }

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

        const response =
          await controlCenterFetch<ControlCenterAuditResponse>(
            `/audit-logs?${params.toString()}`,
            session,
          );

        if (
          cancelled
        ) {
          return;
        }

        setData(
          response,
        );
      } catch (caughtError) {
        if (
          cancelled
        ) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load audit logs.",
        );
      } finally {
        if (
          !cancelled
        ) {
          setLoading(
            false,
          );
        }
      }
    }

    void load();

    return () => {
      cancelled =
        true;
    };
  }, [
    action,
    adminId,
    dateFrom,
    dateTo,
    debouncedQuery,
    entityType,
    page,
    pageSize,
    session,
    view,
  ]);

  const filtersActive =
    Boolean(
      query ||
        adminId !==
          "ALL" ||
        action !==
          "ALL" ||
        entityType !==
          "ALL" ||
        dateFrom ||
        dateTo,
    );

  function clearFilters() {
    setQuery(
      "",
    );

    setDebouncedQuery(
      "",
    );

    setAdminId(
      "ALL",
    );

    setAction(
      "ALL",
    );

    setEntityType(
      "ALL",
    );

    setDateFrom(
      "",
    );

    setDateTo(
      "",
    );

    setPage(
      1,
    );
  }

  function exportCurrentPage() {
    const rows =
      data?.logs ??
      [];

    if (
      !rows.length
    ) {
      return;
    }

    downloadAuditCsv(
      rows,
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[1500px]">
        <PageHeader />

        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={FileClock}
            tone="green"
            label="Audit events"
            value={ccNumber(
              data?.stats.total,
            )}
            secondary="Recorded administrative actions"
          />

          <MetricCard
            icon={Clock3}
            tone="blue"
            label="Last 24 hours"
            value={ccNumber(
              data?.stats.last24Hours,
            )}
            secondary="Recent control center activity"
          />

          <MetricCard
            icon={ShieldCheck}
            tone="amber"
            label="Access & security"
            value={ccNumber(
              data?.stats.security,
            )}
            secondary="Account and administrator actions"
          />

          <MetricCard
            icon={CreditCard}
            tone="purple"
            label="Commercial changes"
            value={ccNumber(
              data?.stats.commercial,
            )}
            secondary="Pricing and commercial administration"
          />
        </div>

        <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <AuditTabs
            active={
              view
            }
            onChange={(
              next,
            ) => {
              setView(
                next,
              );

              setPage(
                1,
              );
            }}
            counts={{
              all:
                data?.stats.total ??
                0,

              security:
                data?.stats.security ??
                0,

              commercial:
                data?.stats.commercial ??
                0,

              communications:
                data?.stats.communications ??
                0,
            }}
          />

          <div className="flex flex-wrap items-center gap-2.5 border-t border-[#edf1f4] px-4 py-3">
            <SearchControl
              value={
                query
              }
              onChange={
                setQuery
              }
            />

            <SelectControl
              icon={UserRound}
              value={
                adminId
              }
              onChange={(
                value,
              ) => {
                setAdminId(
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

                ...(
                  data?.filters.admins ??
                  []
                ).map(
                  (
                    admin,
                  ) => ({
                    value:
                      admin.id,

                    label:
                      admin.name,
                  }),
                ),
              ]}
            />

            <SelectControl
              icon={SlidersHorizontal}
              value={
                action
              }
              onChange={(
                value,
              ) => {
                setAction(
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
                    "All actions",
                },

                ...(
                  data?.filters.actions ??
                  []
                ).map(
                  (
                    item,
                  ) => ({
                    value:
                      item,

                    label:
                      compactAction(
                        item,
                      ),
                  }),
                ),
              ]}
            />

            <SelectControl
              icon={Activity}
              value={
                entityType
              }
              onChange={(
                value,
              ) => {
                setEntityType(
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
                    "All entities",
                },

                ...(
                  data?.filters.entityTypes ??
                  []
                ).map(
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

            <label className="relative">
              <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#64738c]" />

              <input
                type="date"
                value={
                  dateFrom
                }
                onChange={(
                  event,
                ) => {
                  setDateFrom(
                    event.target.value,
                  );

                  setPage(
                    1,
                  );
                }}
                className="h-9 rounded-md border border-[#dfe5eb] bg-white pl-8 pr-2 text-[9.5px] text-[#526078] outline-none"
              />
            </label>

            <label className="relative">
              <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#64738c]" />

              <input
                type="date"
                value={
                  dateTo
                }
                onChange={(
                  event,
                ) => {
                  setDateTo(
                    event.target.value,
                  );

                  setPage(
                    1,
                  );
                }}
                className="h-9 rounded-md border border-[#dfe5eb] bg-white pl-8 pr-2 text-[9.5px] text-[#526078] outline-none"
              />
            </label>

            {filtersActive ? (
              <button
                type="button"
                onClick={
                  clearFilters
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[9.5px] font-semibold text-[#68768f] hover:bg-[#f3f5f7]"
              >
                <FilterX className="size-3.5" />
                Clear
              </button>
            ) : null}

            <button
              type="button"
              onClick={
                exportCurrentPage
              }
              disabled={
                !data?.logs.length
              }
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-[#cde8d9] bg-[#f2fbf6] px-3 text-[9.5px] font-semibold text-[#168650] hover:bg-[#eaf7ef] disabled:opacity-40"
            >
              <Download className="size-3.5" />
              Export
            </button>
          </div>

          {error ? (
            <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-[10px] font-medium text-red-700">
              {
                error
              }
            </div>
          ) : null}

          {loading ? (
            <AuditLoadingState />
          ) : data?.logs.length ? (
            <>
              <AuditTable
                rows={
                  data.logs
                }
                onOpen={
                  setSelectedLog
                }
              />

              <PaginationFooter
                page={
                  data.pagination.page
                }
                pageSize={
                  data.pagination.pageSize
                }
                total={
                  data.pagination.total
                }
                totalPages={
                  data.pagination.totalPages
                }
                onPageChange={
                  setPage
                }
                onPageSizeChange={(
                  value,
                ) => {
                  setPageSize(
                    value,
                  );

                  setPage(
                    1,
                  );
                }}
              />
            </>
          ) : (
            <AuditEmptyState />
          )}
        </section>
      </div>

      {selectedLog ? (
        <AuditDetailPanel
          log={
            selectedLog
          }
          onClose={() =>
            setSelectedLog(
              null,
            )
          }
        />
      ) : null}
    </>
  );
}

function PageHeader() {
  const date =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        weekday:
          "long",
        day:
          "2-digit",
        month:
          "long",
        year:
          "numeric",
      },
    ).format(
      new Date(),
    );

  return (
    <div className="mb-5 flex items-start justify-between gap-5">
      <div>
        <h1 className="text-[27px] font-bold tracking-[-0.025em] text-[#111d36]">
          Audit Logs
        </h1>

        <p className="mt-1 text-[12.5px] font-normal text-[#63718b]">
          Investigate administrative actions and changes across the
          Rembeh control center.
        </p>
      </div>

      <p className="mt-2 hidden text-[11px] font-medium text-[#61708a] md:block">
        {
          date
        }
      </p>
    </div>
  );
}

function AuditTabs({
  active,
  counts,
  onChange,
}: {
  active:
    AuditView;

  counts: {
    all:
      number;
    security:
      number;
    commercial:
      number;
    communications:
      number;
  };

  onChange:
    (
      value:
        AuditView,
    ) => void;
}) {
  const items: Array<{
    value:
      AuditView;
    label:
      string;
    count:
      number;
  }> = [
    {
      value:
        "ALL",
      label:
        "All activity",
      count:
        counts.all,
    },
    {
      value:
        "SECURITY",
      label:
        "Access & security",
      count:
        counts.security,
    },
    {
      value:
        "COMMERCIAL",
      label:
        "Commercial",
      count:
        counts.commercial,
    },
    {
      value:
        "COMMUNICATIONS",
      label:
        "Communications",
      count:
        counts.communications,
    },
  ];

  return (
    <div className="flex min-h-[53px] items-end gap-1 overflow-x-auto px-3 sm:px-4">
      {items.map(
        (item) => {
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

function AuditTable({
  rows,
  onOpen,
}: {
  rows:
    ControlCenterAuditLog[];

  onOpen:
    (
      log:
        ControlCenterAuditLog,
    ) => void;
}) {
  return (
    <div className="overflow-x-auto border-t border-[#edf1f4]">
      <table className="w-full min-w-[1120px] table-fixed text-left">
        <thead>
          <tr className="bg-[#fcfdfe] text-[9.5px] font-semibold text-[#56647d]">
            <th className="w-[25%] px-4 py-2.5">
              Action
            </th>

            <th className="w-[15%] px-3 py-2.5">
              Category
            </th>

            <th className="w-[20%] px-3 py-2.5">
              Entity
            </th>

            <th className="w-[20%] px-3 py-2.5">
              Administrator
            </th>

            <th className="w-[17%] px-3 py-2.5">
              Time
            </th>

            <th className="w-[3%] px-2 py-2.5" />
          </tr>
        </thead>

        <tbody className="divide-y divide-[#edf1f4]">
          {rows.map(
            (row) => (
              <tr
                key={
                  row.id
                }
                className="group h-[64px] transition hover:bg-[#fbfcfd]"
              >
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      onOpen(
                        row,
                      )
                    }
                    className="block max-w-full text-left"
                  >
                    <span className="block truncate text-[10.5px] font-semibold text-[#17233c] group-hover:text-[#168650]">
                      {compactAction(
                        row.action,
                      )}
                    </span>

                    <span className="mt-1 block truncate text-[8.5px] text-[#8490a1]">
                      {
                        row.action
                      }
                    </span>
                  </button>
                </td>

                <td className="px-3 py-2.5">
                  <CategoryBadge
                    category={
                      row.category
                    }
                  />
                </td>

                <td className="px-3 py-2.5">
                  <p className="text-[9.5px] font-semibold text-[#526078]">
                    {
                      row.entityType
                    }
                  </p>

                  <p className="mt-1 truncate font-mono text-[8px] text-[#8490a1]">
                    {row.entityId ??
                      "No entity ID"}
                  </p>
                </td>

                <td className="px-3 py-2.5">
                  <p className="truncate text-[9.5px] font-semibold text-[#526078]">
                    {row.admin?.name ??
                      "System"}
                  </p>

                  <p className="mt-1 truncate text-[8.5px] text-[#8490a1]">
                    {row.admin?.email ??
                      "Automated action"}
                  </p>
                </td>

                <td className="px-3 py-2.5 text-[9.5px] text-[#526078]">
                  {ccDateTime(
                    row.createdAt,
                  )}
                </td>

                <td className="px-2 py-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      onOpen(
                        row,
                      )
                    }
                    className="grid size-8 place-items-center rounded-md text-[#68768f] hover:bg-[#f1f4f6] hover:text-[#17233c]"
                  >
                    <Eye className="size-3.5" />
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function AuditDetailPanel({
  log,
  onClose,
}: {
  log:
    ControlCenterAuditLog;

  onClose:
    () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        onClick={
          onClose
        }
        className="absolute inset-0 bg-[#0f172a]/25"
        aria-label="Close audit log details"
      />

      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col border-l border-[#dfe5eb] bg-white shadow-[-18px_0_50px_rgba(15,23,42,0.12)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#edf1f4] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#17233c]">
              Audit event
            </p>

            <p className="mt-1 truncate text-[9.5px] text-[#718099]">
              {
                log.id
              }
            </p>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="grid size-8 shrink-0 place-items-center rounded-md text-[#65738a] hover:bg-[#f3f5f7]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <DetailSection
            title="Event"
          >
            <DetailRow
              label="Action"
              value={compactAction(
                log.action,
              )}
            />

            <DetailRow
              label="Action code"
              value={
                log.action
              }
              mono
            />

            <DetailRow
              label="Category"
              value={
                categoryLabel(
                  log.category,
                )
              }
            />

            <DetailRow
              label="Time"
              value={ccDateTime(
                log.createdAt,
              )}
            />
          </DetailSection>

          <DetailSection
            title="Administrator"
          >
            <DetailRow
              label="Name"
              value={
                log.admin?.name ??
                "System"
              }
            />

            <DetailRow
              label="Email"
              value={
                log.admin?.email ??
                "Automated action"
              }
            />
          </DetailSection>

          <DetailSection
            title="Target"
          >
            <DetailRow
              label="Entity type"
              value={
                log.entityType
              }
            />

            <DetailRow
              label="Entity ID"
              value={
                log.entityId ??
                "Not recorded"
              }
              mono
            />
          </DetailSection>

          <ChangeSection
            title="Previous value"
            value={
              log.oldValue
            }
            emptyText="No previous value was stored for this action."
          />

          <ChangeSection
            title="New value"
            value={
              log.newValue
            }
            emptyText="No new value was stored for this action."
          />
        </div>
      </aside>
    </div>
  );
}

function ChangeSection({
  title,
  value,
  emptyText,
}: {
  title:
    string;

  value:
    unknown | null;

  emptyText:
    string;
}) {
  return (
    <section className="border-b border-[#edf1f4] px-5 py-4">
      <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.04em] text-[#8490a1]">
        {
          title
        }
      </p>

      {value == null ? (
        <p className="text-[9.5px] leading-5 text-[#718099]">
          {
            emptyText
          }
        </p>
      ) : (
        <pre className="max-h-[360px] overflow-auto rounded-[8px] border border-[#e2e7ec] bg-[#f8fafb] p-3 font-mono text-[9px] leading-5 text-[#34425b]">
          {JSON.stringify(
            value,
            null,
            2,
          )}
        </pre>
      )}
    </section>
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
    <label className="flex h-9 min-w-[255px] flex-[1.2] items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3 focus-within:border-[#87bfa1]">
      <Search className="size-3.5 shrink-0 text-[#64738c]" />

      <input
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
        placeholder="Search action, entity or administrator..."
        className="min-w-0 flex-1 bg-transparent text-[10px] text-[#17233c] outline-none placeholder:text-[#8c97a9]"
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
    <label className="relative flex h-9 min-w-[155px] items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3">
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
          (option) => (
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

function PaginationFooter({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page:
    number;

  pageSize:
    number;

  total:
    number;

  totalPages:
    number;

  onPageChange:
    (
      value:
        number,
    ) => void;

  onPageSizeChange:
    (
      value:
        number,
    ) => void;
}) {
  const first =
    total
      ? (
          page -
          1
        ) *
          pageSize +
        1
      : 0;

  const last =
    Math.min(
      page *
        pageSize,
      total,
    );

  return (
    <div className="flex min-h-[48px] flex-wrap items-center justify-between gap-3 border-t border-[#edf1f4] px-4 py-2">
      <p className="text-[9.5px] text-[#68768f]">
        Showing{" "}
        {
          first
        }{" "}
        to{" "}
        {
          last
        }{" "}
        of{" "}
        {
          total
        }{" "}
        events
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
          className="grid size-8 place-items-center rounded-md border border-[#dfe5eb] bg-white text-[#60708a] hover:bg-[#f7f9fa] disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" />
        </button>

        <span className="min-w-[70px] text-center text-[9.5px] font-medium text-[#526078]">
          {
            page
          }{" "}
          /{" "}
          {
            totalPages
          }
        </span>

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
          className="grid size-8 place-items-center rounded-md border border-[#dfe5eb] bg-white text-[#60708a] hover:bg-[#f7f9fa] disabled:opacity-40"
        >
          <ChevronRight className="size-3.5" />
        </button>

        <div className="relative ml-2">
          <select
            value={
              pageSize
            }
            onChange={(
              event,
            ) =>
              onPageSizeChange(
                Number(
                  event.target.value,
                ),
              )
            }
            className="h-8 appearance-none rounded-md border border-[#dfe5eb] bg-white pl-3 pr-7 text-[9px] text-[#526078] outline-none"
          >
            {[20, 50, 100].map(
              (size) => (
                <option
                  key={
                    size
                  }
                  value={
                    size
                  }
                >
                  {
                    size
                  }{" "}
                  / page
                </option>
              ),
            )}
          </select>

          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-[#718099]" />
        </div>
      </div>
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

        <p className="mt-1 text-[9.5px] text-[#68758d]">
          {
            secondary
          }
        </p>
      </div>
    </section>
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

function CategoryBadge({
  category,
}: {
  category:
    ControlCenterAuditCategory;
}) {
  const styles =
    category ===
    "SECURITY"
      ? "bg-[#fff2df] text-[#a86112]"
      : category ===
          "COMMERCIAL"
        ? "bg-[#f2edff] text-[#6944c8]"
        : category ===
            "COMMUNICATIONS"
          ? "bg-[#edf4ff] text-[#3569b8]"
          : "bg-[#eef2f6] text-[#59677d]";

  return (
    <span
      className={`inline-flex min-h-[21px] items-center rounded-[5px] px-2 text-[8.5px] font-semibold ${styles}`}
    >
      {categoryLabel(
        category,
      )}
    </span>
  );
}

function categoryLabel(
  category:
    ControlCenterAuditCategory,
) {
  if (
    category ===
    "SECURITY"
  ) {
    return "Access & security";
  }

  if (
    category ===
    "COMMERCIAL"
  ) {
    return "Commercial";
  }

  if (
    category ===
    "COMMUNICATIONS"
  ) {
    return "Communications";
  }

  return "General";
}

function DetailSection({
  title,
  children,
}: {
  title:
    string;

  children:
    React.ReactNode;
}) {
  return (
    <section className="border-b border-[#edf1f4] px-5 py-4">
      <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.04em] text-[#8490a1]">
        {
          title
        }
      </p>

      <div className="space-y-3">
        {
          children
        }
      </div>
    </section>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label:
    string;

  value:
    string;

  mono?:
    boolean;
}) {
  return (
    <div className="grid grid-cols-[125px_minmax(0,1fr)] gap-4">
      <p className="text-[9px] text-[#8490a1]">
        {
          label
        }
      </p>

      <p
        className={`break-all text-[9.5px] font-medium text-[#34425b] ${
          mono
            ? "font-mono"
            : ""
        }`}
      >
        {
          value
        }
      </p>
    </div>
  );
}

function AuditLoadingState() {
  return (
    <div className="border-t border-[#edf1f4]">
      {Array.from({
        length:
          8,
      }).map(
        (
          _,
          index,
        ) => (
          <div
            key={
              index
            }
            className="flex h-[64px] animate-pulse items-center gap-5 border-b border-[#edf1f4] px-4"
          >
            <div className="h-3 w-[220px] rounded bg-[#f0f2f4]" />
            <div className="h-3 w-[120px] rounded bg-[#f0f2f4]" />
            <div className="h-3 w-[150px] rounded bg-[#f0f2f4]" />
            <div className="ml-auto h-3 w-[110px] rounded bg-[#f0f2f4]" />
          </div>
        ),
      )}
    </div>
  );
}

function AuditEmptyState() {
  return (
    <div className="grid min-h-[260px] place-items-center border-t border-[#edf1f4] px-6 py-12 text-center">
      <div>
        <div className="mx-auto grid size-11 place-items-center rounded-full bg-[#eef6f1] text-[#168650]">
          <FileClock className="size-5" />
        </div>

        <p className="mt-3 text-[12px] font-semibold text-[#17233c]">
          No audit events found
        </p>

        <p className="mx-auto mt-1 max-w-md text-[9.5px] leading-5 text-[#6b7890]">
          No administrative actions match the current filters.
        </p>
      </div>
    </div>
  );
}

function downloadAuditCsv(
  rows:
    ControlCenterAuditLog[],
) {
  const data: Array<
    Array<
      string | number
    >
  > = [
    [
      "Date",
      "Administrator",
      "Administrator Email",
      "Category",
      "Action",
      "Entity Type",
      "Entity ID",
      "Old Value",
      "New Value",
    ],

    ...rows.map(
      (row) => [
        row.createdAt,

        row.admin?.name ??
          "System",

        row.admin?.email ??
          "",

        categoryLabel(
          row.category,
        ),

        row.action,

        row.entityType,

        row.entityId ??
          "",

        row.oldValue == null
          ? ""
          : JSON.stringify(
              row.oldValue,
            ),

        row.newValue == null
          ? ""
          : JSON.stringify(
              row.newValue,
            ),
      ],
    ),
  ];

  const csv =
    data
      .map((row) =>
        row
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
    `rembeh-audit-log-${new Date()
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