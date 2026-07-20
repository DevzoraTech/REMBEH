import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LoanInterestType,
  LoanRepaymentFrequency,
  LoanTermUnit,
  PaymentStartPolicyType,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import {
  CreateLoanPeriodOptionDto,
  CreateLoanProductTemplateDto,
  CreateLoanRateOptionDto,
  UpdateLoanPeriodOptionDto,
  UpdateLoanProductTemplateDto,
  UpdateLoanRateOptionDto,
  UpsertLoanFinePolicyDto,
  UpsertPaymentStartPolicyDto,
} from './dto/loan-product.dto';
import {
  LoanFinePolicyContract,
  LoanPeriodOptionContract,
  LoanProductTemplateContract,
  LoanProductsCatalogContract,
  LoanRateOptionContract,
  PaymentStartPolicyContract,
} from './loan-products.contracts';
import { LOAN_PRODUCT_PERMISSIONS } from './loan-products.permissions';
import { LoanProductsRepository } from './loan-products.repository';
import { termToDurationDays } from './loan-term';
import {
  DEFAULT_PAYMENT_START_POLICY,
  computePaymentStartDate,
  describePaymentStartPolicy,
} from './payment-start-policy';

@Injectable()
export class LoanProductsService {
  constructor(private readonly repository: LoanProductsRepository) {}

  async getCatalog(
    user: AuthenticatedUser,
  ): Promise<LoanProductsCatalogContract> {
    const canManage = this.canManage(user);
    const canSeeAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );

    const branchId = canSeeAllBranches ? null : user.branchId;
    const activeOnly = !canManage;

    const [templates, rates, periods, paymentStartPolicy, finePolicy] =
      await Promise.all([
        this.repository.listTemplates({
          tenantId: user.tenantId,
          branchId,
          activeOnly,
          includeTenantWide: true,
        }),
        this.repository.listRates({
          tenantId: user.tenantId,
          branchId,
          activeOnly,
          includeTenantWide: true,
        }),
        this.repository.listPeriods({
          tenantId: user.tenantId,
          branchId,
          activeOnly,
          includeTenantWide: true,
        }),
        this.repository.findEffectivePaymentStartPolicy({
          tenantId: user.tenantId,
          branchId: branchId ?? user.branchId,
        }),
        this.repository.findEffectiveFinePolicy({
          tenantId: user.tenantId,
          branchId: branchId ?? user.branchId,
        }),
      ]);

