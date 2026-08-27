"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Check, Loader2, Plus } from "lucide-react";
import {
  DEFAULT_PAGE_SIZE,
  PaginationControls,
  paginateItems,
} from "../app/pagination";
import { RowActions } from "../app/row-actions";
import { TableSkeleton } from "../app/skeleton";
import { FormError, SelectField, TextField } from "../auth/form-controls";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import type { RembehSession } from "../../lib/auth-session";
import { SettingsModal } from "./settings-modal";

export type LoanTemplate = {
  id: string;
  name: string;
  description: string | null;
  interestRatePercent: number;
  interestType: "FLAT" | "REDUCING_BALANCE" | "COMPOUND";
  termValue: number;
  termUnit: "DAYS" | "WEEKS" | "MONTHS" | "YEARS";
  durationDays: number;
  repaymentFrequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "LUMP_SUM";
  processingFeeType: "PERCENTAGE" | "FIXED";
  processingFeePercent: number;
  processingFeeFixedAmount: number | null;
  penaltyRatePercent: number;
  finePeriodDays: number;
  paymentStartPolicy: "SAME_DAY" | "NEXT_DAY" | "AFTER_N_DAYS";
  paymentStartDelayDays: number | null;
  allowAgentDatePick: boolean;
  minLoanAmount: number | null;
  maxLoanAmount: number | null;
  notes: string | null;
  isActive: boolean;
  sortOrder: number;
};

type TemplateForm = {
  name: string;
  description: string;
  interestRatePercent: string;
  interestType: "FLAT" | "REDUCING_BALANCE" | "COMPOUND";
  termValue: string;
  termUnit: "DAYS" | "WEEKS" | "MONTHS";
  repaymentFrequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "LUMP_SUM";
  processingFeeType: "PERCENTAGE" | "FIXED";
  processingFeePercent: string;
  processingFeeFixedAmount: string;
  penaltyRatePercent: string;
  finePeriodDays: string;
  paymentStartPolicy: "SAME_DAY" | "NEXT_DAY" | "AFTER_N_DAYS";
  paymentStartDelayDays: string;
  allowAgentDatePick: boolean;
  minLoanAmount: string;
  maxLoanAmount: string;
  notes: string;
};

type WizardStepId =
  "basics" | "interest" | "term" | "payment-start" | "fines" | "review";

const WIZARD_STEPS: { id: WizardStepId; label: string; short: string }[] = [
  { id: "basics", label: "Basics", short: "Name" },
  { id: "interest", label: "Interest & fees", short: "Rates" },
  { id: "term", label: "Loan term", short: "Term" },
  { id: "payment-start", label: "Payment start", short: "Start" },
  { id: "fines", label: "Late fines", short: "Fines" },
  { id: "review", label: "Review", short: "Done" },
];

const emptyForm = (): TemplateForm => ({
  name: "",
  description: "",
  interestRatePercent: "",
  interestType: "FLAT",
  termValue: "",
  termUnit: "DAYS",
  repaymentFrequency: "DAILY",
  processingFeeType: "PERCENTAGE",
  processingFeePercent: "",
  processingFeeFixedAmount: "",
  penaltyRatePercent: "",
  finePeriodDays: "10",
  paymentStartPolicy: "NEXT_DAY",
  paymentStartDelayDays: "1",
  allowAgentDatePick: false,
  minLoanAmount: "",
  maxLoanAmount: "",
  notes: "",
});

function formFromTemplate(template: LoanTemplate): TemplateForm {
  const termUnit =
    template.termUnit === "WEEKS" || template.termUnit === "MONTHS"
      ? template.termUnit
      : "DAYS";
  return {
    name: template.name,
    description: template.description ?? "",
    interestRatePercent: String(template.interestRatePercent),
    interestType: template.interestType,
    termValue: String(template.termValue),
    termUnit,
    repaymentFrequency: template.repaymentFrequency,
    processingFeeType: template.processingFeeType ?? "PERCENTAGE",
    processingFeePercent: String(template.processingFeePercent),
    processingFeeFixedAmount:
      template.processingFeeFixedAmount != null
        ? String(template.processingFeeFixedAmount)
        : "",
    penaltyRatePercent: String(template.penaltyRatePercent),
    finePeriodDays: String(template.finePeriodDays),
    paymentStartPolicy: template.paymentStartPolicy ?? "NEXT_DAY",
    paymentStartDelayDays: String(template.paymentStartDelayDays ?? 1),
    allowAgentDatePick: template.allowAgentDatePick ?? false,
    minLoanAmount:
      template.minLoanAmount != null ? String(template.minLoanAmount) : "",
    maxLoanAmount:
      template.maxLoanAmount != null ? String(template.maxLoanAmount) : "",
    notes: template.notes ?? "",
  };
}

