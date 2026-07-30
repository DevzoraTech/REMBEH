import { Injectable } from '@nestjs/common';
import {
  BranchOperationExpenseCategory,
  BranchOperationReportStatus,
  BranchOperationStatus,
  LoanApplicationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OPERATIONS_EVENTS } from './operations.events';
import { OPERATIONS_PERMISSIONS } from './operations.permissions';

export type BranchOperationRecord = Awaited<
  ReturnType<OperationsRepository['findOperationForDay']>
>;

const operationReportInclude = {
  managerReviewedBy: { select: { id: true, displayName: true } },
  ownerApprovedBy: { select: { id: true, displayName: true } },
  returnedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.BranchOperationReportInclude;

@Injectable()
export class OperationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBranch(input: { tenantId: string; branchId?: string | null }) {
    return this.prisma.branch.findFirst({
      where: {
        tenantId: input.tenantId,
        ...(input.branchId ? { id: input.branchId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  findOperationForDay(input: {
    tenantId: string;
    branchId: string;
    operationDate: Date;
  }) {
    return this.prisma.branchDailyOperation.findUnique({
      where: {
        tenantId_branchId_operationDate: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          operationDate: input.operationDate,
        },
      },
      include: {
        branch: true,
        openedBy: { select: { id: true, displayName: true } },
        closedBy: { select: { id: true, displayName: true } },
      },
    });
  }

  findLatestClosedBefore(input: {
    tenantId: string;
    branchId: string;
    beforeDate: Date;
  }) {
    return this.prisma.branchDailyOperation.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        operationDate: { lt: input.beforeDate },
        closingBalance: { not: null },
      },
      orderBy: { operationDate: 'desc' },
      include: {
        branch: true,
        openedBy: { select: { id: true, displayName: true } },
        closedBy: { select: { id: true, displayName: true } },
      },
    });
  }

  findOldestUnclosedBefore(input: {
    tenantId: string;
    branchId: string;
    beforeDate: Date;
  }) {
    return this.prisma.branchDailyOperation.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        operationDate: { lt: input.beforeDate },
        status: { not: BranchOperationStatus.CLOSED },
      },
      orderBy: { operationDate: 'asc' },
      include: {
        branch: true,
        openedBy: { select: { id: true, displayName: true } },
        closedBy: { select: { id: true, displayName: true } },
      },
    });
  }

  openBranch(input: {
    tenantId: string;
    branchId: string;
    operationDate: Date;
    openedAt: Date;
    openedByUserId: string;
    openingBalance: Prisma.Decimal;
    cashAddedToday: Prisma.Decimal;
    cashAvailableAtOpening: Prisma.Decimal;
    floatSetAside: Prisma.Decimal;
    notes: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const operation = await tx.branchDailyOperation.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          operationDate: input.operationDate,
          status: BranchOperationStatus.OPEN,
          openedAt: input.openedAt,
          openedByUserId: input.openedByUserId,
          cashInVault: input.cashAddedToday,
          cashInSafe: new Prisma.Decimal(0),
          cashAddedToday: input.cashAddedToday,
          openingFloatAvailable: input.cashAvailableAtOpening,
          previousClosingBalance: input.openingBalance,
          floatSetAsideAmount: input.floatSetAside,
          notes: input.notes,
        },
        include: {
          branch: true,
          openedBy: { select: { id: true, displayName: true } },
          closedBy: { select: { id: true, displayName: true } },
        },
      });

      if (input.cashAddedToday.gt(0)) {
        await tx.branchOperationTopUp.create({
          data: {
            tenantId: input.tenantId,
            branchId: input.branchId,
            operationId: operation.id,
            amount: input.cashAddedToday,
            description: 'Opening cash added',
            addedAt: input.openedAt,
            recordedByUserId: input.openedByUserId,
          },
        });
      }

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: OPERATIONS_EVENTS.branchOpened,
          aggregateType: 'branch_daily_operation',
          aggregateId: operation.id,
          payload: {
            operationId: operation.id,
            tenantId: operation.tenantId,
            branchId: operation.branchId,
            operationDate: this.formatDateLabel(operation.operationDate),
            status: operation.status,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.openedByUserId,
          action: OPERATIONS_PERMISSIONS.open,
          entityType: 'branch_daily_operation',
          entityId: operation.id,
          newValue: {
            branchId: operation.branchId,
            operationDate: this.formatDateLabel(operation.operationDate),
            status: operation.status,
            openingBalance: operation.previousClosingBalance.toString(),
            cashAddedToday: operation.cashAddedToday.toString(),
            cashAvailableAtOpening: operation.openingFloatAvailable.toString(),
            floatSetAside: operation.floatSetAsideAmount.toString(),
          },
        },
      });

      return operation;
    });
  }

  recordExpense(input: {
    tenantId: string;
    branchId: string;
    operationId: string;
    category: BranchOperationExpenseCategory;
    amount: Prisma.Decimal;
    description: string | null;
    incurredAt: Date;
    recordedByUserId: string;
    operationDate: Date;
    status: BranchOperationStatus;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.branchOperationExpense.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          operationId: input.operationId,
          category: input.category,
          amount: input.amount,
          description: input.description,
          incurredAt: input.incurredAt,
          recordedByUserId: input.recordedByUserId,
        },
        include: {
          recordedBy: { select: { id: true, displayName: true } },
          approvedBy: { select: { id: true, displayName: true } },
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: OPERATIONS_EVENTS.expenseRecorded,
          aggregateType: 'branch_operation_expense',
          aggregateId: expense.id,
          payload: {
            expenseId: expense.id,
            operationId: input.operationId,
            tenantId: input.tenantId,
            branchId: input.branchId,
            operationDate: this.formatDateLabel(input.operationDate),
            category: input.category,
            amount: input.amount.toString(),
            status: input.status,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.recordedByUserId,
          action: OPERATIONS_PERMISSIONS.expenseCreate,
          entityType: 'branch_operation_expense',
          entityId: expense.id,
          newValue: {
            operationId: input.operationId,
            branchId: input.branchId,
            operationDate: this.formatDateLabel(input.operationDate),
            category: input.category,
            amount: input.amount.toString(),
            description: input.description,
          },
        },
      });

      return expense;
    });
  }

  recordTopUp(input: {
    tenantId: string;
    branchId: string;
    operationId: string;
    amount: Prisma.Decimal;
    description: string | null;
    addedAt: Date;
    recordedByUserId: string;
    operationDate: Date;
    status: BranchOperationStatus;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const topUp = await tx.branchOperationTopUp.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          operationId: input.operationId,
          amount: input.amount,
          description: input.description,
          addedAt: input.addedAt,
          recordedByUserId: input.recordedByUserId,
        },
        include: {
          recordedBy: { select: { id: true, displayName: true } },
        },
      });

      await tx.branchDailyOperation.update({
        where: { id: input.operationId },
        data: {
          cashInVault: { increment: input.amount },
          cashAddedToday: { increment: input.amount },
          openingFloatAvailable: { increment: input.amount },
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: OPERATIONS_EVENTS.cashTopUpRecorded,
          aggregateType: 'branch_operation_topup',
          aggregateId: topUp.id,
          payload: {
            topUpId: topUp.id,
            operationId: input.operationId,
            tenantId: input.tenantId,
            branchId: input.branchId,
            operationDate: this.formatDateLabel(input.operationDate),
            amount: input.amount.toString(),
            status: input.status,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.recordedByUserId,
          action: OPERATIONS_PERMISSIONS.cashTopUp,
          entityType: 'branch_operation_topup',
          entityId: topUp.id,
          newValue: {
            operationId: input.operationId,
            branchId: input.branchId,
            operationDate: this.formatDateLabel(input.operationDate),
            amount: input.amount.toString(),
            description: input.description,
          },
        },
      });

      return topUp;
    });
  }

  recordAgentReturn(input: {
    tenantId: string;
    branchId: string;
    agentId: string;
    floatDate: Date;
    amountReturned: Prisma.Decimal;
    returnedAt: Date;
    returnedByUserId: string;
    notes: string | null;
    operationId: string;
    operationDate: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const float = await tx.agentDailyFloat.update({
        where: {
          tenantId_agentId_floatDate: {
            tenantId: input.tenantId,
            agentId: input.agentId,
            floatDate: input.floatDate,
          },
        },
        data: {
          amountReturned: input.amountReturned,
          returnedAt: input.returnedAt,
          returnedByUserId: input.returnedByUserId,
          returnNotes: input.notes,
        },
        include: {
          agent: { select: { id: true, displayName: true, publicId: true } },
          recordedBy: { select: { id: true, displayName: true } },
          returnedBy: { select: { id: true, displayName: true } },
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: OPERATIONS_EVENTS.agentFloatReturned,
          aggregateType: 'agent_daily_float',
          aggregateId: float.id,
          payload: {
            floatId: float.id,
            operationId: input.operationId,
            tenantId: input.tenantId,
            branchId: input.branchId,
            agentId: input.agentId,
            operationDate: this.formatDateLabel(input.operationDate),
            amountReturned: input.amountReturned.toString(),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.returnedByUserId,
          action: OPERATIONS_PERMISSIONS.floatReturn,
          entityType: 'agent_daily_float',
          entityId: float.id,
          newValue: {
            operationId: input.operationId,
            branchId: input.branchId,
            agentId: input.agentId,
            operationDate: this.formatDateLabel(input.operationDate),
            amountReturned: input.amountReturned.toString(),
            notes: input.notes,
          },
        },
      });

      return float;
    });
  }

  closeBranch(input: {
    tenantId: string;
    branchId: string;
    operationId: string;
    closedAt: Date;
    closedByUserId: string;
    closingBalance: Prisma.Decimal;
    closingNotes: string | null;
    operationDate: Date;
    expectedClosingBalance: number;
    variance: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const operation = await tx.branchDailyOperation.update({
        where: { id: input.operationId },
        data: {
          status: BranchOperationStatus.CLOSED,
          closedAt: input.closedAt,
          closedByUserId: input.closedByUserId,
          closingBalance: input.closingBalance,
          closingNotes: input.closingNotes,
        },
        include: {
          branch: true,
          openedBy: { select: { id: true, displayName: true } },
          closedBy: { select: { id: true, displayName: true } },
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: OPERATIONS_EVENTS.branchClosed,
          aggregateType: 'branch_daily_operation',
          aggregateId: operation.id,
          payload: {
            operationId: operation.id,
            tenantId: input.tenantId,
            branchId: input.branchId,
            operationDate: this.formatDateLabel(input.operationDate),
            status: operation.status,
            closingBalance: input.closingBalance.toString(),
            expectedClosingBalance: input.expectedClosingBalance,
            variance: input.variance,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.closedByUserId,
          action: OPERATIONS_PERMISSIONS.close,
          entityType: 'branch_daily_operation',
          entityId: operation.id,
          newValue: {
            branchId: input.branchId,
            operationDate: this.formatDateLabel(input.operationDate),
            closingBalance: input.closingBalance.toString(),
            expectedClosingBalance: input.expectedClosingBalance,
            variance: input.variance,
            notes: input.closingNotes,
          },
        },
      });

      return operation;
    });
  }

  findReportForOperation(input: { tenantId: string; operationId: string }) {
    return this.prisma.branchOperationReport.findFirst({
      where: {
        tenantId: input.tenantId,
        operationId: input.operationId,
      },
      include: operationReportInclude,
    });
  }

  findReportById(input: { tenantId: string; reportId: string }) {
    return this.prisma.branchOperationReport.findFirst({
      where: {
        tenantId: input.tenantId,
        id: input.reportId,
      },
      include: {
        ...operationReportInclude,
        operation: {
          include: {
            branch: true,
            openedBy: { select: { id: true, displayName: true } },
            closedBy: { select: { id: true, displayName: true } },
          },
        },
      },
    });
  }

  createOperationReport(input: {
    tenantId: string;
    branchId: string;
    operationId: string;
    operationDate: Date;
    reportNumber: string;
    snapshot: Prisma.InputJsonValue;
    generatedByUserId: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.branchOperationReport.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          operationId: input.operationId,
          operationDate: input.operationDate,
          reportNumber: input.reportNumber,
          status: BranchOperationReportStatus.MANAGER_REVIEW,
          snapshot: input.snapshot,
        },
        include: operationReportInclude,
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: OPERATIONS_EVENTS.reportGenerated,
          aggregateType: 'branch_operation_report',
          aggregateId: report.id,
          payload: {
            reportId: report.id,
            reportNumber: report.reportNumber,
            operationId: input.operationId,
            tenantId: input.tenantId,
            branchId: input.branchId,
            operationDate: this.formatDateLabel(input.operationDate),
            status: report.status,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.generatedByUserId,
          action: 'operation.report.generate',
          entityType: 'branch_operation_report',
          entityId: report.id,
          newValue: {
            reportNumber: report.reportNumber,
            operationId: input.operationId,
            branchId: input.branchId,
            operationDate: this.formatDateLabel(input.operationDate),
            status: report.status,
          },
        },
      });

      return report;
    });
  }

  managerConfirmReport(input: {
    tenantId: string;
    reportId: string;
    reviewedByUserId: string;
    notes: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.branchOperationReport.update({
        where: { id: input.reportId },
        data: {
          status: BranchOperationReportStatus.SENT_TO_OWNER,
          managerReviewedAt: new Date(),
          managerReviewedById: input.reviewedByUserId,
          managerNotes: input.notes,
          returnedAt: null,
          returnedById: null,
          returnNotes: null,
        },
        include: operationReportInclude,
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: OPERATIONS_EVENTS.reportManagerReviewed,
          aggregateType: 'branch_operation_report',
          aggregateId: report.id,
          payload: {
            reportId: report.id,
            reportNumber: report.reportNumber,
            operationId: report.operationId,
            tenantId: input.tenantId,
            branchId: report.branchId,
            operationDate: this.formatDateLabel(report.operationDate),
            status: report.status,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.reviewedByUserId,
          action: OPERATIONS_PERMISSIONS.reportReview,
          entityType: 'branch_operation_report',
          entityId: report.id,
          newValue: {
            reportNumber: report.reportNumber,
            operationId: report.operationId,
            branchId: report.branchId,
            operationDate: this.formatDateLabel(report.operationDate),
            status: report.status,
            notes: input.notes,
          },
        },
      });

      return report;
    });
  }

  ownerApproveReport(input: {
    tenantId: string;
    reportId: string;
    approvedByUserId: string;
    notes: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.branchOperationReport.update({
        where: { id: input.reportId },
        data: {
          status: BranchOperationReportStatus.OWNER_APPROVED,
          ownerApprovedAt: new Date(),
          ownerApprovedById: input.approvedByUserId,
          ownerNotes: input.notes,
        },
        include: operationReportInclude,
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: OPERATIONS_EVENTS.reportOwnerApproved,
          aggregateType: 'branch_operation_report',
          aggregateId: report.id,
          payload: {
            reportId: report.id,
            reportNumber: report.reportNumber,
            operationId: report.operationId,
            tenantId: input.tenantId,
            branchId: report.branchId,
            operationDate: this.formatDateLabel(report.operationDate),
            status: report.status,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.approvedByUserId,
          action: OPERATIONS_PERMISSIONS.approve,
          entityType: 'branch_operation_report',
          entityId: report.id,
          newValue: {
            reportNumber: report.reportNumber,
            operationId: report.operationId,
            branchId: report.branchId,
            operationDate: this.formatDateLabel(report.operationDate),
            status: report.status,
            notes: input.notes,
          },
        },
      });

      return report;
    });
  }

  sumFloatIssued(input: {
    tenantId: string;
    branchId: string;
    floatDate: Date;
  }) {
    return this.prisma.agentDailyFloat.aggregate({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        floatDate: input.floatDate,
      },
      _sum: { amountGiven: true },
      _count: { _all: true },
    });
  }

  sumFloatReturned(input: {
    tenantId: string;
    branchId: string;
    floatDate: Date;
  }) {
    return this.prisma.agentDailyFloat.aggregate({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        floatDate: input.floatDate,
      },
      _sum: { amountReturned: true },
      _count: { amountReturned: true },
    });
  }

  findAgentFloatForDay(input: {
    tenantId: string;
    branchId: string;
    agentId: string;
    floatDate: Date;
  }) {
    return this.prisma.agentDailyFloat.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        agentId: input.agentId,
        floatDate: input.floatDate,
      },
    });
  }

  listAgentFloatsForOperation(input: {
    tenantId: string;
    branchId: string;
    floatDate: Date;
  }) {
    return this.prisma.agentDailyFloat.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        floatDate: input.floatDate,
      },
      include: {
        agent: { select: { id: true, displayName: true, publicId: true } },
        recordedBy: { select: { id: true, displayName: true } },
        returnedBy: { select: { id: true, displayName: true } },
      },
      orderBy: [{ agent: { displayName: 'asc' } }, { createdAt: 'asc' }],
    });
  }

  listTopUpsForOperation(input: { tenantId: string; operationId: string }) {
    return this.prisma.branchOperationTopUp.findMany({
      where: {
        tenantId: input.tenantId,
        operationId: input.operationId,
      },
      include: {
        recordedBy: { select: { id: true, displayName: true } },
      },
      orderBy: { addedAt: 'desc' },
    });
  }

  sumLoansIssued(input: {
    tenantId: string;
    branchId: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.loanApplication.aggregate({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        status: LoanApplicationStatus.SUBMITTED,
        submittedAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: { principalAmount: true, processingFee: true },
      _count: { _all: true },
    });
  }

  sumLoansIssuedByAgent(input: {
    tenantId: string;
    branchId: string;
    agentIds: string[];
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.loanApplication.groupBy({
      by: ['officerUserId'],
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        officerUserId: { in: input.agentIds },
        status: LoanApplicationStatus.SUBMITTED,
        submittedAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: { principalAmount: true, processingFee: true },
      _count: { _all: true },
    });
  }

  sumLoansIssuedForAgent(input: {
    tenantId: string;
    branchId: string;
    agentId: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.loanApplication.aggregate({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        officerUserId: input.agentId,
        status: LoanApplicationStatus.SUBMITTED,
        submittedAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: { principalAmount: true, processingFee: true },
      _count: { _all: true },
    });
  }

  sumCollections(input: {
    tenantId: string;
    branchId: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.repayment.aggregate({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        paidAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
  }

  sumCollectionsForAgent(input: {
    tenantId: string;
    branchId: string;
    agentId: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.repayment.aggregate({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        recordedByUserId: input.agentId,
        paidAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
  }

  sumCollectionsByAgent(input: {
    tenantId: string;
    branchId: string;
    agentIds: string[];
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.repayment.groupBy({
      by: ['recordedByUserId'],
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        recordedByUserId: { in: input.agentIds },
        paidAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
  }

  listExpensesForOperation(input: { tenantId: string; operationId: string }) {
    return this.prisma.branchOperationExpense.findMany({
      where: {
        tenantId: input.tenantId,
        operationId: input.operationId,
      },
      include: {
        recordedBy: { select: { id: true, displayName: true } },
        approvedBy: { select: { id: true, displayName: true } },
      },
      orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  sumExpensesForOperation(input: { tenantId: string; operationId: string }) {
    return this.prisma.branchOperationExpense.aggregate({
      where: {
        tenantId: input.tenantId,
        operationId: input.operationId,
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
  }

  private formatDateLabel(value: Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
