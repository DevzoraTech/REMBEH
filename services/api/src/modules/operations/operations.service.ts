import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  BranchOperationReportStatus,
  BranchOperationStatus,
  CashShortageSource,
  LoanApplicationStatus,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import {
  getPrismaUniqueConstraintTargets,
  isPrismaUniqueConstraintError,
} from '../../common/database/prisma-errors';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { BillingService } from '../billing/billing.service';
import { CashShortagesService } from '../cash-shortages/cash-shortages.service';
import { CloseBranchOperationDto } from './dto/close-branch-operation.dto';
import { OpenBranchOperationDto } from './dto/open-branch-operation.dto';
import { RecordAgentReturnDto } from './dto/record-agent-return.dto';
import { RecordOperationExpenseDto } from './dto/record-operation-expense.dto';
import { RecordOperationTopUpDto } from './dto/record-operation-top-up.dto';
import { ReviewOperationReportDto } from './dto/review-operation-report.dto';
import {
  AgentDailyOperationResponseContract,
  DailyOperationAgentReturnContract,
  DailyOperationCarryoverContract,
  DailyOperationContract,
  DailyOperationReportContract,
  DailyOperationResponseContract,
  OwnerBranchDailyStatusResponseContract,
  OwnerOperationReportDetailResponseContract,
  OwnerOperationReportListItemContract,
  OwnerOperationReportListResponseContract,
} from './operations.contracts';
import { OPERATIONS_EVENTS } from './operations.events';
import { OPERATIONS_PERMISSIONS } from './operations.permissions';
import { OperationsRepository } from './operations.repository';
import { RealtimeGateway } from '../realtime/realtime.gateway';

