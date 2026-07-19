import { BadRequestException, Injectable } from '@nestjs/common';
import {
  LoanApplicationStatus,
  LoanStatus,
  Prisma,
  RepaymentMethod,
  UserStatus,
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

/** Tenant id must come from auth context — never optional on scoped queries. */
export function requireTenantId(tenantId: string | null | undefined): string {
  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new BadRequestException('tenantId is required for tenant-scoped queries.');
  }
  return tenantId.trim();
}

@Injectable()
export class CollectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  branchScope(user: { tenantId: string; branchId: string | null }) {
    const tenantId = requireTenantId(user.tenantId);
    return {
      tenantId,
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
    const tenantId = requireTenantId(input.tenantId);
    const q = input.query.trim();
    const take = input.take ?? 40;
    const scope = {
      ...this.branchScope({ tenantId, branchId: input.branchId }),
      status: { in: activeLoanStatuses },
    };
    const variants = phoneSearchVariants(q);
    // Nested relations also carry tenantId so OR matches cannot widen scope.
    const phoneOr: Prisma.LoanWhereInput[] = variants.flatMap((variant) => [
      { customer: { tenantId, phone: { contains: variant } } },
      { application: { tenantId, phone: { contains: variant } } },
    ]);
    const nameOr: Prisma.LoanWhereInput[] = [
      {
        customer: {
          tenantId,
          fullName: { contains: q, mode: 'insensitive' },
        },
      },
      {
        customer: {
          tenantId,
          nationalId: { contains: q, mode: 'insensitive' },
        },
      },
      {
        application: {
          tenantId,
          surname: { contains: q, mode: 'insensitive' },
        },
      },
      {
        application: {
          tenantId,
          givenNames: { contains: q, mode: 'insensitive' },
        },
      },
      {
        application: {
          tenantId,
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

  findRepaymentById(input: {
    tenantId: string;
    branchId: string | null;
    repaymentId: string;
  }) {
    return this.prisma.repayment.findFirst({
      where: {
        id: input.repaymentId,
        ...this.branchScope(input),
      },
      include: {
        recordedBy: true,
        branch: true,
        loan: {
          include: loanWithRelations,
        },
        tenant: true,
      },
    });
  }

  listRepaymentsForDay(input: {
    tenantId: string;
    branchId: string | null;
    dayStart: Date;
    dayEnd: Date;
    recordedByUserId?: string;
  }) {
    return this.prisma.repayment.findMany({
      where: {
        ...this.branchScope(input),
        paidAt: { gte: input.dayStart, lte: input.dayEnd },
        ...(input.recordedByUserId
          ? { recordedByUserId: input.recordedByUserId }
          : {}),
      },
      include: {
        recordedBy: true,
        loan: {
          include: {
            customer: true,
          },
        },
      },
      orderBy: { paidAt: 'desc' },
    });
  }

  listApplicationsSubmittedForDay(input: {
    tenantId: string;
    branchId: string | null;
    dayStart: Date;
    dayEnd: Date;
    officerUserId?: string;
  }) {
    return this.prisma.loanApplication.findMany({
      where: {
        ...this.branchScope(input),
        status: { not: LoanApplicationStatus.DRAFT },
        submittedAt: { gte: input.dayStart, lte: input.dayEnd },
        ...(input.officerUserId
          ? { officerUserId: input.officerUserId }
          : {}),
      },
      include: {
        officer: true,
        branch: true,
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  listFieldAgents(input: {
    tenantId: string;
    branchId: string | null;
  }) {
    const fieldRoles = [
      'Agent',
      'Loan Officer',
      'Supervisor',
      'Recovery Officer',
      'Branch Manager',
    ];

    return this.prisma.user.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        status: {
          in: [
            UserStatus.ACTIVE,
            UserStatus.INVITED,
            UserStatus.PENDING_VERIFICATION,
          ],
        },
        roles: {
          some: {
            role: {
              name: { in: fieldRoles },
            },
          },
        },
      },
      include: {
        roles: { include: { role: true } },
        branch: true,
      },
      orderBy: { displayName: 'asc' },
    });
  }

  findFieldAgentById(input: {
    tenantId: string;
    branchId: string | null;
    agentId: string;
  }) {
    return this.prisma.user.findFirst({
      where: {
        id: input.agentId,
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      include: {
        roles: { include: { role: true } },
        branch: true,
      },
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
