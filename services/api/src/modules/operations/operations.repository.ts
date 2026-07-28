import { Injectable } from '@nestjs/common';
import { BranchOperationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OPERATIONS_EVENTS } from './operations.events';
import { OPERATIONS_PERMISSIONS } from './operations.permissions';

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

  openBranch(input: {
    tenantId: string;
    branchId: string;
    operationDate: Date;
    openedAt: Date;
    openedByUserId: string;
    cashInVault: Prisma.Decimal;
    cashInSafe: Prisma.Decimal;
    openingFloatAvailable: Prisma.Decimal;
    previousClosingBalance: Prisma.Decimal;
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
          cashInVault: input.cashInVault,
          cashInSafe: input.cashInSafe,
          openingFloatAvailable: input.openingFloatAvailable,
          previousClosingBalance: input.previousClosingBalance,
          notes: input.notes,
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
            cashInVault: operation.cashInVault.toString(),
            cashInSafe: operation.cashInSafe.toString(),
            openingFloatAvailable: operation.openingFloatAvailable.toString(),
            previousClosingBalance: operation.previousClosingBalance.toString(),
          },
        },
      });

      return operation;
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
        submittedAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: { principalAmount: true },
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

  private formatDateLabel(value: Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
