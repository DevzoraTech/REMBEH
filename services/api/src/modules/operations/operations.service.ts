import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  getPrismaUniqueConstraintTargets,
  isPrismaUniqueConstraintError,
} from '../../common/database/prisma-errors';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { OpenBranchOperationDto } from './dto/open-branch-operation.dto';
import {
  DailyOperationContract,
  DailyOperationResponseContract,
} from './operations.contracts';
import { OperationsRepository } from './operations.repository';

@Injectable()
export class OperationsService {
  constructor(private readonly repository: OperationsRepository) {}

  async getToday(
    user: AuthenticatedUser,
    options?: { branchId?: string; date?: string },
  ): Promise<DailyOperationResponseContract> {
    this.assertCanRead(user);
    const branch = await this.resolveBranch(user, options?.branchId);
    const bounds = this.parseDayBounds(options?.date);

    if (!branch) {
      return {
        date: bounds.dateLabel,
        branch: null,
        operation: null,
      };
    }

    const operation = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });

    return {
      date: bounds.dateLabel,
      branch: {
        id: branch.id,
        name: branch.name,
        address: branch.address,
      },
      operation: operation
        ? await this.toContract(operation, bounds.dayStart, bounds.dayEnd)
        : null,
    };
  }

  async openBranch(
    user: AuthenticatedUser,
    dto: OpenBranchOperationDto,
  ): Promise<DailyOperationResponseContract> {
    this.assertCanOpen(user);
    const branch = await this.resolveBranch(user, dto.branchId);
    if (!branch) {
      throw new NotFoundException('Branch was not found.');
    }

    const bounds = this.parseDayBounds(dto.date);
    const existing = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });

    if (existing) {
      throw new ConflictException('This branch is already open for this day.');
    }

    await this.repository
      .openBranch({
        tenantId: user.tenantId,
        branchId: branch.id,
        operationDate: bounds.dateOnly,
        openedAt: new Date(),
        openedByUserId: user.userId,
        cashInVault: new Prisma.Decimal(dto.cashInVault),
        cashInSafe: new Prisma.Decimal(dto.cashInSafe),
        openingFloatAvailable: new Prisma.Decimal(dto.openingFloatAvailable),
        previousClosingBalance: new Prisma.Decimal(dto.previousClosingBalance),
        notes: dto.notes?.trim() || null,
      })
      .catch((error: unknown) => {
        if (
          isPrismaUniqueConstraintError(error) &&
          getPrismaUniqueConstraintTargets(error).some((target) =>
            ['operation_date', 'operationDate'].includes(target),
          )
        ) {
          throw new ConflictException(
            'This branch is already open for this day.',
          );
        }
        throw error;
      });

    return this.getToday(user, { branchId: branch.id, date: bounds.dateLabel });
  }

  async requireOpenBranch(input: {
    tenantId: string;
    branchId: string | null | undefined;
    date?: string;
  }) {
    if (!input.branchId) {
      throw new ForbiddenException('Branch scope is required.');
    }
    const bounds = this.parseDayBounds(input.date);
    const operation = await this.repository.findOperationForDay({
      tenantId: input.tenantId,
      branchId: input.branchId,
      operationDate: bounds.dateOnly,
    });

    if (!operation || operation.status !== 'OPEN') {
      throw new BadRequestException('Open the branch before assigning float.');
    }

    return operation;
  }

  private async toContract(
    operation: NonNullable<
      Awaited<ReturnType<OperationsRepository['findOperationForDay']>>
    >,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<DailyOperationContract> {
    const [floatAgg, loansAgg, collectionsAgg] = await Promise.all([
      this.repository.sumFloatIssued({
        tenantId: operation.tenantId,
        branchId: operation.branchId,
        floatDate: operation.operationDate,
      }),
      this.repository.sumLoansIssued({
        tenantId: operation.tenantId,
        branchId: operation.branchId,
        dayStart,
        dayEnd,
      }),
      this.repository.sumCollections({
        tenantId: operation.tenantId,
        branchId: operation.branchId,
        dayStart,
        dayEnd,
      }),
    ]);

    const cashInVault = this.decimalToNumber(operation.cashInVault);
    const cashInSafe = this.decimalToNumber(operation.cashInSafe);
    const openingFloatAvailable = this.decimalToNumber(
      operation.openingFloatAvailable,
    );
    const previousClosingBalance = this.decimalToNumber(
      operation.previousClosingBalance,
    );
    const totalOpeningCash = this.roundMoney(cashInVault + cashInSafe);
    const floatIssued = this.decimalToNumber(floatAgg._sum.amountGiven);
    const loansIssuedPrincipal = this.decimalToNumber(
      loansAgg._sum.principalAmount,
    );
    const collectionsReceived = this.decimalToNumber(
      collectionsAgg._sum.amount,
    );

    return {
      id: operation.id,
      branchId: operation.branchId,
      branchName: operation.branch.name,
      operationDate: this.formatDateLabel(operation.operationDate),
      status: operation.status,
      openedAt: operation.openedAt.toISOString(),
      openedByName: operation.openedBy.displayName,
      closedAt: operation.closedAt?.toISOString() ?? null,
      cashInVault,
      cashInSafe,
      openingFloatAvailable,
      previousClosingBalance,
      totalOpeningCash,
      floatIssued,
      cashRemainingForFloat: this.roundMoney(
        openingFloatAvailable - floatIssued,
      ),
      loansIssuedCount: loansAgg._count._all,
      loansIssuedPrincipal,
      collectionsCount: collectionsAgg._count._all,
      collectionsReceived,
      expectedCashNow: this.roundMoney(totalOpeningCash - floatIssued),
      notes: operation.notes,
    };
  }

  private async resolveBranch(
    user: AuthenticatedUser,
    requestedBranchId?: string,
  ) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Tenant scope is required.');
    }

    const canAllBranches = user.permissions.includes(BRANCH_PERMISSIONS.create);
    if (!canAllBranches) {
      if (!user.branchId) {
        throw new ForbiddenException('Branch scope is required.');
      }
      if (requestedBranchId && requestedBranchId !== user.branchId) {
        throw new ForbiddenException('You cannot access this branch.');
      }
      return this.repository.findBranch({
        tenantId: user.tenantId,
        branchId: user.branchId,
      });
    }

    return this.repository.findBranch({
      tenantId: user.tenantId,
      branchId: requestedBranchId,
    });
  }

  private assertCanRead(user: AuthenticatedUser) {
    this.assertTenant(user);
    if (!user.permissions.includes('operation.read')) {
      throw new ForbiddenException('Missing permission to view operations.');
    }
  }

  private assertCanOpen(user: AuthenticatedUser) {
    this.assertTenant(user);
    if (!user.permissions.includes('operation.open')) {
      throw new ForbiddenException('Missing permission to open branch.');
    }
  }

  private assertTenant(user: AuthenticatedUser) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Tenant scope is required.');
    }
  }

  private parseDayBounds(date?: string) {
    const base = date?.trim() ? this.parseDateInput(date.trim()) : new Date();
    const dayStart = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
    );
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    dayEnd.setMilliseconds(dayEnd.getMilliseconds() - 1);
    return {
      dayStart,
      dayEnd,
      dateLabel: this.formatDateLabel(dayStart),
      dateOnly: this.toDateOnly(dayStart),
    };
  }

  private parseDateInput(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('date must be YYYY-MM-DD.');
    }
    const [y, m, d] = value.split('-').map(Number);
    const parsed = new Date(y, m - 1, d);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getFullYear() !== y ||
      parsed.getMonth() !== m - 1 ||
      parsed.getDate() !== d
    ) {
      throw new BadRequestException('date must be a valid calendar day.');
    }
    return parsed;
  }

  private toDateOnly(dayStart: Date) {
    return new Date(
      Date.UTC(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate()),
    );
  }

  private formatDateLabel(value: Date) {
    if (
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0
    ) {
      const y = value.getUTCFullYear();
      const m = String(value.getUTCMonth() + 1).padStart(2, '0');
      const d = String(value.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    return Number(value.toString());
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }
}
