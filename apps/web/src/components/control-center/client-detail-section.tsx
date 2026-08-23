"use client";

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Building2,
  CreditCard,
  FileText,
  Landmark,
  MapPin,
  Tag,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import type {
  ControlCenterBranch,
  ControlCenterClientDetail,
} from "./types";

import {
  ccDate,
  ccDateTime,
  ccNumber,
  compactAction,
} from "./formatters";

type ClientTab =
  | "OVERVIEW"
  | "BRANCHES"
  | "SUBSCRIPTIONS"
  | "PRICING"
  | "PAYMENTS"
  | "USERS"
  | "ACTIVITY";

export function ControlCenterClientDetailSection({
  detail,
  loading,
  onBack,
  onOpenBranch,
  onManagePricing,
  onPricingHistory,
}: {
  detail: ControlCenterClientDetail | null;
  loading: boolean;
  onBack: () => void;
  onOpenBranch: (branchId: string) => void;
  onManagePricing: () => void;
  onPricingHistory: () => void;
}) {
  const [tab, setTab] = useState<ClientTab>("OVERVIEW");

  if (loading) {
    return <ClientWorkspaceSkeleton />;
  }

  if (!detail) {
    return (
      <div className="mx-auto w-full max-w-[1500px]">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 items-center gap-2 text-[10px] font-semibold text-[#53627a] hover:text-[#17233c]"
        >
          <ArrowLeft className="size-3.5" />
          Back to clients
        </button>

        <div className="mt-4 grid min-h-[280px] place-items-center rounded-[10px] border border-[#dfe5eb] bg-white">
          <div className="text-center">
            <Building2 className="mx-auto size-6 text-[#8b96a7]" />

            <p className="mt-3 text-[12px] font-semibold text-[#17233c]">
              Client not available
            </p>

            <p className="mt-1 text-[10px] text-[#718099]">
              The client details could not be loaded.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <div className="mb-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 items-center gap-2 text-[10px] font-semibold text-[#53627a] transition hover:text-[#17233c]"
        >
          <ArrowLeft className="size-3.5" />
          Back to clients
        </button>
      </div>

      <ClientHeader
        detail={detail}
        onManagePricing={onManagePricing}
      />

      <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
        <ClientTabs
          active={tab}
          onChange={setTab}
          detail={detail}
        />

        {tab === "OVERVIEW" ? (
          <OverviewTab
            detail={detail}
            onManagePricing={onManagePricing}
            onPricingHistory={onPricingHistory}
            onOpenBranches={() => setTab("BRANCHES")}
            onOpenBranch={onOpenBranch}
            onOpenActivity={() => setTab("ACTIVITY")}
          />
        ) : tab === "BRANCHES" ? (
          <BranchesTab
            branches={detail.branches}
            onOpenBranch={onOpenBranch}
          />
        ) : tab === "SUBSCRIPTIONS" ? (
          <ClientModulePlaceholder
            icon={CreditCard}
            title="Client subscriptions"
            description="Subscription lifecycle records for this organization will live here."
          />
        ) : tab === "PRICING" ? (
          <PricingTab
            detail={detail}
            onManagePricing={onManagePricing}
            onPricingHistory={onPricingHistory}
          />
        ) : tab === "PAYMENTS" ? (
          <ClientModulePlaceholder
            icon={WalletCards}
            title="Client payments"
            description="Subscription payments belonging only to this organization will live here."
          />
        ) : tab === "USERS" ? (
          <ClientModulePlaceholder
            icon={Users}
            title="Client users"
            description="Users belonging to this organization will be grouped here by branch and role."
          />
        ) : (
          <ActivityTab
            activities={detail.recentActivity}
          />
        )}
      </section>
    </div>
  );
}

function ClientHeader({
  detail,
  onManagePricing,
}: {
  detail: ControlCenterClientDetail;
  onManagePricing: () => void;
}) {
  const client = detail.client;

  return (
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-[#eaf6ee] text-[#198b55]">
          <Landmark
            className="size-5"
            strokeWidth={1.9}
          />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[24px] font-bold tracking-[-0.025em] text-[#111d36]">
              {client.name}
            </h1>

            <ClientStatusBadge value={client.status} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-normal text-[#6a7890]">
            <span>
              Client since {ccDate(client.createdAt)}
            </span>

            <span className="text-[#c8cfd7]">
              •
            </span>

            <span>{client.country}</span>

            <span className="text-[#c8cfd7]">
              •
            </span>

            <span>{client.currency}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onManagePricing}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-[#188653] px-3.5 text-[10px] font-semibold text-white transition hover:bg-[#147849]"
      >
        <Tag className="size-3.5" />
        Manage pricing
      </button>
    </div>
  );
}

function ClientTabs({
  active,
  onChange,
  detail,
}: {
  active: ClientTab;
  onChange: (tab: ClientTab) => void;
  detail: ControlCenterClientDetail;
}) {
  const items: Array<{
    value: ClientTab;
    label: string;
    count?: number;
  }> = [
    {
      value: "OVERVIEW",
      label: "Overview",
    },
    {
      value: "BRANCHES",
      label: "Branches",
      count: detail.client.summary.totalBranches,
    },
    {
      value: "SUBSCRIPTIONS",
      label: "Subscriptions",
    },
    {
      value: "PRICING",
      label: "Pricing",
    },
    {
      value: "PAYMENTS",
      label: "Payments",
    },
    {
      value: "USERS",
      label: "Users",
      count: detail.client.summary.totalUsers,
    },
    {
      value: "ACTIVITY",
      label: "Activity",
      count: detail.recentActivity.length,
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

function OverviewTab({
  detail,
  onManagePricing,
  onPricingHistory,
  onOpenBranches,
  onOpenBranch,
  onOpenActivity,
}: {
  detail: ControlCenterClientDetail;
  onManagePricing: () => void;
  onPricingHistory: () => void;
  onOpenBranches: () => void;
  onOpenBranch: (branchId: string) => void;
  onOpenActivity: () => void;
}) {
  const client = detail.client;

  const totalBorrowers = detail.branches.reduce(
    (sum, branch) => sum + branch.borrowers,
    0,
  );

  const totalLoans = detail.branches.reduce(
    (sum, branch) => sum + branch.loans,
    0,
  );

  const activeSubscriptions = detail.branches.filter(
    (branch) =>
      branch.status.toUpperCase() === "ACTIVE" &&
      Boolean(branch.currentPeriodEnd),
  ).length;

  const lockedBranches = detail.branches.filter(
    (branch) =>
      ["LOCKED", "SUSPENDED", "BLOCKED"].includes(
        branch.status.toUpperCase(),
      ),
  ).length;

  return (
    <div className="border-t border-[#edf1f4] p-4">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric
          icon={Building2}
          label="Branches"
          value={ccNumber(client.summary.totalBranches)}
          secondary={`${ccNumber(
            client.summary.activeBranches,
          )} active`}
          tone="green"
        />

        <SummaryMetric
          icon={Users}
          label="Users"
          value={ccNumber(client.summary.totalUsers)}
          secondary="Across the organization"
          tone="blue"
        />

        <SummaryMetric
          icon={UserRound}
          label="Borrowers"
          value={ccNumber(totalBorrowers)}
          secondary="Across all branches"
          tone="amber"
        />

        <SummaryMetric
          icon={FileText}
          label="Loans"
          value={ccNumber(totalLoans)}
          secondary="Recorded portfolio"
          tone="slate"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <InfoPanel title="Organization information">
          <InfoRow
            label="Owner"
            value={
              client.owner?.name ??
              "No owner assigned"
            }
          />

          <InfoRow
            label="Email"
            value={
              client.owner?.email ??
              "Not available"
            }
          />

          <InfoRow
            label="Phone"
            value={
              client.owner?.phone ??
              "Not available"
            }
          />

          <InfoRow
            label="Registration number"
            value={
              client.registrationNumber ??
              "Not available"
            }
          />

          <InfoRow
            label="Country"
            value={client.country}
          />

          <InfoRow
            label="Currency"
            value={client.currency}
          />
        </InfoPanel>

        <InfoPanel
          title="Subscription health"
          action={
            <TextAction
              label="View branches"
              onClick={onOpenBranches}
            />
          }
        >
          <HealthRow
            label="Active subscriptions"
            value={activeSubscriptions}
            tone="green"
          />

          <HealthRow
            label="Locked branches"
            value={lockedBranches}
            tone="red"
          />

          <HealthRow
            label="Suspended branches"
            value={
              client.summary.suspendedBranches
            }
            tone="amber"
          />

          <HealthRow
            label="Total branches"
            value={
              client.summary.totalBranches
            }
            tone="slate"
          />
        </InfoPanel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <InfoPanel
          title="Commercial relationship"
          action={
            <TextAction
              label="Manage pricing"
              onClick={onManagePricing}
            />
          }
        >
          <InfoRow
            label="Pricing"
            value="Organization and branch pricing"
          />

          <InfoRow
            label="Pricing history"
            value={
              <button
                type="button"
                onClick={onPricingHistory}
                className="text-[10.5px] font-semibold text-[#168650]"
              >
                View history
              </button>
            }
          />

          <InfoRow
            label="Currency"
            value={client.currency}
          />
        </InfoPanel>

        <RecentActivityPreview
          activities={detail.recentActivity}
          onOpenActivity={onOpenActivity}
        />
      </div>

      <div className="mt-4">
        <BranchPreview
          branches={detail.branches}
          onOpenBranches={onOpenBranches}
          onOpenBranch={onOpenBranch}
        />
      </div>
    </div>
  );
}

function BranchesTab({
  branches,
  onOpenBranch,
}: {
  branches: ControlCenterBranch[];
  onOpenBranch: (branchId: string) => void;
}) {
  if (!branches.length) {
    return (
      <ClientModulePlaceholder
        icon={Building2}
        title="No branches"
        description="This organization does not have any branches yet."
      />
    );
  }

  return (
    <div className="overflow-x-auto border-t border-[#edf1f4]">
      <table className="w-full min-w-[1050px] table-fixed text-left">
        <thead>
          <tr className="bg-[#fcfdfe] text-[9.5px] font-semibold text-[#56647d]">
            <th className="w-[28%] px-4 py-2.5">
              Branch
            </th>

            <th className="w-[11%] px-3 py-2.5">
              Users
            </th>

            <th className="w-[12%] px-3 py-2.5">
              Borrowers
            </th>

            <th className="w-[11%] px-3 py-2.5">
              Loans
            </th>

            <th className="w-[16%] px-3 py-2.5">
              Subscription
            </th>

            <th className="w-[14%] px-3 py-2.5">
              Last used
            </th>

            <th className="w-[8%] px-3 py-2.5">
              Status
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-[#edf1f4]">
          {branches.map((branch, index) => (
            <tr
              key={branch.id}
              onClick={() => onOpenBranch(branch.id)}
              className="group h-[68px] cursor-pointer transition hover:bg-[#fbfcfd]"
            >
              <td className="px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <SmallIcon
                    icon={MapPin}
                    tone={
                      index % 3 === 0
                        ? "green"
                        : index % 3 === 1
                          ? "blue"
                          : "amber"
                    }
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10.5px] font-semibold text-[#17233c] transition group-hover:text-[#168650]">
                      {branch.name}
                    </p>

                    <p className="mt-1 truncate text-[9.5px] font-normal text-[#64738d]">
                      {branch.address}
                    </p>
                  </div>

                  <ArrowRight className="size-3.5 shrink-0 text-[#9aa4b3] opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </div>
              </td>

              <td className="px-3 py-2.5 text-[10.5px] font-semibold text-[#26344d]">
                {ccNumber(branch.users)}
              </td>

              <td className="px-3 py-2.5 text-[10.5px] font-semibold text-[#26344d]">
                {ccNumber(branch.borrowers)}
              </td>

              <td className="px-3 py-2.5 text-[10.5px] font-semibold text-[#26344d]">
                {ccNumber(branch.loans)}
              </td>

              <td className="px-3 py-2.5">
                <p className="text-[10px] font-semibold text-[#26344d]">
                  {branch.planCode
                    ? formatPlan(branch.planCode)
                    : "No plan"}
                </p>

                <p className="mt-1 text-[9px] font-normal text-[#6b7890]">
                  {branch.currentPeriodEnd
                    ? `Ends ${ccDate(
                        branch.currentPeriodEnd,
                      )}`
                    : "No active period"}
                </p>
              </td>

              <td className="px-3 py-2.5">
                <p className="text-[9.5px] font-medium text-[#526078]">
                  {branch.lastUsedAt
                    ? ccDateTime(branch.lastUsedAt)
                    : "Not available"}
                </p>
              </td>

              <td className="px-3 py-2.5">
                <ClientStatusBadge
                  value={branch.status}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PricingTab({
  detail,
  onManagePricing,
  onPricingHistory,
}: {
  detail: ControlCenterClientDetail;
  onManagePricing: () => void;
  onPricingHistory: () => void;
}) {
  return (
    <div className="border-t border-[#edf1f4] p-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <InfoPanel title="Pricing management">
          <p className="text-[10px] leading-5 text-[#68758d]">
            Organization-level and branch-level negotiated pricing
            is managed from the dedicated pricing workspace.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onManagePricing}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#188653] px-3.5 text-[10px] font-semibold text-white transition hover:bg-[#147849]"
            >
              <Tag className="size-3.5" />
              Manage pricing
            </button>

            <button
              type="button"
              onClick={onPricingHistory}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[#dce2e8] bg-white px-3.5 text-[10px] font-semibold text-[#526078]"
            >
              <Activity className="size-3.5" />
              Pricing history
            </button>
          </div>
        </InfoPanel>

        <InfoPanel title="Organization">
          <InfoRow
            label="Client"
            value={detail.client.name}
          />

          <InfoRow
            label="Currency"
            value={detail.client.currency}
          />

          <InfoRow
            label="Branches"
            value={ccNumber(
              detail.client.summary.totalBranches,
            )}
          />
        </InfoPanel>
      </div>
    </div>
  );
}

function ActivityTab({
  activities,
}: {
  activities: ControlCenterClientDetail["recentActivity"];
}) {
  if (!activities.length) {
    return (
      <ClientModulePlaceholder
        icon={Activity}
        title="No activity"
        description="No recent client-specific administrative activity is available."
      />
    );
  }

  return (
    <div className="border-t border-[#edf1f4]">
      <div className="divide-y divide-[#edf1f4]">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_180px]"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-1.5 size-[6px] shrink-0 rounded-full bg-[#219163]" />

              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold text-[#17233c]">
                  {compactAction(activity.action)}
                </p>

                <p className="mt-1 text-[9.5px] font-normal text-[#68758d]">
                  {activity.entityType}
                </p>
              </div>
            </div>

            <div className="md:text-right">
              <p className="text-[9.5px] font-medium text-[#526078]">
                {activity.actorName}
              </p>

              <p className="mt-1 text-[9px] font-normal text-[#7b879a]">
                {ccDateTime(activity.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentActivityPreview({
  activities,
  onOpenActivity,
}: {
  activities: ControlCenterClientDetail["recentActivity"];
  onOpenActivity: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
      <div className="flex items-center justify-between border-b border-[#edf1f4] px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold text-[#17233c]">
            Recent activity
          </p>

          <p className="mt-0.5 text-[9px] font-normal text-[#718099]">
            Latest client-related administrative actions.
          </p>
        </div>

        <TextAction
          label="View all"
          onClick={onOpenActivity}
        />
      </div>

      {activities.length ? (
        <div className="divide-y divide-[#edf1f4]">
          {activities.slice(0, 4).map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 px-4 py-3"
            >
              <span className="mt-1 size-[6px] shrink-0 rounded-full bg-[#219163]" />

              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold text-[#26344d]">
                  {compactAction(activity.action)}
                </p>

                <p className="mt-1 text-[9px] font-normal text-[#718099]">
                  {activity.actorName} ·{" "}
                  {ccDateTime(activity.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-[9.5px] text-[#718099]">
          No recent activity.
        </div>
      )}
    </section>
  );
}

function BranchPreview({
  branches,
  onOpenBranches,
  onOpenBranch,
}: {
  branches: ControlCenterBranch[];
  onOpenBranches: () => void;
  onOpenBranch: (branchId: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
      <div className="flex items-center justify-between border-b border-[#edf1f4] px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold text-[#17233c]">
            Branches
          </p>

          <p className="mt-0.5 text-[9px] font-normal text-[#718099]">
            Quick view of organization branches.
          </p>
        </div>

        <TextAction
          label="View all branches"
          onClick={onOpenBranches}
        />
      </div>

      {branches.length ? (
        <div className="divide-y divide-[#edf1f4]">
          {branches.slice(0, 5).map((branch) => (
            <button
              key={branch.id}
              type="button"
              onClick={() => onOpenBranch(branch.id)}
              className="group flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-[#fbfcfd]"
            >
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold text-[#26344d] transition group-hover:text-[#168650]">
                  {branch.name}
                </p>

                <p className="mt-1 truncate text-[9px] font-normal text-[#718099]">
                  {branch.address}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <ClientStatusBadge
                  value={branch.status}
                />

                <ArrowRight className="size-3.5 text-[#8a95a6] transition group-hover:translate-x-0.5 group-hover:text-[#168650]" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-[9.5px] text-[#718099]">
          No branches.
        </div>
      )}
    </section>
  );
}

function InfoPanel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[10px] border border-[#dfe5eb] bg-white">
      <div className="flex items-center justify-between border-b border-[#edf1f4] px-4 py-3">
        <p className="text-[11px] font-semibold text-[#17233c]">
          {title}
        </p>

        {action}
      </div>

      <div className="space-y-3 px-4 py-4">
        {children}
      </div>
    </section>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[9.5px] font-normal text-[#718099]">
        {label}
      </span>

      <span className="max-w-[65%] text-right text-[10.5px] font-semibold text-[#26344d]">
        {value}
      </span>
    </div>
  );
}

function HealthRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone:
    | "green"
    | "red"
    | "amber"
    | "slate";
}) {
  const dotClass =
    tone === "green"
      ? "bg-[#24935f]"
      : tone === "red"
        ? "bg-[#df4545]"
        : tone === "amber"
          ? "bg-[#e39a23]"
          : "bg-[#8390a3]";

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-[9.5px] font-normal text-[#718099]">
        <span
          className={`size-1.5 rounded-full ${dotClass}`}
        />
        {label}
      </span>

      <span className="text-[10.5px] font-semibold text-[#26344d]">
        {ccNumber(value)}
      </span>
    </div>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
  secondary,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  secondary: string;
  tone: IconTone;
}) {
  return (
    <section className="flex min-h-[100px] items-center gap-3 rounded-[10px] border border-[#dfe5eb] bg-white px-4">
      <SmallIcon
        icon={icon}
        tone={tone}
      />

      <div>
        <p className="text-[9.5px] font-semibold text-[#62718a]">
          {label}
        </p>

        <p className="mt-1 text-[20px] font-bold text-[#14213a]">
          {value}
        </p>

        <p className="mt-1 text-[9px] font-normal text-[#718099]">
          {secondary}
        </p>
      </div>
    </section>
  );
}

function TextAction({
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
      className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-[#168650]"
    >
      {label}
      <ArrowRight className="size-3" />
    </button>
  );
}

function ClientModulePlaceholder({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-[330px] place-items-center border-t border-[#edf1f4] px-6 py-12 text-center">
      <div>
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-[#eef6f1] text-[#168650]">
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
    [
      "SUSPENDED",
      "LOCKED",
      "BLOCKED",
    ].includes(normalized)
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

type IconTone =
  | "green"
  | "blue"
  | "amber"
  | "slate";

function SmallIcon({
  icon: Icon,
  tone,
}: {
  icon: LucideIcon;
  tone: IconTone;
}) {
  const styles =
    tone === "blue"
      ? "bg-[#edf4ff] text-[#276de9]"
      : tone === "amber"
        ? "bg-[#fff3df] text-[#e38012]"
        : tone === "slate"
          ? "bg-[#eef2f6] text-[#65738a]"
          : "bg-[#eaf6ee] text-[#198b55]";

  return (
    <span
      className={`grid size-[35px] shrink-0 place-items-center rounded-[8px] ${styles}`}
    >
      <Icon
        className="size-[16px]"
        strokeWidth={1.9}
      />
    </span>
  );
}

function ClientWorkspaceSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1500px] animate-pulse">
      <div className="h-8 w-28 rounded bg-slate-100" />

      <div className="mt-4 flex items-center gap-3">
        <div className="size-11 rounded-lg bg-slate-100" />

        <div>
          <div className="h-5 w-64 rounded bg-slate-100" />
          <div className="mt-2 h-3 w-48 rounded bg-slate-100" />
        </div>
      </div>

      <div className="mt-4 h-[53px] rounded-t-[10px] border border-[#e7ebef] bg-white" />

      <div className="grid gap-4 border border-t-0 border-[#e7ebef] bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-[100px] rounded-[10px] bg-slate-100"
          />
        ))}
      </div>
    </div>
  );
}

function formatPlan(
  value: string,
) {
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