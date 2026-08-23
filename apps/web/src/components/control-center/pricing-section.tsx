"use client";

import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  History,
  Landmark,
  RotateCcw,
  Tag,
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
  ControlCenterPriceRow,
  ControlCenterPricing,
} from "./types";

import {
  ccMoney,
} from "./formatters";

type PricingScope =
  | "ORGANIZATION"
  | "BRANCH";

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
  const [scope, setScope] =
    useState<PricingScope>("ORGANIZATION");

  const [
    selectedBranchId,
    setSelectedBranchId,
  ] = useState("");

  const [amounts, setAmounts] =
    useState<Record<string, string>>({});

  const [reason, setReason] =
    useState("");

  const [
    effectiveFrom,
    setEffectiveFrom,
  ] = useState(
    todayDateInput(),
  );

  const [
    effectiveUntil,
    setEffectiveUntil,
  ] = useState("");

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const branches =
    Array.isArray(
      pricing?.branches,
    )
      ? pricing.branches
      : [];

  useEffect(() => {
    if (
      scope === "BRANCH" &&
      !selectedBranchId &&
      branches.length
    ) {
      setSelectedBranchId(
        branches[0].id,
      );
    }
  }, [
    branches,
    scope,
    selectedBranchId,
  ]);

  const activeRows =
    useMemo<
      ControlCenterPriceRow[]
    >(() => {
      if (!pricing) {
        return [];
      }

      if (
        scope ===
        "ORGANIZATION"
      ) {
        return Array.isArray(
          pricing.organization,
        )
          ? pricing.organization
          : [];
      }

      if (!selectedBranchId) {
        return [];
      }

      const branchPricing =
        pricing.branchOverrides?.find(
          (entry) =>
            entry.branch.id ===
            selectedBranchId,
        );

      return Array.isArray(
        branchPricing?.prices,
      )
        ? branchPricing.prices
        : [];
    }, [
      pricing,
      scope,
      selectedBranchId,
    ]);

  useEffect(() => {
    const next: Record<
      string,
      string
    > = {};

    for (const row of activeRows) {
      next[row.plan.code] =
        String(
          row.effectiveAmount,
        );
    }

    setAmounts(
      next,
    );

    setReason(
      "",
    );

    setEffectiveFrom(
      todayDateInput(),
    );

    setEffectiveUntil(
      "",
    );

    setError(
      null,
    );

    setSuccess(
      null,
    );
  }, [
    activeRows,
  ]);

  const selectedBranch =
    branches.find(
      (branch) =>
        branch.id ===
        selectedBranchId,
    ) ?? null;

  const changedRows =
    useMemo(
      () =>
        activeRows.filter(
          (row) => {
            const value =
              Number(
                amounts[
                  row.plan.code
                ],
              );

            return (
              Number.isFinite(
                value,
              ) &&
              value !==
                row.effectiveAmount
            );
          },
        ),
      [
        activeRows,
        amounts,
      ],
    );

  const invalidAmount =
    activeRows.some(
      (row) => {
        const value =
          Number(
            amounts[
              row.plan.code
            ],
          );

        return (
          !Number.isFinite(
            value,
          ) ||
          value < 0
        );
      },
    );

  async function savePricing(
    event:
      React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(
      null,
    );

    setSuccess(
      null,
    );

    if (!client) {
      setError(
        "No client is selected.",
      );
      return;
    }

    if (!activeRows.length) {
      setError(
        "No pricing plans are available.",
      );
      return;
    }

    if (
      scope === "BRANCH" &&
      !selectedBranchId
    ) {
      setError(
        "Select a branch.",
      );
      return;
    }

    if (invalidAmount) {
      setError(
        "All pricing amounts must be valid non-negative numbers.",
      );
      return;
    }

    if (
      !reason.trim()
    ) {
      setError(
        "Enter a reason for this pricing change.",
      );
      return;
    }

    if (!effectiveFrom) {
      setError(
        "Choose when this pricing should take effect.",
      );
      return;
    }

    if (
      effectiveUntil &&
      new Date(
        effectiveUntil,
      ).getTime() <=
        new Date(
          effectiveFrom,
        ).getTime()
    ) {
      setError(
        "The end date must be later than the effective date.",
      );
      return;
    }

    const prices =
      activeRows.map(
        (row) => ({
          planCode:
            row.plan.code,

          amount:
            Number(
              amounts[
                row.plan.code
              ],
            ),
        }),
      );

    const endpoint =
      scope ===
      "ORGANIZATION"
        ? `/clients/${client.id}/pricing`
        : `/clients/${client.id}/branches/${selectedBranchId}/pricing`;

    onSaveStateChange(
      true,
    );

    try {
      await controlCenterFetch(
        endpoint,
        session,
        {
          method:
            "POST",

          body:
            JSON.stringify({
              prices,

              reason:
                reason.trim(),

              effectiveFrom:
                dateToIso(
                  effectiveFrom,
                ),

              effectiveUntil:
                effectiveUntil
                  ? dateToIso(
                      effectiveUntil,
                    )
                  : undefined,
            }),
        },
      );

      await onSaved();

      setSuccess(
        scope ===
          "ORGANIZATION"
          ? "Organization pricing saved successfully."
          : `Pricing for ${
              selectedBranch
                ?.name ??
              "the selected branch"
            } saved successfully.`,
      );

      setReason(
        "",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save pricing.",
      );
    } finally {
      onSaveStateChange(
        false,
      );
    }
  }

  if (loading) {
    return (
      <PricingEditorSkeleton />
    );
  }

  if (
    !client ||
    !pricing
  ) {
    return (
      <div className="mx-auto w-full max-w-[1500px]">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 items-center gap-2 text-[10px] font-semibold text-[#53627a] hover:text-[#17233c]"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>

        <div className="mt-4 grid min-h-[280px] place-items-center rounded-[10px] border border-[#dfe5eb] bg-white">
          <div className="text-center">
            <Tag className="mx-auto size-6 text-[#8b96a7]" />

            <p className="mt-3 text-[12px] font-semibold text-[#17233c]">
              Pricing unavailable
            </p>

            <p className="mt-1 text-[10px] text-[#718099]">
              Pricing information for this client could not be loaded.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <div className="mb-4 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 items-center gap-2 text-[10px] font-semibold text-[#53627a] transition hover:text-[#17233c]"
        >
          <ArrowLeft className="size-3.5" />
          Back to client
        </button>

        <button
          type="button"
          onClick={onHistory}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3 text-[10px] font-semibold text-[#53627a] transition hover:bg-[#f7f9fa]"
        >
          <History className="size-3.5" />
          Pricing history
        </button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-[10px] bg-[#eaf6ee] text-[#198b55]">
              <Tag
                className="size-5"
                strokeWidth={1.9}
              />
            </div>

            <div>
              <h1 className="text-[24px] font-bold tracking-[-0.025em] text-[#111d36]">
                Pricing
              </h1>

              <p className="mt-1 text-[10px] font-medium text-[#61708a]">
                {client.name}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[8px] border border-[#dfe5eb] bg-white px-3 py-2">
          <p className="text-[8.5px] font-medium uppercase tracking-[0.05em] text-[#8792a3]">
            Current pricing
          </p>

          <p className="mt-1 text-[10px] font-semibold text-[#26344d]">
            {client.pricingType ===
            "CUSTOM"
              ? "Custom pricing"
              : "System default"}
          </p>
        </div>
      </div>

      <form
        onSubmit={
          savePricing
        }
      >
        <section className="mt-4 rounded-[10px] border border-[#dfe5eb] bg-white">
          <div className="border-b border-[#edf1f4] px-4 py-3">
            <p className="text-[11px] font-semibold text-[#17233c]">
              Pricing scope
            </p>

            <p className="mt-1 text-[9.5px] font-normal text-[#718099]">
              Choose whether this agreement applies to the entire
              organization or only one branch.
            </p>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-2">
            <ScopeButton
              selected={
                scope ===
                "ORGANIZATION"
              }
              title="Organization pricing"
              subtitle="Apply negotiated pricing to all branches unless a branch-specific override exists."
              icon={Landmark}
              onClick={() =>
                setScope(
                  "ORGANIZATION",
                )
              }
            />

            <ScopeButton
              selected={
                scope ===
                "BRANCH"
              }
              title="Branch pricing"
              subtitle="Override pricing for one specific branch without changing the rest of the organization."
              icon={Building2}
              onClick={() =>
                setScope(
                  "BRANCH",
                )
              }
            />
          </div>

          {scope ===
          "BRANCH" ? (
            <div className="border-t border-[#edf1f4] px-4 py-4">
              <label className="block max-w-[520px]">
                <span className="text-[9.5px] font-semibold text-[#526078]">
                  Branch
                </span>

                <div className="relative mt-1.5">
                  <select
                    value={
                      selectedBranchId
                    }
                    onChange={(
                      event,
                    ) =>
                      setSelectedBranchId(
                        event
                          .target
                          .value,
                      )
                    }
                    className="h-10 w-full appearance-none rounded-md border border-[#dfe5eb] bg-white px-3 pr-9 text-[10.5px] font-medium text-[#26344d] outline-none focus:border-[#87bfa1]"
                  >
                    {branches.map(
                      (
                        branch,
                      ) => (
                        <option
                          key={
                            branch.id
                          }
                          value={
                            branch.id
                          }
                        >
                          {
                            branch.name
                          }
                          {branch.address
                            ? ` — ${branch.address}`
                            : ""}
                        </option>
                      ),
                    )}
                  </select>

                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-[#718099]" />
                </div>
              </label>
            </div>
          ) : null}
        </section>

        <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#edf1f4] px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold text-[#17233c]">
                Subscription prices
              </p>

              <p className="mt-1 text-[9.5px] text-[#718099]">
                {scope ===
                "ORGANIZATION"
                  ? "Set the effective subscription price for this organization."
                  : `Set prices specifically for ${
                      selectedBranch
                        ?.name ??
                      "the selected branch"
                    }.`}
              </p>
            </div>

            <p className="text-[9px] font-medium text-[#718099]">
              {changedRows.length}{" "}
              {changedRows.length ===
              1
                ? "change"
                : "changes"}
            </p>
          </div>

          {activeRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] table-fixed text-left">
                <thead>
                  <tr className="bg-[#fcfdfe] text-[9.5px] font-semibold text-[#56647d]">
                    <th className="w-[28%] px-4 py-2.5">
                      Plan
                    </th>

                    {scope ===
                    "BRANCH" ? (
                      <th className="w-[20%] px-3 py-2.5">
                        Inherited price
                      </th>
                    ) : null}

                    <th className="w-[20%] px-3 py-2.5">
                      System default
                    </th>

                    <th className="px-3 py-2.5">
                      Effective price
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#edf1f4]">
                  {activeRows.map(
                    (
                      row,
                    ) => (
                      <PricingRow
                        key={
                          row.plan
                            .code
                        }
                        row={
                          row
                        }
                        amount={
                          amounts[
                            row.plan
                              .code
                          ] ??
                          ""
                        }
                        scope={
                          scope
                        }
                        onAmountChange={(
                          value,
                        ) =>
                          setAmounts(
                            (
                              current,
                            ) => ({
                              ...current,

                              [row
                                .plan
                                .code]:
                                value,
                            }),
                          )
                        }
                      />
                    ),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid min-h-[180px] place-items-center px-5 text-center">
              <div>
                <Tag className="mx-auto size-5 text-[#8995a6]" />

                <p className="mt-2 text-[10.5px] font-semibold text-[#26344d]">
                  No pricing rows available
                </p>

                <p className="mt-1 text-[9.5px] text-[#718099]">
                  Pricing has not been configured for this scope.
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-[10px] border border-[#dfe5eb] bg-white">
          <div className="border-b border-[#edf1f4] px-4 py-3">
            <p className="text-[11px] font-semibold text-[#17233c]">
              Agreement timing
            </p>

            <p className="mt-1 text-[9.5px] text-[#718099]">
              Control when these prices become active and, where
              applicable, when they stop applying.
            </p>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-2">
            <DateField
              label="Effective from"
              value={
                effectiveFrom
              }
              required
              onChange={
                setEffectiveFrom
              }
            />

            <DateField
              label="Effective until"
              value={
                effectiveUntil
              }
              onChange={
                setEffectiveUntil
              }
              hint="Optional — leave blank for no planned end date."
            />
          </div>
        </section>

        <section className="mt-4 rounded-[10px] border border-[#dfe5eb] bg-white p-4">
          <label className="block">
            <span className="text-[10px] font-semibold text-[#26344d]">
              Reason for pricing change
            </span>

            <span className="ml-1 text-[#cf4141]">
              *
            </span>

            <textarea
              value={
                reason
              }
              onChange={(
                event,
              ) =>
                setReason(
                  event.target
                    .value,
                )
              }
              rows={3}
              placeholder="For example: Negotiated six-month commercial agreement approved by management."
              className="mt-2 w-full resize-none rounded-md border border-[#dfe5eb] bg-white px-3 py-2.5 text-[10.5px] leading-5 text-[#26344d] outline-none placeholder:text-[#9aa4b2] focus:border-[#87bfa1] focus:ring-2 focus:ring-[#e6f4eb]"
            />

            <p className="mt-1.5 text-[9px] leading-4 text-[#718099]">
              This reason is retained in pricing history for audit
              and accountability.
            </p>
          </label>

          {error ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] font-medium text-red-700">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[10px] font-medium text-[#168650]">
              {success}
            </div>
          ) : null}
        </section>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={
              saving
            }
            onClick={() => {
              const reset: Record<
                string,
                string
              > = {};

              for (const row of activeRows) {
                reset[
                  row.plan.code
                ] =
                  String(
                    row.effectiveAmount,
                  );
              }

              setAmounts(
                reset,
              );

              setReason(
                "",
              );

              setEffectiveFrom(
                todayDateInput(),
              );

              setEffectiveUntil(
                "",
              );

              setError(
                null,
              );

              setSuccess(
                null,
              );
            }}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3.5 text-[10px] font-semibold text-[#526078] transition hover:bg-[#f7f9fa] disabled:opacity-50"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </button>

          <button
            type="submit"
            disabled={
              saving ||
              invalidAmount ||
              !activeRows.length
            }
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#188653] px-4 text-[10px] font-semibold text-white transition hover:bg-[#147849] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="size-3.5" />

            {saving
              ? "Saving..."
              : scope ===
                  "ORGANIZATION"
                ? "Save pricing"
                : "Save branch pricing"}
          </button>
        </div>
      </form>
    </div>
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
  icon: LucideIcon;
  onClick: () => void;
}) {
  const Icon =
    icon;

  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`flex min-h-[96px] items-start gap-3 rounded-[9px] border p-4 text-left transition ${
        selected
          ? "border-[#86bea0] bg-[#f2faf5]"
          : "border-[#dfe5eb] bg-white hover:bg-[#fafbfc]"
      }`}
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-[8px] ${
          selected
            ? "bg-[#e5f5eb] text-[#168650]"
            : "bg-[#eef2f6] text-[#63718a]"
        }`}
      >
        <Icon
          className="size-4"
          strokeWidth={1.9}
        />
      </span>

      <span>
        <span
          className={`block text-[10.5px] font-semibold ${
            selected
              ? "text-[#168650]"
              : "text-[#26344d]"
          }`}
        >
          {title}
        </span>

        <span className="mt-1 block max-w-md text-[9.5px] font-normal leading-4 text-[#718099]">
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
  row:
    ControlCenterPriceRow;

  amount:
    string;

  scope:
    PricingScope;

  onAmountChange:
    (
      value: string,
    ) => void;
}) {
  const current =
    Number(
      amount,
    );

  const changed =
    Number.isFinite(
      current,
    ) &&
    current !==
      row.effectiveAmount;

  return (
    <tr className="h-[72px]">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-[#eaf6ee] text-[#198b55]">
            <CalendarDays
              className="size-3.5"
              strokeWidth={1.9}
            />
          </span>

          <span className="min-w-0">
            <span className="block truncate text-[10.5px] font-semibold text-[#26344d]">
              {
                row.plan.name
              }
            </span>

            <span className="mt-1 block text-[9px] font-normal text-[#718099]">
              {formatInterval(
                row.plan
                  .interval,
              )}
            </span>
          </span>
        </div>
      </td>

      {scope ===
      "BRANCH" ? (
        <td className="px-3 py-3">
          <p className="text-[10px] font-semibold text-[#26344d]">
            {ccMoney(
              row.inheritedAmount ??
                row.defaultAmount,
              row.plan.currency,
            )}
          </p>

          <p className="mt-1 text-[8.5px] text-[#8490a1]">
            Organization level
          </p>
        </td>
      ) : null}

      <td className="px-3 py-3">
        <p className="text-[10px] font-semibold text-[#26344d]">
          {ccMoney(
            row.defaultAmount,
            row.plan.currency,
          )}
        </p>

        <p className="mt-1 text-[8.5px] text-[#8490a1]">
          System standard
        </p>
      </td>

      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`flex h-9 max-w-[270px] overflow-hidden rounded-md border bg-white transition focus-within:ring-2 ${
              changed
                ? "border-[#83bda0] focus-within:ring-[#e6f4eb]"
                : "border-[#dfe5eb] focus-within:border-[#87bfa1] focus-within:ring-[#e6f4eb]"
            }`}
          >
            <span className="grid w-14 shrink-0 place-items-center border-r border-[#e2e8f0] bg-[#f7f9fa] text-[8.5px] font-semibold text-[#65738a]">
              {
                row.plan
                  .currency
              }
            </span>

            <input
              type="number"
              min={0}
              step={1}
              value={
                amount
              }
              onChange={(
                event,
              ) =>
                onAmountChange(
                  event.target
                    .value,
                )
              }
              className="min-w-0 flex-1 bg-white px-3 text-[10.5px] font-semibold text-[#17233c] outline-none"
            />
          </label>

          {changed ? (
            <span className="rounded-[5px] bg-[#fff3df] px-2 py-1 text-[8.5px] font-semibold text-[#b96912]">
              Changed
            </span>
          ) : null}
        </div>

        {row.override ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <OverrideBadge
              status={
                row.override
                  .status
              }
            />

            <span className="text-[8.5px] text-[#7b879a]">
              From{" "}
              {formatDate(
                row.override
                  .effectiveFrom,
              )}

              {row.override
                .effectiveUntil
                ? ` until ${formatDate(
                    row.override
                      .effectiveUntil,
                  )}`
                : ""}
            </span>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function DateField({
  label,
  value,
  onChange,
  required,
  hint,
}: {
  label:
    string;

  value:
    string;

  onChange:
    (
      value: string,
    ) => void;

  required?:
    boolean;

  hint?:
    string;
}) {
  return (
    <label className="block">
      <span className="text-[9.5px] font-semibold text-[#526078]">
        {label}

        {required ? (
          <span className="ml-1 text-[#cf4141]">
            *
          </span>
        ) : null}
      </span>

      <input
        type="date"
        value={
          value
        }
        required={
          required
        }
        onChange={(
          event,
        ) =>
          onChange(
            event.target
              .value,
          )
        }
        className="mt-1.5 h-10 w-full rounded-md border border-[#dfe5eb] bg-white px-3 text-[10.5px] font-medium text-[#26344d] outline-none focus:border-[#87bfa1] focus:ring-2 focus:ring-[#e6f4eb]"
      />

      {hint ? (
        <span className="mt-1.5 block text-[8.5px] leading-4 text-[#8490a1]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function OverrideBadge({
  status,
}: {
  status:
    "ACTIVE" |
    "SCHEDULED" |
    "EXPIRED";
}) {
  const styles =
    status ===
    "ACTIVE"
      ? "bg-[#eaf6ee] text-[#1b804e]"
      : status ===
          "SCHEDULED"
        ? "bg-[#fff3df] text-[#b96912]"
        : "bg-[#eef2f6] text-[#65738a]";

  return (
    <span
      className={`rounded-[5px] px-2 py-1 text-[8.5px] font-semibold ${styles}`}
    >
      {status ===
      "ACTIVE"
        ? "Active override"
        : status ===
            "SCHEDULED"
          ? "Scheduled"
          : "Expired"}
    </span>
  );
}

function PricingEditorSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1500px] animate-pulse">
      <div className="h-8 w-28 rounded bg-slate-100" />

      <div className="mt-4 flex items-center gap-3">
        <div className="size-11 rounded-[10px] bg-slate-100" />

        <div>
          <div className="h-5 w-48 rounded bg-slate-100" />
          <div className="mt-2 h-3 w-36 rounded bg-slate-100" />
        </div>
      </div>

      <div className="mt-4 h-[155px] rounded-[10px] border border-[#e7ebef] bg-white" />

      <div className="mt-4 h-[330px] rounded-[10px] border border-[#e7ebef] bg-white" />

      <div className="mt-4 h-[150px] rounded-[10px] border border-[#e7ebef] bg-white" />
    </div>
  );
}

function todayDateInput() {
  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() +
        1,
    ).padStart(
      2,
      "0",
    );

  const day =
    String(
      now.getDate(),
    ).padStart(
      2,
      "0",
    );

  return `${year}-${month}-${day}`;
}

function dateToIso(
  value: string,
) {
  return `${value}T00:00:00.000Z`;
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