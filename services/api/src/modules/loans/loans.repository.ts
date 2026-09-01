import { Injectable } from '@nestjs/common';
import {
  LoanDisbursementSource,
  LoanStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

const loanListInclude = {
  customer: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      nationalId: true,
    },
  },

  branch: {
    select: {
      id: true,
      name: true,
    },
  },

  application: {
    select: {
      id: true,
      templateName: true,
      durationDays: true,
      repaymentFrequency: true,
      paymentStartDate: true,
      paymentStartPolicy: true,
      paymentStartDelayDays: true,
      allowAgentDatePick: true,
      processingFee: true,
      interestRatePercent: true,

      loanProductTemplate: {
        select: {
          name: true,

          /*
           * Kept as an additional fallback for old/incomplete
           * application snapshots.
           */
          repaymentFrequency: true,
        },
      },

      officer: {
        select: {
          id: true,
          displayName: true,
          publicId: true,
        },
      },
    },
  },

  wallet: {
    select: {
      openingBalance: true,
      finesTotal: true,
    },
  },

  repayments: {
    select: {
      amount: true,
    },
  },

  disbursements: {
    orderBy: {
      disbursedAt: 'asc' as const,
    },
    include: {
      recordedBy: {
        select: {
          displayName: true,
          publicId: true,
        },
      },
    },
  },
} satisfies Prisma.LoanInclude;

export type LoanListRecord =
  Prisma.LoanGetPayload<{
    include: typeof loanListInclude;
  }>;

@Injectable()
export class LoansRepository {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  listForScope(input: {
    tenantId: string;
    branchId?: string | null;
    officerUserId?: string | null;
    limit?: number;
  }): Promise<LoanListRecord[]> {
    return this.prisma.loan.findMany({
      where: {
        tenantId: input.tenantId,

        ...(input.branchId
          ? {
              branchId: input.branchId,
            }
          : {}),

        ...(input.officerUserId
          ? {
              application: {
                officerUserId: input.officerUserId,
              },
            }
          : {}),
      },

      include: loanListInclude,

      orderBy: [
        {
          updatedAt: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],

      /*
       * Branch lists should remain complete.
       *
       * Account-owner cross-branch lists remain bounded so a very
       * large tenant does not accidentally request an unbounded set.
       */
      ...(input.branchId
        ? {}
        : {
            take: input.limit ?? 2_000,
          }),
    });
  }

  listPendingDisbursements(input: {
    tenantId: string;
    branchId?: string | null;
    officerUserId?: string | null;
  }): Promise<LoanListRecord[]> {
    return this.prisma.loan.findMany({
      where: {
        tenantId: input.tenantId,

        ...(input.branchId
          ? {
              branchId: input.branchId,
            }
          : {}),

        ...(input.officerUserId
          ? {
              application: {
                officerUserId: input.officerUserId,
              },
            }
          : {}),

        status: LoanStatus.PARTIALLY_DISBURSED,
      },

      include: loanListInclude,

      orderBy: [
        {
          updatedAt: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  findByIdForScope(input: {
    tenantId: string;
    loanId: string;
    branchId?: string | null;
  }): Promise<LoanListRecord | null> {
    return this.prisma.loan.findFirst({
      where: {
        id: input.loanId,
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      include: loanListInclude,
    });
  }

  async recordDisbursement(input: {
    tenantId: string;
    branchId: string;
    loanId: string;
    recordedByUserId: string;
    amount: number;
    assignedFloatAmount: number;
    collectedRepaymentsAmount: number;
    source: LoanDisbursementSource;
    disbursedAt: Date;
    note: string | null;
    localId?: string | null;
    activateLoan: boolean;
    paymentStartDate: Date | null;
  }): Promise<{
    loan: LoanListRecord;
    disbursement: LoanListRecord['disbursements'][number];
  }> {
    return this.prisma.$transaction(async (tx) => {
      const disbursement = await tx.loanDisbursement.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          loanId: input.loanId,
          recordedByUserId: input.recordedByUserId,
          amount: new Prisma.Decimal(input.amount.toFixed(2)),
          assignedFloatAmount: new Prisma.Decimal(
            input.assignedFloatAmount.toFixed(2),
          ),
          collectedRepaymentsAmount: new Prisma.Decimal(
            input.collectedRepaymentsAmount.toFixed(2),
          ),
          source: input.source,
          disbursedAt: input.disbursedAt,
          note: input.note,
          ...(input.localId ? { localId: input.localId } : {}),
        },
        include: {
          recordedBy: {
            select: {
              displayName: true,
              publicId: true,
            },
          },
        },
      });

      await tx.loan.update({
        where: {
          id: input.loanId,
        },
        data: input.activateLoan
          ? {
              status: LoanStatus.CURRENT,
              disbursedAt: input.disbursedAt,
              paymentStartDate: input.paymentStartDate,
            }
          : {
              updatedAt: new Date(),
            },
      });

      const loan = await tx.loan.findUniqueOrThrow({
        where: {
          id: input.loanId,
        },
        include: loanListInclude,
      });

      return { loan, disbursement };
    });
  }

  sumDisbursementsForRecorder(input: {
    tenantId: string;
    branchId: string;
    recordedByUserId: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.loanDisbursement.aggregate({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        recordedByUserId: input.recordedByUserId,
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
      _count: { _all: true },
    });
  }

  sumCollectionsForRecorder(input: {
    tenantId: string;
    branchId: string;
    recordedByUserId: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.repayment.aggregate({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        recordedByUserId: input.recordedByUserId,
        paidAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
  }

  findFloatForRecorder(input: {
    tenantId: string;
    branchId: string;
    recordedByUserId: string;
    floatDate: Date;
  }) {
    return this.prisma.agentDailyFloat.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        agentId: input.recordedByUserId,
        floatDate: input.floatDate,
      },
      select: {
        id: true,
        amountGiven: true,
        amountReturned: true,
        returnedAt: true,
      },
    });
  }

  findBranchOperationForDay(input: {
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
      select: { id: true, status: true },
    });
  }

  findAssignableStaff(input: {
    tenantId: string;
    branchId: string;
    userId: string;
  }) {
    return this.prisma.user.findFirst({
      where: {
        id: input.userId,
        tenantId: input.tenantId,
        branchId: input.branchId,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        displayName: true,
        publicId: true,
      },
    });
  }
}
