import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { isPrismaUniqueConstraintError } from '../../common/database/prisma-errors';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { ObjectStorageService } from '../storage/object-storage.service';
import { OperationsService } from '../operations/operations.service';
import {
  AGENT_MANAGE_PERMISSIONS,
  AGENT_READ_PERMISSIONS,
} from './agents.permissions';
import type {
  AgentAccessHistoryContract,
  AgentAccountResponse,
  AgentAccountabilityContract,
  AgentActivityResponse,
  AgentDailyFloatContract,
  AgentDetailContract,
  AgentDeviceContract,
  AgentListItemContract,
  AgentOtherActivityContract,
  AgentsListResponse,
} from './agents.contracts';
import { AgentsRepository } from './agents.repository';
import { RecordAgentFloatDto } from './dto/record-agent-float.dto';
import { UpdateAgentProfileDto } from './dto/update-agent-profile.dto';
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
    private readonly operationsService: OperationsService,
  ) {}

  async listAgents(
    user: AuthenticatedUser,
    search?: string,
    date?: string,
    purpose?: string,
  ): Promise<AgentsListResponse> {
    this.assertCanRead(user);
    const scope = this.scope(user);
    const includeFloatRecipients = purpose === 'float';
    const agents = await this.repository.listAgents({
      ...scope,
      search,
      includeFloatRecipients,
    });

    const { dayStart, dayEnd, floatDate } = this.parseDayBounds(date);
    const agentIds = agents.map((agent) => agent.id);

    const [
      repaymentsToday,
      repaymentsLifetime,
      appsToday,
      appsLifetime,
      floatsToday,
      lastActiveByAgent,
    ] = await Promise.all([
      this.groupRepayments(scope.tenantId, agentIds, dayStart, dayEnd),
      this.groupRepayments(scope.tenantId, agentIds),
      this.groupApplications(scope.tenantId, agentIds, dayStart, dayEnd),
      this.groupApplications(scope.tenantId, agentIds),
      this.prisma.agentDailyFloat.findMany({
        where: {
          tenantId: scope.tenantId,
          agentId: { in: agentIds },
          floatDate,
        },
      }),
      this.latestActivityByAgent(scope.tenantId, agentIds),
    ]);

    const floatByAgent = new Map(
      floatsToday.map((row) => [
        row.agentId,
        this.decimalToNumber(row.amountGiven),
      ]),
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
        const lastActiveAt = lastActiveByAgent.get(agent.id) ?? null;

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
          createdAt: agent.createdAt.toISOString(),
          lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
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
      latestSession,
      lastActiveMap,
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
      this.repository.findLatestSession({
        tenantId: scope.tenantId,
        userId: agentId,
      }),
      this.latestActivityByAgent(scope.tenantId, [agentId]),
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

    const lastActiveAt = lastActiveMap.get(agentId) ?? null;

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
        createdAt: agent.createdAt.toISOString(),
        lastSignInAt: latestSession?.lastSeenAt.toISOString() ?? null,
        lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
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

  async getAgentAccount(
    user: AuthenticatedUser,
    agentId: string,
  ): Promise<AgentAccountResponse> {
    this.assertCanRead(user);
    const scope = this.scope(user);
    const agent = await this.repository.findAgentById({
      ...scope,
      agentId,
      includeFloatRecipients: true,
    });
    if (!agent) {
      throw new NotFoundException('Staff member not found.');
    }

    const [sessions, allSessions, audits] = await Promise.all([
      this.repository.listActiveSessions({
        tenantId: scope.tenantId,
        userId: agentId,
      }),
      this.repository.listAllSessions({
        tenantId: scope.tenantId,
        userId: agentId,
      }),
      this.repository.listAgentAccessAudits({
        tenantId: scope.tenantId,
        agentId,
      }),
    ]);

    const canManage = AGENT_MANAGE_PERMISSIONS.some((key) =>
      user.permissions.includes(key),
    );
    const currentSessionId = sessions[0]?.id ?? null;
    const devices: AgentDeviceContract[] = sessions.map((session) => {
      const isCurrent = session.id === currentSessionId;
      return {
        id: session.id,
        deviceName: session.deviceName || 'Unknown device',
        deviceType:
          session.deviceType ||
          (session.platform === 'WEB'
            ? 'Web App'
            : session.platform === 'IOS'
              ? 'Mobile App (iOS)'
              : session.platform === 'ANDROID'
                ? 'Mobile App (Android)'
                : 'App'),
        platform: session.platform,
        lastUsedAt: session.lastSeenAt.toISOString(),
        status: isCurrent ? 'CURRENT' : 'ACTIVE',
        // Match design: current device has no Remove action.
        canRemove: canManage && !isCurrent,
      };
    });

    const accessHistory = this.buildAccessHistory({
      agentCreatedAt: agent.createdAt,
      firstSessionAt: allSessions[0]?.createdAt ?? null,
      audits,
    });

    return { devices, accessHistory };
  }

  async revokeAgentSession(
    user: AuthenticatedUser,
    agentId: string,
    sessionId: string,
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

    const session = await this.repository.findSessionById({
      tenantId: scope.tenantId,
      userId: agentId,
      sessionId,
    });
    if (!session || session.revokedAt) {
      throw new NotFoundException('Device session not found.');
    }

    await this.repository.revokeSession({
      sessionId,
      revokedByUserId: user.userId,
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: scope.tenantId,
        actorUserId: user.userId,
        action: 'agent.session.revoke',
        entityType: 'User',
        entityId: agentId,
        newValue: {
          sessionId,
          deviceName: session.deviceName,
          deviceType: session.deviceType,
        },
        device: session.deviceName,
      },
    });

    return this.getAgentAccount(user, agentId);
  }

  async revokeAllAgentSessions(user: AuthenticatedUser, agentId: string) {
    this.assertCanManage(user);
    const scope = this.scope(user);
    const agent = await this.repository.findAgentById({
      ...scope,
      agentId,
    });
    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }

    const result = await this.repository.revokeAllSessions({
      tenantId: scope.tenantId,
      userId: agentId,
      revokedByUserId: user.userId,
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: scope.tenantId,
        actorUserId: user.userId,
        action: 'agent.session.revoke_all',
        entityType: 'User',
        entityId: agentId,
        newValue: { revokedCount: result.count },
      },
    });

    return this.getAgentAccount(user, agentId);
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

    const [applications, repayments, floats, statusAudits] = await Promise.all([
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
      this.repository.listFloatsForAgent({
        tenantId: scope.tenantId,
        agentId,
        from: bounds.from,
        to: bounds.to,
      }),
      this.repository.listAgentStatusAudits({
        tenantId: scope.tenantId,
        agentId,
        from: bounds.from,
        to: bounds.to,
      }),
    ]);

    const otherActivity = this.buildOtherActivity(
      floats,
      statusAudits,
      bounds.from,
      bounds.to,
    );

    return {
      date: bounds.dateLabel,
      range,
      applications: applications.map((app) => ({
        id: app.id,
        customerId: app.customerId ?? app.customer?.id ?? null,
        clientName:
          app.customer?.fullName ||
          [app.surname, app.givenNames].filter(Boolean).join(' ') ||
          'Client',
        phone: app.customer?.phone ?? app.phone,
        principalAmount: this.decimalToNumber(app.principalAmount) ?? 0,
        status: app.loan?.status ?? app.status,
        submittedAt: (
          app.loan?.disbursedAt ??
          app.submittedAt ??
          app.createdAt
        ).toISOString(),
        loanId: app.loanId ?? app.loan?.id ?? null,
      })),
      collections: repayments.map((row) => ({
        id: row.id,
        loanId: row.loanId,
        customerId: row.loan.customer.id,
        clientName: row.loan.customer.fullName,
        phone: row.loan.customer.phone,
        amount: this.decimalToNumber(row.amount) ?? 0,
        method: row.method,
        note: row.note,
        paidAt: row.paidAt.toISOString(),
      })),
      otherActivity,
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
    if (nextStatus === 'SUSPENDED' && !dto.reason?.trim()) {
      throw new BadRequestException('Select a reason for suspension.');
    }

    const suspensionReason =
      nextStatus === 'SUSPENDED' ? dto.reason?.trim() || null : null;

    await this.repository.updateAgentStatus({
      tenantId: scope.tenantId,
      agentId,
      status: nextStatus,
      suspensionReason,
    });

    if (nextStatus === 'SUSPENDED') {
      await this.repository.revokeAllSessions({
        tenantId: scope.tenantId,
        userId: agentId,
        revokedByUserId: user.userId,
      });
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: scope.tenantId,
        actorUserId: user.userId,
        action:
          nextStatus === 'SUSPENDED'
            ? 'agent.suspend'
            : nextStatus === 'ACTIVE'
              ? 'agent.activate'
              : 'agent.status_update',
        entityType: 'User',
        entityId: agentId,
        oldValue: { status: agent.status },
        newValue: {
          status: nextStatus,
          reason: suspensionReason,
        },
      },
    });

    return this.getAgentDetail(user, agentId);
  }

  async updateAgentProfile(
    user: AuthenticatedUser,
    agentId: string,
    dto: UpdateAgentProfileDto,
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

    const displayName = dto.displayName?.trim();
    const email = dto.email?.trim().toLowerCase();
    const phone = dto.phone?.trim();

    if (!displayName && !email && dto.phone === undefined) {
      throw new BadRequestException('Update at least one profile field.');
    }

    try {
      await this.repository.updateAgentProfile({
        tenantId: scope.tenantId,
        agentId,
        ...(displayName ? { displayName } : {}),
        ...(email ? { email } : {}),
        ...(dto.phone !== undefined ? { phone: phone || null } : {}),
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new BadRequestException(
          'Another user already uses that email or phone number.',
        );
      }
      throw error;
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: scope.tenantId,
        actorUserId: user.userId,
        action: 'agent.profile_update',
        entityType: 'User',
        entityId: agentId,
        oldValue: {
          displayName: agent.displayName,
          email: agent.email,
          phone: agent.phone,
        },
        newValue: {
          ...(displayName ? { displayName } : {}),
          ...(email ? { email } : {}),
          ...(dto.phone !== undefined ? { phone: phone || null } : {}),
        },
      },
    });

    return this.getAgentDetail(user, agentId);
  }

  async recordFloat(
    user: AuthenticatedUser,
    agentId: string,
    dto: RecordAgentFloatDto,
  ): Promise<{
    float: AgentDailyFloatContract;
    accountability: AgentAccountabilityContract;
  }> {
    this.assertCanManage(user);
    const scope = this.scope(user);
    const agent = await this.repository.findAgentById({
      ...scope,
      agentId,
      includeFloatRecipients: true,
    });
    if (!agent) {
      throw new NotFoundException('Staff member not found.');
    }
    if (!user.permissions.includes('operation.float.manage')) {
      throw new ForbiddenException('Missing permission to assign float.');
    }
    if (user.permissions.includes(BRANCH_PERMISSIONS.create)) {
      throw new ForbiddenException(
        'Branch float is handled by branch managers.',
      );
    }

    const { dayStart, dayEnd, dateLabel, floatDate } = this.parseDayBounds(
      dto.date,
    );
    const amount = new Prisma.Decimal(dto.amountGiven);
    await this.operationsService.assertFloatCanBeAssigned({
      tenantId: scope.tenantId,
      branchId: agent.branchId,
      agentId,
      amountGiven: this.decimalToNumber(amount) ?? 0,
      date: dateLabel,
    });
    const floatRow = await this.repository
      .createFloat({
        tenantId: scope.tenantId,
        branchId: agent.branchId,
        agentId,
        floatDate,
        amountGiven: amount,
        recordedByUserId: user.userId,
        notes: dto.notes?.trim() || null,
      })
      .catch((error: unknown) => {
        if (isPrismaUniqueConstraintError(error)) {
          throw new BadRequestException(
            'This staff member already has float for this day.',
          );
        }
        throw error;
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

    if (agent.branchId) {
      this.operationsService.broadcastFloatUpdated({
        tenantId: scope.tenantId,
        branchId: agent.branchId,
        agentId,
        floatId: floatRow.id,
        operationDate: dateLabel,
        amountGiven,
      });
    }

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

  async topUpFloat(
    user: AuthenticatedUser,
    agentId: string,
    dto: RecordAgentFloatDto,
  ): Promise<{
    float: AgentDailyFloatContract;
    accountability: AgentAccountabilityContract;
  }> {
    this.assertCanManage(user);
    const scope = this.scope(user);
    const agent = await this.repository.findAgentById({
      ...scope,
      agentId,
      includeFloatRecipients: true,
    });
    if (!agent) {
      throw new NotFoundException('Staff member not found.');
    }
    if (!user.permissions.includes('operation.float.manage')) {
      throw new ForbiddenException('Missing permission to assign float.');
    }
    if (user.permissions.includes(BRANCH_PERMISSIONS.create)) {
      throw new ForbiddenException(
        'Branch float is handled by branch managers.',
      );
    }

    const { dayStart, dayEnd, dateLabel, floatDate } = this.parseDayBounds(
      dto.date,
    );
    const amount = new Prisma.Decimal(dto.amountGiven);
    await this.operationsService.assertFloatCanBeAssigned({
      tenantId: scope.tenantId,
      branchId: agent.branchId,
      agentId,
      amountGiven: this.decimalToNumber(amount) ?? 0,
      date: dateLabel,
      mode: 'additional',
    });
    const floatRow = await this.repository.increaseFloat({
      tenantId: scope.tenantId,
      agentId,
      floatDate,
      amountGiven: amount,
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

    const amountGiven = this.decimalToNumber(floatRow.amountGiven) ?? 0;
    const amountDisbursed =
      this.decimalToNumber(appsToday._sum.principalAmount) ?? 0;
    const amountCollected = this.decimalToNumber(repayToday._sum.amount) ?? 0;

    if (agent.branchId) {
      this.operationsService.broadcastFloatUpdated({
        tenantId: scope.tenantId,
        branchId: agent.branchId,
        agentId,
        floatId: floatRow.id,
        operationDate: dateLabel,
        amountGiven,
      });
    }

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

  /** Latest repayment collection or loan application (submitted) per agent. */
  private async latestActivityByAgent(
    tenantId: string,
    agentIds: string[],
  ): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    if (agentIds.length === 0) return result;

    const [repaymentRows, applicationRows] = await Promise.all([
      this.prisma.repayment.groupBy({
        by: ['recordedByUserId'],
        where: {
          tenantId,
          recordedByUserId: { in: agentIds },
        },
        _max: { paidAt: true },
      }),
      this.prisma.loanApplication.groupBy({
        by: ['officerUserId'],
        where: {
          tenantId,
          officerUserId: { in: agentIds },
          submittedAt: { not: null },
        },
        _max: { submittedAt: true },
      }),
    ]);

    const consider = (agentId: string, at: Date | null | undefined) => {
      if (!at) return;
      const current = result.get(agentId);
      if (!current || at > current) {
        result.set(agentId, at);
      }
    };

    for (const row of repaymentRows) {
      consider(row.recordedByUserId, row._max.paidAt);
    }

    for (const row of applicationRows) {
      consider(row.officerUserId, row._max.submittedAt);
    }

    return result;
  }

  private buildOtherActivity(
    floats: Array<{
      id: string;
      amountGiven: Prisma.Decimal;
      amountReturned: Prisma.Decimal | null;
      createdAt: Date;
      returnedAt: Date | null;
      recordedBy: { displayName: string };
    }>,
    statusAudits: Array<{
      id: string;
      action: string;
      newValue: unknown;
      createdAt: Date;
    }>,
    from?: Date,
    to?: Date,
  ): AgentOtherActivityContract[] {
    const inRange = (at: Date) => {
      if (from && at < from) return false;
      if (to && at > to) return false;
      return true;
    };

    const items: AgentOtherActivityContract[] = [];

    for (const float of floats) {
      if (inRange(float.createdAt)) {
        const amount = this.decimalToNumber(float.amountGiven) ?? 0;
        items.push({
          id: `float-received-${float.id}`,
          type: 'FLOAT_RECEIVED',
          title: 'Float received',
          detail: `UGX ${Math.round(amount).toLocaleString('en-UG')} issued by ${float.recordedBy.displayName}`,
          occurredAt: float.createdAt.toISOString(),
        });
      }

      if (float.returnedAt && inRange(float.returnedAt)) {
        const returned = this.decimalToNumber(float.amountReturned);
        items.push({
          id: `reconciliation-${float.id}`,
          type: 'RECONCILIATION_COMPLETED',
          title: 'Reconciliation completed',
          detail:
            returned != null
              ? `UGX ${Math.round(returned).toLocaleString('en-UG')} returned and confirmed`
              : 'No cash difference recorded',
          occurredAt: float.returnedAt.toISOString(),
        });
      }
    }

    for (const audit of statusAudits) {
      const reason = this.readAuditReason(audit.newValue);
      if (audit.action === 'agent.suspend') {
        items.push({
          id: `suspend-${audit.id}`,
          type: 'ACCOUNT_SUSPENDED',
          title: 'Account suspended',
          detail: reason ? `Reason: ${reason}` : 'Account suspended by manager',
          occurredAt: audit.createdAt.toISOString(),
        });
      } else if (audit.action === 'agent.activate') {
        items.push({
          id: `activate-${audit.id}`,
          type: 'ACCOUNT_ACTIVATED',
          title: 'Account activated',
          detail: 'Account reactivated by manager',
          occurredAt: audit.createdAt.toISOString(),
        });
      }
    }

    return items.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  }

  private readAuditReason(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const reason = (value as { reason?: unknown }).reason;
    return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
  }

  private buildAccessHistory(input: {
    agentCreatedAt: Date;
    firstSessionAt: Date | null;
    audits: Array<{
      id: string;
      action: string;
      newValue: unknown;
      createdAt: Date;
      actor: { displayName: string } | null;
    }>;
  }): AgentAccessHistoryContract[] {
    const items: AgentAccessHistoryContract[] = [];

    const invite = input.audits.find(
      (audit) => audit.action === 'branch.staff.invite',
    );
    items.push({
      id: invite ? `created-${invite.id}` : 'account-created',
      type: 'ACCOUNT_CREATED',
      title: 'Account created',
      detail: 'Account was created for the agent.',
      occurredAt: (invite?.createdAt ?? input.agentCreatedAt).toISOString(),
      actorName: invite?.actor?.displayName || 'System',
    });

    if (input.firstSessionAt) {
      items.push({
        id: 'first-sign-in',
        type: 'FIRST_SIGN_IN',
        title: 'First sign-in',
        detail: 'Agent signed in for the first time.',
        occurredAt: input.firstSessionAt.toISOString(),
        actorName: 'System',
      });
    }

    for (const audit of input.audits) {
      const actorName = audit.actor?.displayName || 'System';
      if (audit.action === 'agent.suspend') {
        const reason = this.readAuditReason(audit.newValue);
        items.push({
          id: `suspend-${audit.id}`,
          type: 'ACCOUNT_SUSPENDED',
          title: 'Account suspended',
          detail: reason ? `Reason: ${reason}` : 'Account was suspended.',
          occurredAt: audit.createdAt.toISOString(),
          actorName,
        });
      } else if (audit.action === 'agent.activate') {
        items.push({
          id: `activate-${audit.id}`,
          type: 'ACCOUNT_REACTIVATED',
          title: 'Account reactivated',
          detail: 'Account was reactivated.',
          occurredAt: audit.createdAt.toISOString(),
          actorName,
        });
      } else if (audit.action === 'user.password_reset') {
        items.push({
          id: `password-${audit.id}`,
          type: 'PASSWORD_RESET',
          title: 'Password reset',
          detail: 'Password was reset by branch manager.',
          occurredAt: audit.createdAt.toISOString(),
          actorName,
        });
      } else if (audit.action === 'agent.session.revoke_all') {
        items.push({
          id: `revoke-all-${audit.id}`,
          type: 'DEVICES_SIGNED_OUT',
          title: 'Devices signed out',
          detail: 'All devices were signed out.',
          occurredAt: audit.createdAt.toISOString(),
          actorName,
        });
      }
    }

    return items.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
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
    const canAllBranches = user.permissions.includes(BRANCH_PERMISSIONS.create);
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
      throw new ForbiddenException('Missing permission to view agents.');
    }
  }

  private assertCanManage(user: AuthenticatedUser) {
    this.assertBranchAccess(user);
    const allowed = AGENT_MANAGE_PERMISSIONS.some((key) =>
      user.permissions.includes(key),
    );
    if (!allowed) {
      throw new ForbiddenException('Missing permission to manage agents.');
    }
  }

  private assertBranchAccess(user: AuthenticatedUser) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Tenant scope is required.');
    }
    const canAllBranches = user.permissions.includes(BRANCH_PERMISSIONS.create);
    if (!canAllBranches && !user.branchId) {
      throw new ForbiddenException('Branch scope is required.');
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
      Date.UTC(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate()),
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
