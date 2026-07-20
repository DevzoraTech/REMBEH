"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/app/app-shell";
import {
  FormError,
  PrimaryButton,
  TextField,
} from "../../../components/auth/form-controls";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../lib/api";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  clearAuthState,
  isSessionExpired,
  readAuthState,
} from "../../../lib/auth-session";
import { resolveOperatorRole } from "../../../lib/roles";

type LoanTemplate = {
  id: string;
  name: string;
  description: string | null;
  interestRatePercent: number;
  interestType: "FLAT";
  termValue: number;
  termUnit: "DAYS" | "MONTHS" | "YEARS";
  durationDays: number;
  repaymentFrequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  processingFeePercent: number;
  penaltyRatePercent: number;
  finePeriodDays: number;
  minLoanAmount: number | null;
  maxLoanAmount: number | null;
  notes: string | null;
  isActive: boolean;
  sortOrder: number;
};

type PaymentStartPolicy = {
  id: string;
  policyType: "SAME_DAY" | "NEXT_DAY" | "AFTER_N_DAYS";
  afterDays: number | null;
  allowAgentDatePick: boolean;
  description: string;
};

type TemplateForm = {
  name: string;
  description: string;
  interestRatePercent: string;
  interestType: "FLAT";
  termValue: string;
  termUnit: "DAYS" | "MONTHS" | "YEARS";
  repaymentFrequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  processingFeePercent: string;
  penaltyRatePercent: string;
  finePeriodDays: string;
  minLoanAmount: string;
  maxLoanAmount: string;
  notes: string;
};

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
  minLoanAmount: "",
  maxLoanAmount: "",
  notes: "",
});

function formFromTemplate(template: LoanTemplate): TemplateForm {
  return {
    name: template.name,
    description: template.description ?? "",
    interestRatePercent: String(template.interestRatePercent),
    interestType: "FLAT",
    termValue: String(template.termValue),
    termUnit: template.termUnit,
    repaymentFrequency: template.repaymentFrequency,
    processingFeePercent: String(template.processingFeePercent),
    penaltyRatePercent: String(template.penaltyRatePercent),
    finePeriodDays: String(template.finePeriodDays),
    minLoanAmount:
      template.minLoanAmount != null ? String(template.minLoanAmount) : "",
    maxLoanAmount:
      template.maxLoanAmount != null ? String(template.maxLoanAmount) : "",
    notes: template.notes ?? "",
  };
}

