"use client";

import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  MapPin,
  Phone,
  Tags,
  Users,
} from "lucide-react";
import type { ControlCenterBranch, ControlCenterClientDetail } from "./types";
import {
  EmptyState,
  IconBadge,
  Panel,
  SectionTitle,
  StatusPill,
} from "./control-center-primitives";
import {
  ccDate,
  ccDateTime,
  ccMoney,
  ccNumber,
  compactAction,
} from "./formatters";

export function ControlCenterClientDetailSection({
  detail,
  loading,
  onBack,
  onManagePricing,
  onPricingHistory,
}: {
  detail: ControlCenterClientDetail | null;
  loading: boolean;
  onBack: () => void;
  onManagePricing: () => void;
  onPricingHistory: () => void;
}) {
  if (loading || !detail) {
    return (
      <>
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-2 text-sm font-black text-[var(--midnight-navy)]"
        >
          <ArrowLeft className="size-4" />
          Back to clients
        </button>
        <Panel className="p-8">
          <div className="h-5 w-48 animate-pulse rounded bg-slate-100" />
          <div className="mt-6 grid gap-4 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-40 animate-pulse rounded-xl bg-slate-100"
              />
            ))}
          </div>
        </Panel>
      </>
    );
  }

  const branchCounts = summarizeBranches(detail.branches);
  const client = detail.client;

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-2 text-sm font-black text-[var(--midnight-navy)]"
      >
        <ArrowLeft className="size-4" />
        Back to clients
      </button>

      <SectionTitle
        title={client.name}
        subtitle={`Client since ${ccDate(client.createdAt)} - Client ID: ${client.id.slice(0, 8)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onPricingHistory}
              className="btn btn-ghost h-10 normal-case"
            >
              Pricing history
            </button>
            <button
              type="button"
              onClick={onManagePricing}
              className="btn btn-primary h-10 normal-case"
            >
              Manage pricing
            </button>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1.2fr_1fr]">
        <Panel className="p-5">
          <IconBadge icon={Building2} />
          <h2 className="mt-4 text-sm font-black">Organization information</h2>
          <DetailLine label="Owner / Contact" value={client.owner?.name} />
          <DetailLine label="Email" value={client.owner?.email} />
          <DetailLine label="Phone" value={client.owner?.phone} />
          <DetailLine label="Country" value={client.country} />
          <DetailLine label="Currency" value={client.currency} />
        </Panel>

        <Panel className="p-5">
          <h2 className="text-sm font-black">Organization summary</h2>
          <MetricLine
            icon={Building2}
            label="Total branches"
            value={client.summary.totalBranches}
          />
          <MetricLine
            icon={Tags}
            label="Active branches"
            value={client.summary.activeBranches}
          />
          <MetricLine
            icon={MapPin}
            label="Suspended branches"
            value={client.summary.suspendedBranches}
          />
          <MetricLine
            icon={Users}
            label="Total users"
            value={client.summary.totalUsers}
          />
          <div className="mt-4">
            <StatusPill value={client.status} />
          </div>
        </Panel>

        <Panel className="bg-[#f7fcf9] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">Pricing status</h2>
              <p className="mt-4 text-base font-black text-[var(--forest-emerald)]">
                Client-level and branch pricing
              </p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                Branch-specific prices override organization prices. Current
                active subscriptions keep their existing period amount until
                renewal.
              </p>
            </div>
            <StatusPill value="Custom controls" />
          </div>
          <button
            type="button"
            onClick={onManagePricing}
            className="btn btn-ghost mt-5 h-10 w-full normal-case text-[var(--forest-emerald)]"
          >
            Manage pricing
            <ChevronRight className="size-4" />
          </button>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-sm font-black">Subscription overview</h2>
          <div className="mt-5 flex items-center gap-5">
            <div
              className="size-24 rounded-full"
              style={{
                background: `conic-gradient(#0f8a6c 0 ${branchCounts.activeDeg}deg, #ef4444 ${branchCounts.activeDeg}deg ${branchCounts.expiredDeg}deg, #f59e0b ${branchCounts.expiredDeg}deg ${branchCounts.warningDeg}deg, #d1d5db ${branchCounts.warningDeg}deg 360deg)`,
              }}
            />
            <div className="grid gap-2 text-xs font-bold">
              <Legend
                color="bg-emerald-600"
                label="Active"
                value={branchCounts.active}
              />
              <Legend
                color="bg-red-500"
                label="Locked / past due"
                value={branchCounts.locked}
              />
              <Legend
                color="bg-amber-500"
                label="Trial / grace"
                value={branchCounts.warning}
              />
              <Legend
                color="bg-slate-300"
                label="Other"
                value={branchCounts.other}
              />
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_320px]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#e2e8f0] px-5 py-4">
            <h2 className="font-black">Branches ({detail.branches.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left">
              <thead className="bg-[#f2f6f8] text-xs font-black text-slate-600">
                <tr>
                  <th className="px-4 py-3">Branch name</th>
                  <th className="px-4 py-3">Subscription</th>
                  <th className="px-4 py-3">Performance</th>
                  <th className="px-4 py-3">Users</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f7] text-sm">
                {detail.branches.map((branch) => (
                  <BranchRow
                    key={branch.id}
                    branch={branch}
                    onManagePricing={onManagePricing}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="border-b border-[#e2e8f0] px-5 py-4">
            <h2 className="font-black">Recent activity</h2>
          </div>
          {detail.recentActivity.length ? (
            <div className="divide-y divide-[#edf2f7]">
              {detail.recentActivity.map((activity) => (
                <div key={activity.id} className="px-5 py-4">
                  <p className="text-sm font-black">
                    {compactAction(activity.action)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {activity.actorName} - {ccDateTime(activity.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState title="No recent branch activity" />
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function DetailLine({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-black text-[var(--midnight-navy)]">
        {value || "-"}
      </p>
    </div>
  );
}

function MetricLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <span className="flex items-center gap-3 text-xs font-bold text-slate-600">
        <Icon className="size-4" />
        {label}
      </span>
      <span className="text-sm font-black">{ccNumber(value)}</span>
    </div>
  );
}

function BranchRow({
  branch,
  onManagePricing,
}: {
  branch: ControlCenterBranch;
  onManagePricing: () => void;
}) {
  return (
    <tr>
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-blue-50 text-blue-700">
            <Building2 className="size-5" />
          </span>
          <span>
            <span className="block font-black">{branch.name}</span>
            <span className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-500">
              <MapPin className="size-3" />
              {branch.address || "-"}
            </span>
            {branch.phone ? (
              <span className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Phone className="size-3" />
                {branch.phone}
              </span>
            ) : null}
          </span>
        </div>
      </td>
      <td className="px-4 py-4">
        <StatusPill value={branch.status} />
        <p className="mt-2 text-xs font-semibold text-slate-500">
          {branch.currentPeriodEnd
            ? `Renews ${ccDate(branch.currentPeriodEnd)}`
            : "No renewal date"}
        </p>
      </td>
      <td className="px-4 py-4">
        <p className="font-black text-[var(--forest-emerald)]">
          {ccMoney(branch.repaymentsCollected)}
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {ccNumber(branch.repaymentCount)} repayments -{" "}
          {ccNumber(branch.loans)} loans
        </p>
      </td>
      <td className="px-4 py-4 font-black">{ccNumber(branch.users)}</td>
      <td className="px-4 py-4">
        <StatusPill value={branch.status} />
      </td>
      <td className="px-4 py-4 text-right">
        <button
          type="button"
          onClick={onManagePricing}
          className="btn btn-ghost h-8 normal-case"
        >
          Price branch
        </button>
      </td>
    </tr>
  );
}

function Legend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className={`size-2 rounded-full ${color}`} />
      {label}
      <span className="ml-auto font-black">{value}</span>
    </span>
  );
}

function summarizeBranches(branches: ControlCenterBranch[]) {
  const total = Math.max(1, branches.length);
  const active = branches.filter((branch) => branch.status === "ACTIVE").length;
  const locked = branches.filter((branch) =>
    ["LOCKED", "PAST_DUE"].includes(branch.status),
  ).length;
  const warning = branches.filter((branch) =>
    ["TRIAL", "GRACE"].includes(branch.status),
  ).length;
  const other = Math.max(0, branches.length - active - locked - warning);
  const activeDeg = (active / total) * 360;
  const expiredDeg = activeDeg + (locked / total) * 360;
  const warningDeg = expiredDeg + (warning / total) * 360;

  return { active, locked, warning, other, activeDeg, expiredDeg, warningDeg };
}
