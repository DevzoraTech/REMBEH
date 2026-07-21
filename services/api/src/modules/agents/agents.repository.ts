import { Injectable } from '@nestjs/common';
import {
  LoanApplicationStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const FIELD_AGENT_ROLES = [
  'Agent',
  'Loan Officer',
  'Supervisor',
  'Recovery Officer',
] as const;

@Injectable()
export class AgentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listAgents(input: {
    tenantId: string;
    branchId: string | null;
    search?: string;
  }) {
    const search = input.search?.trim();
    const orFilters: Prisma.UserWhereInput[] | undefined = search
      ? [
          { displayName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { publicId: { contains: search, mode: 'insensitive' } },
        ]
      : undefined;

    return this.prisma.user.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        roles: {
          some: {
            role: {
              name: { in: [...FIELD_AGENT_ROLES] },
            },
          },
        },
        ...(orFilters ? { OR: orFilters } : {}),
      },
      include: {
        roles: { include: { role: true } },
        branch: true,
      },
      orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
    });
  }

  findAgentById(input: {
    tenantId: string;
    branchId: string | null;
    agentId: string;
  }) {
    return this.prisma.user.findFirst({
      where: {
        id: input.agentId,
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        roles: {
          some: {
            role: {
              name: { in: [...FIELD_AGENT_ROLES] },
            },
          },
        },
      },
      include: {
        roles: { include: { role: true } },
        branch: true,
        tenant: true,
      },
    });
  }

  updateAgentStatus(input: {
    tenantId: string;
    agentId: string;
    status: UserStatus;
  }) {
    return this.prisma.user.updateMany({
      where: {
        id: input.agentId,
        tenantId: input.tenantId,
      },
      data: { status: input.status },
    });
  }

  countRepayments(input: {
    tenantId: string;
    agentId: string;
    from?: Date;
    to?: Date;
  }) {
    return this.prisma.repayment.count({
      where: {
        tenantId: input.tenantId,
        recordedByUserId: input.agentId,
        ...(input.from || input.to
          ? {
              paidAt: {
                ...(input.from ? { gte: input.from } : {}),
                ...(input.to ? { lte: input.to } : {}),
              },
            }
          : {}),
      },
    });
  }

  sumRepayments(input: {
    tenantId: string;
    agentId: string;
    from?: Date;
    to?: Date;
  }) {
    return this.prisma.repayment.aggregate({
      where: {
        tenantId: input.tenantId,
        recordedByUserId: input.agentId,
        ...(input.from || input.to
          ? {
              paidAt: {
                ...(input.from ? { gte: input.from } : {}),
                ...(input.to ? { lte: input.to } : {}),
              },
            }
          : {}),
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
  }

  countApplications(input: {
    tenantId: string;
    agentId: string;
    from?: Date;
    to?: Date;
  }) {
    return this.prisma.loanApplication.count({
      where: {
        tenantId: input.tenantId,
        officerUserId: input.agentId,
        status: { not: LoanApplicationStatus.DRAFT },
        ...(input.from || input.to
          ? {
              submittedAt: {
                ...(input.from ? { gte: input.from } : {}),
                ...(input.to ? { lte: input.to } : {}),
              },
            }
          : {}),
      },
    });
  }

  sumApplicationPrincipal(input: {
    tenantId: string;
    agentId: string;
    from?: Date;
    to?: Date;
  }) {
    return this.prisma.loanApplication.aggregate({
      where: {
        tenantId: input.tenantId,
        officerUserId: input.agentId,
        status: { not: LoanApplicationStatus.DRAFT },
        ...(input.from || input.to
          ? {
              submittedAt: {
                ...(input.from ? { gte: input.from } : {}),
                ...(input.to ? { lte: input.to } : {}),
              },
            }
          : {}),
      },
      _sum: { principalAmount: true },
      _count: { _all: true },
    });
  }

  listApplications(input: {
    tenantId: string;
    agentId: string;
    from?: Date;
    to?: Date;
    take?: number;
  }) {
    return this.prisma.loanApplication.findMany({
      where: {
        tenantId: input.tenantId,
        officerUserId: input.agentId,
        status: { not: LoanApplicationStatus.DRAFT },
        ...(input.from || input.to
          ? {
              submittedAt: {
                ...(input.from ? { gte: input.from } : {}),
                ...(input.to ? { lte: input.to } : {}),
              },
            }
          : {}),
      },
      include: {
        customer: true,
        loan: true,
      },
      orderBy: { submittedAt: 'desc' },
      take: input.take ?? 200,
    });
  }

  listRepayments(input: {
    tenantId: string;
    agentId: string;
    from?: Date;
    to?: Date;
    take?: number;
  }) {
    return this.prisma.repayment.findMany({
      where: {
        tenantId: input.tenantId,
        recordedByUserId: input.agentId,
        ...(input.from || input.to
          ? {
              paidAt: {
                ...(input.from ? { gte: input.from } : {}),
                ...(input.to ? { lte: input.to } : {}),
              },
            }
          : {}),
      },
      include: {
        loan: {
          include: {
            customer: true,
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      take: input.take ?? 200,
    });
  }

  findFloatForDay(input: {
    tenantId: string;
    agentId: string;
    floatDate: Date;
  }) {
    return this.prisma.agentDailyFloat.findUnique({
      where: {
        tenantId_agentId_floatDate: {
          tenantId: input.tenantId,
          agentId: input.agentId,
          floatDate: input.floatDate,
        },
      },
      include: {
        recordedBy: true,
      },
    });
  }

  upsertFloat(input: {
    tenantId: string;
    branchId: string | null;
    agentId: string;
    floatDate: Date;
    amountGiven: Prisma.Decimal;
    recordedByUserId: string;
    notes: string | null;
  }) {
    return this.prisma.agentDailyFloat.upsert({
      where: {
        tenantId_agentId_floatDate: {
          tenantId: input.tenantId,
          agentId: input.agentId,
          floatDate: input.floatDate,
        },
      },
      create: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        agentId: input.agentId,
        floatDate: input.floatDate,
        amountGiven: input.amountGiven,
        recordedByUserId: input.recordedByUserId,
        notes: input.notes,
      },
      update: {
        amountGiven: input.amountGiven,
        notes: input.notes,
        recordedByUserId: input.recordedByUserId,
        branchId: input.branchId,
      },
      include: {
        recordedBy: true,
      },
    });
  }

  listFloatsForDay(input: {
    tenantId: string;
    branchId: string | null;
    floatDate: Date;
  }) {
    return this.prisma.agentDailyFloat.findMany({
      where: {
        tenantId: input.tenantId,
        floatDate: input.floatDate,
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      include: {
        agent: true,
        recordedBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
