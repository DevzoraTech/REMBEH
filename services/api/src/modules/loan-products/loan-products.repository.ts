import { Injectable } from '@nestjs/common';
import { PaymentStartPolicyType, Prisma } from '@prisma/client';
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

  /** Branch policy preferred over tenant-wide when both exist. */
  async findEffectivePaymentStartPolicy(input: {
    tenantId: string;
    branchId: string | null;
  }) {
    if (input.branchId) {
      const branchPolicy = await this.prisma.loanPaymentStartPolicy.findFirst({
        where: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          isActive: true,
        },
      });
      if (branchPolicy) return branchPolicy;
    }

    return this.prisma.loanPaymentStartPolicy.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: null,
        isActive: true,
      },
    });
  }

  findPaymentStartPolicy(input: {
    tenantId: string;
    branchId: string | null;
  }) {
    return this.prisma.loanPaymentStartPolicy.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        isActive: true,
      },
    });
  }

  async upsertPaymentStartPolicy(input: {
    tenantId: string;
    branchId: string | null;
    policyType: PaymentStartPolicyType;
    afterDays: number | null;
    allowAgentDatePick: boolean;
  }) {
    const existing = await this.findPaymentStartPolicy({
      tenantId: input.tenantId,
      branchId: input.branchId,
    });

    if (existing) {
      return this.prisma.loanPaymentStartPolicy.update({
        where: { id: existing.id },
        data: {
          policyType: input.policyType,
          afterDays: input.afterDays,
          allowAgentDatePick: input.allowAgentDatePick,
          isActive: true,
        },
      });
    }

    return this.prisma.loanPaymentStartPolicy.create({
      data: {
        tenant: { connect: { id: input.tenantId } },
        ...(input.branchId
          ? { branch: { connect: { id: input.branchId } } }
          : {}),
        policyType: input.policyType,
        afterDays: input.afterDays,
        allowAgentDatePick: input.allowAgentDatePick,
        isActive: true,
      },
    });
  }

  /** Branch fine policy preferred over tenant-wide when both exist. */
  async findEffectiveFinePolicy(input: {
    tenantId: string;
    branchId: string | null;
  }) {
    if (input.branchId) {
      const branchPolicy = await this.prisma.loanFinePolicy.findFirst({
        where: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          isActive: true,
        },
      });
      if (branchPolicy) return branchPolicy;
    }

    return this.prisma.loanFinePolicy.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: null,
        isActive: true,
      },
    });
  }

  findFinePolicy(input: { tenantId: string; branchId: string | null }) {
    return this.prisma.loanFinePolicy.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        isActive: true,
      },
    });
  }

  async upsertFinePolicy(input: {
    tenantId: string;
    branchId: string | null;
    finePeriodDays: number;
    fineAmount: Prisma.Decimal;
    isActive: boolean;
  }) {
    const existing = await this.prisma.loanFinePolicy.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
      },
    });

    if (existing) {
      return this.prisma.loanFinePolicy.update({
        where: { id: existing.id },
        data: {
          finePeriodDays: input.finePeriodDays,
          fineAmount: input.fineAmount,
          isActive: input.isActive,
        },
      });
    }

    return this.prisma.loanFinePolicy.create({
      data: {
        tenant: { connect: { id: input.tenantId } },
        ...(input.branchId
          ? { branch: { connect: { id: input.branchId } } }
          : {}),
        finePeriodDays: input.finePeriodDays,
        fineAmount: input.fineAmount,
        isActive: input.isActive,
      },
    });
  }
}
