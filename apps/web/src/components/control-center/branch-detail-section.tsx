"use client";

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Building2,
  FileText,
  Landmark,
  LockKeyhole,
  MapPin,
  Phone,
  RefreshCw,
  ShieldAlert,
  Tag,
  UnlockKeyhole,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import type {
  ControlCenterBranch,
  ControlCenterBranchUsage,
  ControlCenterFeatureAccess,
} from "./types";

import { ccDate, ccDateTime, ccMoney, ccNumber } from "./formatters";

const emptyFeatureAccess: ControlCenterFeatureAccess = {
  enabled: false,
  source: null,
  hasOwnSetting: false,
  ownEnabled: null,
  reason: null,
  organizationEnabled: null,
  updatedAt: null,
  updatedBy: null,
};

export function ControlCenterBranchDetailSection({
  branch,
  tenantId,
  organizationName,
  currency,
  usage,
  usageLoading,
  onRefreshUsage,
  onBack,
  onOpenClient,
  onManagePricing,
  onOpenSubscription,
  onOpenPayments,
  onSetDataCorrectionAccess,
}: {
  branch: ControlCenterBranch;
  tenantId: string;
  organizationName: string;
  currency: string;
  usage: ControlCenterBranchUsage | null;
  usageLoading?: boolean;
  onRefreshUsage?: () => void;
  onBack: () => void;
  onOpenClient: () => void;
  onManagePricing: () => void;
  onOpenSubscription?: () => void;
  onOpenPayments?: () => void;
  onSetDataCorrectionAccess?: (input: {
    tenantId: string;
    branchId?: string;
    enabled: boolean;
    reason: string;
  }) => Promise<void>;
}) {
  const lifecycle = getSubscriptionLifecycle(branch);
  const [reason, setReason] = useState("Approved legacy data cleanup window.");
  const [savingCorrectionAccess, setSavingCorrectionAccess] = useState(false);
  const correctionAccess = branch.dataCorrectionAccess ?? emptyFeatureAccess;

  async function updateCorrectionAccess(enabled: boolean) {
    if (!onSetDataCorrectionAccess || savingCorrectionAccess) {
      return;
    }

    const cleanReason = reason.trim();
    if (cleanReason.length < 6) {
      return;
    }

    setSavingCorrectionAccess(true);

    try {
      await onSetDataCorrectionAccess({
        tenantId,
        branchId: branch.id,
        enabled,
        reason: cleanReason,
      });
    } finally {
      setSavingCorrectionAccess(false);
    }
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
          Back to branches
        </button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-[#eaf6ee] text-[#198b55]">
            <Landmark className="size-5" strokeWidth={1.9} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[24px] font-bold tracking-[-0.025em] text-[#111d36]">
                {branch.name}
              </h1>

              <StatusBadge value={branch.status} />
              {usage ? (
                <UsageBadge level={usage.week.usageLevel} />
              ) : null}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-normal text-[#6a7890]">
              <span>{organizationName}</span>
              <span className="text-[#c8cfd7]">•</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {branch.address || "No address"}
              </span>
              {branch.phone ? (
                <>
                  <span className="text-[#c8cfd7]">•</span>
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3" />
                    {branch.phone}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {onRefreshUsage ? (
            <button
              type="button"
              onClick={onRefreshUsage}
              disabled={usageLoading}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3 text-[10px] font-semibold text-[#53627a] transition hover:bg-[#f7faf8] disabled:opacity-60"
            >
              <RefreshCw
                className={`size-3.5 ${usageLoading ? "animate-spin" : ""}`}
              />
              Refresh usage
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenClient}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3 text-[10px] font-semibold text-[#53627a] transition hover:bg-[#f7faf8]"
          >
            <Building2 className="size-3.5" />
            Organization
          </button>
          <button
            type="button"
            onClick={onManagePricing}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#188653] px-3.5 text-[10px] font-semibold text-white transition hover:bg-[#147849]"
          >
            <Tag className="size-3.5" />
            Manage pricing
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={WalletCards}
          label="Collected today"
          value={ccMoney(usage?.today.collected ?? 0, currency)}
          detail={`${ccNumber(usage?.today.repaymentCount ?? 0)} repayments`}
        />
        <MetricCard
          icon={FileText}
          label="Loans today"
          value={ccNumber(usage?.today.loansIssued ?? 0)}
          detail={ccMoney(usage?.today.principalIssued ?? 0, currency)}
        />
        <MetricCard
          icon={Activity}
          label="7-day collections"
          value={ccMoney(usage?.week.totals.collected ?? 0, currency)}
          detail={`${ccNumber(usage?.week.totals.activeDays ?? 0)} active days`}
        />
        <MetricCard
          icon={Users}
          label="Borrowers / staff"
          value={`${ccNumber(branch.borrowers)} / ${ccNumber(branch.users)}`}
          detail={`${ccNumber(branch.loans)} loans`}
        />
      </div>

      {usage ? (
        <p className="mt-3 text-[10px] font-medium text-[#627289]">
          {usage.week.usageReason}
          {usage.lastUsedAt
            ? ` · Last sign-in ${ccDateTime(usage.lastUsedAt)}${
                usage.lastUsedBy ? ` by ${usage.lastUsedBy}` : ""
              }`
            : " · No recent staff sign-in"}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <InfoPanel title="Subscription">
          <InfoRow label="Status" value={<StatusBadge value={branch.status} />} />
          <InfoRow label="Plan" value={branch.planCode ?? "—"} />
          <InfoRow
            label="Period ends"
            value={
              branch.currentPeriodEnd
                ? ccDate(branch.currentPeriodEnd)
                : "—"
            }
          />
          <InfoRow label="Lifecycle" value={lifecycle} />
          {onOpenSubscription ? (
            <button
              type="button"
              onClick={onOpenSubscription}
              className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-[#168650]"
            >
              View subscriptions
              <ArrowRight className="size-3" />
            </button>
          ) : null}
        </InfoPanel>

        <InfoPanel
          title="Commercials"
          action={
            onOpenPayments ? (
              <button
                type="button"
                onClick={onOpenPayments}
                className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-[#168650]"
              >
                View payments
                <ArrowRight className="size-3" />
              </button>
            ) : undefined
          }
        >
          <InfoRow
            label="Subscription payments"
            value={ccNumber(branch.subscriptionPayments)}
          />
          <InfoRow
            label="Subscription revenue"
            value={ccMoney(branch.subscriptionRevenue, currency)}
          />
          <InfoRow
            label="Repayment transactions"
            value={ccNumber(branch.repaymentCount)}
          />
          <InfoRow
            label="Lifetime repayments"
            value={ccMoney(branch.repaymentsCollected, currency)}
          />
        </InfoPanel>
      </div>

      <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-[#edf1f4] px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold text-[#17233c]">
              Weekly branch analysis
            </p>
            <p className="mt-0.5 text-[9.5px] text-[#69768e]">
              Collections, loans and daily close discipline for the last 7 days
            </p>
          </div>
        </div>
        {usageLoading && !usage ? (
          <p className="px-4 py-8 text-center text-[11px] text-slate-500">
            Loading branch usage…
          </p>
        ) : usage ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[10px]">
              <thead className="border-b border-[#edf1f4] bg-[#f7f9fb] text-[9.5px] font-semibold text-[#627289]">
                <tr>
                  <th className="px-4 py-2.5">Day</th>
                  <th className="px-3 py-2.5 text-right">Collected</th>
                  <th className="px-3 py-2.5 text-right">Repayments</th>
                  <th className="px-3 py-2.5 text-right">Loans</th>
                  <th className="px-3 py-2.5">Operations</th>
                  <th className="px-4 py-2.5">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f4]">
                {usage.week.days.map((day) => (
                  <tr key={day.date}>
                    <td className="px-4 py-2.5 font-semibold text-[#17233c]">
                      {ccDate(day.date)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#17233c]">
                      {ccMoney(day.collected, currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#53627a]">
                      {ccNumber(day.repaymentCount)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#53627a]">
                      {ccNumber(day.loansIssued)}
                    </td>
                    <td className="px-3 py-2.5 text-[#53627a]">
                      {day.operationClosed
                        ? "Closed"
                        : day.operationOpened
                          ? "Open"
                          : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[#53627a]">
                      {day.reportSubmitted
                        ? "Submitted"
                        : day.reportStatus ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-[11px] text-slate-500">
            Could not load weekly analysis yet.
          </p>
        )}
      </section>

      <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
        <div className="flex items-center gap-3 border-b border-[#edf1f4] px-4 py-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#edf4ff] text-[#3475de]">
            <Activity className="size-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[#17233c]">
              Recent branch activity
            </p>
            <p className="mt-0.5 text-[9.5px] text-[#69768e]">
              Live repayments, loans and daily reports — same pulse as the
              branch dashboard
            </p>
          </div>
        </div>
        {usage?.recentActivity?.length ? (
          <div className="divide-y divide-[#edf1f4]">
            {usage.recentActivity.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-[#17233c]">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-[9.5px] text-[#69768e]">
                    {item.detail}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {item.amount != null ? (
                    <p className="text-[11px] font-semibold tabular-nums text-[#17233c]">
                      {ccMoney(item.amount, currency)}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-[9px] text-[#8a96a8]">
                    {ccDateTime(item.at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-[11px] text-slate-500">
            {usageLoading
              ? "Loading recent activity…"
              : "No recent operational activity on this branch."}
          </p>
        )}
      </section>

      {onSetDataCorrectionAccess ? (
        <section className="mt-4 overflow-hidden rounded-[10px] border border-[#f0d48d] bg-[#fffaf0]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#f3dfaa] px-4 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-white text-[#c47a14] shadow-sm">
                <ShieldAlert className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-[#17233c]">
                  Strict data controls
                </p>
                <p className="mt-1 max-w-[720px] text-[9.5px] leading-4 text-[#6b5a31]">
                  Temporary edit/delete tools for legacy cleanup on this branch.
                </p>
              </div>
            </div>
            <FeatureAccessBadge
              enabled={correctionAccess.enabled}
              label={correctionAccess.enabled ? "Enabled" : "Disabled"}
            />
          </div>
          <div className="p-4">
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-[#dfe5eb] px-3 py-2 text-[10px] font-medium text-[#17233c] outline-none focus:border-[#188653]"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={savingCorrectionAccess || correctionAccess.enabled}
                onClick={() => void updateCorrectionAccess(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#188653] px-3 text-[9.5px] font-semibold text-white disabled:opacity-60"
              >
                <UnlockKeyhole className="size-3.5" />
                Enable
              </button>
              <button
                type="button"
                disabled={savingCorrectionAccess || !correctionAccess.enabled}
                onClick={() => void updateCorrectionAccess(false)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#dfe5eb] bg-white px-3 text-[9.5px] font-semibold text-[#53627a] disabled:opacity-60"
              >
                <LockKeyhole className="size-3.5" />
                Disable
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-[10px] border border-[#dfe5eb] bg-white px-3.5 py-3">
      <div className="flex items-center gap-2 text-[#188653]">
        <Icon className="size-3.5" />
        <p className="text-[9.5px] font-semibold text-[#627289]">{label}</p>
      </div>
      <p className="mt-2 text-[16px] font-bold tabular-nums text-[#111d36]">
        {value}
      </p>
      <p className="mt-1 text-[9.5px] text-[#718099]">{detail}</p>
    </article>
  );
}

function InfoPanel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[10px] border border-[#dfe5eb] bg-white">
      <div className="flex min-h-[46px] items-center justify-between gap-4 border-b border-[#edf1f4] px-4 py-3">
        <p className="text-[11px] font-semibold text-[#17233c]">{title}</p>
        {action}
      </div>
      <div className="space-y-3 px-4 py-4">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[9.5px] font-normal text-[#718099]">{label}</span>
      <span className="max-w-[60%] text-right text-[10.5px] font-semibold text-[#17233c]">
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const tone = value.toUpperCase();
  const className =
    tone === "ACTIVE" || tone === "TRIAL"
      ? "bg-[#e8f5ee] text-[#188653]"
      : tone === "GRACE"
        ? "bg-[#fff6e8] text-[#c47a14]"
        : "bg-[#fdecec] text-[#c03535]";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] ${className}`}
    >
      {value}
    </span>
  );
}

function UsageBadge({
  level,
}: {
  level: ControlCenterBranchUsage["week"]["usageLevel"];
}) {
  const className =
    level === "healthy"
      ? "bg-[#e8f5ee] text-[#188653]"
      : level === "light"
        ? "bg-[#edf4ff] text-[#3475de]"
        : level === "idle"
          ? "bg-[#fff6e8] text-[#c47a14]"
          : "bg-[#fdecec] text-[#c03535]";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] ${className}`}
    >
      {level}
    </span>
  );
}

function FeatureAccessBadge({
  enabled,
  label,
}: {
  enabled: boolean;
  label: string;
}) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[9.5px] font-semibold ${
        enabled
          ? "bg-[#e8f5ee] text-[#188653]"
          : "bg-[#f1f3f6] text-[#627289]"
      }`}
    >
      {label}
    </span>
  );
}

function getSubscriptionLifecycle(branch: ControlCenterBranch) {
  if (branch.status.toUpperCase() === "TRIAL") {
    return branch.currentPeriodEnd
      ? `Trial until ${ccDate(branch.currentPeriodEnd)}`
      : "On trial";
  }
  if (branch.status.toUpperCase() === "ACTIVE") {
    return branch.currentPeriodEnd
      ? `Active until ${ccDate(branch.currentPeriodEnd)}`
      : "Active";
  }
  return branch.status;
}
