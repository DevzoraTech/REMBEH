"use client";

import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Loader2,
  MoreVertical,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../components/app/app-shell";
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

type ClientLoan = {
  id: string;
  applicationId: string | null;
  status: string;
  currency: string;
  principal: number;
  balance: number;
  openingBalance: number | null;
  finesTotal: number;
  isFined: boolean;
  disbursedAt: string | null;
  paymentStartDate: string | null;
  createdAt: string;
  updatedAt: string;
  officerName: string | null;
  officerPublicId: string | null;
  loanTypeName: string | null;
  collateralType: string | null;
  city: string | null;
  repaymentsCount: number;
  paidAmount: number;
  lastPaymentAt: string | null;
};

type ClientDocument = {
  id: string;
  applicationId: string;
  loanId: string | null;
  type: string;
  mimeType: string;
  byteSize: number;
  fileName: string | null;
  createdAt: string;
  collateralType: string | null;
  downloadUrl: string | null;
};

type ClientPayment = {
  id: string;
  loanId: string;
  amount: number;
  method: string;
  paidAt: string;
  recordedByName: string;
  recordedByPublicId: string | null;
  note: string | null;
};

type ClientDetail = {
  id: string;
  branchId: string;
  branchName: string | null;
  fullName: string;
  phone: string;
  nationalId: string | null;
  email: string | null;
  collateralType: string | null;
  city: string | null;
  loanCount: number;
  verifiedAt: string | null;
  createdAt: string;
  loans: ClientLoan[];
  documents: ClientDocument[];
  recentPayments: ClientPayment[];
};

type ClientDetailResponse = {
  customer?: ClientDetail;
  message?: string | string[];
};

