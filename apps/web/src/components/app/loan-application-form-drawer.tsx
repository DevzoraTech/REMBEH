"use client";

import {
  Check,
  FileImage,
  Loader2,
  PenLine,
  Save,
  Send,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";

type Gender = "MALE" | "FEMALE" | "OTHER";
type Step =
  | "applicant"
  | "loan"
  | "location"
  | "guarantor"
  | "documents"
  | "signatures"
  | "submit";

type MediaItem = {
  id: string;
  type: string;
  mimeType: string;
  fileName: string | null;
  downloadUrl?: string | null;
};

type SignatureItem = {
  id: string;
  signerRole: string;
  signerName: string;
  version: number;
  locked: boolean;
};

type LoanApplicationDetail = {
  id: string;
  status: string;
  clientName: string;
  surname: string | null;
  givenNames: string | null;
  phone: string | null;
  nationalId: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  district: string | null;
  subCounty: string | null;
  parish: string | null;
  village: string | null;
  principalAmount: number | null;
  processingFee: number | null;
  loanProductTemplateId: string | null;
  loanPurpose: string | null;
  collateralType: string | null;
  termsConfirmedAt: string | null;
  paymentStartDate: string | null;
  media: MediaItem[];
  signatures: SignatureItem[];
  guarantor: { fullName: string | null; phone: string | null } | null;
};

type LoanTemplate = {
  id: string;
  name: string;
  interestRatePercent: number;
  durationDays: number;
  termValue: number;
  termUnit: "DAYS" | "WEEKS" | "MONTHS" | "YEARS";
  repaymentFrequency: string;
  processingFeePercent: number;
  minLoanAmount: number | null;
  maxLoanAmount: number | null;
  isActive: boolean;
};

type FormState = {
  surname: string;
  givenNames: string;
  phone: string;
  nationalId: string;
  gender: Gender;
  dateOfBirth: string;
  loanProductTemplateId: string;
  principalAmount: string;
  processingFee: string;
  loanPurpose: string;
  collateralType: string;
  district: string;
  subCounty: string;
  parish: string;
  village: string;
  guarantorName: string;
  guarantorPhone: string;
  termsConfirmed: boolean;
  paymentStartDate: string;
};

type LoanApplicationFormDrawerProps = {
  applicationId: string | null;
  accessToken: string;
  tokenType?: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "applicant", label: "applicant" },
  { id: "loan", label: "loan" },
  { id: "location", label: "location" },
  { id: "guarantor", label: "guarantor" },
  { id: "documents", label: "documents" },
  { id: "signatures", label: "signatures" },
  { id: "submit", label: "submit" },
];

const DOCUMENTS = [
  { type: "PASSPORT", label: "applicant photo" },
  { type: "NIN_FRONT", label: "national id front" },
  { type: "NIN_BACK", label: "national id back" },
  { type: "GUARANTOR_NIN_FRONT", label: "guarantor id front" },
  { type: "GUARANTOR_NIN_BACK", label: "guarantor id back" },
] as const;

const SIGNERS = [
  { role: "APPLICANT", label: "applicant signature" },
  { role: "GUARANTOR", label: "guarantor signature" },
  { role: "OFFICER", label: "officer signature" },
] as const;

const emptyForm: FormState = {
  surname: "",
  givenNames: "",
  phone: "",
  nationalId: "",
  gender: "MALE",
  dateOfBirth: "",
  loanProductTemplateId: "",
  principalAmount: "",
  processingFee: "",
  loanPurpose: "",
  collateralType: "",
  district: "",
  subCounty: "",
  parish: "",
  village: "",
  guarantorName: "",
  guarantorPhone: "",
  termsConfirmed: false,
  paymentStartDate: "",
};

