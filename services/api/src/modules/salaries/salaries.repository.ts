import { Injectable } from '@nestjs/common';
import {
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
  }) {
    return this.prisma.salaryPayment.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
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
      },
    });
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
    });
  }

  reversePayment(input: {
    tenantId: string;
    branchId: string | null;
    paymentId: string;
    reason?: string | null;
  }) {
    return this.prisma.salaryPayment.updateMany({
      where: {
        id: input.paymentId,
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        reversedAt: null,
      },
      data: {
        reversedAt: new Date(),
        reversalReason: input.reason?.trim() || null,
      },
    });
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
