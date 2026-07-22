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
  Check,
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

type SettingsSection = "loan-products" | "workspace";

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

type WizardStepId =
  | "basics"
  | "interest"
  | "term"
  | "payment-start"
  | "fines"
  | "review";

const WIZARD_STEPS: { id: WizardStepId; label: string }[] = [
  { id: "basics", label: "basics" },
  { id: "interest", label: "interest & fees" },
  { id: "term", label: "term" },
  { id: "payment-start", label: "payment start" },
  { id: "fines", label: "fines" },
  { id: "review", label: "review" },
];

const SECTIONS: { id: SettingsSection; label: string; hint: string }[] = [
  {
    id: "loan-products",
    label: "Loan types",
    hint: "Set the loan options agents choose from.",
  },
  {
    id: "workspace",
    label: "Account",
    hint: "View your account details.",
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

function parseSection(value: string | null): SettingsSection {
  if (
    value === "payment-start" ||
    value === "fines" ||
    value === "rates" ||
    value === "periods" ||
    value === "loan-products"
  ) {
    return "loan-products";
  }
  if (value === "workspace") return value;
  return "loan-products";
}

function paymentStartLabel(template: Pick<
  LoanTemplate,
  "paymentStartPolicy" | "paymentStartDelayDays"
>) {
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
          {title.toLowerCase()}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 border-b border-[var(--line)] py-2.5 last:border-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-3">
      <dt className="text-[11px] font-semibold lowercase tracking-[0.06em] text-slate-500">
        {label.toLowerCase()}
      </dt>
      <dd className="text-sm text-[var(--midnight-navy)]">{value || "—"}</dd>
    </div>
  );
}

function WizardStepIndicator({
  stepIndex,
}: {
  stepIndex: number;
}) {
  return (
    <ol className="mb-3 flex flex-wrap gap-1.5">
      {WIZARD_STEPS.map((step, index) => {
        const done = index < stepIndex;
        const active = index === stepIndex;
        return (
          <li
            key={step.id}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold lowercase tracking-[0.06em] ${
              active
                ? "bg-[var(--midnight-navy)] text-white"
                : done
                  ? "bg-[rgba(15,138,108,0.12)] text-[var(--forest-emerald)]"
                  : "bg-slate-100 text-slate-500"
            }`}
          >
            <span className="tabular-nums">{index + 1}</span>
            <span className="hidden sm:inline">{step.label}</span>
            {done ? <Check className="size-2.5" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] py-1.5 text-xs last:border-0">
      <span className="text-slate-500">{label.toLowerCase()}</span>
      <span className="text-right font-semibold text-[var(--midnight-navy)]">
        {value}
      </span>
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
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardError, setWizardError] = useState<string | null>(null);

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
    const boot = window.setTimeout(() => {
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

      setSession(auth.session);
      setWorkspace(auth.workspace);
      setUser(auth.user);
      setBranch(auth.branch);

      if (!auth.session.permissions.includes("loan.product.manage")) {
        setError("You can view settings, but cannot manage loan types.");
        setLoading(false);
        return;
      }

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
    }, 0);

    return () => window.clearTimeout(boot);
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
          form.processingFeePercent === "" ||
          Number.isNaN(Number(form.processingFeePercent))
        ) {
          return "Enter a processing fee percent.";
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
    if (!session) return;
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
      await refreshCatalog(session);
    } catch (caught) {
      setWizardError(
        caught instanceof Error
          ? caught.message
          : "Could not save loan type.",
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
          : "Could not duplicate loan type.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!session) return;
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
      await refreshCatalog(session);
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

  const canManageProducts =
    session?.permissions.includes("loan.product.manage") ?? false;
  const isLastWizardStep = wizardStep >= WIZARD_STEPS.length - 1;
  const currentWizard = WIZARD_STEPS[wizardStep];

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
            settings
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            loan types and account settings.
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
                  title="Loan types"
                  description={activeSection.hint}
                  action={
                    canManageProducts ? (
                      <button
                        type="button"
                        className="btn btn-primary h-8 px-3 text-xs"
                        onClick={openCreate}
                        disabled={saving}
                      >
                        <Plus className="size-3.5" />
                        New loan type
                      </button>
                    ) : null
                  }
                />

                {!canManageProducts ? (
                  <p className="py-6 text-center text-sm text-slate-500">
                    You do not have permission to manage loan types.
                  </p>
                ) : sortedTemplates.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    No loan types yet. Create one so agents can choose it when giving loans.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--line)] text-[10px] lowercase tracking-[0.08em] text-slate-500">
                          <th className="py-2 pr-3 font-semibold">name</th>
                          <th className="py-2 pr-3 font-semibold">rate</th>
                          <th className="py-2 pr-3 font-semibold">term</th>
                          <th className="py-2 pr-3 font-semibold">
                            frequency
                          </th>
                          <th className="py-2 pr-3 font-semibold">status</th>
                          <th className="py-2 font-semibold text-right">
                            actions
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
                              {template.termValue}{" "}
                              {termLabel(template.termUnit)}
                              <span className="ml-1 text-slate-500">
                                ({template.durationDays}d)
                              </span>
                            </td>
                            <td className="py-2.5 pr-3 align-middle text-[var(--midnight-navy)]">
                              {frequencyLabel(template.repaymentFrequency)}
                            </td>
                            <td className="py-2.5 pr-3 align-middle">
                              <span
                                className={`inline-block px-1.5 py-0.5 text-[10px] font-bold lowercase tracking-[0.06em] ${
                                  template.isActive
                                    ? "bg-[rgba(15,138,108,0.12)] text-[var(--forest-emerald)]"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {template.isActive ? "active" : "inactive"}
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

            {!loading && section === "workspace" ? (
              <div className="space-y-3">
                <SectionHeader
                  title="account"
                  description={activeSection.hint}
                />
                <dl>
                  <InfoRow
                    label="company"
                    value={workspace?.name ?? "—"}
                  />
                  <InfoRow
                    label="country"
                    value={workspace?.country ?? "—"}
                  />
                  <InfoRow
                    label="currency"
                    value={workspace?.currency ?? "—"}
                  />
                  <InfoRow
                    label="status"
                    value={workspace?.status ?? "—"}
                  />
                  <InfoRow label="signed-in as" value={user?.name ?? "—"} />
                  <InfoRow label="email" value={user?.email ?? "—"} />
                  <InfoRow label="phone" value={user?.phone ?? "—"} />
                  <InfoRow
                    label="active branch"
                    value={
                      branch?.name
                        ? `${branch.name}${branch.address ? ` · ${branch.address}` : ""}`
                        : "account-wide"
                    }
                  />
                </dl>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <SettingsModal
        open={modalOpen}
        title={editingId ? "Edit loan type" : "New loan type"}
        subtitle={`${currentWizard?.label ?? "Basics"} · step ${wizardStep + 1} of ${WIZARD_STEPS.length}`}
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
            {wizardStep > 0 ? (
              <button
                type="button"
                className="btn btn-ghost h-9 px-3 text-xs"
                onClick={goBackStep}
                disabled={saving}
              >
                Back
              </button>
            ) : null}
            {!isLastWizardStep ? (
              <button
                type="button"
                className="btn btn-primary h-9 px-4 text-xs"
                onClick={goNextStep}
                disabled={saving}
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                form="loan-template-form"
                className="btn btn-primary h-9 px-4 text-xs"
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                {editingId ? "Save changes" : "Create loan type"}
              </button>
            )}
          </>
        }
      >
        <form
          id="loan-template-form"
          onSubmit={saveTemplate}
          className="space-y-3"
        >
          <WizardStepIndicator stepIndex={wizardStep} />
          {wizardError ? (
            <p className="text-xs font-semibold text-red-600">{wizardError}</p>
          ) : null}

          {currentWizard?.id === "basics" ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <TextField
                label="loan type name"
                value={form.name}
                onChange={(value) => updateForm("name", value)}
                placeholder="e.g. 30-day working capital"
                required
                compact
              />
              <div className="hidden sm:block" />
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-[var(--midnight-navy)]">
                  description
                </span>
                <textarea
                  className="min-h-12 w-full border border-[var(--line)] bg-white px-2.5 py-1.5 text-sm text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] focus:shadow-[inset_0_0_0_1px_var(--forest-emerald)]"
                  value={form.description}
                  onChange={(event) =>
                    updateForm("description", event.target.value)
                  }
                  placeholder="short description for agents"
                />
              </label>
              <TextField
                label="min loan amount"
                value={form.minLoanAmount}
                onChange={(value) => updateForm("minLoanAmount", value)}
                placeholder="optional"
                compact
              />
              <TextField
                label="max loan amount"
                value={form.maxLoanAmount}
                onChange={(value) => updateForm("maxLoanAmount", value)}
                placeholder="optional"
                compact
              />
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-[var(--midnight-navy)]">
                  notes
                </span>
                <textarea
                  className="min-h-11 w-full border border-[var(--line)] bg-white px-2.5 py-1.5 text-sm text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] focus:shadow-[inset_0_0_0_1px_var(--forest-emerald)]"
                  value={form.notes}
                  onChange={(event) => updateForm("notes", event.target.value)}
                  placeholder="notes for your team"
                />
              </label>
            </div>
          ) : null}

          {currentWizard?.id === "interest" ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
            </div>
          ) : null}

          {currentWizard?.id === "term" ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
            </div>
          ) : null}

          {currentWizard?.id === "payment-start" ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                  { value: "SAME_DAY", label: "Same day" },
                  { value: "NEXT_DAY", label: "Next day" },
                  { value: "AFTER_N_DAYS", label: "After some days" },
                ]}
                required
                compact
              />
              {form.paymentStartPolicy === "AFTER_N_DAYS" ? (
                <TextField
                  label="days before payment starts"
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
                  Allow agents to pick a later payment start date
                </span>
              </label>
            </div>
          ) : null}

          {currentWizard?.id === "fines" ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
              <p className="text-[11px] leading-snug text-slate-500 sm:col-span-2">
                Overdue fine = penalty rate % of original principal, charged
                every fine period days after maturity while unpaid.
              </p>
            </div>
          ) : null}

          {currentWizard?.id === "review" ? (
            <div className="space-y-1">
              <ReviewLine label="Name" value={form.name.trim() || "—"} />
              <ReviewLine
                label="Interest"
                value={`${form.interestRatePercent || "—"}% ${interestTypeLabel(form.interestType)}`}
              />
              <ReviewLine
                label="Processing fee"
                value={`${form.processingFeePercent || "—"}%`}
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
        </form>
      </SettingsModal>
    </AppShell>
  );
}