function paymentStartLabel(
  template: Pick<LoanTemplate, "paymentStartPolicy" | "paymentStartDelayDays">,
) {
  switch (template.paymentStartPolicy) {
    case "SAME_DAY":
      return "Same day";
    case "AFTER_N_DAYS":
      return `After ${template.paymentStartDelayDays ?? 1}d`;
    default:
      return "Next day";
  }
}

function termLabel(unit: LoanTemplate["termUnit"] | TemplateForm["termUnit"]) {
  switch (unit) {
    case "DAYS":
      return "days";
    case "WEEKS":
      return "weeks";
    case "MONTHS":
      return "months";
    case "YEARS":
      return "years";
  }
}

function frequencyLabel(value: LoanTemplate["repaymentFrequency"]) {
  switch (value) {
    case "DAILY":
      return "Daily";
    case "WEEKLY":
      return "Weekly";
    case "BIWEEKLY":
      return "Bi-weekly";
    case "MONTHLY":
      return "Monthly";
    case "LUMP_SUM":
      return "Lump sum";
  }
}

function interestTypeLabel(value: LoanTemplate["interestType"]) {
  switch (value) {
    case "FLAT":
      return "Flat";
    case "REDUCING_BALANCE":
      return "Reducing balance";
    case "COMPOUND":
      return "Compound";
  }
}

function processingFeeLabel(
  template: Pick<
    LoanTemplate,
    "processingFeeType" | "processingFeePercent" | "processingFeeFixedAmount"
  >,
) {
  if (template.processingFeeType === "FIXED") {
    return `UGX ${Math.round(template.processingFeeFixedAmount ?? 0).toLocaleString()} fixed`;
  }
  return `${template.processingFeePercent}%`;
}

