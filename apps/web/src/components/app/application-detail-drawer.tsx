"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";

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

  useEffect(() => {
    if (!applicationId) {
      setDetail(null);
      setError(null);
      return;
    }

    let cancelled = false;
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

    return () => {
      cancelled = true;
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Application
            </p>
            <h2 className="text-lg font-bold text-[var(--midnight-navy)]">
              {detail?.clientName || "Loading…"}
            </h2>
            {detail ? (
              <p className="text-xs text-slate-500">
                {detail.status}
                {detail.synced ? " · Synced" : ""}
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
              <Section title="Applicant">
                <Row label="Name" value={detail.clientName || "—"} />
                <Row label="Phone" value={detail.phone || "—"} />
                <Row label="National ID" value={detail.nationalId || "—"} />
                <Row
                  label="Location"
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

              <Section title="Field agent">
                <div className="flex items-center gap-3">
                  {detail.agentPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={detail.agentPhotoUrl}
                      alt={detail.officerName || "Agent"}
                      className="size-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex size-12 items-center justify-center rounded-full bg-[var(--soft-mist)] text-xs font-bold text-[var(--forest-emerald)]">
                      AG
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--midnight-navy)]">
                      {detail.officerName || "Branch officer"}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {detail.officerPublicId || "Agent photo pending"}
                    </p>
                  </div>
                </div>
              </Section>

              <Section title="Loan terms">
                <Row
                  label="Principal"
                  value={formatAmount(detail.principalAmount)}
                />
                <Row
                  label="Interest rate"
                  value={
                    detail.interestRatePercent != null
                      ? `${detail.interestRatePercent}%`
                      : "—"
                  }
                />
                <Row
                  label="Period"
                  value={
                    detail.durationDays != null
                      ? `${detail.durationDays} days`
                      : "—"
                  }
                />
                <Row
                  label="Processing fee"
                  value={formatAmount(detail.processingFee)}
                />
                <Row
                  label="Interest amount"
                  value={formatAmount(detail.pricing?.interestAmount ?? null)}
                />
                <Row
                  label="Total repayable"
                  value={formatAmount(detail.pricing?.totalRepayable ?? null)}
                />
                <Row
                  label="Collateral"
                  value={detail.collateralType || "—"}
                />
              </Section>

              <Section title="Guarantor">
                <Row
                  label="Name"
                  value={detail.guarantor?.fullName || "—"}
                />
                <Row label="Phone" value={detail.guarantor?.phone || "—"} />
              </Section>

              <Section title="Signatures">
                {detail.signatures.length === 0 ? (
                  <p className="text-sm text-slate-500">No signatures yet.</p>
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
                          {sig.locked ? " · Locked" : ""}
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
                              Preview unavailable
                            </p>
                          </button>
                        ) : (
                          <p className="mt-2 text-xs text-slate-400">
                            Preview unavailable
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Uploads">
                {detail.media.length === 0 ? (
                  <p className="text-sm text-slate-500">No media uploaded.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {detail.media.map((item) => (
                      <div
                        key={item.id}
                        className="rounded border border-[var(--line)] bg-white p-2"
                      >
                        <p className="truncate text-xs font-semibold text-[var(--midnight-navy)]">
                          {item.type === "PASSPORT" ? "Applicant Photo" : item.type}
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
                            Open file
                          </a>
                        ) : (
                          <p className="mt-2 text-xs text-slate-400">
                            Preview unavailable
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {detail.signedAgreementDownloadUrl ? (
                <Section title="Signed agreement">
                  <a
                    href={detail.signedAgreementDownloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-[var(--forest-emerald)]"
                  >
                    Download PDF
                  </a>
                </Section>
              ) : null}
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
      <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
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