type OperationReportRecord = {
  id: string;
  operationId: string;
  reportNumber: string;
  operationDate: Date;
  status: BranchOperationReportStatus;
  snapshot: Prisma.JsonValue;
  generatedAt: Date;
  managerReviewedAt: Date | null;
  managerReviewedBy: { displayName: string } | null;
  managerNotes: string | null;
  ownerApprovedAt: Date | null;
  ownerApprovedBy: { displayName: string } | null;
  ownerNotes: string | null;
  returnedAt: Date | null;
  returnedBy: { displayName: string } | null;
  returnNotes: string | null;
};

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);
  private readonly businessUtcOffsetMinutes = 180;
  /** Agents may use full app from 06:00 Africa/Kampala after the day is open. */
  private readonly agentOpenHourLocal = 6;

  constructor(
    private readonly repository: OperationsRepository,
    private readonly realtime: RealtimeGateway,
    private readonly billingService: BillingService,
    private readonly prisma: PrismaService,
    private readonly cashShortagesService: CashShortagesService,
  ) {}

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
        openingBalance: null,
        openingBalanceSource: 'MANUAL',
        previousClosedOperation: null,
        pendingClosureOperation: null,
        awaitingReportOperation: null,
        operation: null,
        report: null,
      };
    }

    if (this.isAutoOpenableDate(bounds.dateLabel)) {
      await this.retireEmptyUnclosedOperationsBefore({
        tenantId: user.tenantId,
        branchId: branch.id,
        beforeDate: bounds.dateOnly,
      });
    }

    let operation = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });

    // Days open themselves — no manual open step.
    if (!operation && this.isAutoOpenableDate(bounds.dateLabel)) {
      await this.autoOpenBranchIfEligible({
        tenantId: user.tenantId,
        branchId: branch.id,
        branchName: branch.name,
        bounds,
        openedByUserId: user.userId,
        allowFirstDay: true,
      });
      operation = await this.repository.findOperationForDay({
        tenantId: user.tenantId,
        branchId: branch.id,
        operationDate: bounds.dateOnly,
      });
    }

    const [previousClosed, pendingClosure] = await Promise.all([
      this.repository.findLatestClosedBefore({
        tenantId: user.tenantId,
        branchId: branch.id,
        beforeDate: bounds.dateOnly,
      }),
      this.repository.findOldestUnclosedBefore({
        tenantId: user.tenantId,
        branchId: branch.id,
        beforeDate: bounds.dateOnly,
      }),
    ]);
    const openingBalance = previousClosed
      ? this.decimalToNumber(previousClosed.closingBalance)
      : operation
        ? this.decimalToNumber(operation.previousClosingBalance)
        : 0;

    let awaitingReportOperation: DailyOperationCarryoverContract | null = null;
    if (!operation && !pendingClosure && previousClosed) {
      const priorReport = await this.repository.findReportForOperation({
        tenantId: user.tenantId,
        operationId: previousClosed.id,
      });
      if (!priorReport || !this.isReportSubmitted(priorReport.status)) {
        awaitingReportOperation = this.toCarryoverContract(previousClosed);
      }
    }

    const operationContract = operation
      ? await this.toContract(operation, bounds.dayStart, bounds.dayEnd)
      : null;
    const report =
      operation && operationContract && operation.status === 'CLOSED'
        ? await this.ensureReportForClosedOperation(
            user,
            operation,
            operationContract,
          )
        : null;

    return {
      date: bounds.dateLabel,
      branch: {
        id: branch.id,
        name: branch.name,
        address: branch.address,
      },
      openingBalance,
      openingBalanceSource: previousClosed ? 'PREVIOUS_CLOSING' : 'MANUAL',
      previousClosedOperation: previousClosed
        ? this.toCarryoverContract(previousClosed)
        : null,
      pendingClosureOperation: pendingClosure
        ? this.toCarryoverContract(pendingClosure)
        : null,
      awaitingReportOperation,
      operation: operationContract,
      report: report ? this.toReportContract(report) : null,
    };
  }

  async getAgentToday(
    user: AuthenticatedUser,
  ): Promise<AgentDailyOperationResponseContract> {
    this.assertTenant(user);
    const bounds = this.parseDayBounds();
    const emptyFloat = this.emptyAgentFloatSummary();
    const localHour = this.currentBusinessHour();

    if (!user.branchId) {
      return {
        date: bounds.dateLabel,
        branch: null,
        branchStatus: null,
        canUseApp: false,
        canBrowseClients: false,
        lockReason: 'NO_BRANCH',
        lockTitle: 'No branch assigned',
        lockMessage:
          'Your account is not assigned to a branch. Contact your manager.',
        float: emptyFloat,
      };
    }

    const branch = await this.repository.findBranch({
      tenantId: user.tenantId,
      branchId: user.branchId,
    });
    if (!branch) {
      return {
        date: bounds.dateLabel,
        branch: null,
        branchStatus: null,
        canUseApp: false,
        canBrowseClients: false,
        lockReason: 'NO_BRANCH',
        lockTitle: 'Branch not found',
        lockMessage:
          'Your branch could not be found. Contact your manager before using the app.',
        float: emptyFloat,
      };
    }

    const branchContract = {
      id: branch.id,
      name: branch.name,
      address: branch.address,
    };

    const operation = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });
    if (!operation) {
      return {
        date: bounds.dateLabel,
        branch: branchContract,
        branchStatus: null,
        canUseApp: false,
        canBrowseClients: true,
        lockReason: 'BRANCH_NOT_OPEN',
        lockTitle: 'Branch not open yet',
        lockMessage:
          localHour < this.agentOpenHourLocal
            ? 'Field work opens at 6:00 AM. You can still browse client records.'
            : 'Your branch is not open for today yet. You can still browse client records.',
        float: emptyFloat,
      };
    }

    const [float, loansAgg, collectionsAgg] = await Promise.all([
      this.repository.findAgentFloatForDay({
        tenantId: user.tenantId,
        branchId: branch.id,
        agentId: user.userId,
        floatDate: operation.operationDate,
      }),
      this.repository.sumLoansIssuedForAgent({
        tenantId: user.tenantId,
        branchId: branch.id,
        agentId: user.userId,
        dayStart: bounds.dayStart,
        dayEnd: bounds.dayEnd,
      }),
      this.repository.sumCollectionsForAgent({
        tenantId: user.tenantId,
        branchId: branch.id,
        agentId: user.userId,
        dayStart: bounds.dayStart,
        dayEnd: bounds.dayEnd,
      }),
    ]);

    const amountReceived = this.decimalToNumber(float?.amountGiven);
    const amountDisbursed = this.decimalToNumber(loansAgg._sum.principalAmount);
    const processingFees = this.decimalToNumber(loansAgg._sum.processingFee);
    const amountCollected = this.decimalToNumber(collectionsAgg._sum.amount);
    const unusedFloat = this.roundMoney(amountReceived - amountDisbursed);
    const expectedHandover = this.roundMoney(
      unusedFloat + amountCollected + processingFees,
    );
    const returnedAt = float?.returnedAt?.toISOString() ?? null;
    const amountReturned =
      float?.amountReturned == null
        ? null
        : this.decimalToNumber(float.amountReturned);

    const floatSummary = {
      amountReceived,
      amountDisbursed,
      processingFees,
      amountCollected,
      unusedFloat,
      expectedHandover,
      amountReturned,
      returnedAt,
    };

    if (operation.status !== 'OPEN') {
      return {
        date: bounds.dateLabel,
        branch: branchContract,
        branchStatus: operation.status,
        canUseApp: false,
        canBrowseClients: true,
        lockReason: 'BRANCH_CLOSED',
        lockTitle:
          operation.status === 'CLOSING'
            ? 'Branch is closing'
            : 'Branch closed',
        lockMessage:
          operation.status === 'CLOSING'
            ? 'Field work is paused while the branch closes. You can still browse client records.'
            : 'Field work is closed for today. You can browse client records. Full access opens at 6:00 AM after the next day is open.',
        float: floatSummary,
      };
    }

    if (returnedAt) {
      return {
        date: bounds.dateLabel,
        branch: branchContract,
        branchStatus: operation.status,
        canUseApp: false,
        canBrowseClients: true,
        lockReason: 'AGENT_DAY_CLOSED',
        lockTitle: 'Your day is closed',
        lockMessage:
          'Your cash handover has been recorded. You can still browse client records.',
        float: floatSummary,
      };
    }

    if (localHour < this.agentOpenHourLocal) {
      return {
        date: bounds.dateLabel,
        branch: branchContract,
        branchStatus: operation.status,
        canUseApp: false,
        canBrowseClients: true,
        lockReason: 'BEFORE_OPEN_HOUR',
        lockTitle: 'Opens at 6:00 AM',
        lockMessage:
          'Today’s branch day is ready. Field work opens at 6:00 AM. You can browse client records meanwhile.',
        float: floatSummary,
      };
    }

    return {
      date: bounds.dateLabel,
      branch: branchContract,
      branchStatus: operation.status,
      canUseApp: true,
      canBrowseClients: true,
      lockReason: null,
      lockTitle: null,
      lockMessage: null,
      float: floatSummary,
    };
  }

  async listOwnerReports(
    user: AuthenticatedUser,
    options?: {
      branchId?: string;
      status?: string;
      from?: string;
      to?: string;
    },
  ): Promise<OwnerOperationReportListResponseContract> {
    const canOwnerList =
      user.permissions.includes(OPERATIONS_PERMISSIONS.approve) &&
      user.permissions.includes(BRANCH_PERMISSIONS.create);
    const canManagerList =
      user.permissions.includes(OPERATIONS_PERMISSIONS.reportReview) ||
      user.permissions.includes(OPERATIONS_PERMISSIONS.close) ||
      user.permissions.includes(OPERATIONS_PERMISSIONS.read);

    if (!canOwnerList && !canManagerList) {
      throw new ForbiddenException('Missing permission to view reports.');
    }

    const managerScoped = !canOwnerList;
    if (managerScoped) {
      if (!user.branchId) {
        throw new ForbiddenException('Branch scope is required.');
      }
    }

    const status = this.parseOwnerReportStatus(options?.status, {
      includeManagerReview: managerScoped,
    });
    const fromDate = options?.from
      ? this.parseDayBounds(options.from).dateOnly
      : null;
    const toDate = options?.to
      ? this.parseDayBounds(options.to).dateOnly
      : null;
    const reports = await this.repository.listOwnerReports({
      tenantId: user.tenantId,
      branchId: managerScoped ? user.branchId : options?.branchId || null,
      status,
      fromDate,
      toDate,
      includeManagerReview: managerScoped,
    });

    return {
      reports: reports.map((report) => this.toOwnerReportListItem(report)),
    };
  }

  async getOwnerReport(
    user: AuthenticatedUser,
    reportId: string,
  ): Promise<OwnerOperationReportDetailResponseContract> {
    const canOwnerList =
      user.permissions.includes(OPERATIONS_PERMISSIONS.approve) &&
      user.permissions.includes(BRANCH_PERMISSIONS.create);
    const canManagerList =
      user.permissions.includes(OPERATIONS_PERMISSIONS.reportReview) ||
      user.permissions.includes(OPERATIONS_PERMISSIONS.close) ||
      user.permissions.includes(OPERATIONS_PERMISSIONS.read);

    if (!canOwnerList && !canManagerList) {
      throw new ForbiddenException('Missing permission to view reports.');
    }

    const report = await this.repository.findReportById({
      tenantId: user.tenantId,
      reportId,
    });
    if (!report) {
      throw new NotFoundException('Report was not found.');
    }

    if (!canOwnerList) {
      if (!user.branchId || report.branchId !== user.branchId) {
        throw new ForbiddenException('Branch scope is required.');
      }
    }

    return { report: this.toOwnerReportListItem(report) };
  }

  private toOwnerReportListItem(report: {
    id: string;
    operationId: string;
    branchId: string;
    reportNumber: string;
    operationDate: Date;
    status: BranchOperationReportStatus;
    generatedAt: Date;
    managerReviewedAt: Date | null;
    managerNotes: string | null;
    ownerApprovedAt: Date | null;
    ownerNotes: string | null;
    returnedAt: Date | null;
    returnNotes: string | null;
    snapshot: Prisma.JsonValue;
    managerReviewedBy?: { displayName: string } | null;
    ownerApprovedBy?: { displayName: string } | null;
    returnedBy?: { displayName: string } | null;
    branch?: { name: string } | null;
    operation: { branch: { name: string } };
  }): OwnerOperationReportListItemContract {
    const snapshot = this.reportSnapshotSummary(report.snapshot);
    return {
      id: report.id,
      operationId: report.operationId,
      branchId: report.branchId,
      branchName: report.branch?.name ?? report.operation.branch.name,
      reportNumber: report.reportNumber,
      operationDate: this.formatDateLabel(report.operationDate),
      status: report.status,
      generatedAt: report.generatedAt.toISOString(),
      managerReviewedAt: report.managerReviewedAt?.toISOString() ?? null,
      managerReviewedByName: report.managerReviewedBy?.displayName ?? null,
      managerNotes: report.managerNotes,
      ownerApprovedAt: report.ownerApprovedAt?.toISOString() ?? null,
      ownerApprovedByName: report.ownerApprovedBy?.displayName ?? null,
      ownerNotes: report.ownerNotes,
      returnedAt: report.returnedAt?.toISOString() ?? null,
      returnedByName: report.returnedBy?.displayName ?? null,
      returnNotes: report.returnNotes,
      expectedClosingBalance: snapshot.expectedClosingBalance,
      closingBalance: snapshot.countedCash,
      closingVariance: snapshot.variance,
      loansIssuedCount: snapshot.loansIssuedCount,
      loansIssuedPrincipal: snapshot.loansIssuedPrincipal,
      collectionsReceived: snapshot.collectionsReceived,
      processingFeesTotal: snapshot.processingFees,
      expensesTotal: snapshot.expenses,
      cashReturnedByAgents: snapshot.cashReturnedByAgents,
      snapshot: report.snapshot,
    };
  }

  async listOwnerBranchDailyStatuses(
    user: AuthenticatedUser,
    date?: string,
  ): Promise<OwnerBranchDailyStatusResponseContract> {
    this.assertCanOwnerApproveReport(user);
    const bounds = this.parseDayBounds(date);
    const branches = await this.repository.listBranchDailyStatuses({
      tenantId: user.tenantId,
      operationDate: bounds.dateOnly,
    });

    return {
      date: bounds.dateLabel,
      statuses: branches.map((branch) => {
        const operation = branch.dailyOperations[0] ?? null;
        const report = operation?.report ?? null;
        return {
          branchId: branch.id,
          branchName: branch.name,
          operationDate: bounds.dateLabel,
          operationId: operation?.id ?? null,
          operationStatus: operation?.status ?? null,
          openedAt: operation?.openedAt.toISOString() ?? null,
          closedAt: operation?.closedAt?.toISOString() ?? null,
          reportId: report?.id ?? null,
          reportNumber: report?.reportNumber ?? null,
          reportStatus: report?.status ?? null,
          reportGeneratedAt: report?.generatedAt.toISOString() ?? null,
          managerReviewedAt: report?.managerReviewedAt?.toISOString() ?? null,
        };
      }),
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
    await this.billingService.assertBranchSubscriptionActive(
      user.tenantId,
      branch.id,
    );

    const bounds = this.parseDayBounds(dto.date);
    this.assertCanChangeDay(bounds.dateOnly);
    await this.retireEmptyUnclosedOperationsBefore({
      tenantId: user.tenantId,
      branchId: branch.id,
      beforeDate: bounds.dateOnly,
    });
    const existing = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });

    if (existing) {
      throw new ConflictException('This branch is already open for this day.');
    }

    const [previousClosed, pendingClosure] = await Promise.all([
      this.findLatestNonEmptyClosedBefore({
        tenantId: user.tenantId,
        branchId: branch.id,
        beforeDate: bounds.dateOnly,
      }),
      this.repository.findOldestUnclosedBefore({
        tenantId: user.tenantId,
        branchId: branch.id,
        beforeDate: bounds.dateOnly,
      }),
    ]);

    if (pendingClosure) {
      throw new BadRequestException(
        `Close ${this.formatDateLabel(pendingClosure.operationDate)} before opening a new day.`,
      );
    }

    if (previousClosed) {
      await this.assertPreviousDayReportSubmitted(previousClosed);
    }

    const openingBalance = previousClosed
      ? this.decimalToNumber(previousClosed.closingBalance)
      : dto.openingBalance;

    if (openingBalance == null || Number.isNaN(openingBalance)) {
      throw new BadRequestException(
        'Enter the opening balance for the first operating day.',
      );
    }

    const cashAddedToday = this.roundMoney(dto.cashAddedToday ?? 0);
    const cashAvailableAtOpening = this.roundMoney(
      openingBalance + cashAddedToday,
    );
    // No separate float ceiling at open — cash on hand is the practical limit.
    const floatSetAside = cashAvailableAtOpening;

    const operation = await this.repository
      .openBranch({
        tenantId: user.tenantId,
        branchId: branch.id,
        operationDate: bounds.dateOnly,
        openedAt: new Date(),
        openedByUserId: user.userId,
        openingBalance: new Prisma.Decimal(openingBalance),
        cashAddedToday: new Prisma.Decimal(cashAddedToday),
        cashAvailableAtOpening: new Prisma.Decimal(cashAvailableAtOpening),
        floatSetAside: new Prisma.Decimal(floatSetAside),
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
    this.broadcastOperationEvent(OPERATIONS_EVENTS.branchOpened, {
      operationId: operation.id,
      tenantId: operation.tenantId,
      branchId: operation.branchId,
      operationDate: bounds.dateLabel,
      status: operation.status,
    });

    return this.getToday(user, { branchId: branch.id, date: bounds.dateLabel });
  }

  async recordExpense(
    user: AuthenticatedUser,
    dto: RecordOperationExpenseDto,
  ): Promise<DailyOperationResponseContract> {
    this.assertCanCreateExpense(user);
    const branch = await this.resolveBranch(user, dto.branchId);
    if (!branch) {
      throw new NotFoundException('Branch was not found.');
    }

    const bounds = this.parseDayBounds(dto.date);
    const operation = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });

    if (!operation || operation.status !== 'OPEN') {
      throw new BadRequestException(
        'Open the branch before recording expenses.',
      );
    }

    const [floatAgg, expensesAgg, returnedAgg] = await Promise.all([
      this.repository.sumFloatIssued({
        tenantId: user.tenantId,
        branchId: branch.id,
        floatDate: operation.operationDate,
      }),
      this.repository.sumExpensesForOperation({
        tenantId: user.tenantId,
        operationId: operation.id,
      }),
      this.repository.sumFloatReturned({
        tenantId: user.tenantId,
        branchId: branch.id,
        floatDate: operation.operationDate,
      }),
    ]);

    const availableCash = this.cashAvailableAtOpening(operation);
    const floatIssued = this.decimalToNumber(floatAgg._sum.amountGiven);
    const expensesTotal = this.decimalToNumber(expensesAgg._sum.amount);
    const cashReturnedByAgents = this.decimalToNumber(
      returnedAgg._sum.amountReturned,
    );
    const remainingBeforeExpense = this.roundMoney(
      availableCash - floatIssued - expensesTotal + cashReturnedByAgents,
    );

    if (dto.amount > remainingBeforeExpense) {
      throw new BadRequestException(
        `Expense exceeds remaining branch cash. Available: ${remainingBeforeExpense}.`,
      );
    }

    await this.repository.recordExpense({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationId: operation.id,
      category: dto.category,
      amount: new Prisma.Decimal(dto.amount),
      description: dto.description?.trim() || null,
      incurredAt: new Date(),
      recordedByUserId: user.userId,
      operationDate: operation.operationDate,
      status: operation.status,
    });

    return this.getToday(user, { branchId: branch.id, date: bounds.dateLabel });
  }

  async recordTopUp(
    user: AuthenticatedUser,
    dto: RecordOperationTopUpDto,
  ): Promise<DailyOperationResponseContract> {
    this.assertCanTopUp(user);
    const branch = await this.resolveBranch(user, dto.branchId);
    if (!branch) {
      throw new NotFoundException('Branch was not found.');
    }

    const bounds = this.parseDayBounds(dto.date);
    const operation = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });

    if (!operation || operation.status !== 'OPEN') {
      throw new BadRequestException('Open the branch before adding more cash.');
    }

    const topUp = await this.repository.recordTopUp({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationId: operation.id,
      amount: new Prisma.Decimal(dto.amount),
      description: dto.description?.trim() || null,
      addedAt: new Date(),
      recordedByUserId: user.userId,
      operationDate: operation.operationDate,
      status: operation.status,
    });
    this.broadcastOperationEvent(OPERATIONS_EVENTS.cashTopUpRecorded, {
      operationId: operation.id,
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateLabel,
      status: operation.status,
      topUpId: topUp.id,
      amount: this.decimalToNumber(topUp.amount),
    });

    return this.getToday(user, { branchId: branch.id, date: bounds.dateLabel });
  }

  async recordAgentReturn(
    user: AuthenticatedUser,
    dto: RecordAgentReturnDto,
  ): Promise<DailyOperationResponseContract> {
    this.assertCanReturnFloat(user);
    const branch = await this.resolveBranch(user, dto.branchId);
    if (!branch) {
      throw new NotFoundException('Branch was not found.');
    }

    const bounds = this.parseDayBounds(dto.date);
    const operation = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });

    if (!operation || operation.status !== 'OPEN') {
      throw new BadRequestException(
        'Open the branch before recording agent returns.',
      );
    }

    const float = await this.repository.findAgentFloatForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      agentId: dto.agentId,
      floatDate: operation.operationDate,
    });
    if (!float) {
      throw new BadRequestException(
        'Assign float to this agent before recording a return.',
      );
    }

    const returnedFloat = await this.repository.recordAgentReturn({
      tenantId: user.tenantId,
      branchId: branch.id,
      agentId: dto.agentId,
      floatDate: operation.operationDate,
      amountReturned: new Prisma.Decimal(dto.amountReturned),
      returnedAt: new Date(),
      returnedByUserId: user.userId,
      notes: dto.notes?.trim() || null,
      operationId: operation.id,
      operationDate: operation.operationDate,
    });
    this.broadcastOperationEvent(OPERATIONS_EVENTS.agentFloatReturned, {
      operationId: operation.id,
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateLabel,
      status: operation.status,
      agentId: dto.agentId,
      floatId: returnedFloat.id,
      amountReturned: this.decimalToNumber(returnedFloat.amountReturned),
    });

    // Attach float SHORT to the field officer for tracking / salary recovery.
    const dayContract = await this.toContract(
      operation,
      bounds.dayStart,
      bounds.dayEnd,
    );
    const agentReturn = dayContract.agentReturns.find(
      (row) => row.agentId === dto.agentId,
    );
    if (
      agentReturn &&
      agentReturn.variance != null &&
      agentReturn.variance < 0
    ) {
      await this.cashShortagesService.createShortage({
        tenantId: user.tenantId!,
        branchId: branch.id,
        responsibleUserId: dto.agentId,
        createdByUserId: user.userId,
        sourceType: CashShortageSource.AGENT_FLOAT_RETURN,
        sourceId: returnedFloat.id,
        operationDate: operation.operationDate,
        amount: Math.abs(agentReturn.variance),
        notes:
          dto.notes?.trim() ||
          `Float return shortage for ${agentReturn.agentName}`,
      });
    }

    return this.getToday(user, { branchId: branch.id, date: bounds.dateLabel });
  }

  async closeBranch(
    user: AuthenticatedUser,
    dto: CloseBranchOperationDto,
  ): Promise<DailyOperationResponseContract> {
    this.assertCanClose(user);
    const branch = await this.resolveBranch(user, dto.branchId);
    if (!branch) {
      throw new NotFoundException('Branch was not found.');
    }

    const bounds = this.parseDayBounds(dto.date);
    const operation = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });

    if (!operation || operation.status !== 'OPEN') {
      throw new BadRequestException('Only an open branch can be closed.');
    }

    const contract = await this.toContract(
      operation,
      bounds.dayStart,
      bounds.dayEnd,
    );
    const pendingReturns = contract.agentReturns.filter(
      (agentReturn) => agentReturn.amountReturned == null,
    );
    if (pendingReturns.length > 0) {
      throw new BadRequestException(
        'Record all agent returns before closing the branch.',
      );
    }

    const closingBalance = this.roundMoney(dto.countedCash);
    const variance = this.roundMoney(
      closingBalance - contract.expectedClosingBalance,
    );
    if (variance !== 0 && !dto.notes?.trim()) {
      throw new BadRequestException(
        'Add a note when counted cash is different from expected cash.',
      );
    }
    if (variance < 0 && !dto.shortageResponsibleUserId?.trim()) {
      throw new BadRequestException(
        'Assign the shortage to a field officer or cashier before closing.',
      );
    }

    const closedOperation = await this.repository.closeBranch({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationId: operation.id,
      closedAt: new Date(),
      closedByUserId: user.userId,
      closingBalance: new Prisma.Decimal(closingBalance),
      closingNotes: dto.notes?.trim() || null,
      operationDate: operation.operationDate,
      expectedClosingBalance: contract.expectedClosingBalance,
      variance,
    });
    this.broadcastOperationEvent(OPERATIONS_EVENTS.branchClosed, {
      operationId: closedOperation.id,
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateLabel,
      status: closedOperation.status,
    });

    if (variance < 0 && dto.shortageResponsibleUserId) {
      await this.cashShortagesService.createShortage({
        tenantId: user.tenantId!,
        branchId: branch.id,
        responsibleUserId: dto.shortageResponsibleUserId,
        createdByUserId: user.userId,
        sourceType: CashShortageSource.BRANCH_CLOSE,
        sourceId: closedOperation.id,
        operationDate: operation.operationDate,
        amount: Math.abs(variance),
        notes: dto.notes?.trim() || 'Branch close cash shortage',
      });
    }

    // Create the close report immediately so managers can submit it before next open.
    const closedForReport = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: operation.operationDate,
    });
    if (closedForReport) {
      const closedContract = await this.toContract(
        closedForReport,
        bounds.dayStart,
        bounds.dayEnd,
      );
      await this.ensureReportForClosedOperation(
        user,
        closedForReport,
        closedContract,
      );
    }

    return this.getToday(user, { branchId: branch.id, date: bounds.dateLabel });
  }

  async managerConfirmReport(
    user: AuthenticatedUser,
    reportId: string,
    dto: ReviewOperationReportDto,
  ): Promise<DailyOperationResponseContract> {
    this.assertCanReviewReport(user);
    const report = await this.repository.findReportById({
      tenantId: user.tenantId,
      reportId,
    });
    if (!report) {
      throw new NotFoundException('Report was not found.');
    }
    await this.resolveBranch(user, report.branchId);

    if (
      report.status !== BranchOperationReportStatus.MANAGER_REVIEW &&
      report.status !== BranchOperationReportStatus.RETURNED_TO_MANAGER
    ) {
      throw new BadRequestException(
        'This report is not waiting for manager review.',
      );
    }

    const updated = await this.repository.managerConfirmReport({
      tenantId: user.tenantId,
      reportId: report.id,
      reviewedByUserId: user.userId,
      notes: dto.notes?.trim() || null,
    });
    this.broadcastOperationEvent(OPERATIONS_EVENTS.reportManagerReviewed, {
      operationId: report.operationId,
      reportId: updated.id,
      tenantId: user.tenantId,
      branchId: report.branchId,
      operationDate: this.formatDateLabel(report.operationDate),
      status: updated.status,
    });

    // Open the next day immediately after the close report is submitted.
    const nextBounds = this.parseDayBounds(
      this.nextDateLabel(report.operationDate),
    );
    const branch = await this.repository.findBranch({
      tenantId: user.tenantId,
      branchId: report.branchId,
    });
    if (branch) {
      await this.autoOpenBranchIfEligible({
        tenantId: user.tenantId,
        branchId: branch.id,
        branchName: branch.name,
        bounds: nextBounds,
        openedByUserId: user.userId,
        allowFirstDay: false,
      });
    }

    return this.getToday(user, {
      branchId: report.branchId,
      date: nextBounds.dateLabel,
    });
  }

  async ownerApproveReport(
    user: AuthenticatedUser,
    reportId: string,
    dto: ReviewOperationReportDto,
  ): Promise<DailyOperationResponseContract> {
    this.assertCanOwnerApproveReport(user);
    const report = await this.repository.findReportById({
      tenantId: user.tenantId,
      reportId,
    });
    if (!report) {
      throw new NotFoundException('Report was not found.');
    }
    await this.resolveBranch(user, report.branchId);

    if (report.status !== BranchOperationReportStatus.SENT_TO_OWNER) {
      throw new BadRequestException('This report has not been sent to owner.');
    }

    const updated = await this.repository.ownerApproveReport({
      tenantId: user.tenantId,
      reportId: report.id,
      approvedByUserId: user.userId,
      notes: dto.notes?.trim() || null,
    });
    this.broadcastOperationEvent(OPERATIONS_EVENTS.reportOwnerApproved, {
      operationId: report.operationId,
      reportId: updated.id,
      tenantId: user.tenantId,
      branchId: report.branchId,
      operationDate: this.formatDateLabel(report.operationDate),
      status: updated.status,
    });

    return this.getToday(user, {
      branchId: report.branchId,
      date: this.formatDateLabel(report.operationDate),
    });
  }

  broadcastFloatUpdated(input: {
    tenantId: string;
    branchId: string;
    agentId: string;
    floatId: string;
    operationDate: string;
    amountGiven: number;
  }) {
    this.broadcastOperationEvent(OPERATIONS_EVENTS.branchFloatUpdated, {
      operationId: null,
      tenantId: input.tenantId,
      branchId: input.branchId,
      operationDate: input.operationDate,
      status: 'OPEN',
      agentId: input.agentId,
      floatId: input.floatId,
      amountGiven: input.amountGiven,
    });
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
    this.assertCanChangeDay(bounds.dateOnly);
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

  async assertFloatCanBeAssigned(input: {
    tenantId: string;
    branchId: string | null | undefined;
    agentId: string;
    amountGiven: number;
    date?: string;
    mode?: 'new' | 'additional';
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

    const [floatAgg, existingFloat, expensesAgg, returnedAgg] =
      await Promise.all([
        this.repository.sumFloatIssued({
          tenantId: input.tenantId,
          branchId: input.branchId,
          floatDate: operation.operationDate,
        }),
        this.repository.findAgentFloatForDay({
          tenantId: input.tenantId,
          branchId: input.branchId,
          agentId: input.agentId,
          floatDate: operation.operationDate,
        }),
        this.repository.sumExpensesForOperation({
          tenantId: input.tenantId,
          operationId: operation.id,
        }),
        this.repository.sumFloatReturned({
          tenantId: input.tenantId,
          branchId: input.branchId,
          floatDate: operation.operationDate,
        }),
      ]);

    const mode = input.mode ?? 'new';
    if (mode === 'new' && existingFloat) {
      throw new BadRequestException(
        'This agent already has float for this day.',
      );
    }
    if (mode === 'additional' && !existingFloat) {
      throw new BadRequestException(
        'Issue float to this agent before adding more.',
      );
    }
    if (mode === 'additional' && existingFloat?.amountReturned != null) {
      throw new BadRequestException(
        'This agent has already returned cash for this day.',
      );
    }

    const cashAvailableAtOpening = this.cashAvailableAtOpening(operation);
    const totalAlreadyIssued = this.decimalToNumber(floatAgg._sum.amountGiven);
    const expensesTotal = this.decimalToNumber(expensesAgg._sum.amount);
    const cashReturnedByAgents = this.decimalToNumber(
      returnedAgg._sum.amountReturned,
    );
    const availableForThisAgent = Math.max(
      0,
      this.roundMoney(
        cashAvailableAtOpening -
          expensesTotal -
          totalAlreadyIssued +
          cashReturnedByAgents,
      ),
    );

    if (input.amountGiven > availableForThisAgent) {
      throw new BadRequestException(
        `Float exceeds available branch cash. Available: ${availableForThisAgent}.`,
      );
    }

    return operation;
  }

  private toCarryoverContract(
    operation: NonNullable<
      Awaited<ReturnType<OperationsRepository['findOperationForDay']>>
    >,
  ): DailyOperationCarryoverContract {
    return {
      id: operation.id,
      branchId: operation.branchId,
      branchName: operation.branch.name,
      operationDate: this.formatDateLabel(operation.operationDate),
      status: operation.status,
      openedAt: operation.openedAt.toISOString(),
    };
  }

  private async toContract(
    operation: NonNullable<
      Awaited<ReturnType<OperationsRepository['findOperationForDay']>>
    >,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<DailyOperationContract> {
    const [
      floatAgg,
      loansAgg,
      collectionsAgg,
      expensesAgg,
      expenses,
      topUps,
      agentFloats,
      loansIssuedToday,
      collectionsWithProduct,
      cashShortages,
      previousClosed,
    ] = await Promise.all([
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
      this.repository.sumExpensesForOperation({
        tenantId: operation.tenantId,
        operationId: operation.id,
      }),
      this.repository.listExpensesForOperation({
        tenantId: operation.tenantId,
        operationId: operation.id,
      }),
      this.repository.listTopUpsForOperation({
        tenantId: operation.tenantId,
        operationId: operation.id,
      }),
      this.repository.listAgentFloatsForOperation({
        tenantId: operation.tenantId,
        branchId: operation.branchId,
        floatDate: operation.operationDate,
      }),
      this.repository.listLoansIssuedToday({
        tenantId: operation.tenantId,
        branchId: operation.branchId,
        dayStart,
        dayEnd,
      }),
      this.repository.listCollectionsWithProduct({
        tenantId: operation.tenantId,
        branchId: operation.branchId,
        dayStart,
        dayEnd,
      }),
      this.repository.listCashShortagesForOperationDay({
        tenantId: operation.tenantId,
        branchId: operation.branchId,
        operationDate: operation.operationDate,
      }),
      this.repository.findLatestClosedBefore({
        tenantId: operation.tenantId,
        branchId: operation.branchId,
        beforeDate: operation.operationDate,
      }),
    ]);

    const previousReport =
      previousClosed == null
        ? null
        : await this.repository.findReportForOperation({
            tenantId: operation.tenantId,
            operationId: previousClosed.id,
          });

    const agentIds = agentFloats.map((float) => float.agentId);
    const [loansByAgentRows, collectionsByAgentRows] =
      agentIds.length === 0
        ? [[], []]
        : await Promise.all([
            this.repository.sumLoansIssuedByAgent({
              tenantId: operation.tenantId,
              branchId: operation.branchId,
              agentIds,
              dayStart,
              dayEnd,
            }),
            this.repository.sumCollectionsByAgent({
              tenantId: operation.tenantId,
              branchId: operation.branchId,
              agentIds,
              dayStart,
              dayEnd,
            }),
          ]);

    const openingBalance = this.decimalToNumber(
      operation.previousClosingBalance,
    );
    const cashAddedToday = this.decimalToNumber(operation.cashAddedToday);
    const cashAvailableAtOpening = this.cashAvailableAtOpening(operation);
    const floatSetAside = this.floatSetAsideAmount(operation);
    const floatIssued = this.decimalToNumber(floatAgg._sum.amountGiven);
    const expensesTotal = this.decimalToNumber(expensesAgg._sum.amount);
    const loansIssuedPrincipal = this.decimalToNumber(
      loansAgg._sum.principalAmount,
    );
    const processingFeesTotal = this.decimalToNumber(
      loansAgg._sum.processingFee,
    );
    const collectionsReceived = this.decimalToNumber(
      collectionsAgg._sum.amount,
    );
    const agentReturns = this.toAgentReturnContracts(
      agentFloats,
      loansByAgentRows,
      collectionsByAgentRows,
    );
    const cashReturnedByAgents = this.roundMoney(
      agentReturns.reduce(
        (total, agentReturn) => total + (agentReturn.amountReturned ?? 0),
        0,
      ),
    );
    const expectedAgentReturnTotal = this.roundMoney(
      agentReturns.reduce(
        (total, agentReturn) => total + agentReturn.expectedReturn,
        0,
      ),
    );
    const agentReturnVariance = this.roundMoney(
      cashReturnedByAgents - expectedAgentReturnTotal,
    );
    const branchCashRemaining = this.roundMoney(
      cashAvailableAtOpening -
        floatIssued -
        expensesTotal +
        cashReturnedByAgents,
    );
    // Assignable float = branch cash on hand (no separate open-time ceiling).
    const floatRemaining = Math.max(branchCashRemaining, 0);
    const expectedClosingBalance = this.roundMoney(
      cashAvailableAtOpening -
        loansIssuedPrincipal +
        processingFeesTotal +
        collectionsReceived -
        expensesTotal,
    );
    const closingBalance = operation.closingBalance
      ? this.decimalToNumber(operation.closingBalance)
      : null;

    const loansByProduct = this.buildLoansByProduct(loansIssuedToday);
    const feesByProduct = this.buildFeesByProduct(loansIssuedToday);
    const repaymentsByProduct = this.buildRepaymentsByProduct(
      collectionsWithProduct,
    );
    const loansIssued = this.buildLoanIssuedDetails(
      loansIssuedToday,
      operation.operationDate,
    );
    const repayments = this.buildRepaymentDetails(collectionsWithProduct);
    const processingFees = this.buildProcessingFeeDetails(
      loansIssuedToday,
      operation.operationDate,
    );
    const closingVariance =
      closingBalance == null
        ? null
        : this.roundMoney(closingBalance - expectedClosingBalance);
    const variances = this.buildVarianceDetails({
      operation,
      agentReturns,
      closingVariance,
      expectedClosingBalance,
      closingBalance,
      cashShortages,
    });

    return {
      id: operation.id,
      branchId: operation.branchId,
      branchName: operation.branch.name,
      operationDate: this.formatDateLabel(operation.operationDate),
      status: operation.status,
      openedAt: operation.openedAt.toISOString(),
      openedByName: operation.openedBy.displayName,
      closedAt: operation.closedAt?.toISOString() ?? null,
      closedByName: operation.closedBy?.displayName ?? null,
      openingBalance,
      cashAddedToday,
      cashAvailableAtOpening,
      floatIssued,
      floatSetAside,
      floatRemaining,
      processingFeesTotal,
      cashReturnedByAgents,
      agentsWithFloatCount: agentReturns.length,
      agentsReturnedCount: agentReturns.filter(
        (agentReturn) => agentReturn.amountReturned != null,
      ).length,
      expectedAgentReturnTotal,
      agentReturnVariance,
      agentReturns,
      topUpsCount: topUps.length,
      topUpsTotal: cashAddedToday,
      topUps: topUps.map((topUp) => ({
        id: topUp.id,
        amount: this.decimalToNumber(topUp.amount),
        description: topUp.description,
        addedAt: topUp.addedAt.toISOString(),
        recordedByName: topUp.recordedBy.displayName,
      })),
      expensesCount: expensesAgg._count._all,
      expensesTotal,
      expenses: expenses.map((expense) => ({
        id: expense.id,
        category: expense.category,
        amount: this.decimalToNumber(expense.amount),
        description: expense.description,
        incurredAt: expense.incurredAt.toISOString(),
        recordedByName: expense.recordedBy.displayName,
        approvedAt: expense.approvedAt?.toISOString() ?? null,
        approvedByName: expense.approvedBy?.displayName ?? null,
      })),
      branchCashRemaining,
      expectedClosingBalance,
      closingBalance,
      closingVariance,
      closingNotes: operation.closingNotes,
      loansIssuedCount: loansAgg._count._all,
      loansIssuedPrincipal,
      collectionsCount: collectionsAgg._count._all,
      collectionsReceived,
      notes: operation.notes,
      loansByProduct,
      repaymentsByProduct,
      feesByProduct,
      loansIssued,
      repayments,
      processingFees,
      variances,
      previousReportReference:
        previousClosed == null
          ? null
          : {
              reportNumber:
                previousReport?.reportNumber ??
                this.buildDailyReportCode(
                  this.formatDateLabel(previousClosed.operationDate),
                ),
              operationDate: this.formatDateLabel(previousClosed.operationDate),
              amount: this.decimalToNumber(previousClosed.closingBalance),
            },
    };
  }

  private cashAvailableAtOpening(operation: {
    previousClosingBalance: Prisma.Decimal | number | null;
    cashAddedToday?: Prisma.Decimal | number | null;
    openingFloatAvailable: Prisma.Decimal | number | null;
  }) {
    const openingBalance = this.decimalToNumber(
      operation.previousClosingBalance,
    );
    const cashAddedToday = this.decimalToNumber(operation.cashAddedToday);
    const legacyAvailable = this.decimalToNumber(
      operation.openingFloatAvailable,
    );
    const computed = this.roundMoney(openingBalance + cashAddedToday);
    return computed > 0 || legacyAvailable === 0 ? computed : legacyAvailable;
  }

  private floatSetAsideAmount(operation: {
    floatSetAsideAmount?: Prisma.Decimal | number | null;
    openingFloatAvailable: Prisma.Decimal | number | null;
  }) {
    const setAside = this.decimalToNumber(operation.floatSetAsideAmount);
    return this.roundMoney(setAside);
  }

  private emptyAgentFloatSummary() {
    return {
      amountReceived: 0,
      amountDisbursed: 0,
      processingFees: 0,
      amountCollected: 0,
      unusedFloat: 0,
      expectedHandover: 0,
      amountReturned: null,
      returnedAt: null,
    };
  }

  private async ensureReportForClosedOperation(
    user: AuthenticatedUser,
    operation: NonNullable<
      Awaited<ReturnType<OperationsRepository['findOperationForDay']>>
    >,
    contract: DailyOperationContract,
  ): Promise<OperationReportRecord> {
    const existing = await this.repository.findReportForOperation({
      tenantId: user.tenantId,
      operationId: operation.id,
    });
    if (existing) return existing;

    const reportNumber = this.buildReportNumber(operation.branchId, contract);
    const snapshot = this.buildReportSnapshot(contract);
    try {
      return await this.repository.createOperationReport({
        tenantId: user.tenantId,
        branchId: operation.branchId,
        operationId: operation.id,
        operationDate: operation.operationDate,
        reportNumber,
        snapshot,
        generatedByUserId: operation.closedByUserId,
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        const concurrent = await this.repository.findReportForOperation({
          tenantId: user.tenantId,
          operationId: operation.id,
        });
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  private buildReportNumber(
    branchId: string,
    contract: DailyOperationContract,
  ) {
    const [year, month, day] = contract.operationDate.split('-');
    const code =
      year && month && day && year.length >= 4
        ? `DR${day}${month}${year.slice(2)}`
        : `DR${contract.operationDate.replaceAll('-', '')}`;
    // Persist a branch fragment so multi-branch tenants stay unique; UI shows DRDDMMYY.
    return `${code}-${branchId.replaceAll('-', '').slice(0, 6).toUpperCase()}`;
  }

  private buildReportSnapshot(
    operation: DailyOperationContract,
  ): Prisma.InputJsonObject {
    return {
      version: 3,
      reportType: 'daily_operations_close',
      operation: {
        id: operation.id,
        branchId: operation.branchId,
        branchName: operation.branchName,
        operationDate: operation.operationDate,
        status: operation.status,
        openedAt: operation.openedAt,
        openedByName: operation.openedByName,
        closedAt: operation.closedAt,
        closedByName: operation.closedByName,
      },
      summary: {
        openingCash: operation.cashAvailableAtOpening,
        previousClosingBalance: operation.openingBalance,
        topUpsAdded: operation.topUpsTotal,
        floatDistributed: operation.floatIssued,
        floatLeft: operation.floatRemaining,
        expenses: operation.expensesTotal,
        cashReturnedByAgents: operation.cashReturnedByAgents,
        loansIssuedCount: operation.loansIssuedCount,
        loansIssuedPrincipal: operation.loansIssuedPrincipal,
        collectionsCount: operation.collectionsCount,
        collectionsReceived: operation.collectionsReceived,
        processingFees: operation.processingFeesTotal,
        expectedClosingBalance: operation.expectedClosingBalance,
        countedCash: operation.closingBalance,
        variance: operation.closingVariance,
      },
      openingCash: {
        previousClosingBalance: operation.openingBalance,
        cashAddedToday: operation.cashAddedToday,
        totalOpeningBalance: operation.cashAvailableAtOpening,
        floatSetAside: operation.floatSetAside,
      },
      cashPosition: {
        floatDistributed: operation.floatIssued,
        branchExpenses: operation.expensesTotal,
        cashReturnedByAgents: operation.cashReturnedByAgents,
        branchRepayments: operation.collectionsReceived,
        loanProcessingFees: operation.processingFeesTotal,
        loansIssued: operation.loansIssuedPrincipal,
        expectedClosingBalance: operation.expectedClosingBalance,
        countedCash: operation.closingBalance,
        variance: operation.closingVariance,
      },
      agentReturns: operation.agentReturns,
      topUps: operation.topUps,
      expenses: operation.expenses,
      loansByProduct: operation.loansByProduct,
      repaymentsByProduct: operation.repaymentsByProduct,
      feesByProduct: operation.feesByProduct,
      loansIssued: operation.loansIssued,
      repayments: operation.repayments,
      processingFees: operation.processingFees,
      variances: operation.variances,
      previousReportReference: operation.previousReportReference,
      closingNotes: operation.closingNotes,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildLoanIssuedDetails(
    loans: Awaited<ReturnType<OperationsRepository['listLoansIssuedToday']>>,
    fallbackDate = new Date(),
  ) {
    return loans.map((loan) => {
      const principal = this.decimalToNumber(loan.principalAmount);
      const recoveredToday = this.roundMoney(
        (loan.loan?.repayments ?? []).reduce(
          (total, repayment) => total + this.decimalToNumber(repayment.amount),
          0,
        ),
      );
      const outstandingBalance = loan.loan
        ? this.decimalToNumber(loan.loan.balance)
        : this.roundMoney(Math.max(principal - recoveredToday, 0));
      const borrowerName =
        loan.customer?.fullName?.trim() ||
        [loan.givenNames, loan.surname].filter(Boolean).join(' ').trim() ||
        'Borrower';

      return {
        id: loan.id,
        loanId: loan.loanId,
        borrowerName,
        borrowerPhone: loan.customer?.phone ?? loan.phone ?? null,
        product: loan.templateName?.trim() || 'Loan',
        principalAmount: principal,
        processingFee: this.decimalToNumber(loan.processingFee),
        recoveredToday,
        outstandingBalance,
        issuedAt: (loan.submittedAt ?? fallbackDate).toISOString(),
        officerName: loan.officer.displayName,
        officerPublicId: loan.officer.publicId,
        durationDays: loan.durationDays,
        purpose: loan.loanPurpose,
      };
    });
  }

  private buildRepaymentDetails(
    repayments: Awaited<
      ReturnType<OperationsRepository['listCollectionsWithProduct']>
    >,
  ) {
    return repayments.map((repayment) => ({
      id: repayment.id,
      loanId: repayment.loan.id,
      borrowerName: repayment.loan.customer.fullName,
      borrowerPhone: repayment.loan.customer.phone,
      product:
        repayment.loan.application?.templateName?.trim() || 'Loan repayment',
      amount: this.decimalToNumber(repayment.amount),
      paidAt: repayment.paidAt.toISOString(),
      method: repayment.method,
      receiptNumber: repayment.receiptNumber,
      recordedByName: repayment.recordedBy.displayName,
      recordedByPublicId: repayment.recordedBy.publicId,
      note: repayment.note,
    }));
  }

  private buildProcessingFeeDetails(
    loans: Awaited<ReturnType<OperationsRepository['listLoansIssuedToday']>>,
    fallbackDate = new Date(),
  ) {
    return loans
      .map((loan) => {
        const fee = this.decimalToNumber(loan.processingFee);
        if (fee <= 0) return null;
        const borrowerName =
          loan.customer?.fullName?.trim() ||
          [loan.givenNames, loan.surname].filter(Boolean).join(' ').trim() ||
          'Borrower';
        return {
          id: `${loan.id}-fee`,
          loanId: loan.loanId,
          borrowerName,
          product: loan.templateName?.trim() || 'Loan',
          amount: fee,
          receivedAt: (loan.submittedAt ?? fallbackDate).toISOString(),
          officerName: loan.officer.displayName,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }

  private buildVarianceDetails(input: {
    operation: NonNullable<
      Awaited<ReturnType<OperationsRepository['findOperationForDay']>>
    >;
    agentReturns: DailyOperationAgentReturnContract[];
    closingVariance: number | null;
    expectedClosingBalance: number;
    closingBalance: number | null;
    cashShortages: Awaited<
      ReturnType<OperationsRepository['listCashShortagesForOperationDay']>
    >;
  }) {
    const shortagesBySourceId = new Map(
      input.cashShortages
        .filter((shortage) => Boolean(shortage.sourceId))
        .map((shortage) => [shortage.sourceId!, shortage]),
    );
    const usedShortageIds = new Set<string>();
    const rows: DailyOperationContract['variances'] = [];

    for (const agentReturn of input.agentReturns) {
      const variance = this.roundMoney(agentReturn.variance ?? 0);
      if (agentReturn.amountReturned == null || variance === 0) continue;
      const shortage = shortagesBySourceId.get(agentReturn.floatId);
      if (shortage) usedShortageIds.add(shortage.id);
      rows.push({
        id: `agent-${agentReturn.floatId}`,
        source: 'Officer handover',
        personName: agentReturn.agentName,
        personPublicId: agentReturn.agentPublicId,
        expectedAmount: agentReturn.expectedReturn,
        actualAmount: agentReturn.amountReturned,
        variance,
        shortageAmount:
          shortage != null
            ? this.decimalToNumber(shortage.amountOriginal)
            : variance < 0
              ? Math.abs(variance)
              : null,
        outstandingAmount:
          shortage != null
            ? this.decimalToNumber(shortage.amountOutstanding)
            : null,
        status: shortage?.status ?? agentReturn.status,
        notes: shortage?.notes ?? agentReturn.notes,
        occurredAt:
          agentReturn.returnedAt ??
          input.operation.closedAt?.toISOString() ??
          input.operation.openedAt.toISOString(),
      });
    }

    const branchVariance = this.roundMoney(input.closingVariance ?? 0);
    if (input.closingBalance != null && branchVariance !== 0) {
      const shortage = shortagesBySourceId.get(input.operation.id);
      if (shortage) usedShortageIds.add(shortage.id);
      rows.push({
        id: `branch-close-${input.operation.id}`,
        source: 'Branch close',
        personName: input.operation.closedBy?.displayName ?? 'Branch cash',
        personPublicId: null,
        expectedAmount: input.expectedClosingBalance,
        actualAmount: input.closingBalance,
        variance: branchVariance,
        shortageAmount:
          shortage != null
            ? this.decimalToNumber(shortage.amountOriginal)
            : branchVariance < 0
              ? Math.abs(branchVariance)
              : null,
        outstandingAmount:
          shortage != null
            ? this.decimalToNumber(shortage.amountOutstanding)
            : null,
        status: shortage?.status ?? (branchVariance < 0 ? 'SHORT' : 'OVER'),
        notes: shortage?.notes ?? input.operation.closingNotes,
        occurredAt:
          input.operation.closedAt?.toISOString() ??
          input.operation.openedAt.toISOString(),
      });
    }

    for (const shortage of input.cashShortages) {
      if (usedShortageIds.has(shortage.id)) continue;
      rows.push({
        id: `shortage-${shortage.id}`,
        source: this.shortageSourceLabel(shortage.sourceType),
        personName: shortage.responsibleUser.displayName,
        personPublicId: shortage.responsibleUser.publicId,
        expectedAmount: null,
        actualAmount: null,
        variance: -this.decimalToNumber(shortage.amountOriginal),
        shortageAmount: this.decimalToNumber(shortage.amountOriginal),
        outstandingAmount: this.decimalToNumber(shortage.amountOutstanding),
        status: shortage.status,
        notes: shortage.notes,
        occurredAt: shortage.createdAt.toISOString(),
      });
    }

    return rows.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  private shortageSourceLabel(sourceType: CashShortageSource) {
    if (sourceType === CashShortageSource.AGENT_FLOAT_RETURN) {
      return 'Officer handover';
    }
    if (sourceType === CashShortageSource.BRANCH_CLOSE) {
      return 'Branch close';
    }
    return 'Manual shortage';
  }

  private buildLoansByProduct(
    loans: Awaited<ReturnType<OperationsRepository['listLoansIssuedToday']>>,
  ) {
    const map = new Map<
      string,
      {
        product: string;
        count: number;
        amount: number;
        recoveredToday: number;
        outstandingBalance: number;
      }
    >();
    for (const loan of loans) {
      const product = loan.templateName?.trim() || 'Loan';
      const principal = this.decimalToNumber(loan.principalAmount);
      const recovered = this.roundMoney(
        (loan.loan?.repayments ?? []).reduce(
          (total, repayment) => total + this.decimalToNumber(repayment.amount),
          0,
        ),
      );
      const outstanding = loan.loan
        ? this.decimalToNumber(loan.loan.balance)
        : this.roundMoney(Math.max(principal - recovered, 0));
      const current = map.get(product) ?? {
        product,
        count: 0,
        amount: 0,
        recoveredToday: 0,
        outstandingBalance: 0,
      };
      current.count += 1;
      current.amount = this.roundMoney(current.amount + principal);
      current.recoveredToday = this.roundMoney(
        current.recoveredToday + recovered,
      );
      current.outstandingBalance = this.roundMoney(
        current.outstandingBalance + outstanding,
      );
      map.set(product, current);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }

  private buildFeesByProduct(
    loans: Awaited<ReturnType<OperationsRepository['listLoansIssuedToday']>>,
  ) {
    const map = new Map<
      string,
      { product: string; count: number; amount: number }
    >();
    for (const loan of loans) {
      const fee = this.decimalToNumber(loan.processingFee);
      if (fee <= 0) continue;
      const product = loan.templateName?.trim() || 'Loan';
      const current = map.get(product) ?? {
        product,
        count: 0,
        amount: 0,
      };
      current.count += 1;
      current.amount = this.roundMoney(current.amount + fee);
      map.set(product, current);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }

  private buildRepaymentsByProduct(
    repayments: Awaited<
      ReturnType<OperationsRepository['listCollectionsWithProduct']>
    >,
  ) {
    const map = new Map<
      string,
      { product: string; count: number; amount: number }
    >();
    for (const repayment of repayments) {
      const product =
        repayment.loan.application?.templateName?.trim() || 'Loan repayment';
      const current = map.get(product) ?? {
        product,
        count: 0,
        amount: 0,
      };
      current.count += 1;
      current.amount = this.roundMoney(
        current.amount + this.decimalToNumber(repayment.amount),
      );
      map.set(product, current);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }

  private buildDailyReportCode(operationDate: string) {
    const [year, month, day] = operationDate.split('-');
    if (!year || !month || !day || year.length < 4) {
      return `DR${operationDate.replaceAll('-', '')}`;
    }
    return `DR${day}${month}${year.slice(2)}`;
  }

  private toReportContract(
    report: OperationReportRecord,
  ): DailyOperationReportContract {
    return {
      id: report.id,
      operationId: report.operationId,
      reportNumber: report.reportNumber,
      operationDate: this.formatDateLabel(report.operationDate),
      status: report.status,
      generatedAt: report.generatedAt.toISOString(),
      managerReviewedAt: report.managerReviewedAt?.toISOString() ?? null,
      managerReviewedByName: report.managerReviewedBy?.displayName ?? null,
      managerNotes: report.managerNotes,
      ownerApprovedAt: report.ownerApprovedAt?.toISOString() ?? null,
      ownerApprovedByName: report.ownerApprovedBy?.displayName ?? null,
      ownerNotes: report.ownerNotes,
      returnedAt: report.returnedAt?.toISOString() ?? null,
      returnedByName: report.returnedBy?.displayName ?? null,
      returnNotes: report.returnNotes,
      snapshot: report.snapshot,
    };
  }

  private parseOwnerReportStatus(
    value?: string,
    options?: { includeManagerReview?: boolean },
  ) {
    if (!value?.trim() || value === 'all') return null;
    const status = value.trim().toUpperCase();
    const allowed: BranchOperationReportStatus[] = [
      BranchOperationReportStatus.SENT_TO_OWNER,
      BranchOperationReportStatus.OWNER_APPROVED,
      BranchOperationReportStatus.RETURNED_TO_MANAGER,
      ...(options?.includeManagerReview
        ? [BranchOperationReportStatus.MANAGER_REVIEW]
        : []),
    ];
    if (!allowed.includes(status as BranchOperationReportStatus)) {
      throw new BadRequestException('Choose a valid report status.');
    }
    return status as BranchOperationReportStatus;
  }

  private reportSnapshotSummary(snapshot: Prisma.JsonValue) {
    const root =
      snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
        ? (snapshot as Prisma.JsonObject)
        : {};
    const summary =
      root.summary && typeof root.summary === 'object'
        ? (root.summary as Prisma.JsonObject)
        : {};

    return {
      expectedClosingBalance: this.snapshotNumber(
        summary,
        'expectedClosingBalance',
      ),
      countedCash: this.snapshotNumberOrNull(summary, 'countedCash'),
      variance: this.snapshotNumberOrNull(summary, 'variance'),
      loansIssuedCount: this.snapshotNumber(summary, 'loansIssuedCount'),
      loansIssuedPrincipal: this.snapshotNumber(
        summary,
        'loansIssuedPrincipal',
      ),
      collectionsReceived: this.snapshotNumber(summary, 'collectionsReceived'),
      processingFees: this.snapshotNumber(summary, 'processingFees'),
      expenses: this.snapshotNumber(summary, 'expenses'),
      cashReturnedByAgents: this.snapshotNumber(
        summary,
        'cashReturnedByAgents',
      ),
    };
  }

  private snapshotNumber(source: Prisma.JsonObject, key: string) {
    return this.snapshotNumberOrNull(source, key) ?? 0;
  }

  private snapshotNumberOrNull(source: Prisma.JsonObject, key: string) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private toAgentReturnContracts(
    agentFloats: Awaited<
      ReturnType<OperationsRepository['listAgentFloatsForOperation']>
    >,
    loansByAgentRows: Awaited<
      ReturnType<OperationsRepository['sumLoansIssuedByAgent']>
    >,
    collectionsByAgentRows: Awaited<
      ReturnType<OperationsRepository['sumCollectionsByAgent']>
    >,
  ): DailyOperationAgentReturnContract[] {
    const loansByAgent = new Map(
      loansByAgentRows.map((row) => [
        row.officerUserId,
        this.decimalToNumber(row._sum.principalAmount),
      ]),
    );
    const feesByAgent = new Map(
      loansByAgentRows.map((row) => [
        row.officerUserId,
        this.decimalToNumber(row._sum.processingFee),
      ]),
    );
    const collectionsByAgent = new Map(
      collectionsByAgentRows.map((row) => [
        row.recordedByUserId,
        this.decimalToNumber(row._sum.amount),
      ]),
    );

    return agentFloats.map((float) => {
      const amountGiven = this.decimalToNumber(float.amountGiven);
      const amountDisbursed = loansByAgent.get(float.agentId) ?? 0;
      const processingFees = feesByAgent.get(float.agentId) ?? 0;
      const amountCollected = collectionsByAgent.get(float.agentId) ?? 0;
      const expectedReturn = this.roundMoney(
        amountGiven - amountDisbursed + amountCollected + processingFees,
      );
      const amountReturned =
        float.amountReturned == null
          ? null
          : this.decimalToNumber(float.amountReturned);
      const variance =
        amountReturned == null
          ? null
          : this.roundMoney(amountReturned - expectedReturn);
      const status =
        amountReturned == null
          ? 'PENDING'
          : variance == null || variance === 0
            ? 'RETURNED'
            : variance < 0
              ? 'SHORT'
              : 'OVER';

      return {
        floatId: float.id,
        agentId: float.agentId,
        agentName: float.agent.displayName,
        agentPublicId: float.agent.publicId ?? null,
        amountGiven,
        amountDisbursed,
        processingFees,
        amountCollected,
        expectedReturn,
        amountReturned,
        variance,
        returnedAt: float.returnedAt?.toISOString() ?? null,
        returnedByName: float.returnedBy?.displayName ?? null,
        notes: float.returnNotes,
        status,
      };
    });
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
    if (!user.permissions.includes(OPERATIONS_PERMISSIONS.read)) {
      throw new ForbiddenException('Missing permission to view operations.');
    }
  }

  private assertCanOpen(user: AuthenticatedUser) {
    this.assertTenant(user);
    this.assertCanOperateBranch(user);
    if (!user.permissions.includes(OPERATIONS_PERMISSIONS.open)) {
      throw new ForbiddenException('Missing permission to open branch.');
    }
  }

  private assertCanTopUp(user: AuthenticatedUser) {
    this.assertTenant(user);
    this.assertCanOperateBranch(user);
    const allowed =
      user.permissions.includes(OPERATIONS_PERMISSIONS.cashTopUp) ||
      user.permissions.includes(OPERATIONS_PERMISSIONS.open);
    if (!allowed) {
      throw new ForbiddenException('Missing permission to add cash.');
    }
  }

  private assertCanCreateExpense(user: AuthenticatedUser) {
    this.assertTenant(user);
    this.assertCanOperateBranch(user);
    if (!user.permissions.includes(OPERATIONS_PERMISSIONS.expenseCreate)) {
      throw new ForbiddenException('Missing permission to record expenses.');
    }
  }

  private assertCanReturnFloat(user: AuthenticatedUser) {
    this.assertTenant(user);
    this.assertCanOperateBranch(user);
    if (!user.permissions.includes(OPERATIONS_PERMISSIONS.floatReturn)) {
      throw new ForbiddenException('Missing permission to record returns.');
    }
  }

  private assertCanClose(user: AuthenticatedUser) {
    this.assertTenant(user);
    this.assertCanOperateBranch(user);
    if (!user.permissions.includes(OPERATIONS_PERMISSIONS.close)) {
      throw new ForbiddenException('Missing permission to close branch.');
    }
  }

  private assertCanReviewReport(user: AuthenticatedUser) {
    this.assertTenant(user);
    this.assertCanOperateBranch(user);
    const allowed =
      user.permissions.includes(OPERATIONS_PERMISSIONS.reportReview) ||
      user.permissions.includes(OPERATIONS_PERMISSIONS.close);
    if (!allowed) {
      throw new ForbiddenException('Missing permission to review reports.');
    }
  }

  private assertCanOwnerApproveReport(user: AuthenticatedUser) {
    this.assertTenant(user);
    const allowed =
      user.permissions.includes(OPERATIONS_PERMISSIONS.approve) &&
      user.permissions.includes(BRANCH_PERMISSIONS.create);
    if (!allowed) {
      throw new ForbiddenException('Missing permission to approve reports.');
    }
  }

  private assertCanOperateBranch(user: AuthenticatedUser) {
    if (user.permissions.includes(BRANCH_PERMISSIONS.create)) {
      throw new ForbiddenException(
        'Branch operations are handled by branch managers.',
      );
    }
    if (!user.branchId) {
      throw new ForbiddenException('Branch scope is required.');
    }
  }

  private assertCanChangeDay(dateOnly: Date) {
    const label = this.formatDateLabel(dateOnly);
    const today = this.currentBusinessDateLabel();
    if (label === today) return;
    // After close + report, the next day may open immediately and remain editable.
    if (label === this.nextDateLabel(this.parseDayBounds(today).dateOnly)) {
      return;
    }
    throw new BadRequestException("Only today's records can be changed.");
  }

  private isAutoOpenableDate(dateLabel: string) {
    const today = this.currentBusinessDateLabel();
    if (dateLabel === today) return true;
    return (
      dateLabel === this.nextDateLabel(this.parseDayBounds(today).dateOnly)
    );
  }

  private assertTenant(user: AuthenticatedUser) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Tenant scope is required.');
    }
  }

  private broadcastOperationEvent(
    event: string,
    payload: Record<string, unknown>,
  ) {
    const tenantId = payload.tenantId;
    const branchId = payload.branchId;
    if (typeof tenantId !== 'string' || typeof branchId !== 'string') return;
    this.realtime.emitToBranch(tenantId, branchId, event, payload);
    this.realtime.emitToTenant(tenantId, event, payload);
  }

  private currentBusinessHour() {
    const shifted = new Date(
      Date.now() + this.businessUtcOffsetMinutes * 60 * 1000,
    );
    return shifted.getUTCHours();
  }

  private isReportSubmitted(
    status: BranchOperationReportStatus | null | undefined,
  ) {
    return (
      status === BranchOperationReportStatus.SENT_TO_OWNER ||
      status === BranchOperationReportStatus.OWNER_APPROVED
    );
  }

  private async assertPreviousDayReportSubmitted(previousClosed: {
    id: string;
    tenantId: string;
    operationDate: Date;
  }) {
    const report = await this.repository.findReportForOperation({
      tenantId: previousClosed.tenantId,
      operationId: previousClosed.id,
    });
    if (!report) {
      throw new BadRequestException(
        `Submit the close report for ${this.formatDateLabel(previousClosed.operationDate)} before opening a new day.`,
      );
    }
    if (!this.isReportSubmitted(report.status)) {
      throw new BadRequestException(
        `Submit the close report for ${this.formatDateLabel(previousClosed.operationDate)} before opening a new day.`,
      );
    }
  }

  private async findLatestNonEmptyClosedBefore(input: {
    tenantId: string;
    branchId: string;
    beforeDate: Date;
  }) {
    let beforeDate = input.beforeDate;
    for (;;) {
      const previousClosed = await this.repository.findLatestClosedBefore({
        tenantId: input.tenantId,
        branchId: input.branchId,
        beforeDate,
      });
      if (!previousClosed) return null;

      const bounds = this.parseDayBounds(
        this.formatDateLabel(previousClosed.operationDate),
      );
      if (!(await this.isEmptyClosedOperation(previousClosed, bounds))) {
        return previousClosed;
      }

      this.logger.log(
        `Ignoring empty closed operation ${previousClosed.id} for ${previousClosed.branch.name} (${this.formatDateLabel(previousClosed.operationDate)})`,
      );
      beforeDate = previousClosed.operationDate;
    }
  }

  private async isEmptyClosedOperation(
    operation: NonNullable<
      Awaited<ReturnType<OperationsRepository['findOperationForDay']>>
    >,
    bounds: ReturnType<OperationsService['parseDayBounds']>,
  ) {
    if (operation.status !== BranchOperationStatus.CLOSED) return false;
    if (operation.closingBalance == null || operation.closedAt == null) {
      return false;
    }

    const [topUps, expenses, agentFloats, loans, collections, report] =
      await Promise.all([
        this.prisma.branchOperationTopUp.count({
          where: { tenantId: operation.tenantId, operationId: operation.id },
        }),
        this.prisma.branchOperationExpense.count({
          where: { tenantId: operation.tenantId, operationId: operation.id },
        }),
        this.prisma.agentDailyFloat.count({
          where: {
            tenantId: operation.tenantId,
            branchId: operation.branchId,
            floatDate: operation.operationDate,
          },
        }),
        this.prisma.loanApplication.count({
          where: {
            tenantId: operation.tenantId,
            branchId: operation.branchId,
            status: LoanApplicationStatus.SUBMITTED,
            submittedAt: {
              gte: bounds.dayStart,
              lte: bounds.dayEnd,
            },
          },
        }),
        this.prisma.repayment.count({
          where: {
            tenantId: operation.tenantId,
            branchId: operation.branchId,
            paidAt: {
              gte: bounds.dayStart,
              lte: bounds.dayEnd,
            },
          },
        }),
        this.prisma.branchOperationReport.count({
          where: { tenantId: operation.tenantId, operationId: operation.id },
        }),
      ]);

    return topUps + expenses + agentFloats + loans + collections + report === 0;
  }

  private async retireEmptyUnclosedOperationsBefore(input: {
    tenantId: string;
    branchId: string;
    beforeDate: Date;
  }) {
    let retired = 0;
    for (;;) {
      const pending = await this.repository.findOldestUnclosedBefore({
        tenantId: input.tenantId,
        branchId: input.branchId,
        beforeDate: input.beforeDate,
      });
      if (!pending) {
        break;
      }

      const empty = await this.isEmptyUnclosedOperation(pending);
      if (!empty) break;

      await this.prisma.branchDailyOperation.delete({
        where: { id: pending.id },
      });
      retired += 1;
      this.logger.log(
        `Retired empty operation ${pending.id} for ${pending.branch.name} (${this.formatDateLabel(pending.operationDate)})`,
      );
    }
    return retired;
  }

  private async isEmptyUnclosedOperation(
    operation: NonNullable<
      Awaited<ReturnType<OperationsRepository['findOperationForDay']>>
    >,
  ) {
    if (operation.status === BranchOperationStatus.CLOSED) return false;
    if (operation.closingBalance != null || operation.closedAt != null) {
      return false;
    }

    if (operation.status === BranchOperationStatus.OPEN &&
        this.decimalToNumber(operation.cashAddedToday) !== 0) {
      return false;
    }

    const bounds = this.parseDayBounds(
      this.formatDateLabel(operation.operationDate),
    );
    const [topUps, expenses, agentFloats, loans, collections, report] =
      await Promise.all([
        this.prisma.branchOperationTopUp.count({
          where: { tenantId: operation.tenantId, operationId: operation.id },
        }),
        this.prisma.branchOperationExpense.count({
          where: { tenantId: operation.tenantId, operationId: operation.id },
        }),
        this.prisma.agentDailyFloat.count({
          where: {
            tenantId: operation.tenantId,
            branchId: operation.branchId,
            floatDate: operation.operationDate,
          },
        }),
        this.prisma.loanApplication.count({
          where: {
            tenantId: operation.tenantId,
            branchId: operation.branchId,
            status: LoanApplicationStatus.SUBMITTED,
            submittedAt: {
              gte: bounds.dayStart,
              lte: bounds.dayEnd,
            },
          },
        }),
        this.prisma.repayment.count({
          where: {
            tenantId: operation.tenantId,
            branchId: operation.branchId,
            paidAt: {
              gte: bounds.dayStart,
              lte: bounds.dayEnd,
            },
          },
        }),
        this.prisma.branchOperationReport.count({
          where: { tenantId: operation.tenantId, operationId: operation.id },
        }),
      ]);

    return topUps + expenses + agentFloats + loans + collections + report === 0;
  }

  /**
   * Auto-open each branch at 00:05 Africa/Kampala when yesterday is closed
   * and its report has been submitted. Agents still unlock at 06:00.
   */
  @Cron('5 0 * * *', { timeZone: 'Africa/Kampala' })
  async autoOpenBusinessDaysCron() {
    const dateLabel = this.currentBusinessDateLabel();
    const bounds = this.parseDayBounds(dateLabel);
    const branches = await this.prisma.branch.findMany({
      select: { id: true, tenantId: true, name: true },
    });

    for (const branch of branches) {
      try {
        await this.autoOpenBranchIfEligible({
          tenantId: branch.tenantId,
          branchId: branch.id,
          branchName: branch.name,
          bounds,
        });
      } catch (error) {
        this.logger.warn(
          `Auto-open skipped for branch ${branch.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }

  private async autoOpenBranchIfEligible(input: {
    tenantId: string;
    branchId: string;
    branchName: string;
    bounds: ReturnType<OperationsService['parseDayBounds']>;
    openedByUserId?: string;
    allowFirstDay?: boolean;
  }) {
    await this.retireEmptyUnclosedOperationsBefore({
      tenantId: input.tenantId,
      branchId: input.branchId,
      beforeDate: input.bounds.dateOnly,
    });

    const existing = await this.repository.findOperationForDay({
      tenantId: input.tenantId,
      branchId: input.branchId,
      operationDate: input.bounds.dateOnly,
    });
    if (existing) return existing;

    const [previousClosed, pendingClosure] = await Promise.all([
      this.findLatestNonEmptyClosedBefore({
        tenantId: input.tenantId,
        branchId: input.branchId,
        beforeDate: input.bounds.dateOnly,
      }),
      this.repository.findOldestUnclosedBefore({
        tenantId: input.tenantId,
        branchId: input.branchId,
        beforeDate: input.bounds.dateOnly,
      }),
    ]);

    if (pendingClosure) return null;

    let openingBalance = 0;
    let openedByUserId = input.openedByUserId ?? null;

    if (previousClosed) {
      const report = await this.repository.findReportForOperation({
        tenantId: input.tenantId,
        operationId: previousClosed.id,
      });
      if (!report || !this.isReportSubmitted(report.status)) return null;

      openingBalance = this.decimalToNumber(previousClosed.closingBalance);
      openedByUserId =
        openedByUserId ??
        previousClosed.closedByUserId ??
        previousClosed.openedByUserId;
    } else if (!input.allowFirstDay) {
      return null;
    }

    if (!openedByUserId) return null;

    try {
      await this.billingService.assertBranchSubscriptionActive(
        input.tenantId,
        input.branchId,
      );
    } catch {
      return null;
    }

    const operation = await this.repository.openBranch({
      tenantId: input.tenantId,
      branchId: input.branchId,
      operationDate: input.bounds.dateOnly,
      openedAt: new Date(),
      openedByUserId,
      openingBalance: new Prisma.Decimal(openingBalance),
      cashAddedToday: new Prisma.Decimal(0),
      cashAvailableAtOpening: new Prisma.Decimal(openingBalance),
      floatSetAside: new Prisma.Decimal(openingBalance),
      notes: previousClosed
        ? 'Opened automatically for the new business day.'
        : 'Opened automatically for the first business day.',
    });

    this.broadcastOperationEvent(OPERATIONS_EVENTS.branchOpened, {
      operationId: operation.id,
      tenantId: operation.tenantId,
      branchId: operation.branchId,
      operationDate: input.bounds.dateLabel,
      status: operation.status,
      autoOpened: true,
    });
    this.logger.log(
      `Auto-opened ${input.branchName} (${input.branchId}) for ${input.bounds.dateLabel}`,
    );
    return operation;
  }

  private nextDateLabel(value: Date) {
    const label = this.formatDateLabel(value);
    const [year, month, day] = label.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return this.formatDateLabel(next);
  }

  private parseDayBounds(date?: string) {
    const base = this.parseDateInput(
      date?.trim() ? date.trim() : this.currentBusinessDateLabel(),
    );
    const dateOnly = this.toDateOnly(base);
    const dayStart = new Date(
      Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()) -
        this.businessUtcOffsetMinutes * 60 * 1000,
    );
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
    return {
      dayStart,
      dayEnd,
      dateLabel: this.formatDateLabel(dateOnly),
      dateOnly,
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

  private currentBusinessDateLabel() {
    const shifted = new Date(
      Date.now() + this.businessUtcOffsetMinutes * 60 * 1000,
    );
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
