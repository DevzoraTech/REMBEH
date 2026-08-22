"use client";

import {
  Activity,
  Building2,
  CreditCard,
  Landmark,
  Lock,
  Tags,
  Users,
} from "lucide-react";
import type { ControlCenterClient, ControlCenterDashboard } from "./types";
import {
  EmptyState,
  Panel,
  SectionTitle,
  StatCard,
  StatusPill,
} from "./control-center-primitives";
import { ccDateTime, ccMoney, ccNumber, compactAction } from "./formatters";

export function ControlCenterDashboardSection({
  dashboard,
  clients,
  onOpenClient,
  onOpenUsers,
  onOpenPricing,
}: {
  dashboard: ControlCenterDashboard | null;
  clients: ControlCenterClient[];
  onOpenClient: (tenantId: string) => void;
  onOpenUsers: () => void;
  onOpenPricing: () => void;
}) {
  const stats = dashboard?.stats ?? {};
  const topClients = [...clients]
    .sort((a, b) => b.activeBranchCount - a.activeBranchCount)
    .slice(0, 5);

  return (
    <>
      <SectionTitle
        title="Dashboard"
        subtitle="Control live client organizations, pricing, users, subscriptions, and messaging from one place."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Building2}
          title="Total clients"
          value={ccNumber(stats.totalClients)}
          subtitle={`${ccNumber(stats.activeClients)} active organizations`}
        />
        <StatCard
          icon={Landmark}
          title="Branches"
          value={ccNumber(stats.totalBranches)}
          subtitle={`${ccNumber(stats.activeBranches)} active subscriptions`}
          tone="blue"
        />
        <StatCard
          icon={Tags}
          title="Custom pricing"
          value={ccNumber(stats.activePricingOverrides)}
          subtitle="Active org and branch overrides"
          tone="gold"
        />
        <StatCard
          icon={CreditCard}
          title="Collected revenue"
          value={ccMoney(stats.completedRevenue)}
          subtitle={`${ccNumber(stats.completedPayments)} completed payments`}
          tone="purple"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.9fr)]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#e2e8f0] px-5 py-4">
            <div>
              <h2 className="font-black text-[var(--midnight-navy)]">
                Client organizations
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Highest branch coverage first.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenPricing}
              className="btn btn-ghost h-9 normal-case"
            >
              Manage pricing
            </button>
          </div>
          {topClients.length ? (
            <div className="divide-y divide-[#edf2f7]">
              {topClients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => onOpenClient(client.id)}
                  className="grid w-full grid-cols-[minmax(0,1.4fr)_110px_110px_90px] items-center gap-4 px-5 py-4 text-left hover:bg-[#f5faf7]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-[var(--midnight-navy)]">
                      {client.name}
                    </span>
                    <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
                      {client.ownerName ?? client.email ?? "No owner recorded"}
                    </span>
                  </span>
                  <span className="text-sm font-black">
                    {ccNumber(client.branchCount)}
                    <span className="ml-1 text-xs font-semibold text-slate-500">
                      branches
                    </span>
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
          ) : (
            <div className="p-5">
              <EmptyState title="No client organizations yet" />
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-black">System attention</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Live counts from subscriptions and users.
                </p>
              </div>
              <Activity className="size-5 text-[var(--forest-emerald)]" />
            </div>
            <div className="mt-4 grid gap-3">
              <button
                type="button"
                onClick={onOpenUsers}
                className="flex items-center justify-between rounded-lg border border-[#e2e8f0] bg-white px-3 py-3 text-left hover:bg-slate-50"
              >
                <span className="flex items-center gap-3">
                  <Users className="size-4 text-blue-700" />
                  <span className="text-sm font-bold">App users</span>
                </span>
                <span className="text-sm font-black">
                  {ccNumber(stats.totalUsers)}
                </span>
              </button>
              <div className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-3 py-3">
                <span className="flex items-center gap-3">
                  <Lock className="size-4 text-red-700" />
                  <span className="text-sm font-bold text-red-800">
                    Locked branches
                  </span>
                </span>
                <span className="text-sm font-black text-red-800">
                  {ccNumber(stats.lockedBranches)}
                </span>
              </div>
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="border-b border-[#e2e8f0] px-5 py-4">
              <h2 className="font-black">Recent control activity</h2>
            </div>
            {dashboard?.recentActivity.length ? (
              <div className="divide-y divide-[#edf2f7]">
                {dashboard.recentActivity.map((activity) => (
                  <div key={activity.id} className="px-5 py-3">
                    <p className="text-sm font-black">
                      {compactAction(activity.action)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {activity.adminName} - {ccDateTime(activity.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5">
                <EmptyState title="No control-center changes yet" />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
