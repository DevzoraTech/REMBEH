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
      loanProductTemplate: { select: { name: true } },
      officer: {
        select: {
          displayName: true,
          publicId: true,
        },
      },
    },
  },
  repayments: {
    select: { amount: true },
  },
} satisfies Prisma.LoanInclude;

export type LoanListRecord = Prisma.LoanGetPayload<{
  include: typeof loanListInclude;
}>;

@Injectable()
export class LoansRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForScope(input: {
    tenantId: string;
    branchId?: string | null;
    limit?: number;
  }): Promise<LoanListRecord[]> {
    return this.prisma.loan.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      include: loanListInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: input.limit ?? 300,
    });
  }
}
