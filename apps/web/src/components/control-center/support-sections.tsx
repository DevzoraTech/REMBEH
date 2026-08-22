"use client";

import {
  Activity,
  Building2,
  CreditCard,
  FileText,
  Gauge,
  Settings,
  Tags,
} from "lucide-react";
import type {
  ControlCenterClient,
  ControlCenterDashboard,
  ControlCenterTemplate,
} from "./types";
import {
  EmptyState,
  Panel,
  SectionTitle,
  StatCard,
  StatusPill,
} from "./control-center-primitives";
import { ccDateTime, ccMoney, ccNumber, compactAction } from "./formatters";

export function SubscriptionsSection({
  clients,
  dashboard,
  onOpenClient,
}: {
  clients: ControlCenterClient[];
  dashboard: ControlCenterDashboard | null;
  onOpenClient: (tenantId: string) => void;
}) {
  return (
    <>
      <SectionTitle
        title="Subscriptions"
        subtitle="Monitor subscription coverage and branches needing attention."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Building2}
          title="Active branches"
          value={ccNumber(dashboard?.stats.activeBranches)}
          subtitle="Currently subscribed"
        />
        <StatCard
          icon={Gauge}
          title="Locked branches"
          value={ccNumber(dashboard?.stats.lockedBranches)}
          subtitle="Subscription blocked"
          tone="red"
        />
        <StatCard
          icon={CreditCard}
          title="Subscription revenue"
          value={ccMoney(dashboard?.stats.completedRevenue)}
          subtitle="Completed payments"
          tone="blue"
        />
        <StatCard
          icon={Tags}
          title="Pricing overrides"
          value={ccNumber(dashboard?.stats.activePricingOverrides)}
          subtitle="Active custom prices"
          tone="gold"
        />
      </div>
      <Panel className="mt-5 overflow-hidden">
        <div className="divide-y divide-[#edf2f7]">
          {clients.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => onOpenClient(client.id)}
              className="grid w-full grid-cols-[minmax(0,1fr)_120px_140px_120px] items-center gap-4 px-5 py-4 text-left hover:bg-[#f5faf7]"
            >
              <span>
                <span className="block font-black">{client.name}</span>
                <span className="mt-1 text-xs font-semibold text-slate-500">
                  {client.ownerName ?? client.email ?? "No owner recorded"}
                </span>
              </span>
              <span className="font-black">
                {ccNumber(client.activeBranchCount)} /{" "}
                {ccNumber(client.branchCount)}
              </span>
              <StatusPill
                value={
                  client.pricingType === "CUSTOM"
                    ? "Custom pricing"
                    : "Default pricing"
                }
                tone={client.pricingType === "CUSTOM" ? "green" : "blue"}
              />
              <StatusPill value={client.status} />
            </button>
          ))}
        </div>
      </Panel>
    </>
  );
}

