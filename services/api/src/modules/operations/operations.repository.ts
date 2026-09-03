import { Injectable } from '@nestjs/common';
import {
  BranchOperationExpensePaidFrom,
  BranchOperationReportStatus,
  BranchOperationStatus,
  LoanApplicationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OPERATIONS_EVENTS } from './operations.events';
import { OPERATIONS_PERMISSIONS } from './operations.permissions';

const operationReportInclude = {
  managerReviewedBy: {
    select: {
      id: true,
      displayName: true,
    },
  },
  ownerApprovedBy: {
    select: {
      id: true,
      displayName: true,
    },
  },
  returnedBy: {
    select: {
      id: true,
      displayName: true,
    },
  },
} satisfies Prisma.BranchOperationReportInclude;

const branchOperationInclude = {
  branch: true,
  openedBy: {
    select: {
      id: true,
      displayName: true,
    },
  },
  closedBy: {
    select: {
      id: true,
      displayName: true,
    },
  },
  reconciliation: {
    include: {
      startedBy: {
        select: {
          id: true,
          displayName: true,
        },
      },
      updatedBy: {
        select: {
          id: true,
          displayName: true,
        },
      },
      cashCounts: {
        include: {
          recordedBy: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
        orderBy: {
          recordedAt: 'desc' as const,
        },
      },
    },
  },
} satisfies Prisma.BranchDailyOperationInclude;

const reconciliationInclude = {
  branch: true,
  operation: {
    include: branchOperationInclude,
  },
  startedBy: {
    select: {
      id: true,
      displayName: true,
    },
  },
  updatedBy: {
    select: {
      id: true,
      displayName: true,
    },
  },
  cashCounts: {
    include: {
      recordedBy: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
    orderBy: {
      recordedAt: 'desc' as const,
    },
  },
} satisfies Prisma.BranchOperationReconciliationInclude;

export type BranchOperationRecord = Awaited<
  ReturnType<OperationsRepository['findOperationForDay']>
>;

@Injectable()
export class OperationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBranch(input: { tenantId: string; branchId?: string | null }) {
    return this.prisma.branch.findFirst({
      where: {
        tenantId: input.tenantId,
        ...(input.branchId ? { id: input.branchId } : {}),
      },
      orderBy: {
        createdAt: 'asc',
      },
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
      include: branchOperationInclude,
    });
  }

  listBranchDailyStatuses(input: {
    tenantId: string;
    operationDate: Date;
    branchId?: string | null;
  }) {
    return this.prisma.branch.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.branchId ? { id: input.branchId } : {}),
        createdAt: {
          lte: new Date(
            input.operationDate.getTime() + 24 * 60 * 60 * 1000 - 1,
          ),
        },
      },
      orderBy: {
        name: 'asc',
      },
      include: {
        dailyOperations: {
          where: {
            operationDate: input.operationDate,
          },
          include: {
            report: true,
          },
          take: 1,
        },
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
        operationDate: {
          lt: input.beforeDate,
        },
        closingBalance: {
          not: null,
        },
      },
      orderBy: {
        operationDate: 'desc',
      },
      include: branchOperationInclude,
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
        operationDate: {
          lt: input.beforeDate,
        },
        status: {
          not: BranchOperationStatus.CLOSED,
        },
      },
      orderBy: {
        operationDate: 'asc',
      },
      include: branchOperationInclude,
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
        include: branchOperationInclude,
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
  amount: Prisma.Decimal;
  description: string | null;
  paidFrom: BranchOperationExpensePaidFrom;
  agentId: string | null;
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
        amount: input.amount,
        description: input.description,
        paidFrom: input.paidFrom,
        agentId: input.agentId,
        incurredAt: input.incurredAt,
        recordedByUserId: input.recordedByUserId,
      },
      include: {
        recordedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
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
          amount: input.amount.toString(),
          paidFrom: input.paidFrom,
          agentId: input.agentId,
          recordedByUserId: input.recordedByUserId,
          status: input.status,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.recordedByUserId,
        action:
          input.paidFrom === BranchOperationExpensePaidFrom.AGENT_FLOAT
            ? OPERATIONS_PERMISSIONS.agentExpenseCreate
            : OPERATIONS_PERMISSIONS.expenseCreate,
        entityType: 'branch_operation_expense',
        entityId: expense.id,
        newValue: {
          operationId: input.operationId,
          branchId: input.branchId,
          operationDate: this.formatDateLabel(input.operationDate),
          amount: input.amount.toString(),
          description: input.description,
          paidFrom: input.paidFrom,
          agentId: input.agentId,
          recordedByUserId: input.recordedByUserId,
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
          recordedBy: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      });

      await tx.branchDailyOperation.update({
        where: {
          id: input.operationId,
        },
        data: {
          cashInVault: {
            increment: input.amount,
          },
          cashAddedToday: {
            increment: input.amount,
          },
          openingFloatAvailable: {
            increment: input.amount,
          },
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
      const float = await tx.agentDailyFloat.upsert({
        where: {
          tenantId_agentId_floatDate: {
            tenantId: input.tenantId,
            agentId: input.agentId,
            floatDate: input.floatDate,
          },
        },
        update: {
          amountReturned: input.amountReturned,
          returnedAt: input.returnedAt,
          returnedByUserId: input.returnedByUserId,
          returnNotes: input.notes,
        },
        create: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          agentId: input.agentId,
          floatDate: input.floatDate,
          amountGiven: new Prisma.Decimal(0),
          recordedByUserId: input.returnedByUserId,
          amountReturned: input.amountReturned,
          returnedAt: input.returnedAt,
          returnedByUserId: input.returnedByUserId,
          returnNotes: input.notes,
          notes: 'Auto-created from officer cash handover.',
        },
        include: {
          agent: {
            select: {
              id: true,
              displayName: true,
              publicId: true,
            },
          },
          recordedBy: {
            select: {
              id: true,
              displayName: true,
            },
          },
          returnedBy: {
            select: {
              id: true,
              displayName: true,
            },
          },
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
        where: {
          id: input.operationId,
        },
        data: {
          status: BranchOperationStatus.CLOSED,
          closedAt: input.closedAt,
          closedByUserId: input.closedByUserId,
          closingBalance: input.closingBalance,
          closingNotes: input.closingNotes,
        },
        include: branchOperationInclude,
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
          include: branchOperationInclude,
        },
      },
    });
  }

  listOwnerReports(input: {
    tenantId: string;
    branchId?: string | null;
    status?: BranchOperationReportStatus | null;
    fromDate?: Date | null;
    toDate?: Date | null;
    includeManagerReview?: boolean;
  }) {
    const allowedStatuses: BranchOperationReportStatus[] = [
      BranchOperationReportStatus.SENT_TO_OWNER,
      BranchOperationReportStatus.OWNER_APPROVED,
      BranchOperationReportStatus.RETURNED_TO_MANAGER,
      ...(input.includeManagerReview
        ? [BranchOperationReportStatus.MANAGER_REVIEW]
        : []),
    ];

    return this.prisma.branchOperationReport.findMany({
      where: {
        tenantId: input.tenantId,
        status:
          input.status && allowedStatuses.includes(input.status)
            ? input.status
            : {
                in: allowedStatuses,
              },
        ...(input.branchId
          ? {
              branchId: input.branchId,
            }
          : {}),
        ...(input.fromDate || input.toDate
          ? {
              operationDate: {
                ...(input.fromDate
                  ? {
                      gte: input.fromDate,
                    }
                  : {}),
                ...(input.toDate
                  ? {
                      lte: input.toDate,
                    }
                  : {}),
              },
            }
          : {}),
      },
      include: {
        ...operationReportInclude,
        branch: true,
        operation: {
          include: branchOperationInclude,
        },
      },
      orderBy: [
        {
          operationDate: 'desc',
        },
        {
          generatedAt: 'desc',
        },
      ],
      take: 250,
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
        where: {
          id: input.reportId,
        },
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
        where: {
          id: input.reportId,
        },
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

  findReconciliationForOperation(input: {
    tenantId: string;
    operationId: string;
  }) {
    return this.prisma.branchOperationReconciliation.findFirst({
      where: {
        tenantId: input.tenantId,
        operationId: input.operationId,
      },
      include: reconciliationInclude,
    });
  }

  findReconciliationById(input: {
    tenantId: string;
    reconciliationId: string;
  }) {
    return this.prisma.branchOperationReconciliation.findFirst({
      where: {
        tenantId: input.tenantId,
        id: input.reconciliationId,
      },
      include: reconciliationInclude,
    });
  }

  findReconciliationForDay(input: {
    tenantId: string;
    branchId: string;
    operationDate: Date;
  }) {
    return this.prisma.branchOperationReconciliation.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        operation: {
          operationDate: input.operationDate,
        },
      },
      include: reconciliationInclude,
    });
  }

  findExpenseById(input: {
    tenantId: string;
    branchId: string;
    expenseId: string;
  }) {
    return this.prisma.branchOperationExpense.findFirst({
      where: {
        id: input.expenseId,
        tenantId: input.tenantId,
        branchId: input.branchId,
      },
      include: {
        operation: true,
        recordedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
        agent: {
          select: {
            id: true,
            displayName: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
        voidedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });
  }
  markOperationClosing(input: {
    tenantId: string;
    operationId: string;
    actorUserId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const operation = await tx.branchDailyOperation.update({
        where: {
          id: input.operationId,
        },
        data: {
          status: BranchOperationStatus.CLOSING,
        },
        include: branchOperationInclude,
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'operation.reconciliation.start_closing',
          entityType: 'branch_daily_operation',
          entityId: operation.id,
          newValue: {
            status: BranchOperationStatus.CLOSING,
          },
        },
      });

      return operation;
    });
  }

updateExpense(input: {
  tenantId: string;
  expenseId: string;
  actorUserId: string;
  amount?: Prisma.Decimal;
  description?: string | null;
}) {
  return this.prisma.$transaction(async (tx) => {
    const existing = await tx.branchOperationExpense.findFirst({
      where: {
        id: input.expenseId,
        tenantId: input.tenantId,
      },
    });

    if (!existing) {
      throw new Error('Expense was not found.');
    }

    const expense = await tx.branchOperationExpense.update({
      where: {
        id: input.expenseId,
      },
      data: {
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: 'operation.expense.update',
        entityType: 'branch_operation_expense',
        entityId: expense.id,
        oldValue: {
          amount: existing.amount.toString(),
          description: existing.description,
        },
        newValue: {
          amount: expense.amount.toString(),
          description: expense.description,
          paidFrom: expense.paidFrom,
          agentId: expense.agentId,
        },
      },
    });

    return expense;
  });
}

  voidExpense(input: {
    tenantId: string;
    expenseId: string;
    actorUserId: string;
    reason?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.branchOperationExpense.findFirst({
        where: {
          id: input.expenseId,
          tenantId: input.tenantId,
        },
      });

      if (!existing) {
        throw new Error('Expense was not found.');
      }

      const expense = await tx.branchOperationExpense.update({
        where: {
          id: input.expenseId,
        },
        data: {
          voidedAt: new Date(),
          voidedByUserId: input.actorUserId,
          voidReason: input.reason?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'operation.expense.void',
          entityType: 'branch_operation_expense',
          entityId: expense.id,
          oldValue: {
            voidedAt: null,
          },
          newValue: {
            voidedAt: expense.voidedAt?.toISOString(),
            voidReason: expense.voidReason,
            paidFrom: expense.paidFrom,
            agentId: expense.agentId,
            amount: expense.amount.toString(),
            description: expense.description,
          },
        },
      });

      return expense;
    });
  }

  startReconciliation(input: {
    tenantId: string;
    branchId: string;
    operationId: string;
    startedByUserId: string;
    notes?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.branchOperationReconciliation.findFirst({
        where: {
          tenantId: input.tenantId,
          operationId: input.operationId,
        },
        include: reconciliationInclude,
      });

      /*
       * Starting reconciliation only creates/resumes a draft.
       *
       * It deliberately DOES NOT move the branch from OPEN to CLOSING.
       * The manager may count cash, save the reconciliation and continue
       * normal branch operations until the final reconciliation is submitted.
       */
      if (existing) {
        return existing;
      }

      const reconciliation = await tx.branchOperationReconciliation.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          operationId: input.operationId,
          startedByUserId: input.startedByUserId,
          notes: input.notes?.trim() || null,
        },
        include: reconciliationInclude,
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.startedByUserId,
          action: 'operation.reconciliation.start',
          entityType: 'branch_operation_reconciliation',
          entityId: reconciliation.id,
          newValue: {
            branchId: input.branchId,
            operationId: input.operationId,
            operationStatus: BranchOperationStatus.OPEN,
            notes: input.notes?.trim() || null,
          },
        },
      });

      return reconciliation;
    });
  }
  updateReconciliationNotes(input: {
    tenantId: string;
    reconciliationId: string;
    updatedByUserId: string;
    notes: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const reconciliation = await tx.branchOperationReconciliation.update({
        where: {
          id: input.reconciliationId,
        },
        data: {
          notes: input.notes?.trim() || null,
          updatedByUserId: input.updatedByUserId,
        },
        include: reconciliationInclude,
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.updatedByUserId,
          action: 'operation.reconciliation.notes.update',
          entityType: 'branch_operation_reconciliation',
          entityId: reconciliation.id,
          newValue: {
            notes: input.notes?.trim() || null,
          },
        },
      });

      return reconciliation;
    });
  }

  recordReconciliationCashCount(input: {
    tenantId: string;
    reconciliationId: string;
    countedAmount: Prisma.Decimal;
    recordedByUserId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const reconciliation = await tx.branchOperationReconciliation.findFirst({
        where: {
          tenantId: input.tenantId,
          id: input.reconciliationId,
        },
      });

      if (!reconciliation) {
        throw new Error('Reconciliation was not found.');
      }

      const previousAmount = reconciliation.countedCash;

      const cashCount = await tx.branchOperationCashCount.create({
        data: {
          tenantId: input.tenantId,
          reconciliationId: input.reconciliationId,
          previousAmount,
          countedAmount: input.countedAmount,
          recordedByUserId: input.recordedByUserId,
        },
        include: {
          recordedBy: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      });

      await tx.branchOperationReconciliation.update({
        where: {
          id: input.reconciliationId,
        },
        data: {
          countedCash: input.countedAmount,
          updatedByUserId: input.recordedByUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.recordedByUserId,
          action: 'operation.reconciliation.cash_count',
          entityType: 'branch_operation_cash_count',
          entityId: cashCount.id,
          newValue: {
            reconciliationId: input.reconciliationId,
            previousAmount: previousAmount?.toString() ?? null,
            countedAmount: input.countedAmount.toString(),
          },
        },
      });

      return this.findReconciliationById({
        tenantId: input.tenantId,
        reconciliationId: input.reconciliationId,
      });
    });
  }

  listReconciliationCashCounts(input: {
    tenantId: string;
    reconciliationId: string;
  }) {
    return this.prisma.branchOperationCashCount.findMany({
      where: {
        tenantId: input.tenantId,
        reconciliationId: input.reconciliationId,
      },
      include: {
        recordedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        recordedAt: 'desc',
      },
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
      _sum: {
        amountGiven: true,
      },
      _count: {
        _all: true,
      },
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
      _sum: {
        amountReturned: true,
      },
      _count: {
        amountReturned: true,
      },
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
        agent: {
          select: {
            id: true,
            displayName: true,
            publicId: true,
          },
        },
        recordedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
        returnedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: [
        {
          agent: {
            displayName: 'asc',
          },
        },
        {
          createdAt: 'asc',
        },
      ],
    });
  }

  async listOperationActiveUsers(input: {
    tenantId: string;
    branchId: string;
    floatDate: Date;
    dayStart: Date;
    dayEnd: Date;
  }) {
    const [floatRows, disbursementRows, loanRows, collectionRows] =
      await Promise.all([
        this.prisma.agentDailyFloat.findMany({
          where: {
            tenantId: input.tenantId,
            branchId: input.branchId,
            floatDate: input.floatDate,
          },
          select: {
            agentId: true,
          },
        }),

        this.prisma.loanDisbursement.groupBy({
          by: ['recordedByUserId'],
          where: {
            tenantId: input.tenantId,
            branchId: input.branchId,
            disbursedAt: {
              gte: input.dayStart,
              lte: input.dayEnd,
            },
          },
        }),

        this.prisma.loanApplication.groupBy({
          by: ['officerUserId'],
          where: {
            tenantId: input.tenantId,
            branchId: input.branchId,
            status: LoanApplicationStatus.SUBMITTED,
            submittedAt: {
              gte: input.dayStart,
              lte: input.dayEnd,
            },
          },
        }),

        this.prisma.repayment.groupBy({
          by: ['recordedByUserId'],
          where: {
            tenantId: input.tenantId,
            branchId: input.branchId,
            paidAt: {
              gte: input.dayStart,
              lte: input.dayEnd,
            },
          },
        }),
      ]);

    const userIds = [
      ...new Set([
        ...floatRows.map((row) => row.agentId),
        ...disbursementRows.map((row) => row.recordedByUserId),
        ...loanRows.map((row) => row.officerUserId),
        ...collectionRows.map((row) => row.recordedByUserId),
      ]),
    ].filter((id): id is string => Boolean(id));

    if (userIds.length === 0) {
      return [];
    }

    return this.prisma.user.findMany({
      where: {
        tenantId: input.tenantId,
        id: {
          in: userIds,
        },
      },
      select: {
        id: true,
        displayName: true,
        publicId: true,
        phone: true,
        profilePhotoStorageKey: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        displayName: 'asc',
      },
    });
  }

  listTopUpsForOperation(input: { tenantId: string; operationId: string }) {
    return this.prisma.branchOperationTopUp.findMany({
      where: {
        tenantId: input.tenantId,
        operationId: input.operationId,
      },
      include: {
        recordedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        addedAt: 'desc',
      },
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
      _sum: {
        principalAmount: true,
        processingFee: true,
      },
      _count: {
        _all: true,
      },
    });
  }

  sumLoanDisbursements(input: {
    tenantId: string;
    branchId: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.loanDisbursement.aggregate({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        disbursedAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: {
        amount: true,
        assignedFloatAmount: true,
        collectedRepaymentsAmount: true,
      },
      _count: {
        _all: true,
      },
    });
  }

  sumLoanDisbursementsByAgent(input: {
    tenantId: string;
    branchId: string;
    agentIds: string[];
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.loanDisbursement.groupBy({
      by: ['recordedByUserId'],
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        recordedByUserId: {
          in: input.agentIds,
        },
        disbursedAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: {
        amount: true,
        assignedFloatAmount: true,
        collectedRepaymentsAmount: true,
      },
      _count: {
        _all: true,
      },
    });
  }

  sumLoanDisbursementsForAgent(input: {
    tenantId: string;
    branchId: string;
    agentId: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.loanDisbursement.aggregate({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        recordedByUserId: input.agentId,
        disbursedAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: {
        amount: true,
        assignedFloatAmount: true,
        collectedRepaymentsAmount: true,
      },
      _count: {
        _all: true,
      },
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
        officerUserId: {
          in: input.agentIds,
        },
        status: LoanApplicationStatus.SUBMITTED,
        submittedAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: {
        principalAmount: true,
        processingFee: true,
      },
      _count: {
        _all: true,
      },
    });
  }

  sumLoansIssuedByProduct(input: {
    tenantId: string;
    branchId: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.loanApplication.groupBy({
      by: ['templateName'],
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        status: LoanApplicationStatus.SUBMITTED,
        submittedAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: {
        principalAmount: true,
        processingFee: true,
      },
      _count: {
        _all: true,
      },
    });
  }

  listLoansIssuedToday(input: {
    tenantId: string;
    branchId: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.loanApplication.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        status: LoanApplicationStatus.SUBMITTED,
        submittedAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      select: {
        id: true,
        templateName: true,
        surname: true,
        givenNames: true,
        phone: true,
        loanPurpose: true,
        durationDays: true,
        principalAmount: true,
        processingFee: true,
        submittedAt: true,
        loanId: true,
        officer: {
          select: {
            id: true,
            displayName: true,
            publicId: true,
          },
        },
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
        loan: {
          select: {
            id: true,
            balance: true,
            repayments: {
              where: {
                paidAt: {
                  gte: input.dayStart,
                  lte: input.dayEnd,
                },
              },
              select: {
                amount: true,
              },
            },
          },
        },
      },
    });
  }

  listCollectionsWithProduct(input: {
    tenantId: string;
    branchId: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.repayment.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        paidAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      select: {
        id: true,
        amount: true,
        method: true,
        paidAt: true,
        receiptNumber: true,
        note: true,
        recordedBy: {
          select: {
            id: true,
            displayName: true,
            publicId: true,
          },
        },
        loan: {
          select: {
            id: true,
            customer: {
              select: {
                id: true,
                fullName: true,
                phone: true,
              },
            },
            application: {
              select: {
                templateName: true,
              },
            },
          },
        },
      },
    });
  }

  listCashShortagesForOperationDay(input: {
    tenantId: string;
    branchId: string;
    operationDate: Date;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.cashShortage.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        OR: [
          { operationDate: input.operationDate },
          {
            clearedAt: {
              gte: input.dayStart,
              lte: input.dayEnd,
            },
          },
          {
            payments: {
              some: {
                paidAt: {
                  gte: input.dayStart,
                  lte: input.dayEnd,
                },
              },
            },
          },
        ],
      },
      include: {
        responsibleUser: {
          select: {
            id: true,
            displayName: true,
            publicId: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
        payments: {
          orderBy: {
            paidAt: 'desc',
          },
          take: 1,
          include: {
            recordedBy: {
              select: {
                displayName: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  findReportForOperationDate(input: {
    tenantId: string;
    branchId: string;
    operationDate: Date;
  }) {
    return this.prisma.branchOperationReport.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        operationDate: input.operationDate,
      },
      select: {
        reportNumber: true,
        operationDate: true,
      },
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
      _sum: {
        principalAmount: true,
        processingFee: true,
      },
      _count: {
        _all: true,
      },
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
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
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
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
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
        recordedByUserId: {
          in: input.agentIds,
        },
        paidAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });
  }

  listExpensesForOperation(input: {
    tenantId: string;
    operationId: string;
    agentId?: string;
  }) {
    return this.prisma.branchOperationExpense.findMany({
      where: {
        tenantId: input.tenantId,
        operationId: input.operationId,
        ...(input.agentId ? this.agentExpenseOwnerWhere(input.agentId) : {}),
      },
      include: {
        recordedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
        agent: {
          select: {
            id: true,
            displayName: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
        voidedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: [
        {
          incurredAt: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  sumExpensesForOperation(input: {
    tenantId: string;
    operationId: string;
    paidFrom?: BranchOperationExpensePaidFrom;
    agentId?: string;
  }) {
    return this.prisma.branchOperationExpense.aggregate({
      where: {
        tenantId: input.tenantId,
        operationId: input.operationId,
        voidedAt: null,
        ...(input.paidFrom ? { paidFrom: input.paidFrom } : {}),
        ...(input.agentId ? this.agentExpenseOwnerWhere(input.agentId) : {}),
      },
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });
  }

  sumSalariesForOperation(input: { tenantId: string; operationId: string }) {
    return this.prisma.salaryPayment.aggregate({
      where: {
        tenantId: input.tenantId,
        operationId: input.operationId,
        reversedAt: null,
      },
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });
  }

  listSalariesForOperation(input: { tenantId: string; operationId: string }) {
    return this.prisma.salaryPayment.findMany({
      where: {
        tenantId: input.tenantId,
        operationId: input.operationId,
      },
      include: {
        employee: { select: { id: true, fullName: true } },
        recordedBy: { select: { displayName: true } },
      },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private agentExpenseOwnerWhere(agentId: string): Prisma.BranchOperationExpenseWhereInput {
    return {
      OR: [
        { agentId },
        {
          recordedByUserId: agentId,
          paidFrom: BranchOperationExpensePaidFrom.AGENT_FLOAT,
        },
      ],
    };
  }

  private formatDateLabel(value: Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');

    const day = String(value.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
