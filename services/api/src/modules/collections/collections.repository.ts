import { Injectable } from '@nestjs/common';
import {
  LoanStatus,
  Prisma,
  RepaymentMethod,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export const activeLoanStatuses: LoanStatus[] = [
  LoanStatus.SUBMITTED,
  LoanStatus.APPROVED,
  LoanStatus.DISBURSED,
  LoanStatus.CURRENT,
  LoanStatus.IN_ARREARS,
  LoanStatus.RESTRUCTURED,
];

const loanWithRelations = {
  customer: true,
  application: {
    include: {
      officer: true,
    },
  },
  repayments: {
    orderBy: { paidAt: 'desc' as const },
    include: {
      recordedBy: true,
    },
  },
} satisfies Prisma.LoanInclude;

export type LoanWithCollections = Prisma.LoanGetPayload<{
  include: typeof loanWithRelations;
}>;

@Injectable()
export class CollectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  branchScope(user: { tenantId: string; branchId: string | null }) {
    return {
      tenantId: user.tenantId,
      ...(user.branchId ? { branchId: user.branchId } : {}),
    };
  }

  listActiveLoans(input: {
    tenantId: string;
    branchId: string | null;
  }) {
    return this.prisma.loan.findMany({
      where: {
        ...this.branchScope(input),
        status: { in: activeLoanStatuses },
        balance: { gt: 0 },
      },
      include: loanWithRelations,
      orderBy: { updatedAt: 'desc' },
    });
  }

  searchLoans(input: {
    tenantId: string;
    branchId: string | null;
    query: string;
    take?: number;
  }) {
    const q = input.query.trim();
    return this.prisma.loan.findMany({
      where: {
        ...this.branchScope(input),
        status: { in: activeLoanStatuses },
        OR: [
          { customer: { fullName: { contains: q, mode: 'insensitive' } } },
          { customer: { phone: { contains: q } } },
          { customer: { nationalId: { contains: q, mode: 'insensitive' } } },
          {
            application: {
              surname: { contains: q, mode: 'insensitive' },
            },
          },
          {
            application: {
              givenNames: { contains: q, mode: 'insensitive' },
            },
          },
        ],
      },
      include: loanWithRelations,
      take: input.take ?? 40,
      orderBy: { updatedAt: 'desc' },
    });
  }

  findLoanById(input: {
    tenantId: string;
    branchId: string | null;
    loanId: string;
  }) {
    return this.prisma.loan.findFirst({
      where: {
        id: input.loanId,
        ...this.branchScope(input),
      },
      include: loanWithRelations,
    });
  }

  listRepayments(input: {
    tenantId: string;
    branchId: string | null;
    from?: Date;
    to?: Date;
    take?: number;
  }) {
    return this.prisma.repayment.findMany({
      where: {
        ...this.branchScope(input),
        ...(input.from || input.to
          ? {
              paidAt: {
                ...(input.from ? { gte: input.from } : {}),
                ...(input.to ? { lte: input.to } : {}),
              },
            }
          : {}),
      },
      include: {
        recordedBy: true,
        loan: {
          include: {
            customer: true,
            application: true,
            repayments: {
              select: { amount: true },
            },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      take: input.take ?? 200,
    });
  }

  sumRepaymentsToday(input: {
    tenantId: string;
    branchId: string | null;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.repayment.aggregate({
      where: {
        ...this.branchScope(input),
        paidAt: { gte: input.dayStart, lte: input.dayEnd },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
  }

  recordRepayment(input: {
    tenantId: string;
    branchId: string;
    loanId: string;
    recordedByUserId: string;
    amount: Prisma.Decimal;
    principalAllocated: Prisma.Decimal;
    interestAllocated: Prisma.Decimal;
    feesAllocated: Prisma.Decimal;
    method: RepaymentMethod;
    paidAt: Date;
    note: string | null;
    receiptNumber: string;
    nextBalance: Prisma.Decimal;
    nextStatus: LoanStatus;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const repayment = await tx.repayment.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          loanId: input.loanId,
          recordedByUserId: input.recordedByUserId,
          amount: input.amount,
          principalAllocated: input.principalAllocated,
          interestAllocated: input.interestAllocated,
          feesAllocated: input.feesAllocated,
          method: input.method,
          paidAt: input.paidAt,
          note: input.note,
          receiptNumber: input.receiptNumber,
        },
        include: {
          recordedBy: true,
          loan: {
            include: loanWithRelations,
          },
        },
      });

      await tx.loan.update({
        where: { id: input.loanId },
        data: {
          balance: input.nextBalance,
          status: input.nextStatus,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.recordedByUserId,
          action: 'collection.create',
          entityType: 'repayment',
          entityId: repayment.id,
          newValue: {
            loanId: input.loanId,
            amount: input.amount.toString(),
            balance: input.nextBalance.toString(),
            status: input.nextStatus,
          },
        },
      });

      const loan = await tx.loan.findUniqueOrThrow({
        where: { id: input.loanId },
        include: loanWithRelations,
      });

      return { repayment, loan };
    });
  }
}
