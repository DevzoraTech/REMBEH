"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import { AgentPhoto } from "./agent-photo";

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

type ApplicationDetailDrawerProps = {
  applicationId: string | null;
  accessToken: string;
  tokenType?: string;
  onClose: () => void;
};

export function ApplicationDetailDrawer({
  applicationId,
  accessToken,
  tokenType = "Bearer",
  onClose,
}: ApplicationDetailDrawerProps) {
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(
    null,
  );
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function downloadAgreementPdf() {
    if (!applicationId || downloadingPdf) return;
    setDownloadingPdf(true);
    setDownloadError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/loan-applications/${applicationId}/agreement.pdf`,
        {
          headers: {
            Authorization: `${tokenType} ${accessToken}`,
          },
        },
      );
      if (!response.ok) {
        let message = "Could not download agreement PDF.";
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
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("content-disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/i);
      anchor.href = objectUrl;
      anchor.download = match?.[1] ?? `loan-agreement-${applicationId}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
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
    let cancelled = false;
    const boot = window.setTimeout(() => {
      if (!applicationId) {
        setDetail(null);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      void (async () => {
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
          if (!response.ok) {
            throw new Error(formatApiError(payload.message));
          }
          if (!cancelled) {
            setDetail(payload.application ?? null);
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
  }, [applicationId, accessToken, tokenType]);

  if (!applicationId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close detail"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col bg-[var(--soft-ivory)] shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold lowercase tracking-[0.08em] text-slate-500">
              application
            </p>
            <h2 className="text-lg font-bold text-[var(--midnight-navy)]">
              {detail?.clientName || "Loading…"}
            </h2>
            {detail ? (
              <p className="text-xs text-slate-500">
                {detail.status}
                {detail.synced ? " · synced" : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-ghost h-9 w-9 p-0"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading detail…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : detail ? (
            <div className="space-y-5">
              <Section title="applicant">
                <Row label="name" value={detail.clientName || "—"} />
                <Row label="phone" value={detail.phone || "—"} />
                <Row label="national id" value={detail.nationalId || "—"} />
                <Row label="gender" value={formatGender(detail.gender)} />
                <Row
                  label="date of birth"
                  value={formatDateOfBirth(detail.dateOfBirth)}
                />
                <Row
                  label="location"
                  value={
                    [
                      detail.village,
                      detail.parish,
                      detail.subCounty,
                      detail.district,
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"
                  }
                />
              </Section>

              <Section title="field agent">
                <div className="flex items-center gap-3">
                  <AgentPhoto
                    src={detail.agentPhotoUrl}
                    name={detail.officerName || "branch officer"}
                    publicId={detail.officerPublicId}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--midnight-navy)]">
                      {detail.officerName || "Branch officer"}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {detail.officerPublicId || "agent photo pending"}
                    </p>
                  </div>
                </div>
              </Section>

              <Section title="loan terms">
                <Row
                  label="principal"
                  value={formatAmount(detail.principalAmount)}
                />
                <Row
                  label="interest rate"
                  value={
                    detail.interestRatePercent != null
                      ? `${detail.interestRatePercent}%`
                      : "—"
                  }
                />
                <Row
                  label="period"
                  value={
                    detail.durationDays != null
                      ? `${detail.durationDays} days`
                      : "—"
                  }
                />
                <Row
                  label="processing fee"
                  value={formatAmount(detail.processingFee)}
                />
                <Row
                  label="interest amount"
                  value={formatAmount(detail.pricing?.interestAmount ?? null)}
                />
                <Row
                  label="total repayable"
                  value={formatAmount(detail.pricing?.totalRepayable ?? null)}
                />
                <Row
                  label="collateral"
                  value={detail.collateralType || "—"}
                />
              </Section>

              <Section title="guarantor">
                <Row
                  label="name"
                  value={detail.guarantor?.fullName || "—"}
                />
                <Row label="phone" value={detail.guarantor?.phone || "—"} />
              </Section>

              <Section title="signatures">
                {detail.signatures.length === 0 ? (
                  <p className="text-sm text-slate-500">no signatures yet.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {detail.signatures.map((sig) => (
                      <div
                        key={sig.id}
                        className="rounded border border-[var(--line)] bg-white p-2"
                      >
                        <p className="text-xs font-semibold text-[var(--midnight-navy)]">
                          {sig.signerRole} · v{sig.version}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {sig.signerName}
                          {sig.locked ? " · locked" : ""}
                        </p>
                        {sig.signatureDownloadUrl ? (
                          <button
                            type="button"
                            className="mt-2 block w-full cursor-zoom-in bg-slate-50"
                            onClick={() =>
                              setPreview({
                                src: sig.signatureDownloadUrl!,
                                alt: `${sig.signerRole} signature`,
                              })
                            }
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={sig.signatureDownloadUrl}
                              alt={`${sig.signerRole} signature`}
                              className="h-16 w-full object-contain"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                                const fallback = event.currentTarget.nextElementSibling;
                                if (fallback instanceof HTMLElement) {
                                  fallback.style.display = "block";
                                }
                              }}
                            />
                            <p className="mt-2 hidden text-xs text-slate-400">
                              preview unavailable
                            </p>
                          </button>
                        ) : (
                          <p className="mt-2 text-xs text-slate-400">
                            preview unavailable
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="uploads">
                {detail.media.length === 0 ? (
                  <p className="text-sm text-slate-500">no media uploaded.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {detail.media.map((item) => (
                      <div
                        key={item.id}
                        className="rounded border border-[var(--line)] bg-white p-2"
                      >
                        <p className="truncate text-xs font-semibold text-[var(--midnight-navy)]">
                          {mediaLabel(item.type)}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {item.fileName || item.mimeType}
                        </p>
                        {item.downloadUrl && item.mimeType.startsWith("image/") ? (
                          <button
                            type="button"
                            className="mt-2 block w-full cursor-zoom-in bg-slate-50"
                            onClick={() =>
                              setPreview({
                                src: item.downloadUrl!,
                                alt: item.type,
                              })
                            }
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.downloadUrl}
                              alt={item.type}
                              className="h-28 w-full object-cover"
                            />
                          </button>
                        ) : item.downloadUrl ? (
                          <a
                            href={item.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-block text-xs font-semibold text-[var(--forest-emerald)]"
                          >
                            open file
                          </a>
                        ) : (
                          <p className="mt-2 text-xs text-slate-400">
                            preview unavailable
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="loan agreement">
                <button
                  type="button"
                  onClick={() => void downloadAgreementPdf()}
                  disabled={downloadingPdf}
                  className="text-sm font-semibold text-[var(--forest-emerald)] disabled:opacity-60"
                >
                  {downloadingPdf ? "preparing pdf…" : "download pdf"}
                </button>
                {downloadError ? (
                  <p className="mt-2 text-xs text-rose-600">{downloadError}</p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    filled from the loan-agreement docx template using this
                    application&apos;s latest data.
                  </p>
                )}
                {detail.signedAgreementDownloadUrl ? (
                  <a
                    href={detail.signedAgreementDownloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs text-slate-500 underline"
                  >
                    open last stored copy
                  </a>
                ) : null}
              </Section>
            </div>
          ) : null}
        </div>
      </aside>

      {preview ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
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

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold lowercase tracking-[0.08em] text-slate-500">
        {title.toLowerCase()}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-slate-500">{label.toLowerCase()}</span>
      <span className="max-w-[60%] text-right font-medium text-[var(--midnight-navy)]">
        {value}
      </span>
    </div>
  );
}

function formatAmount(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-UG").format(value);
}

function formatGender(value: ApplicationDetail["gender"]) {
  if (value === "MALE") return "male";
  if (value === "FEMALE") return "female";
  if (value === "OTHER") return "other";
  return "—";
}

function mediaLabel(type: string) {
  if (type === "PASSPORT") return "applicant photo";
  return type.toLowerCase().replaceAll("_", " ");
}

function formatDateOfBirth(value: string | null | undefined) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}
