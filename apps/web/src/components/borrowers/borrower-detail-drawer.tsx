"use client";

import {
  Camera,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  FileText,
  IdCard,
  Loader2,
  MoreVertical,
  Phone,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  formatDate,
  formatMoney,
  formatNumber,
  type OwnerBorrower,
} from "../../app/owner/owner-common";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import type { RembehSession } from "../../lib/auth-session";
import { ApplicationDetailDrawer } from "../app/application-detail-drawer";
import { RecordRepaymentModal } from "../loans/record-repayment-modal";

type BorrowerTab = "overview" | "loans";

type BorrowerLoan = {
  id: string;
  applicationId: string | null;
  status: string;
  currency: string;
  principal: number;
  balance: number;
  totalRepayable?: number;
  disbursedAt: string | null;
  createdAt: string;
  paidAmount: number;
  officerName: string | null;
  officerPublicId: string | null;
  loanTypeName: string | null;
};

type BorrowerDocument = {
  id: string;
  applicationId: string;
  loanId: string | null;
  type: string;
  mimeType: string;
  fileName: string | null;
  createdAt: string;
  downloadUrl: string | null;
};

type BorrowerDetail = {
  id: string;
  fullName: string;
  phone: string;
  nationalId: string | null;
  email: string | null;
  district: string | null;
  parish: string | null;
  village: string | null;
  registeredByName: string | null;
  verifiedAt: string | null;
  verificationStatus: "VERIFIED" | "NOT_VERIFIED" | "ISSUE";
  createdAt: string;
  loanCount: number;
  activeLoanCount: number;
  activeLoanId: string | null;
  loans: BorrowerLoan[];
  documents: BorrowerDocument[];
};

const IDENTITY_SLOTS: Array<{
  type: string;
  label: string;
}> = [
  { type: "PASSPORT", label: "Borrower Photo" },
  { type: "NIN_FRONT", label: "National ID Front" },
  { type: "NIN_BACK", label: "National ID Back" },
  { type: "SIGNATURE_APPLICANT", label: "Borrower Signature" },
];

