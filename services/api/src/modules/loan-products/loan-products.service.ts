import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import {
  CreateLoanPeriodOptionDto,
  CreateLoanRateOptionDto,
  UpdateLoanPeriodOptionDto,
  UpdateLoanRateOptionDto,
} from './dto/loan-product.dto';
import {
  LoanPeriodOptionContract,
  LoanProductsCatalogContract,
  LoanRateOptionContract,
} from './loan-products.contracts';
import { LOAN_PRODUCT_PERMISSIONS } from './loan-products.permissions';
import { LoanProductsRepository } from './loan-products.repository';

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

    const [rates, periods] = await Promise.all([
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
    ]);

    return {
      rates: rates.map((item) => this.toRateContract(item)),
      periods: periods.map((item) => this.toPeriodContract(item)),
    };
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
}
