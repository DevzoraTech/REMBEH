"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Copy,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../components/app/app-shell";
import {
  FormError,
  SelectField,
  TextField,
} from "../../components/auth/form-controls";
import { SettingsModal } from "../../components/settings/settings-modal";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  clearAuthState,
  isSessionExpired,
  readAuthState,
} from "../../lib/auth-session";
import { resolveOperatorRole } from "../../lib/roles";

type SettingsSection = "loan-products";

type LoanTemplate = {
  id: string;
  name: string;
  description: string | null;
  interestRatePercent: number;
  interestType: "FLAT" | "REDUCING_BALANCE" | "COMPOUND";
  termValue: number;
  termUnit: "DAYS" | "WEEKS" | "MONTHS" | "YEARS";
  durationDays: number;
  repaymentFrequency:
    | "DAILY"
    | "WEEKLY"
    | "BIWEEKLY"
    | "MONTHLY"
    | "LUMP_SUM";
  processingFeePercent: number;
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
  repaymentFrequency:
    | "DAILY"
    | "WEEKLY"
    | "BIWEEKLY"
    | "MONTHLY"
    | "LUMP_SUM";
  processingFeePercent: string;
  penaltyRatePercent: string;
  finePeriodDays: string;
  paymentStartPolicy: "SAME_DAY" | "NEXT_DAY" | "AFTER_N_DAYS";
  paymentStartDelayDays: string;
  allowAgentDatePick: boolean;
  minLoanAmount: string;
  maxLoanAmount: string;
  notes: string;
};

const SECTIONS: { id: SettingsSection; label: string; hint: string }[] = [
  {
    id: "loan-products",
    label: "Loan products",
    hint: "All product settings — interest, term, fees, penalty, and payment start — live on each template",
  },
];

