import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { ObjectStorageService } from '../storage/object-storage.service';
import {
  AGENT_MANAGE_PERMISSIONS,
  AGENT_READ_PERMISSIONS,
} from './agents.permissions';
import type {
  AgentAccountabilityContract,
  AgentActivityResponse,
  AgentDailyFloatContract,
  AgentDetailContract,
  AgentListItemContract,
  AgentsListResponse,
} from './agents.contracts';
import { AgentsRepository } from './agents.repository';
import { RecordAgentFloatDto } from './dto/record-agent-float.dto';
import { UpdateAgentStatusDto } from './dto/update-agent-status.dto';
import { PrismaService } from '../../database/prisma.service';

const ACCOUNTABILITY_FORMULA =
  'Expected cash = float given − disbursed (new loans) + collected (repayments)';

@Injectable()
export class AgentsService {
  constructor(
    private readonly repository: AgentsRepository,
    private readonly prisma: PrismaService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  async listAgents(
    user: AuthenticatedUser,
    search?: string,
  ): Promise<AgentsListResponse> {
    this.assertCanRead(user);
    const scope = this.scope(user);
    const agents = await this.repository.listAgents({
      ...scope,
      search,
    });

    const { dayStart, dayEnd } = this.parseDayBounds();
    const agentIds = agents.map((agent) => agent.id);

    const [
      repaymentsToday,
      repaymentsLifetime,
      appsToday,
      appsLifetime,
      floatsToday,
    ] = await Promise.all([
      this.groupRepayments(scope.tenantId, agentIds, dayStart, dayEnd),
      this.groupRepayments(scope.tenantId, agentIds),
      this.groupApplications(scope.tenantId, agentIds, dayStart, dayEnd),
      this.groupApplications(scope.tenantId, agentIds),
      this.prisma.agentDailyFloat.findMany({
        where: {
          tenantId: scope.tenantId,
          agentId: { in: agentIds },
          floatDate: this.toDateOnly(dayStart),
        },
      }),
    ]);

    const floatByAgent = new Map(
      floatsToday.map((row) => [row.agentId, this.decimalToNumber(row.amountGiven)]),
    );

    const items: AgentListItemContract[] = await Promise.all(
      agents.map(async (agent) => {
        const todayRepay = repaymentsToday.get(agent.id) ?? {
          count: 0,
          amount: 0,
        };
        const lifeRepay = repaymentsLifetime.get(agent.id) ?? {
          count: 0,
          amount: 0,
        };
        const todayApp = appsToday.get(agent.id) ?? { count: 0, amount: 0 };
        const lifeApp = appsLifetime.get(agent.id) ?? { count: 0, amount: 0 };

        return {
          id: agent.id,
          publicId: agent.publicId ?? null,
          name: agent.displayName,
          email: agent.email,
          phone: agent.phone,
          status: agent.status,
          roleName: agent.roles[0]?.role.name ?? null,
          branchId: agent.branchId,
          branchName: agent.branch?.name ?? null,
          photoUrl: await this.presignPhotoUrl(agent.profilePhotoStorageKey),
          collectionsToday: todayRepay.count,
          collectionsLifetime: lifeRepay.count,
          applicationsToday: todayApp.count,
          applicationsLifetime: lifeApp.count,
          amountCollectedLifetime: lifeRepay.amount,
          amountDisbursedLifetime: lifeApp.amount,
          amountCollectedToday: todayRepay.amount,
          amountDisbursedToday: todayApp.amount,
          floatToday: floatByAgent.get(agent.id) ?? null,
        };
      }),
    );

    return {
      agents: items,
      counts: {
        total: items.length,
        active: items.filter((a) => a.status === 'ACTIVE').length,
        suspended: items.filter((a) => a.status === 'SUSPENDED').length,
        inactive: items.filter((a) => a.status === 'INACTIVE').length,
      },
    };
  }

  async getAgentDetail(
    user: AuthenticatedUser,
    agentId: string,
    date?: string,
  ): Promise<{ agent: AgentDetailContract }> {
    this.assertCanRead(user);
    const scope = this.scope(user);
    const agent = await this.repository.findAgentById({
      ...scope,
      agentId,
    });
    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }

    const { dayStart, dayEnd, dateLabel, floatDate } =
      this.parseDayBounds(date);

    const [
      repayToday,
      repayLife,
      appsToday,
      appsLife,
      floatRow,
    ] = await Promise.all([
      this.repository.sumRepayments({
        tenantId: scope.tenantId,
        agentId,
        from: dayStart,
        to: dayEnd,
      }),
      this.repository.sumRepayments({
        tenantId: scope.tenantId,
        agentId,
      }),
      this.repository.sumApplicationPrincipal({
        tenantId: scope.tenantId,
        agentId,
        from: dayStart,
        to: dayEnd,
      }),
      this.repository.sumApplicationPrincipal({
        tenantId: scope.tenantId,
        agentId,
      }),
      this.repository.findFloatForDay({
        tenantId: scope.tenantId,
        agentId,
        floatDate,
      }),
    ]);

    const amountGiven = this.decimalToNumber(floatRow?.amountGiven) ?? 0;
    const amountDisbursed =
      this.decimalToNumber(appsToday._sum.principalAmount) ?? 0;
    const amountCollected = this.decimalToNumber(repayToday._sum.amount) ?? 0;
    const expectedCash = this.roundMoney(
      amountGiven - amountDisbursed + amountCollected,
    );

    const accountability: AgentAccountabilityContract = {
      date: dateLabel,
      amountGiven,
      amountDisbursed,
      amountCollected,
      expectedCash,
      formula: ACCOUNTABILITY_FORMULA,
    };

    return {
      agent: {
        id: agent.id,
        publicId: agent.publicId ?? null,
        name: agent.displayName,
        email: agent.email,
        phone: agent.phone,
        status: agent.status,
        roleName: agent.roles[0]?.role.name ?? null,
        branchId: agent.branchId,
        branchName: agent.branch?.name ?? null,
        photoUrl: await this.presignPhotoUrl(agent.profilePhotoStorageKey),
        accountability,
        float: floatRow ? this.toFloatContract(floatRow) : null,
        collectionsToday: repayToday._count._all,
        collectionsLifetime: repayLife._count._all,
        applicationsToday: appsToday._count._all,
        applicationsLifetime: appsLife._count._all,
        amountCollectedLifetime:
          this.decimalToNumber(repayLife._sum.amount) ?? 0,
        amountDisbursedLifetime:
          this.decimalToNumber(appsLife._sum.principalAmount) ?? 0,
      },
    };
  }

