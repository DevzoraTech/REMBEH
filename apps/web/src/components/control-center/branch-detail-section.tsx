"use client";

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Building2,
  CreditCard,
  FileText,
  Landmark,
  LockKeyhole,
  MapPin,
  Phone,
  ShieldAlert,
  Tag,
  UnlockKeyhole,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import type { ControlCenterBranch, ControlCenterFeatureAccess } from "./types";

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
            </div>

            <button
              type="button"
              onClick={onOpenClient}
              className="mt-1 text-[10px] font-medium text-[#168650] hover:underline"
            >
              {organizationName}
            </button>

            {branch.address ? (
              <p className="mt-1 flex items-center gap-1.5 text-[9.5px] text-[#6d7890]">
                <MapPin className="size-3" />
                {branch.address}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onManagePricing}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#dbe3e8] bg-white px-3.5 text-[10px] font-semibold text-[#42516a] transition hover:bg-[#f6f8fa]"
          >
            <Tag className="size-3.5" />
            Manage pricing
          </button>

          {onOpenSubscription ? (
            <button
              type="button"
              onClick={onOpenSubscription}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#188653] px-3.5 text-[10px] font-semibold text-white transition hover:bg-[#147849]"
            >
              <CreditCard className="size-3.5" />
              Review subscription
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Users"
          value={ccNumber(branch.users)}
          secondary="Assigned to this branch"
          tone="blue"
        />

        <MetricCard
          icon={Building2}
          label="Borrowers"
          value={ccNumber(branch.borrowers)}
          secondary="Registered borrowers"
          tone="green"
        />

        <MetricCard
          icon={FileText}
          label="Loans"
          value={ccNumber(branch.loans)}
          secondary="Recorded loans"
          tone="amber"
        />

        <MetricCard
          icon={WalletCards}
          label="Repayments collected"
          value={ccMoney(branch.repaymentsCollected, currency)}
          secondary={`${ccNumber(branch.repaymentCount)} repayments`}
          tone="slate"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <InfoPanel title="Branch information">
          <InfoRow label="Branch" value={branch.name} />

          <InfoRow
            label="Organization"
            value={
              <button
                type="button"
                onClick={onOpenClient}
                className="font-semibold text-[#168650]"
              >
                {organizationName}
              </button>
            }
          />

          <InfoRow label="Address" value={branch.address || "Not available"} />

          <InfoRow label="Phone" value={branch.phone ?? "Not available"} />

          <InfoRow
            label="Status"
            value={<StatusBadge value={branch.status} />}
          />

          <InfoRow
            label="Last used"
            value={
              branch.lastUsedAt
                ? ccDateTime(branch.lastUsedAt)
                : "Not available"
            }
          />
        </InfoPanel>

        <InfoPanel
          title="Subscription"
          action={
            onOpenSubscription ? (
              <button
                type="button"
                onClick={onOpenSubscription}
                className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-[#168650]"
              >
                Review
                <ArrowRight className="size-3" />
              </button>
            ) : undefined
          }
        >
          <InfoRow
            label="Lifecycle"
            value={<SubscriptionBadge value={lifecycle.status} />}
          />

          <InfoRow label="Plan" value={formatPlan(branch.planCode)} />

          <InfoRow
            label="Period end"
            value={
              branch.currentPeriodEnd
                ? ccDate(branch.currentPeriodEnd)
                : "No active period"
            }
          />

          <InfoRow label="Time remaining" value={lifecycle.label} />

          <InfoRow
            label="Subscription payments"
            value={ccNumber(branch.subscriptionPayments)}
          />

          <InfoRow
            label="Subscription revenue"
            value={ccMoney(branch.subscriptionRevenue, currency)}
          />
        </InfoPanel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <InfoPanel
          title="Commercial setup"
          action={
            <button
              type="button"
              onClick={onManagePricing}
              className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-[#168650]"
            >
              Manage pricing
              <ArrowRight className="size-3" />
            </button>
          }
        >
          <InfoRow label="Current plan" value={formatPlan(branch.planCode)} />

          <InfoRow label="Currency" value={currency} />

          <InfoRow label="Pricing source" value="Open pricing workspace" />

          <InfoRow label="Effective price" value="Not available" />
        </InfoPanel>

        <InfoPanel title="Strict data controls">
          <div className="flex items-start gap-3 rounded-[8px] border border-[#efd49a] bg-[#fffaf0] p-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-white text-[#c47a14]">
              <ShieldAlert className="size-4" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10.5px] font-semibold text-[#17233c]">
                  Legacy correction access
                </p>

                <FeatureAccessBadge
                  enabled={correctionAccess.enabled}
                  label={
                    correctionAccess.enabled
                      ? correctionAccess.source === "ORGANIZATION"
                        ? "Inherited from organization"
                        : "Enabled for branch"
                      : "Disabled"
                  }
                />
              </div>

              <p className="mt-1 text-[9.5px] leading-4 text-[#6b5a31]">
                Allows the mobile app to correct or delete seeded records for
                this branch. Every change is audited.
              </p>
            </div>
          </div>

          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            className="w-full resize-none rounded-md border border-[#dfe5eb] px-3 py-2 text-[10px] font-medium text-[#17233c] outline-none focus:border-[#188653]"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                !onSetDataCorrectionAccess ||
                savingCorrectionAccess ||
                correctionAccess.enabled
              }
              onClick={() => void updateCorrectionAccess(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#188653] px-3 text-[9.5px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#aab6c2]"
            >
              <UnlockKeyhole className="size-3.5" />
              Enable branch
            </button>

            <button
              type="button"
              disabled={
                !onSetDataCorrectionAccess ||
                savingCorrectionAccess ||
                (!correctionAccess.enabled &&
                  correctionAccess.source !== "BRANCH")
              }
              onClick={() => void updateCorrectionAccess(false)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#d9b96d] bg-white px-3 text-[9.5px] font-semibold text-[#8b5a12] disabled:cursor-not-allowed disabled:text-[#9aa4b3]"
            >
              <LockKeyhole className="size-3.5" />
              Disable branch
            </button>
          </div>
        </InfoPanel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <InfoPanel
          title="Payment activity"
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
            label="Repayments collected"
            value={ccMoney(branch.repaymentsCollected, currency)}
          />
        </InfoPanel>
      </div>

      <section className="mt-4 rounded-[10px] border border-[#dfe5eb] bg-white">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#edf4ff] text-[#3475de]">
            <Activity className="size-3.5" />
          </div>

          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold text-[#17233c]">
              Branch-specific activity
            </p>

            <p className="mt-1 text-[9.5px] leading-4 text-[#69768e]">
              Administrative history, subscription changes, payments and access
              events will live here once branch-level audit records are exposed
              by the API.
            </p>
          </div>
        </div>
      </section>
    </div>
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
      <div className="flex min-h-[46px] items-center justify-between gap-4 border-b border-[#edf1f4] px-4 py-3">
        <p className="text-[11px] font-semibold text-[#17233c]">{title}</p>

        {action}
      </div>

      <div className="space-y-3 px-4 py-4">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[9.5px] font-normal text-[#718099]">{label}</span>

      <span className="max-w-[65%] text-right text-[10.5px] font-semibold text-[#26344d]">
        {value}
      </span>
    </div>
  );
}

function MetricCard({
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
      <SmallIcon icon={icon} tone={tone} />

      <div className="min-w-0">
        <p className="text-[9.5px] font-semibold text-[#62718a]">{label}</p>

        <p className="mt-1 truncate text-[20px] font-bold tracking-[-0.02em] text-[#14213a]">
          {value}
        </p>

        <p className="mt-1 text-[9px] font-normal text-[#718099]">
          {secondary}
        </p>
      </div>
    </section>
  );
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase().replace(/\s+/g, "_");

  let styles = "bg-[#eef2f6] text-[#59677d]";

  if (normalized === "ACTIVE") {
    styles = "bg-[#eaf6ee] text-[#1b804e]";
  } else if (normalized === "PENDING_VERIFICATION") {
    styles = "bg-[#fff3df] text-[#ba6a12]";
  } else if (["LOCKED", "SUSPENDED", "BLOCKED"].includes(normalized)) {
    styles = "bg-[#fff0f0] text-[#c94040]";
  }

  return (
    <span
      className={`inline-flex min-h-[21px] items-center rounded-[5px] px-2 text-[9px] font-semibold ${styles}`}
    >
      {labelFromValue(value)}
    </span>
  );
}

function SubscriptionBadge({
  value,
}: {
  value: "ACTIVE" | "EXPIRING" | "EXPIRED" | "LOCKED" | "NO_SUBSCRIPTION";
}) {
  const styles =
    value === "ACTIVE"
      ? "bg-[#eaf6ee] text-[#1b804e]"
      : value === "EXPIRING"
        ? "bg-[#fff3df] text-[#ba6a12]"
        : value === "NO_SUBSCRIPTION"
          ? "bg-[#eef2f6] text-[#59677d]"
          : "bg-[#fff0f0] text-[#c94040]";

  return (
    <span
      className={`inline-flex min-h-[21px] items-center rounded-[5px] px-2 text-[9px] font-semibold ${styles}`}
    >
      {value === "ACTIVE"
        ? "Active"
        : value === "EXPIRING"
          ? "Expiring soon"
          : value === "EXPIRED"
            ? "Expired"
            : value === "LOCKED"
              ? "Locked"
              : "No subscription"}
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
      className={`inline-flex min-h-[21px] items-center rounded-[5px] px-2 text-[9px] font-semibold ${
        enabled ? "bg-[#e8f7ee] text-[#168650]" : "bg-[#eef2f6] text-[#59677d]"
      }`}
    >
      {label}
    </span>
  );
}

type IconTone = "green" | "blue" | "amber" | "slate";

function SmallIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: IconTone }) {
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
      <Icon className="size-[16px]" strokeWidth={1.9} />
    </span>
  );
}

function getSubscriptionLifecycle(branch: ControlCenterBranch) {
  const status = branch.status.toUpperCase();

  if (["LOCKED", "SUSPENDED", "BLOCKED"].includes(status)) {
    return {
      status: "LOCKED" as const,
      label: "Access locked",
    };
  }

  if (!branch.planCode || !branch.currentPeriodEnd) {
    return {
      status: "NO_SUBSCRIPTION" as const,
      label: "No active period",
    };
  }

  const days = daysUntil(branch.currentPeriodEnd);

  if (days < 0) {
    return {
      status: "EXPIRED" as const,
      label: `${Math.abs(days)} ${
        Math.abs(days) === 1 ? "day" : "days"
      } overdue`,
    };
  }

  if (days <= 14) {
    return {
      status: "EXPIRING" as const,
      label:
        days === 0
          ? "Expires today"
          : `${days} ${days === 1 ? "day" : "days"} remaining`,
    };
  }

  return {
    status: "ACTIVE" as const,
    label: `${days} days remaining`,
  };
}

function daysUntil(value: string) {
  const target = new Date(value);

  if (Number.isNaN(target.getTime())) {
    return 0;
  }

  const now = new Date();

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const end = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  );

  return Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
}

function formatPlan(value: string | null) {
  if (!value) {
    return "No plan";
  }

  const normalized = value.toUpperCase();

  if (normalized.includes("6M") || normalized.includes("6_MONTH")) {
    return "6 Months";
  }

  if (normalized.includes("3M") || normalized.includes("3_MONTH")) {
    return "3 Months";
  }

  if (normalized.includes("MONTH") || normalized === "PRO") {
    return "Monthly";
  }

  return value.replace(/^PRO_?/i, "").replace(/_/g, " ");
}

function labelFromValue(value: string) {
  return value
    .replace(/_/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