    return {
      templates: templates.map((item) => this.toTemplateContract(item)),
      rates: rates.map((item) => this.toRateContract(item)),
      periods: periods.map((item) => this.toPeriodContract(item)),
      paymentStartPolicy: paymentStartPolicy
        ? this.toPaymentStartContract(paymentStartPolicy)
        : this.defaultPaymentStartContract(user.tenantId, branchId),
      finePolicy: finePolicy ? this.toFinePolicyContract(finePolicy) : null,
    };
  }

  async createTemplate(
    user: AuthenticatedUser,
    dto: CreateLoanProductTemplateDto,
  ) {
    this.requireManage(user);
    this.assertTemplateAmounts(dto.minLoanAmount, dto.maxLoanAmount);
    const branchId = this.resolveWriteBranchId(user, dto.branchId);

    const created = await this.repository.createTemplate({
      tenant: { connect: { id: user.tenantId } },
      ...(branchId ? { branch: { connect: { id: branchId } } } : {}),
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      interestRatePercent: new Prisma.Decimal(dto.interestRatePercent),
      interestType: dto.interestType ?? 'FLAT',
      termValue: dto.termValue,
      termUnit: dto.termUnit,
      repaymentFrequency: dto.repaymentFrequency,
      processingFeePercent: new Prisma.Decimal(dto.processingFeePercent),
      penaltyRatePercent: new Prisma.Decimal(dto.penaltyRatePercent),
      finePeriodDays: dto.finePeriodDays ?? 10,
      minLoanAmount:
        dto.minLoanAmount != null
          ? new Prisma.Decimal(dto.minLoanAmount.toFixed(2))
          : null,
      maxLoanAmount:
        dto.maxLoanAmount != null
          ? new Prisma.Decimal(dto.maxLoanAmount.toFixed(2))
          : null,
      notes: dto.notes?.trim() || null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return { template: this.toTemplateContract(created) };
  }

  async updateTemplate(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateLoanProductTemplateDto,
  ) {
    this.requireManage(user);
    const existing = await this.repository.findTemplate({
      tenantId: user.tenantId,
      id,
    });
    if (!existing) {
      throw new NotFoundException('Loan type template not found.');
    }
    this.assertCanEditScopedRow(user, existing.branchId);

    const minAmount =
      dto.minLoanAmount !== undefined
        ? dto.minLoanAmount
        : existing.minLoanAmount != null
          ? Number(existing.minLoanAmount.toString())
          : null;
    const maxAmount =
      dto.maxLoanAmount !== undefined
        ? dto.maxLoanAmount
        : existing.maxLoanAmount != null
          ? Number(existing.maxLoanAmount.toString())
          : null;
    this.assertTemplateAmounts(minAmount, maxAmount);

    const updated = await this.repository.updateTemplate(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description?.trim() || null }
        : {}),
      ...(dto.interestRatePercent !== undefined
        ? {
            interestRatePercent: new Prisma.Decimal(dto.interestRatePercent),
          }
        : {}),
      ...(dto.interestType !== undefined
        ? { interestType: dto.interestType }
        : {}),
      ...(dto.termValue !== undefined ? { termValue: dto.termValue } : {}),
      ...(dto.termUnit !== undefined ? { termUnit: dto.termUnit } : {}),
      ...(dto.repaymentFrequency !== undefined
        ? { repaymentFrequency: dto.repaymentFrequency }
        : {}),
      ...(dto.processingFeePercent !== undefined
        ? {
            processingFeePercent: new Prisma.Decimal(dto.processingFeePercent),
          }
        : {}),
      ...(dto.penaltyRatePercent !== undefined
        ? { penaltyRatePercent: new Prisma.Decimal(dto.penaltyRatePercent) }
        : {}),
      ...(dto.finePeriodDays !== undefined
        ? { finePeriodDays: dto.finePeriodDays }
        : {}),
      ...(dto.minLoanAmount !== undefined
        ? {
            minLoanAmount:
              dto.minLoanAmount == null
                ? null
                : new Prisma.Decimal(dto.minLoanAmount.toFixed(2)),
          }
        : {}),
      ...(dto.maxLoanAmount !== undefined
        ? {
            maxLoanAmount:
              dto.maxLoanAmount == null
                ? null
                : new Prisma.Decimal(dto.maxLoanAmount.toFixed(2)),
          }
        : {}),
      ...(dto.notes !== undefined
        ? { notes: dto.notes?.trim() || null }
        : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });

    return { template: this.toTemplateContract(updated) };
  }

  async deactivateTemplate(user: AuthenticatedUser, id: string) {
    this.requireManage(user);
    const existing = await this.repository.findTemplate({
      tenantId: user.tenantId,
      id,
    });
    if (!existing) {
      throw new NotFoundException('Loan type template not found.');
    }
    this.assertCanEditScopedRow(user, existing.branchId);
    const updated = await this.repository.softDeleteTemplate(id);
    return { template: this.toTemplateContract(updated) };
  }

  async duplicateTemplate(user: AuthenticatedUser, id: string) {
    this.requireManage(user);
    const existing = await this.repository.findTemplate({
      tenantId: user.tenantId,
      id,
    });
    if (!existing) {
      throw new NotFoundException('Loan type template not found.');
    }
    this.assertCanEditScopedRow(user, existing.branchId);

    const created = await this.repository.createTemplate({
      tenant: { connect: { id: user.tenantId } },
      ...(existing.branchId
        ? { branch: { connect: { id: existing.branchId } } }
        : {}),
      name: `${existing.name} (copy)`,
      description: existing.description,
      interestRatePercent: existing.interestRatePercent,
      interestType: existing.interestType,
      termValue: existing.termValue,
      termUnit: existing.termUnit,
      repaymentFrequency: existing.repaymentFrequency,
      processingFeePercent: existing.processingFeePercent,
      penaltyRatePercent: existing.penaltyRatePercent,
      finePeriodDays: existing.finePeriodDays,
      minLoanAmount: existing.minLoanAmount,
      maxLoanAmount: existing.maxLoanAmount,
      notes: existing.notes,
      sortOrder: existing.sortOrder,
      isActive: true,
    });

    return { template: this.toTemplateContract(created) };
  }

  /** Resolve an active template visible to the agent/manager. */
  async requireActiveTemplate(input: {
    tenantId: string;
    branchId: string | null;
    templateId: string;
  }) {
    const template = await this.repository.findTemplate({
      tenantId: input.tenantId,
      id: input.templateId,
    });
    if (!template || !template.isActive) {
      throw new NotFoundException('Loan type template not found.');
    }
    if (
      template.branchId &&
      input.branchId &&
      template.branchId !== input.branchId
    ) {
      throw new ForbiddenException(
        'This loan type is not available for your branch.',
      );
    }
    return template;
  }

  private assertTemplateAmounts(
    minLoanAmount?: number | null,
    maxLoanAmount?: number | null,
  ) {
    if (
      minLoanAmount != null &&
      maxLoanAmount != null &&
      minLoanAmount > maxLoanAmount
    ) {
      throw new BadRequestException(
        'minLoanAmount cannot be greater than maxLoanAmount.',
      );
    }
  }

  async createRate(user: AuthenticatedUser, dto: CreateLoanRateOptionDto) {
    this.requireManage(user);
    const branchId = this.resolveWriteBranchId(user, dto.branchId);

    const created = await this.repository.createRate({
      tenant: { connect: { id: user.tenantId } },
      ...(branchId ? { branch: { connect: { id: branchId } } } : {}),
      label: dto.label.trim(),
      interestRatePercent: new Prisma.Decimal(dto.interestRatePercent),
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return { rate: this.toRateContract(created) };
  }

  async updateRate(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateLoanRateOptionDto,
  ) {
    this.requireManage(user);
    const existing = await this.repository.findRate({
      tenantId: user.tenantId,
      id,
    });
    if (!existing) {
      throw new NotFoundException('Interest rate option not found.');
    }
    this.assertCanEditScopedRow(user, existing.branchId);

    const updated = await this.repository.updateRate(id, {
      ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
      ...(dto.interestRatePercent !== undefined
        ? {
            interestRatePercent: new Prisma.Decimal(dto.interestRatePercent),
          }
        : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });

    return { rate: this.toRateContract(updated) };
  }

  async deactivateRate(user: AuthenticatedUser, id: string) {
    this.requireManage(user);
    const existing = await this.repository.findRate({
      tenantId: user.tenantId,
      id,
    });
    if (!existing) {
      throw new NotFoundException('Interest rate option not found.');
    }
    this.assertCanEditScopedRow(user, existing.branchId);
    const updated = await this.repository.softDeleteRate(id);
    return { rate: this.toRateContract(updated) };
  }

  async createPeriod(user: AuthenticatedUser, dto: CreateLoanPeriodOptionDto) {
    this.requireManage(user);
    const branchId = this.resolveWriteBranchId(user, dto.branchId);

    const created = await this.repository.createPeriod({
      tenant: { connect: { id: user.tenantId } },
      ...(branchId ? { branch: { connect: { id: branchId } } } : {}),
      label: dto.label.trim(),
      durationDays: dto.durationDays,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return { period: this.toPeriodContract(created) };
  }

  async updatePeriod(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateLoanPeriodOptionDto,
  ) {
    this.requireManage(user);
    const existing = await this.repository.findPeriod({
      tenantId: user.tenantId,
      id,
    });
    if (!existing) {
      throw new NotFoundException('Loan period option not found.');
    }
    this.assertCanEditScopedRow(user, existing.branchId);

    const updated = await this.repository.updatePeriod(id, {
      ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
      ...(dto.durationDays !== undefined
        ? { durationDays: dto.durationDays }
        : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });

    return { period: this.toPeriodContract(updated) };
  }

  async deactivatePeriod(user: AuthenticatedUser, id: string) {
    this.requireManage(user);
    const existing = await this.repository.findPeriod({
      tenantId: user.tenantId,
      id,
    });
    if (!existing) {
      throw new NotFoundException('Loan period option not found.');
    }
    this.assertCanEditScopedRow(user, existing.branchId);
    const updated = await this.repository.softDeletePeriod(id);
    return { period: this.toPeriodContract(updated) };
  }

  async upsertPaymentStartPolicy(
    user: AuthenticatedUser,
    dto: UpsertPaymentStartPolicyDto,
  ) {
    this.requireManage(user);
    const branchId = this.resolveWriteBranchId(user, dto.branchId);

    if (
      dto.policyType === PaymentStartPolicyType.AFTER_N_DAYS &&
      (dto.afterDays == null || dto.afterDays < 1)
    ) {
      throw new BadRequestException(
        'afterDays is required when policyType is AFTER_N_DAYS.',
      );
    }

    const saved = await this.repository.upsertPaymentStartPolicy({
      tenantId: user.tenantId,
      branchId,
      policyType: dto.policyType,
      afterDays:
        dto.policyType === PaymentStartPolicyType.AFTER_N_DAYS
          ? (dto.afterDays ?? 1)
          : null,
      allowAgentDatePick: dto.allowAgentDatePick ?? false,
    });

    return { paymentStartPolicy: this.toPaymentStartContract(saved) };
  }

  async upsertFinePolicy(user: AuthenticatedUser, dto: UpsertLoanFinePolicyDto) {
    this.requireManage(user);
    const branchId = this.resolveWriteBranchId(user, dto.branchId);

    if (dto.finePeriodDays < 1) {
      throw new BadRequestException('finePeriodDays must be at least 1.');
    }
    if (dto.fineAmount < 0) {
      throw new BadRequestException('fineAmount cannot be negative.');
    }

    const saved = await this.repository.upsertFinePolicy({
      tenantId: user.tenantId,
      branchId,
      finePeriodDays: dto.finePeriodDays,
      fineAmount: new Prisma.Decimal(dto.fineAmount.toFixed(2)),
      isActive: dto.isActive ?? true,
    });

    return { finePolicy: this.toFinePolicyContract(saved) };
  }

  /**
   * Resolve effective policy + compute paymentStartDate for a branch loan.
   * Used on application submit (and collections fallback).
   */
  async resolvePaymentStartDate(input: {
    tenantId: string;
    branchId: string;
    anchorDate: Date;
    agentPickedDate?: Date | null;
  }): Promise<Date> {
    const policy = await this.repository.findEffectivePaymentStartPolicy({
      tenantId: input.tenantId,
      branchId: input.branchId,
    });

    return computePaymentStartDate({
      policyType: policy?.policyType ?? DEFAULT_PAYMENT_START_POLICY.policyType,
      afterDays: policy?.afterDays ?? DEFAULT_PAYMENT_START_POLICY.afterDays,
      allowAgentDatePick:
        policy?.allowAgentDatePick ??
        DEFAULT_PAYMENT_START_POLICY.allowAgentDatePick,
      anchorDate: input.anchorDate,
      agentPickedDate: input.agentPickedDate,
    });
  }

  private canManage(user: AuthenticatedUser) {
    return user.permissions.includes(LOAN_PRODUCT_PERMISSIONS.manage);
  }

  private requireManage(user: AuthenticatedUser) {
    if (!this.canManage(user)) {
      throw new ForbiddenException(
        'You do not have permission to manage loan products.',
      );
    }
  }

  private resolveWriteBranchId(
    user: AuthenticatedUser,
    requestedBranchId?: string,
  ) {
    const canSeeAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );

    if (canSeeAllBranches) {
      return requestedBranchId ?? null;
    }

    if (!user.branchId) {
      throw new ForbiddenException(
        'Branch managers must be assigned to a branch.',
      );
    }

    if (requestedBranchId && requestedBranchId !== user.branchId) {
      throw new ForbiddenException(
        'You can only configure products for your branch.',
      );
    }

    return user.branchId;
  }

  private assertCanEditScopedRow(
    user: AuthenticatedUser,
    rowBranchId: string | null,
  ) {
    const canSeeAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );
    if (canSeeAllBranches) return;

    if (rowBranchId !== user.branchId) {
      throw new ForbiddenException(
        'You can only edit products for your branch.',
      );
    }
  }

  private toTemplateContract(row: {
    id: string;
    tenantId: string;
    branchId: string | null;
    name: string;
    description: string | null;
    interestRatePercent: Prisma.Decimal;
    interestType: LoanInterestType;
    termValue: number;
    termUnit: LoanTermUnit;
    repaymentFrequency: LoanRepaymentFrequency;
    processingFeePercent: Prisma.Decimal;
    penaltyRatePercent: Prisma.Decimal;
    finePeriodDays: number;
    minLoanAmount: Prisma.Decimal | null;
    maxLoanAmount: Prisma.Decimal | null;
    notes: string | null;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }): LoanProductTemplateContract {
    return {
      id: row.id,
      tenantId: row.tenantId,
      branchId: row.branchId,
      name: row.name,
      description: row.description,
      interestRatePercent: Number(row.interestRatePercent.toString()),
      interestType: 'FLAT',
      termValue: row.termValue,
      termUnit: row.termUnit,
      durationDays: termToDurationDays(row.termValue, row.termUnit),
      repaymentFrequency: row.repaymentFrequency,
      processingFeePercent: Number(row.processingFeePercent.toString()),
      penaltyRatePercent: Number(row.penaltyRatePercent.toString()),
      finePeriodDays: row.finePeriodDays,
      minLoanAmount:
        row.minLoanAmount != null
          ? Number(row.minLoanAmount.toString())
          : null,
      maxLoanAmount:
        row.maxLoanAmount != null
          ? Number(row.maxLoanAmount.toString())
          : null,
      notes: row.notes,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toRateContract(row: {
    id: string;
    tenantId: string;
    branchId: string | null;
    label: string;
    interestRatePercent: Prisma.Decimal;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }): LoanRateOptionContract {
    return {
      id: row.id,
      tenantId: row.tenantId,
      branchId: row.branchId,
      label: row.label,
      interestRatePercent: Number(row.interestRatePercent.toString()),
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toPeriodContract(row: {
    id: string;
    tenantId: string;
    branchId: string | null;
    label: string;
    durationDays: number;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }): LoanPeriodOptionContract {
    return {
      id: row.id,
      tenantId: row.tenantId,
      branchId: row.branchId,
      label: row.label,
      durationDays: row.durationDays,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toPaymentStartContract(row: {
    id: string;
    tenantId: string;
    branchId: string | null;
    policyType: PaymentStartPolicyType;
    afterDays: number | null;
    allowAgentDatePick: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): PaymentStartPolicyContract {
    return {
      id: row.id,
      tenantId: row.tenantId,
      branchId: row.branchId,
      policyType: row.policyType,
      afterDays: row.afterDays,
      allowAgentDatePick: row.allowAgentDatePick,
      isActive: row.isActive,
      description: describePaymentStartPolicy(row),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private defaultPaymentStartContract(
    tenantId: string,
    branchId: string | null,
  ): PaymentStartPolicyContract {
    const now = new Date().toISOString();
    return {
      id: 'default',
      tenantId,
      branchId,
      policyType: DEFAULT_PAYMENT_START_POLICY.policyType,
      afterDays: DEFAULT_PAYMENT_START_POLICY.afterDays,
      allowAgentDatePick: DEFAULT_PAYMENT_START_POLICY.allowAgentDatePick,
      isActive: true,
      description: describePaymentStartPolicy(DEFAULT_PAYMENT_START_POLICY),
      createdAt: now,
      updatedAt: now,
    };
  }

  private toFinePolicyContract(row: {
    id: string;
    tenantId: string;
    branchId: string | null;
    finePeriodDays: number;
    fineAmount: Prisma.Decimal;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): LoanFinePolicyContract {
    const amount = Number(row.fineAmount.toString());
    return {
      id: row.id,
      tenantId: row.tenantId,
      branchId: row.branchId,
      finePeriodDays: row.finePeriodDays,
      fineAmount: amount,
      isActive: row.isActive,
      description: row.isActive
        ? `Every ${row.finePeriodDays} day${row.finePeriodDays === 1 ? '' : 's'} after loan maturity while unpaid, add ${amount} to outstanding.`
        : 'Overdue fines disabled.',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
