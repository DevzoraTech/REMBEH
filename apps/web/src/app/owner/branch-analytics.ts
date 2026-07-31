import type {
  OwnerBranch,
  OwnerBranchDailyStatus,
  OwnerLoan,
  OwnerRepayment,
} from "./owner-common";

export type BranchAttentionLevel =
  | "healthy"
  | "attention"
  | "follow_up"
  | "high_risk"
  | "critical";

export type BranchDailyCollectionRate = {
  date: string;
  expectedCount: number;
  collectedCount: number;
  rate: number | null;
};

export type BranchCollectionPerformance = {
  branchId: string;
  branchName: string;
  dailyRates: BranchDailyCollectionRate[];
  averageRate: number | null;
  collectionLevel: BranchAttentionLevel;
  collectionReason: string;
  overdueExposure: BranchOverdueExposure;
  dailyCompliance: BranchDailyCompliance;
  level: BranchAttentionLevel;
  reason: string;
  reasons: string[];
};

export type BorrowerOverdueExposure = {
  customerId: string;
  borrowerName: string;
  phone: string;
  nationalId: string | null;
  branchId: string;
  loanId: string;
  overdueDays: number;
  installmentAmount: number;
  expectedAmount: number;
  paidAmount: number;
  status: BranchAttentionLevel;
};

export type BranchOverdueExposure = {
  borrowers: BorrowerOverdueExposure[];
  followUpCount: number;
  highRiskCount: number;
  criticalCount: number;
  totalFlagged: number;
  maxOverdueDays: number;
  level: BranchAttentionLevel;
  reason: string;
};

export type BranchDailyCompliance = {
  date: string | null;
  operationStatus: OwnerBranchDailyStatus["operationStatus"];
  reportStatus: OwnerBranchDailyStatus["reportStatus"];
  reconciled: boolean;
  reportSubmitted: boolean;
  missingReconciliation: boolean;
  missingReport: boolean;
  level: BranchAttentionLevel;
  reason: string;
};

const LOAN_STATUSES_EXPECTING_REPAYMENT = new Set([
  "SUBMITTED",
  "APPROVED",
  "DISBURSED",
  "CURRENT",
  "IN_ARREARS",
  "RESTRUCTURED",
]);

const SUBMITTED_REPORT_STATUSES = new Set([
  "SENT_TO_OWNER",
  "OWNER_APPROVED",
  "RETURNED_TO_MANAGER",
]);

export function buildBranchCollectionPerformance({
  branches,
  loans,
  repayments,
  dailyStatuses = [],
  days = 7,
  today = new Date(),
}: {
  branches: OwnerBranch[];
  loans: OwnerLoan[];
  repayments: OwnerRepayment[];
  dailyStatuses?: OwnerBranchDailyStatus[];
  days?: number;
  today?: Date;
}): BranchCollectionPerformance[] {
  const dates = lastNDates(days, today);
  const loanById = new Map(loans.map((loan) => [loan.id, loan]));
  const loansByBranch = groupLoansByBranch(loans);
  const overdueExposureByBranch = buildOverdueExposureByBranch({
    branches,
    loans,
    repayments,
    today,
  });
  const dailyComplianceByBranch = buildDailyComplianceByBranch(dailyStatuses);
  const collectedLoanIdsByBranchDate = new Map<string, Set<string>>();

  for (const repayment of repayments) {
    if (repayment.amount <= 0) continue;
    const loan = loanById.get(repayment.loanId);
    if (!loan) continue;
    const key = `${loan.branchId}:${dateKey(new Date(repayment.recordedAt))}`;
    const collected = collectedLoanIdsByBranchDate.get(key) ?? new Set<string>();
    collected.add(repayment.loanId);
    collectedLoanIdsByBranchDate.set(key, collected);
  }

  return branches.map((branch) => {
    const branchLoans = loansByBranch.get(branch.id) ?? [];
    const dailyRates = dates.map((date) => {
      const expectedCount = branchLoans.filter((loan) =>
        expectsRepaymentOnDate(loan, date),
      ).length;
      const collectedCount =
        collectedLoanIdsByBranchDate.get(`${branch.id}:${dateKey(date)}`)
          ?.size ?? 0;
      const rate =
        expectedCount > 0
          ? Math.min(100, Math.round((collectedCount / expectedCount) * 1000) / 10)
          : null;

      return {
        date: dateKey(date),
        expectedCount,
        collectedCount,
        rate,
      };
    });
    const ratedDays = dailyRates.filter(
      (item): item is BranchDailyCollectionRate & { rate: number } =>
        item.rate != null,
    );
    const averageRate =
      ratedDays.length > 0
        ? Math.round(
            (ratedDays.reduce((total, item) => total + item.rate, 0) /
              ratedDays.length) *
              10,
          ) / 10
        : null;
    const collectionLevel = collectionAttentionLevel(averageRate);
    const collectionReason = collectionAttentionReason(
      averageRate,
      ratedDays.length,
    );
    const overdueExposure =
      overdueExposureByBranch.get(branch.id) ?? emptyOverdueExposure();
    const dailyCompliance =
      dailyComplianceByBranch.get(branch.id) ?? emptyDailyCompliance();
    const level = worstAttentionLevel(
      worstAttentionLevel(collectionLevel, overdueExposure.level),
      dailyCompliance.level,
    );
    const reasons = [
      collectionLevel !== "healthy" ? collectionReason : null,
      overdueExposure.level !== "healthy" ? overdueExposure.reason : null,
      dailyCompliance.level !== "healthy" ? dailyCompliance.reason : null,
    ].filter((reason): reason is string => Boolean(reason));

    return {
      branchId: branch.id,
      branchName: branch.name,
      dailyRates,
      averageRate,
      collectionLevel,
      collectionReason,
      overdueExposure,
      dailyCompliance,
      level,
      reason: reasons.length > 0 ? reasons.join(" ") : collectionReason,
      reasons,
    };
  });
}