function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold text-slate-600">
        {props.label}
        {props.required ? " *" : ""}
      </span>
      <select
        className="w-full border border-[var(--line)] bg-white px-3 py-2 text-sm"
        value={props.value}
        required={props.required}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function LoanProductsPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [templates, setTemplates] = useState<LoanTemplate[]>([]);
  const [paymentStartPolicy, setPaymentStartPolicy] =
    useState<PaymentStartPolicy | null>(null);
  const [policyType, setPolicyType] = useState<
    "SAME_DAY" | "NEXT_DAY" | "AFTER_N_DAYS"
  >("NEXT_DAY");
  const [afterDays, setAfterDays] = useState("1");
  const [allowAgentDatePick, setAllowAgentDatePick] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

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
      setError("You do not have permission to manage loan products.");
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
            : "Could not load loan products.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  function applyPaymentStartPolicy(policy: PaymentStartPolicy | null) {
    setPaymentStartPolicy(policy);
    if (!policy) {
      setPolicyType("NEXT_DAY");
      setAfterDays("1");
      setAllowAgentDatePick(false);
      return;
    }
    setPolicyType(policy.policyType);
    setAfterDays(String(policy.afterDays ?? 1));
    setAllowAgentDatePick(policy.allowAgentDatePick);
  }

  async function refreshCatalog(activeSession: RembehSession) {
    const response = await fetch(`${apiBaseUrl}/loan-products`, {
      headers: {
        Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
      },
    });
    const payload = await readApiJson<{
      templates?: LoanTemplate[];
      paymentStartPolicy?: PaymentStartPolicy;
      message?: string | string[];
    }>(response);
    if (!response.ok) {
      throw new Error(formatApiError(payload.message));
    }
    setTemplates(payload.templates ?? []);
    applyPaymentStartPolicy(payload.paymentStartPolicy ?? null);
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
    setShowForm(true);
  }

  function openEdit(template: LoanTemplate) {
    setEditingId(template.id);
    setForm(formFromTemplate(template));
    setShowForm(true);
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
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
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

  async function savePaymentStartPolicy(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/loan-products/payment-start-policy`,
        {
          method: "POST",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            policyType,
            ...(policyType === "AFTER_N_DAYS"
              ? { afterDays: Number(afterDays) }
              : {}),
            allowAgentDatePick,
          }),
        },
      );
      const payload = await readApiJson<{
        paymentStartPolicy?: PaymentStartPolicy;
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      applyPaymentStartPolicy(payload.paymentStartPolicy ?? null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save payment start policy.",
      );
    } finally {
      setSaving(false);
    }
  }

  const activeTemplates = templates.filter((item) => item.isActive);

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
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.03em] text-[var(--midnight-navy)]">
              Loan type templates
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Define loan products agents pick first. Interest, term, fees, and
              overdue penalty are filled automatically and snapshotted on each
              application.
            </p>
          </div>
          <PrimaryButton type="button" onClick={openCreate} disabled={saving}>
            <Plus className="size-3.5" />
            New template
          </PrimaryButton>
        </header>

        <FormError error={error} />

        {loading ? (
          <p className="text-sm text-slate-500">Loading catalog…</p>
        ) : (
          <div className="space-y-6">
            {showForm ? (
              <section className="panel p-4">
                <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
                  {editingId
                    ? "Edit loan product template"
                    : "New loan product template"}
                </h2>
                <form
                  onSubmit={saveTemplate}
                  className="mt-3 grid gap-3 sm:grid-cols-2"
                >
                  <TextField
                    label="Template / Loan type name"
                    value={form.name}
                    onChange={(value) => updateForm("name", value)}
                    placeholder="e.g. 30-day working capital"
                    required
                  />
                  <SelectField
                    label="Interest Type"
                    value={form.interestType}
                    onChange={() => updateForm("interestType", "FLAT")}
                    options={[{ value: "FLAT", label: "Flat" }]}
                    required
                  />
                  <label className="block text-sm sm:col-span-2">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">
                      Description
                    </span>
                    <textarea
                      className="min-h-20 w-full border border-[var(--line)] bg-white px-3 py-2 text-sm"
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
                    onChange={(value) =>
                      updateForm("interestRatePercent", value)
                    }
                    placeholder="12"
                    required
                  />
                  <TextField
                    label="Processing Fee (%)"
                    value={form.processingFeePercent}
                    onChange={(value) =>
                      updateForm("processingFeePercent", value)
                    }
                    placeholder="2"
                    required
                  />
                  <TextField
                    label="Loan Term"
                    value={form.termValue}
                    onChange={(value) => updateForm("termValue", value)}
                    placeholder="30"
                    required
                  />
                  <SelectField
                    label="Term Unit"
                    value={form.termUnit}
                    onChange={(value) =>
                      updateForm(
                        "termUnit",
                        value as TemplateForm["termUnit"],
                      )
                    }
                    options={[
                      { value: "DAYS", label: "Days" },
                      { value: "MONTHS", label: "Months" },
                      { value: "YEARS", label: "Years" },
                    ]}
                    required
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
                      { value: "BIWEEKLY", label: "Biweekly" },
                      { value: "MONTHLY", label: "Monthly" },
                    ]}
                    required
                  />
                  <TextField
                    label="Penalty Rate (%)"
                    value={form.penaltyRatePercent}
                    onChange={(value) =>
                      updateForm("penaltyRatePercent", value)
                    }
                    placeholder="5"
                    required
                  />
                  <TextField
                    label="Fine period (days)"
                    value={form.finePeriodDays}
                    onChange={(value) => updateForm("finePeriodDays", value)}
                    placeholder="10"
                    required
                  />
                  <TextField
                    label="Min Loan Amount"
                    value={form.minLoanAmount}
                    onChange={(value) => updateForm("minLoanAmount", value)}
                    placeholder="Optional"
                  />
                  <TextField
                    label="Max Loan Amount"
                    value={form.maxLoanAmount}
                    onChange={(value) => updateForm("maxLoanAmount", value)}
                    placeholder="Optional"
                  />
                  <label className="block text-sm sm:col-span-2">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">
                      Notes (internal)
                    </span>
                    <textarea
                      className="min-h-16 w-full border border-[var(--line)] bg-white px-3 py-2 text-sm"
                      value={form.notes}
                      onChange={(event) =>
                        updateForm("notes", event.target.value)
                      }
                      placeholder="Internal notes — not shown to borrowers"
                    />
                  </label>
                  <p className="text-xs text-slate-500 sm:col-span-2">
                    Overdue fine = penalty rate % of original principal, charged
                    every fine period days after maturity while unpaid.
                  </p>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <PrimaryButton type="submit" disabled={saving}>
                      {editingId ? "Save changes" : "Create template"}
                    </PrimaryButton>
                    <button
                      type="button"
                      className="btn btn-ghost h-10 px-3 text-sm"
                      onClick={() => {
                        setShowForm(false);
                        setEditingId(null);
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            <section className="space-y-3">
              <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
                Active templates
              </h2>
              {activeTemplates.length === 0 ? (
                <div className="panel p-6 text-sm text-slate-500">
                  No active loan type templates yet. Create one so agents can
                  start new loans from a product.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {activeTemplates.map((template) => (
                    <article key={template.id} className="panel p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-bold text-[var(--midnight-navy)]">
                            {template.name}
                          </h3>
                          {template.description ? (
                            <p className="mt-1 text-xs text-slate-600">
                              {template.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div>
                          <dt className="text-slate-500">Interest</dt>
                          <dd className="font-semibold text-[var(--midnight-navy)]">
                            {template.interestRatePercent}% flat
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Term</dt>
                          <dd className="font-semibold text-[var(--midnight-navy)]">
                            {template.termValue}{" "}
                            {template.termUnit.toLowerCase()} (
                            {template.durationDays}d)
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Fee</dt>
                          <dd className="font-semibold text-[var(--midnight-navy)]">
                            {template.processingFeePercent}%
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Penalty</dt>
                          <dd className="font-semibold text-[var(--midnight-navy)]">
                            {template.penaltyRatePercent}% /{" "}
                            {template.finePeriodDays}d
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Repayment</dt>
                          <dd className="font-semibold text-[var(--midnight-navy)]">
                            {template.repaymentFrequency.toLowerCase()}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Amount range</dt>
                          <dd className="font-semibold text-[var(--midnight-navy)]">
                            {template.minLoanAmount != null ||
                            template.maxLoanAmount != null
                              ? `${template.minLoanAmount ?? "—"} – ${template.maxLoanAmount ?? "—"}`
                              : "No limits"}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-ghost h-8 px-2 text-xs"
                          onClick={() => openEdit(template)}
                          disabled={saving}
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost h-8 px-2 text-xs"
                          onClick={() => void duplicateTemplate(template.id)}
                          disabled={saving}
                        >
                          <Copy className="size-3.5" />
                          Duplicate
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost h-8 px-2 text-xs text-red-600"
                          onClick={() => void deleteTemplate(template.id)}
                          disabled={saving}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel p-4">
              <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
                Payment start policy
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Applied relative to loan go-live (disbursement / approval /
                application submit). Default if unset: next day.
              </p>
              <form
                onSubmit={savePaymentStartPolicy}
                className="mt-3 grid gap-3 sm:grid-cols-2"
              >
                <SelectField
                  label="When repayments start"
                  value={policyType}
                  onChange={(value) =>
                    setPolicyType(
                      value as "SAME_DAY" | "NEXT_DAY" | "AFTER_N_DAYS",
                    )
                  }
                  options={[
                    { value: "SAME_DAY", label: "Same day" },
                    { value: "NEXT_DAY", label: "Next day" },
                    { value: "AFTER_N_DAYS", label: "After N days" },
                  ]}
                />
                {policyType === "AFTER_N_DAYS" ? (
                  <TextField
                    label="Days after go-live"
                    value={afterDays}
                    onChange={setAfterDays}
                    placeholder="3"
                    required
                  />
                ) : (
                  <div />
                )}
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={allowAgentDatePick}
                    onChange={(event) =>
                      setAllowAgentDatePick(event.target.checked)
                    }
                  />
                  <span>
                    Allow agents to pick a later start date (on or after the
                    policy date)
                  </span>
                </label>
                {paymentStartPolicy ? (
                  <p className="text-xs text-slate-500 sm:col-span-2">
                    Current: {paymentStartPolicy.description}
                  </p>
                ) : null}
                <PrimaryButton type="submit" disabled={saving}>
                  Save payment start policy
                </PrimaryButton>
              </form>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
