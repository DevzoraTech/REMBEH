"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Banknote,
  Calculator,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileText,
  Hourglass,
  Loader2,
  MoreVertical,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import { formatMoneyAmount } from "../../app/owner/owner-common";
import { AgentPhoto } from "./agent-photo";
import { Money } from "./money";
import { StepTimeline, type StepTone } from "./step-timeline";

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
  signedAt: string;
  version: number;
  locked: boolean;
  signatureDownloadUrl?: string | null;
};

type ApplicationDetail = {
  id: string;
  status: string;
  loanId?: string | null;
  loanStatus?: string | null;
  clientName: string;
  surname: string | null;
  givenNames: string | null;
  phone: string | null;
  nationalId: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth: string | null;
  district: string | null;
  subCounty: string | null;
  parish: string | null;
  village: string | null;
  principalAmount: number | null;
  interestRatePercent: number | null;
  durationDays: number | null;
  processingFee: number | null;
  collateralType: string | null;
  templateName?: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  synced: boolean;
  officerName?: string | null;
  officerPublicId?: string | null;
  agentPhotoUrl?: string | null;
  guarantor: { fullName: string | null; phone: string | null } | null;
  media: MediaItem[];
  signatures: SignatureItem[];
  signedAgreementDownloadUrl?: string | null;
  pricing: {
    interestAmount: number;
    totalRepayable: number;
    processingFee: number;
  } | null;
};

type PaymentHistoryItem = {
  id: string;
  amount: number;
  method: string;
  paidAt: string;
  recordedByName: string;
  recordedByPublicId: string | null;
  note: string | null;
};

type LoanCollectionDetail = {
  loanId: string;
  fullName: string;
  phone: string;
  registeredBy: string;
  registeredByPublicId: string | null;
  agentPhotoUrl: string | null;
  paidAmount: number;
  loanAmount: number;
  outstanding: number;
  loanStartDate: string;
  paymentHistory: PaymentHistoryItem[];
};

type DetailTab = "summary" | "parties" | "activity";

type LoanContext = {
  id: string;
  borrowerName: string;
  phone: string;
  loanTypeName: string | null;
  principal: number;
  currency: string;
  disbursedAt: string | null;
  officerName: string | null;
  officerPublicId: string | null;
  balance?: number | null;
  paidAmount?: number | null;
  totalRepayable?: number | null;
  openingBalance?: number | null;
  expectedInterest?: number | null;
  processingFee?: number | null;
  installmentAmount?: number | null;
  overdueDays?: number | null;
  nextDueDate?: string | null;
  durationDays?: number | null;
  dueDate?: string | null;
  status?: string | null;
};

type ApplicationDetailDrawerProps = {
  applicationId: string | null;
  accessToken: string;
  tokenType?: string;
  customerId?: string | null;
  loanDisplayId?: string | null;
  loanStatusLabel?: string | null;
  loan?: LoanContext | null;
  canRecordRepayment?: boolean;
  onRecordRepayment?: () => void;
  refreshKey?: number;
  /** Stack above another side panel (e.g. borrower details). */
  elevated?: boolean;
  onClose: () => void;
};

const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "parties", label: "Parties" },
  { id: "activity", label: "Activity" },
];