export function BorrowerDetailDrawer({
  borrower,
  session,
  canRecordRepayment = false,
  initialOpenLoanId = null,
  onClose,
}: {
  borrower: OwnerBorrower;
  session: RembehSession;
  canRecordRepayment?: boolean;
  initialOpenLoanId?: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<BorrowerTab>("overview");
  const [detail, setDetail] = useState<BorrowerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(
    null,
  );
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(
    initialOpenLoanId,
  );
  const [repaymentLoanId, setRepaymentLoanId] = useState<string | null>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/customers/${borrower.id}`,
        {
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
          },
        },
      );
      const payload = await readApiJson<{
        customer?: BorrowerDetail;
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setDetail(payload.customer ?? null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load borrower details.",
      );
    } finally {
      setLoading(false);
    }
  }, [borrower.id, session.accessToken, session.tokenType]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail, detailRefreshKey]);

  useEffect(() => {
    setSelectedLoanId(initialOpenLoanId);
  }, [initialOpenLoanId, borrower.id]);

  const loans = detail?.loans ?? [];
  const currentLoan = useMemo(() => {
    if (!loans.length) return null;
    if (detail?.activeLoanId) {
      return loans.find((loan) => loan.id === detail.activeLoanId) ?? null;
    }
    return (
      loans.find((loan) => isActiveLoanStatus(loan.status, loan.balance)) ??
      null
    );
  }, [detail?.activeLoanId, loans]);

  const loanSummary = useMemo(() => {
    let active = 0;
    let closed = 0;
    for (const loan of loans) {
      if (isActiveLoanStatus(loan.status, loan.balance)) active += 1;
      else closed += 1;
    }
    return { total: loans.length, active, closed };
  }, [loans]);

  const identityDocs = useMemo(() => {
    const byType = new Map<string, BorrowerDocument>();
    for (const document of [...(detail?.documents ?? [])].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )) {
      if (!byType.has(document.type)) byType.set(document.type, document);
    }
    return IDENTITY_SLOTS.map((slot) => ({
      ...slot,
      document: byType.get(slot.type) ?? null,
    }));
  }, [detail?.documents]);

  const selectedLoan =
    loans.find((loan) => loan.id === selectedLoanId) ?? null;
  const repaymentLoan =
    loans.find((loan) => loan.id === repaymentLoanId) ?? null;

  const verification = resolveVerification(
    detail?.verificationStatus ?? borrower.verificationStatus,
    detail?.verifiedAt ?? borrower.verifiedAt,
  );
  const displayName = detail?.fullName ?? borrower.fullName;
  const phone = detail?.phone ?? borrower.phone;
  const nationalId = detail?.nationalId ?? borrower.nationalId;
  const registeredBy =
    detail?.registeredByName ?? borrower.registeredByName ?? "—";
  const joinedAt = detail?.createdAt ?? borrower.createdAt;

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(8,15,31,0.36)] backdrop-blur-[2px]">
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Close Borrower Details"
          onClick={onClose}
        />
        <aside className="relative flex h-full w-full max-w-[760px] flex-col bg-white shadow-[-18px_0_44px_rgba(15,23,42,0.18)]">
          <div className="shrink-0 border-b border-[#edf1f5] px-5 pb-0 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3.5">
                <div className="relative shrink-0">
                  <span className="grid size-14 place-items-center rounded-full bg-[#e3f7ed] text-sm font-bold text-[#087f5d]">
                    {initials(displayName)}
                  </span>
                  <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full border-2 border-white bg-[#e8edf2] text-slate-500">
                    <Camera className="size-3" strokeWidth={2.25} />
                  </span>
                </div>
                <div className="min-w-0 pt-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-bold tracking-[-0.03em] text-[#0b1220]">
                      {displayName}
                    </h2>
                    <VerificationBadge status={verification} />
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="flex items-center gap-1.5 text-[13px] font-medium text-slate-600">
                      <Phone className="size-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{phone || "—"}</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-[13px] font-medium text-slate-600">
                      <IdCard className="size-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{nationalId || "—"}</span>
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] font-medium text-slate-500">
                    Borrower since {formatDate(joinedAt)}
                    <span className="mx-1.5 text-slate-300">•</span>
                    Registered by {registeredBy}
                  </p>
                </div>
              </div>
              <div className="relative flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="grid size-9 place-items-center rounded-xl border border-[#e4e9ef] text-[#0b1220] hover:bg-slate-50"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="grid size-9 place-items-center rounded-xl border border-[#e4e9ef] text-[#0b1220] hover:bg-slate-50"
                  aria-label="More actions"
                >
                  <MoreVertical className="size-4" />
                </button>
                {menuOpen ? (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-10 cursor-default"
                      aria-label="Close menu"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-[#e6ebf0] bg-white p-1 shadow-[0_14px_34px_rgba(15,23,42,0.16)]">
                      <button
                        type="button"
                        disabled={!currentLoan}
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6] disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => {
                          setMenuOpen(false);
                          if (!currentLoan) return;
                          setSelectedLoanId(currentLoan.id);
                        }}
                      >
                        View current loan
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex gap-5">
              {(
                [
                  { id: "overview", label: "Overview" },
                  { id: "loans", label: "Loans" },
                ] as const
              ).map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`relative pb-3 text-sm font-semibold transition ${
                      active
                        ? "text-[#07885f]"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {item.label}
                    {active ? (
                      <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#07885f]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {loading && !detail ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </div>
            ) : error && !detail ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => void loadDetail()}
                  className="mt-2 text-xs font-semibold underline"
                >
                  Try again
                </button>
              </div>
            ) : tab === "overview" ? (
              <OverviewTab
                phone={phone}
                email={detail?.email ?? borrower.email}
                nationalId={nationalId}
                district={detail?.district ?? null}
                parish={detail?.parish ?? null}
                village={detail?.village ?? null}
                joinedAt={joinedAt}
                registeredBy={registeredBy}
                identityDocs={identityDocs}
                currentLoan={currentLoan}
                onPreview={(src, alt) => setPreview({ src, alt })}
                onViewLoan={(loanId) => setSelectedLoanId(loanId)}
              />
            ) : (
              <LoansTab
                summary={loanSummary}
                loans={loans}
                onViewLoan={(loanId) => setSelectedLoanId(loanId)}
              />
            )}
          </div>
        </aside>
      </div>

      {selectedLoan?.applicationId ? (
        <ApplicationDetailDrawer
          applicationId={selectedLoan.applicationId}
          accessToken={session.accessToken}
          tokenType={session.tokenType}
          customerId={borrower.id}
          loanDisplayId={shortLoanId(selectedLoan.id)}
          loanStatusLabel={loanStatusLabel(selectedLoan)}
          elevated
          loan={{
            id: selectedLoan.id,
            borrowerName: displayName,
            phone: phone || "",
            loanTypeName: selectedLoan.loanTypeName,
            principal: selectedLoan.principal,
            currency: selectedLoan.currency || "UGX",
            disbursedAt: selectedLoan.disbursedAt,
            officerName: selectedLoan.officerName,
            officerPublicId: selectedLoan.officerPublicId,
            balance: selectedLoan.balance,
            paidAmount: selectedLoan.paidAmount,
            totalRepayable: selectedLoan.totalRepayable,
            status: selectedLoan.status,
          }}
          canRecordRepayment={
            canRecordRepayment &&
            isActiveLoanStatus(selectedLoan.status, selectedLoan.balance)
          }
          onRecordRepayment={() => setRepaymentLoanId(selectedLoan.id)}
          refreshKey={detailRefreshKey}
          onClose={() => setSelectedLoanId(null)}
        />
      ) : null}

      <RecordRepaymentModal
        open={Boolean(repaymentLoan)}
        loan={
          repaymentLoan
            ? {
                id: repaymentLoan.id,
                borrowerName: displayName,
                phone: phone || "",
                balance: repaymentLoan.balance,
                currency: repaymentLoan.currency || "UGX",
              }
            : null
        }
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        onClose={() => setRepaymentLoanId(null)}
        onRecorded={() => {
          setRepaymentLoanId(null);
          setDetailRefreshKey((key) => key + 1);
        }}
      />

      {preview ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
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
              className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function OverviewTab({
  phone,
  email,
  nationalId,
  district,
  parish,
  village,
  joinedAt,
  registeredBy,
  identityDocs,
  currentLoan,
  onPreview,
  onViewLoan,
}: {
  phone: string;
  email: string | null | undefined;
  nationalId: string | null | undefined;
  district: string | null;
  parish: string | null;
  village: string | null;
  joinedAt: string;
  registeredBy: string;
  identityDocs: Array<{
    type: string;
    label: string;
    document: BorrowerDocument | null;
  }>;
  currentLoan: BorrowerLoan | null;
  onPreview: (src: string, alt: string) => void;
  onViewLoan: (loanId: string) => void;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-bold text-[#0b1220]">Personal information</h3>
        <div className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <InfoField label="Phone" value={phone || "—"} />
          <InfoField label="Parish" value={parish || "—"} />
          <InfoField
            label="Email"
            value={email?.trim() ? email.trim() : "—"}
          />
          <InfoField label="Village" value={village || "—"} />
          <InfoField label="National ID" value={nationalId || "—"} />
          <InfoField label="Date registered" value={formatDate(joinedAt)} />
          <InfoField label="District" value={district || "—"} />
          <InfoField label="Registered by" value={registeredBy} />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-[#0b1220]">Identity evidence</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {identityDocs.map((slot) => (
            <IdentityCard
              key={slot.type}
              label={slot.label}
              document={slot.document}
              onPreview={onPreview}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-[#0b1220]">Current loan</h3>
        {currentLoan ? (
          <div className="mt-3 overflow-x-auto rounded-xl border border-[#e8edf2]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[#edf1f5] bg-[#f7f9fb] text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Loan ID</th>
                  <th className="px-3 py-2.5">Principal</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Date issued</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className="inline-flex items-center gap-2 font-semibold text-[#0b1220]">
                      <span className="grid size-7 place-items-center rounded-lg bg-[#e9f8ef] text-[#07885f]">
                        <FileText className="size-3.5" />
                      </span>
                      {shortLoanId(currentLoan.id)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums text-[#0b1220]">
                    {formatMoney(
                      currentLoan.principal,
                      currentLoan.currency || "UGX",
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <LoanStatusPill loan={currentLoan} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                    {formatDate(
                      currentLoan.disbursedAt ?? currentLoan.createdAt,
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ViewLoanButton
                      disabled={!currentLoan.applicationId}
                      onClick={() => onViewLoan(currentLoan.id)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-[#edf1f5] bg-[#f7f9fb] px-3 py-6 text-center text-sm text-slate-500">
            No active loan for this borrower.
          </p>
        )}
      </section>
    </div>
  );
}

function LoansTab({
  summary,
  loans,
  onViewLoan,
}: {
  summary: { total: number; active: number; closed: number };
  loans: BorrowerLoan[];
  onViewLoan: (loanId: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryStat
          icon={<FileText className="size-4" />}
          label="Total loans"
          value={formatNumber(summary.total)}
        />
        <SummaryStat
          icon={<CircleDot className="size-4" />}
          label="Active"
          value={formatNumber(summary.active)}
        />
        <SummaryStat
          icon={<CheckCircle2 className="size-4" />}
          label="Closed"
          value={formatNumber(summary.closed)}
        />
      </div>

      <section>
        <h3 className="text-sm font-bold text-[#0b1220]">Loan history</h3>
        {loans.length === 0 ? (
          <p className="mt-3 rounded-xl border border-[#edf1f5] bg-[#f7f9fb] px-3 py-8 text-center text-sm text-slate-500">
            No loans yet for this borrower.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-[#e8edf2]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[#edf1f5] bg-[#f7f9fb] text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Loan ID</th>
                  <th className="px-3 py-2.5">Principal</th>
                  <th className="px-3 py-2.5">Repaid</th>
                  <th className="px-3 py-2.5">Outstanding</th>
                  <th className="px-3 py-2.5">Issued</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f5]">
                {loans.map((loan) => (
                  <tr key={loan.id}>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-[#0b1220]">
                      {shortLoanId(loan.id)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-[#0b1220]">
                      {formatMoney(loan.principal, loan.currency || "UGX")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-700">
                      {formatMoney(loan.paidAmount, loan.currency || "UGX")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums text-[#0b1220]">
                      {formatMoney(loan.balance, loan.currency || "UGX")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                      {formatDate(loan.disbursedAt ?? loan.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      <LoanStatusPill loan={loan} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <ViewLoanButton
                        disabled={!loan.applicationId}
                        onClick={() => onViewLoan(loan.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[#e8edf2] bg-[#f7f9fb] px-4 py-3">
      <div className="flex items-center gap-2 text-[#07885f]">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
          {label}
        </p>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-[-0.03em] text-[#0b1220]">
        {value}
      </p>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-[#0b1220]">{value}</p>
    </div>
  );
}

function IdentityCard({
  label,
  document,
  onPreview,
}: {
  label: string;
  document: BorrowerDocument | null;
  onPreview: (src: string, alt: string) => void;
}) {
  const src = document?.downloadUrl ?? null;
  return (
    <button
      type="button"
      disabled={!src}
      onClick={() => {
        if (!src) return;
        onPreview(src, label);
      }}
      className="overflow-hidden rounded-xl border border-[#e8edf2] bg-[#f7f9fb] text-left disabled:cursor-default"
    >
      <div className="aspect-[4/3] bg-[#eef2f6]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={label}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-[11px] font-medium text-slate-400">
            No image
          </div>
        )}
      </div>
      <p className="px-2.5 py-2 text-[11px] font-semibold text-[#0b1220]">
        {label}
      </p>
    </button>
  );
}

function ViewLoanButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e4e9ef] bg-white px-2.5 text-[11px] font-semibold text-[#0b1220] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
    >
      View loan
      <ExternalLink className="size-3" />
    </button>
  );
}

function LoanStatusPill({ loan }: { loan: BorrowerLoan }) {
  const active = isActiveLoanStatus(loan.status, loan.balance);
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-semibold ${
        active
          ? "bg-emerald-50 text-[#07885f]"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {active ? "Active" : "Closed"}
    </span>
  );
}

function VerificationBadge({
  status,
}: {
  status: "verified" | "not_verified" | "issue";
}) {
  if (status === "verified") {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 text-[11px] font-semibold text-[#07885f]">
        <span className="size-1.5 rounded-full bg-[#07885f]" />
        Verified
      </span>
    );
  }
  if (status === "issue") {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-700">
        <span className="size-1.5 rounded-full bg-rose-500" />
        Verification issue
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-[#fff4e8] px-2.5 text-[11px] font-semibold text-[#c97900]">
      <span className="size-1.5 rounded-full bg-[#f0a04b]" />
      Not verified
    </span>
  );
}

function resolveVerification(
  status: string | null | undefined,
  verifiedAt: string | null | undefined,
): "verified" | "not_verified" | "issue" {
  if (status === "ISSUE") return "issue";
  if (status === "VERIFIED") return "verified";
  if (status === "NOT_VERIFIED") return "not_verified";
  return verifiedAt ? "verified" : "not_verified";
}

function isActiveLoanStatus(status: string, balance: number) {
  if (balance <= 0) return false;
  const normalized = status.toUpperCase();
  if (
    normalized === "CLOSED" ||
    normalized === "WRITTEN_OFF" ||
    normalized === "REJECTED" ||
    normalized === "DRAFT"
  ) {
    return false;
  }
  return true;
}

function loanStatusLabel(loan: BorrowerLoan) {
  return isActiveLoanStatus(loan.status, loan.balance) ? "Active" : "Closed";
}

function shortLoanId(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "B";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
