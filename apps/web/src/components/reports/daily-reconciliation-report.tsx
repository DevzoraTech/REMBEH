"use client";

import {
  ArrowDown,
  ArrowUp,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  Scale,
  Send,
  WalletCards,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  formatDate,
  formatMoneyAmount,
  formatNumber,
  titleCase,
} from "../../app/owner/owner-common";
import { dailyReportCode } from "./reports-filters";

export type DailyReportViewTab =
  "summary" | "ledger" | "agent-handover" | "expenses" | "review-history";

export type DailyReportStatus =
  "MANAGER_REVIEW" | "SENT_TO_OWNER" | "OWNER_APPROVED" | "RETURNED_TO_MANAGER";

export type DailyReportDocumentModel = {
  reportNumber: string;
  displayReportNumber?: string;
  branchName: string;
  operationDate: string;
  status: DailyReportStatus;
  preparedBy: string;
  preparedOn: string;
  currency: string;
  expectedClosingBalance: number;
  countedCash: number | null;
  variance: number | null;
  openingBalance: number;
  topUpsTotal: number;
  previousReportReference: {
    reportNumber: string;
    operationDate: string;
    amount: number;
  } | null;
  topUps: Array<{
    id: string;
    source: string;
    reference: string | null;
    date: string;
    amount: number;
  }>;
  repaymentsByProduct: Array<{
    product: string;
    transactions: number;
    amount: number;
  }>;
  feesByProduct: Array<{
    product: string;
    transactions: number;
    amount: number;
  }>;
  loansByProduct: Array<{
    product: string;
    count: number;
    amount: number;
    recoveredToday: number;
    outstandingBalance: number;
  }>;
  loansIssued: Array<{
    id: string;
    loanId: string | null;
    borrowerName: string;
    borrowerPhone: string | null;
    product: string;
    principalAmount: number;
    processingFee: number;
    recoveredToday: number;
    outstandingBalance: number;
    issuedAt: string;
    officerName: string;
    officerPublicId: string | null;
    durationDays: number | null;
    purpose: string | null;
  }>;
  repayments: Array<{
    id: string;
    loanId: string;
    borrowerName: string;
    borrowerPhone: string | null;
    product: string;
    amount: number;
    paidAt: string;
    method: string;
    receiptNumber: string | null;
    recordedByName: string;
    recordedByPublicId: string | null;
    note: string | null;
  }>;
  processingFees: Array<{
    id: string;
    loanId: string | null;
    borrowerName: string;
    product: string;
    amount: number;
    receivedAt: string;
    officerName: string;
  }>;
  variances: Array<{
    id: string;
    source: string;
    personName: string;
    personPublicId: string | null;
    expectedAmount: number | null;
    actualAmount: number | null;
    variance: number;
    shortageAmount: number | null;
    outstandingAmount: number | null;
    status: string;
    notes: string | null;
    clearedByName?: string | null;
    clearedAt?: string | null;
    occurredAt: string;
  }>;
  floatIssued: number;
  agentsWithFloatCount: number;
  cashReturnedByAgents: number;
  agentsReturnedCount: number;
  agentReturnVariance: number;
  loansIssuedCount: number;
  loansIssuedPrincipal: number;
  collectionsCount: number;
  collectionsReceived: number;
  processingFeesTotal: number;
  expensesTotal: number;
  expensesCount: number;
  salariesTotal?: number;
  salariesCount?: number;
  shortageRecoveriesTotal?: number;
  shortageRecoveriesCount?: number;
  shortageRecoveries?: Array<{
    employeeName: string;
    amount: number;
  }>;
  expenses: Array<{
    id: string;
    category: string;
    amount: number;
    description: string | null;
    incurredAt: string;
    recordedByName: string;
    paidFrom?: "BRANCH_CASH" | "AGENT_FLOAT";
    agentName?: string | null;
  }>;
  agentReturns: Array<{
    floatId: string;
    agentName: string;
    amountGiven: number;
    amountDisbursed: number;
    amountCollected: number;
    collectedRepaymentsAvailable?: number;
    unusedFloat?: number;
    processingFees: number;
    expensesTotal?: number;
    expectedReturn: number;
    amountReturned: number | null;
    variance: number | null;
    status: string;
  }>;
  closingNotes: string | null;
  managerReviewedAt: string | null;
  managerReviewedByName: string | null;
  managerNotes: string | null;
  ownerApprovedAt: string | null;
  ownerApprovedByName: string | null;
  ownerNotes: string | null;
  returnedAt: string | null;
  returnedByName: string | null;
  returnNotes: string | null;
  generatedAt: string;
};

export function documentReportStatusLabel(status: string) {
  if (status === "MANAGER_REVIEW") return "Ready to send";
  if (status === "SENT_TO_OWNER") return "Awaiting Approval";
  if (status === "OWNER_APPROVED") return "Approved";
  if (status === "RETURNED_TO_MANAGER") return "Returned";
  return status.replaceAll("_", " ");
}