export function LoanApplicationFormDrawer({
  applicationId,
  accessToken,
  tokenType = "Bearer",
  onClose,
  onSubmitted,
}: LoanApplicationFormDrawerProps) {
  const [detail, setDetail] = useState<LoanApplicationDetail | null>(null);
  const [templates, setTemplates] = useState<LoanTemplate[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [step, setStep] = useState<Step>("applicant");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const authHeader = `${tokenType} ${accessToken}`;

  const syncForm = useCallback((application: LoanApplicationDetail) => {
    setForm({
      surname: application.surname ?? "",
      givenNames: application.givenNames ?? "",
      phone: application.phone ?? "",
      nationalId: application.nationalId ?? "",
      gender: application.gender ?? "MALE",
      dateOfBirth: toDateInput(application.dateOfBirth),
      loanProductTemplateId: application.loanProductTemplateId ?? "",
      principalAmount:
        application.principalAmount == null
          ? ""
          : String(application.principalAmount),
      processingFee:
        application.processingFee == null ? "" : String(application.processingFee),
      loanPurpose: application.loanPurpose ?? "",
      collateralType: application.collateralType ?? "",
      district: application.district ?? "",
      subCounty: application.subCounty ?? "",
      parish: application.parish ?? "",
      village: application.village ?? "",
      guarantorName: application.guarantor?.fullName ?? "",
      guarantorPhone: application.guarantor?.phone ?? "",
      termsConfirmed: Boolean(application.termsConfirmedAt),
      paymentStartDate: toDateInput(application.paymentStartDate),
    });
  }, []);

  const loadApplication = useCallback(async () => {
    if (!applicationId) return;
    setLoading(true);
    setError(null);
    try {
      const [applicationResponse, productsResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/loan-applications/${applicationId}`, {
          headers: { Authorization: authHeader },
        }),
        fetch(`${apiBaseUrl}/loan-products`, {
          headers: { Authorization: authHeader },
        }),
      ]);

      const applicationPayload = await readApiJson<{
        application?: LoanApplicationDetail;
        message?: string | string[];
      }>(applicationResponse);
      const productsPayload = await readApiJson<{
        templates?: LoanTemplate[];
        message?: string | string[];
      }>(productsResponse);

      if (!applicationResponse.ok) {
        throw new Error(formatApiError(applicationPayload.message));
      }
      if (!productsResponse.ok) {
        throw new Error(formatApiError(productsPayload.message));
      }

      const application = applicationPayload.application ?? null;
      setDetail(application);
      setTemplates((productsPayload.templates ?? []).filter((item) => item.isActive));
      if (application) syncForm(application);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load form.",
      );
    } finally {
      setLoading(false);
    }
  }, [applicationId, authHeader, syncForm]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      if (!applicationId) {
        setDetail(null);
        setError(null);
        setNotice(null);
        setStep("applicant");
        setForm(emptyForm);
        return;
      }
      void loadApplication();
    }, 0);
    return () => window.clearTimeout(boot);
  }, [applicationId, loadApplication]);

  const selectedTemplate = useMemo(
    () =>
      templates.find((template) => template.id === form.loanProductTemplateId) ??
      null,
    [form.loanProductTemplateId, templates],
  );

  const mediaByType = useMemo(() => {
    const map = new Map<string, MediaItem>();
    for (const item of detail?.media ?? []) map.set(item.type, item);
    return map;
  }, [detail?.media]);

  const signatureByRole = useMemo(() => {
    const map = new Map<string, SignatureItem>();
    for (const item of detail?.signatures ?? []) {
      if (item.locked) map.set(item.signerRole, item);
    }
    return map;
  }, [detail?.signatures]);

  if (!applicationId) return null;

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setPrincipal(value: string) {
    setForm((current) => {
      const next = { ...current, principalAmount: moneyInput(value) };
      const template = templates.find(
        (item) => item.id === current.loanProductTemplateId,
      );
      if (template) {
        next.processingFee = feeForPrincipal(
          next.principalAmount,
          template,
        );
      }
      return next;
    });
  }

  function chooseTemplate(templateId: string) {
    setForm((current) => {
      const template = templates.find((item) => item.id === templateId);
      return {
        ...current,
        loanProductTemplateId: templateId,
        processingFee: template
          ? feeForPrincipal(current.principalAmount, template)
          : current.processingFee,
      };
    });
  }

  async function verifyApplicant() {
    setBusy("verify");
    setError(null);
    setNotice(null);
    try {
      assertFilled([
        [form.surname, "surname"],
        [form.givenNames, "given names"],
        [form.phone, "phone"],
        [form.nationalId, "national id"],
        [form.dateOfBirth, "date of birth"],
      ]);
      const response = await fetch(
        `${apiBaseUrl}/loan-applications/${applicationId}/verify-applicant`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            surname: form.surname.trim(),
            givenNames: form.givenNames.trim(),
            phone: form.phone.trim(),
            nationalId: form.nationalId.trim(),
            gender: form.gender,
            dateOfBirth: form.dateOfBirth,
            country: "UG",
          }),
        },
      );
      const payload = await readApiJson<{
        application?: LoanApplicationDetail;
        message?: string | string[];
      }>(response);
      if (!response.ok) throw new Error(formatApiError(payload.message));
      if (payload.application) {
        setDetail(payload.application);
        syncForm(payload.application);
      }
      setNotice("Applicant verified.");
      setStep("loan");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not verify applicant.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function saveApplication(options?: { quiet?: boolean }) {
    setBusy("save");
    if (!options?.quiet) {
      setError(null);
      setNotice(null);
    }
    try {
      assertFilled([
        [form.loanProductTemplateId, "loan type"],
        [form.principalAmount, "principal"],
        [form.collateralType, "collateral"],
        [form.district, "district"],
        [form.subCounty, "sub-county"],
        [form.parish, "parish"],
        [form.village, "village"],
        [form.guarantorName, "guarantor name"],
        [form.guarantorPhone, "guarantor phone"],
      ]);

      const response = await fetch(`${apiBaseUrl}/loan-applications/${applicationId}`, {
        method: "PATCH",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          surname: form.surname.trim(),
          givenNames: form.givenNames.trim(),
          phone: form.phone.trim(),
          nationalId: form.nationalId.trim(),
          gender: form.gender,
          dateOfBirth: form.dateOfBirth || undefined,
          loanProductTemplateId: form.loanProductTemplateId,
          principalAmount: Number(form.principalAmount),
          processingFee: form.processingFee
            ? Number(form.processingFee)
            : undefined,
          loanPurpose: form.loanPurpose.trim() || undefined,
          collateralType: form.collateralType.trim(),
          district: form.district.trim(),
          subCounty: form.subCounty.trim(),
          parish: form.parish.trim(),
          village: form.village.trim(),
          paymentStartDate: form.paymentStartDate || undefined,
          termsConfirmed: form.termsConfirmed,
          guarantor: {
            fullName: form.guarantorName.trim(),
            phone: form.guarantorPhone.trim(),
          },
        }),
      });
      const payload = await readApiJson<{
        application?: LoanApplicationDetail;
        message?: string | string[];
      }>(response);
      if (!response.ok) throw new Error(formatApiError(payload.message));
      if (payload.application) {
        setDetail(payload.application);
        syncForm(payload.application);
      }
      if (!options?.quiet) setNotice("Saved.");
      return payload.application ?? null;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function uploadMedia(type: string, file: File) {
    setBusy(type);
    setError(null);
    setNotice(null);
    try {
      const extension = file.name.includes(".")
        ? file.name.split(".").pop()
        : extensionForMime(file.type);
      const presignResponse = await fetch(
        `${apiBaseUrl}/loan-applications/${applicationId}/media/presign`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mediaType: type,
            mimeType: file.type || "application/octet-stream",
            fileName: file.name,
            extension,
          }),
        },
      );
      const presign = await readApiJson<{
        uploadUrl?: string;
        storageKey?: string;
        message?: string | string[];
      }>(presignResponse);
      if (!presignResponse.ok) throw new Error(formatApiError(presign.message));
      if (!presign.uploadUrl || !presign.storageKey) {
        throw new Error("Upload was not prepared.");
      }

      const uploadResponse = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("Upload failed.");

      const confirmResponse = await fetch(
        `${apiBaseUrl}/loan-applications/${applicationId}/media/confirm`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mediaType: type,
            storageKey: presign.storageKey,
            mimeType: file.type || "application/octet-stream",
            byteSize: file.size,
            fileName: file.name,
          }),
        },
      );
      const confirmed = await readApiJson<{
        application?: LoanApplicationDetail;
        message?: string | string[];
      }>(confirmResponse);
      if (!confirmResponse.ok) {
        throw new Error(formatApiError(confirmed.message));
      }
      if (confirmed.application) setDetail(confirmed.application);
      setNotice("Document saved.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not upload document.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function uploadSignature(input: {
    role: string;
    signerName: string;
    png: Blob;
    strokes: unknown[];
  }) {
    setBusy(input.role);
    setError(null);
    setNotice(null);
    try {
      const hasExisting = signatureByRole.has(input.role);
      const presignResponse = await fetch(
        `${apiBaseUrl}/loan-applications/${applicationId}/signatures/presign`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            signerRole: input.role,
            ...(hasExisting ? { createNewVersion: true } : {}),
          }),
        },
      );
      const presign = await readApiJson<{
        signature?: { uploadUrl: string; storageKey: string; mimeType: string };
        strokes?: { uploadUrl: string; storageKey: string; mimeType: string };
        metadata?: { uploadUrl: string; storageKey: string; mimeType: string };
        message?: string | string[];
      }>(presignResponse);
      if (!presignResponse.ok) throw new Error(formatApiError(presign.message));
      if (!presign.signature || !presign.strokes || !presign.metadata) {
        throw new Error("Signature was not prepared.");
      }

      const signedAt = new Date().toISOString();
      const metadata = {
        signerName: input.signerName,
        signerRole: input.role,
        timestamp: signedAt,
      };
      const strokesBlob = new Blob([JSON.stringify({ strokes: input.strokes })], {
        type: "application/json",
      });
      const metadataBlob = new Blob([JSON.stringify(metadata)], {
        type: "application/json",
      });

      await Promise.all([
        putBlob(presign.signature.uploadUrl, input.png, "image/png"),
        putBlob(presign.strokes.uploadUrl, strokesBlob, "application/json"),
        putBlob(presign.metadata.uploadUrl, metadataBlob, "application/json"),
      ]);

      const [pngHash, strokesHash] = await Promise.all([
        hashBlob(input.png),
        hashBlob(strokesBlob),
      ]);

      const confirmResponse = await fetch(
        `${apiBaseUrl}/loan-applications/${applicationId}/signatures/confirm`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            signerRole: input.role,
            signatureStorageKey: presign.signature.storageKey,
            strokesStorageKey: presign.strokes.storageKey,
            metadataStorageKey: presign.metadata.storageKey,
            signatureByteSize: input.png.size,
            strokesByteSize: strokesBlob.size,
            metadataByteSize: metadataBlob.size,
            pngContentHash: pngHash,
            strokesContentHash: strokesHash,
            signerName: input.signerName,
            signedAt,
            metadata,
            ...(hasExisting ? { createNewVersion: true } : {}),
          }),
        },
      );
      const confirmed = await readApiJson<{
        application?: LoanApplicationDetail;
        message?: string | string[];
      }>(confirmResponse);
      if (!confirmResponse.ok) {
        throw new Error(formatApiError(confirmed.message));
      }
      if (confirmed.application) setDetail(confirmed.application);
      setNotice("Signature saved.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save signature.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitApplication() {
    setError(null);
    setNotice(null);
    const saved = await saveApplication({ quiet: true });
    if (!saved) return;
    setBusy("submit");
    try {
      const response = await fetch(
        `${apiBaseUrl}/loan-applications/${applicationId}/submit`,
        {
          method: "POST",
          headers: { Authorization: authHeader },
        },
      );
      const payload = await readApiJson<{
        application?: LoanApplicationDetail;
        message?: string | string[];
      }>(response);
      if (!response.ok) throw new Error(formatApiError(payload.message));
      if (payload.application) setDetail(payload.application);
      setNotice("Loan submitted.");
      onSubmitted?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close loan form"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-5xl flex-col border-l border-[var(--line)] bg-[var(--soft-ivory)] shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] bg-white px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[var(--midnight-navy)]">
              New loan
            </h2>
            <p className="truncate text-xs text-slate-500">
              {detail?.clientName || "loan application"} ·{" "}
              {detail?.status?.toLowerCase() || "draft"}
            </p>
          </div>
          <button
            type="button"
            className="grid size-8 place-items-center border border-[var(--line)] bg-white"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[180px_1fr]">
          <nav className="border-b border-[var(--line)] bg-[#eef3f0] p-2 lg:border-b-0 lg:border-r">
            <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
              {STEPS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`h-9 px-3 text-left text-xs font-bold ${
                    step === item.id
                      ? "bg-[var(--midnight-navy)] text-white"
                      : "bg-white text-slate-600 hover:bg-[var(--soft-mist)]"
                  }`}
                  onClick={() => setStep(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>

          <div className="min-h-0 overflow-y-auto px-4 py-4">
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Loading form…
              </p>
            ) : null}
            {error ? (
              <p className="mb-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="mb-3 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-[var(--forest-emerald)]">
                {notice}
              </p>
            ) : null}

            {step === "applicant" ? (
              <Section title="applicant">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="surname" value={form.surname} onChange={(value) => setField("surname", value)} />
                  <Field label="given names" value={form.givenNames} onChange={(value) => setField("givenNames", value)} />
                  <Field label="phone" value={form.phone} onChange={(value) => setField("phone", value)} />
                  <Field label="national id" value={form.nationalId} onChange={(value) => setField("nationalId", value)} />
                  <label className="grid gap-1 text-xs font-semibold text-slate-600">
                    gender
                    <select
                      value={form.gender}
                      onChange={(event) =>
                        setField("gender", event.target.value as Gender)
                      }
                      className="h-10 border border-[var(--line)] bg-white px-3 text-sm font-normal text-[var(--midnight-navy)] outline-none"
                    >
                      <option value="MALE">male</option>
                      <option value="FEMALE">female</option>
                      <option value="OTHER">other</option>
                    </select>
                  </label>
                  <Field
                    type="date"
                    label="date of birth"
                    value={form.dateOfBirth}
                    onChange={(value) => setField("dateOfBirth", value)}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy === "verify"}
                    onClick={() => void verifyApplicant()}
                  >
                    {busy === "verify" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Verify applicant
                  </button>
                  <StatusPill ok={detail?.status === "VERIFIED" || detail?.status === "SUBMITTED"} label="verified" />
                </div>
              </Section>
            ) : null}

            {step === "loan" ? (
              <Section title="loan">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-600">
                    loan type
                    <select
                      value={form.loanProductTemplateId}
                      onChange={(event) => chooseTemplate(event.target.value)}
                      className="h-10 border border-[var(--line)] bg-white px-3 text-sm font-normal text-[var(--midnight-navy)] outline-none"
                    >
                      <option value="">choose loan type</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="principal"
                    value={form.principalAmount}
                    onChange={setPrincipal}
                  />
                  <Field
                    label="processing fee"
                    value={form.processingFee}
                    onChange={(value) =>
                      setField("processingFee", moneyInput(value))
                    }
                  />
                  <Field
                    label="payment starts"
                    type="date"
                    value={form.paymentStartDate}
                    onChange={(value) => setField("paymentStartDate", value)}
                  />
                  <Field
                    label="loan purpose"
                    value={form.loanPurpose}
                    onChange={(value) => setField("loanPurpose", value)}
                  />
                  <Field
                    label="collateral"
                    value={form.collateralType}
                    onChange={(value) => setField("collateralType", value)}
                  />
                </div>
                {selectedTemplate ? (
                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                    <Mini label="rate" value={`${selectedTemplate.interestRatePercent}%`} />
                    <Mini label="period" value={termLabel(selectedTemplate)} />
                    <Mini label="repayment" value={selectedTemplate.repaymentFrequency.toLowerCase().replaceAll("_", " ")} />
                  </div>
                ) : null}
              </Section>
            ) : null}

            {step === "location" ? (
              <Section title="location">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="district" value={form.district} onChange={(value) => setField("district", value)} />
                  <Field label="sub-county" value={form.subCounty} onChange={(value) => setField("subCounty", value)} />
                  <Field label="parish" value={form.parish} onChange={(value) => setField("parish", value)} />
                  <Field label="village" value={form.village} onChange={(value) => setField("village", value)} />
                </div>
              </Section>
            ) : null}

            {step === "guarantor" ? (
              <Section title="guarantor">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="name" value={form.guarantorName} onChange={(value) => setField("guarantorName", value)} />
                  <Field label="phone" value={form.guarantorPhone} onChange={(value) => setField("guarantorPhone", value)} />
                </div>
              </Section>
            ) : null}

            {step === "documents" ? (
              <Section title="documents">
                <div className="grid gap-3 md:grid-cols-2">
                  {DOCUMENTS.map((doc) => (
                    <DocumentUpload
                      key={doc.type}
                      label={doc.label}
                      busy={busy === doc.type}
                      media={mediaByType.get(doc.type)}
                      onChange={(file) => void uploadMedia(doc.type, file)}
                    />
                  ))}
                </div>
              </Section>
            ) : null}

            {step === "signatures" ? (
              <Section title="signatures">
                <div className="grid gap-3 xl:grid-cols-3">
                  {SIGNERS.map((signer) => (
                    <SignaturePad
                      key={signer.role}
                      label={signer.label}
                      role={signer.role}
                      signerName={defaultSignerName(signer.role, form)}
                      existing={signatureByRole.get(signer.role)}
                      busy={busy === signer.role}
                      onSave={(input) => void uploadSignature(input)}
                    />
                  ))}
                </div>
              </Section>
            ) : null}

            {step === "submit" ? (
              <Section title="submit">
                <div className="space-y-4">
                  <label className="flex items-start gap-2 text-sm font-semibold text-[var(--midnight-navy)]">
                    <input
                      type="checkbox"
                      checked={form.termsConfirmed}
                      onChange={(event) =>
                        setField("termsConfirmed", event.target.checked)
                      }
                      className="mt-1"
                    />
                    terms confirmed
                  </label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <StatusPill ok={detail?.status === "VERIFIED" || detail?.status === "SUBMITTED"} label="applicant verified" />
                    <StatusPill ok={DOCUMENTS.every((doc) => mediaByType.has(doc.type))} label="documents ready" />
                    <StatusPill ok={SIGNERS.every((signer) => signatureByRole.has(signer.role))} label="signatures ready" />
                  </div>
                </div>
              </Section>
            ) : null}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] bg-white px-4 py-3">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy === "save"}
            onClick={() => void saveApplication()}
          >
            {busy === "save" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy === "submit" || !form.termsConfirmed}
            onClick={() => void submitApplication()}
          >
            {busy === "submit" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Give loan
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
      <header className="border-b border-[var(--line)] bg-[#eef3f0] px-4 py-3">
        <h3 className="text-sm font-bold text-[var(--midnight-navy)]">
          {title}
        </h3>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 border border-[var(--line)] bg-white px-3 text-sm font-normal text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)]"
      />
    </label>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--line)] bg-[#fbfdfc] px-3 py-2">
      <p className="text-[10px] font-semibold lowercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-bold text-[var(--midnight-navy)]">{value}</p>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 border px-2 py-1 text-[10px] font-bold lowercase tracking-[0.04em] ${
        ok
          ? "border-emerald-200 bg-emerald-50 text-[var(--forest-emerald)]"
          : "border-[var(--line)] bg-[var(--soft-mist)] text-slate-500"
      }`}
    >
      {ok ? <Check className="size-3" /> : null}
      {label}
    </span>
  );
}

function DocumentUpload({
  label,
  media,
  busy,
  onChange,
}: {
  label: string;
  media?: MediaItem;
  busy: boolean;
  onChange: (file: File) => void;
}) {
  const isImage = Boolean(
    media?.downloadUrl && media.mimeType.startsWith("image/"),
  );
  return (
    <div className="border border-[var(--line)] bg-[#fbfdfc]">
      <div className="relative flex h-36 items-center justify-center border-b border-[var(--line)] bg-white">
        {isImage ? (
          <Image
            src={media?.downloadUrl ?? ""}
            alt={label}
            fill
            unoptimized
            className="object-contain"
          />
        ) : media ? (
          <FileImage className="size-8 text-[var(--forest-emerald)]" />
        ) : (
          <Upload className="size-8 text-slate-400" />
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--midnight-navy)]">
            {label}
          </p>
          <p className="text-[11px] text-slate-500">
            {media ? "saved" : "not added"}
          </p>
        </div>
        <label className="btn btn-ghost h-8 cursor-pointer px-2 text-[11px]">
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          Upload
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            disabled={busy}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0];
              if (file) onChange(file);
              event.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}

function SignaturePad({
  label,
  role,
  signerName,
  existing,
  busy,
  onSave,
}: {
  label: string;
  role: string;
  signerName: string;
  existing?: SignatureItem;
  busy: boolean;
  onSave: (input: {
    role: string;
    signerName: string;
    png: Blob;
    strokes: unknown[];
  }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const strokesRef = useRef<Array<Array<{ x: number; y: number }>>>([]);
  const [signedName, setSignedName] = useState(signerName);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function begin(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const nextPoint = point(event);
    strokesRef.current.push([nextPoint]);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(nextPoint.x, nextPoint.y);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const nextPoint = point(event);
    strokesRef.current[strokesRef.current.length - 1]?.push(nextPoint);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#14213d";
    ctx.lineTo(nextPoint.x, nextPoint.y);
    ctx.stroke();
  }

  function end(event: PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current = [];
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await canvasToBlob(canvas);
    if (!blob) return;
    onSave({
      role,
      signerName: signedName.trim(),
      png: blob,
      strokes: strokesRef.current,
    });
  }

  return (
    <div className="border border-[var(--line)] bg-[#fbfdfc]">
      <div className="border-b border-[var(--line)] px-3 py-2">
        <p className="text-sm font-bold text-[var(--midnight-navy)]">
          {label}
        </p>
        <p className="text-[11px] text-slate-500">
          {existing ? `saved v${existing.version}` : "not signed"}
        </p>
      </div>
      <div className="p-3">
        <input
          value={signedName}
          onChange={(event) => setSignedName(event.target.value)}
          className="mb-2 h-9 w-full border border-[var(--line)] bg-white px-2 text-xs font-semibold text-[var(--midnight-navy)] outline-none"
        />
        <canvas
          ref={canvasRef}
          width={520}
          height={220}
          className="h-36 w-full touch-none border border-[var(--line)] bg-white"
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn btn-ghost h-8 flex-1 text-[11px]" onClick={clear}>
            Clear
          </button>
          <button
            type="button"
            className="btn btn-primary h-8 flex-1 text-[11px]"
            disabled={busy || signedName.trim().length < 2}
            onClick={() => void save()}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <PenLine className="size-3.5" />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function moneyInput(value: string) {
  return value.replace(/[^\d.]/g, "");
}

function feeForPrincipal(principal: string, template: LoanTemplate) {
  const amount = Number(principal);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return String(Math.round(amount * (template.processingFeePercent / 100)));
}

function termLabel(template: LoanTemplate) {
  const unit = template.termUnit.toLowerCase();
  return `${template.termValue} ${unit}`;
}

function defaultSignerName(role: string, form: FormState) {
  if (role === "APPLICANT") {
    return [form.givenNames, form.surname].filter(Boolean).join(" ");
  }
  if (role === "GUARANTOR") return form.guarantorName;
  return "";
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "application/pdf") return "pdf";
  return "bin";
}

function assertFilled(fields: Array<[string, string]>) {
  const missing = fields
    .filter(([value]) => !value.trim())
    .map(([, label]) => label);
  if (missing.length > 0) {
    throw new Error(`Missing: ${missing.join(", ")}.`);
  }
}

async function putBlob(url: string, blob: Blob, mimeType: string) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: blob,
  });
  if (!response.ok) throw new Error("Upload failed.");
}

async function hashBlob(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}
