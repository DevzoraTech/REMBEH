import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchOperationReportStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  getPrismaUniqueConstraintTargets,
  isPrismaUniqueConstraintError,
} from '../../common/database/prisma-errors';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { BillingService } from '../billing/billing.service';
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
  private readonly businessUtcOffsetMinutes = 180;

  constructor(
    private readonly repository: OperationsRepository,
    private readonly realtime: RealtimeGateway,
    private readonly billingService: BillingService,
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
        operation: null,
        report: null,
      };
    }

    const [operation, previousClosed, pendingClosure] = await Promise.all([
      this.repository.findOperationForDay({
        tenantId: user.tenantId,
        branchId: branch.id,
        operationDate: bounds.dateOnly,
      }),
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
      : null;

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

    if (!user.branchId) {
      return {
        date: bounds.dateLabel,
        branch: null,
        branchStatus: null,
        canUseApp: false,
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
        lockReason: 'BRANCH_NOT_OPEN',
        lockTitle: 'Branch Not Open!',
        lockMessage:
          'Your branch manager has not opened today’s operations yet.',
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
        lockReason: 'BRANCH_CLOSED',
        lockTitle:
          operation.status === 'CLOSING'
            ? 'Branch is closing'
            : 'Branch closed',
        lockMessage:
          operation.status === 'CLOSING'
            ? 'Your branch is closing for today. You cannot continue field work.'
            : 'Your branch has closed for today. You cannot use the agent app again today.',
        float: floatSummary,
      };
    }

    if (returnedAt) {
      return {
        date: bounds.dateLabel,
        branch: branchContract,
        branchStatus: operation.status,
        canUseApp: false,
        lockReason: 'AGENT_DAY_CLOSED',
        lockTitle: 'Your day is closed',
        lockMessage:
          'Your cash handover has been recorded for today. You cannot use the agent app again today.',
        float: floatSummary,
      };
    }

    return {
      date: bounds.dateLabel,
      branch: branchContract,
      branchStatus: operation.status,
      canUseApp: true,
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
      branchId: managerScoped
        ? user.branchId
        : options?.branchId || null,
      status,
      fromDate,
      toDate,
      includeManagerReview: managerScoped,
    });

    return {
      reports: reports.map((report) => {
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
          ownerApprovedAt: report.ownerApprovedAt?.toISOString() ?? null,
          ownerApprovedByName: report.ownerApprovedBy?.displayName ?? null,
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
      }),
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
    const existing = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });

    if (existing) {
      throw new ConflictException('This branch is already open for this day.');
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

    if (pendingClosure) {
      throw new BadRequestException(
        `Close ${this.formatDateLabel(pendingClosure.operationDate)} before opening a new day.`,
      );
    }

    const openingBalance = previousClosed
      ? this.decimalToNumber(previousClosed.closingBalance)
      : dto.openingBalance;

    if (openingBalance == null || Number.isNaN(openingBalance)) {
      throw new BadRequestException(
        'Enter the opening balance for the first operating day.',
      );
    }

    const cashAvailableAtOpening = this.roundMoney(
      openingBalance + dto.cashAddedToday,
    );
    const floatSetAside = this.roundMoney(dto.floatSetAside);

    if (floatSetAside > cashAvailableAtOpening) {
      throw new BadRequestException(
        'Assignable float limit cannot be more than available cash.',
      );
    }

    const operation = await this.repository
      .openBranch({
        tenantId: user.tenantId,
        branchId: branch.id,
        operationDate: bounds.dateOnly,
        openedAt: new Date(),
        openedByUserId: user.userId,
        openingBalance: new Prisma.Decimal(openingBalance),
        cashAddedToday: new Prisma.Decimal(dto.cashAddedToday),
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
    this.assertCanChangeDay(bounds.dateOnly);
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

    return this.getToday(user, {
      branchId: report.branchId,
      date: this.formatDateLabel(report.operationDate),
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
    this.assertCanChangeDay(bounds.dateOnly);
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
    const floatSetAside = this.floatSetAsideAmount(operation);
    const totalAlreadyIssued = this.decimalToNumber(floatAgg._sum.amountGiven);
    const expensesTotal = this.decimalToNumber(expensesAgg._sum.amount);
    const cashReturnedByAgents = this.decimalToNumber(
      returnedAgg._sum.amountReturned,
    );
    const branchCashAvailableForThisAgent = this.roundMoney(
      cashAvailableAtOpening -
        expensesTotal -
        totalAlreadyIssued +
        cashReturnedByAgents,
    );
    const setAsideAvailableForThisAgent = this.roundMoney(
      floatSetAside - totalAlreadyIssued,
    );
    const availableForThisAgent = Math.max(
      0,
      Math.min(branchCashAvailableForThisAgent, setAsideAvailableForThisAgent),
    );

    if (input.amountGiven > availableForThisAgent) {
      if (setAsideAvailableForThisAgent <= branchCashAvailableForThisAgent) {
        throw new BadRequestException(
          `Float exceeds assignable float limit. Available: ${availableForThisAgent}.`,
        );
      }
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
    ]);

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
    const floatRemaining = this.roundMoney(
      Math.max(floatSetAside - floatIssued, 0),
    );
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
      closingVariance:
        closingBalance == null
          ? null
          : this.roundMoney(closingBalance - expectedClosingBalance),
      closingNotes: operation.closingNotes,
      loansIssuedCount: loansAgg._count._all,
      loansIssuedPrincipal,
      collectionsCount: collectionsAgg._count._all,
      collectionsReceived,
      notes: operation.notes,
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

    const reportNumber = this.buildReportNumber(operation.id, contract);
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
    operationId: string,
    contract: DailyOperationContract,
  ) {
    return `DOR-${contract.operationDate.replaceAll('-', '')}-${operationId
      .slice(0, 8)
      .toUpperCase()}`;
  }

  private buildReportSnapshot(
    operation: DailyOperationContract,
  ): Prisma.InputJsonObject {
    return {
      version: 1,
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
      closingNotes: operation.closingNotes,
      generatedAt: new Date().toISOString(),
    };
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
    if (this.formatDateLabel(dateOnly) !== this.currentBusinessDateLabel()) {
      throw new BadRequestException("Only today's records can be changed.");
    }
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
