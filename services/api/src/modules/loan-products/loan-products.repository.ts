import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class LoanProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listRates(input: {
    tenantId: string;
    branchId: string | null;
    activeOnly: boolean;
    includeTenantWide: boolean;
  }) {
    const branchFilter: Prisma.LoanRateOptionWhereInput = input.branchId
      ? input.includeTenantWide
        ? { OR: [{ branchId: input.branchId }, { branchId: null }] }
        : { branchId: input.branchId }
      : {};

    return this.prisma.loanRateOption.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.activeOnly ? { isActive: true } : {}),
        ...branchFilter,
      },
      orderBy: [{ sortOrder: 'asc' }, { interestRatePercent: 'asc' }],
    });
  }

  listPeriods(input: {
    tenantId: string;
    branchId: string | null;
    activeOnly: boolean;
    includeTenantWide: boolean;
  }) {
    const branchFilter: Prisma.LoanPeriodOptionWhereInput = input.branchId
      ? input.includeTenantWide
        ? { OR: [{ branchId: input.branchId }, { branchId: null }] }
        : { branchId: input.branchId }
      : {};

    return this.prisma.loanPeriodOption.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.activeOnly ? { isActive: true } : {}),
        ...branchFilter,
      },
      orderBy: [{ sortOrder: 'asc' }, { durationDays: 'asc' }],
    });
  }

  createRate(data: Prisma.LoanRateOptionCreateInput) {
    return this.prisma.loanRateOption.create({ data });
  }

  createPeriod(data: Prisma.LoanPeriodOptionCreateInput) {
    return this.prisma.loanPeriodOption.create({ data });
  }

  findRate(input: { tenantId: string; id: string }) {
    return this.prisma.loanRateOption.findFirst({
      where: { tenantId: input.tenantId, id: input.id },
    });
  }

  findPeriod(input: { tenantId: string; id: string }) {
    return this.prisma.loanPeriodOption.findFirst({
      where: { tenantId: input.tenantId, id: input.id },
    });
  }

  updateRate(id: string, data: Prisma.LoanRateOptionUpdateInput) {
    return this.prisma.loanRateOption.update({ where: { id }, data });
  }

  updatePeriod(id: string, data: Prisma.LoanPeriodOptionUpdateInput) {
    return this.prisma.loanPeriodOption.update({ where: { id }, data });
  }

  softDeleteRate(id: string) {
    return this.prisma.loanRateOption.update({
      where: { id },
      data: { isActive: false },
    });
  }

  softDeletePeriod(id: string) {
    return this.prisma.loanPeriodOption.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