export function ApplicationDetailDrawer({
  applicationId,
  accessToken,
  tokenType = "Bearer",
  customerId,
  loanDisplayId,
  loanStatusLabel,
  loan,
  canRecordRepayment = false,
  onRecordRepayment,
  refreshKey = 0,
  elevated = false,
  onClose,
}: ApplicationDetailDrawerProps) {
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [collectionDetail, setCollectionDetail] =
    useState<LoanCollectionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("summary");
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(
    null,
  );
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [viewingPdf, setViewingPdf] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function refreshDetailAfterAgreement() {
    if (!applicationId) return;
    try {
      const response = await fetch(
        `${apiBaseUrl}/loan-applications/${applicationId}`,
        {
          headers: {
            Authorization: `${tokenType} ${accessToken}`,
          },
        },
      );
      const payload = await readApiJson<{
        application?: ApplicationDetail;
        message?: string | string[];
      }>(response);
      if (response.ok) {
        setDetail(payload.application ?? null);
      }
    } catch {
      // The download already completed; the stored link can be refreshed later.
    }
  }

  async function fetchAgreementBlob(inline: boolean) {
    if (!applicationId) {
      throw new Error("No application selected.");
    }
    const response = await fetch(
      `${apiBaseUrl}/loan-applications/${applicationId}/agreement.pdf${
        inline ? "?inline=1" : ""
      }`,
      {
        headers: {
          Authorization: `${tokenType} ${accessToken}`,
        },
      },
    );
    if (!response.ok) {
      let message = "Could not load agreement PDF.";
      try {
        const payload = (await response.json()) as {
          message?: string | string[];
        };
        message = formatApiError(payload.message);
      } catch {
        // non-JSON error body
      }
      throw new Error(message);
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition");
    const match = disposition?.match(/filename="?([^"]+)"?/i);
    return {
      blob,
      fileName: match?.[1] ?? `loan-agreement-${applicationId}.pdf`,
    };
  }

  async function viewAgreementPdf() {
    if (!applicationId || viewingPdf || downloadingPdf) return;
    setViewingPdf(true);
    setDownloadError(null);
    setMenuOpen(false);
    try {
      if (detail?.signedAgreementDownloadUrl) {
        window.open(detail.signedAgreementDownloadUrl, "_blank", "noopener,noreferrer");
        return;
      }
      const { blob } = await fetchAgreementBlob(true);
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      await refreshDetailAfterAgreement();
    } catch (caught) {
      setDownloadError(
        caught instanceof Error
          ? caught.message
          : "Could not open agreement PDF.",
      );
    } finally {
      setViewingPdf(false);
    }
  }

  async function downloadAgreementPdf() {
    if (!applicationId || downloadingPdf || viewingPdf) return;
    setDownloadingPdf(true);
    setDownloadError(null);
    setMenuOpen(false);
    try {
      const { blob, fileName } = await fetchAgreementBlob(false);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      await refreshDetailAfterAgreement();
    } catch (caught) {
      setDownloadError(
        caught instanceof Error
          ? caught.message
          : "Could not download agreement PDF.",
      );
    } finally {
      setDownloadingPdf(false);
    }
  }

  useEffect(() => {
    setTab("summary");
  }, [applicationId]);

  useEffect(() => {
    let cancelled = false;
    const boot = window.setTimeout(() => {
      if (!applicationId) {
        setDetail(null);
        setCollectionDetail(null);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      setMenuOpen(false);
      setDownloadError(null);

      void (async () => {
        try {
          const appResponse = await fetch(
            `${apiBaseUrl}/loan-applications/${applicationId}`,
            {
              headers: {
                Authorization: `${tokenType} ${accessToken}`,
              },
            },
          );
          const appPayload = await readApiJson<{
            application?: ApplicationDetail;
            message?: string | string[];
          }>(appResponse);
          if (!appResponse.ok) {
            throw new Error(formatApiError(appPayload.message));
          }
          const application = appPayload.application ?? null;
          if (cancelled) return;
          setDetail(application);

          const loanId = loan?.id || application?.loanId || null;
          if (loanId) {
            try {
              const loanResponse = await fetch(
                `${apiBaseUrl}/collections/loans/${loanId}`,
                {
                  headers: {
                    Authorization: `${tokenType} ${accessToken}`,
                  },
                },
              );
              const loanPayload = await readApiJson<{
                detail?: LoanCollectionDetail;
                message?: string | string[];
              }>(loanResponse);
              if (loanResponse.ok && !cancelled) {
                setCollectionDetail(loanPayload.detail ?? null);
              } else if (!cancelled) {
                setCollectionDetail(null);
              }
            } catch {
              if (!cancelled) setCollectionDetail(null);
            }
          } else if (!cancelled) {
            setCollectionDetail(null);
          }
        } catch (caught) {
          if (!cancelled) {
            setError(
              caught instanceof Error
                ? caught.message
                : "Could not load application.",
            );
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(boot);
    };
  }, [applicationId, accessToken, tokenType, loan?.id, refreshKey]);

  const activities = useMemo(
    () =>
      buildLoanActivities({
        detail,
        collectionDetail,
        loan,
      }),
    [collectionDetail, detail, loan],
  );

  if (!applicationId) return null;

  const rootZ = elevated ? "z-[55]" : "z-50";
  const previewZ = elevated ? "z-[70]" : "z-[60]";

  const statusLabel =
    loanStatusLabel ||
    (detail ? formatPrimaryStatus(detail) : null);
  const titleId =
    loanDisplayId ||
    (detail?.loanId ? shortId(detail.loanId) : null) ||
    (loan?.id ? shortId(loan.id) : null) ||
    shortId(applicationId);
  const borrowerName =
    loan?.borrowerName || detail?.clientName || collectionDetail?.fullName || "Loading…";
  const phone =
    loan?.phone || detail?.phone || collectionDetail?.phone || "—";
  const loanType =
    loan?.loanTypeName ||
    detail?.templateName ||
    detail?.collateralType ||
    "Loan";
  const issuedAt =
    loan?.disbursedAt ||
    collectionDetail?.loanStartDate ||
    detail?.submittedAt ||
    null;
  const officerName =
    loan?.officerName ||
    detail?.officerName ||
    collectionDetail?.registeredBy ||
    null;
  const officerPublicId =
    loan?.officerPublicId ||
    detail?.officerPublicId ||
    collectionDetail?.registeredByPublicId ||
    null;
  const passport = detail?.media.find((item) => item.type === "PASSPORT");

  return (
    <div className={`fixed inset-0 ${rootZ} flex justify-end bg-[rgba(8,15,31,0.36)] backdrop-blur-[2px]`}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close detail"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-[760px] flex-col border-l border-[#e6ebf0] bg-white shadow-[-18px_0_44px_rgba(15,23,42,0.18)]">
        <header className="px-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-mono text-[12px] font-semibold tracking-[-0.01em] text-slate-500">
                  {titleId}
                </p>
                {statusLabel ? <StatusPill label={statusLabel} /> : null}
              </div>
              <div className="mt-3 flex min-w-0 items-center gap-3">
                <PartyAvatar
                  src={passport?.downloadUrl}
                  name={borrowerName}
                  onPreview={
                    passport?.downloadUrl
                      ? () =>
                          setPreview({
                            src: passport.downloadUrl!,
                            alt: "Borrower photo",
                          })
                      : undefined
                  }
                />
                <div className="min-w-0">
                  <h2 className="truncate text-[20px] font-bold tracking-[-0.03em] text-[#0b1220]">
                    {borrowerName}
                  </h2>
                  <p className="mt-0.5 truncate text-[13px] font-medium text-slate-500">
                    {phone}
                  </p>
                </div>
              </div>
            </div>
            <div className="relative flex items-start gap-1">
              <button
                type="button"
                className="grid size-9 place-items-center rounded-lg text-[#0b1220] transition hover:bg-[#f4f7f6]"
                aria-label="Loan actions"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreVertical className="size-4" />
              </button>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-lg text-[#0b1220] transition hover:bg-[#f4f7f6]"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-10 z-20 min-w-[180px] overflow-hidden rounded-xl border border-[#e6ebf0] bg-white py-1 shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
                >
                  {customerId ? (
                    <Link
                      href={`/clients/${customerId}`}
                      role="menuitem"
                      className="block px-3 py-2 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6]"
                      onClick={() => setMenuOpen(false)}
                    >
                      View borrower profile
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6] disabled:opacity-50"
                    disabled={viewingPdf || downloadingPdf}
                    onClick={() => void viewAgreementPdf()}
                  >
                    {viewingPdf ? "Opening agreement…" : "View loan agreement"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6] disabled:opacity-50"
                    disabled={downloadingPdf || viewingPdf}
                    onClick={() => void downloadAgreementPdf()}
                  >
                    {downloadingPdf
                      ? "Downloading…"
                      : "Download loan agreement"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-[#f4f7f6] px-3 py-2.5 text-[12px] font-medium text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5 text-slate-400" />
              Issued: {issuedAt ? formatShortDate(issuedAt) : "—"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-3.5 text-slate-400" />
              {loanType ? titleCase(loanType) : "Loan"}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <UserRound className="size-3.5 shrink-0 text-slate-400" />
              <span className="truncate">
                {officerName || "—"}
                {officerPublicId ? ` (${officerPublicId})` : ""}
              </span>
            </span>
          </div>

          <div className="mt-4 -mx-5 flex gap-6 border-b border-[#edf1f5] px-5">
            {TABS.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`-mb-px border-b-2 pb-2.5 text-[13px] font-semibold transition ${
                    active
                      ? "border-[#07885f] text-[#07885f]"
                      : "border-transparent text-slate-500 hover:text-[#0b1220]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading detail…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : detail ? (
            <ApplicationDetailBody
              detail={detail}
              tab={tab}
              customerId={customerId}
              loan={loan}
              collectionDetail={collectionDetail}
              activities={activities}
              onPreview={setPreview}
            />
          ) : null}
        </div>

        {loan ? (
          <div className="shrink-0 border-t border-[#edf1f5] bg-white px-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={!canRecordRepayment || !onRecordRepayment}
                onClick={() => onRecordRepayment?.()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#07885f] px-3 text-[13px] font-semibold text-white transition hover:bg-[#067352] disabled:cursor-not-allowed disabled:opacity-55"
              >
                <CreditCard className="size-4 shrink-0" />
                Record Repayment
              </button>
              <button
                type="button"
                disabled={viewingPdf || downloadingPdf}
                onClick={() => void viewAgreementPdf()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#07885f] bg-white px-3 text-[13px] font-semibold text-[#07885f] transition hover:bg-[#f0faf5] disabled:opacity-55"
              >
                <FileText className="size-4 shrink-0" />
                {viewingPdf ? "Opening…" : "View Agreement"}
              </button>
            </div>
            {downloadError ? (
              <p className="mt-2 text-xs text-rose-600">{downloadError}</p>
            ) : null}
          </div>
        ) : null}
      </aside>

      {preview ? (
        <div className={`fixed inset-0 ${previewZ} flex items-center justify-center bg-black/80 p-4`}>
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close preview"
            onClick={() => setPreview(null)}
          />
          <div className="relative z-10 max-h-[90vh] max-w-[92vw]">
            <button
              type="button"
              className="absolute -right-2 -top-2 rounded-full bg-white p-2 shadow"
              onClick={() => setPreview(null)}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.src}
              alt={preview.alt}
              className="max-h-[85vh] max-w-[90vw] object-contain bg-white"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

type ActivityItem = {
  id: string;
  title: string;
  description: string;
  badge: string;
  tone: StepTone;
  icon: "payment" | "submission" | "disbursement";
  at: string;
};

function ApplicationDetailBody({
  detail,
  tab,
  customerId,
  loan,
  collectionDetail,
  activities,
  onPreview,
}: {
  detail: ApplicationDetail;
  tab: DetailTab;
  customerId?: string | null;
  loan?: LoanContext | null;
  collectionDetail: LoanCollectionDetail | null;
  activities: ActivityItem[];
  onPreview: (preview: { src: string; alt: string }) => void;
}) {
  const uploads = detail.media.filter(
    (item) => !isSignatureMediaType(item.type),
  );
  const passport = findMedia(uploads, "PASSPORT");
  const borrowerIds = [
    findMedia(uploads, "NIN_FRONT"),
    findMedia(uploads, "NIN_BACK"),
  ].filter(Boolean) as MediaItem[];
  const guarantorIds = [
    findMedia(uploads, "GUARANTOR_NIN_FRONT"),
    findMedia(uploads, "GUARANTOR_NIN_BACK"),
  ].filter(Boolean) as MediaItem[];
  const borrowerSig = findSignature(detail.signatures, "APPLICANT");
  const guarantorSig = findSignature(detail.signatures, "GUARANTOR");
  const officerSig = findSignature(detail.signatures, "OFFICER");
  const address = [
    detail.village,
    detail.parish,
    detail.subCounty,
    detail.district,
  ]
    .filter(Boolean)
    .join(", ");

  if (tab === "summary") {
    const currency = loan?.currency || "UGX";
    const outstanding =
      collectionDetail?.outstanding ?? loan?.balance ?? null;
    const paidAmount =
      collectionDetail?.paidAmount ?? loan?.paidAmount ?? null;
    const totalRepayable =
      collectionDetail?.loanAmount ??
      loan?.totalRepayable ??
      (typeof loan?.openingBalance === "number"
        ? loan.openingBalance
        : null) ??
      detail.pricing?.totalRepayable ??
      null;
    const repaidPct =
      totalRepayable != null && totalRepayable > 0 && paidAmount != null
        ? Math.min(100, Math.round((paidAmount / totalRepayable) * 100))
        : 0;
    const overdueDays = Math.max(0, loan?.overdueDays ?? 0);
    const isClosed =
      loan?.status === "CLOSED" ||
      loan?.status === "WRITTEN_OFF" ||
      (typeof outstanding === "number" && outstanding <= 0);
    const repaymentOnSchedule = isClosed || overdueDays < 1;
    const nextDue =
      loan?.nextDueDate ||
      loan?.dueDate ||
      null;
    const installment =
      loan?.installmentAmount ??
      (detail.durationDays && totalRepayable
        ? Math.round(totalRepayable / detail.durationDays)
        : null);
    const durationDays = loan?.durationDays ?? detail.durationDays;
    const daysRemaining = resolveDaysRemaining({
      dueDate: loan?.dueDate ?? null,
      durationDays,
      disbursedAt: loan?.disbursedAt ?? collectionDetail?.loanStartDate ?? null,
      isClosed,
    });
    const lastPayment = collectionDetail?.paymentHistory?.[0] ?? null;
    const processingFee =
      loan?.processingFee ??
      detail.processingFee ??
      detail.pricing?.processingFee ??
      null;
    const interestAmount =
      loan?.expectedInterest ?? detail.pricing?.interestAmount ?? null;
    const principal = loan?.principal ?? detail.principalAmount;

    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-[#e6ebf0] bg-white p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.04em] text-slate-500">
            Repayment position
          </h3>
          <div className="mt-3">
            <p className="text-[26px] font-bold tracking-[-0.03em] text-[#0b1220]">
              {outstanding != null ? (
                <>
                  {currency} {formatMoneyAmount(outstanding)}
                  <span className="ml-2 text-[15px] font-semibold text-slate-500">
                    Outstanding
                  </span>
                </>
              ) : (
                "—"
              )}
            </p>
            <p className="mt-1 text-[13px] font-medium text-slate-500">
              {paidAmount != null && totalRepayable != null
                ? `${currency} ${formatMoneyAmount(paidAmount)} of ${currency} ${formatMoneyAmount(totalRepayable)} repaid.`
                : "Repayment progress unavailable."}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#e8eef3]">
                <div
                  className="h-full rounded-full bg-[#07885f] transition-[width]"
                  style={{ width: `${repaidPct}%` }}
                />
              </div>
              <span className="text-[12px] font-semibold tabular-nums text-slate-600">
                {repaidPct}%
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SummaryMetric
              icon={<CalendarDays className="size-3.5" />}
              label="Next due"
              value={nextDue ? formatShortDate(nextDue) : "—"}
            />
            <SummaryMetric
              icon={<Calculator className="size-3.5" />}
              label="Instalment"
              value={
                installment != null
                  ? `${currency} ${formatMoneyAmount(installment)}`
                  : "—"
              }
            />
            <SummaryMetric
              icon={
                repaymentOnSchedule ? (
                  <CheckCircle2 className="size-3.5" />
                ) : (
                  <AlertCircle className="size-3.5" />
                )
              }
              label="Repayment status"
              value={
                repaymentOnSchedule
                  ? "On schedule"
                  : `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`
              }
              valueClassName={
                repaymentOnSchedule ? "text-[#07885f]" : "text-red-600"
              }
              iconClassName={
                repaymentOnSchedule
                  ? "bg-emerald-50 text-[#07885f]"
                  : "bg-red-50 text-red-600"
              }
            />
            <SummaryMetric
              icon={<Hourglass className="size-3.5" />}
              label="Loan period"
              value={
                isClosed
                  ? "Closed"
                  : daysRemaining == null
                    ? durationDays != null
                      ? `${durationDays} days`
                      : "—"
                    : daysRemaining <= 0
                      ? "Ended"
                      : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`
              }
            />
            <SummaryMetric
              icon={<Banknote className="size-3.5" />}
              label="Last payment"
              value={
                lastPayment
                  ? `${currency} ${formatMoneyAmount(lastPayment.amount)} - ${formatShortDate(lastPayment.paidAt)}`
                  : paidAmount != null && paidAmount > 0
                    ? `${currency} ${formatMoneyAmount(paidAmount)}`
                    : "No payments yet"
              }
            />
          </div>
        </section>

        <PartyCard title="Loan Terms">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoLine
              label="Principal"
              value={
                <Money value={principal} currency={currency} />
              }
            />
            <InfoLine
              label="Daily instalment"
              value={
                installment != null ? (
                  <Money value={installment} currency={currency} />
                ) : (
                  "—"
                )
              }
            />
            <InfoLine
              label="Interest rate"
              value={
                detail.interestRatePercent != null
                  ? `${detail.interestRatePercent}%`
                  : "—"
              }
            />
            <InfoLine
              label="Processing fee"
              value={
                processingFee != null ? (
                  <Money value={processingFee} currency={currency} />
                ) : (
                  "—"
                )
              }
            />
            <InfoLine
              label="Interest amount"
              value={
                interestAmount != null ? (
                  <Money value={interestAmount} currency={currency} />
                ) : (
                  "—"
                )
              }
            />
            <InfoLine
              label="Disbursement date"
              value={
                loan?.disbursedAt || collectionDetail?.loanStartDate
                  ? formatShortDate(
                      loan?.disbursedAt ||
                        collectionDetail!.loanStartDate,
                    )
                  : "—"
              }
            />
            <InfoLine
              label="Total repayable"
              value={
                totalRepayable != null ? (
                  <Money value={totalRepayable} currency={currency} />
                ) : (
                  "—"
                )
              }
            />
            <InfoLine
              label="Loan type"
              value={
                loan?.loanTypeName || detail.templateName
                  ? titleCase(loan?.loanTypeName || detail.templateName || "")
                  : "—"
              }
            />
            <InfoLine
              label="Duration"
              value={
                durationDays != null ? `${durationDays} days` : "—"
              }
            />
            <InfoLine
              label="Collateral"
              value={detail.collateralType || "—"}
            />
          </div>
        </PartyCard>
      </div>
    );
  }

  if (tab === "activity") {
    return (
      <StepTimeline
        items={activities.map((event) => ({
          id: event.id,
          title: event.title,
          detail: event.description,
          tone: event.tone,
          badge: event.badge,
          icon:
            event.icon === "payment" ? (
              <Banknote />
            ) : event.icon === "submission" ? (
              <Send />
            ) : (
              <CheckCircle2 />
            ),
          meta: formatDateTime(event.at),
        }))}
        empty={
          <p className="text-sm text-slate-500">No activity recorded yet.</p>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <PartyCard
        title="Borrower"
        action={
          customerId ? (
            <Link
              href={`/clients/${customerId}`}
              className="text-[12px] font-semibold text-[#07885f] hover:underline"
            >
              View borrower profile
            </Link>
          ) : null
        }
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-start gap-3">
            <PartyAvatar
              src={passport?.downloadUrl}
              name={detail.clientName}
              onPreview={
                passport?.downloadUrl
                  ? () =>
                      onPreview({
                        src: passport.downloadUrl!,
                        alt: "Borrower photo",
                      })
                  : undefined
              }
            />
            <div className="min-w-0 space-y-1.5">
              <p className="truncate text-[15px] font-bold text-[#0b1220]">
                {detail.clientName || "—"}
              </p>
              <MetaLine label="Phone" value={detail.phone || "—"} />
              <MetaLine label="NIN" value={detail.nationalId || "—"} />
              <MetaLine label="Address" value={address || "—"} />
            </div>
          </div>
          <PartyEvidence
            docs={borrowerIds}
            signature={borrowerSig}
            onPreview={onPreview}
          />
        </div>
      </PartyCard>

      <PartyCard title="Guarantor">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-start gap-3">
            <PartyAvatar name={detail.guarantor?.fullName || "Guarantor"} />
            <div className="min-w-0 space-y-1.5">
              <p className="truncate text-[15px] font-bold text-[#0b1220]">
                {detail.guarantor?.fullName || "—"}
              </p>
              <MetaLine
                label="Phone"
                value={detail.guarantor?.phone || "—"}
              />
              <MetaLine
                label="ID docs"
                value={
                  guarantorIds.length > 0
                    ? `${guarantorIds.length} on file`
                    : "—"
                }
              />
            </div>
          </div>
          <PartyEvidence
            docs={guarantorIds}
            signature={guarantorSig}
            onPreview={onPreview}
          />
        </div>
      </PartyCard>

      <PartyCard
        title="Issued by (Agent)"
        action={
          detail.officerPublicId ? (
            <Link
              href={`/agents?q=${encodeURIComponent(detail.officerPublicId)}`}
              className="text-[12px] font-semibold text-[#07885f] hover:underline"
            >
              View agent profile
            </Link>
          ) : null
        }
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-start gap-3">
            <AgentPhoto
              src={detail.agentPhotoUrl || collectionDetail?.agentPhotoUrl}
              name={detail.officerName || "Branch officer"}
              publicId={detail.officerPublicId}
              size="lg"
            />
            <div className="min-w-0 space-y-1.5">
              <p className="truncate text-[15px] font-bold text-[#0b1220]">
                {detail.officerName || "Branch officer"}
              </p>
              <MetaLine
                label="Agent ID"
                value={detail.officerPublicId || "—"}
              />
              <MetaLine label="Role" value="Field agent" />
            </div>
          </div>
          <PartyEvidence
            docs={[]}
            signature={officerSig}
            onPreview={onPreview}
          />
        </div>
      </PartyCard>
    </div>
  );
}

function buildLoanActivities({
  detail,
  collectionDetail,
  loan,
}: {
  detail: ApplicationDetail | null;
  collectionDetail: LoanCollectionDetail | null;
  loan?: LoanContext | null;
}): ActivityItem[] {
  const events: ActivityItem[] = [];
  const currency = loan?.currency || "UGX";
  const borrowerName =
    loan?.borrowerName || detail?.clientName || collectionDetail?.fullName || "borrower";
  const officerName =
    loan?.officerName ||
    detail?.officerName ||
    collectionDetail?.registeredBy ||
    "agent";

  for (const payment of collectionDetail?.paymentHistory ?? []) {
    events.push({
      id: `payment-${payment.id}`,
      title: "Repayment recorded",
      description: `${formatMoneyText(payment.amount, currency)} collected by ${payment.recordedByName}.`,
      badge: "Payment",
      tone: "green",
      icon: "payment",
      at: payment.paidAt,
    });
  }

  if (detail?.submittedAt) {
    events.push({
      id: "submitted",
      title: "Loan submitted",
      description: `Submitted from the field by ${officerName}.`,
      badge: "Submission",
      tone: "teal",
      icon: "submission",
      at: detail.submittedAt,
    });
  }

  const issuedAt = loan?.disbursedAt || collectionDetail?.loanStartDate || null;
  const principal = loan?.principal ?? detail?.principalAmount;
  if (issuedAt && principal != null) {
    events.push({
      id: "issued",
      title: "Loan issued",
      description: `${formatMoneyText(principal, currency)} disbursed to ${borrowerName}.`,
      badge: "Disbursement",
      tone: "green",
      icon: "disbursement",
      at: issuedAt,
    });
  }

  return events.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}

function PartyCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8edf2] bg-white shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-[#edf1f5] px-4 py-3">
        <h3 className="text-[13px] font-bold text-[#0b1220]">{title}</h3>
        {action}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function PartyEvidence({
  docs,
  signature,
  onPreview,
}: {
  docs: MediaItem[];
  signature: SignatureItem | null;
  onPreview: (preview: { src: string; alt: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      {docs.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Identity Documents
          </p>
          <div className="flex flex-wrap gap-2">
            {docs.map((item) => (
              <IdentityThumb
                key={item.id}
                item={item}
                onPreview={onPreview}
              />
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
          Signature
        </p>
        <SignatureBox signature={signature} onPreview={onPreview} />
      </div>
    </div>
  );
}

function IdentityThumb({
  item,
  onPreview,
}: {
  item: MediaItem;
  onPreview: (preview: { src: string; alt: string }) => void;
}) {
  const label = mediaLabel(item.type);
  const canPreview =
    Boolean(item.downloadUrl) && item.mimeType.startsWith("image/");

  return (
    <div className="w-[110px]">
      <div className="overflow-hidden rounded-lg border border-[#e6ebf0] bg-[#f7faf8]">
        {canPreview ? (
          <button
            type="button"
            className="block w-full cursor-zoom-in"
            onClick={() =>
              onPreview({
                src: item.downloadUrl!,
                alt: label,
              })
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.downloadUrl!}
              alt={label}
              className="h-[72px] w-[110px] object-cover"
            />
          </button>
        ) : item.downloadUrl ? (
          <a
            href={item.downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="grid h-[72px] w-[110px] place-items-center px-2 text-center text-[10px] font-semibold text-[#07885f]"
          >
            Open file
          </a>
        ) : (
          <div className="grid h-[72px] w-[110px] place-items-center text-[10px] text-slate-400">
            Unavailable
          </div>
        )}
      </div>
      <p className="mt-1 truncate text-[10px] font-semibold text-slate-600">
        {label}
      </p>
    </div>
  );
}

function SignatureBox({
  signature,
  onPreview,
}: {
  signature: SignatureItem | null;
  onPreview: (preview: { src: string; alt: string }) => void;
}) {
  if (!signature) {
    return (
      <div className="grid h-[72px] w-[110px] place-items-center rounded-lg border border-dashed border-[#d9e2ea] bg-[#fbfdfc] text-[10px] text-slate-400">
        No signature
      </div>
    );
  }

  return (
    <div className="w-[110px]">
      <div className="overflow-hidden rounded-lg border border-[#e6ebf0] bg-white">
        {signature.signatureDownloadUrl ? (
          <button
            type="button"
            className="block w-full cursor-zoom-in bg-slate-50"
            onClick={() =>
              onPreview({
                src: signature.signatureDownloadUrl!,
                alt: `${signature.signerRole} signature`,
              })
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signature.signatureDownloadUrl}
              alt={`${signature.signerRole} signature`}
              className="h-[52px] w-[110px] object-contain p-1"
            />
          </button>
        ) : (
          <div className="grid h-[52px] w-[110px] place-items-center text-[10px] text-slate-400">
            Unavailable
          </div>
        )}
      </div>
      <p className="mt-1 text-[10px] font-medium text-slate-500">
        Signed: {formatShortDate(signature.signedAt)}
      </p>
    </div>
  );
}

function PartyAvatar({
  src,
  name,
  onPreview,
}: {
  src?: string | null;
  name: string;
  onPreview?: () => void;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (src) {
    const image = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className="size-14 rounded-full object-cover"
      />
    );
    if (onPreview) {
      return (
        <button
          type="button"
          onClick={onPreview}
          className="shrink-0 cursor-zoom-in"
        >
          {image}
        </button>
      );
    }
    return <div className="shrink-0">{image}</div>;
  }

  return (
    <div className="grid size-14 shrink-0 place-items-center rounded-full bg-[#e9f8ef] text-sm font-bold text-[#07885f]">
      {initials || "?"}
    </div>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="truncate text-[12px] text-slate-600">
      <span className="font-semibold text-slate-500">{label}: </span>
      {value}
    </p>
  );
}

function InfoLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-[13px] font-semibold text-[#0b1220]">{value}</p>
    </div>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
  valueClassName = "text-[#0b1220]",
  iconClassName = "bg-[#f4f7f6] text-slate-500",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  valueClassName?: string;
  iconClassName?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span
        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${iconClassName}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-500">{label}</p>
        <p
          className={`mt-0.5 truncate text-[13px] font-semibold ${valueClassName}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function resolveDaysRemaining({
  dueDate,
  durationDays,
  disbursedAt,
  isClosed,
}: {
  dueDate: string | null;
  durationDays: number | null | undefined;
  disbursedAt: string | null;
  isClosed: boolean;
}) {
  if (isClosed) return null;
  if (dueDate) {
    const due = new Date(dueDate);
    if (!Number.isNaN(due.getTime())) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);
      return Math.round(
        (due.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000),
      );
    }
  }
  if (durationDays == null || !disbursedAt) return null;
  const start = new Date(disbursedAt);
  if (Number.isNaN(start.getTime())) return null;
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const elapsed = Math.max(
    0,
    Math.round(
      (today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    ),
  );
  return durationDays - elapsed;
}

function StatusPill({ label }: { label: string }) {
  const tone =
    label.toLowerCase() === "overdue"
      ? "bg-red-50 text-red-700"
      : label.toLowerCase() === "due today"
        ? "bg-amber-50 text-amber-800"
        : label.toLowerCase() === "closed"
          ? "bg-slate-100 text-slate-600"
          : "bg-emerald-50 text-emerald-700";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

function findMedia(items: MediaItem[], type: string) {
  return items.find((item) => item.type === type) ?? null;
}

function findSignature(items: SignatureItem[], role: string) {
  return (
    items.find((item) => item.signerRole.toUpperCase() === role) ??
    items.find((item) => item.signerRole.toUpperCase().includes(role)) ??
    null
  );
}

const SIGNATURE_MEDIA_TYPES = new Set([
  "SIGNATURE_APPLICANT",
  "SIGNATURE_GUARANTOR",
  "SIGNATURE_OFFICER",
]);

function isSignatureMediaType(type: string) {
  return SIGNATURE_MEDIA_TYPES.has(type) || type.startsWith("SIGNATURE_");
}

function mediaLabel(type: string) {
  if (type === "PASSPORT") return "Applicant photo";
  if (type === "NIN_FRONT") return "National ID Front";
  if (type === "NIN_BACK") return "National ID Back";
  if (type === "GUARANTOR_NIN_FRONT") return "National ID Front";
  if (type === "GUARANTOR_NIN_BACK") return "National ID Back";
  return toTitleLabel(type);
}

function toTitleLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMoneyText(amount: number, currency: string) {
  return `${currency} ${Math.round(amount).toLocaleString("en-UG")}`;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPrimaryStatus(detail: ApplicationDetail) {
  if (detail.loanStatus) {
    return formatLoanLifecycleStatus(detail.loanStatus);
  }
  return titleCaseStatus(detail.status);
}

function formatLoanLifecycleStatus(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "CLOSED") return "Closed";
  if (normalized === "IN_ARREARS" || normalized === "WRITTEN_OFF") {
    return normalized === "WRITTEN_OFF" ? "Written Off" : "Overdue";
  }
  if (
    normalized === "DISBURSED" ||
    normalized === "CURRENT" ||
    normalized === "RESTRUCTURED" ||
    normalized === "APPROVED"
  ) {
    return "Active";
  }
  return titleCaseStatus(status);
}

function titleCaseStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}
