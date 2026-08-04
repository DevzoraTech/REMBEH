import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashShortagePaymentMethod,
  CashShortageSource,
  CashShortageStatus,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { OPERATIONS_PERMISSIONS } from '../operations/operations.permissions';

@Injectable()
export class CashShortagesService {
  constructor(private readonly prisma: PrismaService) {}

  async createShortage(input: {
    tenantId: string;
    branchId: string;
    responsibleUserId: string;
    createdByUserId: string;
    sourceType: CashShortageSource;
    sourceId?: string | null;
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

    return this.prisma.cashShortage.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        responsibleUserId: input.responsibleUserId,
        createdByUserId: input.createdByUserId,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        operationDate: input.operationDate,
        amountOriginal: new Prisma.Decimal(amount),
        amountOutstanding: new Prisma.Decimal(amount),
        status: CashShortageStatus.OPEN,
        notes: input.notes?.trim() || null,
      },
    });
  }

  async listForScope(
    user: AuthenticatedUser,
    options?: { branchId?: string; userId?: string; status?: string },
  ) {
    this.assertCanRead(user);
    const canSeeAll = user.permissions.includes(BRANCH_PERMISSIONS.create);
    const branchId = canSeeAll
      ? options?.branchId
      : user.branchId ?? undefined;
    if (!canSeeAll && !branchId) return { shortages: [] };

    const rows = await this.prisma.cashShortage.findMany({
      where: {
        tenantId: user.tenantId!,
        ...(branchId ? { branchId } : {}),
        ...(options?.userId ? { responsibleUserId: options.userId } : {}),
        ...(options?.status &&
        Object.values(CashShortageStatus).includes(
          options.status as CashShortageStatus,
        )
          ? { status: options.status as CashShortageStatus }
          : {}),
      },
      include: {
        responsibleUser: {
          select: { id: true, displayName: true, publicId: true },
        },
        payments: {
          orderBy: { paidAt: 'desc' },
          take: 20,
        },
      },
      orderBy: [{ status: 'asc' }, { operationDate: 'desc' }],
      take: 500,
    });

    return {
      shortages: rows.map((row) => ({
        id: row.id,
        branchId: row.branchId,
        responsibleUserId: row.responsibleUserId,
        responsibleName: row.responsibleUser.displayName,
        responsiblePublicId: row.responsibleUser.publicId,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        operationDate: row.operationDate.toISOString().slice(0, 10),
        amountOriginal: Number(row.amountOriginal),
        amountOutstanding: Number(row.amountOutstanding),
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
        })),
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
    const shortage = await this.prisma.cashShortage.findFirst({
      where: { id: shortageId, tenantId: user.tenantId! },
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

    await this.prisma.$transaction(async (tx) => {
      await tx.cashShortagePayment.create({
        data: {
          tenantId: user.tenantId!,
          shortageId: shortage.id,
          amount: new Prisma.Decimal(amount),
          method: input.method ?? CashShortagePaymentMethod.CASH,
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

    return this.listForScope(user, { userId: shortage.responsibleUserId });
  }

  async outstandingForUsers(input: {
    tenantId: string;
    userIds: string[];
  }) {
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
      rows.map((row) => [
        row.responsibleUserId,
        Number(row._sum.amountOutstanding ?? 0),
      ]),
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
