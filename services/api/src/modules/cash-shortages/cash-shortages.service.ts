import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchOperationStatus,
  CashShortagePaymentMethod,
  CashShortageReason,
  CashShortageSource,
  CashShortageStatus,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { OPERATIONS_PERMISSIONS } from '../operations/operations.permissions';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const shortageInclude = {
  branch: {
    select: { id: true, name: true },
  },
  responsibleUser: {
    select: { id: true, displayName: true, publicId: true },
  },
  employee: {
    select: { id: true, fullName: true },
  },
  createdBy: {
    select: { id: true, displayName: true },
  },
  payments: {
    orderBy: { paidAt: 'desc' as const },
    take: 100,
    include: {
      recordedBy: {
        select: { id: true, displayName: true },
      },
    },
  },
};

@Injectable()
export class CashShortagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async createShortage(input: {
    tenantId: string;
    branchId: string;
    responsibleUserId?: string | null;
    employeeId?: string | null;
    createdByUserId: string;
    sourceType: CashShortageSource;
    sourceId?: string | null;
    reason?: CashShortageReason | null;
    operationDate: Date;
    amount: number;
    notes?: string | null;
  }) {
    const amount = Math.round(Math.abs(input.amount) * 100) / 100;
    if (amount <= 0) return null;

    const existing = input.sourceId
      ? await this.prisma.cashShortage.findFirst({
          where: {
            tenantId: input.tenantId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
          },
        })
      : null;
    if (existing) return existing;

    let employeeId = input.employeeId ?? null;
    if (!employeeId && input.responsibleUserId) {
      const employee = await this.prisma.employee.findFirst({
        where: {
          tenantId: input.tenantId,
          userId: input.responsibleUserId,
        },
        select: { id: true },
      });
      employeeId = employee?.id ?? null;
    }

    if (!input.responsibleUserId && !employeeId) {
      throw new BadRequestException(
        'Link this shortage to an employee or staff account.',
      );
    }

    const personFilter: Prisma.CashShortageWhereInput = {
      OR: [
        ...(input.responsibleUserId
          ? [{ responsibleUserId: input.responsibleUserId }]
          : []),
        ...(employeeId ? [{ employeeId }] : []),
      ],
    };

    const openRows = await this.prisma.cashShortage.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        status: {
          in: [CashShortageStatus.OPEN, CashShortageStatus.PARTIALLY_PAID],
        },
        amountOutstanding: { gt: 0 },
        ...personFilter,
      },
      orderBy: [{ operationDate: 'asc' }, { createdAt: 'asc' }],
    });

    const noteLine = input.notes?.trim() || null;
    const created = await this.prisma.$transaction(async (tx) => {
      if (openRows.length === 0) {
        return tx.cashShortage.create({
          data: {
            tenantId: input.tenantId,
            branchId: input.branchId,
            responsibleUserId: input.responsibleUserId ?? null,
            employeeId,
            createdByUserId: input.createdByUserId,
            sourceType: input.sourceType,
            sourceId: input.sourceId ?? null,
            reason: input.reason ?? null,
            operationDate: input.operationDate,
            amountOriginal: new Prisma.Decimal(amount),
            amountOutstanding: new Prisma.Decimal(amount),
            status: CashShortageStatus.OPEN,
            notes: noteLine,
          },
        });
      }

      const primary = openRows[0];
      const duplicates = openRows.slice(1);
      let nextOriginal = Number(primary.amountOriginal) + amount;
      let nextOutstanding = Number(primary.amountOutstanding) + amount;

      for (const duplicate of duplicates) {
        nextOriginal += Number(duplicate.amountOriginal);
        nextOutstanding += Number(duplicate.amountOutstanding);
        await tx.cashShortagePayment.updateMany({
          where: { shortageId: duplicate.id },
          data: { shortageId: primary.id },
        });
        await tx.cashShortage.delete({ where: { id: duplicate.id } });
      }

      nextOriginal = Math.round(nextOriginal * 100) / 100;
      nextOutstanding = Math.round(nextOutstanding * 100) / 100;

      const mergedNotes = [primary.notes?.trim(), noteLine]
        .filter((value): value is string => Boolean(value))
        .join(' · ');

      return tx.cashShortage.update({
        where: { id: primary.id },
        data: {
          amountOriginal: new Prisma.Decimal(nextOriginal),
          amountOutstanding: new Prisma.Decimal(Math.max(0, nextOutstanding)),
          status:
            nextOutstanding <= 0
              ? CashShortageStatus.CLEARED
              : nextOutstanding < nextOriginal
                ? CashShortageStatus.PARTIALLY_PAID
                : CashShortageStatus.OPEN,
          operationDate: input.operationDate,
          reason: input.reason ?? primary.reason,
          responsibleUserId:
            primary.responsibleUserId ?? input.responsibleUserId ?? null,
          employeeId: primary.employeeId ?? employeeId,
          notes: mergedNotes || null,
          clearedAt: nextOutstanding <= 0 ? new Date() : null,
          updatedAt: new Date(),
        },
      });
    });

    this.emitShortageChanged({
      tenantId: input.tenantId,
      branchId: input.branchId,
      shortageId: created.id,
      action: openRows.length === 0 ? 'created' : 'updated',
    });

    return created;
  }

  async recordOpeningShortage(
    user: AuthenticatedUser,
    input: {
      employeeId: string;
      amount: number;
      notes?: string;
      operationDate?: string;
    },
  ) {
    this.assertCanWrite(user);
    const employee = await this.findEmployeeInScope(user, input.employeeId);
    if (!employee.branchId) {
      throw new BadRequestException(
        'Assign this employee to a branch before recording a shortage.',
      );
    }

    const amount = Math.round(Number(input.amount) * 100) / 100;
    if (!(amount > 0)) {
      throw new BadRequestException('Enter a valid shortage amount.');
    }

    const operationDate = this.parseDate(input.operationDate);
    const shortage = await this.createShortage({
      tenantId: user.tenantId!,
      branchId: employee.branchId,
      responsibleUserId: employee.userId,
      employeeId: employee.id,
      createdByUserId: user.userId,
      sourceType: CashShortageSource.MANUAL,
      reason: CashShortageReason.OTHER,
      operationDate,
      amount,
      notes:
        input.notes?.trim() ||
        'Opening shortage carried from the previous system.',
    });
    if (!shortage) {
      throw new BadRequestException('Enter a valid shortage amount.');
    }
    return this.getOne(user, shortage.id);
  }

  async listForScope(
    user: AuthenticatedUser,
    options?: { branchId?: string; userId?: string; status?: string },
  ) {
    this.assertCanRead(user);
    const canSeeAll = user.permissions.includes(BRANCH_PERMISSIONS.create);
    const branchId = canSeeAll
      ? options?.branchId
      : (user.branchId ?? undefined);
    if (!canSeeAll && !branchId) return { shortages: [] };

    await this.consolidateOpenDuplicates({
      tenantId: user.tenantId!,
      branchId: branchId ?? undefined,
    });

    let linkedEmployeeId: string | null = null;
    if (options?.userId?.trim()) {
      const linked = await this.prisma.employee.findFirst({
        where: {
          tenantId: user.tenantId!,
          userId: options.userId.trim(),
          ...(branchId ? { branchId } : {}),
        },
        select: { id: true },
      });
      linkedEmployeeId = linked?.id ?? null;
    }

    const rows = await this.prisma.cashShortage.findMany({
      where: {
        tenantId: user.tenantId!,
        ...(branchId ? { branchId } : {}),
        ...(options?.userId?.trim()
          ? {
              OR: [
                { responsibleUserId: options.userId.trim() },
                ...(linkedEmployeeId ? [{ employeeId: linkedEmployeeId }] : []),
              ],
            }
          : {}),
        ...(options?.status &&
        Object.values(CashShortageStatus).includes(
          options.status as CashShortageStatus,
        )
          ? { status: options.status as CashShortageStatus }
          : {}),
      },
      include: shortageInclude,
      orderBy: [{ status: 'asc' }, { operationDate: 'desc' }],
      take: 500,
    });

    return {
      shortages: rows.map((row) => this.toContract(row)),
      summary: {
        openCount: rows.filter(
          (row) => row.status !== CashShortageStatus.CLEARED,
        ).length,
        outstandingTotal: rows
          .filter((row) => row.status !== CashShortageStatus.CLEARED)
          .reduce((sum, row) => sum + Number(row.amountOutstanding), 0),
        clearedCount: rows.filter(
          (row) => row.status === CashShortageStatus.CLEARED,
        ).length,
      },
    };
  }

  async getOne(user: AuthenticatedUser, shortageId: string) {
    this.assertCanRead(user);
    const canSeeAll = user.permissions.includes(BRANCH_PERMISSIONS.create);
    if (!canSeeAll && !user.branchId) {
      throw new ForbiddenException('Branch access is required.');
    }
    const branchScope = !canSeeAll ? { branchId: user.branchId! } : {};
    const row = await this.prisma.cashShortage.findFirst({
      where: {
        id: shortageId,
        tenantId: user.tenantId!,
        ...branchScope,
      },
      include: shortageInclude,
    });
    if (!row) throw new NotFoundException('Shortage was not found.');
    return { shortage: this.toContract(row) };
  }

  private toContract(row: {
    id: string;
    branchId: string;
    responsibleUserId: string | null;
    employeeId?: string | null;
    sourceType: CashShortageSource;
    sourceId: string | null;
    reason: CashShortageReason | null;
    operationDate: Date;
    amountOriginal: Prisma.Decimal;
    amountOutstanding: Prisma.Decimal;
    status: CashShortageStatus;
    notes: string | null;
    createdAt: Date;
    clearedAt: Date | null;
    branch: { id: string; name: string };
    responsibleUser: {
      id: string;
      displayName: string;
      publicId: string | null;
    } | null;
    employee?: { id: string; fullName: string } | null;
    createdBy: { id: string; displayName: string };
    payments: Array<{
      id: string;
      amount: Prisma.Decimal;
      method: CashShortagePaymentMethod;
      notes: string | null;
      paidAt: Date;
      recordedBy: { id: string; displayName: string };
    }>;
  }) {
    return {
      id: row.id,
      branchId: row.branchId,
      branchName: row.branch.name,
      responsibleUserId: row.responsibleUserId,
      employeeId: row.employeeId ?? row.employee?.id ?? null,
      responsibleName:
        row.responsibleUser?.displayName ??
        row.employee?.fullName ??
        'Employee',
      responsiblePublicId: row.responsibleUser?.publicId ?? null,
      createdByName: row.createdBy.displayName,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      reason: row.reason,
      operationDate: row.operationDate.toISOString().slice(0, 10),
      amountOriginal: Number(row.amountOriginal),
      amountOutstanding: Number(row.amountOutstanding),
      amountPaid:
        Math.round(
          (Number(row.amountOriginal) - Number(row.amountOutstanding)) * 100,
        ) / 100,
      status: row.status,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      clearedAt: row.clearedAt?.toISOString() ?? null,
      payments: row.payments.map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        method: payment.method,
        notes: payment.notes,
        paidAt: payment.paidAt.toISOString(),
        recordedByName: payment.recordedBy.displayName,
      })),
    };
  }

  async recordPayment(
    user: AuthenticatedUser,
    shortageId: string,
    input: {
      amount: number;
      method?: CashShortagePaymentMethod;
      notes?: string;
    },
  ) {
    this.assertCanWrite(user);
    const canSeeAll = user.permissions.includes(BRANCH_PERMISSIONS.create);
    if (!canSeeAll && !user.branchId) {
      throw new ForbiddenException('Branch access is required.');
    }
    const branchScope = !canSeeAll ? { branchId: user.branchId! } : {};
    const shortage = await this.prisma.cashShortage.findFirst({
      where: {
        id: shortageId,
        tenantId: user.tenantId!,
        ...branchScope,
      },
    });
    if (!shortage) throw new NotFoundException('Shortage was not found.');
    if (shortage.status === CashShortageStatus.CLEARED) {
      throw new BadRequestException('This shortage is already cleared.');
    }

    const amount = Math.round(Number(input.amount) * 100) / 100;
    if (!(amount > 0)) {
      throw new BadRequestException('Enter a valid payment amount.');
    }
    const outstanding = Number(shortage.amountOutstanding);
    if (amount > outstanding + 0.001) {
      throw new BadRequestException(
        `Payment exceeds outstanding shortage (${outstanding}).`,
      );
    }

    const nextOutstanding = Math.round((outstanding - amount) * 100) / 100;
    const status =
      nextOutstanding <= 0
        ? CashShortageStatus.CLEARED
        : CashShortageStatus.PARTIALLY_PAID;
    const method = input.method ?? CashShortagePaymentMethod.CASH;

    await this.prisma.$transaction(async (tx) => {
      const operationId =
        method === CashShortagePaymentMethod.CASH
          ? await this.lockOpenCashDay(tx, {
              tenantId: user.tenantId!,
              branchId: shortage.branchId,
            })
          : null;

      await tx.cashShortagePayment.create({
        data: {
          tenantId: user.tenantId!,
          shortageId: shortage.id,
          operationId,
          amount: new Prisma.Decimal(amount),
          method,
          notes: input.notes?.trim() || null,
          recordedByUserId: user.userId,
        },
      });
      await tx.cashShortage.update({
        where: { id: shortage.id },
        data: {
          amountOutstanding: new Prisma.Decimal(Math.max(0, nextOutstanding)),
          status,
          clearedAt: status === CashShortageStatus.CLEARED ? new Date() : null,
        },
      });
    });

    this.emitShortageChanged({
      tenantId: user.tenantId!,
      branchId: shortage.branchId,
      shortageId: shortage.id,
      action: 'payment',
    });

    return this.getOne(user, shortage.id);
  }

  async settleForEmployee(
    user: AuthenticatedUser,
    input: {
      responsibleUserId?: string;
      employeeId?: string;
      amount: number;
      method?: CashShortagePaymentMethod;
      notes?: string;
    },
  ) {
    this.assertCanWrite(user);
    const canSeeAll = user.permissions.includes(BRANCH_PERMISSIONS.create);
    if (!canSeeAll && !user.branchId) {
      throw new ForbiddenException('Branch access is required.');
    }

    const amount = Math.round(Number(input.amount) * 100) / 100;
    if (!(amount > 0)) {
      throw new BadRequestException('Enter a valid payment amount.');
    }

    let responsibleUserId = input.responsibleUserId ?? null;
    let employeeId = input.employeeId ?? null;
    let branchId = !canSeeAll ? user.branchId! : null;

    if (employeeId) {
      const employee = await this.findEmployeeInScope(user, employeeId);
      employeeId = employee.id;
      responsibleUserId = responsibleUserId ?? employee.userId;
      branchId = employee.branchId ?? branchId;
    }

    if (!responsibleUserId && !employeeId) {
      throw new BadRequestException(
        'Select the employee whose shortage is being cleared.',
      );
    }

    const shortages = await this.prisma.cashShortage.findMany({
      where: {
        tenantId: user.tenantId!,
        ...(branchId ? { branchId } : {}),
        OR: [
          ...(responsibleUserId ? [{ responsibleUserId }] : []),
          ...(employeeId ? [{ employeeId }] : []),
        ],
        status: {
          in: [CashShortageStatus.OPEN, CashShortageStatus.PARTIALLY_PAID],
        },
        amountOutstanding: { gt: 0 },
      },
      orderBy: [{ operationDate: 'asc' }, { createdAt: 'asc' }],
    });

    if (shortages.length === 0) {
      throw new BadRequestException(
        'This employee has no open shortage to clear.',
      );
    }

    const outstandingTotal = shortages.reduce(
      (sum, row) => sum + Number(row.amountOutstanding),
      0,
    );
    if (amount > outstandingTotal + 0.001) {
      throw new BadRequestException(
        `Payment exceeds outstanding shortage (${Math.round(outstandingTotal * 100) / 100}).`,
      );
    }

    const method = input.method ?? CashShortagePaymentMethod.CASH;
    const notes =
      input.notes?.trim() ||
      'Shortage cleared without waiting for the salary cycle.';
    let remaining = amount;
    let lastShortageId = shortages[0].id;

    await this.prisma.$transaction(async (tx) => {
      const operationId =
        method === CashShortagePaymentMethod.CASH
          ? await this.lockOpenCashDay(tx, {
              tenantId: user.tenantId!,
              branchId: shortages[0].branchId,
            })
          : null;

      for (const shortage of shortages) {
        if (remaining <= 0) break;
        const outstanding = Number(shortage.amountOutstanding);
        const applied =
          Math.round(Math.min(remaining, outstanding) * 100) / 100;
        const nextOutstanding =
          Math.round((outstanding - applied) * 100) / 100;
        const status =
          nextOutstanding <= 0
            ? CashShortageStatus.CLEARED
            : CashShortageStatus.PARTIALLY_PAID;

        await tx.cashShortagePayment.create({
          data: {
            tenantId: user.tenantId!,
            shortageId: shortage.id,
            operationId,
            amount: new Prisma.Decimal(applied),
            method,
            notes,
            recordedByUserId: user.userId,
          },
        });
        await tx.cashShortage.update({
          where: { id: shortage.id },
          data: {
            amountOutstanding: new Prisma.Decimal(
              Math.max(0, nextOutstanding),
            ),
            status,
            clearedAt:
              status === CashShortageStatus.CLEARED ? new Date() : null,
            ...(!shortage.employeeId && employeeId
              ? { employeeId }
              : {}),
          },
        });

        lastShortageId = shortage.id;
        remaining = Math.round((remaining - applied) * 100) / 100;
      }
    });

    this.emitShortageChanged({
      tenantId: user.tenantId!,
      branchId: shortages[0].branchId,
      shortageId: lastShortageId,
      action: 'settled',
    });

    return this.getOne(user, lastShortageId);
  }

  async outstandingForUsers(input: { tenantId: string; userIds: string[] }) {
    if (input.userIds.length === 0) return new Map<string, number>();
    const rows = await this.prisma.cashShortage.groupBy({
      by: ['responsibleUserId'],
      where: {
        tenantId: input.tenantId,
        responsibleUserId: { in: input.userIds },
        status: {
          in: [CashShortageStatus.OPEN, CashShortageStatus.PARTIALLY_PAID],
        },
      },
      _sum: { amountOutstanding: true },
    });
    return new Map(
      rows
        .filter((row) => row.responsibleUserId)
        .map((row) => [
          row.responsibleUserId as string,
          Number(row._sum.amountOutstanding ?? 0),
        ]),
    );
  }

  private async consolidateOpenDuplicates(input: {
    tenantId: string;
    branchId?: string;
  }) {
    const openRows = await this.prisma.cashShortage.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        status: {
          in: [CashShortageStatus.OPEN, CashShortageStatus.PARTIALLY_PAID],
        },
        amountOutstanding: { gt: 0 },
      },
      orderBy: [{ operationDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        branchId: true,
        responsibleUserId: true,
        employeeId: true,
        amountOriginal: true,
        amountOutstanding: true,
        notes: true,
        reason: true,
        operationDate: true,
      },
    });

    const byBranch = new Map<string, typeof openRows>();
    for (const row of openRows) {
      const bucket = byBranch.get(row.branchId) ?? [];
      bucket.push(row);
      byBranch.set(row.branchId, bucket);
    }

    for (const rows of byBranch.values()) {
      const parent = new Map<string, string>();
      const find = (id: string): string => {
        const current = parent.get(id) ?? id;
        if (current === id) return id;
        const root = find(current);
        parent.set(id, root);
        return root;
      };
      const union = (a: string, b: string) => {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA !== rootB) parent.set(rootB, rootA);
      };

      for (const row of rows) {
        parent.set(row.id, row.id);
      }

      const byEmployee = new Map<string, string>();
      const byUser = new Map<string, string>();
      for (const row of rows) {
        if (row.employeeId) {
          const existing = byEmployee.get(row.employeeId);
          if (existing) union(existing, row.id);
          else byEmployee.set(row.employeeId, row.id);
        }
        if (row.responsibleUserId) {
          const existing = byUser.get(row.responsibleUserId);
          if (existing) union(existing, row.id);
          else byUser.set(row.responsibleUserId, row.id);
        }
      }

      const groups = new Map<string, typeof rows>();
      for (const row of rows) {
        const root = find(row.id);
        const bucket = groups.get(root) ?? [];
        bucket.push(row);
        groups.set(root, bucket);
      }

      for (const group of groups.values()) {
        if (group.length < 2) continue;
        group.sort(
          (left, right) =>
            left.operationDate.getTime() - right.operationDate.getTime() ||
            left.id.localeCompare(right.id),
        );
        const primary = group[0];
        const duplicates = group.slice(1);
        let nextOriginal = Number(primary.amountOriginal);
        let nextOutstanding = Number(primary.amountOutstanding);
        const noteParts = [primary.notes?.trim()].filter(Boolean) as string[];

        await this.prisma.$transaction(async (tx) => {
          for (const duplicate of duplicates) {
            nextOriginal += Number(duplicate.amountOriginal);
            nextOutstanding += Number(duplicate.amountOutstanding);
            if (duplicate.notes?.trim()) {
              noteParts.push(duplicate.notes.trim());
            }
            await tx.cashShortagePayment.updateMany({
              where: { shortageId: duplicate.id },
              data: { shortageId: primary.id },
            });
            await tx.cashShortage.delete({ where: { id: duplicate.id } });
          }

          nextOriginal = Math.round(nextOriginal * 100) / 100;
          nextOutstanding = Math.round(nextOutstanding * 100) / 100;

          await tx.cashShortage.update({
            where: { id: primary.id },
            data: {
              amountOriginal: new Prisma.Decimal(nextOriginal),
              amountOutstanding: new Prisma.Decimal(
                Math.max(0, nextOutstanding),
              ),
              status:
                nextOutstanding <= 0
                  ? CashShortageStatus.CLEARED
                  : nextOutstanding < nextOriginal
                    ? CashShortageStatus.PARTIALLY_PAID
                    : CashShortageStatus.OPEN,
              responsibleUserId:
                primary.responsibleUserId ??
                duplicates.find((row) => row.responsibleUserId)
                  ?.responsibleUserId ??
                null,
              employeeId:
                primary.employeeId ??
                duplicates.find((row) => row.employeeId)?.employeeId ??
                null,
              notes: noteParts.join(' · ') || null,
              clearedAt: nextOutstanding <= 0 ? new Date() : null,
            },
          });
        });

        this.emitShortageChanged({
          tenantId: input.tenantId,
          branchId: primary.branchId,
          shortageId: primary.id,
          action: 'merged',
        });
      }
    }
  }

  private emitShortageChanged(input: {
    tenantId: string;
    branchId: string;
    shortageId: string;
    action: 'created' | 'updated' | 'payment' | 'settled' | 'merged';
  }) {
    const payload = {
      tenantId: input.tenantId,
      branchId: input.branchId,
      shortageId: input.shortageId,
      action: input.action,
      at: new Date().toISOString(),
    };
    this.realtime.emitToTenant(input.tenantId, 'shortage.updated', payload);
    this.realtime.emitToBranch(
      input.tenantId,
      input.branchId,
      'shortage.updated',
      payload,
    );
  }

  private async findEmployeeInScope(user: AuthenticatedUser, employeeId: string) {
    const canSeeAll = user.permissions.includes(BRANCH_PERMISSIONS.create);
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: user.tenantId!,
        ...(!canSeeAll && user.branchId ? { branchId: user.branchId } : {}),
      },
      select: { id: true, userId: true, branchId: true, fullName: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee was not found.');
    }
    return employee;
  }

  private async lockOpenCashDay(
    tx: Prisma.TransactionClient,
    input: { tenantId: string; branchId: string },
  ) {
    const operation = await tx.branchDailyOperation.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        status: BranchOperationStatus.OPEN,
      },
      orderBy: { operationDate: 'desc' },
    });
    if (!operation) {
      throw new BadRequestException(
        'Open the branch day before recording shortage paid as cash in.',
      );
    }

    await tx.$queryRaw(
      Prisma.sql`
        SELECT id
        FROM branch_daily_operations
        WHERE id = ${operation.id}::uuid
        FOR UPDATE
      `,
    );

    return operation.id;
  }

  private parseDate(value?: string) {
    if (!value?.trim()) {
      const today = new Date();
      return new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
      );
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) {
      throw new BadRequestException('Use a date in YYYY-MM-DD format.');
    }
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  private assertCanRead(user: AuthenticatedUser) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Account access is required.');
    }
    if (
      !user.permissions.includes(OPERATIONS_PERMISSIONS.read) &&
      !user.permissions.includes(BRANCH_PERMISSIONS.create)
    ) {
      throw new ForbiddenException('You cannot view shortages.');
    }
  }

  private assertCanWrite(user: AuthenticatedUser) {
    this.assertCanRead(user);
    if (
      !user.permissions.includes(OPERATIONS_PERMISSIONS.close) &&
      !user.permissions.includes(OPERATIONS_PERMISSIONS.floatReturn)
    ) {
      throw new ForbiddenException('You cannot record shortage payments.');
    }
  }
}