export default function ClientDetailPage() {
  const params = useParams<{ clientId?: string }>();
  const router = useRouter();
  const clientId = typeof params.clientId === "string" ? params.clientId : "";
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [documentPreview, setDocumentPreview] = useState<ClientDocument | null>(
    null,
  );

  const loadClient = useCallback(
    async (activeSession: RembehSession) => {
      if (!clientId) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${apiBaseUrl}/customers/${clientId}`, {
          headers: {
            Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
          },
        });
        const payload = await readApiJson<ClientDetailResponse>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        setClient(payload.customer ?? null);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Could not load borrower.",
        );
      } finally {
        setLoading(false);
      }
    },
    [clientId],
  );

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const auth = readAuthState();
      if (!auth.session || isSessionExpired(auth.session)) {
        clearAuthState();
        router.replace("/login");
        return;
      }

      setSession(auth.session);
      setWorkspace(auth.workspace);
      setUser(auth.user);
      setBranch(auth.branch);

      if (!auth.session.permissions.includes("customer.read")) {
        setError("You do not have permission to view borrowers.");
        setLoading(false);
        return;
      }

      void loadClient(auth.session);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [router, loadClient]);

  const totals = useMemo(() => {
    const loans = client?.loans ?? [];
    return {
      loans: loans.length,
      outstanding: loans.reduce((sum, loan) => sum + loan.balance, 0),
      paid: loans.reduce((sum, loan) => sum + loan.paidAmount, 0),
      principal: loans.reduce((sum, loan) => sum + loan.principal, 0),
    };
  }, [client]);

  const selectedLoan = useMemo(
    () => client?.loans.find((loan) => loan.id === selectedLoanId) ?? null,
    [client, selectedLoanId],
  );

  const clientIdentityDocuments = useMemo(
    () => latestIdentityDocuments(client?.documents ?? []),
    [client],
  );

  const selectedLoanDocuments = useMemo(
    () =>
      selectedLoan
        ? loanDocuments(client?.documents ?? [], selectedLoan)
        : [],
    [client, selectedLoan],
  );

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 size-4 animate-spin" />
        loading…
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
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/clients"
              className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[var(--midnight-navy)]"
            >
              <ArrowLeft className="size-3.5" />
              borrowers
            </Link>
            <h1 className="truncate text-xl font-bold text-[var(--midnight-navy)]">
              {client?.fullName ?? "borrower"}
            </h1>
          </div>
          <button
            type="button"
            className="btn btn-ghost h-9 text-xs"
            onClick={() => void loadClient(session)}
            disabled={loading}
          >
            <RefreshCw
              className={`size-3.5 ${loading ? "animate-spin" : ""}`}
            />
            refresh
          </button>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {loading && !client ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            loading borrower…
          </div>
        ) : client ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="loans" value={String(totals.loans)} />
              <StatCard
                label="principal"
                value={formatMoney(totals.principal)}
              />
              <StatCard
                label="outstanding"
                value={formatMoney(totals.outstanding)}
                tone="warn"
              />
              <StatCard
                label="paid"
                value={formatMoney(totals.paid)}
                tone="good"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
              <section className="panel h-fit overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
                <div className="border-b border-[var(--line)] bg-[#eef3f0] px-4 py-3">
                  <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
                    profile
                  </h2>
                </div>
                <dl className="divide-y divide-[var(--line)] px-4">
                  <InfoRow label="phone" value={client.phone} />
                  <InfoRow label="collateral" value={client.collateralType} />
                  <InfoRow label="city" value={client.city} />
                  <InfoRow label="national id" value={client.nationalId} />
                  <InfoRow label="email" value={client.email} />
                  <InfoRow
                    label="registered"
                    value={formatDate(client.createdAt)}
                  />
                  <InfoRow
                    label="status"
                    value={clientStatusLabel(client)}
                  />
                </dl>
              </section>

              <section className="panel min-w-0 overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
                <div className="border-b border-[var(--line)] bg-[#eef3f0] px-4 py-3">
                  <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
                    loans
                  </h2>
                </div>
                {client.loans.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-slate-500">
                    no loans recorded for this client.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] table-fixed text-left text-[11px]">
                      <thead className="border-b border-[var(--line)] bg-[#f7faf8] text-[9px] lowercase tracking-[0.06em] text-slate-500">
                        <tr>
                          <th className="w-[12%] px-3 py-2.5 font-semibold">
                            loan id
                          </th>
                          <th className="w-[16%] px-3 py-2.5 font-semibold">
                            loan type
                          </th>
                          <th className="w-[12%] px-3 py-2.5 font-semibold">
                            status
                          </th>
                          <th className="w-[15%] px-3 py-2.5 font-semibold">
                            collateral
                          </th>
                          <th className="w-[13%] px-3 py-2.5 text-right font-semibold">
                            principal
                          </th>
                          <th className="w-[12%] px-3 py-2.5 text-right font-semibold">
                            paid
                          </th>
                          <th className="w-[16%] px-3 py-2.5 text-right font-semibold">
                            balance
                          </th>
                          <th className="w-[4%] px-3 py-2.5 text-right font-semibold">
                            actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)]">
                        {client.loans.map((loan) => (
                          <tr key={loan.id} className="odd:bg-white even:bg-[#fbfdfc]">
                            <td className="px-3 py-3 font-semibold text-[var(--midnight-navy)]">
                              <span className="block truncate">
                                {shortId(loan.id)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              <span className="block truncate">
                                {loan.loanTypeName || "standard loan"}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              <span
                                className={`inline-flex border px-1.5 py-0.5 text-[9px] font-bold lowercase tracking-[0.04em] ${loanStatusTone(loan)}`}
                              >
                                {loanStatusLabel(loan)}
                                {loan.isFined ? (
                                  <span className="ml-1 text-red-700">
                                    fined
                                  </span>
                                ) : null}
                              </span>
                              <span className="block truncate text-[10px] text-slate-500">
                                {loan.lastPaymentAt
                                  ? `last ${formatDateTime(loan.lastPaymentAt)}`
                                  : "no payments"}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              <span className="block truncate">
                                {loan.collateralType || "—"}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">
                              <span className="block whitespace-nowrap">
                                {formatMoney(loan.principal)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-[var(--forest-emerald)]">
                              <span className="block whitespace-nowrap">
                                {formatMoney(loan.paidAmount)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums text-[var(--midnight-navy)]">
                              <span className="block whitespace-nowrap">
                                {formatMoney(loan.balance)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <button
                                type="button"
                                className="inline-grid size-8 place-items-center border border-[var(--line)] bg-white text-slate-600 transition hover:bg-[var(--soft-mist)] hover:text-[var(--midnight-navy)]"
                                aria-label="open loan details"
                                onClick={() => setSelectedLoanId(loan.id)}
                              >
                                <MoreVertical className="size-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            <section className="panel overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[#eef3f0] px-4 py-3">
                <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
                  borrower id images
                </h2>
                <span className="text-[10px] font-bold lowercase tracking-[0.06em] text-slate-500">
                  {clientIdentityDocuments.length} file
                  {clientIdentityDocuments.length === 1 ? "" : "s"}
                </span>
              </div>
              {clientIdentityDocuments.length === 0 ? (
                <p className="px-4 py-5 text-sm text-slate-500">
                  no borrower id images uploaded.
                </p>
              ) : (
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {clientIdentityDocuments.map((document) => (
                    <DocumentCard
                      key={document.id}
                      document={document}
                      onPreview={setDocumentPreview}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="panel overflow-hidden bg-white shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
              <div className="border-b border-[var(--line)] bg-[#eef3f0] px-4 py-3">
                <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
                  recent payments
                </h2>
              </div>
              {client.recentPayments.length === 0 ? (
                <p className="px-4 py-5 text-sm text-slate-500">
                  no payments recorded for this client.
                </p>
              ) : (
                <div className="overflow-hidden">
                  <table className="w-full table-fixed text-left text-[11px]">
                    <thead className="border-b border-[var(--line)] bg-[#f7faf8] text-[9px] lowercase tracking-[0.06em] text-slate-500">
                      <tr>
                        <th className="w-[16%] px-3 py-2.5 font-semibold">
                          date
                        </th>
                        <th className="w-[16%] px-3 py-2.5 text-right font-semibold">
                          amount
                        </th>
                        <th className="w-[13%] px-3 py-2.5 font-semibold">
                          method
                        </th>
                        <th className="w-[25%] px-3 py-2.5 font-semibold">
                          recorded by
                        </th>
                        <th className="w-[30%] px-3 py-2.5 font-semibold">
                          note
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {client.recentPayments.map((payment) => (
                        <tr key={payment.id} className="odd:bg-white even:bg-[#fbfdfc]">
                          <td className="px-3 py-3 text-slate-600">
                            <span className="block truncate">
                              {formatDateTime(payment.paidAt)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums text-[var(--forest-emerald)]">
                            <span className="block truncate">
                              {formatMoney(payment.amount)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            <span className="block truncate">
                              {methodLabel(payment.method)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            <span className="block truncate">
                              {payment.recordedByName}
                              {payment.recordedByPublicId
                                ? ` · ${payment.recordedByPublicId}`
                                : ""}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            <span className="block truncate">
                              {payment.note?.trim() || "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : (
          <p className="panel px-4 py-6 text-sm text-slate-500">
            borrower not found.
          </p>
        )}
      </div>

      {selectedLoan ? (
        <LoanDetailPanel
          loan={selectedLoan}
          documents={selectedLoanDocuments}
          onClose={() => setSelectedLoanId(null)}
          onPreviewDocument={setDocumentPreview}
        />
      ) : null}

      {documentPreview ? (
        <DocumentPreview
          document={documentPreview}
          onClose={() => setDocumentPreview(null)}
        />
      ) : null}
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
}) {
  const valueClass =
    tone === "good"
      ? "text-[var(--forest-emerald)]"
      : tone === "warn"
        ? "text-amber-700"
        : "text-[var(--midnight-navy)]";
  const toneClass =
    tone === "good"
      ? "border-l-[var(--forest-emerald)] bg-[#fbfdfc]"
      : tone === "warn"
        ? "border-l-amber-600 bg-[#fffaf0]"
        : "border-l-[var(--midnight-navy)] bg-white";

  return (
    <div
      className={`panel border-l-4 px-3 py-3 shadow-[0_8px_22px_rgba(20,33,61,0.05)] ${toneClass}`}
    >
      <p className="text-[10px] font-semibold lowercase tracking-[0.08em] text-slate-500">
        {label.toLowerCase()}
      </p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-3 py-2.5 text-xs">
      <dt className="font-semibold lowercase tracking-[0.06em] text-slate-500">
        {label.toLowerCase()}
      </dt>
      <dd className="min-w-0 truncate font-medium text-[var(--midnight-navy)]">
        {value?.trim() || "—"}
      </dd>
    </div>
  );
}

function LoanDetailPanel({
  loan,
  documents,
  onClose,
  onPreviewDocument,
}: {
  loan: ClientLoan;
  documents: ClientDocument[];
  onClose: () => void;
  onPreviewDocument: (document: ClientDocument) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="close loan details"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-[var(--line)] bg-[var(--soft-ivory)] shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold lowercase tracking-[0.08em] text-slate-500">
              loan details
            </p>
            <h2 className="mt-1 truncate text-lg font-bold text-[var(--midnight-navy)]">
              {loan.loanTypeName || "standard loan"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              loan {shortId(loan.id)} · {loanStatusLabel(loan)}
            </p>
          </div>
          <button
            type="button"
            className="grid size-8 place-items-center border border-[var(--line)] bg-white"
            onClick={onClose}
            aria-label="close"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <section className="panel bg-white px-3 py-3">
            <h3 className="mb-2 text-xs font-bold lowercase tracking-[0.08em] text-slate-500">
              summary
            </h3>
            <dl className="divide-y divide-[var(--line)]">
              <InfoRow label="loan type" value={loan.loanTypeName || "standard loan"} />
              <InfoRow label="status" value={loanStatusLabel(loan)} />
              <InfoRow label="collateral" value={loan.collateralType} />
              <InfoRow label="principal" value={formatMoney(loan.principal)} />
              <InfoRow label="paid" value={formatMoney(loan.paidAmount)} />
              <InfoRow label="balance" value={formatMoney(loan.balance)} />
              <InfoRow
                label="opening balance"
                value={
                  loan.openingBalance == null
                    ? "—"
                    : formatMoney(loan.openingBalance)
                }
              />
              <InfoRow label="fines" value={formatMoney(loan.finesTotal)} />
              <InfoRow
                label="repayments"
                value={String(loan.repaymentsCount)}
              />
            </dl>
          </section>

          <section className="panel bg-white px-3 py-3">
            <h3 className="mb-2 text-xs font-bold lowercase tracking-[0.08em] text-slate-500">
              dates
            </h3>
            <dl className="divide-y divide-[var(--line)]">
              <InfoRow label="disbursed" value={formatDate(loan.disbursedAt)} />
              <InfoRow
                label="payment starts"
                value={formatDate(loan.paymentStartDate)}
              />
              <InfoRow
                label="last payment"
                value={formatDateTime(loan.lastPaymentAt)}
              />
              <InfoRow label="created" value={formatDate(loan.createdAt)} />
              <InfoRow label="updated" value={formatDateTime(loan.updatedAt)} />
            </dl>
          </section>

          <section className="panel bg-white px-3 py-3">
            <h3 className="mb-2 text-xs font-bold lowercase tracking-[0.08em] text-slate-500">
              field officer
            </h3>
            <dl className="divide-y divide-[var(--line)]">
              <InfoRow label="name" value={loan.officerName} />
              <InfoRow label="agent id" value={loan.officerPublicId} />
            </dl>
          </section>

          <section className="panel overflow-hidden bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[#eef3f0] px-3 py-2.5">
              <h3 className="text-xs font-bold lowercase tracking-[0.08em] text-slate-500">
                loan documents
              </h3>
              <span className="text-[10px] font-bold lowercase tracking-[0.06em] text-slate-500">
                {documents.length} file{documents.length === 1 ? "" : "s"}
              </span>
            </div>
            {documents.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">
                no loan documents uploaded.
              </p>
            ) : (
              <div className="grid gap-3 p-3 sm:grid-cols-2">
                {documents.map((document) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    onPreview={onPreviewDocument}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function DocumentCard({
  document,
  onPreview,
}: {
  document: ClientDocument;
  onPreview: (document: ClientDocument) => void;
}) {
  const label = documentLabel(document.type);
  const canPreviewImage = Boolean(document.downloadUrl) && isImageDocument(document);
  const canPreviewPdf =
    Boolean(document.downloadUrl) && document.mimeType === "application/pdf";

  return (
    <article className="overflow-hidden border border-[var(--line)] bg-white shadow-[0_6px_18px_rgba(20,33,61,0.05)]">
      <div className="h-40 border-b border-[var(--line)] bg-white">
        {canPreviewImage ? (
          <button
            type="button"
            className="block h-full w-full cursor-zoom-in"
            onClick={() => onPreview(document)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={document.downloadUrl!}
              alt={label}
              className="h-full w-full object-contain"
            />
          </button>
        ) : canPreviewPdf ? (
          <iframe
            src={document.downloadUrl!}
            title={label}
            className="h-full w-full bg-white"
          />
        ) : (
          <div className="grid h-full place-items-center px-3 text-center">
            <div>
              <FileText className="mx-auto size-7 text-[var(--forest-emerald)]" />
              <p className="mt-2 line-clamp-2 text-xs font-semibold text-[var(--midnight-navy)]">
                {label}
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-[var(--midnight-navy)]">
            {label}
          </p>
          <p className="truncate text-[11px] text-slate-500">
            {[documentKind(document), formatBytes(document.byteSize)]
              .filter(Boolean)
              .join(" · ") || document.mimeType}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {document.downloadUrl ? (
            <a
              href={document.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost h-8 px-2 text-[11px]"
            >
              <ExternalLink className="size-3.5" />
              open
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function DocumentPreview({
  document,
  onClose,
}: {
  document: ClientDocument;
  onClose: () => void;
}) {
  if (!document.downloadUrl) return null;
  const label = documentLabel(document.type);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="close preview"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[90vh] max-w-[92vw] bg-white">
        <button
          type="button"
          className="absolute -right-2 -top-2 grid size-9 place-items-center bg-white shadow"
          onClick={onClose}
          aria-label="close"
        >
          <X className="size-4" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={document.downloadUrl}
          alt={label}
          className="max-h-[85vh] max-w-[90vw] object-contain"
        />
      </div>
    </div>
  );
}

function formatMoney(value: number) {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-UG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function methodLabel(method: string) {
  if (method === "MOBILE_MONEY") return "mobile money";
  if (method === "BANK_TRANSFER") return "bank";
  if (method === "CASH") return "cash";
  return method;
}

function clientStatusLabel(client: ClientDetail) {
  if (client.loans.length === 0) return "active";
  return client.loans.every((loan) => loanStatusLabel(loan) === "completed")
    ? "completed"
    : "active";
}

function loanStatusLabel(loan: ClientLoan) {
  if (loan.balance <= 0) return "completed";
  if (loan.status === "CLOSED" || loan.status === "WRITTEN_OFF") {
    return "completed";
  }
  return "active";
}

function loanStatusTone(loan: ClientLoan) {
  return loanStatusLabel(loan) === "completed"
    ? "border-slate-200 bg-slate-50 text-slate-600"
    : "border-emerald-200 bg-emerald-50 text-[var(--forest-emerald)]";
}

function latestIdentityDocuments(documents: ClientDocument[]) {
  const byType = new Map<string, ClientDocument>();
  for (const document of [...documents].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )) {
    if (!isClientIdentityDocument(document.type)) continue;
    if (!byType.has(document.type)) byType.set(document.type, document);
  }
  return ["NIN_FRONT", "NIN_BACK"]
    .map((type) => byType.get(type))
    .filter((document): document is ClientDocument => Boolean(document));
}

function loanDocuments(documents: ClientDocument[], loan: ClientLoan) {
  return documents.filter((document) => {
    if (isClientIdentityDocument(document.type)) return false;
    if (document.loanId) return document.loanId === loan.id;
    return Boolean(loan.applicationId && document.applicationId === loan.applicationId);
  });
}

function isClientIdentityDocument(type: string) {
  return type === "NIN_FRONT" || type === "NIN_BACK";
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function documentLabel(type: string) {
  const labels: Record<string, string> = {
    PASSPORT: "applicant photo",
    NIN_FRONT: "national id front",
    NIN_BACK: "national id back",
    GUARANTOR_NIN_FRONT: "guarantor id front",
    GUARANTOR_NIN_BACK: "guarantor id back",
    COLLATERAL_DOC: "collateral document",
    SUPPORTING_DOC: "supporting document",
    OTHER_DOC: "other document",
    SIGNATURE_APPLICANT: "applicant signature",
    SIGNATURE_GUARANTOR: "guarantor signature",
    SIGNATURE_OFFICER: "officer signature",
  };

  return (
    labels[type] ??
    type
      .toLowerCase()
      .split("_")
      .map((word) => word)
      .join(" ")
  );
}

function documentKind(document: ClientDocument) {
  if (isImageDocument(document)) return "image";
  if (document.mimeType === "application/pdf") return "pdf";
  return "file";
}

function isImageDocument(document: ClientDocument) {
  return (
    document.mimeType.startsWith("image/") ||
    document.type === "PASSPORT" ||
    document.type === "NIN_FRONT" ||
    document.type === "NIN_BACK" ||
    document.type === "GUARANTOR_NIN_FRONT" ||
    document.type === "GUARANTOR_NIN_BACK" ||
    document.type.startsWith("SIGNATURE_")
  );
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
