"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  History,
  Info,
  Landmark,
  RotateCcw,
  Tags,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ControlCenterSession } from "../../lib/control-center-session";
import { controlCenterFetch } from "../../lib/control-center-api";
import type {
  ControlCenterClient,
  ControlCenterPricing,
  ControlCenterPriceRow,
} from "./types";
import {
  EmptyState,
  IconBadge,
  Panel,
  SectionTitle,
  SelectControl,
  StatusPill,
} from "./control-center-primitives";
import { ccDateInputValue, ccMoney } from "./formatters";

type PricingScope = "ORGANIZATION" | "BRANCH";
type PricingSaveResponse = {
  notification?: {
    recipients: number;
    delivered: boolean;
    error: string | null;
  };
};

export function ControlCenterPricingSection({
  session,
  client,
  pricing,
  loading,
  saving,
  onBack,
  onHistory,
  onSaved,
  onSaveStateChange,
}: {
  session: ControlCenterSession;
  client: ControlCenterClient | null;
  pricing: ControlCenterPricing | null;
  loading: boolean;
  saving: boolean;
  onBack: () => void;
  onHistory: () => void;
  onSaved: () => Promise<void>;
  onSaveStateChange: (saving: boolean) => void;
}) {
  const [scope, setScope] = useState<PricingScope>("ORGANIZATION");
  const [branchId, setBranchId] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [effectiveFrom, setEffectiveFrom] = useState(ccDateInputValue());
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeRows = useMemo(() => {
    if (!pricing) return [];
    if (scope === "ORGANIZATION") return pricing.organization;
    const selected =
      pricing.branchOverrides.find((row) => row.branch.id === branchId) ??
      pricing.branchOverrides[0];
    return selected?.prices ?? [];
  }, [branchId, pricing, scope]);

  useEffect(() => {
    if (!pricing) return;
    if (!branchId && pricing.branches[0]) {
      setBranchId(pricing.branches[0].id);
    }
  }, [branchId, pricing]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of activeRows) {
      next[row.plan.code] = String(row.effectiveAmount);
    }
    setAmounts(next);
  }, [activeRows]);

  if (!client) {
    return (
      <>
        <SectionTitle
          title="Pricing"
          subtitle="Select a client organization before adjusting custom subscription prices."
        />
        <EmptyState
          title="No client selected"
          subtitle="Open the Clients section and choose Manage pricing for an organization."
        />
      </>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pricing) return;
    setError(null);
    setSuccess(null);
    onSaveStateChange(true);
    try {
      const prices = pricing.plans.map((plan) => ({
        planCode: plan.code,
        amount: Number(amounts[plan.code] ?? plan.amount),
      }));
      const path =
        scope === "ORGANIZATION"
          ? `/clients/${client!.id}/pricing`
          : `/clients/${client!.id}/branches/${branchId}/pricing`;
      const response = await controlCenterFetch<PricingSaveResponse>(
        path,
        session,
        {
          method: "POST",
          body: JSON.stringify({
            prices,
            effectiveFrom: dateToIso(effectiveFrom),
            effectiveUntil: effectiveUntil
              ? dateToIso(effectiveUntil)
              : undefined,
            reason,
          }),
        },
      );
      const notificationCopy = response.notification
        ? response.notification.delivered
          ? ` ${response.notification.recipients} owner/manager email recipient(s) notified.`
          : response.notification.error
            ? ` Pricing saved, but email notification failed: ${response.notification.error}`
            : " Pricing saved, but no owner/manager email recipients were found."
        : "";
      setSuccess(
        `${
          scope === "ORGANIZATION"
            ? "Organization pricing saved."
            : "Branch pricing saved."
        }${notificationCopy}`,
      );
      await onSaved();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save pricing.",
      );
    } finally {
      onSaveStateChange(false);
    }
  }

  const selectedBranch = pricing?.branches.find(
    (branch) => branch.id === branchId,
  );

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-2 text-sm font-black text-[var(--midnight-navy)]"
      >
        <ArrowLeft className="size-4" />
        Back to client details
      </button>

      <SectionTitle
        title="Manage Pricing"
        subtitle={`${client.name} - ${client.branchCount} branches`}
        action={
          <button
            type="button"
            onClick={onHistory}
            className="btn btn-ghost h-10 normal-case"
          >
            <History className="size-4" />
            Pricing history
          </button>
        }
      />

      {loading || !pricing ? (
        <Panel className="p-8">
          <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
        </Panel>
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          <Panel className="p-5">
            <h2 className="text-sm font-black">Pricing scope</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Choose how this pricing should apply.
            </p>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <ScopeButton
                selected={scope === "ORGANIZATION"}
                title="Organization (all branches)"
                subtitle="Applies to all branches except branch-specific overrides."
                icon={Landmark}
                onClick={() => setScope("ORGANIZATION")}
              />
              <ScopeButton
                selected={scope === "BRANCH"}
                title="Specific branch"
                subtitle="Sets pricing for one branch and overrides organization pricing."
                icon={Tags}
                onClick={() => setScope("BRANCH")}
              />
            </div>
          </Panel>

          {scope === "BRANCH" ? (
            <Panel className="grid gap-5 p-5 xl:grid-cols-[minmax(260px,380px)_minmax(0,1fr)]">
              <div>
                <label className="block">
                  <span className="mb-2 block text-xs font-black text-[var(--midnight-navy)]">
                    Branch
                  </span>
                  <SelectControl
                    value={branchId}
                    onChange={setBranchId}
                    ariaLabel="Branch"
                    className="w-full"
                    options={pricing.branches.map((branch) => ({
                      value: branch.id,
                      label: `${branch.name} - ${branch.address}`,
                    }))}
                  />
                </label>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold leading-5 text-[var(--forest-emerald)]">
                <Info className="mt-0.5 size-4 shrink-0" />
                This pricing will override the organization price and apply only
                to {selectedBranch?.name ?? "the selected branch"}.
              </div>
            </Panel>
          ) : null}

          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e8f0] px-5 py-4">
              <div>
                <h2 className="font-black">
                  {scope === "ORGANIZATION"
                    ? "Custom organization pricing"
                    : `Custom pricing for ${selectedBranch?.name ?? "branch"}`}
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Prices saved for today apply to new checkout immediately.
                  Future dates are scheduled and stay visible here.
                </p>
              </div>
              <StatusPill
                value={
                  scope === "ORGANIZATION"
                    ? `Applies to ${client.branchCount} branches`
                    : "Overrides organization pricing"
                }
              />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[860px] w-full text-left">
                <thead className="bg-[#f2f6f8] text-xs font-black text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Subscription plan</th>
                    {scope === "BRANCH" ? (
                      <th className="px-5 py-3">Organization price</th>
                    ) : null}
                    <th className="px-5 py-3">Standard price</th>
                    <th className="px-5 py-3">Custom price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f7]">
                  {activeRows.map((row) => (
                    <PricingRow
                      key={row.plan.code}
                      row={row}
                      amount={amounts[row.plan.code] ?? ""}
                      scope={scope}
                      onAmountChange={(value) =>
                        setAmounts((current) => ({
                          ...current,
                          [row.plan.code]: value,
                        }))
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="grid gap-4 xl:grid-cols-[240px_240px_minmax(0,1fr)]">
              <label className="block">
                <span className="mb-2 block text-xs font-black">
                  Effective from
                </span>
                <span className="relative block">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={effectiveFrom}
                    onChange={(event) => setEffectiveFrom(event.target.value)}
                    required
                    className="h-10 w-full rounded-lg border border-[#e2e8f0] bg-white pl-10 pr-3 text-sm font-bold outline-none focus:border-[var(--forest-emerald)]"
                  />
                </span>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black">
                  Effective until
                </span>
                <input
                  type="date"
                  value={effectiveUntil}
                  onChange={(event) => setEffectiveUntil(event.target.value)}
                  className="h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm font-bold outline-none focus:border-[var(--forest-emerald)]"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black">
                  Reason for change
                </span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  minLength={3}
                  maxLength={500}
                  required
                  placeholder="Agreed pricing for client rollout"
                  className="h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm font-semibold outline-none placeholder:text-slate-400 focus:border-[var(--forest-emerald)]"
                />
              </label>
            </div>
            {error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}
            {success ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-[var(--forest-emerald)]">
                {success}
              </div>
            ) : null}
          </Panel>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                const reset: Record<string, string> = {};
                for (const row of activeRows) {
                  reset[row.plan.code] = String(row.effectiveAmount);
                }
                setAmounts(reset);
                setReason("");
              }}
              className="btn btn-ghost h-10 normal-case"
            >
              <RotateCcw className="size-4" />
              Reset
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary h-10 normal-case"
            >
              <Check className="size-4" />
              {saving
                ? "Saving..."
                : scope === "ORGANIZATION"
                  ? "Save pricing"
                  : "Save branch pricing"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

function ScopeButton({
  selected,
  title,
  subtitle,
  icon,
  onClick,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  icon: typeof Landmark;
  onClick: () => void;
}) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-4 rounded-xl border p-4 text-left transition ${
        selected
          ? "border-[var(--forest-emerald)] bg-[#f4fbf7] text-[var(--forest-emerald)]"
          : "border-[#e2e8f0] bg-white text-[var(--midnight-navy)] hover:bg-slate-50"
      }`}
    >
      <IconBadge icon={Icon} tone={selected ? "green" : "slate"} />
      <span>
        <span className="block text-sm font-black">{title}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-600">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function PricingRow({
  row,
  amount,
  scope,
  onAmountChange,
}: {
  row: ControlCenterPriceRow;
  amount: string;
  scope: PricingScope;
  onAmountChange: (value: string) => void;
}) {
  return (
    <tr>
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <IconBadge icon={CalendarDays} tone="green" className="size-10" />
          <span>
            <span className="block text-sm font-black">{row.plan.name}</span>
            <span className="mt-1 block text-xs font-semibold text-slate-500">
              {row.plan.interval.toLowerCase().replace(/_/g, " ")}
            </span>
          </span>
        </div>
      </td>
      {scope === "BRANCH" ? (
        <td className="px-5 py-4 text-sm font-black">
          {ccMoney(row.inheritedAmount ?? row.defaultAmount, row.plan.currency)}
        </td>
      ) : null}
      <td className="px-5 py-4 text-sm font-black">
        {ccMoney(row.defaultAmount, row.plan.currency)}
      </td>
      <td className="px-5 py-4">
        <label className="flex h-10 max-w-[280px] overflow-hidden rounded-lg border border-[#e2e8f0] bg-white focus-within:border-[var(--forest-emerald)]">
          <span className="grid w-16 place-items-center border-r border-[#e2e8f0] bg-slate-50 text-xs font-black text-slate-500">
            {row.plan.currency}
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            className="min-w-0 flex-1 px-3 text-sm font-black outline-none"
          />
        </label>
        {row.override ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            <StatusPill
              value={
                row.override.status === "SCHEDULED"
                  ? "Scheduled"
                  : row.override.status === "EXPIRED"
                    ? "Expired"
                    : "Active"
              }
              tone={row.override.status === "SCHEDULED" ? "gold" : "green"}
            />
            <span>
              From {ccDateInputToLabel(row.override.effectiveFrom)}
              {row.override.effectiveUntil
                ? ` until ${ccDateInputToLabel(row.override.effectiveUntil)}`
                : ""}
            </span>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function dateToIso(value: string) {
  return `${value}T00:00:00.000Z`;
}

function ccDateInputToLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
