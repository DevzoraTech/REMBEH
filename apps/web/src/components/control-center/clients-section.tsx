"use client";

import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Landmark,
  MoreVertical,
  Search,
  ShieldCheck,
  Tag,
  UserRound,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  ControlCenterClient,
  ControlCenterClientsResponse,
} from "./types";

import {
  ccDate,
  ccNumber,
} from "./formatters";

type ClientStatusFilter =
  | "ALL"
  | "ACTIVE"
  | "SUSPENDED"
  | "PENDING_VERIFICATION"
  | "ARCHIVED";

type PricingFilter =
  | "ALL"
  | "CUSTOM"
  | "DEFAULT";

type OnboardingFilter =
  | "ALL"
  | "THIS_MONTH"
  | "30_DAYS"
  | "90_DAYS";

const PAGE_SIZE = 10;

export function ControlCenterClientsSection({
  data,
  onOpenClient,
  onOpenPricing,
}: {
  data: ControlCenterClientsResponse | null;
  onOpenClient: (tenantId: string) => void;
  onOpenPricing: (tenantId: string) => void;
}) {
  const [query, setQuery] = useState("");

  const [pricingType, setPricingType] =
    useState<PricingFilter>("ALL");

  const [status, setStatus] =
    useState<ClientStatusFilter>("ALL");

  const [onboarded, setOnboarded] =
    useState<OnboardingFilter>("ALL");

  const [page, setPage] = useState(1);

  const [menuClientId, setMenuClientId] =
    useState<string | null>(null);

  const stats = data?.stats;

  const clients = data?.clients ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return clients.filter((client) => {
      const matchesSearch =
        !needle ||
        [
          client.name,
          client.ownerName,
          client.email,
          client.phone,
          client.status,
        ].some((value) =>
          (value ?? "")
            .toLowerCase()
            .includes(needle),
        );

      const matchesPricing =
        pricingType === "ALL" ||
        client.pricingType === pricingType;

      const matchesStatus =
        status === "ALL" ||
        client.status === status;

      const matchesOnboarding =
        matchesOnboardingFilter(
          client.createdAt,
          onboarded,
        );

      return (
        matchesSearch &&
        matchesPricing &&
        matchesStatus &&
        matchesOnboarding
      );
    });
  }, [
    clients,
    onboarded,
    pricingType,
    query,
    status,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / PAGE_SIZE),
  );

  const currentPage = Math.min(page, totalPages);

  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function resetPage() {
    setPage(1);
  }

  function exportCsv() {
    const header = [
      "Organization",
      "Owner",
      "Email",
      "Phone",
      "Branches",
      "Active Branches",
      "Users",
      "Pricing",
      "Status",
      "Date Onboarded",
    ];

    const body = filtered.map((client) => [
      client.name,
      client.ownerName ?? "",
      client.email ?? "",
      client.phone ?? "",
      client.branchCount,
      client.activeBranchCount,
      client.userCount,
      client.pricingType,
      client.status,
      client.createdAt,
    ]);

    const csv = [header, ...body]
      .map((line) =>
        line
          .map((cell) => {
            const value = String(cell ?? "").replace(
              /"/g,
              '""',
            );

            return `"${value}"`;
          })
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = `rembeh-clients-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <PageHeader />

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users}
          tone="green"
          label="Total clients"
          value={ccNumber(stats?.totalClients)}
          secondary="Registered organizations"
        />

        <MetricCard
          icon={ShieldCheck}
          tone="blue"
          label="Active clients"
          value={ccNumber(stats?.activeClients)}
          secondary="Organizations currently active"
        />

        <MetricCard
          icon={Tag}
          tone="amber"
          label="Custom pricing"
          value={ccNumber(stats?.customPricing)}
          secondary="Negotiated commercial terms"
        />

        <MetricCard
          icon={Building2}
          tone="slate"
          label="Default pricing"
          value={ccNumber(stats?.defaultPricing)}
          secondary="Using standard Rembeh pricing"
        />
      </div>

      <section className="mt-4 overflow-visible rounded-[10px] border border-[#dfe5eb] bg-white">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchControl
            value={query}
            onChange={(value) => {
              setQuery(value);
              resetPage();
            }}
          />

          <SelectControl
            icon={Tag}
            value={pricingType}
            onChange={(value) => {
              setPricingType(
                value as PricingFilter,
              );

              resetPage();
            }}
            options={[
              {
                value: "ALL",
                label: "All pricing",
              },
              {
                value: "CUSTOM",
                label: "Custom pricing",
              },
              {
                value: "DEFAULT",
                label: "Default pricing",
              },
            ]}
          />

          <SelectControl
            icon={ShieldCheck}
            value={status}
            onChange={(value) => {
              setStatus(
                value as ClientStatusFilter,
              );

              resetPage();
            }}
            options={[
              {
                value: "ALL",
                label: "All statuses",
              },
              {
                value: "ACTIVE",
                label: "Active",
              },
              {
                value: "SUSPENDED",
                label: "Suspended",
              },
              {
                value: "PENDING_VERIFICATION",
                label: "Pending verification",
              },
              {
                value: "ARCHIVED",
                label: "Archived",
              },
            ]}
          />

          <SelectControl
            icon={UserRound}
            value={onboarded}
            onChange={(value) => {
              setOnboarded(
                value as OnboardingFilter,
              );

              resetPage();
            }}
            options={[
              {
                value: "ALL",
                label: "All onboarding dates",
              },
              {
                value: "THIS_MONTH",
                label: "This month",
              },
              {
                value: "30_DAYS",
                label: "Last 30 days",
              },
              {
                value: "90_DAYS",
                label: "Last 90 days",
              },
            ]}
          />

          <button
            type="button"
            onClick={exportCsv}
            disabled={!filtered.length}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-[#cde8d9] bg-[#f2fbf6] px-3.5 text-[10.5px] font-semibold text-[#168650] transition hover:bg-[#eaf7ef] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="size-3.5" />
            Export
          </button>
        </div>

        {pageRows.length ? (
          <>
            <div className="overflow-x-auto border-t border-[#edf1f4]">
              <table className="w-full min-w-[1120px] table-fixed text-left">
                <thead>
                  <tr className="bg-[#fcfdfe] text-[9.5px] font-semibold text-[#56647d]">
                    <th className="w-[25%] px-4 py-2.5">
                      Organization
                    </th>

                    <th className="w-[18%] px-3 py-2.5">
                      Owner / Contact
                    </th>

                    <th className="w-[10%] px-3 py-2.5">
                      Branches
                    </th>

                    <th className="w-[8%] px-3 py-2.5">
                      Users
                    </th>

                    <th className="w-[12%] px-3 py-2.5">
                      Pricing
                    </th>

                    <th className="w-[10%] px-3 py-2.5">
                      Status
                    </th>

                    <th className="w-[13%] px-3 py-2.5">
                      Onboarded
                    </th>

                    <th className="w-[4%] px-2 py-2.5 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#edf1f4]">
                  {pageRows.map((client, index) => (
                    <ClientRow
                      key={client.id}
                      client={client}
                      index={
                        (currentPage - 1) *
                          PAGE_SIZE +
                        index
                      }
                      menuOpen={
                        menuClientId === client.id
                      }
                      onToggleMenu={() =>
                        setMenuClientId((current) =>
                          current === client.id
                            ? null
                            : client.id,
                        )
                      }
                      onOpen={() => {
                        setMenuClientId(null);
                        onOpenClient(client.id);
                      }}
                      onPricing={() => {
                        setMenuClientId(null);
                        onOpenPricing(client.id);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <PaginationFooter
              page={currentPage}
              totalPages={totalPages}
              totalItems={filtered.length}
              firstItem={
                (currentPage - 1) *
                  PAGE_SIZE +
                1
              }
              lastItem={Math.min(
                currentPage * PAGE_SIZE,
                filtered.length,
              )}
              onPageChange={setPage}
            />
          </>
        ) : (
          <EmptyState />
        )}
      </section>
    </div>
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
          Clients
        </h1>

        <p className="mt-1 text-[12.5px] font-normal text-[#63718b]">
          Manage client organizations, ownership and account
          access.
        </p>
      </div>

      <p className="mt-2 hidden text-[11px] font-medium text-[#61708a] md:block">
        {date}
      </p>
    </div>
  );
}

function ClientRow({
  client,
  index,
  menuOpen,
  onToggleMenu,
  onOpen,
  onPricing,
}: {
  client: ControlCenterClient;
  index: number;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onOpen: () => void;
  onPricing: () => void;
}) {
  return (
    <tr
      onDoubleClick={onOpen}
      className="group h-[68px] transition hover:bg-[#fbfcfd]"
    >
      <td className="px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <SmallIcon
            icon={Landmark}
            tone={
              index % 4 === 0
                ? "green"
                : index % 4 === 1
                  ? "blue"
                  : index % 4 === 2
                    ? "amber"
                    : "slate"
            }
          />

          <div className="min-w-0">
            <button
              type="button"
              onClick={onOpen}
              className="block max-w-full truncate text-left text-[10.5px] font-semibold text-[#17233c] hover:text-[#168650]"
            >
              {client.name}
            </button>

            <p className="mt-1 truncate text-[9.5px] font-normal text-[#64738d]">
              {client.email ??
                client.phone ??
                "No primary contact"}
            </p>
          </div>
        </div>
      </td>

      <td className="px-3 py-2.5">
        <p className="truncate text-[10.5px] font-semibold text-[#26344d]">
          {client.ownerName ?? "No owner assigned"}
        </p>

        <p className="mt-1 truncate text-[9px] font-normal text-[#69768e]">
          {client.phone ??
            client.email ??
            "No contact available"}
        </p>
      </td>

      <td className="px-3 py-2.5">
        <p className="text-[11px] font-semibold text-[#17233c]">
          {ccNumber(client.branchCount)}
        </p>

        <p className="mt-1 text-[9px] font-normal text-[#6b7890]">
          {ccNumber(client.activeBranchCount)} active
        </p>
      </td>

      <td className="px-3 py-2.5">
        <p className="text-[11px] font-semibold text-[#17233c]">
          {ccNumber(client.userCount)}
        </p>
      </td>

      <td className="px-3 py-2.5">
        <PricingBadge
          value={client.pricingType}
        />
      </td>

      <td className="px-3 py-2.5">
        <ClientStatusBadge
          value={client.status}
        />
      </td>

      <td className="px-3 py-2.5">
        <p className="text-[10px] font-medium text-[#26354f]">
          {ccDate(client.createdAt)}
        </p>

        <p className="mt-1 text-[9px] font-normal text-[#7b879a]">
          Client since
        </p>
      </td>

      <td className="relative px-2 py-2.5 text-right">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleMenu();
          }}
          className="grid size-8 place-items-center rounded-md text-[#68768f] transition hover:bg-[#f1f4f6] hover:text-[#17233c]"
          aria-label={`Actions for ${client.name}`}
        >
          <MoreVertical className="size-3.5" />
        </button>

        {menuOpen ? (
          <div
            className="absolute right-3 top-[47px] z-40 w-[185px] rounded-lg border border-[#dfe5eb] bg-white p-1.5 text-left shadow-[0_12px_30px_rgba(15,23,42,0.12)]"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <MenuButton
              label="Open client"
              onClick={onOpen}
            />

            <MenuButton
              label="Manage pricing"
              onClick={onPricing}
            />
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function MenuButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full items-center rounded-md px-2.5 text-[10px] font-medium text-[#42516a] transition hover:bg-[#f5f7f9] hover:text-[#17233c]"
    >
      {label}
    </button>
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
        placeholder="Search organization, owner, email or phone..."
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
    <label className="relative flex h-9 min-w-[175px] items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3">
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

function PricingBadge({
  value,
}: {
  value: "CUSTOM" | "DEFAULT";
}) {
  return (
    <span
      className={`inline-flex min-h-[21px] items-center rounded-[5px] px-2 text-[9px] font-semibold ${
        value === "CUSTOM"
          ? "bg-[#eaf6ee] text-[#1b804e]"
          : "bg-[#edf4ff] text-[#3569b8]"
      }`}
    >
      {value === "CUSTOM"
        ? "Custom"
        : "Default"}
    </span>
  );
}

function ClientStatusBadge({
  value,
}: {
  value: string;
}) {
  const normalized = value
    .toUpperCase()
    .replace(/\s+/g, "_");

  let styles =
    "bg-[#eef2f6] text-[#59677d]";

  if (normalized === "ACTIVE") {
    styles =
      "bg-[#eaf6ee] text-[#1b804e]";
  } else if (
    normalized === "PENDING_VERIFICATION"
  ) {
    styles =
      "bg-[#fff3df] text-[#ba6a12]";
  } else if (
    normalized === "SUSPENDED"
  ) {
    styles =
      "bg-[#fff0f0] text-[#c94040]";
  }

  return (
    <span
      className={`inline-flex min-h-[21px] items-center rounded-[5px] px-2 text-[9px] font-semibold ${styles}`}
    >
      {labelFromValue(value)}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="grid min-h-[260px] place-items-center border-t border-[#edf1f4] px-6 py-12 text-center">
      <div>
        <div className="mx-auto grid size-11 place-items-center rounded-full bg-[#eef6f1] text-[#168650]">
          <Building2 className="size-5" />
        </div>

        <p className="mt-3 text-[12px] font-semibold text-[#17233c]">
          No clients found
        </p>

        <p className="mx-auto mt-1 max-w-sm text-[10px] font-normal leading-5 text-[#6b7890]">
          No client organizations match the current search and
          filters.
        </p>
      </div>
    </div>
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
        Showing {firstItem} to {lastItem} of {totalItems} clients
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
  if (tone === "blue") {
    return "bg-[#edf4ff] text-[#276de9]";
  }

  if (tone === "amber") {
    return "bg-[#fff3df] text-[#e38012]";
  }

  if (tone === "slate") {
    return "bg-[#eef2f6] text-[#65738a]";
  }

  return "bg-[#eaf6ee] text-[#198b55]";
}

function matchesOnboardingFilter(
  value: string,
  filter: OnboardingFilter,
) {
  if (filter === "ALL") {
    return true;
  }

  const created = new Date(value);

  if (Number.isNaN(created.getTime())) {
    return false;
  }

  const now = new Date();

  if (filter === "THIS_MONTH") {
    return (
      created.getFullYear() === now.getFullYear() &&
      created.getMonth() === now.getMonth()
    );
  }

  const difference =
    (now.getTime() - created.getTime()) /
    86_400_000;

  if (filter === "30_DAYS") {
    return difference >= 0 && difference <= 30;
  }

  if (filter === "90_DAYS") {
    return difference >= 0 && difference <= 90;
  }

  return true;
}

function labelFromValue(
  value: string,
) {
  return value
    .replace(/_/g, " ")
    .trim()
    .split(/\s+/)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase(),
    )
    .join(" ");
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