export function attentionLabel(level: BranchAttentionLevel) {
  if (level === "critical") return "Critical";
  if (level === "high_risk") return "High risk";
  if (level === "follow_up") return "Requires follow-up";
  if (level === "attention") return "Needs attention";
  return "Healthy";
}

export function attentionSeverityRank(level: BranchAttentionLevel) {
  return severityRank(level);
}

/** Short labels for reason chips in attention UI. */
export function attentionReasonKind(reason: string): {
  kind: "collection" | "overdue" | "daily" | "other";
  title: string;
} {
  const lower = reason.toLowerCase();
  if (lower.includes("repayment rate") || lower.includes("collection rate")) {
    return { kind: "collection", title: "Repayments" };
  }
  if (
    lower.includes("overdue") ||
    lower.includes("borrower") ||
    lower.includes("follow-up") ||
    lower.includes("high risk") ||
    lower.includes("critical")
  ) {
    return { kind: "overdue", title: "Overdue loans" };
  }
  if (
    lower.includes("reconcil") ||
    lower.includes("daily report") ||
    lower.includes("report for")
  ) {
    return { kind: "daily", title: "Daily close" };
  }
  return { kind: "other", title: "Issue" };
}

export const ATTENTION_TABLE_TOOLTIP =
  "Repayment % is collected vs expected over the last 7 days — 70% or less needs a look, under 50% is critical. Overdue is borrowers missing 2+ days. Daily close is yesterday’s reconciliation and report.";

export function repaymentBandLabel(averageRate: number | null) {
  if (averageRate == null) return "—";
  if (averageRate < 50) return "<50%";
  if (averageRate <= 70) return "≤70%";
  return "Above 70%";
}

function collectionAttentionLevel(
  averageRate: number | null,
): BranchAttentionLevel {
  if (averageRate == null) return "healthy";
  if (averageRate < 50) return "critical";
  if (averageRate <= 70) return "attention";
  return "healthy";
}

function collectionAttentionReason(
  averageRate: number | null,
  ratedDays: number,
) {
  if (averageRate == null || ratedDays === 0) {
    return "No expected repayments in the last 7 days.";
  }
  if (averageRate < 50) {
    return "Repayment rate is less than 50% over the last 7 days.";
  }
  if (averageRate <= 70) {
    return "Repayment rate is 70% or less over the last 7 days.";
  }
  return "Repayment rate is above 70% over the last 7 days.";
}

function buildDailyComplianceByBranch(
  dailyStatuses: OwnerBranchDailyStatus[],
) {
  const compliance = new Map<string, BranchDailyCompliance>();
  for (const status of dailyStatuses) {
    const reconciled =
      status.operationStatus === "CLOSED" && Boolean(status.closedAt);
    const reportSubmitted =
      status.reportStatus != null &&
      SUBMITTED_REPORT_STATUSES.has(status.reportStatus);
    const missingReconciliation = !reconciled;
    const missingReport = !reportSubmitted;
    const reasons = [
      missingReconciliation
        ? `Branch did not reconcile ${status.operationDate}.`
        : null,
      missingReport
        ? `Expected daily report for ${status.operationDate} was not submitted.`
        : null,
    ].filter((reason): reason is string => Boolean(reason));

    compliance.set(status.branchId, {
      date: status.operationDate,
      operationStatus: status.operationStatus,
      reportStatus: status.reportStatus,
      reconciled,
      reportSubmitted,
      missingReconciliation,
      missingReport,
      level: reasons.length > 0 ? "critical" : "healthy",
      reason:
        reasons.length > 0
          ? reasons.join(" ")
          : `Branch reconciled and submitted the daily report for ${status.operationDate}.`,
    });
  }
  return compliance;
}