  async getAgentActivity(
    user: AuthenticatedUser,
    agentId: string,
    options?: { date?: string; range?: string },
  ): Promise<AgentActivityResponse> {
    this.assertCanRead(user);
    const scope = this.scope(user);
    const agent = await this.repository.findAgentById({
      ...scope,
      agentId,
    });
    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }

    const range = this.normalizeRange(options?.range);
    const bounds = this.rangeBounds(range, options?.date);

    const [applications, repayments] = await Promise.all([
      this.repository.listApplications({
        tenantId: scope.tenantId,
        agentId,
        from: bounds.from,
        to: bounds.to,
      }),
      this.repository.listRepayments({
        tenantId: scope.tenantId,
        agentId,
        from: bounds.from,
        to: bounds.to,
      }),
    ]);

    return {
      date: bounds.dateLabel,
      range,
      applications: applications.map((app) => ({
        id: app.id,
        clientName:
          app.customer?.fullName ||
          [app.surname, app.givenNames].filter(Boolean).join(' ') ||
          'Client',
        phone: app.customer?.phone ?? app.phone,
        principalAmount: this.decimalToNumber(app.principalAmount) ?? 0,
        status: app.status,
        submittedAt: (app.submittedAt ?? app.createdAt).toISOString(),
        loanId: app.loanId ?? app.loan?.id ?? null,
      })),
      collections: repayments.map((row) => ({
        id: row.id,
        loanId: row.loanId,
        clientName: row.loan.customer.fullName,
        phone: row.loan.customer.phone,
        amount: this.decimalToNumber(row.amount) ?? 0,
        method: row.method,
        note: row.note,
        paidAt: row.paidAt.toISOString(),
      })),
    };
  }

  async updateAgentStatus(
    user: AuthenticatedUser,
    agentId: string,
    dto: UpdateAgentStatusDto,
  ) {
    this.assertCanManage(user);
    const scope = this.scope(user);
    const agent = await this.repository.findAgentById({
      ...scope,
      agentId,
    });
    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }

    if (agent.id === user.userId) {
      throw new BadRequestException('You cannot change your own status.');
    }

    const nextStatus = dto.status as UserStatus;
    await this.repository.updateAgentStatus({
      tenantId: scope.tenantId,
      agentId,
      status: nextStatus,
    });

    return this.getAgentDetail(user, agentId);
  }

  async recordFloat(
    user: AuthenticatedUser,
    agentId: string,
    dto: RecordAgentFloatDto,
  ): Promise<{ float: AgentDailyFloatContract; accountability: AgentAccountabilityContract }> {
    this.assertCanManage(user);
    const scope = this.scope(user);
    const agent = await this.repository.findAgentById({
      ...scope,
      agentId,
    });
    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }

    const { dayStart, dayEnd, dateLabel, floatDate } = this.parseDayBounds(
      dto.date,
    );
    const amount = new Prisma.Decimal(dto.amountGiven);
    const floatRow = await this.repository.upsertFloat({
      tenantId: scope.tenantId,
      branchId: agent.branchId,
      agentId,
      floatDate,
      amountGiven: amount,
      recordedByUserId: user.userId,
      notes: dto.notes?.trim() || null,
    });

    const [appsToday, repayToday] = await Promise.all([
      this.repository.sumApplicationPrincipal({
        tenantId: scope.tenantId,
        agentId,
        from: dayStart,
        to: dayEnd,
      }),
      this.repository.sumRepayments({
        tenantId: scope.tenantId,
        agentId,
        from: dayStart,
        to: dayEnd,
      }),
    ]);

    const amountGiven = this.decimalToNumber(amount) ?? 0;
    const amountDisbursed =
      this.decimalToNumber(appsToday._sum.principalAmount) ?? 0;
    const amountCollected = this.decimalToNumber(repayToday._sum.amount) ?? 0;

    return {
      float: this.toFloatContract(floatRow),
      accountability: {
        date: dateLabel,
        amountGiven,
        amountDisbursed,
        amountCollected,
        expectedCash: this.roundMoney(
          amountGiven - amountDisbursed + amountCollected,
        ),
        formula: ACCOUNTABILITY_FORMULA,
      },
    };
  }

  async listFloatsForDay(user: AuthenticatedUser, date?: string) {
    this.assertCanRead(user);
    const scope = this.scope(user);
    const { dateLabel, floatDate } = this.parseDayBounds(date);
    const rows = await this.repository.listFloatsForDay({
      ...scope,
      floatDate,
    });

    return {
      date: dateLabel,
      floats: rows.map((row) => ({
        ...this.toFloatContract(row),
        agentName: row.agent.displayName,
        agentPublicId: row.agent.publicId ?? null,
      })),
    };
  }

  private async groupRepayments(
    tenantId: string,
    agentIds: string[],
    from?: Date,
    to?: Date,
  ) {
    if (agentIds.length === 0) {
      return new Map<string, { count: number; amount: number }>();
    }

    const rows = await this.prisma.repayment.groupBy({
      by: ['recordedByUserId'],
      where: {
        tenantId,
        recordedByUserId: { in: agentIds },
        ...(from || to
          ? {
              paidAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    return new Map(
      rows.map((row) => [
        row.recordedByUserId,
        {
          count: row._count._all,
          amount: this.decimalToNumber(row._sum.amount) ?? 0,
        },
      ]),
    );
  }

  private async groupApplications(
    tenantId: string,
    agentIds: string[],
    from?: Date,
    to?: Date,
  ) {
    if (agentIds.length === 0) {
      return new Map<string, { count: number; amount: number }>();
    }

    const rows = await this.prisma.loanApplication.groupBy({
      by: ['officerUserId'],
      where: {
        tenantId,
        officerUserId: { in: agentIds },
        status: { not: 'DRAFT' },
        ...(from || to
          ? {
              submittedAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      _sum: { principalAmount: true },
      _count: { _all: true },
    });

    return new Map(
      rows.map((row) => [
        row.officerUserId,
        {
          count: row._count._all,
          amount: this.decimalToNumber(row._sum.principalAmount) ?? 0,
        },
      ]),
    );
  }

  private toFloatContract(row: {
    id: string;
    agentId: string;
    floatDate: Date;
    amountGiven: Prisma.Decimal;
    notes: string | null;
    recordedBy: { displayName: string };
    createdAt: Date;
  }): AgentDailyFloatContract {
    return {
      id: row.id,
      agentId: row.agentId,
      floatDate: this.formatDateLabel(row.floatDate),
      amountGiven: this.decimalToNumber(row.amountGiven) ?? 0,
      notes: row.notes,
      recordedByName: row.recordedBy.displayName,
      recordedAt: row.createdAt.toISOString(),
    };
  }

  private scope(user: AuthenticatedUser) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Tenant scope is required.');
    }
    const canAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );
    return {
      tenantId: user.tenantId,
      branchId: canAllBranches ? null : user.branchId,
    };
  }

  private assertCanRead(user: AuthenticatedUser) {
    this.assertBranchAccess(user);
    const allowed = AGENT_READ_PERMISSIONS.some((key) =>
      user.permissions.includes(key),
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Missing permission to view agents.',
      );
    }
  }

  private assertCanManage(user: AuthenticatedUser) {
    this.assertBranchAccess(user);
    const allowed = AGENT_MANAGE_PERMISSIONS.some((key) =>
      user.permissions.includes(key),
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Missing permission to manage agents.',
      );
    }
  }

  private assertBranchAccess(user: AuthenticatedUser) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Tenant scope is required.');
    }
    const canAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );
    if (!canAllBranches && !user.branchId) {
      throw new ForbiddenException('Branch scope is required.');
    }
  }

  private parseDayBounds(date?: string) {
    const base = date?.trim()
      ? this.parseDateInput(date.trim())
      : new Date();
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
      floatDate: this.toDateOnly(dayStart),
    };
  }

  private rangeBounds(range: 'today' | 'week' | 'all', date?: string) {
    if (range === 'all') {
      const { dateLabel } = this.parseDayBounds(date);
      return { from: undefined, to: undefined, dateLabel };
    }
    if (range === 'week') {
      const { dayEnd, dateLabel } = this.parseDayBounds(date);
      const from = new Date(dayEnd);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      return { from, to: dayEnd, dateLabel };
    }
    const { dayStart, dayEnd, dateLabel } = this.parseDayBounds(date);
    return { from: dayStart, to: dayEnd, dateLabel };
  }

  private normalizeRange(range?: string): 'today' | 'week' | 'all' {
    if (range === 'week' || range === 'all') return range;
    return 'today';
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
      Date.UTC(
        dayStart.getFullYear(),
        dayStart.getMonth(),
        dayStart.getDate(),
      ),
    );
  }

  private formatDateLabel(value: Date) {
    // Prisma @db.Date values arrive as UTC midnight — prefer UTC parts then.
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
    if (value == null) return null;
    if (typeof value === 'number') return value;
    return Number(value.toString());
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }

  private async presignPhotoUrl(storageKey: string | null | undefined) {
    if (!storageKey) return null;
    try {
      const signed = await this.objectStorage.presignGet({ storageKey });
      return signed.downloadUrl;
    } catch {
      return null;
    }
  }
}
