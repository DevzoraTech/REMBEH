import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BranchOperationExpensePaidFrom,
  BranchOperationStatus,
  CashShortagePaymentMethod,
  CashShortageStatus,
  EmployeeStatus,
  Prisma,
  SalaryPaymentMethod,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export const SALARY_AGENT_ROLES = [
  'Agent',
  'Field Officer',
  'Loan Officer',
  'Supervisor',
  'Recovery Officer',
] as const;

@Injectable()
export class SalariesRepository {
  constructor(private readonly prisma: PrismaService) {}

  listEmployees(input: {
    tenantId: string;
    branchId: string | null;
    search?: string;
    cycleStart: Date;
    cycleEnd: Date;
  }) {
    const search = input.search?.trim();
    const orFilters: Prisma.EmployeeWhereInput[] | undefined = search
      ? [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { ninNumber: { contains: search, mode: 'insensitive' } },
        ]
      : undefined;

    return this.prisma.employee.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(orFilters ? { OR: orFilters } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            profilePhotoStorageKey: true,
          },
        },
        salaryPayments: {
          where: {
            cycleStart: input.cycleStart,
            cycleEnd: input.cycleEnd,
          },
          orderBy: { paidAt: 'desc' },
          include: {
            recordedBy: { select: { displayName: true } },
            operation: { select: { id: true, operationDate: true, status: true } },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
    });
  }

  findEmployee(input: {
    tenantId: string;
    branchId: string | null;
    employeeId: string;
    cycleStart: Date;
    cycleEnd: Date;
  }) {
    return this.prisma.employee.findFirst({
      where: {
        id: input.employeeId,
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            profilePhotoStorageKey: true,
          },
        },
        salaryPayments: {
          where: {
            cycleStart: input.cycleStart,
            cycleEnd: input.cycleEnd,
          },
          orderBy: { paidAt: 'desc' },
          include: {
            recordedBy: { select: { displayName: true } },
            operation: { select: { id: true, operationDate: true, status: true } },
          },
        },
      },
    });
  }

  findAgentCandidate(input: {
    tenantId: string;
    branchId: string | null;
    userId: string;
  }) {
    return this.prisma.user.findFirst({
      where: {
        id: input.userId,
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        roles: {
          some: {
            role: { name: { in: [...SALARY_AGENT_ROLES] } },
          },
        },
      },
      include: {
        roles: { include: { role: true } },
      },
    });
  }

  async listAgentCandidates(input: {
    tenantId: string;
    branchId: string | null;
  }) {
    const linked = await this.prisma.employee.findMany({
      where: {
        tenantId: input.tenantId,
        userId: { not: null },
      },
      select: { userId: true },
    });
    const linkedIds = linked
      .map((row) => row.userId)
      .filter((id): id is string => Boolean(id));

    return this.prisma.user.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(linkedIds.length ? { id: { notIn: linkedIds } } : {}),
        roles: {
          some: {
            role: { name: { in: [...SALARY_AGENT_ROLES] } },
          },
        },
      },
      include: {
        roles: { include: { role: true } },
      },
      orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
      take: 200,
    });
  }

  createEmployee(input: {
    tenantId: string;
    branchId: string | null;
    userId?: string | null;
    fullName: string;
    phone?: string | null;
    email?: string | null;
    ninNumber?: string | null;
    roleName?: string | null;
    status?: EmployeeStatus;
    monthlySalary: number;
    dateJoined: Date;
    paymentMethod?: SalaryPaymentMethod | null;
    paymentProvider?: string | null;
    paymentAccountName?: string | null;
    paymentAccountNumber?: string | null;
    notes?: string | null;
    createdByUserId: string;
  }) {
    return this.prisma.employee.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        userId: input.userId ?? null,
        fullName: input.fullName,
        phone: input.phone ?? null,
        email: input.email ?? null,
        ninNumber: input.ninNumber ?? null,
        roleName: input.roleName ?? null,
        status: input.status ?? EmployeeStatus.ACTIVE,
        monthlySalary: new Prisma.Decimal(input.monthlySalary),
        dateJoined: input.dateJoined,
        paymentMethod: input.paymentMethod ?? null,
        paymentProvider: input.paymentProvider ?? null,
        paymentAccountName: input.paymentAccountName ?? null,
        paymentAccountNumber: input.paymentAccountNumber ?? null,
        notes: input.notes ?? null,
        createdByUserId: input.createdByUserId,
      },
    });
  }

  updateEmployee(input: {
    tenantId: string;
    branchId: string | null;
    employeeId: string;
    data: Prisma.EmployeeUpdateInput;
  }) {
    return this.prisma.employee.updateMany({
      where: {
        id: input.employeeId,
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      data: input.data,
    });
  }

  recordPayment(input: {
    tenantId: string;
    branchId: string | null;
    employeeId: string;
    cycleStart: Date;
    cycleEnd: Date;
    amount: number;
    method: SalaryPaymentMethod;
    paidAt: Date;
    referenceNote?: string | null;
    recordedByUserId: string;
    shortageSettlement?: {
      responsibleUserId: string;
      amount: number;
      paidAt: Date;
      notes?: string | null;
    };
  }) {
    return this.prisma.$transaction(async (tx) => {
      const cashDay = await this.lockOpenCashDay(tx, {
        tenantId: input.tenantId,
        branchId: input.branchId,
        amount: input.amount,
      });

      const payment = await tx.salaryPayment.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          operationId: cashDay.operationId,
          employeeId: input.employeeId,
          cycleStart: input.cycleStart,
          cycleEnd: input.cycleEnd,
          amount: new Prisma.Decimal(input.amount),
          method: input.method,
          paidAt: input.paidAt,
          referenceNote: input.referenceNote ?? null,
          recordedByUserId: input.recordedByUserId,
        },
        include: {
          recordedBy: { select: { displayName: true } },
          operation: { select: { id: true, operationDate: true, status: true } },
        },
      });

      if (input.shortageSettlement && input.shortageSettlement.amount > 0) {
        await this.recordShortageSettlement(tx, {
          tenantId: input.tenantId,
          branchId: input.branchId,
          recordedByUserId: input.recordedByUserId,
          ...input.shortageSettlement,
        });
      }

      return payment;
    });
  }

  private async lockOpenCashDay(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      branchId: string | null;
      amount: number;
    },
  ) {
    if (!input.branchId) {
      throw new BadRequestException(
        'Assign this employee to a branch before paying salary. Salary is taken from that branch day’s cash.',
      );
    }

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
        'Open the branch day before paying salary. Salary is taken from that day’s cash, the same way expenses are.',
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

    const locked = await tx.branchDailyOperation.findUnique({
      where: { id: operation.id },
    });

    if (!locked || locked.status !== BranchOperationStatus.OPEN) {
      throw new BadRequestException(
        'Open the branch day before paying salary. Salary is taken from that day’s cash, the same way expenses are.',
      );
    }

    const remaining = await this.remainingTill(tx, locked);

    if (input.amount > remaining + 0.001) {
      throw new BadRequestException(
        `Salary exceeds remaining branch cash for ${this.formatDateLabel(operation.operationDate)}. Available: ${remaining}.`,
      );
    }

    return {
      operationId: operation.id,
      operationDate: operation.operationDate,
      remaining,
    };
  }

  private async remainingTill(
    db: Prisma.TransactionClient | PrismaService,
    operation: {
      id: string;
      tenantId: string;
      branchId: string;
      operationDate: Date;
      previousClosingBalance: Prisma.Decimal | number;
      cashAddedToday: Prisma.Decimal | number | null;
      openingFloatAvailable: Prisma.Decimal | number | null;
    },
  ) {
    const [floatAgg, expensesAgg, returnedAgg, salariesAgg] = await Promise.all(
      [
        db.agentDailyFloat.aggregate({
          where: {
            tenantId: operation.tenantId,
            branchId: operation.branchId,
            floatDate: operation.operationDate,
          },
          _sum: { amountGiven: true },
        }),
        db.branchOperationExpense.aggregate({
          where: {
            tenantId: operation.tenantId,
            operationId: operation.id,
            voidedAt: null,
            paidFrom: BranchOperationExpensePaidFrom.BRANCH_CASH,
          },
          _sum: { amount: true },
        }),
        db.agentDailyFloat.aggregate({
          where: {
            tenantId: operation.tenantId,
            branchId: operation.branchId,
            floatDate: operation.operationDate,
            amountReturned: { not: null },
          },
          _sum: { amountReturned: true },
        }),
        db.salaryPayment.aggregate({
          where: {
            tenantId: operation.tenantId,
            operationId: operation.id,
            reversedAt: null,
          },
          _sum: { amount: true },
        }),
      ],
    );

    const openingBalance = Number(operation.previousClosingBalance);
    const cashAddedToday = Number(operation.cashAddedToday ?? 0);
    const legacyAvailable = Number(operation.openingFloatAvailable ?? 0);
    const computedOpening =
      Math.round((openingBalance + cashAddedToday) * 100) / 100;
    const cashAvailableAtOpening =
      computedOpening > 0 || legacyAvailable === 0
        ? computedOpening
        : legacyAvailable;

    return (
      Math.round(
        (cashAvailableAtOpening -
          Number(floatAgg._sum.amountGiven ?? 0) -
          Number(expensesAgg._sum.amount ?? 0) -
          Number(salariesAgg._sum.amount ?? 0) +
          Number(returnedAgg._sum.amountReturned ?? 0)) *
          100,
      ) / 100
    );
  }

  private formatDateLabel(value: Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async recordShortageSettlement(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      branchId: string | null;
      responsibleUserId: string;
      amount: number;
      paidAt: Date;
      notes?: string | null;
      recordedByUserId: string;
    },
  ) {
    let remaining = Math.round(input.amount * 100) / 100;
    const shortages = await tx.cashShortage.findMany({
      where: {
        tenantId: input.tenantId,
        responsibleUserId: input.responsibleUserId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        status: {
          in: [CashShortageStatus.OPEN, CashShortageStatus.PARTIALLY_PAID],
        },
        amountOutstanding: { gt: 0 },
      },
      orderBy: [{ operationDate: 'asc' }, { createdAt: 'asc' }],
    });

    for (const shortage of shortages) {
      if (remaining <= 0) break;

      const outstanding = Number(shortage.amountOutstanding);
      const amount = Math.round(Math.min(remaining, outstanding) * 100) / 100;
      const nextOutstanding = Math.round((outstanding - amount) * 100) / 100;
      const status =
        nextOutstanding <= 0
          ? CashShortageStatus.CLEARED
          : CashShortageStatus.PARTIALLY_PAID;

      await tx.cashShortagePayment.create({
        data: {
          tenantId: input.tenantId,
          shortageId: shortage.id,
          amount: new Prisma.Decimal(amount),
          method: CashShortagePaymentMethod.SALARY_DEDUCTION,
          paidAt: input.paidAt,
          notes: input.notes?.trim() || null,
          recordedByUserId: input.recordedByUserId,
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

      remaining = Math.round((remaining - amount) * 100) / 100;
    }

    if (remaining > 0.001) {
      throw new BadRequestException(
        'Shortage settlement exceeds the employee outstanding shortage.',
      );
    }
  }

  listPaymentsForEmployee(input: {
    tenantId: string;
    employeeId: string;
    cycleStarts: Date[];
  }) {
    return this.prisma.salaryPayment.findMany({
      where: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        cycleStart: { in: input.cycleStarts },
      },
      orderBy: { paidAt: 'desc' },
      include: {
        recordedBy: { select: { displayName: true } },
        operation: { select: { id: true, operationDate: true, status: true } },
      },
    });
  }

  findPayment(input: {
    tenantId: string;
    branchId: string | null;
    paymentId: string;
  }) {
    return this.prisma.salaryPayment.findFirst({
      where: {
        id: input.paymentId,
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      include: {
        operation: { select: { id: true, operationDate: true, status: true } },
      },
    });
  }

  reversePayment(input: {
    tenantId: string;
    branchId: string | null;
    paymentId: string;
    reason?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.salaryPayment.findFirst({
        where: {
          id: input.paymentId,
          tenantId: input.tenantId,
          ...(input.branchId ? { branchId: input.branchId } : {}),
          reversedAt: null,
        },
        include: {
          operation: { select: { id: true, status: true } },
        },
      });

      if (!payment) {
        return { count: 0 };
      }

      if (!payment.operationId || !payment.operation) {
        throw new BadRequestException(
          'This salary payment was recorded before salaries were taken from the day’s cash. It cannot be reversed from here.',
        );
      }

      await tx.$queryRaw(
        Prisma.sql`
          SELECT id
          FROM branch_daily_operations
          WHERE id = ${payment.operationId}::uuid
          FOR UPDATE
        `,
      );

      const operation = await tx.branchDailyOperation.findUnique({
        where: { id: payment.operationId },
        select: { status: true },
      });

      if (!operation || operation.status !== BranchOperationStatus.OPEN) {
        throw new BadRequestException(
          'Salary payments can only be reversed while that branch day is still open. The amount stays in the day’s cash records.',
        );
      }

      return tx.salaryPayment.updateMany({
        where: {
          id: payment.id,
          tenantId: input.tenantId,
          reversedAt: null,
        },
        data: {
          reversedAt: new Date(),
          reversalReason: input.reason?.trim() || null,
        },
      });
    });
  }

  async peekOpenCashDay(input: { tenantId: string; branchId: string | null }) {
    if (!input.branchId) {
      return null;
    }

    const operation = await this.prisma.branchDailyOperation.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        status: BranchOperationStatus.OPEN,
      },
      orderBy: { operationDate: 'desc' },
    });

    if (!operation) {
      return null;
    }

    const remaining = await this.remainingTill(this.prisma, operation);
    return {
      operationDate: operation.operationDate,
      branchCashRemaining: remaining,
    };
  }

  async outstandingShortagesByUser(input: {
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
      _sum: {
        amountOutstanding: true,
      },
    });

    return new Map(
      rows.map((row) => [
        row.responsibleUserId,
        Number(row._sum.amountOutstanding ?? 0),
      ]),
    );
  }
}
