import { Injectable } from '@nestjs/common';
import {
  LoanStatus,
  Prisma,
  RepaymentMethod,
} from '@prisma/client';
import {
  looksLikePhoneQuery,
  phoneSearchVariants,
} from '../../common/security/identity-normalization';
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
  wallet: true,
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

  async searchLoans(input: {
    tenantId: string;
    branchId: string | null;
    query: string;
    take?: number;
  }) {
    const q = input.query.trim();
    const take = input.take ?? 40;
    const scope = {
      ...this.branchScope(input),
      status: { in: activeLoanStatuses },
    };
    const variants = phoneSearchVariants(q);
    const phoneOr: Prisma.LoanWhereInput[] = variants.flatMap((variant) => [
      { customer: { phone: { contains: variant } } },
      { application: { phone: { contains: variant } } },
    ]);
    const nameOr: Prisma.LoanWhereInput[] = [
      { customer: { fullName: { contains: q, mode: 'insensitive' } } },
      { customer: { nationalId: { contains: q, mode: 'insensitive' } } },
      { application: { surname: { contains: q, mode: 'insensitive' } } },
      { application: { givenNames: { contains: q, mode: 'insensitive' } } },
      {
        application: {
          nationalId: { contains: q, mode: 'insensitive' },
        },
      },
    ];

    // Phone-first path: dedicated query so number matches rank above names.
    if (looksLikePhoneQuery(q) && phoneOr.length > 0) {
      const phoneHits = await this.prisma.loan.findMany({
        where: { ...scope, OR: phoneOr },
        include: loanWithRelations,
        take,
        orderBy: { updatedAt: 'desc' },
      });
      if (phoneHits.length >= take) {
        return phoneHits;
      }
      const excludeIds = phoneHits.map((loan) => loan.id);
      const nameHits = await this.prisma.loan.findMany({
        where: {
          ...scope,
          OR: nameOr,
          ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
        },
        include: loanWithRelations,
        take: take - phoneHits.length,
        orderBy: { updatedAt: 'desc' },
      });
      return [...phoneHits, ...nameHits];
    }

    const rows = await this.prisma.loan.findMany({
      where: {
        ...scope,
        OR: [...phoneOr, ...nameOr],
      },
      include: loanWithRelations,
      take,
      orderBy: { updatedAt: 'desc' },
    });

    // Prefer phone matches when the mixed query returns both kinds.
    if (variants.length === 0) {
      return rows;
    }
    return [...rows].sort((a, b) => {
      const aPhone = this.matchesPhone(a, variants) ? 0 : 1;
      const bPhone = this.matchesPhone(b, variants) ? 0 : 1;
      return aPhone - bPhone;
    });
  }

  private matchesPhone(
    loan: LoanWithCollections,
    variants: string[],
  ): boolean {
    const phones = [loan.customer.phone, loan.application?.phone ?? ''].filter(
      Boolean,
    );
    return variants.some((variant) =>
      phones.some((phone) => phone.includes(variant)),
    );
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
          include: loanWithRelations,
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