function buildOverdueExposureByBranch({
  branches,
  loans,
  repayments,
  today,
}: {
  branches: OwnerBranch[];
  loans: OwnerLoan[];
  repayments: OwnerRepayment[];
  today: Date;
}) {
  const paidByLoan = new Map<string, number>();
  const todayEnd = endOfDay(today);

  for (const repayment of repayments) {
    const paidAt = parseOptionalDate(repayment.recordedAt);
    if (!paidAt || paidAt > todayEnd || repayment.amount <= 0) continue;
    paidByLoan.set(
      repayment.loanId,
      (paidByLoan.get(repayment.loanId) ?? 0) + repayment.amount,
    );
  }

  const borrowersByBranch = new Map<string, Map<string, BorrowerOverdueExposure>>();
  for (const loan of loans) {
    const exposure = borrowerOverdueExposureForLoan(
      loan,
      paidByLoan.get(loan.id) ?? loan.paidAmount,
      today,
    );
    if (!exposure || exposure.status === "healthy") continue;

    const branchBorrowers =
      borrowersByBranch.get(loan.branchId) ??
      new Map<string, BorrowerOverdueExposure>();
    const current = branchBorrowers.get(loan.customerId);
    if (!current || severityRank(exposure.status) > severityRank(current.status)) {
      branchBorrowers.set(loan.customerId, exposure);
    }
    borrowersByBranch.set(loan.branchId, branchBorrowers);
  }

  const exposureByBranch = new Map<string, BranchOverdueExposure>();
  for (const branch of branches) {
    const borrowers = Array.from(
      borrowersByBranch.get(branch.id)?.values() ?? [],
    ).sort((a, b) => b.overdueDays - a.overdueDays);
    const followUpCount = borrowers.filter(
      (borrower) => borrower.status === "follow_up",
    ).length;
    const highRiskCount = borrowers.filter(
      (borrower) => borrower.status === "high_risk",
    ).length;
    const criticalCount = borrowers.filter(
      (borrower) => borrower.status === "critical",
    ).length;
    const maxOverdueDays = borrowers[0]?.overdueDays ?? 0;
    const level =
      criticalCount > 0
        ? "critical"
        : highRiskCount > 0
          ? "high_risk"
          : followUpCount > 0
            ? "follow_up"
            : "healthy";

    exposureByBranch.set(branch.id, {
      borrowers,
      followUpCount,
      highRiskCount,
      criticalCount,
      totalFlagged: borrowers.length,
      maxOverdueDays,
      level,
      reason: overdueExposureReason({
        followUpCount,
        highRiskCount,
        criticalCount,
        maxOverdueDays,
      }),
    });
  }

  return exposureByBranch;
}

function borrowerOverdueExposureForLoan(
  loan: OwnerLoan,
  cumulativePaid: number,
  today: Date,
): BorrowerOverdueExposure | null {
  if (!loanExpectsRepayment(loan)) return null;
  if (loan.installmentAmount <= 0) return null;

  const startAt = parseOptionalDate(
    loan.paymentStartDate ?? loan.disbursedAt ?? loan.createdAt,
  );
  if (!startAt) return null;

  const expectedDays = expectedRepaymentDays(loan, startAt, today);
  if (expectedDays <= 0) return null;

  const coveredDays = Math.min(
    expectedDays,
    Math.floor(Math.max(0, cumulativePaid) / loan.installmentAmount),
  );
  const overdueDays = expectedDays - coveredDays;
  const status = overdueExposureStatus(overdueDays);
  if (status === "healthy") return null;

  return {
    customerId: loan.customerId,
    borrowerName: loan.borrowerName,
    phone: loan.phone,
    nationalId: loan.nationalId,
    branchId: loan.branchId,
    loanId: loan.id,
    overdueDays,
    installmentAmount: loan.installmentAmount,
    expectedAmount: expectedDays * loan.installmentAmount,
    paidAmount: cumulativePaid,
    status,
  };
}

