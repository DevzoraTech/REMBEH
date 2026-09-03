"use client";

import {
  ArrowRight,
  Banknote,
  BellRing,
  Building2,
  ChevronRight,
  Clock3,
  CreditCard,
  Filter,
  Landmark,
  LockKeyhole,
  MessageCircleWarning,
  MessageSquareText,
  MoreVertical,
  Smartphone,
  Tag,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  ControlCenterClient,
  ControlCenterDashboard,
} from "./types";
import type { ControlCenterSection } from "./control-center-shell";
import {
  ccDateTime,
  ccMoney,
  ccNumber,
  compactAction,
} from "./formatters";

export function ControlCenterDashboardSection({
  dashboard,
  clients,
  onOpenClient,
  onOpenSection,
}: {
  dashboard: ControlCenterDashboard | null;
  clients: ControlCenterClient[];
  onOpenClient: (tenantId: string) => void;
  onOpenSection: (section: ControlCenterSection) => void;
}) {
  const stats = dashboard?.stats ?? {};

  const clientRows = [...clients]
    .sort((a, b) => {
      if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
      if (a.status !== "ACTIVE" && b.status === "ACTIVE") return 1;

      return b.branchCount - a.branchCount;
    })
    .slice(0, 5);

  const pendingPayments =
    stats.pendingPayments ??
    dashboard?.recentPayments.filter((payment) =>
      ["PENDING", "PENDING_VERIFICATION"].includes(
        payment.status.toUpperCase(),
      ),
    ).length ??
    0;

  const failedPayments =
    stats.failedPayments ??
    dashboard?.recentPayments.filter((payment) =>
      ["FAILED", "REJECTED"].includes(payment.status.toUpperCase()),
    ).length ??
    0;

  const failedCommunications = stats.failedCommunications ?? 0;
  const expiringSoon = stats.expiringSoonSubscriptions ?? 0;

  const attentionItems: AttentionItemData[] = [
    {
      key: "locked",
      count: stats.lockedBranches ?? 0,
      title: "Locked branches",
      subtitle: "Subscription access blocked",
      icon: LockKeyhole,
      tone: "red",
      onClick: () => onOpenSection("subscriptions"),
    },
    {
      key: "payments",
      count: pendingPayments,
      title: "Payments pending",
      subtitle: "Awaiting administrator verification",
      icon: CreditCard,
      tone: "amber",
      onClick: () => onOpenSection("payments"),
    },
    {
      key: "communications",
      count: failedCommunications,
      title: "Failed communication",
      subtitle: "Delivery failures requiring review",
      icon: MessageCircleWarning,
      tone: "red",
      onClick: () => onOpenSection("communications"),
    },
    {
      key: "expiring",
      count: expiringSoon,
      title: "Expiring soon",
      subtitle: "Subscriptions approaching expiry",
      icon: Clock3,
      tone: "amber",
      onClick: () => onOpenSection("subscriptions"),
    },
  ];

  /*
   * Keep real issues first.
   *
   * Until the API exposes failed-communication and expiring-subscription
   * totals, those cards correctly show zero rather than fabricating data.
   * They remain visible because this is the dashboard structure we are
   * establishing; the API will be enriched when those modules are rebuilt.
   */
  const attentionCount = attentionItems.filter(
    (item) => item.count > 0,
  ).length;

  const recentPayment = dashboard?.recentPayments[0] ?? null;

  const currentDate = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <div className="mb-5 flex items-start justify-between gap-5">
        <div>
          <h1 className="text-[27px] font-bold tracking-[-0.025em] text-[#111d36]">
            Dashboard
          </h1>

          <p className="mt-1 text-[12.5px] font-normal text-[#63718b]">
            Platform operations and client health overview.
          </p>
        </div>

        <p className="mt-2 hidden text-[11px] font-medium text-[#61708a] md:block">
          {currentDate}
        </p>
      </div>

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users}
          tone="green"
          label="Total clients"
          value={ccNumber(stats.totalClients)}
          secondary={`${ccNumber(stats.activeClients)} active`}
        />

        <MetricCard
          icon={Building2}
          tone="blue"
          label="Active branches"
          value={`${ccNumber(stats.activeBranches)} / ${ccNumber(
            stats.totalBranches,
          )}`}
          secondary={`${ccNumber(stats.lockedBranches)} locked`}
        />

        <MetricCard
          icon={CreditCard}
          tone="purple"
          label="Subscription revenue"
          value={ccMoney(stats.completedRevenue)}
          secondary={`${ccNumber(stats.completedPayments)} completed ${
            stats.completedPayments === 1 ? "payment" : "payments"
          }`}
        />

        <MetricCard
          icon={Tag}
          tone="amber"
          label="Pricing overrides"
          value={ccNumber(stats.activePricingOverrides)}
          secondary="Active overrides"
        />
      </div>

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users}
          tone="green"
          label="Daily active users"
          value={ccNumber(stats.dailyActiveUsers)}
          secondary={`${ccNumber(stats.monthlyActiveUsers)} monthly`}
        />
        <MetricCard
          icon={Smartphone}
          tone="blue"
          label="Mobile sessions (30d)"
          value={ccNumber(stats.mobileSessions30d)}
          secondary={`${ccNumber(stats.applicationsThisMonth)} applications this month`}
        />
        <MetricCard
          icon={Banknote}
          tone="purple"
          label="Collections (30d)"
          value={ccMoney(stats.repaymentsCollected30d)}
          secondary={`${ccNumber(stats.repaymentCount30d)} repayments`}
        />
        <MetricCard
          icon={CreditCard}
          tone="amber"
          label="Revenue this month"
          value={ccMoney(stats.revenueThisMonth)}
          secondary={`Last month ${ccMoney(stats.revenueLastMonth)}`}
        />
      </div>

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Landmark}
          tone="green"
          label="Live portfolio"
          value={ccMoney(stats.outstandingPortfolio)}
          secondary={`${ccNumber(stats.activeBorrowers)} active borrowers`}
        />
        <MetricCard
          icon={Users}
          tone="blue"
          label="New borrowers"
          value={ccNumber(stats.newBorrowersThisMonth)}
          secondary="This month"
        />
        <MetricCard
          icon={Building2}
          tone="purple"
          label="New organisations"
          value={ccNumber(stats.newOrganizationsThisMonth)}
          secondary="This month"
        />
        <MetricCard
          icon={Filter}
          tone="amber"
          label="Set-aside borrowers"
          value={ccNumber(stats.voidedBorrowers)}
          secondary="Abandoned / voided"
        />
      </div>

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={MessageSquareText}
          tone="blue"
          label="SMS sold"
          value={ccNumber(stats.smsSoldUnits)}
          secondary={`Sold at ${ccMoney(stats.smsSellRate)} / SMS`}
        />
        <MetricCard
          icon={CreditCard}
          tone="purple"
          label="SMS revenue"
          value={ccMoney(stats.smsSoldRevenue)}
          secondary={`Provider ${ccMoney(stats.smsProviderCostPerSms)} / SMS`}
        />
        <MetricCard
          icon={Banknote}
          tone="amber"
          label="SMS cost"
          value={ccMoney(stats.smsProviderCost)}
          secondary={`${ccNumber(stats.smsLifetimeUsed)} sent · ${ccNumber(stats.smsWalletAvailable)} unused`}
        />
        <MetricCard
          icon={Wallet}
          tone="green"
          label="SMS reserve"
          value={ccMoney(stats.smsReserve)}
          secondary="Revenue minus UGX 35 provider cost"
        />
      </div>

      <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
        <div className="flex items-start justify-between gap-4 px-4 pb-2 pt-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-[#17223a]">
                Needs attention
              </h2>

              {attentionCount > 0 ? (
                <span className="grid min-w-[18px] place-items-center rounded-full bg-[#dc4242] px-1.5 py-[2px] text-[9px] font-semibold leading-[14px] text-white">
                  {attentionCount}
                </span>
              ) : null}
            </div>

            <p className="mt-1 text-[10.5px] font-normal text-[#6d7890]">
              Critical items that may require your immediate action.
            </p>
          </div>

          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[10.5px] font-semibold text-[#14824e] transition hover:bg-[#f0f8f3]"
          >
            View all issues
            <ArrowRight className="size-3.5" />
          </button>
        </div>

        <div className="grid border-t border-[#edf1f4] sm:grid-cols-2 xl:grid-cols-4">
          {attentionItems.map((item, index) => (
            <AttentionItem
              key={item.key}
              item={item}
              bordered={index > 0}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-[#edf1f4] px-4 py-2 text-[10px] font-normal text-[#60708a]">
          <BellRing className="size-3.5 text-[#3478e5]" />
          Click an issue above to open the relevant workspace and take action.
        </div>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,0.92fr)]">
        <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <SectionHeader
            title="Client overview"
            subtitle="Organization health and subscription status."
            action={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenSection("clients")}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#dfe5eb] bg-white px-2.5 text-[10.5px] font-medium text-[#34425c] transition hover:bg-[#f7f9fa]"
                >
                  <Filter className="size-3.5" />
                  Filters
                </button>

                <TextAction
                  label="View all clients"
                  onClick={() => onOpenSection("clients")}
                />
              </div>
            }
          />

          {clientRows.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] table-fixed text-left">
                  <thead>
                    <tr className="border-y border-[#edf1f4] bg-[#fcfdfe] text-[9.5px] font-semibold text-[#56647d]">
                      <th className="w-[31%] px-4 py-2.5">
                        Organization
                      </th>
                      <th className="w-[10%] px-3 py-2.5">Branches</th>
                      <th className="w-[13%] px-3 py-2.5">
                        Subscription
                      </th>
                      <th className="w-[12%] px-3 py-2.5">Pricing</th>
                      <th className="w-[8%] px-3 py-2.5">Users</th>
                      <th className="w-[15%] px-3 py-2.5">
                        Last activity
                      </th>
                      <th className="w-[9%] px-3 py-2.5">Status</th>
                      <th className="w-[2%] px-2 py-2.5" />
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#edf1f4]">
                    {clientRows.map((client, index) => (
                      <ClientRow
                        key={client.id}
                        client={client}
                        index={index}
                        onOpen={() => onOpenClient(client.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex h-9 items-center justify-between border-t border-[#edf1f4] px-4">
                <span className="text-[9.5px] font-normal text-[#68758d]">
                  Showing 1 to {clientRows.length} of {clients.length} clients
                </span>

                <TextAction
                  label="View all clients"
                  onClick={() => onOpenSection("clients")}
                />
              </div>
            </>
          ) : (
            <EmptyPanel message="No client organizations are available yet." />
          )}
        </section>

        <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <SectionHeader
            title="Recent administrative activity"
            action={
              <TextAction
                label="View all"
                onClick={() => onOpenSection("audit")}
              />
            }
          />

          {dashboard?.recentActivity.length ? (
            <div className="divide-y divide-[#edf1f4]">
              {dashboard.recentActivity.slice(0, 5).map((activity) => (
                <button
                  type="button"
                  key={activity.id}
                  onClick={() => onOpenSection("audit")}
                  className="flex w-full items-center gap-3 px-4 py-[11px] text-left transition hover:bg-[#fbfcfd]"
                >
                  <span className="size-[6px] shrink-0 rounded-full bg-[#219163]" />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10.5px] font-semibold text-[#17223a]">
                      {compactAction(activity.action)}
                    </span>

                    <span className="mt-1 block truncate text-[9.5px] font-normal text-[#63718b]">
                      {activity.adminName} ·{" "}
                      {ccDateTime(activity.createdAt)}
                    </span>
                  </span>

                  <ChevronRight className="size-3.5 shrink-0 text-[#718099]" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyPanel message="No administrative activity recorded yet." />
          )}
        </section>

        <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <SectionHeader title="Customer app activity" />
          {dashboard?.tenantActivity?.length ? (
            <div className="divide-y divide-[#edf1f4]">
              {dashboard.tenantActivity.slice(0, 8).map((activity) => (
                <div
                  key={activity.id}
                  className="flex w-full items-center gap-3 px-4 py-[11px]"
                >
                  <span className="size-[6px] shrink-0 rounded-full bg-[#3b82f6]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10.5px] font-semibold text-[#17223a]">
                      {compactAction(activity.action)}
                    </span>
                    <span className="mt-1 block truncate text-[9.5px] font-normal text-[#63718b]">
                      {activity.organizationName} · {activity.actorName} ·{" "}
                      {ccDateTime(activity.createdAt)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel message="No organisation activity recorded yet." />
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,0.92fr)]">
        <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <SectionHeader
            title="Recent subscription payments"
            action={
              <TextAction
                label="View all payments"
                onClick={() => onOpenSection("payments")}
              />
            }
          />

          {recentPayment ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[750px] table-fixed">
                <thead>
                  <tr className="border-y border-[#edf1f4] bg-[#fcfdfe] text-left text-[9.5px] font-semibold text-[#56647d]">
                    <th className="w-[26%] px-4 py-2.5">
                      Organization
                    </th>
                    <th className="w-[19%] px-3 py-2.5">Branch</th>
                    <th className="w-[16%] px-3 py-2.5">Plan</th>
                    <th className="w-[17%] px-3 py-2.5">Amount</th>
                    <th className="w-[12%] px-3 py-2.5">Status</th>
                    <th className="w-[10%] px-3 py-2.5">Created</th>
                  </tr>
                </thead>

                <tbody>
                  <tr className="text-[10.5px]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <SmallIcon
                          icon={Landmark}
                          tone="green"
                        />

                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#17223a]">
                            {recentPayment.organizationName}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <p className="truncate font-medium text-[#2b3a54]">
                        {recentPayment.branchName}
                      </p>
                    </td>

                    <td className="px-3 py-3">
                      <p className="font-medium text-[#2b3a54]">
                        {formatPlan(recentPayment.planCode)}
                      </p>
                    </td>

                    <td className="px-3 py-3 font-semibold text-[#17223a]">
                      {ccMoney(
                        recentPayment.amount,
                        recentPayment.currency,
                      )}
                    </td>

                    <td className="px-3 py-3">
                      <StatusBadge value={recentPayment.status} />
                    </td>

                    <td className="px-3 py-3 text-[9.5px] font-normal leading-4 text-[#60708a]">
                      {ccDateTime(recentPayment.createdAt)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyPanel message="No subscription payments have been recorded." />
          )}
        </section>

        <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <SectionHeader
            title="Payment summary"
            action={
              <TextAction
                label="View all"
                onClick={() => onOpenSection("payments")}
              />
            }
          />

          <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
            <SummaryTile
              label="Pending verification"
              value={ccNumber(pendingPayments)}
              tone="amber"
            />

            <SummaryTile
              label="Completed payments"
              value={ccNumber(stats.completedPayments)}
              secondary={shortMoney(stats.completedRevenue)}
              tone="green"
            />

            <SummaryTile
              label="Failed payments"
              value={ccNumber(failedPayments)}
              tone="red"
            />

            <SummaryTile
              label="Expiring soon"
              value={ccNumber(expiringSoon)}
              tone="blue"
            />
          </div>
        </section>
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
  icon: LucideIcon;
  tone: IconTone;
  label: string;
  value: string;
  secondary: string;
}) {
  return (
    <section className="flex min-h-[116px] items-center gap-4 rounded-[10px] border border-[#dfe5eb] bg-white px-4">
      <LargeIcon icon={icon} tone={tone} />

      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-[#5e6c84]">{label}</p>

        <p className="mt-1 truncate text-[22px] font-bold leading-7 tracking-[-0.02em] text-[#101d37]">
          {value}
        </p>

        <p className="mt-1 text-[10px] font-normal text-[#62718c]">
          {secondary}
        </p>
      </div>
    </section>
  );
}

type AttentionTone = "red" | "amber";

type AttentionItemData = {
  key: string;
  count: number;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: AttentionTone;
  onClick: () => void;
};

function AttentionItem({
  item,
  bordered,
}: {
  item: AttentionItemData;
  bordered: boolean;
}) {
  return (
    <button
      type="button"
      onClick={item.onClick}
      className={`group flex min-h-[86px] items-center gap-3 px-4 py-3 text-left transition hover:bg-[#fafcfd] ${
        bordered ? "border-l border-[#edf1f4]" : ""
      }`}
    >
      <SmallIcon icon={item.icon} tone={item.tone} />

      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-bold leading-5 text-[#13203a]">
          {item.count}
        </span>

        <span className="mt-0.5 block text-[10.5px] font-semibold text-[#25334c]">
          {item.title}
        </span>

        <span className="mt-0.5 block line-clamp-2 text-[9.5px] font-normal leading-[14px] text-[#65738c]">
          {item.subtitle}
        </span>
      </span>

      <ChevronRight className="size-3.5 shrink-0 text-[#5d6d86] transition group-hover:translate-x-0.5 group-hover:text-[#1b8b57]" />
    </button>
  );
}

function ClientRow({
  client,
  index,
  onOpen,
}: {
  client: ControlCenterClient;
  index: number;
  onOpen: () => void;
}) {
  const subscriptionRatio =
    client.branchCount > 0
      ? `${client.activeBranchCount} / ${client.branchCount}`
      : "0 / 0";

  const health =
    client.status === "ACTIVE"
      ? client.branchCount > 0 &&
        client.activeBranchCount < client.branchCount
        ? "AT_RISK"
        : "ACTIVE"
      : client.status;

  return (
    <tr
      onDoubleClick={onOpen}
      className="group h-[57px] cursor-default transition hover:bg-[#fbfcfd]"
    >
      <td className="px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <SmallIcon
            icon={Landmark}
            tone={
              index % 4 === 0
                ? "green"
                : index % 4 === 1
                  ? "blue"
                  : index % 4 === 2
                    ? "amber"
                    : "purple"
            }
          />

          <div className="min-w-0">
            <p className="truncate text-[10.5px] font-semibold text-[#16223a]">
              {client.name}
            </p>

            <p className="mt-[2px] truncate text-[9px] font-normal uppercase tracking-[0.01em] text-[#66748d]">
              {client.ownerName ?? client.email ?? "No owner recorded"}
            </p>
          </div>
        </div>
      </td>

      <td className="px-3 py-2.5">
        <p className="text-[10.5px] font-semibold text-[#17223a]">
          {client.branchCount}
        </p>

        <p className="mt-[2px] text-[9px] font-normal text-[#68768f]">
          {client.activeBranchCount} active
        </p>
      </td>

      <td className="px-3 py-2.5">
        <p className="text-[10.5px] font-semibold text-[#17223a]">
          {subscriptionRatio}
        </p>

        <div className="mt-1.5 h-[3px] w-[52px] overflow-hidden rounded-full bg-[#e5e9ee]">
          <div
            className={`h-full rounded-full ${
              health === "AT_RISK"
                ? "bg-[#e44b4b]"
                : "bg-[#24935f]"
            }`}
            style={{
              width:
                client.branchCount > 0
                  ? `${Math.min(
                      100,
                      (client.activeBranchCount / client.branchCount) * 100,
                    )}%`
                  : "0%",
            }}
          />
        </div>
      </td>

      <td className="px-3 py-2.5">
        <StatusBadge
          value={
            client.pricingType === "CUSTOM"
              ? "Custom"
              : "Default"
          }
        />
      </td>

      <td className="px-3 py-2.5 text-[10.5px] font-semibold text-[#17223a]">
        {client.userCount}
      </td>

      <td className="px-3 py-2.5">
        <p className="text-[9.5px] font-medium text-[#26354f]">
          {formatDate(client.createdAt)}
        </p>

        <p className="mt-[2px] text-[9px] font-normal text-[#68768f]">
          Onboarded
        </p>
      </td>

      <td className="px-3 py-2.5">
        <StatusBadge value={health} />
      </td>

      <td className="px-2 py-2.5 text-right">
        <button
          type="button"
          onClick={onOpen}
          className="grid size-7 place-items-center rounded-md text-[#6b7890] opacity-70 transition hover:bg-[#f1f4f6] hover:text-[#1d2d49] group-hover:opacity-100"
          aria-label={`Open ${client.name}`}
        >
          <MoreVertical className="size-3.5" />
        </button>
      </td>
    </tr>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[50px] items-center justify-between gap-4 px-4 py-2.5">
      <div>
        <h2 className="text-[12.5px] font-semibold text-[#17223a]">
          {title}
        </h2>

        {subtitle ? (
          <p className="mt-0.5 text-[9.5px] font-normal text-[#6c7890]">
            {subtitle}
          </p>
        ) : null}
      </div>

      {action}
    </div>
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
      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[10px] font-semibold text-[#14824e] transition hover:bg-[#f0f8f3]"
    >
      {label}
      <ArrowRight className="size-3.5" />
    </button>
  );
}

type IconTone =
  | "green"
  | "blue"
  | "amber"
  | "purple"
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
      className={`grid size-[54px] shrink-0 place-items-center rounded-[11px] ${iconTone(
        tone,
      )}`}
    >
      <Icon className="size-[23px]" strokeWidth={1.9} />
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
      <Icon className="size-[16px]" strokeWidth={1.9} />
    </span>
  );
}

function iconTone(tone: IconTone) {
  if (tone === "blue") {
    return "bg-[#edf4ff] text-[#276de9]";
  }

  if (tone === "amber") {
    return "bg-[#fff3df] text-[#e38012]";
  }

  if (tone === "purple") {
    return "bg-[#f3edff] text-[#7146de]";
  }

  if (tone === "red") {
    return "bg-[#fff0f0] text-[#df4545]";
  }

  return "bg-[#eaf6ee] text-[#198b55]";
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value
    .toUpperCase()
    .replace(/\s+/g, "_");

  let className =
    "bg-[#edf1f5] text-[#54627a]";

  if (
    ["ACTIVE", "CUSTOM", "COMPLETED", "DELIVERED"].includes(
      normalized,
    )
  ) {
    className = "bg-[#eaf6ee] text-[#1b804e]";
  } else if (
    ["DEFAULT", "PENDING", "PENDING_VERIFICATION"].includes(
      normalized,
    )
  ) {
    className = "bg-[#edf4ff] text-[#2768d8]";
  } else if (
    ["AT_RISK", "EXPIRING", "EXPIRING_SOON"].includes(
      normalized,
    )
  ) {
    className = "bg-[#fff2df] text-[#bd6b13]";
  } else if (
    [
      "FAILED",
      "REJECTED",
      "LOCKED",
      "SUSPENDED",
      "EXPIRED",
    ].includes(normalized)
  ) {
    className = "bg-[#fff0f0] text-[#c93f3f]";
  }

  return (
    <span
      className={`inline-flex min-h-[21px] items-center rounded-[5px] px-2 text-[9px] font-semibold ${className}`}
    >
      {labelFromValue(value)}
    </span>
  );
}

function SummaryTile({
  label,
  value,
  secondary,
  tone,
}: {
  label: string;
  value: string;
  secondary?: string;
  tone: "amber" | "green" | "red" | "blue";
}) {
  const className =
    tone === "green"
      ? "bg-[#edf8f1]"
      : tone === "red"
        ? "bg-[#fff0f0]"
        : tone === "blue"
          ? "bg-[#eef5ff]"
          : "bg-[#fff6e8]";

  return (
    <div className={`min-h-[105px] rounded-[8px] p-3 ${className}`}>
      <p className="min-h-[30px] text-[9.5px] font-semibold leading-[14px] text-[#31405a]">
        {label}
      </p>

      <p className="mt-2 text-[20px] font-bold leading-5 text-[#12203a]">
        {value}
      </p>

      {secondary ? (
        <p className="mt-1.5 truncate text-[8.5px] font-semibold text-[#33425b]">
          {secondary}
        </p>
      ) : null}
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="grid min-h-[120px] place-items-center px-5 py-8 text-center text-[10.5px] font-normal text-[#718099]">
      {message}
    </div>
  );
}

function shortMoney(value?: number) {
  const amount = Number(value ?? 0);

  if (amount >= 1_000_000_000) {
    return `UGX ${(amount / 1_000_000_000).toFixed(1)}B`;
  }

  if (amount >= 1_000_000) {
    return `UGX ${(amount / 1_000_000).toFixed(1)}M`;
  }

  if (amount >= 1_000) {
    return `UGX ${Math.round(amount / 1_000)}K`;
  }

  return `UGX ${amount.toLocaleString("en-GB")}`;
}

function formatPlan(value: string) {
  const normalized = value.toUpperCase();

  if (normalized.includes("6M")) return "6 Months";
  if (normalized.includes("3M")) return "3 Months";
  if (normalized.includes("MONTH")) return "Monthly";

  return value.replace(/^PRO_?/i, "").replace(/_/g, " ");
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function labelFromValue(value: string) {
  const normalized = value.replace(/_/g, " ").trim();

  return normalized
    .split(/\s+/)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase(),
    )
    .join(" ");
}