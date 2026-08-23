"use client";

import {
  ArrowRight,
  Building2,
  CalendarClock,
  History,
  Landmark,
  Plus,
  Search,
  Tag,
  WalletCards,
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
  ControlCenterClient,
  ControlCenterPlan,
  ControlCenterPricing,
  ControlCenterPricingHistory,
} from "./types";

import {
  ccMoney,
  ccNumber,
} from "./formatters";

type PricingView =
  | "DEFAULT"
  | "CUSTOM"
  | "SCHEDULED"
  | "HISTORY";

type ClientPricingData = {
  client: ControlCenterClient;
  pricing: ControlCenterPricing | null;
  history: ControlCenterPricingHistory | null;
};

type GlobalHistoryRow =
  ControlCenterPricingHistory["history"][number] & {
    organizationId: string;
    organizationName: string;
  };

export function ControlCenterPricingWorkspaceSection({
  session,
  clients = [],
  onOpenClient,
  onManageClientPricing,
}: {
  session: ControlCenterSession;
  clients?: ControlCenterClient[];
  onOpenClient: (tenantId: string) => void;
  onManageClientPricing: (tenantId: string) => void;
}) {
  const [renderedAt] = useState(
    () => Date.now(),
  );

  const [view, setView] =
    useState<PricingView>("DEFAULT");

  const [query, setQuery] =
    useState("");

  const [clientData, setClientData] =
    useState<ClientPricingData[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [
    showCreateDialog,
    setShowCreateDialog,
  ] = useState(false);

  const [
    createQuery,
    setCreateQuery,
  ] = useState("");

  /*
   * Defensive normalization.
   *
   * The global Pricing page expects an array of client rows.
   * Keeping this guard here prevents a malformed caller or stale
   * hot-reload state from crashing on `.filter()` / `.map()`.
   */
  const clientRows = useMemo(
    () =>
      Array.isArray(clients)
        ? clients
        : [],
    [clients],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadGlobalPricing() {
      if (!clientRows.length) {
        setClientData([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const results =
          await Promise.all(
            clientRows.map(
              async (
                client,
              ): Promise<ClientPricingData> => {
                const [
                  pricingResult,
                  historyResult,
                ] =
                  await Promise.allSettled([
                    controlCenterFetch<ControlCenterPricing>(
                      `/clients/${client.id}/pricing`,
                      session,
                    ),

                    controlCenterFetch<ControlCenterPricingHistory>(
                      `/clients/${client.id}/pricing-history`,
                      session,
                    ),
                  ]);

                return {
                  client,

                  pricing:
                    pricingResult.status ===
                    "fulfilled"
                      ? pricingResult.value
                      : null,

                  history:
                    historyResult.status ===
                    "fulfilled"
                      ? historyResult.value
                      : null,
                };
              },
            ),
          );

        if (cancelled) {
          return;
        }

        setClientData(results);
      } catch (caughtError) {
        if (cancelled) {
          return;
        }

        setClientData([]);

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load pricing information.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadGlobalPricing();

    return () => {
      cancelled = true;
    };
  }, [
    clientRows,
    session,
  ]);

  const defaultPlans =
    useMemo<ControlCenterPlan[]>(() => {
      for (const row of clientData) {
        if (
          Array.isArray(
            row.pricing?.plans,
          ) &&
          row.pricing.plans.length
        ) {
          return row.pricing.plans;
        }
      }

      return [];
    }, [clientData]);

  const historyRows =
    useMemo<GlobalHistoryRow[]>(() => {
      const rows: GlobalHistoryRow[] = [];

      for (const item of clientData) {
        const historyItems =
          Array.isArray(
            item.history?.history,
          )
            ? item.history.history
            : [];

        for (const historyItem of historyItems) {
          rows.push({
            ...historyItem,

            organizationId:
              item.client.id,

            organizationName:
              item.client.name,
          });
        }
      }

      return rows.sort(
        (a, b) =>
          safeTimestamp(
            b.createdAt,
          ) -
          safeTimestamp(
            a.createdAt,
          ),
      );
    }, [clientData]);

  const scheduledChanges =
    useMemo(
      () =>
        historyRows.filter(
          (item) => {
            if (item.revokedAt) {
              return false;
            }

            const start =
              new Date(
                item.effectiveFrom,
              );

            return (
              !Number.isNaN(
                start.getTime(),
              ) &&
              start.getTime() >
                renderedAt
            );
          },
        ),
      [historyRows, renderedAt],
    );

  const activeOverrides =
    useMemo(
      () =>
        historyRows.filter(
          (item) =>
            isHistoryOverrideActive(
              item,
            ),
        ),
      [historyRows],
    );

  const customClients =
    useMemo(
      () =>
        clientRows.filter(
          (client) =>
            client.pricingType ===
            "CUSTOM",
        ),
      [clientRows],
    );

  const filteredCustomClients =
    useMemo(() => {
      const needle =
        query
          .trim()
          .toLowerCase();

      if (!needle) {
        return customClients;
      }

      return customClients.filter(
        (client) =>
          [
            client.name,
            client.ownerName,
            client.email,
            client.phone,
          ].some((value) =>
            String(
              value ?? "",
            )
              .toLowerCase()
              .includes(needle),
          ),
      );
    }, [
      customClients,
      query,
    ]);

  const createClients =
    useMemo(() => {
      const needle =
        createQuery
          .trim()
          .toLowerCase();

      if (!needle) {
        return clientRows;
      }

      return clientRows.filter(
        (client) =>
          [
            client.name,
            client.ownerName,
            client.email,
            client.phone,
          ].some((value) =>
            String(
              value ?? "",
            )
              .toLowerCase()
              .includes(needle),
          ),
      );
    }, [
      clientRows,
      createQuery,
    ]);

  const overrideCountByClient =
    useMemo(() => {
      const map =
        new Map<
          string,
          {
            organization: number;
            branch: number;
          }
        >();

      for (const item of activeOverrides) {
        const current =
          map.get(
            item.organizationId,
          ) ?? {
            organization: 0,
            branch: 0,
          };

        if (
          item.scope ===
          "BRANCH"
        ) {
          current.branch += 1;
        } else {
          current.organization += 1;
        }

        map.set(
          item.organizationId,
          current,
        );
      }

      return map;
    }, [activeOverrides]);

  return (
    <>
      <div className="mx-auto w-full max-w-[1500px]">
        <PageHeader
          onCreateCustomPricing={() =>
            setShowCreateDialog(
              true,
            )
          }
        />

        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={WalletCards}
            tone="green"
            label="Default plans"
            value={ccNumber(
              defaultPlans.length,
            )}
            secondary="Published Rembeh plans"
          />

          <MetricCard
            icon={Tag}
            tone="blue"
            label="Custom clients"
            value={ccNumber(
              customClients.length,
            )}
            secondary="Negotiated commercial terms"
          />

          <MetricCard
            icon={Building2}
            tone="amber"
            label="Active overrides"
            value={ccNumber(
              activeOverrides.length,
            )}
            secondary="Organization and branch overrides"
          />

          <MetricCard
            icon={CalendarClock}
            tone="slate"
            label="Scheduled changes"
            value={ccNumber(
              scheduledChanges.length,
            )}
            secondary="Future effective pricing"
          />
        </div>

        <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <PricingTabs
            active={view}
            onChange={setView}
            counts={{
              defaultPlans:
                defaultPlans.length,

              customClients:
                customClients.length,

              scheduled:
                scheduledChanges.length,

              history:
                historyRows.length,
            }}
          />

          {error ? (
            <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-[10.5px] font-medium text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <PricingLoadingState />
          ) : view ===
            "DEFAULT" ? (
            <DefaultPricingView
              plans={
                defaultPlans
              }
            />
          ) : view ===
            "CUSTOM" ? (
            <CustomPricingView
              query={query}
              onQueryChange={
                setQuery
              }
              clients={
                filteredCustomClients
              }
              overrideCountByClient={
                overrideCountByClient
              }
              onOpenClient={
                onOpenClient
              }
              onManagePricing={
                onManageClientPricing
              }
              onCreate={() =>
                setShowCreateDialog(
                  true,
                )
              }
            />
          ) : view ===
            "SCHEDULED" ? (
            <ScheduledPricingView
              items={
                scheduledChanges
              }
              onManagePricing={
                onManageClientPricing
              }
            />
          ) : (
            <PricingHistoryView
              items={
                historyRows
              }
              onOpenClient={
                onOpenClient
              }
            />
          )}
        </section>
      </div>

      {showCreateDialog ? (
        <CreatePricingDialog
          clients={
            createClients
          }
          query={
            createQuery
          }
          onQueryChange={
            setCreateQuery
          }
          onClose={() => {
            setShowCreateDialog(
              false,
            );

            setCreateQuery(
              "",
            );
          }}
          onSelectClient={(
            tenantId,
          ) => {
            setShowCreateDialog(
              false,
            );

            setCreateQuery(
              "",
            );

            onManageClientPricing(
              tenantId,
            );
          }}
        />
      ) : null}
    </>
  );
}

function PageHeader({
  onCreateCustomPricing,
}: {
  onCreateCustomPricing: () => void;
}) {
  const date =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      },
    ).format(
      new Date(),
    );

  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-5">
      <div>
        <h1 className="text-[27px] font-bold tracking-[-0.025em] text-[#111d36]">
          Pricing
        </h1>

        <p className="mt-1 text-[12.5px] font-normal text-[#63718b]">
          Configure standard plans, negotiated agreements and
          scheduled pricing changes.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <p className="hidden text-[11px] font-medium text-[#61708a] xl:block">
          {date}
        </p>

        <button
          type="button"
          onClick={
            onCreateCustomPricing
          }
          className="inline-flex h-9 items-center gap-2 rounded-md bg-[#188653] px-3.5 text-[10px] font-semibold text-white transition hover:bg-[#147849]"
        >
          <Plus className="size-3.5" />
          Create custom pricing
        </button>
      </div>
    </div>
  );
}

function PricingTabs({
  active,
  onChange,
  counts,
}: {
  active: PricingView;

  onChange: (
    value: PricingView,
  ) => void;

  counts: {
    defaultPlans: number;
    customClients: number;
    scheduled: number;
    history: number;
  };
}) {
  const tabs: Array<{
    value: PricingView;
    label: string;
    count: number;
  }> = [
    {
      value: "DEFAULT",
      label: "Default pricing",
      count:
        counts.defaultPlans,
    },

    {
      value: "CUSTOM",
      label: "Custom agreements",
      count:
        counts.customClients,
    },

    {
      value: "SCHEDULED",
      label: "Scheduled changes",
      count:
        counts.scheduled,
    },

    {
      value: "HISTORY",
      label: "History",
      count:
        counts.history,
    },
  ];

  return (
    <div className="flex min-h-[53px] items-end gap-1 overflow-x-auto px-3 sm:px-4">
      {tabs.map(
        (tab) => {
          const selected =
            active ===
            tab.value;

          return (
            <button
              key={
                tab.value
              }
              type="button"
              onClick={() =>
                onChange(
                  tab.value,
                )
              }
              className={`relative flex h-[52px] shrink-0 items-center gap-2 px-3 text-[11px] transition ${
                selected
                  ? "font-semibold text-[#168650]"
                  : "font-medium text-[#58677f] hover:text-[#17233c]"
              }`}
            >
              {tab.label}

              <span
                className={`grid min-w-[21px] place-items-center rounded-full px-1.5 py-[2px] text-[9px] font-semibold ${
                  selected
                    ? "bg-[#e5f5eb] text-[#188651]"
                    : "bg-[#f1f3f6] text-[#6b7890]"
                }`}
              >
                {tab.count}
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

function DefaultPricingView({
  plans,
}: {
  plans:
    ControlCenterPlan[];
}) {
  if (!plans.length) {
    return (
      <EmptyState
        icon={WalletCards}
        title="No default pricing available"
        description="The standard subscription plans could not be loaded."
      />
    );
  }

  return (
    <div className="border-t border-[#edf1f4]">
      <div className="border-b border-[#edf1f4] bg-[#fcfdfe] px-4 py-3">
        <p className="text-[10.5px] font-semibold text-[#17233c]">
          Standard Rembeh pricing
        </p>

        <p className="mt-1 text-[9.5px] font-normal text-[#69768f]">
          These rates apply unless an organization or branch has an
          approved custom agreement.
        </p>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map(
          (
            plan,
            index,
          ) => (
            <DefaultPlanCard
              key={
                plan.id
              }
              plan={
                plan
              }
              index={
                index
              }
            />
          ),
        )}
      </div>

      <div className="flex items-start gap-3 border-t border-[#edf1f4] bg-[#fcfdfd] px-4 py-3">
        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-[#eef5ff] text-[#3576dc]">
          <WalletCards className="size-3.5" />
        </div>

        <div>
          <p className="text-[10px] font-semibold text-[#26344d]">
            Pricing hierarchy
          </p>

          <p className="mt-1 text-[9.5px] leading-4 text-[#718099]">
            Branch overrides take precedence over organization
            pricing. Organization pricing takes precedence over the
            standard prices shown above.
          </p>
        </div>
      </div>
    </div>
  );
}

function DefaultPlanCard({
  plan,
  index,
}: {
  plan:
    ControlCenterPlan;

  index: number;
}) {
  return (
    <article className="rounded-[10px] border border-[#dfe5eb] bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <SmallIcon
          icon={
            WalletCards
          }
          tone={
            index % 3 ===
            0
              ? "green"
              : index % 3 ===
                  1
                ? "blue"
                : "amber"
          }
        />

        <span className="rounded-[5px] bg-[#eef2f6] px-2 py-1 text-[8.5px] font-semibold text-[#59677d]">
          {plan.currency}
        </span>
      </div>

      <p className="mt-4 text-[12px] font-semibold text-[#17233c]">
        {plan.name}
      </p>

      <p className="mt-1 text-[9.5px] font-normal text-[#718099]">
        {formatInterval(
          plan.interval,
        )}
      </p>

      <p className="mt-4 text-[22px] font-bold tracking-[-0.02em] text-[#111d36]">
        {ccMoney(
          plan.amount,
          plan.currency,
        )}
      </p>

      <p className="mt-1 text-[9px] font-normal text-[#718099]">
        Standard price
      </p>
    </article>
  );
}

function CustomPricingView({
  query,
  onQueryChange,
  clients,
  overrideCountByClient,
  onOpenClient,
  onManagePricing,
  onCreate,
}: {
  query: string;

  onQueryChange: (
    value: string,
  ) => void;

  clients:
    ControlCenterClient[];

  overrideCountByClient:
    Map<
      string,
      {
        organization: number;
        branch: number;
      }
    >;

  onOpenClient: (
    tenantId: string,
  ) => void;

  onManagePricing: (
    tenantId: string,
  ) => void;

  onCreate: () => void;
}) {
  return (
    <div className="border-t border-[#edf1f4]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#edf1f4] px-4 py-3">
        <label className="flex h-9 min-w-[280px] flex-1 items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3 focus-within:border-[#87bfa1]">
          <Search className="size-3.5 text-[#64738c]" />

          <input
            value={query}
            onChange={(
              event,
            ) =>
              onQueryChange(
                event.target
                  .value,
              )
            }
            placeholder="Search custom pricing agreements..."
            className="min-w-0 flex-1 bg-transparent text-[10.5px] text-[#17233c] outline-none placeholder:text-[#8c97a9]"
          />
        </label>

        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[#cfe3d7] bg-[#f4faf6] px-3 text-[10px] font-semibold text-[#168650] transition hover:bg-[#eaf6ef]"
        >
          <Plus className="size-3.5" />
          New agreement
        </button>
      </div>

      {clients.length ? (
        <div className="divide-y divide-[#edf1f4]">
          {clients.map(
            (
              client,
              index,
            ) => {
              const counts =
                overrideCountByClient.get(
                  client.id,
                ) ?? {
                  organization: 0,
                  branch: 0,
                };

              return (
                <CustomAgreementRow
                  key={
                    client.id
                  }
                  client={
                    client
                  }
                  index={
                    index
                  }
                  organizationOverrides={
                    counts.organization
                  }
                  branchOverrides={
                    counts.branch
                  }
                  onOpen={() =>
                    onOpenClient(
                      client.id,
                    )
                  }
                  onManage={() =>
                    onManagePricing(
                      client.id,
                    )
                  }
                />
              );
            },
          )}
        </div>
      ) : (
        <EmptyState
          icon={Tag}
          title="No custom agreements"
          description="No organizations matching this search currently use negotiated pricing."
          action={
            !query ? (
              <button
                type="button"
                onClick={
                  onCreate
                }
                className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-[#188653] px-3.5 text-[10px] font-semibold text-white"
              >
                <Plus className="size-3.5" />
                Create custom pricing
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

function CustomAgreementRow({
  client,
  index,
  organizationOverrides,
  branchOverrides,
  onOpen,
  onManage,
}: {
  client:
    ControlCenterClient;

  index: number;

  organizationOverrides:
    number;

  branchOverrides:
    number;

  onOpen: () => void;

  onManage: () => void;
}) {
  return (
    <div className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1.25fr)_150px_180px_auto] md:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <SmallIcon
          icon={
            Landmark
          }
          tone={
            index % 3 ===
            0
              ? "green"
              : index % 3 ===
                  1
                ? "blue"
                : "amber"
          }
        />

        <div className="min-w-0">
          <button
            type="button"
            onClick={onOpen}
            className="block max-w-full truncate text-left text-[10.5px] font-semibold text-[#17233c] transition hover:text-[#168650]"
          >
            {client.name}
          </button>

          <p className="mt-1 truncate text-[9.5px] font-normal text-[#718099]">
            {client.ownerName ??
              client.email ??
              "No owner recorded"}
          </p>
        </div>
      </div>

      <div>
        <p className="text-[9px] font-medium uppercase tracking-[0.04em] text-[#8a94a5]">
          Scope
        </p>

        <p className="mt-1 text-[10px] font-semibold text-[#26344d]">
          {organizationOverrides >
          0
            ? branchOverrides >
              0
              ? "Organization + branch"
              : "Organization"
            : branchOverrides >
                0
              ? "Branch"
              : "Custom"}
        </p>
      </div>

      <div>
        <p className="text-[9px] font-medium uppercase tracking-[0.04em] text-[#8a94a5]">
          Overrides
        </p>

        <div className="mt-1 flex flex-wrap gap-1.5">
          {organizationOverrides >
          0 ? (
            <SmallBadge
              label={`${organizationOverrides} organization`}
              tone="green"
            />
          ) : null}

          {branchOverrides >
          0 ? (
            <SmallBadge
              label={`${branchOverrides} branch`}
              tone="blue"
            />
          ) : null}

          {organizationOverrides ===
            0 &&
          branchOverrides ===
            0 ? (
            <SmallBadge
              label="Custom pricing"
              tone="green"
            />
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={onManage}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#cfe3d7] bg-[#f4faf6] px-3 text-[10px] font-semibold text-[#168650] transition hover:bg-[#eaf6ef]"
      >
        Manage
        <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
}

function ScheduledPricingView({
  items,
  onManagePricing,
}: {
  items:
    GlobalHistoryRow[];

  onManagePricing: (
    tenantId: string,
  ) => void;
}) {
  if (!items.length) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No scheduled pricing changes"
        description="There are currently no future pricing changes waiting to take effect."
      />
    );
  }

  return (
    <div className="border-t border-[#edf1f4]">
      <div className="divide-y divide-[#edf1f4]">
        {items.map(
          (item) => (
            <div
              key={`${item.organizationId}-${item.id}`}
              className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.25fr)_150px_170px_160px_auto] lg:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-[10.5px] font-semibold text-[#17233c]">
                  {
                    item.organizationName
                  }
                </p>

                <p className="mt-1 truncate text-[9.5px] text-[#718099]">
                  {item.scope ===
                  "BRANCH"
                    ? `${
                        item.branch
                          ?.name ??
                        "Branch"
                      } · ${
                        item.planName
                      }`
                    : `Organization · ${item.planName}`}
                </p>
              </div>

              <div>
                <p className="text-[9px] text-[#8a94a5]">
                  Current
                </p>

                <p className="mt-1 text-[10px] font-semibold text-[#26344d]">
                  {ccMoney(
                    item.oldAmount,
                    item.currency,
                  )}
                </p>
              </div>

              <div>
                <p className="text-[9px] text-[#8a94a5]">
                  New price
                </p>

                <p className="mt-1 text-[10px] font-semibold text-[#168650]">
                  {ccMoney(
                    item.newAmount,
                    item.currency,
                  )}
                </p>
              </div>

              <div>
                <p className="text-[9px] text-[#8a94a5]">
                  Effective
                </p>

                <p className="mt-1 text-[10px] font-semibold text-[#26344d]">
                  {formatDate(
                    item.effectiveFrom,
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  onManagePricing(
                    item.organizationId,
                  )
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[9.5px] font-semibold text-[#168650] transition hover:bg-[#f0f8f3]"
              >
                Review
                <ArrowRight className="size-3" />
              </button>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function PricingHistoryView({
  items,
  onOpenClient,
}: {
  items:
    GlobalHistoryRow[];

  onOpenClient: (
    tenantId: string,
  ) => void;
}) {
  const [query, setQuery] =
    useState("");

  const filtered =
    useMemo(() => {
      const needle =
        query
          .trim()
          .toLowerCase();

      if (!needle) {
        return items;
      }

      return items.filter(
        (item) =>
          [
            item.organizationName,
            item.branch?.name,
            item.planName,
            item.scope,
            item.reason,
            item.changedBy,
          ].some((value) =>
            String(
              value ?? "",
            )
              .toLowerCase()
              .includes(needle),
          ),
      );
    }, [
      items,
      query,
    ]);

  if (!items.length) {
    return (
      <EmptyState
        icon={History}
        title="No pricing history"
        description="Pricing changes will appear here after custom pricing has been created or modified."
      />
    );
  }

  return (
    <div className="border-t border-[#edf1f4]">
      <div className="border-b border-[#edf1f4] px-4 py-3">
        <label className="flex h-9 max-w-[480px] items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3 focus-within:border-[#87bfa1]">
          <Search className="size-3.5 text-[#64738c]" />

          <input
            value={query}
            onChange={(
              event,
            ) =>
              setQuery(
                event.target
                  .value,
              )
            }
            placeholder="Search organization, branch, plan or administrator..."
            className="min-w-0 flex-1 bg-transparent text-[10.5px] outline-none placeholder:text-[#8c97a9]"
          />
        </label>
      </div>

      {filtered.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] table-fixed text-left">
            <thead>
              <tr className="bg-[#fcfdfe] text-[9.5px] font-semibold text-[#56647d]">
                <th className="w-[22%] px-4 py-2.5">
                  Organization / Scope
                </th>

                <th className="w-[15%] px-3 py-2.5">
                  Plan
                </th>

                <th className="w-[18%] px-3 py-2.5">
                  Change
                </th>

                <th className="w-[13%] px-3 py-2.5">
                  Effective
                </th>

                <th className="w-[15%] px-3 py-2.5">
                  Changed by
                </th>

                <th className="w-[17%] px-3 py-2.5">
                  Reason
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#edf1f4]">
              {filtered.map(
                (
                  item,
                ) => (
                  <tr
                    key={`${item.organizationId}-${item.id}`}
                    className="h-[66px] transition hover:bg-[#fbfcfd]"
                  >
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenClient(
                            item.organizationId,
                          )
                        }
                        className="block max-w-full truncate text-left text-[10px] font-semibold text-[#26344d] hover:text-[#168650]"
                      >
                        {
                          item.organizationName
                        }
                      </button>

                      <p className="mt-1 truncate text-[9px] text-[#718099]">
                        {item.scope ===
                        "BRANCH"
                          ? item
                              .branch
                              ?.name ??
                            "Branch"
                          : "Organization pricing"}
                      </p>
                    </td>

                    <td className="px-3 py-2.5 text-[10px] font-semibold text-[#26344d]">
                      {
                        item.planName
                      }
                    </td>

                    <td className="px-3 py-2.5">
                      <p className="text-[9.5px] text-[#718099]">
                        {ccMoney(
                          item.oldAmount,
                          item.currency,
                        )}
                      </p>

                      <p className="mt-1 text-[10px] font-semibold text-[#168650]">
                        →{" "}
                        {ccMoney(
                          item.newAmount,
                          item.currency,
                        )}
                      </p>
                    </td>

                    <td className="px-3 py-2.5 text-[9.5px] text-[#526078]">
                      {formatDate(
                        item.effectiveFrom,
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      <p className="text-[9.5px] font-medium text-[#526078]">
                        {
                          item.changedBy
                        }
                      </p>

                      <p className="mt-1 text-[8.5px] text-[#8490a1]">
                        {formatDate(
                          item.createdAt,
                        )}
                      </p>
                    </td>

                    <td className="px-3 py-2.5 text-[9.5px] leading-4 text-[#718099]">
                      {
                        item.reason
                      }
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Search}
          title="No pricing changes found"
          description="No pricing-history records match your search."
        />
      )}
    </div>
  );
}

function CreatePricingDialog({
  clients,
  query,
  onQueryChange,
  onSelectClient,
  onClose,
}: {
  clients:
    ControlCenterClient[];

  query: string;

  onQueryChange: (
    value: string,
  ) => void;

  onSelectClient: (
    tenantId: string,
  ) => void;

  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (
        event.key ===
        "Escape"
      ) {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-pricing-title"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close custom pricing dialog"
        className="absolute inset-0 bg-[#0f172a]/35 backdrop-blur-[1px]"
      />

      <section className="relative z-10 flex max-h-[78vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[12px] border border-[#dfe5eb] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#edf1f4] px-5 py-4">
          <div>
            <p
              id="create-pricing-title"
              className="text-[13px] font-semibold text-[#17233c]"
            >
              Create custom pricing
            </p>

            <p className="mt-1 text-[9.5px] leading-4 text-[#718099]">
              Choose the client whose organization or branch pricing
              you want to configure.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-md text-[#65738a] transition hover:bg-[#f3f5f7]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="border-b border-[#edf1f4] p-4">
          <label className="flex h-9 items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3 focus-within:border-[#87bfa1]">
            <Search className="size-3.5 text-[#64738c]" />

            <input
              autoFocus
              value={query}
              onChange={(
                event,
              ) =>
                onQueryChange(
                  event.target
                    .value,
                )
              }
              placeholder="Search organizations..."
              className="min-w-0 flex-1 bg-transparent text-[10.5px] text-[#17233c] outline-none placeholder:text-[#8c97a9]"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {clients.length ? (
            <div className="divide-y divide-[#edf1f4]">
              {clients.map(
                (
                  client,
                  index,
                ) => (
                  <button
                    key={
                      client.id
                    }
                    type="button"
                    onClick={() =>
                      onSelectClient(
                        client.id,
                      )
                    }
                    className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[#fbfcfd]"
                  >
                    <SmallIcon
                      icon={
                        Landmark
                      }
                      tone={
                        index %
                            3 ===
                          0
                          ? "green"
                          : index %
                                3 ===
                              1
                            ? "blue"
                            : "amber"
                      }
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10.5px] font-semibold text-[#17233c] group-hover:text-[#168650]">
                        {
                          client.name
                        }
                      </span>

                      <span className="mt-1 block truncate text-[9px] text-[#718099]">
                        {client.ownerName ??
                          client.email ??
                          "No owner recorded"}{" "}
                        ·{" "}
                        {ccNumber(
                          client.branchCount,
                        )}{" "}
                        {client.branchCount ===
                        1
                          ? "branch"
                          : "branches"}
                      </span>
                    </span>

                    <div className="flex shrink-0 items-center gap-2">
                      <SmallBadge
                        label={
                          client.pricingType ===
                          "CUSTOM"
                            ? "Custom"
                            : "Default"
                        }
                        tone={
                          client.pricingType ===
                          "CUSTOM"
                            ? "green"
                            : "slate"
                        }
                      />

                      <ArrowRight className="size-3.5 text-[#8b96a7] transition group-hover:translate-x-0.5 group-hover:text-[#168650]" />
                    </div>
                  </button>
                ),
              )}
            </div>
          ) : (
            <div className="grid min-h-[200px] place-items-center px-5 py-10 text-center">
              <div>
                <Search className="mx-auto size-5 text-[#8b96a7]" />

                <p className="mt-3 text-[11px] font-semibold text-[#17233c]">
                  No organizations found
                </p>

                <p className="mt-1 text-[9.5px] text-[#718099]">
                  Try a different organization name or contact.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
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

function SmallBadge({
  label,
  tone,
}: {
  label: string;

  tone:
    | "green"
    | "blue"
    | "slate";
}) {
  const styles =
    tone === "green"
      ? "bg-[#eaf6ee] text-[#1b804e]"
      : tone === "blue"
        ? "bg-[#edf4ff] text-[#3569b8]"
        : "bg-[#eef2f6] text-[#59677d]";

  return (
    <span
      className={`inline-flex rounded-[5px] px-2 py-1 text-[8.5px] font-semibold ${styles}`}
    >
      {label}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[260px] place-items-center border-t border-[#edf1f4] px-6 py-12 text-center">
      <div>
        <div className="mx-auto grid size-11 place-items-center rounded-full bg-[#eef6f1] text-[#168650]">
          <Icon className="size-5" />
        </div>

        <p className="mt-3 text-[12px] font-semibold text-[#17233c]">
          {title}
        </p>

        <p className="mx-auto mt-1 max-w-md text-[10px] leading-5 text-[#6b7890]">
          {description}
        </p>

        {action}
      </div>
    </div>
  );
}

function PricingLoadingState() {
  return (
    <div className="border-t border-[#edf1f4] p-4">
      <div className="grid animate-pulse gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({
          length: 3,
        }).map(
          (_, index) => (
            <div
              key={index}
              className="h-[170px] rounded-[10px] border border-[#edf1f4] bg-[#fafbfc]"
            />
          ),
        )}
      </div>
    </div>
  );
}

type IconTone =
  | "green"
  | "blue"
  | "amber"
  | "slate";

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
    tone === "slate"
  ) {
    return "bg-[#eef2f6] text-[#65738a]";
  }

  return "bg-[#eaf6ee] text-[#198b55]";
}

function isHistoryOverrideActive(
  item:
    GlobalHistoryRow,
) {
  if (
    item.revokedAt
  ) {
    return false;
  }

  const start =
    new Date(
      item.effectiveFrom,
    );

  if (
    Number.isNaN(
      start.getTime(),
    )
  ) {
    return false;
  }

  const now =
    Date.now();

  if (
    start.getTime() >
    now
  ) {
    return false;
  }

  if (
    item.effectiveUntil
  ) {
    const end =
      new Date(
        item.effectiveUntil,
      );

    if (
      !Number.isNaN(
        end.getTime(),
      ) &&
      end.getTime() <
        now
    ) {
      return false;
    }
  }

  return true;
}

function safeTimestamp(
  value: string,
) {
  const timestamp =
    new Date(
      value,
    ).getTime();

  return Number.isNaN(
    timestamp,
  )
    ? 0
    : timestamp;
}

function formatInterval(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(
      /_/g,
      " ",
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}

function formatDate(
  value: string,
) {
  const date =
    new Date(value);

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
  ).format(date);
}