function expectedRepaymentDays(loan: OwnerLoan, startAt: Date, today: Date) {
  const todayEnd = endOfDay(today);
  if (todayEnd < startAt) return 0;

  const dueAt = parseOptionalDate(loan.dueDate);
  const endAt = dueAt && dueAt < todayEnd ? dueAt : todayEnd;
  const elapsedDays = daysBetween(startOfDay(startAt), startOfDay(endAt)) + 1;

  if (loan.durationDays != null && loan.durationDays > 0) {
    return Math.min(elapsedDays, loan.durationDays);
  }
  return elapsedDays;
}

function overdueExposureStatus(overdueDays: number): BranchAttentionLevel {
  if (overdueDays >= 8) return "critical";
  if (overdueDays >= 4) return "high_risk";
  if (overdueDays >= 2) return "follow_up";
  return "healthy";
}

function overdueExposureReason({
  followUpCount,
  highRiskCount,
  criticalCount,
  maxOverdueDays,
}: {
  followUpCount: number;
  highRiskCount: number;
  criticalCount: number;
  maxOverdueDays: number;
}) {
  const total = followUpCount + highRiskCount + criticalCount;
  const parts = [
    criticalCount > 0 ? `${criticalCount} critical` : null,
    highRiskCount > 0 ? `${highRiskCount} high risk` : null,
    followUpCount > 0 ? `${followUpCount} requiring follow-up` : null,
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) return "No borrower overdue exposure alert.";
  return `${parts.join(", ")} borrower${total === 1 ? "" : "s"} flagged by overdue exposure. Highest exposure is ${maxOverdueDays} overdue day${maxOverdueDays === 1 ? "" : "s"}.`;
}

function emptyOverdueExposure(): BranchOverdueExposure {
  return {
    borrowers: [],
    followUpCount: 0,
    highRiskCount: 0,
    criticalCount: 0,
    totalFlagged: 0,
    maxOverdueDays: 0,
    level: "healthy",
    reason: "No borrower overdue exposure alert.",
  };
}

function emptyDailyCompliance(): BranchDailyCompliance {
  return {
    date: null,
    operationStatus: null,
    reportStatus: null,
    reconciled: true,
    reportSubmitted: true,
    missingReconciliation: false,
    missingReport: false,
    level: "healthy",
    reason: "No daily reconciliation check for this branch.",
  };
}

function expectsRepaymentOnDate(loan: OwnerLoan, date: Date) {
  const status = loan.status.toUpperCase();
  const issuedAt = parseOptionalDate(loan.disbursedAt ?? loan.createdAt);
  const startAt = parseOptionalDate(
    loan.paymentStartDate ?? loan.disbursedAt ?? loan.createdAt,
  );
  const dueAt = parseOptionalDate(loan.dueDate);
  const closedAt = status === "CLOSED" ? parseOptionalDate(loan.updatedAt) : null;

  if (!issuedAt || !startAt) return false;
  if (!LOAN_STATUSES_EXPECTING_REPAYMENT.has(status) && status !== "CLOSED") {
    return false;
  }

  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  if (dayEnd < issuedAt || dayEnd < startAt) return false;

  const expectedEnd =
    closedAt && dueAt
      ? new Date(Math.min(closedAt.getTime(), dueAt.getTime()))
      : closedAt ?? dueAt;
  if (expectedEnd && dayStart > endOfDay(expectedEnd)) return false;

  if (status !== "CLOSED" && loan.balance <= 0) return false;
  return true;
}

function loanExpectsRepayment(loan: OwnerLoan) {
  const status = loan.status.toUpperCase();
  return LOAN_STATUSES_EXPECTING_REPAYMENT.has(status) && loan.balance > 0;
}

function worstAttentionLevel(
  left: BranchAttentionLevel,
  right: BranchAttentionLevel,
) {
  return severityRank(right) > severityRank(left) ? right : left;
}

function severityRank(level: BranchAttentionLevel) {
  return {
    healthy: 0,
    attention: 1,
    follow_up: 2,
    high_risk: 3,
    critical: 4,
  }[level];
}

function groupLoansByBranch(loans: OwnerLoan[]) {
  const grouped = new Map<string, OwnerLoan[]>();
  for (const loan of loans) {
    const branchLoans = grouped.get(loan.branchId) ?? [];
    branchLoans.push(loan);
    grouped.set(loan.branchId, branchLoans);
  }
  return grouped;
}

function lastNDates(days: number, today: Date) {
  const start = startOfDay(today);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() - (days - 1 - index));
    return date;
  });
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseOptionalDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(start: Date, end: Date) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(
    0,
    Math.floor(
      (startOfDay(end).getTime() - startOfDay(start).getTime()) /
        millisecondsPerDay,
    ),
  );
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}
