"use client";

import {
  formatNumber,
  type OwnerReport,
} from "../../app/owner/owner-common";
import {
  buildDailyReportDocumentFromSnapshot,
  type DailyReportStatus,
} from "./daily-reconciliation-report";
import { exportDailyReconciliationPdf } from "./daily-reconciliation-pdf";
import { dailyReportCode } from "./reports-filters";

export { openPrintDocument } from "./daily-reconciliation-pdf";

type ReportAgentReturn = {
  floatId?: string;
  agentId?: string;
  agentName?: string;
  amountGiven?: number;
  amountDisbursed?: number;
  processingFees?: number;
  amountCollected?: number;
  expectedReturn?: number;
  amountReturned?: number | null;
  variance?: number | null;
  status?: string;
};

type ReportRecord = {
  id?: string;
  amount?: number;
  description?: string | null;
  category?: string;
  addedAt?: string;
  incurredAt?: string;
  recordedByName?: string;
};

type ReportSnapshot = {
  summary: Record<string, unknown>;
  openingCash: Record<string, unknown>;
  cashPosition: Record<string, unknown>;
  operation: Record<string, unknown>;
  agentReturns: ReportAgentReturn[];
  topUps: ReportRecord[];
  expenses: ReportRecord[];
  closingNotes: string | null;
};

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

export function readReportSnapshot(report: OwnerReport): ReportSnapshot {
  const root = objectValue(report.snapshot);
  return {
    summary: objectValue(root.summary),
    openingCash: objectValue(root.openingCash),
    cashPosition: objectValue(root.cashPosition),
    operation: objectValue(root.operation),
    agentReturns: arrayValue(root.agentReturns) as ReportAgentReturn[],
    topUps: arrayValue(root.topUps) as ReportRecord[],
    expenses: arrayValue(root.expenses) as ReportRecord[],
    closingNotes:
      typeof root.closingNotes === "string" && root.closingNotes.trim()
        ? root.closingNotes
        : null,
  };
}

function statusLabel(value: string) {
  if (value === "MANAGER_REVIEW") return "Ready to send";
  if (value === "SENT_TO_OWNER") return "Awaiting Approval";
  if (value === "OWNER_APPROVED") return "Approved";
  if (value === "RETURNED_TO_MANAGER") return "Returned";
  return value.replaceAll("_", " ");
}

export async function exportOwnedReport(
  report: OwnerReport,
  currency: string,
  format: "excel" | "pdf",
) {
  const snapshot = readReportSnapshot(report);
  if (format === "pdf") {
    const document = buildDailyReportDocumentFromSnapshot(
      {
        ...report,
        status: report.status as DailyReportStatus,
      },
      currency,
      {
        managerNotes: report.managerNotes ?? null,
        ownerNotes: report.ownerNotes ?? null,
        returnedAt: report.returnedAt ?? null,
        returnedByName: report.returnedByName ?? null,
        returnNotes: report.returnNotes ?? null,
      },
    );
    exportDailyReconciliationPdf(document);
    return;
  }

  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("Daily Report");
  worksheet.addRow(["REMBEH Daily Operations Report"]);
  worksheet.mergeCells(1, 1, 1, 7);
  worksheet.addRow([
    report.branchName,
    dailyReportCode(report.operationDate),
    report.operationDate,
    statusLabel(report.status),
  ]);
  worksheet.mergeCells(2, 1, 2, 7);
  worksheet.addRow([]);
  const header = worksheet.addRow([
    "Section",
    "Description",
    "Count",
    "Cash In",
    "Cash Out",
    "Balance",
    "Notes",
  ]);
  const opening = numberValue(snapshot.openingCash.previousClosingBalance);
  const topUps = numberValue(snapshot.summary.topUpsAdded);
  worksheet.addRow(["Opening", "Previous closing balance", "-", "", "", opening, ""]);
  worksheet.addRow(["Opening", "Top-ups added today", "-", topUps, "", "", ""]);
  worksheet.addRow([
    "Field",
    "Loans issued",
    formatNumber(report.loansIssuedCount),
    "",
    report.loansIssuedPrincipal,
    "",
    "",
  ]);
  worksheet.addRow([
    "Field",
    "Repayments received",
    formatNumber(numberValue(snapshot.summary.collectionsCount)),
    report.collectionsReceived,
    "",
    "",
    "",
  ]);
  worksheet.addRow([
    "Field",
    "Processing fees",
    "-",
    report.processingFeesTotal,
    "",
    "",
    "",
  ]);
  worksheet.addRow([
    "Expenses",
    "Branch expenses",
    formatNumber(snapshot.expenses.length),
    "",
    report.expensesTotal,
    "",
    "",
  ]);
  worksheet.addRow([
    "Closing",
    "Expected closing balance",
    "-",
    "",
    "",
    report.expectedClosingBalance,
    "",
  ]);
  worksheet.addRow([
    "Closing",
    "Counted cash",
    "-",
    "",
    "",
    report.closingBalance ?? 0,
    "",
  ]);
  worksheet.columns = [
    { width: 16 },
    { width: 30 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 24 },
  ];
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F8F68" },
  };
  [4, 5, 6].forEach((column) => {
    worksheet.getColumn(column).numFmt = `"${currency}" #,##0`;
  });

  const agentSheet = workbook.addWorksheet("Agent Handover");
  agentSheet.addRow([
    "Agent",
    "Float",
    "Loans",
    "Repayments",
    "Fees",
    "Expected",
    "Returned",
    "Status",
  ]);
  snapshot.agentReturns.forEach((row) => {
    agentSheet.addRow([
      row.agentName ?? "Agent",
      numberValue(row.amountGiven),
      numberValue(row.amountDisbursed),
      numberValue(row.amountCollected),
      numberValue(row.processingFees),
      numberValue(row.expectedReturn),
      row.amountReturned == null ? "" : numberValue(row.amountReturned),
      row.status ?? "PENDING",
    ]);
  });
  agentSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  agentSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F8F68" },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download =
    `${dailyReportCode(report.operationDate)}-${report.branchName}`.replace(
      /[^a-z0-9-]+/gi,
      "_",
    ) + ".xlsx";
  link.click();
  URL.revokeObjectURL(url);
}