export function LoanProductsManager({
  session,
  canManage,
  appearance = "manager",
  onCountChange,
}: {
  session: RembehSession;
  canManage: boolean;
  appearance?: "manager" | "owner";
  onCountChange?: (count: number) => void;
}) {
  const [templates, setTemplates] = useState<LoanTemplate[]>([]);
  const [templatePage, setTemplatePage] = useState(1);
  const [templatePageSize, setTemplatePageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardError, setWizardError] = useState<string | null>(null);

  const refreshCatalog = useCallback(async () => {
    const response = await fetch(`${apiBaseUrl}/loan-products`, {
      headers: {
        Authorization: `${session.tokenType} ${session.accessToken}`,
      },
    });
    const payload = await readApiJson<{
      templates?: LoanTemplate[];
      message?: string | string[];
    }>(response);
    if (!response.ok) {
      throw new Error(formatApiError(payload.message));
    }
    const next = payload.templates ?? [];
    setTemplates(next);
    onCountChange?.(next.filter((item) => item.isActive).length);
  }, [onCountChange, session.accessToken, session.tokenType]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        await refreshCatalog();
        if (!cancelled) setError(null);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load loan types.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshCatalog]);

  function updateForm<K extends keyof TemplateForm>(
    key: K,
    value: TemplateForm[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setWizardStep(0);
    setWizardError(null);
    setModalOpen(true);
  }

  function openEdit(template: LoanTemplate) {
    setEditingId(template.id);
    setForm(formFromTemplate(template));
    setWizardStep(0);
    setWizardError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setWizardStep(0);
    setWizardError(null);
  }

  function formPayload() {
    return {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      interestRatePercent: Number(form.interestRatePercent),
      interestType: form.interestType,
      termValue: Number(form.termValue),
      termUnit: form.termUnit,
      repaymentFrequency: form.repaymentFrequency,
      processingFeeType: form.processingFeeType,
      processingFeePercent:
        form.processingFeeType === "PERCENTAGE"
          ? Number(form.processingFeePercent)
          : 0,
      processingFeeFixedAmount:
        form.processingFeeType === "FIXED"
          ? Number(form.processingFeeFixedAmount)
          : undefined,
      penaltyRatePercent: Number(form.penaltyRatePercent),
      finePeriodDays: Number(form.finePeriodDays || "10"),
      paymentStartPolicy: form.paymentStartPolicy,
      paymentStartDelayDays:
        form.paymentStartPolicy === "AFTER_N_DAYS"
          ? Number(form.paymentStartDelayDays || "1")
          : undefined,
      allowAgentDatePick: form.allowAgentDatePick,
      minLoanAmount: form.minLoanAmount.trim()
        ? Number(form.minLoanAmount)
        : undefined,
      maxLoanAmount: form.maxLoanAmount.trim()
        ? Number(form.maxLoanAmount)
        : undefined,
      notes: form.notes.trim() || undefined,
    };
  }

  function validateWizardStep(step: number): string | null {
    switch (WIZARD_STEPS[step]?.id) {
      case "basics":
        if (!form.name.trim()) return "Enter a loan type name.";
        if (
          form.minLoanAmount.trim() &&
          form.maxLoanAmount.trim() &&
          Number(form.minLoanAmount) > Number(form.maxLoanAmount)
        ) {
          return "Min amount cannot be greater than max amount.";
        }
        return null;
      case "interest":
        if (
          form.interestRatePercent === "" ||
          Number.isNaN(Number(form.interestRatePercent))
        ) {
          return "Enter an interest rate.";
        }
        if (
          form.processingFeeType === "PERCENTAGE" &&
          (form.processingFeePercent === "" ||
            Number.isNaN(Number(form.processingFeePercent)))
        ) {
          return "Enter a processing fee percent.";
        }
        if (
          form.processingFeeType === "FIXED" &&
          (form.processingFeeFixedAmount === "" ||
            Number.isNaN(Number(form.processingFeeFixedAmount)))
        ) {
          return "Enter a fixed processing fee amount.";
        }
        return null;
      case "term":
        if (!form.termValue || Number(form.termValue) < 1) {
          return "Enter a loan term of at least 1.";
        }
        return null;
      case "payment-start":
        if (
          form.paymentStartPolicy === "AFTER_N_DAYS" &&
          (!form.paymentStartDelayDays ||
            Number(form.paymentStartDelayDays) < 1)
        ) {
          return "Enter the number of days before payment starts.";
        }
        return null;
      case "fines":
        if (
          form.penaltyRatePercent === "" ||
          Number.isNaN(Number(form.penaltyRatePercent))
        ) {
          return "Enter a penalty rate.";
        }
        if (!form.finePeriodDays || Number(form.finePeriodDays) < 1) {
          return "Enter fine period days (at least 1).";
        }
        return null;
      default:
        return null;
    }
  }

  function goNextStep() {
    const message = validateWizardStep(wizardStep);
    if (message) {
      setWizardError(message);
      return;
    }
    setWizardError(null);
    setWizardStep((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
  }

  function goBackStep() {
    setWizardError(null);
    setWizardStep((prev) => Math.max(prev - 1, 0));
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    if (WIZARD_STEPS[wizardStep]?.id !== "review") {
      goNextStep();
      return;
    }
    for (let i = 0; i < WIZARD_STEPS.length - 1; i += 1) {
      const message = validateWizardStep(i);
      if (message) {
        setWizardStep(i);
        setWizardError(message);
        return;
      }
    }
    setSaving(true);
    setError(null);
    setWizardError(null);
    try {
      const url = editingId
        ? `${apiBaseUrl}/loan-products/templates/${editingId}`
        : `${apiBaseUrl}/loan-products/templates`;
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formPayload()),
      });
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      closeModal();
      await refreshCatalog();
    } catch (caught) {
      setWizardError(
        caught instanceof Error ? caught.message : "Could not save loan type.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function duplicateTemplate(id: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/loan-products/templates/${id}/duplicate`,
        {
          method: "POST",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
          },
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      await refreshCatalog();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not duplicate loan type.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!window.confirm("Deactivate this loan type?")) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/loan-products/templates/${id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
          },
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      await refreshCatalog();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not deactivate loan type.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function runFinesNow() {
    if (!window.confirm("Scan overdue loans and apply due fines now?")) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/loan-products/fines/run`, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
        },
      });
      const payload = await readApiJson<{
        message?: string | string[];
        applied?: number;
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setError(null);
      window.alert(
        typeof payload.applied === "number"
          ? `Fine run complete. Applied to ${payload.applied} loan(s).`
          : "Fine run complete.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not run fines.",
      );
    } finally {
      setSaving(false);
    }
  }

  const sortedTemplates = useMemo(
    () =>
      [...templates].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
      }),
    [templates],
  );

  const pagedTemplates = useMemo(
    () => paginateItems(sortedTemplates, templatePage, templatePageSize),
    [sortedTemplates, templatePage, templatePageSize],
  );

  const isLastWizardStep = wizardStep >= WIZARD_STEPS.length - 1;
  const currentWizard = WIZARD_STEPS[wizardStep];
  const owner = appearance === "owner";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className={`font-bold text-[#0b1220] ${
              owner ? "text-base" : "text-sm"
            }`}
          >
            Loan types
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Products agents pick when issuing loans — rates, terms, fees, and
            fines.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            <>
              {!owner ? (
                <button
                  type="button"
                  onClick={() => void runFinesNow()}
                  disabled={saving}
                  className="btn btn-ghost h-8 px-3 text-xs"
                >
                  Run fines
                </button>
              ) : null}
              <button
                type="button"
                onClick={openCreate}
                disabled={saving}
                className={
                  owner
                    ? "flex h-9 items-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-3.5 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(15,143,104,0.28)] transition hover:brightness-105 disabled:opacity-60"
                    : "btn btn-primary h-8 px-3 text-xs"
                }
              >
                <Plus className="size-3.5" />
                New loan type
              </button>
            </>
          ) : null}
        </div>
      </div>

      <FormError error={error} />

      {loading ? <TableSkeleton rows={5} columns={5} /> : null}

      {!loading && !canManage ? (
        <p className="rounded-[14px] border border-[#e6ebf0] bg-[#f8faf9] px-4 py-8 text-center text-sm text-slate-500">
          You can view account settings, but cannot manage loan types.
        </p>
      ) : null}

      {!loading && canManage && sortedTemplates.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-[#d5dde5] bg-[#f8faf9] px-4 py-10 text-center text-sm text-slate-500">
          No loan types yet. Create one so agents can choose it when giving
          loans.
        </p>
      ) : null}

      {!loading && canManage && sortedTemplates.length > 0 ? (
        <div
          className={
            owner
              ? "overflow-hidden rounded-[14px] border border-[#e6ebf0]"
              : "overflow-hidden"
          }
        >
          <table className="w-full table-fixed border-collapse text-left text-[11px]">
            <thead>
              <tr
                className={
                  owner
                    ? "border-b border-[#dfe5eb] bg-[#e8edf2] text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-600"
                    : "border-b border-[var(--line)] bg-[#e8edf2] text-[10px] capitalize tracking-[0.08em] text-slate-600"
                }
              >
                <th className="w-[30%] px-3 py-2.5 font-semibold">Name</th>
                <th className="w-[17%] px-2 py-2.5 font-semibold">Rate</th>
                <th className="hidden w-[15%] px-2 py-2.5 font-semibold sm:table-cell">
                  Term
                </th>
                <th className="hidden w-[16%] px-2 py-2.5 font-semibold md:table-cell">
                  Frequency
                </th>
                <th className="w-[14%] px-2 py-2.5 font-semibold">Status</th>
                <th className="w-[8%] px-3 py-2.5 text-right font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f5]">
              {pagedTemplates.items.map((template) => (
                <tr key={template.id} className="bg-white">
                  <td className="px-3 py-2.5 align-middle">
                    <p className="truncate font-semibold text-[#0b1220]">
                      {template.name}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">
                      Fee {processingFeeLabel(template)} · Penalty{" "}
                      {template.penaltyRatePercent}% / {template.finePeriodDays}
                      d · Start {paymentStartLabel(template)}
                    </p>
                  </td>
                  <td className="px-2 py-2.5 align-middle font-semibold text-[#0b1220]">
                    {template.interestRatePercent}%{" "}
                    <span className="block truncate font-normal text-slate-500">
                      {interestTypeLabel(template.interestType)}
                    </span>
                  </td>
                  <td className="hidden px-2 py-2.5 align-middle text-[#0b1220] sm:table-cell">
                    {template.termValue} {termLabel(template.termUnit)}
                    <span className="block text-slate-500">
                      ({template.durationDays}d)
                    </span>
                  </td>
                  <td className="hidden px-2 py-2.5 align-middle text-[#0b1220] md:table-cell">
                    {frequencyLabel(template.repaymentFrequency)}
                  </td>
                  <td className="px-2 py-2.5 align-middle">
                    <span
                      className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold capitalize ${
                        template.isActive
                          ? "bg-emerald-50 text-[var(--forest-emerald)]"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {template.isActive ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <RowActions
                      label={`Open actions for ${template.name}`}
                      busy={saving}
                      items={[
                        {
                          label: "Edit",
                          onSelect: () => openEdit(template),
                        },
                        {
                          label: "Duplicate",
                          onSelect: () => void duplicateTemplate(template.id),
                        },
                        {
                          label: "Deactivate",
                          danger: true,
                          disabled: !template.isActive,
                          onSelect: () => void deleteTemplate(template.id),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={owner ? "border-t border-[#edf1f5] px-2" : ""}>
            <PaginationControls
              page={pagedTemplates.currentPage}
              pageSize={templatePageSize}
              total={sortedTemplates.length}
              itemLabel="loan types"
              onPageChange={setTemplatePage}
              onPageSizeChange={(nextPageSize) => {
                setTemplatePageSize(nextPageSize);
                setTemplatePage(1);
              }}
            />
          </div>
        </div>
      ) : null}

      <SettingsModal
        open={modalOpen}
        title={editingId ? "Edit loan type" : "Create loan type"}
        subtitle={`Step ${wizardStep + 1} of ${WIZARD_STEPS.length} · ${currentWizard?.label ?? "Basics"}`}
        stepIndex={wizardStep}
        stepCount={WIZARD_STEPS.length}
        onClose={closeModal}
        footer={
          <>
            <button
              type="button"
              className="h-10 rounded-xl px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
              onClick={closeModal}
              disabled={saving}
            >
              Cancel
            </button>
            <div className="flex flex-wrap items-center gap-2">
              {wizardStep > 0 ? (
                <button
                  type="button"
                  className="h-10 rounded-xl border border-[#e6ebf0] bg-white px-4 text-xs font-semibold text-[#111a2e] shadow-[0_6px_14px_rgba(15,23,42,0.04)] transition hover:bg-[#f8faf9]"
                  onClick={goBackStep}
                  disabled={saving}
                >
                  Back
                </button>
              ) : null}
              {!isLastWizardStep ? (
                <button
                  type="button"
                  className="h-10 rounded-xl bg-[var(--forest-emerald)] px-5 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(15,143,104,0.28)] transition hover:brightness-105"
                  onClick={goNextStep}
                  disabled={saving}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="submit"
                  form="owner-loan-template-form"
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-5 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(15,143,104,0.28)] transition hover:brightness-105 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : null}
                  {editingId ? "Save changes" : "Create loan type"}
                </button>
              )}
            </div>
          </>
        }
      >
        <form
          id="owner-loan-template-form"
          onSubmit={saveTemplate}
          className="space-y-4"
        >
          <WizardStepIndicator stepIndex={wizardStep} />
          {wizardError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {wizardError}
            </p>
          ) : null}

          <div className="rounded-[18px] border border-[#e6ebf0] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:p-5">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-[#0b1220]">
                {currentWizard?.label}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {wizardHint(currentWizard?.id)}
              </p>
            </div>

            {currentWizard?.id === "basics" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField
                  label="Loan type name"
                  value={form.name}
                  onChange={(value) => updateForm("name", value)}
                  placeholder="e.g. 30-day working capital"
                  required
                  compact
                />
                <div className="hidden sm:block" />
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-semibold text-[var(--midnight-navy)]">
                    Description
                  </span>
                  <textarea
                    className="min-h-16 w-full rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 py-2 text-sm text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] focus:bg-white"
                    value={form.description}
                    onChange={(event) =>
                      updateForm("description", event.target.value)
                    }
                    placeholder="Short description for agents"
                  />
                </label>
                <TextField
                  label="Min loan amount"
                  value={form.minLoanAmount}
                  onChange={(value) => updateForm("minLoanAmount", value)}
                  placeholder="Optional"
                  compact
                />
                <TextField
                  label="Max loan amount"
                  value={form.maxLoanAmount}
                  onChange={(value) => updateForm("maxLoanAmount", value)}
                  placeholder="Optional"
                  compact
                />
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-semibold text-[var(--midnight-navy)]">
                    Notes for your team
                  </span>
                  <textarea
                    className="min-h-14 w-full rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 py-2 text-sm text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] focus:bg-white"
                    value={form.notes}
                    onChange={(event) =>
                      updateForm("notes", event.target.value)
                    }
                    placeholder="Internal notes"
                  />
                </label>
              </div>
            ) : null}

            {currentWizard?.id === "interest" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SelectField
                  label="Interest type"
                  value={form.interestType}
                  onChange={(value) =>
                    updateForm(
                      "interestType",
                      value as TemplateForm["interestType"],
                    )
                  }
                  options={[
                    { value: "FLAT", label: "Flat" },
                    { value: "REDUCING_BALANCE", label: "Reducing balance" },
                    { value: "COMPOUND", label: "Compound" },
                  ]}
                  required
                  compact
                />
                <TextField
                  label="Interest rate (%)"
                  value={form.interestRatePercent}
                  onChange={(value) => updateForm("interestRatePercent", value)}
                  placeholder="12"
                  required
                  compact
                />
                <SelectField
                  label="Processing fee type"
                  value={form.processingFeeType}
                  onChange={(value) =>
                    updateForm(
                      "processingFeeType",
                      value as TemplateForm["processingFeeType"],
                    )
                  }
                  options={[
                    { value: "PERCENTAGE", label: "Percentage" },
                    { value: "FIXED", label: "Fixed amount" },
                  ]}
                  required
                  compact
                />
                {form.processingFeeType === "PERCENTAGE" ? (
                  <TextField
                    label="Processing fee (%)"
                    value={form.processingFeePercent}
                    onChange={(value) =>
                      updateForm("processingFeePercent", value)
                    }
                    placeholder="2"
                    required
                    compact
                  />
                ) : null}
                {form.processingFeeType === "FIXED" ? (
                  <TextField
                    label="Fixed processing fee (UGX)"
                    value={form.processingFeeFixedAmount}
                    onChange={(value) =>
                      updateForm("processingFeeFixedAmount", value)
                    }
                    placeholder="5000"
                    required
                    compact
                  />
                ) : null}
              </div>
            ) : null}

            {currentWizard?.id === "term" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField
                  label="Loan term"
                  value={form.termValue}
                  onChange={(value) => updateForm("termValue", value)}
                  placeholder="30"
                  required
                  compact
                />
                <SelectField
                  label="Term unit"
                  value={form.termUnit}
                  onChange={(value) =>
                    updateForm("termUnit", value as TemplateForm["termUnit"])
                  }
                  options={[
                    { value: "DAYS", label: "Days" },
                    { value: "WEEKS", label: "Weeks" },
                    { value: "MONTHS", label: "Months" },
                  ]}
                  required
                  compact
                />
                <SelectField
                  label="Repayment frequency"
                  value={form.repaymentFrequency}
                  onChange={(value) =>
                    updateForm(
                      "repaymentFrequency",
                      value as TemplateForm["repaymentFrequency"],
                    )
                  }
                  options={[
                    { value: "DAILY", label: "Daily" },
                    { value: "WEEKLY", label: "Weekly" },
                    { value: "BIWEEKLY", label: "Bi-weekly" },
                    { value: "MONTHLY", label: "Monthly" },
                    { value: "LUMP_SUM", label: "Lump sum" },
                  ]}
                  required
                  compact
                />
              </div>
            ) : null}

            {currentWizard?.id === "payment-start" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SelectField
                  label="When repayments start"
                  value={form.paymentStartPolicy}
                  onChange={(value) =>
                    updateForm(
                      "paymentStartPolicy",
                      value as TemplateForm["paymentStartPolicy"],
                    )
                  }
                  options={[
                    { value: "SAME_DAY", label: "Same day" },
                    { value: "NEXT_DAY", label: "Next day" },
                    { value: "AFTER_N_DAYS", label: "After some days" },
                  ]}
                  required
                  compact
                />
                {form.paymentStartPolicy === "AFTER_N_DAYS" ? (
                  <TextField
                    label="Days before payment starts"
                    value={form.paymentStartDelayDays}
                    onChange={(value) =>
                      updateForm("paymentStartDelayDays", value)
                    }
                    placeholder="1"
                    required
                    compact
                  />
                ) : (
                  <div className="hidden sm:block" />
                )}
                <label className="flex items-start gap-3 rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 py-3 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[var(--forest-emerald)]"
                    checked={form.allowAgentDatePick}
                    onChange={(event) =>
                      updateForm("allowAgentDatePick", event.target.checked)
                    }
                  />
                  <span>
                    <span className="block text-xs font-bold text-[#0b1220]">
                      Let agents choose a later start date
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">
                      Useful when a borrower needs a short grace period.
                    </span>
                  </span>
                </label>
              </div>
            ) : null}

            {currentWizard?.id === "fines" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField
                  label="Penalty rate (%)"
                  value={form.penaltyRatePercent}
                  onChange={(value) => updateForm("penaltyRatePercent", value)}
                  placeholder="5"
                  required
                  compact
                />
                <TextField
                  label="Fine period (days)"
                  value={form.finePeriodDays}
                  onChange={(value) => updateForm("finePeriodDays", value)}
                  placeholder="10"
                  required
                  compact
                />
                <p className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900 sm:col-span-2">
                  Late fine = penalty rate % of the original loan amount,
                  charged every fine period after the loan is overdue.
                </p>
              </div>
            ) : null}

            {currentWizard?.id === "review" ? (
              <div className="space-y-2">
                <ReviewLine label="Name" value={form.name.trim() || "—"} />
                <ReviewLine
                  label="Interest"
                  value={`${form.interestRatePercent || "—"}% ${interestTypeLabel(form.interestType)}`}
                />
                <ReviewLine
                  label="Processing fee"
                  value={
                    form.processingFeeType === "FIXED"
                      ? `UGX ${form.processingFeeFixedAmount || "—"} fixed`
                      : `${form.processingFeePercent || "—"}%`
                  }
                />
                <ReviewLine
                  label="Term"
                  value={`${form.termValue || "—"} ${termLabel(form.termUnit)} · ${frequencyLabel(form.repaymentFrequency)}`}
                />
                <ReviewLine
                  label="Payment start"
                  value={paymentStartLabel({
                    paymentStartPolicy: form.paymentStartPolicy,
                    paymentStartDelayDays: Number(
                      form.paymentStartDelayDays || "1",
                    ),
                  })}
                />
                <ReviewLine
                  label="Agent date pick"
                  value={form.allowAgentDatePick ? "Allowed" : "Not allowed"}
                />
                <ReviewLine
                  label="Penalty"
                  value={`${form.penaltyRatePercent || "—"}% every ${form.finePeriodDays || "—"}d`}
                />
                <ReviewLine
                  label="Amount range"
                  value={`${form.minLoanAmount || "—"} – ${form.maxLoanAmount || "—"}`}
                />
                {form.notes.trim() ? (
                  <ReviewLine label="Notes" value={form.notes.trim()} />
                ) : null}
              </div>
            ) : null}
          </div>
        </form>
      </SettingsModal>
    </div>
  );
}

function WizardStepIndicator({ stepIndex }: { stepIndex: number }) {
  return (
    <ol className="grid grid-cols-6 gap-1.5">
      {WIZARD_STEPS.map((step, index) => {
        const done = index < stepIndex;
        const active = index === stepIndex;
        return (
          <li
            key={step.id}
            className={`rounded-xl px-1.5 py-2 text-center ${
              active
                ? "bg-[#013f35] text-white shadow-[0_8px_16px_rgba(1,63,53,0.22)]"
                : done
                  ? "bg-emerald-50 text-[var(--forest-emerald)]"
                  : "bg-white text-slate-400 ring-1 ring-[#e6ebf0]"
            }`}
          >
            <span className="mx-auto flex size-5 items-center justify-center rounded-full bg-black/5 text-[10px] font-bold">
              {done ? <Check className="size-3" /> : index + 1}
            </span>
            <span className="mt-1 block truncate text-[9px] font-bold uppercase tracking-[0.04em]">
              {step.short}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function wizardHint(id: WizardStepId | undefined) {
  switch (id) {
    case "basics":
      return "Name this product and set optional amount limits.";
    case "interest":
      return "Set how interest and processing fees are charged.";
    case "term":
      return "Choose how long the loan runs and how often clients pay.";
    case "payment-start":
      return "Decide when the first repayment is due.";
    case "fines":
      return "Set what happens when a loan becomes overdue.";
    case "review":
      return "Confirm everything looks right before saving.";
    default:
      return "";
  }
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-xl bg-[#f8faf9] px-3 py-2.5 text-xs">
      <span className="font-medium text-slate-500">{label}</span>
      <span className="text-right font-bold text-[#0b1220]">{value}</span>
    </div>
  );
}

export function LoanProductsSectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] pb-3">
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}
