import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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

  application: {
  select: {
    id: true,
    templateName: true,
    durationDays: true,
    repaymentFrequency: true,
    paymentStartDate: true,
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
}