const emptyForm = (): TemplateForm => ({
  name: "",
  description: "",
  interestRatePercent: "",
  interestType: "FLAT",
  termValue: "",
  termUnit: "DAYS",
  repaymentFrequency: "DAILY",
  processingFeePercent: "",
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
    processingFeePercent: String(template.processingFeePercent),
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

function parseSection(_value: string | null): SettingsSection {
  // Legacy sections (payment-start, fines, rates, periods) redirect here —
  // templates own all product settings.
  return "loan-products";
}

function paymentStartLabel(template: LoanTemplate) {
  switch (template.paymentStartPolicy) {
    case "SAME_DAY":
      return "Same day";
    case "AFTER_N_DAYS":
      return `After ${template.paymentStartDelayDays ?? 1}d`;
    default:
      return "Next day";
  }
}

function termLabel(unit: LoanTemplate["termUnit"]) {
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

function SectionHeader({
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

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-6 animate-spin text-[var(--forest-emerald)]" />
        </div>
      }
    >
      <SettingsPageContent />
    </Suspense>
  );
}

function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = parseSection(searchParams.get("section"));

  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);

  const [templates, setTemplates] = useState<LoanTemplate[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const setSection = useCallback(
    (next: SettingsSection) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "loan-products") {
        params.delete("section");
      } else {
        params.set("section", next);
      }
      const query = params.toString();
      router.replace(query ? `/settings?${query}` : "/settings");
    },
    [router, searchParams],
  );

  useEffect(() => {
    const auth = readAuthState();
    if (!auth.session || isSessionExpired(auth.session)) {
      clearAuthState();
      router.replace("/login");
      return;
    }

    const role = resolveOperatorRole(auth.session, auth.user);
    if (role === "staff") {
      router.replace("/dashboard");
      return;
    }

    if (!auth.session.permissions.includes("loan.product.manage")) {
      setError("You do not have permission to manage settings.");
      setSession(auth.session);
      setWorkspace(auth.workspace);
      setUser(auth.user);
      setBranch(auth.branch);
      setLoading(false);
      return;
    }

    setSession(auth.session);
    setWorkspace(auth.workspace);
    setUser(auth.user);
    setBranch(auth.branch);

    void (async () => {
      try {
        await refreshCatalog(auth.session!);
        setError(null);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load settings.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function refreshCatalog(activeSession: RembehSession) {
    const response = await fetch(`${apiBaseUrl}/loan-products`, {
      headers: {
        Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
      },
    });
    const payload = await readApiJson<{
      templates?: LoanTemplate[];
      message?: string | string[];
    }>(response);
    if (!response.ok) {
      throw new Error(formatApiError(payload.message));
    }
    setTemplates(payload.templates ?? []);
  }

  function updateForm<K extends keyof TemplateForm>(
    key: K,
    value: TemplateForm[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(template: LoanTemplate) {
    setEditingId(template.id);
    setForm(formFromTemplate(template));
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
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
      processingFeePercent: Number(form.processingFeePercent),
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

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
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
      await refreshCatalog(session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save loan type template.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function duplicateTemplate(id: string) {
    if (!session) return;
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
      await refreshCatalog(session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not duplicate template.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!session) return;
    if (!window.confirm("Deactivate this loan type template?")) return;
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
      await refreshCatalog(session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not delete template.",
      );
    } finally {
      setSaving(false);
    }
  }

  const activeSection = useMemo(
    () => SECTIONS.find((item) => item.id === section) ?? SECTIONS[0],
    [section],
  );

  const sortedTemplates = useMemo(
    () =>
      [...templates].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
      }),
    [templates],
  );

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[var(--forest-emerald)]" />
      </div>
    );
  }

  return (
    <AppShell
      session={session}
      workspace={workspace}
      user={user}
      branch={branch}
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-4">
          <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[-0.03em] text-[var(--midnight-navy)]">
            Settings
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Configure loan product templates — interest, term, fees, penalty,
            and payment start.
          </p>
        </header>

        <FormError error={error} />

        <div className="mt-3 grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
          <aside className="panel h-fit p-1.5 lg:sticky lg:top-[68px]">
            <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
              {SECTIONS.map((item) => {
                const active = item.id === section;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={`shrink-0 px-3 py-2 text-left text-xs font-semibold transition ${
                      active
                        ? "bg-[var(--soft-mist)] text-[var(--midnight-navy)]"
                        : "text-slate-600 hover:bg-[var(--soft-mist)]/70 hover:text-[var(--midnight-navy)]"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="panel min-w-0 p-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Loading settings…
              </div>
            ) : null}

            {!loading && section === "loan-products" ? (
              <div className="space-y-3">
                <SectionHeader
                  title="Loan products"
                  description={activeSection.hint}
                  action={
                    <button
                      type="button"
                      className="btn btn-primary h-8 px-3 text-xs"
                      onClick={openCreate}
                      disabled={saving}
                    >
                      <Plus className="size-3.5" />
                      New template
                    </button>
                  }
                />

                {sortedTemplates.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    No loan type templates yet. Create one so agents can start
                    loans from a product.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-[0.08em] text-slate-500">
                          <th className="py-2 pr-3 font-semibold">Name</th>
                          <th className="py-2 pr-3 font-semibold">Rate</th>
                          <th className="py-2 pr-3 font-semibold">Term</th>
                          <th className="py-2 pr-3 font-semibold">
                            Frequency
                          </th>
                          <th className="py-2 pr-3 font-semibold">Status</th>
                          <th className="py-2 font-semibold text-right">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTemplates.map((template) => (
                          <tr
                            key={template.id}
                            className="border-b border-[var(--line)] last:border-0"
                          >
                            <td className="py-2.5 pr-3 align-middle">
                              <p className="font-semibold text-[var(--midnight-navy)]">
                                {template.name}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                Fee {template.processingFeePercent}% · Penalty{" "}
                                {template.penaltyRatePercent}% /{" "}
                                {template.finePeriodDays}d · Start{" "}
                                {paymentStartLabel(template)}
                              </p>
                            </td>
                            <td className="py-2.5 pr-3 align-middle font-semibold text-[var(--midnight-navy)]">
                              {template.interestRatePercent}%{" "}
                              <span className="font-normal text-slate-500">
                                {interestTypeLabel(template.interestType)}
                              </span>
                            </td>
                            <td className="py-2.5 pr-3 align-middle text-[var(--midnight-navy)]">
                              {template.termValue} {termLabel(template.termUnit)}
                              <span className="ml-1 text-slate-500">
                                ({template.durationDays}d)
                              </span>
                            </td>
                            <td className="py-2.5 pr-3 align-middle text-[var(--midnight-navy)]">
                              {frequencyLabel(template.repaymentFrequency)}
                            </td>
                            <td className="py-2.5 pr-3 align-middle">
                              <span
                                className={`inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] ${
                                  template.isActive
                                    ? "bg-[rgba(15,138,108,0.12)] text-[var(--forest-emerald)]"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {template.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td className="py-2.5 align-middle">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  className="btn btn-ghost h-7 px-2 text-[11px]"
                                  onClick={() => openEdit(template)}
                                  disabled={saving}
                                  title="Edit"
                                >
                                  <Pencil className="size-3" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost h-7 px-2 text-[11px]"
                                  onClick={() =>
                                    void duplicateTemplate(template.id)
                                  }
                                  disabled={saving}
                                  title="Duplicate"
                                >
                                  <Copy className="size-3" />
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost h-7 px-2 text-[11px] text-red-600"
                                  onClick={() =>
                                    void deleteTemplate(template.id)
                                  }
                                  disabled={saving || !template.isActive}
                                  title="Deactivate"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

          </section>
        </div>
      </div>

      <SettingsModal
        open={modalOpen}
        title={editingId ? "Edit loan product" : "New loan product"}
        subtitle="Interest, term, fees, penalty, and payment start are snapshotted on each application."
        onClose={closeModal}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost h-9 px-3 text-xs"
              onClick={closeModal}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="loan-template-form"
              className="btn btn-primary h-9 px-4 text-xs"
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              {editingId ? "Save changes" : "Create template"}
            </button>
          </>
        }
      >
        <form
          id="loan-template-form"
          onSubmit={saveTemplate}
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
        >
          <TextField
            label="Template / Loan type name"
            value={form.name}
            onChange={(value) => updateForm("name", value)}
            placeholder="e.g. 30-day working capital"
            required
            compact
          />
          <SelectField
            label="Interest Type"
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
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-[var(--midnight-navy)]">
              Description
            </span>
            <textarea
              className="min-h-12 w-full border border-[var(--line)] bg-white px-2.5 py-1.5 text-sm text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] focus:shadow-[inset_0_0_0_1px_var(--forest-emerald)]"
              value={form.description}
              onChange={(event) =>
                updateForm("description", event.target.value)
              }
              placeholder="Optional product description for agents"
            />
          </label>
          <TextField
            label="Interest Rate (%)"
            value={form.interestRatePercent}
            onChange={(value) => updateForm("interestRatePercent", value)}
            placeholder="12"
            required
            compact
          />
          <TextField
            label="Processing Fee (%)"
            value={form.processingFeePercent}
            onChange={(value) => updateForm("processingFeePercent", value)}
            placeholder="2"
            required
            compact
          />
          <TextField
            label="Loan Term"
            value={form.termValue}
            onChange={(value) => updateForm("termValue", value)}
            placeholder="30"
            required
            compact
          />
          <SelectField
            label="Term Unit"
            value={form.termUnit}
            onChange={(value) =>
              updateForm("termUnit", value as TemplateForm["termUnit"])
            }
            options={[
              { value: "DAYS", label: "Days" },
              { value: "WEEKS", label: "Weeks" },
              { value: "MONTHS", label: "Month(s)" },
            ]}
            required
            compact
          />
          <SelectField
            label="Repayment Frequency"
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
          <TextField
            label="Penalty Rate (%)"
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
          <SelectField
            label="Payment start"
            value={form.paymentStartPolicy}
            onChange={(value) =>
              updateForm(
                "paymentStartPolicy",
                value as TemplateForm["paymentStartPolicy"],
              )
            }
            options={[
              { value: "SAME_DAY", label: "Same day as go-live" },
              { value: "NEXT_DAY", label: "Next day after go-live" },
              { value: "AFTER_N_DAYS", label: "After N days" },
            ]}
            required
            compact
          />
          {form.paymentStartPolicy === "AFTER_N_DAYS" ? (
            <TextField
              label="Days after go-live"
              value={form.paymentStartDelayDays}
              onChange={(value) => updateForm("paymentStartDelayDays", value)}
              placeholder="1"
              required
              compact
            />
          ) : null}
          <TextField
            label="Min Loan Amount"
            value={form.minLoanAmount}
            onChange={(value) => updateForm("minLoanAmount", value)}
            placeholder="Optional"
            compact
          />
          <TextField
            label="Max Loan Amount"
            value={form.maxLoanAmount}
            onChange={(value) => updateForm("maxLoanAmount", value)}
            placeholder="Optional"
            compact
          />
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.allowAgentDatePick}
              onChange={(event) =>
                updateForm("allowAgentDatePick", event.target.checked)
              }
            />
            <span className="text-xs text-slate-600">
              Allow agents to pick a later payment start date (on or after the
              policy date)
            </span>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-[var(--midnight-navy)]">
              Notes (internal)
            </span>
            <textarea
              className="min-h-11 w-full border border-[var(--line)] bg-white px-2.5 py-1.5 text-sm text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] focus:shadow-[inset_0_0_0_1px_var(--forest-emerald)]"
              value={form.notes}
              onChange={(event) => updateForm("notes", event.target.value)}
              placeholder="Internal notes — not shown to borrowers"
            />
          </label>
          <p className="text-[11px] leading-snug text-slate-500 sm:col-span-2">
            Overdue fine = penalty rate % of original principal, charged every
            fine period days after maturity while unpaid. Payment start is
            computed from go-live using this template&apos;s policy. Reducing /
            compound types are stored; repayable preview currently uses flat
            principal × rate% until amortization is added.
          </p>
        </form>
      </SettingsModal>
    </AppShell>
  );
}