export function DailyReconciliationReport({
  document,
  mode,
  tab,
  onTabChange,
  comment,
  onCommentChange,
  acting = false,
  exporting = false,
  onExportExcel,
  onExportPdf,
  onPrimaryAction,
  showBack = false,
  onBack,
  className = "",
}: {
  document: DailyReportDocumentModel;
  mode: "manager" | "owner" | "readonly";
  tab: DailyReportViewTab;
  onTabChange: (tab: DailyReportViewTab) => void;
  comment: string;
  onCommentChange: (value: string) => void;
  acting?: boolean;
  exporting?: boolean;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onPrimaryAction?: () => void;
  showBack?: boolean;
  onBack?: () => void;
  className?: string;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const reportCode =
    document.displayReportNumber ??
    dailyReportCode(document.operationDate) ??
    document.reportNumber;
  const canManagerSend =
    mode === "manager" &&
    (document.status === "MANAGER_REVIEW" ||
      document.status === "RETURNED_TO_MANAGER");
  const canOwnerApprove =
    mode === "owner" && document.status === "SENT_TO_OWNER";
  const primaryLabel = canManagerSend
    ? "Send to Owner"
    : canOwnerApprove
      ? "Approve Report"
      : null;

  return (
    <div className={`space-y-3 ${className}`}>
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-[#0b1220]"
        >
          <ChevronLeft className="size-4" />
          Back to Daily Reports
        </button>
      ) : null}

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-xl bg-emerald-50 text-[var(--forest-emerald)]">
            <FileText className="size-4" />
          </span>
          <h1 className="text-lg font-bold tracking-[-0.02em] text-[#0b1220]">
            Daily Report
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              disabled={exporting}
              aria-expanded={exportOpen}
              aria-haspopup="menu"
              onClick={() => setExportOpen((open) => !open)}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3.5 text-xs font-semibold text-[#0b1220] shadow-[0_6px_14px_rgba(15,23,42,0.04)] transition hover:bg-[#f8faf9] disabled:opacity-55"
            >
              {exporting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Export
            </button>
            {exportOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  aria-label="Close export menu"
                  onClick={() => setExportOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-1.5 w-[200px] rounded-xl border border-[#e6ebf0] bg-white p-1 shadow-[0_14px_34px_rgba(15,23,42,0.16)]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6]"
                    onClick={() => {
                      setExportOpen(false);
                      onExportExcel();
                    }}
                  >
                    <FileSpreadsheet className="size-3.5 text-slate-500" />
                    Excel
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6]"
                    onClick={() => {
                      setExportOpen(false);
                      onExportPdf();
                    }}
                  >
                    <FileText className="size-3.5 text-slate-500" />
                    PDF document
                  </button>
                </div>
              </>
            ) : null}
          </div>
          {primaryLabel && onPrimaryAction ? (
            <button
              type="button"
              disabled={acting}
              onClick={onPrimaryAction}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-4 text-xs font-bold text-white shadow-[0_10px_22px_rgba(15,143,104,0.28)] transition hover:brightness-105 disabled:opacity-55"
            >
              {acting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              {primaryLabel}
            </button>
          ) : null}
        </div>
      </header>

      <nav className="flex gap-5 overflow-x-auto border-b border-[#e6ebf0]">
        {(
          [
            ["summary", "Summary"],
            ["ledger", "Ledger"],
            ["agent-handover", "Officer handover"],
            ["expenses", "Expenses"],
            ["review-history", "Review History"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={`relative shrink-0 pb-3 text-sm font-semibold transition ${
              tab === id
                ? "text-[var(--forest-emerald)]"
                : "text-slate-500 hover:text-[#0b1220]"
            }`}
          >
            {label}
            {tab === id ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--forest-emerald)]" />
            ) : null}
          </button>
        ))}
      </nav>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {tab === "summary" ? (
            <SummaryDocument document={document} reportCode={reportCode} />
          ) : null}
          {tab === "ledger" ? <LedgerTab document={document} /> : null}
          {tab === "agent-handover" ? (
            <AgentHandoverTab document={document} />
          ) : null}
          {tab === "expenses" ? <ExpensesTab document={document} /> : null}
          {tab === "review-history" ? (
            <ReviewHistoryTab document={document} />
          ) : null}
        </div>

        <ReviewSidebar
          document={document}
          mode={mode}
          comment={comment}
          onCommentChange={onCommentChange}
          acting={acting}
          canManagerSend={canManagerSend}
          canOwnerApprove={canOwnerApprove}
          primaryLabel={primaryLabel}
          onPrimaryAction={onPrimaryAction}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone =
    status === "OWNER_APPROVED" || status === "MANAGER_REVIEW"
      ? "bg-emerald-50 text-[var(--forest-emerald)] ring-emerald-100"
      : status === "RETURNED_TO_MANAGER"
        ? "bg-red-50 text-red-700 ring-red-100"
        : "bg-amber-50 text-amber-700 ring-amber-100";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ring-1 ring-inset ${tone}`}
    >
      <CheckCircle2 className="size-3.5" />
      {label}
    </span>
  );
}

function SummaryDocument({
  document,
  reportCode,
}: {
  document: DailyReportDocumentModel;
  reportCode: string;
}) {
  const currency = document.currency;
  const counted = document.countedCash;

  const agentsPending = document.agentReturns.filter(
    (row) => row.amountReturned == null,
  ).length;
  const agentsBalanced = document.agentReturns.filter(
    (row) => row.amountReturned != null && Math.round(row.variance ?? 0) === 0,
  ).length;
  const agentsWithVariance = document.agentReturns.filter(
    (row) => row.amountReturned != null && Math.round(row.variance ?? 0) !== 0,
  ).length;
  const agentTotal =
    agentsPending + agentsBalanced + agentsWithVariance ||
    document.agentsWithFloatCount;

  const topUpsTotal = Math.round(
    document.topUpsTotal ||
      document.topUps.reduce((sum, row) => sum + row.amount, 0),
  );
  const repaymentsRows = reconcileProductRows(
    document.repaymentsByProduct.map((row) => ({
      product: row.product,
      transactions: row.transactions,
      amount: row.amount,
    })),
    "Loan repayments",
    document.collectionsCount,
    document.collectionsReceived,
  );
  const feesRows = reconcileProductRows(
    document.feesByProduct.map((row) => ({
      product: row.product,
      transactions: row.transactions,
      amount: row.amount,
    })),
    "Loan processing fees",
    document.feesByProduct.reduce((sum, row) => sum + row.transactions, 0) ||
      (document.processingFeesTotal > 0 ? document.loansIssuedCount : 0),
    document.processingFeesTotal,
  );
  const loansRows = reconcileLoanRows(
    document.loansByProduct,
    document.loansIssuedCount,
    document.loansIssuedPrincipal,
  );
  const expensesByCategory = groupExpenses(document.expenses);
  const expenseCategoryTotal = expensesByCategory.reduce(
    (sum, row) => sum + row.amount,
    0,
  );
  const expenseCategoryCount = expensesByCategory.reduce(
    (sum, row) => sum + row.count,
    0,
  );

  // Authoritative expected-close formula (same as API):
  // opening + top-ups + repayments + fees + shortage recoveries − loans − expenses − salaries
  const salariesTotal = document.salariesTotal ?? 0;
  const movementExpected = Math.round(
    document.openingBalance +
      topUpsTotal +
      document.collectionsReceived +
      document.processingFeesTotal +
      (document.shortageRecoveriesTotal ?? 0) -
      document.loansIssuedPrincipal -
      document.expensesTotal -
      salariesTotal,
  );
  // Prefer API expected; they must match — if they don't, show computed from movements
  // so the table never contradicts its own rows.
  const closingFromMovement = movementExpected;
  const expectedShown = closingFromMovement;
  const varianceShown =
    counted == null ? null : Math.round(counted - expectedShown);

  const feesEntryCount = feesRows.reduce(
    (sum, row) => sum + row.transactions,
    0,
  );

  const showOpeningDetail =
    Math.round(document.openingBalance) !== 0 ||
    Boolean(document.previousReportReference);
  const showTopUpsDetail = topUpsTotal !== 0 || document.topUps.length > 0;
  const showRepaymentsDetail =
    Math.round(document.collectionsReceived) !== 0 ||
    document.collectionsCount > 0 ||
    document.repayments.length > 0;
  const showFeesDetail =
    Math.round(document.processingFeesTotal) !== 0 ||
    document.processingFees.length > 0;
  const showLoansDetail =
    Math.round(document.loansIssuedPrincipal) !== 0 ||
    document.loansIssuedCount > 0 ||
    document.loansIssued.length > 0;
  const showExpensesDetail =
    Math.round(document.expensesTotal) !== 0 || document.expensesCount > 0;
  const showFloatDetail = Math.round(document.floatIssued) !== 0;
  const showVarianceDetail =
    document.variances.length > 0 || Math.round(varianceShown ?? 0) !== 0;

  return (
    <article className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white text-[12px] shadow-[0_14px_34px_rgba(15,23,42,0.05)] sm:text-[13px]">
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-center text-[13px] font-bold uppercase tracking-[0.08em] text-[#0b1220]">
            Daily Reconciliation Report
          </h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-[#e6ebf0]">
            <dl className="grid grid-cols-1 sm:grid-cols-2">
              <MetaCell label="Report ID" value={reportCode} />
              <MetaCell label="Prepared By" value={document.preparedBy} />
              <MetaCell label="Branch" value={document.branchName} />
              <MetaCell
                label="Report Status"
                value={
                  <span className="font-semibold text-[var(--forest-emerald)]">
                    {documentReportStatusLabel(document.status)}
                  </span>
                }
              />
              <MetaCell
                label="Operations Date"
                value={formatDate(document.operationDate)}
              />
              <MetaCell
                label="Prepared On"
                value={formatDateTime(document.preparedOn)}
              />
            </dl>
          </div>
        </div>

        <Section title="Cash Position">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <CashCard
              icon={<WalletCards className="size-4" />}
              label="Expected Cash"
              value={amt(expectedShown)}
              currency={currency}
            />
            <CashCard
              icon={<Banknote className="size-4" />}
              label="Counted Cash"
              value={amt(counted ?? 0)}
              currency={currency}
            />
            <CashCard
              icon={<Scale className="size-4" />}
              label="Cash Variance"
              value={amt(Math.abs(varianceShown ?? 0))}
              currency={currency}
              badge={
                varianceShown == null || varianceShown === 0 ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--forest-emerald)]">
                    Balanced <Info className="size-3" />
                  </span>
                ) : varianceShown > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--forest-emerald)]">
                    Excess <Info className="size-3" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-red-600">
                    Shortage — assign & track until cleared{" "}
                    <Info className="size-3" />
                  </span>
                )
              }
            />
          </div>
        </Section>

        <Section title="Cash Position Summary">
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            <ReportMovementBlock
              title="ADDITIONS"
              icon={<ArrowUp className="size-3.5" />}
              tone="green"
              rows={[
                { label: "Opening Balance", amount: document.openingBalance },
                { label: "Capital received", amount: topUpsTotal },
                {
                  label: "Cash in",
                  amount: document.collectionsReceived,
                  signed: "plus",
                },
                {
                  label: "Processing fees",
                  amount: document.processingFeesTotal,
                  signed: "plus",
                },
                {
                  label: "Shortage cleared",
                  amount: document.shortageRecoveriesTotal ?? 0,
                  signed: "plus",
                },
              ]}
              totalLabel="Total Additions"
              totalAmount={
                document.collectionsReceived +
                document.processingFeesTotal +
                (document.shortageRecoveriesTotal ?? 0)
              }
              currency={currency}
            />
            <ReportMovementBlock
              title="CASHOUTS"
              icon={<ArrowDown className="size-3.5" />}
              tone="rose"
              rows={[
                {
                  label: "Total Expenses",
                  amount: document.expensesTotal,
                  signed: "minus",
                },
                {
                  label: "Salary",
                  amount: document.salariesTotal ?? 0,
                  signed: "minus",
                },
              ]}
              totalLabel="Total Cashouts"
              totalAmount={
                document.expensesTotal + (document.salariesTotal ?? 0)
              }
              currency={currency}
            />
          </div>
          <p className="mt-1.5 text-[12px] italic text-slate-500">
            Expected closing balance = Opening Balance + Capital received +
            Cash in + Processing fees + Shortage cleared − Total Expenses −
            Salary. Loans and unused float are balanced on field-officer
            handover and are not shown here.
          </p>
        </Section>

        {showOpeningDetail ? (
          <Section title="Balance Carried Forward Reference">
            <ReportTable
              columns={[
                "Reference",
                "Description",
                "Date",
                `Amount (${currency})`,
              ]}
              align={[false, false, false, true]}
              rows={[
                [
                  document.previousReportReference?.reportNumber ??
                    "Opening capital",
                  "Daily reconciliation report",
                  formatDate(
                    document.previousReportReference?.operationDate ??
                      document.operationDate,
                  ),
                  amt(document.openingBalance),
                ],
              ]}
            />
          </Section>
        ) : null}

        {showTopUpsDetail ? (
          <Section title="Capital top-ups">
            <ReportTable
              columns={[
                "#",
                "Source",
                "Receipt / Reference",
                "Date",
                `Amount (${currency})`,
              ]}
              align={[true, false, false, false, true]}
              rows={document.topUps.map((row, index) => [
                String(index + 1),
                row.source,
                row.reference || "—",
                formatDate(row.date),
                <span
                  key={row.id}
                  className="font-semibold text-[var(--forest-emerald)]"
                >
                  {amt(row.amount)}
                </span>,
              ])}
              footer={[
                "",
                "Total capital top-ups",
                "",
                "",
                <span
                  key="t"
                  className="font-bold text-[var(--forest-emerald)]"
                >
                  {amt(topUpsTotal)}
                </span>,
              ]}
            />
          </Section>
        ) : null}

        {showRepaymentsDetail ? (
          <Section title="Repayments Collected">
            <ReportTable
              columns={[
                "#",
                "Scheme / Product",
                "Transactions",
                `Amount (${currency})`,
              ]}
              align={[true, false, true, true]}
              rows={repaymentsRows.map((row, index) => [
                String(index + 1),
                row.product,
                formatNumber(row.transactions),
                amt(row.amount),
              ])}
              footer={[
                "",
                "Total Repayments Collected",
                formatNumber(document.collectionsCount),
                <span
                  key="t"
                  className="font-bold text-[var(--forest-emerald)]"
                >
                  {amt(document.collectionsReceived)}
                </span>,
              ]}
            />
          </Section>
        ) : null}

        {document.repayments.length > 0 ? (
          <Section title="Repayment Records">
            <ReportTable
              columns={[
                "#",
                "Borrower",
                "Product",
                `Amount (${currency})`,
                "Time",
                "Recorded By",
                "Receipt",
              ]}
              align={[true, false, false, true, false, false, false]}
              rows={document.repayments.map((row, index) => [
                String(index + 1),
                row.borrowerName,
                row.product,
                <span
                  key={row.id}
                  className="font-semibold text-[var(--forest-emerald)]"
                >
                  {amt(row.amount)}
                </span>,
                formatDateTime(row.paidAt),
                row.recordedByName,
                row.receiptNumber || "—",
              ])}
            />
          </Section>
        ) : null}

        {showFeesDetail ? (
          <Section title="Processing Fees Received">
            <ReportTable
              columns={[
                "#",
                "Scheme / Product",
                "Transactions",
                `Amount (${currency})`,
              ]}
              align={[true, false, true, true]}
              rows={feesRows.map((row, index) => [
                String(index + 1),
                row.product,
                formatNumber(row.transactions),
                amt(row.amount),
              ])}
              footer={[
                "",
                "Total Processing Fees Received",
                formatNumber(feesEntryCount),
                <span
                  key="t"
                  className="font-bold text-[var(--forest-emerald)]"
                >
                  {amt(document.processingFeesTotal)}
                </span>,
              ]}
            />
          </Section>
        ) : null}

        {document.processingFees.length > 0 ? (
          <Section title="Processing Fee Records">
            <ReportTable
              columns={[
                "#",
                "Borrower",
                "Product",
                `Amount (${currency})`,
                "Time",
                "Officer",
              ]}
              align={[true, false, false, true, false, false]}
              rows={document.processingFees.map((row, index) => [
                String(index + 1),
                row.borrowerName,
                row.product,
                <span
                  key={row.id}
                  className="font-semibold text-[var(--forest-emerald)]"
                >
                  {amt(row.amount)}
                </span>,
                formatDateTime(row.receivedAt),
                row.officerName,
              ])}
            />
          </Section>
        ) : null}

        <Section title="Officer handover and Reconciliation">
          <ReportTable
            columns={[
              "Description",
              "Total Field Officers",
              "Field Officers Balanced",
              "Field Officers with Variance",
              `Total Variance (${currency})`,
            ]}
            align={[false, true, true, true, true]}
            rows={[
              [
                "Daily handover reconciliation",
                String(agentTotal),
                String(agentsBalanced),
                String(agentsWithVariance),
                <span
                  key="v"
                  className={
                    document.agentReturnVariance !== 0
                      ? "font-bold text-red-600"
                      : "font-bold text-[#0b1220]"
                  }
                >
                  {document.agentReturnVariance !== 0
                    ? `(${amt(Math.abs(document.agentReturnVariance))})`
                    : amt(0)}
                </span>,
              ],
            ]}
          />
          {agentsPending > 0 ? (
            <p className="mt-1.5 text-[12px] text-slate-500">
              {agentsPending} agent{agentsPending === 1 ? "" : "s"} still
              pending handover.
            </p>
          ) : null}
        </Section>

        {showVarianceDetail ? (
          <Section title="Variance Details">
            <ReportTable
              columns={[
                "#",
                "Source",
                "Person",
                `Expected (${currency})`,
                `Actual (${currency})`,
                `Variance (${currency})`,
                "Status",
                "Notes",
              ]}
              align={[true, false, false, true, true, true, false, false]}
              rows={document.variances.map((row, index) => [
                String(index + 1),
                row.source,
                row.personName,
                row.expectedAmount == null ? "—" : amt(row.expectedAmount),
                row.actualAmount == null ? "—" : amt(row.actualAmount),
                <span
                  key={row.id}
                  className={
                    row.variance < 0
                      ? "font-bold text-red-600"
                      : "font-bold text-[var(--forest-emerald)]"
                  }
                >
                  {row.variance < 0
                    ? `(${amt(Math.abs(row.variance))})`
                    : amt(row.variance)}
                </span>,
                titleCase(row.status.replaceAll("_", " ")),
                row.clearedByName
                  ? `Shortage cleared by ${row.clearedByName}`
                  : row.notes || "—",
              ])}
              footer={[
                "",
                "Variance total",
                "",
                "",
                "",
                <strong
                  key="variance-total"
                  className={
                    document.variances.reduce(
                      (sum, row) => sum + row.variance,
                      0,
                    ) < 0
                      ? "text-red-600"
                      : "text-[var(--forest-emerald)]"
                  }
                >
                  {(() => {
                    const total = document.variances.reduce(
                      (sum, row) => sum + row.variance,
                      0,
                    );
                    return total < 0 ? `(${amt(Math.abs(total))})` : amt(total);
                  })()}
                </strong>,
                "",
                "",
              ]}
              empty="No variances recorded."
            />
          </Section>
        ) : null}

        {showLoansDetail ? (
          <Section title="Loans Issued">
            <ReportTable
              columns={[
                "Product Type",
                "Loans Issued",
                `Total Amount (${currency})`,
                `Recovered Today (${currency})`,
                `Outstanding Balance (${currency})`,
              ]}
              align={[false, true, true, true, true]}
              rows={loansRows.map((row) => [
                row.product,
                formatNumber(row.count),
                amt(row.amount),
                amt(row.recoveredToday),
                <span
                  key={row.product}
                  className="font-semibold text-[var(--forest-emerald)]"
                >
                  {amt(row.outstandingBalance)}
                </span>,
              ])}
              footer={[
                "Total",
                <strong key="c">
                  {formatNumber(document.loansIssuedCount)}
                </strong>,
                <strong key="a">{amt(document.loansIssuedPrincipal)}</strong>,
                <strong key="r">
                  {amt(
                    loansRows.reduce((sum, row) => sum + row.recoveredToday, 0),
                  )}
                </strong>,
                <strong key="o" className="text-[var(--forest-emerald)]">
                  {amt(
                    loansRows.reduce(
                      (sum, row) => sum + row.outstandingBalance,
                      0,
                    ),
                  )}
                </strong>,
              ]}
            />
          </Section>
        ) : null}

        {document.loansIssued.length > 0 ? (
          <Section title="Loan Records">
            <ReportTable
              columns={[
                "#",
                "Borrower",
                "Product",
                `Principal (${currency})`,
                `Recovered (${currency})`,
                `Balance (${currency})`,
                "Officer",
                "Time",
              ]}
              align={[true, false, false, true, true, true, false, false]}
              rows={document.loansIssued.map((row, index) => [
                String(index + 1),
                row.borrowerName,
                row.product,
                <span
                  key={`${row.id}-p`}
                  className="font-semibold text-red-600"
                >
                  {amt(row.principalAmount)}
                </span>,
                amt(row.recoveredToday),
                <span
                  key={`${row.id}-b`}
                  className="font-semibold text-[var(--forest-emerald)]"
                >
                  {amt(row.outstandingBalance)}
                </span>,
                row.officerName,
                formatDateTime(row.issuedAt),
              ])}
            />
          </Section>
        ) : null}

        {showFloatDetail ? (
          <Section title="Float Distributed to Field Officers">
            <ReportTable
              columns={["Description", "Agents", `Total Float (${currency})`]}
              align={[false, true, true]}
              rows={[
                [
                  "Float distributed to field officers",
                  String(document.agentsWithFloatCount),
                  amt(document.floatIssued),
                ],
              ]}
              footer={[
                "Total",
                <strong key="a">{document.agentsWithFloatCount}</strong>,
                <strong key="f">{amt(document.floatIssued)}</strong>,
              ]}
            />
          </Section>
        ) : null}

        {showExpensesDetail ? (
          <Section title="Expenses Recorded">
            <ReportTable
              columns={[
                "Expense Category",
                "No. of Transactions",
                `Total Amount (${currency})`,
              ]}
              align={[false, true, true]}
              rows={expensesByCategory.map((row) => [
                row.category,
                formatNumber(row.count),
                amt(row.amount),
              ])}
              footer={[
                "Total",
                <strong key="c">
                  {formatNumber(expenseCategoryCount || document.expensesCount)}
                </strong>,
                <strong key="a">{amt(document.expensesTotal)}</strong>,
              ]}
            />
          </Section>
        ) : null}

        <Section title="Report Review History">
          <ReportTable
            columns={[
              "Reviewed By",
              "Role",
              "Action",
              "Review Date",
              "Comment",
            ]}
            align={[false, false, false, false, false]}
            rows={buildReviewHistory(document)}
            empty="No review history yet."
          />
        </Section>

        <Section title="Owner Review">
          <ReportTable
            columns={[
              "Reviewed By",
              "Role",
              "Review Date",
              "Status",
              "Comment",
            ]}
            align={[false, false, false, false, false]}
            rows={[
              document.ownerApprovedAt
                ? [
                    document.ownerApprovedByName ?? "Owner",
                    "Owner",
                    formatDateTime(document.ownerApprovedAt),
                    <span
                      key="s"
                      className="font-semibold text-[var(--forest-emerald)]"
                    >
                      Approved
                    </span>,
                    document.ownerNotes || "—",
                  ]
                : [
                    "—",
                    "—",
                    "—",
                    <span key="s" className="font-bold text-amber-700">
                      Pending
                    </span>,
                    "—",
                  ],
            ]}
          />
        </Section>
      </div>
    </article>
  );
}

function ReviewSidebar({
  document,
  mode,
  comment,
  onCommentChange,
  acting,
  canManagerSend,
  canOwnerApprove,
  primaryLabel,
  onPrimaryAction,
}: {
  document: DailyReportDocumentModel;
  mode: "manager" | "owner" | "readonly";
  comment: string;
  onCommentChange: (value: string) => void;
  acting: boolean;
  canManagerSend: boolean;
  canOwnerApprove: boolean;
  primaryLabel: string | null;
  onPrimaryAction?: () => void;
}) {
  const cashCounted = document.countedCash != null;
  const handoversDone =
    document.agentsWithFloatCount === 0 ||
    document.agentReturns.every((row) => row.amountReturned != null);
  const expensesReviewed = true;
  const noteAdded = Boolean(
    document.closingNotes?.trim() || document.managerNotes?.trim(),
  );
  const allPassed =
    cashCounted && handoversDone && expensesReviewed && noteAdded;
  const statusLabel = documentReportStatusLabel(document.status);
  const showComment = canManagerSend || canOwnerApprove;

  return (
    <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
      <section className="rounded-[16px] border border-[#e6ebf0] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#0b1220]">Review Status</h3>
          <StatusBadge status={document.status} label={statusLabel} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {document.status === "MANAGER_REVIEW" ||
          document.status === "RETURNED_TO_MANAGER"
            ? allPassed
              ? "All validations passed. You can send this report to the owner."
              : "Complete the remaining checks before sending to the owner."
            : document.status === "SENT_TO_OWNER"
              ? mode === "owner"
                ? "Review the figures and approve when everything looks correct."
                : "Waiting for the owner to review and approve this report."
              : document.status === "OWNER_APPROVED"
                ? "This report has been approved and saved."
                : "Review this report."}
        </p>
        <ul className="mt-4 space-y-3">
          <CheckItem
            ok={cashCounted}
            title="Cash counted"
            detail="Cash has been counted and recorded"
          />
          <CheckItem
            ok={handoversDone}
            title="Officer handovers completed"
            detail={
              handoversDone
                ? "All agent handovers are balanced"
                : "Some agent handovers are still outstanding"
            }
          />
          <CheckItem
            ok={expensesReviewed}
            title="Expenses reviewed"
            detail="All expenses have been reviewed"
          />
          <CheckItem
            ok={noteAdded}
            title="Closing note added"
            detail={
              noteAdded
                ? "Manager's closing note added"
                : "Add a closing note before sending"
            }
          />
        </ul>
      </section>

      {showComment ? (
        <section className="rounded-[16px] border border-[#e6ebf0] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <label className="text-sm font-bold text-[#0b1220]">
            {canManagerSend
              ? "Owner Comment (Optional)"
              : "Approval Comment (Optional)"}
          </label>
          <div className="relative mt-2">
            <textarea
              value={comment}
              maxLength={500}
              rows={4}
              onChange={(event) => onCommentChange(event.target.value)}
              placeholder={
                canManagerSend
                  ? "Add a comment for the owner..."
                  : "Add an approval comment..."
              }
              className="w-full resize-none rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 py-2.5 text-sm text-[#0b1220] outline-none ring-[var(--forest-emerald)] placeholder:text-slate-400 focus:ring-2"
            />
            <span className="pointer-events-none absolute bottom-2.5 right-3 text-[10px] font-semibold text-slate-400">
              {comment.length}/500
            </span>
          </div>
          {primaryLabel && onPrimaryAction ? (
            <>
              <button
                type="button"
                disabled={acting}
                onClick={onPrimaryAction}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] text-sm font-bold text-white shadow-[0_10px_22px_rgba(15,143,104,0.28)] transition hover:brightness-105 disabled:opacity-55"
              >
                {acting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {primaryLabel}
              </button>
              <p className="mt-2 text-center text-[11px] text-slate-500">
                {canManagerSend
                  ? "This will notify the owner to review this report."
                  : "This will finalize and save the approved report."}
              </p>
            </>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}

function LedgerTab({ document }: { document: DailyReportDocumentModel }) {
  const rows = buildLedgerRows(document);
  return (
    <article className="overflow-hidden rounded-[16px] border border-[#d7e3de] bg-[#f3f7f5] shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="border-b border-[#d7e3de] bg-[#eef3f0] px-4 py-2.5 text-[12px] font-semibold text-slate-600 sm:text-[13px]">
        {document.reportNumber} / {document.branchName} /{" "}
        {formatDate(document.operationDate)}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[12px] sm:text-[13px]">
          <thead>
            <tr className="bg-[var(--forest-emerald)] text-white">
              {[
                "Section",
                "Description",
                "Count",
                "Inflow",
                "Cash Out",
                "Balance",
                "Notes",
              ].map((column) => (
                <th key={column} className="px-3 py-2.5 font-bold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.section}-${row.description}`}
                className={index % 2 === 0 ? "bg-white" : "bg-[#fbfdfc]"}
              >
                <td className="border border-[#d5ddd9] px-3 py-2 font-bold text-[var(--midnight-navy)]">
                  {row.section}
                </td>
                <td className="border border-[#d5ddd9] px-3 py-2 text-slate-600">
                  {row.description}
                </td>
                <td className="border border-[#d5ddd9] px-3 py-2 text-right tabular-nums text-slate-600">
                  {row.count}
                </td>
                <td className="border border-[#d5ddd9] px-3 py-2 text-right tabular-nums text-[var(--forest-emerald)]">
                  {row.cashIn == null ? "—" : amt(row.cashIn)}
                </td>
                <td className="border border-[#d5ddd9] px-3 py-2 text-right tabular-nums text-red-600">
                  {row.cashOut == null ? "—" : amt(row.cashOut)}
                </td>
                <td className="border border-[#d5ddd9] px-3 py-2 text-right tabular-nums font-semibold text-[#0b1220]">
                  {row.balance == null ? "—" : amt(row.balance)}
                </td>
                <td className="border border-[#d5ddd9] px-3 py-2 text-slate-500">
                  {row.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function AgentHandoverTab({
  document,
}: {
  document: DailyReportDocumentModel;
}) {
  return (
    <article className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="border-b border-[#edf1f5] px-5 py-4">
        <h2 className="text-sm font-bold text-[#0b1220]">Officer handover</h2>
        <p className="mt-1 text-xs text-slate-500">
          Per-agent float, field activity, and cash returned.
        </p>
      </div>
      <div className="overflow-x-auto p-4">
        <ReportTable
          columns={[
            "Field Officer",
            "Float",
            "Loans",
            "Repayments",
            "Fees",
            "Expenses",
            "Expected",
            "Returned",
            "Variance",
            "Status",
          ]}
          align={[false, true, true, true, true, true, true, true, true, false]}
          rows={document.agentReturns.map((row) => [
            row.agentName,
            amt(row.amountGiven),
            amt(row.amountDisbursed),
            amt(row.amountCollected),
            amt(row.processingFees),
            amt(row.expensesTotal ?? 0),
            amt(row.expectedReturn),
            row.amountReturned == null ? "—" : amt(row.amountReturned),
            row.variance == null ? "—" : amt(row.variance),
            titleCase(row.status),
          ])}
          empty="No agent float was issued for this day."
        />
      </div>
    </article>
  );
}

function ExpensesTab({ document }: { document: DailyReportDocumentModel }) {
  return (
    <article className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="border-b border-[#edf1f5] px-5 py-4">
        <h2 className="text-sm font-bold text-[#0b1220]">Expenses</h2>
        <p className="mt-1 text-xs text-slate-500">
          All expenses recorded during the operations day.
        </p>
      </div>
      <div className="overflow-x-auto p-4">
        <ReportTable
          columns={["Paid from", "Description", "Amount", "Time", "Recorded by"]}
          align={[false, false, true, false, false]}
          rows={document.expenses.map((row) => [
            row.paidFrom === "AGENT_FLOAT" ? "Field float" : "Branch cash",
            row.description || "—",
            amt(row.amount),
            formatDateTime(row.incurredAt),
            row.agentName || row.recordedByName,
          ])}
          empty="No expenses recorded."
        />
      </div>
    </article>
  );
}

function ReviewHistoryTab({
  document,
}: {
  document: DailyReportDocumentModel;
}) {
  return (
    <article className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="border-b border-[#edf1f5] px-5 py-4">
        <h2 className="text-sm font-bold text-[#0b1220]">Review History</h2>
        <p className="mt-1 text-xs text-slate-500">
          Timeline of report generation and review actions.
        </p>
      </div>
      <div className="overflow-x-auto p-4">
        <ReportTable
          columns={["Reviewed By", "Role", "Action", "Review Date", "Comment"]}
          align={[false, false, false, false, false]}
          rows={buildReviewHistory(document)}
          empty="No review history yet."
        />
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-bold text-[var(--forest-emerald)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function MetaCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] border-b border-[#edf1f5] sm:border-r sm:odd:border-r sm:[&:nth-child(2n)]:border-r-0">
      <dt className="bg-[#f4f7f6] px-2.5 py-2 text-[12px] font-semibold text-slate-500">
        {label}
      </dt>
      <dd className="px-2.5 py-2 text-[13px] font-semibold text-[#0b1220]">
        {value}
      </dd>
    </div>
  );
}

function ReportMovementBlock({
  title,
  icon,
  tone,
  rows,
  totalLabel,
  totalAmount,
  currency,
}: {
  title: string;
  icon: ReactNode;
  tone: "green" | "rose";
  rows: Array<{
    label: string;
    amount: number;
    signed?: "plus" | "minus";
  }>;
  totalLabel: string;
  totalAmount: number;
  currency: string;
}) {
  const accent =
    tone === "green" ? "text-[var(--forest-emerald)]" : "text-red-600";
  const ring = tone === "green" ? "border-emerald-100" : "border-red-100";
  const iconWrap = tone === "green" ? "bg-emerald-50" : "bg-red-50";
  const footer = tone === "green" ? "bg-[#eff8f2]" : "bg-[#fff0ec]";

  return (
    <div className={`overflow-hidden rounded-xl border ${ring}`}>
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <span
          className={`grid size-6 place-items-center rounded-full ${iconWrap} ${accent}`}
        >
          {icon}
        </span>
        <p className={`text-[12px] font-black tracking-[0.04em] ${accent}`}>
          {title}
        </p>
      </div>
      <div className="space-y-1 px-3 pb-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3"
          >
            <p className="min-w-0 text-[12px] font-medium text-slate-600">
              {row.label}
            </p>
            <p
              className={`shrink-0 text-[12px] font-bold tabular-nums ${
                row.signed === "plus"
                  ? "text-[var(--forest-emerald)]"
                  : row.signed === "minus"
                    ? "text-red-600"
                    : "text-[#0b1220]"
              }`}
            >
              {row.signed === "plus"
                ? `+${currency} ${amt(row.amount)}`
                : row.signed === "minus"
                  ? `-${currency} ${amt(row.amount)}`
                  : `${currency} ${amt(row.amount)}`}
            </p>
          </div>
        ))}
      </div>
      <div
        className={`flex items-center justify-between gap-3 px-3 py-2 ${footer}`}
      >
        <p className={`text-[12px] font-black ${accent}`}>{totalLabel}</p>
        <p className={`text-[12px] font-black tabular-nums ${accent}`}>
          {currency} {amt(totalAmount)}
        </p>
      </div>
    </div>
  );
}

function CashCard({
  icon,
  label,
  value,
  currency,
  badge,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  currency: string;
  badge?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 py-2.5">
      <div className="flex items-center gap-2 text-[var(--forest-emerald)]">
        {icon}
        <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-slate-500">
          {label}
        </p>
      </div>
      <p className="mt-1.5 text-lg font-bold tabular-nums text-[#0b1220]">
        <span className="mr-1 text-[12px] font-semibold text-slate-500">
          {currency}
        </span>
        {value}
      </p>
      {badge ? <div className="mt-0.5">{badge}</div> : null}
    </div>
  );
}

function ReportTable({
  columns,
  rows,
  align,
  empty,
  footer,
}: {
  columns: string[];
  rows: ReactNode[][];
  align: boolean[];
  empty?: string;
  footer?: ReactNode[] | false | null;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e6ebf0]">
      <table className="w-full min-w-[560px] border-collapse text-left text-[12px] sm:text-[13px]">
        <thead>
          <tr className="bg-[#e8edf2] text-[12px] font-bold uppercase tracking-[0.03em] text-slate-600">
            {columns.map((column, index) => (
              <th
                key={column}
                className={`px-2.5 py-2 ${align[index] ? "text-right" : ""}`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf1f5]">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-2.5 py-4 text-center text-[12px] font-medium text-slate-500"
              >
                {empty ?? "No records."}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="bg-white">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={`px-2.5 py-2 text-[#0b1220] ${
                      align[cellIndex]
                        ? "text-right tabular-nums font-semibold"
                        : "font-medium"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer ? (
          <tfoot>
            <tr className="border-t border-[#dfe5eb] bg-[#f4f7f6]">
              {footer.map((cell, index) => (
                <td
                  key={index}
                  className={`px-3 py-2.5 font-bold text-[#0b1220] ${
                    align[index] ? "text-right tabular-nums" : ""
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function CheckItem({
  ok,
  title,
  detail,
}: {
  ok: boolean;
  title: string;
  detail: string;
}) {
  return (
    <li className="flex gap-2.5">
      <span
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
          ok
            ? "bg-[var(--forest-emerald)] text-white"
            : "bg-slate-200 text-slate-500"
        }`}
      >
        <CheckCircle2 className="size-3" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-[#0b1220]">{title}</p>
        <p className="text-[12px] text-slate-500">{detail}</p>
      </div>
    </li>
  );
}

function amt(value: number) {
  return formatMoneyAmount(value);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupExpenses(expenses: DailyReportDocumentModel["expenses"]) {
  const map = new Map<
    string,
    { category: string; count: number; amount: number }
  >();
  for (const expense of expenses) {
    const category =
      expense.paidFrom === "AGENT_FLOAT"
        ? "Field float"
        : titleCase(expense.category.replaceAll("_", " "));
    const current = map.get(category) ?? { category, count: 0, amount: 0 };
    current.count += 1;
    current.amount += expense.amount;
    map.set(category, current);
  }
  return [...map.values()];
}

function reconcileProductRows(
  rows: Array<{ product: string; transactions: number; amount: number }>,
  fallbackProduct: string,
  totalTransactions: number,
  totalAmount: number,
) {
  if (totalAmount === 0 && totalTransactions === 0 && rows.length === 0) {
    return [];
  }
  if (rows.length === 0) {
    return [
      {
        product: fallbackProduct,
        transactions: totalTransactions,
        amount: totalAmount,
      },
    ];
  }
  const sumAmount = Math.round(rows.reduce((sum, row) => sum + row.amount, 0));
  const sumTransactions = rows.reduce((sum, row) => sum + row.transactions, 0);
  const amountDiff = Math.round(totalAmount - sumAmount);
  const countDiff = totalTransactions - sumTransactions;
  if (amountDiff === 0 && countDiff === 0) return rows;
  return [
    ...rows,
    {
      product: "Other",
      transactions: Math.max(countDiff, 0),
      amount: amountDiff,
    },
  ].filter((row) => row.amount !== 0 || row.transactions !== 0);
}

function reconcileLoanRows(
  rows: DailyReportDocumentModel["loansByProduct"],
  totalCount: number,
  totalAmount: number,
) {
  if (totalAmount === 0 && totalCount === 0 && rows.length === 0) return [];
  if (rows.length === 0) {
    return [
      {
        product: "Loans",
        count: totalCount,
        amount: totalAmount,
        recoveredToday: 0,
        outstandingBalance: totalAmount,
      },
    ];
  }
  const sumAmount = Math.round(rows.reduce((sum, row) => sum + row.amount, 0));
  const sumCount = rows.reduce((sum, row) => sum + row.count, 0);
  const amountDiff = Math.round(totalAmount - sumAmount);
  const countDiff = totalCount - sumCount;
  if (amountDiff === 0 && countDiff === 0) return rows;
  return [
    ...rows,
    {
      product: "Other",
      count: Math.max(countDiff, 0),
      amount: amountDiff,
      recoveredToday: 0,
      outstandingBalance: Math.max(amountDiff, 0),
    },
  ].filter((row) => row.amount !== 0 || row.count !== 0);
}

function buildReviewHistory(document: DailyReportDocumentModel): ReactNode[][] {
  const rows: ReactNode[][] = [
    [
      "System",
      "System",
      "Report created",
      formatDateTime(document.generatedAt),
      "Report generated successfully.",
    ],
  ];
  if (document.managerReviewedAt) {
    rows.push([
      document.managerReviewedByName ?? "Manager",
      "Branch Manager",
      "Sent to owner",
      formatDateTime(document.managerReviewedAt),
      document.managerNotes || "—",
    ]);
  }
  if (document.returnedAt) {
    rows.push([
      document.returnedByName ?? "Owner",
      "Owner",
      "Returned to manager",
      formatDateTime(document.returnedAt),
      document.returnNotes || "—",
    ]);
  }
  if (document.ownerApprovedAt) {
    rows.push([
      document.ownerApprovedByName ?? "Owner",
      "Owner",
      "Approved",
      formatDateTime(document.ownerApprovedAt),
      document.ownerNotes || "—",
    ]);
  }
  return rows;
}

function buildLedgerRows(document: DailyReportDocumentModel) {
  return [
    {
      section: "Opening",
      description: "Previous closing balance",
      count: "-",
      cashIn: null as number | null,
      cashOut: null as number | null,
      balance: document.openingBalance,
      note: "Carried from previous close",
    },
    {
      section: "Opening",
      description: "Capital top-ups today",
      count: String(document.topUps.length),
      cashIn: document.topUps.reduce((sum, row) => sum + row.amount, 0),
      cashOut: null,
      balance: null,
      note: "Capital added during the day",
    },
    {
      section: "Float",
      description: "Float distributed",
      count: String(document.agentsWithFloatCount),
      cashIn: null,
      cashOut: document.floatIssued,
      balance: null,
      note: "Issued to agents",
    },
    {
      section: "Field",
      description: "Loans issued",
      count: String(document.loansIssuedCount),
      cashIn: null,
      cashOut: document.loansIssuedPrincipal,
      balance: null,
      note: "Principal disbursed",
    },
    {
      section: "Field",
      description: "Repayments received",
      count: String(document.collectionsCount),
      cashIn: document.collectionsReceived,
      cashOut: null,
      balance: null,
      note: "Borrower repayments",
    },
    {
      section: "Field",
      description: "Processing fees",
      count: "-",
      cashIn: document.processingFeesTotal,
      cashOut: null,
      balance: null,
      note: "Loan processing fees",
    },
    {
      section: "Returns",
      description: "Field officer cash returned",
      count: String(document.agentsReturnedCount),
      cashIn: document.cashReturnedByAgents,
      cashOut: null,
      balance: null,
      note: "Handover cash",
    },
    {
      section: "Expenses",
      description: "Branch expenses",
      count: String(document.expensesCount),
      cashIn: null,
      cashOut: document.expensesTotal,
      balance: null,
      note: "Operating expenses",
    },
    {
      section: "Salaries",
      description: "Salaries paid from day’s cash",
      count:
        (document.salariesCount ?? 0) > 0
          ? String(document.salariesCount)
          : "-",
      cashIn: null,
      cashOut: document.salariesTotal ?? 0,
      balance: null,
      note: "Taken from the open branch day’s cash",
    },
    {
      section: "Shortage",
      description:
        (document.shortageRecoveries ?? [])
          .map((row) => `Shortage cleared · ${row.employeeName}`)
          .join("; ") || "Shortage cleared",
      count:
        (document.shortageRecoveriesCount ?? 0) > 0
          ? String(document.shortageRecoveriesCount)
          : "-",
      cashIn: document.shortageRecoveriesTotal ?? 0,
      cashOut: null,
      balance: null,
      note: "Employee shortage paid off as cash in",
    },
    {
      section: "Closing",
      description: "Expected closing balance",
      count: "-",
      cashIn: null,
      cashOut: null,
      balance: document.expectedClosingBalance,
      note: "Expected cash after movement",
    },
    {
      section: "Closing",
      description: "Counted cash",
      count: "-",
      cashIn: null,
      cashOut: null,
      balance: document.countedCash ?? 0,
      note: "Cash counted at closing",
    },
  ];
}

type OperationLike = {
  branchName: string;
  operationDate: string;
  openedByName: string;
  closedByName: string | null;
  openingBalance: number;
  cashAddedToday?: number;
  topUpsTotal?: number;
  expectedClosingBalance: number;
  closingBalance: number | null;
  closingVariance: number | null;
  floatIssued: number;
  agentsWithFloatCount: number;
  cashReturnedByAgents: number;
  agentsReturnedCount: number;
  agentReturnVariance: number;
  loansIssuedCount: number;
  loansIssuedPrincipal: number;
  collectionsCount: number;
  collectionsReceived: number;
  processingFeesTotal: number;
  expensesTotal: number;
  expensesCount: number;
  salariesTotal?: number;
  salariesCount?: number;
  shortageRecoveriesTotal?: number;
  shortageRecoveriesCount?: number;
  shortageRecoveries?: Array<{
    employeeName: string;
    amount: number;
  }>;
  closingNotes: string | null;
  topUps: Array<{
    id: string;
    amount: number;
    description: string | null;
    addedAt: string;
    recordedByName: string;
  }>;
  expenses: Array<{
    id: string;
    category: string;
    amount: number;
    description: string | null;
    incurredAt: string;
    recordedByName: string;
    paidFrom?: "BRANCH_CASH" | "AGENT_FLOAT";
    agentName?: string | null;
  }>;
  agentReturns: Array<{
    floatId: string;
    agentName: string;
    amountGiven: number;
    amountDisbursed: number;
    amountCollected: number;
    collectedRepaymentsAvailable?: number;
    unusedFloat?: number;
    processingFees: number;
    expensesTotal?: number;
    expectedReturn: number;
    amountReturned: number | null;
    variance: number | null;
    status: string;
  }>;
  loansByProduct?: Array<{
    product: string;
    count: number;
    amount: number;
    recoveredToday?: number;
    outstandingBalance?: number;
  }>;
  loansIssued?: DailyReportDocumentModel["loansIssued"];
  repaymentsByProduct?: Array<{
    product: string;
    count?: number;
    transactions?: number;
    amount: number;
  }>;
  repayments?: DailyReportDocumentModel["repayments"];
  feesByProduct?: Array<{
    product: string;
    count?: number;
    transactions?: number;
    amount: number;
  }>;
  processingFees?: DailyReportDocumentModel["processingFees"];
  variances?: DailyReportDocumentModel["variances"];
  previousReportReference?: {
    reportNumber: string;
    operationDate: string;
    amount: number;
  } | null;
};

type ReportLike = {
  reportNumber: string;
  operationDate: string;
  status: DailyReportStatus;
  generatedAt: string;
  managerReviewedAt: string | null;
  managerReviewedByName: string | null;
  managerNotes: string | null;
  ownerApprovedAt: string | null;
  ownerApprovedByName: string | null;
  ownerNotes: string | null;
  returnedAt: string | null;
  returnedByName: string | null;
  returnNotes: string | null;
};

export function buildDailyReportDocumentFromOperation(
  operation: OperationLike,
  report: ReportLike,
  currency: string,
): DailyReportDocumentModel {
  const topUpsSum = operation.topUps.reduce((sum, row) => sum + row.amount, 0);
  const topUpsTotal =
    operation.topUpsTotal ?? operation.cashAddedToday ?? topUpsSum;
  const expected = operation.expectedClosingBalance;
  const counted = operation.closingBalance;
  const variance = counted == null ? null : Math.round(counted - expected);

  return {
    reportNumber: report.reportNumber,
    displayReportNumber: dailyReportCode(report.operationDate),
    branchName: operation.branchName,
    operationDate: report.operationDate,
    status: report.status,
    preparedBy: operation.closedByName ?? operation.openedByName,
    preparedOn: report.generatedAt,
    currency,
    expectedClosingBalance: expected,
    countedCash: counted,
    variance,
    openingBalance: operation.openingBalance,
    topUpsTotal,
    previousReportReference: operation.previousReportReference
      ? {
          ...operation.previousReportReference,
          amount: operation.openingBalance,
        }
      : null,
    topUps: operation.topUps.map((topUp) => ({
      id: topUp.id,
      source: topUp.description?.trim() || "Capital top-up",
      reference: null,
      date: topUp.addedAt,
      amount: topUp.amount,
    })),
    repaymentsByProduct: (operation.repaymentsByProduct ?? []).map((row) => ({
      product: row.product,
      transactions: row.transactions ?? row.count ?? 0,
      amount: row.amount,
    })),
    feesByProduct: (operation.feesByProduct ?? []).map((row) => ({
      product: row.product,
      transactions: row.transactions ?? row.count ?? 0,
      amount: row.amount,
    })),
    loansByProduct: (operation.loansByProduct ?? []).map((row) => ({
      product: row.product,
      count: row.count,
      amount: row.amount,
      recoveredToday: row.recoveredToday ?? 0,
      outstandingBalance: row.outstandingBalance ?? row.amount,
    })),
    loansIssued: operation.loansIssued ?? [],
    repayments: operation.repayments ?? [],
    processingFees: operation.processingFees ?? [],
    variances: operation.variances ?? [],
    floatIssued: operation.floatIssued,
    agentsWithFloatCount: operation.agentsWithFloatCount,
    cashReturnedByAgents: operation.cashReturnedByAgents,
    agentsReturnedCount: operation.agentsReturnedCount,
    agentReturnVariance: operation.agentReturnVariance,
    loansIssuedCount: operation.loansIssuedCount,
    loansIssuedPrincipal: operation.loansIssuedPrincipal,
    collectionsCount: operation.collectionsCount,
    collectionsReceived: operation.collectionsReceived,
    processingFeesTotal: operation.processingFeesTotal,
    expensesTotal: operation.expensesTotal,
    expensesCount: operation.expensesCount,
    salariesTotal: operation.salariesTotal ?? 0,
    salariesCount: operation.salariesCount ?? 0,
    shortageRecoveriesTotal: operation.shortageRecoveriesTotal ?? 0,
    shortageRecoveriesCount: operation.shortageRecoveriesCount ?? 0,
    shortageRecoveries: operation.shortageRecoveries ?? [],
    expenses: operation.expenses,
    agentReturns: operation.agentReturns,
    closingNotes: operation.closingNotes,
    managerReviewedAt: report.managerReviewedAt,
    managerReviewedByName: report.managerReviewedByName,
    managerNotes: report.managerNotes,
    ownerApprovedAt: report.ownerApprovedAt,
    ownerApprovedByName: report.ownerApprovedByName,
    ownerNotes: report.ownerNotes,
    returnedAt: report.returnedAt,
    returnedByName: report.returnedByName,
    returnNotes: report.returnNotes,
    generatedAt: report.generatedAt,
  };
}

export function buildDailyReportDocumentFromSnapshot(
  report: {
    reportNumber: string;
    branchName: string;
    operationDate: string;
    status: DailyReportStatus;
    generatedAt: string;
    managerReviewedAt: string | null;
    managerReviewedByName: string | null;
    ownerApprovedAt: string | null;
    ownerApprovedByName: string | null;
    expectedClosingBalance: number;
    closingBalance: number | null;
    closingVariance: number | null;
    loansIssuedCount: number;
    loansIssuedPrincipal: number;
    collectionsReceived: number;
    processingFeesTotal: number;
    expensesTotal: number;
    cashReturnedByAgents: number;
    snapshot: unknown;
  },
  currency: string,
  extras?: {
    managerNotes?: string | null;
    ownerNotes?: string | null;
    returnedAt?: string | null;
    returnedByName?: string | null;
    returnNotes?: string | null;
  },
): DailyReportDocumentModel {
  const root =
    report.snapshot &&
    typeof report.snapshot === "object" &&
    !Array.isArray(report.snapshot)
      ? (report.snapshot as Record<string, unknown>)
      : {};
  const summary = objectValue(root.summary);
  const openingCash = objectValue(root.openingCash);
  const operation = objectValue(root.operation);
  const agentReturns = arrayValue(root.agentReturns);
  const topUps = arrayValue(root.topUps);
  const expenses = arrayValue(root.expenses);
  const loansByProduct = arrayValue(root.loansByProduct);
  const repaymentsByProduct = arrayValue(root.repaymentsByProduct);
  const feesByProduct = arrayValue(root.feesByProduct);
  const loansIssued = arrayValue(root.loansIssued);
  const repayments = arrayValue(root.repayments);
  const processingFees = arrayValue(root.processingFees);
  const variances = arrayValue(root.variances);
  const previous = objectValue(root.previousReportReference);

  const mappedAgents = agentReturns.map((row, index) => {
    const item = objectValue(row);
    return {
      floatId: stringValue(item.floatId) || `agent-${index}`,
      agentName: stringValue(item.agentName) || "Field Officer",
      amountGiven: numberValue(item.amountGiven),
      amountDisbursed: numberValue(item.amountDisbursed),
      amountCollected: numberValue(item.amountCollected),
      collectedRepaymentsAvailable: numberValue(
        item.collectedRepaymentsAvailable,
      ),
      unusedFloat: numberValue(item.unusedFloat),
      processingFees: numberValue(item.processingFees),
      expensesTotal: numberValue(item.expensesTotal),
      expectedReturn: numberValue(item.expectedReturn),
      amountReturned:
        item.amountReturned == null ? null : numberValue(item.amountReturned),
      variance: item.variance == null ? null : numberValue(item.variance),
      status: stringValue(item.status) || "PENDING",
    };
  });

  const openingBalance = numberValue(
    openingCash.previousClosingBalance ?? summary.previousClosingBalance,
  );
  const topUpsMapped = topUps.map((row, index) => {
    const item = objectValue(row);
    return {
      id: stringValue(item.id) || `topup-${index}`,
      source: stringValue(item.description) || "Capital top-up",
      reference: null as string | null,
      date: stringValue(item.addedAt) || report.operationDate,
      amount: numberValue(item.amount),
    };
  });
  const topUpsTotal = numberValue(
    summary.topUpsAdded ??
      openingCash.cashAddedToday ??
      topUpsMapped.reduce((sum, row) => sum + row.amount, 0),
  );
  const expected = report.expectedClosingBalance;
  const counted = report.closingBalance;
  const variance = counted == null ? null : Math.round(counted - expected);
  const agentReturnVariance = mappedAgents.reduce(
    (sum, row) => sum + (row.variance ?? 0),
    0,
  );
  const mappedVariances = variances.map((row, index) => {
    const item = objectValue(row);
    return {
      id: stringValue(item.id) || `variance-${index}`,
      source: stringValue(item.source) || "Variance",
      personName: stringValue(item.personName) || "—",
      personPublicId:
        typeof item.personPublicId === "string" ? item.personPublicId : null,
      expectedAmount:
        item.expectedAmount == null ? null : numberValue(item.expectedAmount),
      actualAmount:
        item.actualAmount == null ? null : numberValue(item.actualAmount),
      variance: numberValue(item.variance),
      shortageAmount:
        item.shortageAmount == null ? null : numberValue(item.shortageAmount),
      outstandingAmount:
        item.outstandingAmount == null
          ? null
          : numberValue(item.outstandingAmount),
      status: stringValue(item.status) || "Recorded",
      notes: typeof item.notes === "string" ? item.notes : null,
      clearedByName:
        typeof item.clearedByName === "string" ? item.clearedByName : null,
      clearedAt: typeof item.clearedAt === "string" ? item.clearedAt : null,
      occurredAt: stringValue(item.occurredAt) || report.generatedAt,
    };
  });
  if (mappedVariances.length === 0 && counted != null && variance !== 0) {
    const snapshotVariance = variance ?? 0;
    mappedVariances.push({
      id: `branch-close-${report.reportNumber}`,
      source: "Branch close",
      personName: stringValue(operation.closedByName) || "Branch cash",
      personPublicId: null,
      expectedAmount: expected,
      actualAmount: counted,
      variance: snapshotVariance,
      shortageAmount: snapshotVariance < 0 ? Math.abs(snapshotVariance) : null,
      outstandingAmount: null,
      status: snapshotVariance < 0 ? "Short" : "Excess",
      notes: typeof root.closingNotes === "string" ? root.closingNotes : null,
      clearedByName: null,
      clearedAt: null,
      occurredAt: report.generatedAt,
    });
  }

  return {
    reportNumber: report.reportNumber,
    displayReportNumber: dailyReportCode(report.operationDate),
    branchName: report.branchName,
    operationDate: report.operationDate,
    status: report.status,
    preparedBy:
      stringValue(operation.closedByName) ||
      stringValue(operation.openedByName) ||
      report.managerReviewedByName ||
      "Branch Manager",
    preparedOn: report.generatedAt,
    currency,
    expectedClosingBalance: expected,
    countedCash: counted,
    variance,
    openingBalance,
    topUpsTotal,
    previousReportReference:
      previous.reportNumber || previous.operationDate
        ? {
            reportNumber:
              stringValue(previous.reportNumber) ||
              dailyReportCode(stringValue(previous.operationDate)),
            operationDate: stringValue(previous.operationDate),
            amount: openingBalance,
          }
        : null,
    topUps: topUpsMapped,
    repaymentsByProduct: repaymentsByProduct.map((row) => {
      const item = objectValue(row);
      return {
        product: stringValue(item.product) || "Loan repayment",
        transactions: numberValue(item.transactions ?? item.count),
        amount: numberValue(item.amount),
      };
    }),
    feesByProduct: feesByProduct.map((row) => {
      const item = objectValue(row);
      return {
        product: stringValue(item.product) || "Loan",
        transactions: numberValue(item.transactions ?? item.count),
        amount: numberValue(item.amount),
      };
    }),
    loansByProduct: loansByProduct.map((row) => {
      const item = objectValue(row);
      return {
        product: stringValue(item.product) || "Loan",
        count: numberValue(item.count),
        amount: numberValue(item.amount),
        recoveredToday: numberValue(item.recoveredToday),
        outstandingBalance: numberValue(item.outstandingBalance ?? item.amount),
      };
    }),
    loansIssued: loansIssued.map((row, index) => {
      const item = objectValue(row);
      return {
        id: stringValue(item.id) || `loan-${index}`,
        loanId: typeof item.loanId === "string" ? item.loanId : null,
        borrowerName: stringValue(item.borrowerName) || "Borrower",
        borrowerPhone:
          typeof item.borrowerPhone === "string" ? item.borrowerPhone : null,
        product: stringValue(item.product) || "Loan",
        principalAmount: numberValue(item.principalAmount ?? item.amount),
        processingFee: numberValue(item.processingFee),
        recoveredToday: numberValue(item.recoveredToday),
        outstandingBalance: numberValue(item.outstandingBalance),
        issuedAt: stringValue(item.issuedAt) || report.generatedAt,
        officerName: stringValue(item.officerName) || "—",
        officerPublicId:
          typeof item.officerPublicId === "string"
            ? item.officerPublicId
            : null,
        durationDays:
          item.durationDays == null ? null : numberValue(item.durationDays),
        purpose: typeof item.purpose === "string" ? item.purpose : null,
      };
    }),
    repayments: repayments.map((row, index) => {
      const item = objectValue(row);
      return {
        id: stringValue(item.id) || `repayment-${index}`,
        loanId: stringValue(item.loanId) || "",
        borrowerName: stringValue(item.borrowerName) || "Borrower",
        borrowerPhone:
          typeof item.borrowerPhone === "string" ? item.borrowerPhone : null,
        product: stringValue(item.product) || "Loan repayment",
        amount: numberValue(item.amount),
        paidAt: stringValue(item.paidAt) || report.generatedAt,
        method: stringValue(item.method) || "Cash",
        receiptNumber:
          typeof item.receiptNumber === "string" ? item.receiptNumber : null,
        recordedByName: stringValue(item.recordedByName) || "—",
        recordedByPublicId:
          typeof item.recordedByPublicId === "string"
            ? item.recordedByPublicId
            : null,
        note: typeof item.note === "string" ? item.note : null,
      };
    }),
    processingFees: processingFees.map((row, index) => {
      const item = objectValue(row);
      return {
        id: stringValue(item.id) || `fee-${index}`,
        loanId: typeof item.loanId === "string" ? item.loanId : null,
        borrowerName: stringValue(item.borrowerName) || "Borrower",
        product: stringValue(item.product) || "Loan",
        amount: numberValue(item.amount),
        receivedAt: stringValue(item.receivedAt) || report.generatedAt,
        officerName: stringValue(item.officerName) || "—",
      };
    }),
    variances: mappedVariances,
    floatIssued: numberValue(summary.floatDistributed),
    agentsWithFloatCount: mappedAgents.length,
    cashReturnedByAgents: report.cashReturnedByAgents,
    agentsReturnedCount: mappedAgents.filter(
      (row) => row.amountReturned != null,
    ).length,
    agentReturnVariance: Math.round(agentReturnVariance),
    loansIssuedCount: report.loansIssuedCount,
    loansIssuedPrincipal: report.loansIssuedPrincipal,
    collectionsCount: numberValue(summary.collectionsCount),
    collectionsReceived: report.collectionsReceived,
    processingFeesTotal: report.processingFeesTotal,
    expensesTotal: report.expensesTotal,
    expensesCount: expenses.length,
    salariesTotal: numberValue(summary.salaries),
    salariesCount: numberValue(summary.salariesCount),
    shortageRecoveriesTotal: numberValue(summary.shortageRecoveries),
    shortageRecoveriesCount: numberValue(summary.shortageRecoveriesCount),
    shortageRecoveries: arrayValue(root.shortageRecoveries).map((row) => {
      const item = objectValue(row);
      return {
        employeeName: stringValue(item.employeeName) || "Employee",
        amount: numberValue(item.amount),
      };
    }),
    expenses: expenses.map((row, index) => {
      const item = objectValue(row);
      return {
        id: stringValue(item.id) || `expense-${index}`,
        category: stringValue(item.category) || "OTHER",
        amount: numberValue(item.amount),
        description:
          typeof item.description === "string" ? item.description : null,
        incurredAt: stringValue(item.incurredAt) || report.generatedAt,
        recordedByName: stringValue(item.recordedByName) || "—",
        paidFrom:
          stringValue(item.paidFrom) === "AGENT_FLOAT"
            ? "AGENT_FLOAT"
            : "BRANCH_CASH",
        agentName:
          typeof item.agentName === "string" ? item.agentName : null,
      };
    }),
    agentReturns: mappedAgents,
    closingNotes:
      typeof root.closingNotes === "string" ? root.closingNotes : null,
    managerReviewedAt: report.managerReviewedAt,
    managerReviewedByName: report.managerReviewedByName,
    managerNotes: extras?.managerNotes ?? null,
    ownerApprovedAt: report.ownerApprovedAt,
    ownerApprovedByName: report.ownerApprovedByName,
    ownerNotes: extras?.ownerNotes ?? null,
    returnedAt: extras?.returnedAt ?? null,
    returnedByName: extras?.returnedByName ?? null,
    returnNotes: extras?.returnNotes ?? null,
    generatedAt: report.generatedAt,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