export function PaymentsSection({
  dashboard,
}: {
  dashboard: ControlCenterDashboard | null;
}) {
  return (
    <>
      <SectionTitle
        title="Payments"
        subtitle="Recently created subscription payments and completed revenue."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          icon={CreditCard}
          title="Completed revenue"
          value={ccMoney(dashboard?.stats.completedRevenue)}
          subtitle={`${ccNumber(dashboard?.stats.completedPayments)} payments`}
        />
        <StatCard
          icon={Building2}
          title="Active clients"
          value={ccNumber(dashboard?.stats.activeClients)}
          subtitle="Organizations with access"
          tone="blue"
        />
        <StatCard
          icon={Gauge}
          title="Locked branches"
          value={ccNumber(dashboard?.stats.lockedBranches)}
          subtitle="Need renewal or support"
          tone="red"
        />
      </div>
      <Panel className="mt-5 overflow-hidden">
        {dashboard?.recentPayments.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left">
              <thead className="bg-[#f2f6f8] text-xs font-black text-slate-600">
                <tr>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f7] text-sm">
                {dashboard.recentPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-4 font-black">
                      {payment.organizationName}
                    </td>
                    <td className="px-4 py-4 font-semibold">
                      {payment.branchName}
                    </td>
                    <td className="px-4 py-4 font-semibold">
                      {payment.planCode}
                    </td>
                    <td className="px-4 py-4 font-black">
                      {ccMoney(payment.amount, payment.currency)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusPill value={payment.status} />
                    </td>
                    <td className="px-4 py-4 font-semibold">
                      {ccDateTime(payment.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState title="No subscription payments found" />
          </div>
        )}
      </Panel>
    </>
  );
}

export function ReportsSection({
  dashboard,
  clients,
}: {
  dashboard: ControlCenterDashboard | null;
  clients: ControlCenterClient[];
}) {
  const totalLoans = clients.reduce((sum, client) => sum + client.loanCount, 0);
  const totalCustomers = clients.reduce(
    (sum, client) => sum + client.customerCount,
    0,
  );
  return (
    <>
      <SectionTitle
        title="Reports"
        subtitle="High-level operating snapshot across client organizations."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Building2}
          title="Organizations"
          value={ccNumber(dashboard?.stats.totalClients)}
          subtitle="Registered clients"
        />
        <StatCard
          icon={Gauge}
          title="Loans"
          value={ccNumber(totalLoans)}
          subtitle="Across all clients"
          tone="blue"
        />
        <StatCard
          icon={Activity}
          title="Borrowers"
          value={ccNumber(totalCustomers)}
          subtitle="Tracked customers"
          tone="gold"
        />
        <StatCard
          icon={CreditCard}
          title="Revenue"
          value={ccMoney(dashboard?.stats.completedRevenue)}
          subtitle="Subscription payments"
          tone="purple"
        />
      </div>
      <Panel className="mt-5 overflow-hidden">
        <div className="divide-y divide-[#edf2f7]">
          {clients.map((client) => (
            <div
              key={client.id}
              className="grid grid-cols-[minmax(0,1fr)_110px_110px_110px_110px] items-center gap-4 px-5 py-4"
            >
              <div>
                <p className="font-black">{client.name}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {client.ownerName ?? "-"}
                </p>
              </div>
              <Metric label="Branches" value={client.branchCount} />
              <Metric label="Users" value={client.userCount} />
              <Metric label="Borrowers" value={client.customerCount} />
              <Metric label="Loans" value={client.loanCount} />
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

export function AuditSection({
  dashboard,
}: {
  dashboard: ControlCenterDashboard | null;
}) {
  return (
    <>
      <SectionTitle
        title="Audit Logs"
        subtitle="Recent administrative actions performed from the control center."
      />
      <Panel className="overflow-hidden">
        {dashboard?.recentActivity.length ? (
          <div className="divide-y divide-[#edf2f7]">
            {dashboard.recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_180px_180px]"
              >
                <div>
                  <p className="font-black">{compactAction(activity.action)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {activity.entityType}
                    {activity.entityId
                      ? ` - ${activity.entityId.slice(0, 8)}`
                      : ""}
                  </p>
                </div>
                <p className="text-sm font-bold">{activity.adminName}</p>
                <p className="text-sm font-semibold text-slate-500">
                  {ccDateTime(activity.createdAt)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-5">
            <EmptyState title="No audit entries yet" />
          </div>
        )}
      </Panel>
    </>
  );
}

export function SettingsSection({
  templates,
}: {
  templates: ControlCenterTemplate[];
}) {
  return (
    <>
      <SectionTitle
        title="Settings"
        subtitle="Control center guardrails and seeded communication templates."
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel className="p-5">
          <Settings className="size-6 text-[var(--forest-emerald)]" />
          <h2 className="mt-4 font-black">Admin access</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Access is enforced by the API allow-list. Only approved ANTIKRA
            control center emails can create a password or sign in.
          </p>
          <div className="mt-4 grid gap-2 text-sm font-black">
            <StatusPill value="antikra.ug@gmail.com" tone="green" />
            <StatusPill value="bonnefilleul@gmail.com" tone="green" />
          </div>
        </Panel>
        <Panel className="overflow-hidden">
          <div className="border-b border-[#e2e8f0] px-5 py-4">
            <h2 className="font-black">Message templates</h2>
          </div>
          <div className="divide-y divide-[#edf2f7]">
            {templates.map((template) => (
              <div key={template.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black">{template.name}</p>
                  <StatusPill value={template.channel} tone="blue" />
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {template.subject ?? template.code}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-sm font-black">{ccNumber(value)}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{label}</p>
    </div>
  );
}
