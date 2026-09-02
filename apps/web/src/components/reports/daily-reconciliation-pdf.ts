import {
  formatDate,
  formatMoneyAmount,
  formatNumber,
  titleCase,
} from "../../app/owner/owner-common";
import {
  documentReportStatusLabel,
  type DailyReportDocumentModel,
} from "./daily-reconciliation-report";
import { dailyReportCode } from "./reports-filters";

/** Print/PDF helper — do not use `noopener` (window.open returns null). */
export function openPrintDocument(html: string) {
  const printWindow = window.open("", "_blank", "width=1100,height=800");
  if (!printWindow) {
    throw new Error("Allow pop-ups to export the PDF document.");
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function reviewHistoryRows(document: DailyReportDocumentModel) {
  const rows: Array<[string, string, string, string, string]> = [
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

function section(title: string, body: string) {
  return `<section class="section"><h3>${escapeHtml(title)}</h3>${body}</section>`;
}

function table(
  columns: string[],
  rows: string[][],
  options?: { alignRight?: number[]; footer?: string[]; empty?: string },
) {
  const alignRight = new Set(options?.alignRight ?? []);
  const head = columns
    .map(
      (column, index) =>
        `<th class="${alignRight.has(index) ? "num" : ""}">${escapeHtml(column)}</th>`,
    )
    .join("");
  const body =
    rows.length === 0
      ? `<tr><td colspan="${columns.length}" class="empty">${escapeHtml(options?.empty ?? "No records.")}</td></tr>`
      : rows
          .map(
            (row) =>
              `<tr>${row
                .map(
                  (cell, index) =>
                    `<td class="${alignRight.has(index) ? "num" : ""}">${cell}</td>`,
                )
                .join("")}</tr>`,
          )
          .join("");
  const footer = options?.footer
    ? `<tfoot><tr>${options.footer
        .map(
          (cell, index) =>
            `<td class="${alignRight.has(index) ? "num" : ""}">${cell}</td>`,
        )
        .join("")}</tr></tfoot>`
    : "";
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${footer}</table></div>`;
}

function moneyIn(value: number) {
  return `<span class="in">+${escapeHtml(amt(value))}</span>`;
}

function moneyOut(value: number) {
  return `<span class="out">-${escapeHtml(amt(value))}</span>`;
}

function moneyPlain(value: number) {
  return escapeHtml(amt(value));
}

function buildDailyReconciliationPdfHtml(document: DailyReportDocumentModel) {
  const currency = document.currency;
  const reportCode =
    document.displayReportNumber ??
    dailyReportCode(document.operationDate) ??
    document.reportNumber;
  const prevDate = document.previousReportReference?.operationDate;
  const counted = document.countedCash;

  const agentsPending = document.agentReturns.filter(
    (row) => row.amountReturned == null,
  ).length;
  const agentsBalanced = document.agentReturns.filter(
    (row) =>
      row.amountReturned != null && Math.round(row.variance ?? 0) === 0,
  ).length;
  const agentsWithVariance = document.agentReturns.filter(
    (row) =>
      row.amountReturned != null && Math.round(row.variance ?? 0) !== 0,
  ).length;
  const agentTotal =
    agentsPending + agentsBalanced + agentsWithVariance ||
    document.agentsWithFloatCount;

  const topUpsTotal = Math.round(
    document.topUpsTotal ||
      document.topUps.reduce((sum, row) => sum + row.amount, 0),
  );
  const topUpEntries = document.topUps.length;

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
  const expenseCategoryCount = expensesByCategory.reduce(
    (sum, row) => sum + row.count,
    0,
  );
  const feesEntryCount = feesRows.reduce(
    (sum, row) => sum + row.transactions,
    0,
  );

  const expectedShown = Math.round(
    document.openingBalance +
      topUpsTotal +
      document.collectionsReceived +
      document.processingFeesTotal -
      document.loansIssuedPrincipal -
      document.expensesTotal,
  );
  const varianceShown =
    counted == null ? null : Math.round(counted - expectedShown);
  const varianceBadge =
    varianceShown == null || varianceShown === 0
      ? "Balanced"
      : varianceShown > 0
        ? "Excess"
        : "Short";
  const varianceTone =
    varianceShown == null || varianceShown === 0 || varianceShown > 0
      ? "good"
      : "bad";

  const showOpeningDetail =
    Math.round(document.openingBalance) !== 0 ||
    Boolean(document.previousReportReference);
  const showTopUpsDetail = topUpsTotal !== 0 || document.topUps.length > 0;
  const showRepaymentsDetail =
    Math.round(document.collectionsReceived) !== 0 ||
    document.collectionsCount > 0;
  const showFeesDetail = Math.round(document.processingFeesTotal) !== 0;
  const showLoansDetail =
    Math.round(document.loansIssuedPrincipal) !== 0 ||
    document.loansIssuedCount > 0;
  const showExpensesDetail =
    Math.round(document.expensesTotal) !== 0 || document.expensesCount > 0;
  const showFloatDetail = Math.round(document.floatIssued) !== 0;

  const parts: string[] = [];

  parts.push(`
    <header class="doc-header">
      <h1>Daily Reconciliation Report</h1>
      <div class="meta-grid">
        <div><span>Report ID</span><strong>${escapeHtml(reportCode)}</strong></div>
        <div><span>Prepared By</span><strong>${escapeHtml(document.preparedBy)}</strong></div>
        <div><span>Branch</span><strong>${escapeHtml(document.branchName)}</strong></div>
        <div><span>Report Status</span><strong class="good">${escapeHtml(documentReportStatusLabel(document.status))}</strong></div>
        <div><span>Operations Date</span><strong>${escapeHtml(formatDate(document.operationDate))}</strong></div>
        <div><span>Prepared On</span><strong>${escapeHtml(formatDateTime(document.preparedOn))}</strong></div>
      </div>
    </header>
  `);

  parts.push(
    section(
      "Cash Position",
      `<div class="cash-grid">
        <div class="cash-card"><label>Expected Cash</label><p><small>${escapeHtml(currency)}</small> ${moneyPlain(expectedShown)}</p></div>
        <div class="cash-card"><label>Counted Cash</label><p><small>${escapeHtml(currency)}</small> ${moneyPlain(counted ?? 0)}</p></div>
        <div class="cash-card"><label>Cash Variance</label><p><small>${escapeHtml(currency)}</small> ${moneyPlain(Math.abs(varianceShown ?? 0))}</p><em class="${varianceTone}">${escapeHtml(varianceBadge)}</em></div>
      </div>`,
    ),
  );

  parts.push(
    section(
      "Cash Movement Summary",
      `${table(
        ["Cash Movement", "Entries", "Type", `Amount (${currency})`],
        [
          [
            escapeHtml(
              `Balance carried forward${prevDate ? ` from ${formatDate(prevDate)}` : ""}`,
            ),
            "N/A",
            "Inflow",
            moneyIn(document.openingBalance),
          ],
          [
            "Capital top-ups added during the day",
            topUpEntries > 0 ? String(topUpEntries) : "N/A",
            "Inflow",
            moneyIn(topUpsTotal),
          ],
          [
            "Repayments collected",
            document.collectionsCount > 0
              ? String(document.collectionsCount)
              : "N/A",
            "Inflow",
            moneyIn(document.collectionsReceived),
          ],
          [
            "Processing fees received",
            feesEntryCount > 0 ? String(feesEntryCount) : "N/A",
            "Inflow",
            moneyIn(document.processingFeesTotal),
          ],
          [
            "Loans issued",
            document.loansIssuedCount > 0
              ? String(document.loansIssuedCount)
              : "N/A",
            "Cash Out",
            moneyOut(document.loansIssuedPrincipal),
          ],
          [
            "Expenses recorded",
            document.expensesCount > 0
              ? String(document.expensesCount)
              : "N/A",
            "Cash Out",
            moneyOut(document.expensesTotal),
          ],
        ],
        {
          alignRight: [1, 3],
          footer: [
            "Expected closing cash",
            "N/A",
            "Balance",
            `<strong>${moneyPlain(expectedShown)}</strong>`,
          ],
        },
      )}<p class="note">Expected closing cash = opening + top-ups + repayments + fees − loans − expenses. Float and field officer returns net out when handovers balance.</p>`,
    ),
  );

  if (showOpeningDetail) {
    parts.push(
      section(
        "Balance Carried Forward Reference",
        table(
          ["Reference", "Description", "Date", `Amount (${currency})`],
          [
            [
              escapeHtml(
                document.previousReportReference?.reportNumber ??
                  "Opening capital",
              ),
              "Daily reconciliation report",
              escapeHtml(
                formatDate(
                  document.previousReportReference?.operationDate ??
                    document.operationDate,
                ),
              ),
              moneyPlain(document.openingBalance),
            ],
          ],
          { alignRight: [3] },
        ),
      ),
    );
  }

  if (showTopUpsDetail) {
    parts.push(
      section(
        "Capital top-ups",
        table(
          ["#", "Source", "Receipt / Reference", "Date", `Amount (${currency})`],
          document.topUps.map((row, index) => [
            String(index + 1),
            escapeHtml(row.source),
            escapeHtml(row.reference || "—"),
            escapeHtml(formatDate(row.date)),
            `<span class="in">${moneyPlain(row.amount)}</span>`,
          ]),
          {
            alignRight: [0, 4],
            footer: [
              "",
              "Total capital top-ups",
              "",
              "",
              `<strong class="in">${moneyPlain(topUpsTotal)}</strong>`,
            ],
          },
        ),
      ),
    );
  }

  if (showRepaymentsDetail) {
    parts.push(
      section(
        "Repayments Collected",
        table(
          ["#", "Scheme / Product", "Transactions", `Amount (${currency})`],
          repaymentsRows.map((row, index) => [
            String(index + 1),
            escapeHtml(row.product),
            escapeHtml(formatNumber(row.transactions)),
            moneyPlain(row.amount),
          ]),
          {
            alignRight: [0, 2, 3],
            footer: [
              "",
              "Total Repayments Collected",
              escapeHtml(formatNumber(document.collectionsCount)),
              `<strong class="in">${moneyPlain(document.collectionsReceived)}</strong>`,
            ],
          },
        ),
      ),
    );
  }

  if (showFeesDetail) {
    parts.push(
      section(
        "Processing Fees Received",
        table(
          ["#", "Scheme / Product", "Transactions", `Amount (${currency})`],
          feesRows.map((row, index) => [
            String(index + 1),
            escapeHtml(row.product),
            escapeHtml(formatNumber(row.transactions)),
            moneyPlain(row.amount),
          ]),
          {
            alignRight: [0, 2, 3],
            footer: [
              "",
              "Total Processing Fees Received",
              escapeHtml(formatNumber(feesEntryCount)),
              `<strong class="in">${moneyPlain(document.processingFeesTotal)}</strong>`,
            ],
          },
        ),
      ),
    );
  }

  parts.push(
    section(
      "Officer handover and Reconciliation",
      `${table(
        [
          "Description",
          "Total Field Officers",
          "Field Officers Balanced",
          "Field Officers with Variance",
          `Total Variance (${currency})`,
        ],
        [
          [
            "Daily handover reconciliation",
            String(agentTotal),
            String(agentsBalanced),
            String(agentsWithVariance),
            document.agentReturnVariance !== 0
              ? `<strong class="out">(${moneyPlain(Math.abs(document.agentReturnVariance))})</strong>`
              : `<strong>${moneyPlain(0)}</strong>`,
          ],
        ],
        { alignRight: [1, 2, 3, 4] },
      )}${
        agentsPending > 0
          ? `<p class="note">${agentsPending} agent${agentsPending === 1 ? "" : "s"} still pending handover.</p>`
          : ""
      }`,
    ),
  );

  if (showLoansDetail) {
    const recovered = loansRows.reduce(
      (sum, row) => sum + row.recoveredToday,
      0,
    );
    const outstanding = loansRows.reduce(
      (sum, row) => sum + row.outstandingBalance,
      0,
    );
    parts.push(
      section(
        "Loans Issued",
        table(
          [
            "Product Type",
            "Loans Issued",
            `Total Amount (${currency})`,
            `Recovered Today (${currency})`,
            `Outstanding Balance (${currency})`,
          ],
          loansRows.map((row) => [
            escapeHtml(row.product),
            escapeHtml(formatNumber(row.count)),
            moneyPlain(row.amount),
            moneyPlain(row.recoveredToday),
            `<span class="in">${moneyPlain(row.outstandingBalance)}</span>`,
          ]),
          {
            alignRight: [1, 2, 3, 4],
            footer: [
              "Total",
              `<strong>${escapeHtml(formatNumber(document.loansIssuedCount))}</strong>`,
              `<strong>${moneyPlain(document.loansIssuedPrincipal)}</strong>`,
              `<strong>${moneyPlain(recovered)}</strong>`,
              `<strong class="in">${moneyPlain(outstanding)}</strong>`,
            ],
          },
        ),
      ),
    );
  }

  if (showFloatDetail) {
    parts.push(
      section(
        "Float Distributed to Field Officers",
        table(
          ["Description", "Field Officers", `Total Float (${currency})`],
          [
            [
              "Float distributed to field officers",
              String(document.agentsWithFloatCount),
              moneyPlain(document.floatIssued),
            ],
          ],
          {
            alignRight: [1, 2],
            footer: [
              "Total",
              `<strong>${document.agentsWithFloatCount}</strong>`,
              `<strong>${moneyPlain(document.floatIssued)}</strong>`,
            ],
          },
        ),
      ),
    );
  }

  if (showExpensesDetail) {
    parts.push(
      section(
        "Expenses Recorded",
        table(
          [
            "Expense Category",
            "No. of Transactions",
            `Total Amount (${currency})`,
          ],
          expensesByCategory.map((row) => [
            escapeHtml(row.category),
            escapeHtml(formatNumber(row.count)),
            moneyPlain(row.amount),
          ]),
          {
            alignRight: [1, 2],
            footer: [
              "Total",
              `<strong>${escapeHtml(formatNumber(expenseCategoryCount || document.expensesCount))}</strong>`,
              `<strong>${moneyPlain(document.expensesTotal)}</strong>`,
            ],
          },
        ),
      ),
    );
  }

  parts.push(
    section(
      "Report Review History",
      table(
        ["Reviewed By", "Role", "Action", "Review Date", "Comment"],
        reviewHistoryRows(document).map((row) =>
          row.map((cell) => escapeHtml(cell)),
        ),
        { empty: "No review history yet." },
      ),
    ),
  );

  parts.push(
    section(
      "Owner Review",
      table(
        ["Reviewed By", "Role", "Review Date", "Status", "Comment"],
        [
          document.ownerApprovedAt
            ? [
                escapeHtml(document.ownerApprovedByName ?? "Owner"),
                "Owner",
                escapeHtml(formatDateTime(document.ownerApprovedAt)),
                `<span class="good">Approved</span>`,
                escapeHtml(document.ownerNotes || "—"),
              ]
            : [
                "—",
                "—",
                "—",
                `<span class="warn">Pending</span>`,
                "—",
              ],
        ],
      ),
    ),
  );

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(reportCode)} · Daily Reconciliation Report</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      color: #0b1220;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      background: #fff;
    }
    h1 {
      margin: 0 0 12px;
      text-align: center;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h3 {
      margin: 0 0 8px;
      color: #0f8f68;
      font-size: 13px;
      font-weight: 700;
    }
    .section { margin: 0 0 16px; page-break-inside: avoid; }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border: 1px solid #e6ebf0;
      border-radius: 12px;
      overflow: hidden;
    }
    .meta-grid > div {
      display: grid;
      grid-template-columns: 120px 1fr;
      border-bottom: 1px solid #edf1f5;
      border-right: 1px solid #edf1f5;
    }
    .meta-grid > div:nth-child(2n) { border-right: 0; }
    .meta-grid > div:nth-last-child(-n+2) { border-bottom: 0; }
    .meta-grid span {
      background: #f4f7f6;
      padding: 8px 10px;
      font-size: 10px;
      font-weight: 600;
      color: #64748b;
    }
    .meta-grid strong {
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 600;
    }
    .cash-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .cash-card {
      border: 1px solid #e6ebf0;
      border-radius: 12px;
      background: #f8faf9;
      padding: 10px 12px;
    }
    .cash-card label {
      display: block;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #64748b;
    }
    .cash-card p {
      margin: 6px 0 0;
      font-size: 16px;
      font-weight: 700;
    }
    .cash-card small {
      font-size: 10px;
      font-weight: 600;
      color: #64748b;
      margin-right: 4px;
    }
    .cash-card em {
      display: block;
      margin-top: 4px;
      font-style: normal;
      font-size: 11px;
      font-weight: 600;
    }
    .table-wrap {
      border: 1px solid #e6ebf0;
      border-radius: 12px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    th {
      background: #e8edf2;
      color: #475569;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      text-align: left;
      padding: 8px 10px;
    }
    td {
      padding: 8px 10px;
      border-top: 1px solid #edf1f5;
      vertical-align: top;
    }
    tfoot td {
      background: #f8faf9;
      font-weight: 700;
      border-top: 1px solid #e6ebf0;
    }
    .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    .empty { text-align: center; color: #64748b; padding: 16px 10px; }
    .note { margin: 6px 0 0; font-size: 11px; color: #64748b; font-style: italic; }
    .in { color: #0f8f68; font-weight: 600; }
    .out { color: #dc2626; font-weight: 600; }
    .good { color: #0f8f68; }
    .warn { color: #b45309; font-weight: 700; }
    .bad { color: #dc2626; }
    @media print {
      body { padding: 12px; }
      .section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${parts.join("\n")}
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;
}

/** Export the on-screen Daily Reconciliation Report design as a print/PDF document. */
export function exportDailyReconciliationPdf(
  document: DailyReportDocumentModel,
) {
  openPrintDocument(buildDailyReconciliationPdfHtml(document));
}
