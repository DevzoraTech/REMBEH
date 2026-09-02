import { StartOperationReconciliationDto } from './dto/start-operation-reconciliation.dto';
import { UpdateOperationCashCountDto } from './dto/update-operation-reconciliation';
import { SubmitOperationReconciliationDto } from './dto/submit-operation-reconciliation';
import { UpdateOperationExpenseDto } from './dto/update-operation-expense.dto';
import { VoidOperationExpenseDto } from './dto/void-operation-expense.dto';
import { UpdateOperationReconciliationNotesDto } from './dto/update-operation-reconciliation-notes.dto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  BranchOperationExpensePaidFrom,
  BranchOperationReportStatus,
  BranchOperationStatus,
  CashShortageSource,
  LoanApplicationStatus,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  getPrismaUniqueConstraintTargets,
  isPrismaUniqueConstraintError,
} from '../../common/database/prisma-errors';
import { PrismaService } from '../../database/prisma.service';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { BillingService } from '../billing/billing.service';
import { CashShortagesService } from '../cash-shortages/cash-shortages.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { OpenBranchOperationDto } from './dto/open-branch-operation.dto';
import {
  RecordAgentReturnDto,
  RecordOwnAgentReturnDto,
} from './dto/record-agent-return.dto';
import { RecordOperationExpenseDto } from './dto/record-operation-expense.dto';
import { RecordOperationTopUpDto } from './dto/record-operation-top-up.dto';
import { ReviewOperationReportDto } from './dto/review-operation-report.dto';
import {
  AgentDailyOperationResponseContract,
  BranchOperationReconciliationContract,
  DailyOperationBranchAccessContract,
  DailyOperationAgentReturnContract,
  DailyOperationCarryoverContract,
  DailyOperationContract,
  DailyOperationExpenseContract,
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

type OperationReportRecord = {
  id: string;
  operationId: string;
  branchId: string;
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

  /**
   * Agents may use the full field workspace from 06:00 Africa/Kampala
   * after the branch day is open.
   */
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
    options?: {
      branchId?: string;
      date?: string;
    },
  ): Promise<DailyOperationResponseContract> {
    this.assertCanRead(user);

    const branch = await this.resolveBranch(user, options?.branchId);
    const bounds = this.parseDayBounds(options?.date);

    if (!branch) {
      return {
        date: bounds.dateLabel,
        branch: null,
        branchAccess: null,
        openingBalance: null,
        openingBalanceSource: 'MANUAL',
        previousClosedOperation: null,
        pendingClosureOperation: null,
        awaitingReportOperation: null,
        operation: null,
        reconciliation: null,
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

    const reconciliation =
      operation && operationContract
        ? await this.getReconciliationContract({
            tenantId: user.tenantId,
            operationId: operation.id,
            expectedClosingBalance: operationContract.expectedClosingBalance,
          })
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
      branchAccess: await this.getBranchAccessContract(
        user.tenantId,
        branch.id,
      ),
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
      reconciliation,
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
        canRecordExpense: false,
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
        canRecordExpense: false,
        float: emptyFloat,
      };
    }

    const branchContract = {
      id: branch.id,
      name: branch.name,
      address: branch.address,
    };

    if (this.isAutoOpenableDate(bounds.dateLabel)) {
      await this.autoOpenBranchIfEligible({
        tenantId: user.tenantId,
        branchId: branch.id,
        branchName: branch.name,
        bounds,
        openedByUserId: user.userId,
        allowFirstDay: true,
      });
    }

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
        canRecordExpense: false,
        float: emptyFloat,
      };
    }

    const [float, loansAgg, disbursementsAgg, collectionsAgg, expensesAgg, expenseRows] =
      await Promise.all([
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
        this.repository.sumLoanDisbursementsForAgent({
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
        this.repository.sumExpensesForOperation({
          tenantId: user.tenantId,
          operationId: operation.id,
          paidFrom: BranchOperationExpensePaidFrom.AGENT_FLOAT,
          agentId: user.userId,
        }),
        this.repository.listExpensesForOperation({
          tenantId: user.tenantId,
          operationId: operation.id,
          agentId: user.userId,
        }),
      ]);

    const amountReceived = this.decimalToNumber(float?.amountGiven);

    const amountDisbursed = this.decimalToNumber(disbursementsAgg._sum.amount);
    const assignedFloatDisbursed = this.decimalToNumber(
      disbursementsAgg._sum.assignedFloatAmount,
    );
    const collectedRepaymentsDisbursed = this.decimalToNumber(
      disbursementsAgg._sum.collectedRepaymentsAmount,
    );

    const processingFees = this.decimalToNumber(loansAgg._sum.processingFee);

    const amountCollected = this.decimalToNumber(collectionsAgg._sum.amount);

    const unusedFloat = this.roundMoney(
      amountReceived - assignedFloatDisbursed,
    );
    const collectedRepaymentsAvailable = this.roundMoney(
      amountCollected - collectedRepaymentsDisbursed,
    );

    const expensesTotal = this.decimalToNumber(expensesAgg._sum.amount);
    const expenses = expenseRows
      .filter((row) => !row.voidedAt)
      .map((row) => this.toExpenseContract(row));

    const expectedHandover = this.roundMoney(
      unusedFloat +
        collectedRepaymentsAvailable +
        processingFees -
        expensesTotal,
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
      collectedRepaymentsAvailable,
      unusedFloat,
      expectedHandover,
      expensesTotal,
      expenses,
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
        canRecordExpense: false,
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
        canRecordExpense: false,
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
        canRecordExpense: false,
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
      canRecordExpense:
        user.permissions.includes(OPERATIONS_PERMISSIONS.agentExpenseCreate) &&
        branch.agentFieldExpensesEnabled,
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

    if (managerScoped && !user.branchId) {
      throw new ForbiddenException('Branch scope is required.');
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

    return {
      report: this.toOwnerReportListItem(report),
    };
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
    operation: {
      branch: {
        name: string;
      };
    };
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
        `Close ${this.formatDateLabel(
          pendingClosure.operationDate,
        )} before opening a new day.`,
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

    // No separate float ceiling at open.
    // Cash on hand is the practical maximum.
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

    return this.getToday(user, {
      branchId: branch.id,
      date: bounds.dateLabel,
    });
  }

  async recordExpense(
    user: AuthenticatedUser,
    dto: RecordOperationExpenseDto,
  ): Promise<DailyOperationResponseContract | AgentDailyOperationResponseContract> {
    const paidFrom = this.resolveExpensePaidFrom(user, dto.paidFrom);

    if (paidFrom === BranchOperationExpensePaidFrom.AGENT_FLOAT) {
      await this.assertCanCreateAgentExpense(user);
    } else {
      this.assertCanCreateExpense(user);
    }

    const branch = await this.resolveBranch(user, dto.branchId);

    if (!branch) {
      throw new NotFoundException('Branch was not found.');
    }

    await this.billingService.assertBranchSubscriptionActive(
      user.tenantId,
      branch.id,
    );

    const bounds = this.parseDayBounds(dto.date);

    const operation = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });

    if (!operation || operation.status !== BranchOperationStatus.OPEN) {
      throw new BadRequestException(
        'Open the branch before recording expenses.',
      );
    }

    if (paidFrom === BranchOperationExpensePaidFrom.AGENT_FLOAT) {
      await this.assertAgentExpenseFitsFloat({
        user,
        branchId: branch.id,
        operation,
        bounds,
        amount: dto.amount,
      });
    } else {
      const [floatAgg, expensesAgg, returnedAgg] = await Promise.all([
        this.repository.sumFloatIssued({
          tenantId: user.tenantId,
          branchId: branch.id,
          floatDate: operation.operationDate,
        }),
        this.repository.sumExpensesForOperation({
          tenantId: user.tenantId,
          operationId: operation.id,
          paidFrom: BranchOperationExpensePaidFrom.BRANCH_CASH,
        }),
        this.repository.sumFloatReturned({
          tenantId: user.tenantId,
          branchId: branch.id,
          floatDate: operation.operationDate,
        }),
      ]);

      const remainingBeforeExpense = this.roundMoney(
        this.cashAvailableAtOpening(operation) -
          this.decimalToNumber(floatAgg._sum.amountGiven) -
          this.decimalToNumber(expensesAgg._sum.amount) +
          this.decimalToNumber(returnedAgg._sum.amountReturned),
      );

      if (dto.amount > remainingBeforeExpense) {
        throw new BadRequestException(
          `Expense exceeds remaining branch cash. Available: ${remainingBeforeExpense}.`,
        );
      }
    }

    await this.repository.recordExpense({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationId: operation.id,
      amount: new Prisma.Decimal(dto.amount),
      description: dto.description?.trim() || null,
      paidFrom,
      agentId:
        paidFrom === BranchOperationExpensePaidFrom.AGENT_FLOAT
          ? user.userId
          : null,
      incurredAt: new Date(),
      recordedByUserId: user.userId,
      operationDate: operation.operationDate,
      status: operation.status,
    });

    if (paidFrom === BranchOperationExpensePaidFrom.AGENT_FLOAT) {
      return this.getAgentToday(user);
    }

    return this.getToday(user, {
      branchId: branch.id,
      date: bounds.dateLabel,
    });
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

    await this.billingService.assertBranchSubscriptionActive(
      user.tenantId,
      branch.id,
    );

    const bounds = this.parseDayBounds(dto.date);

    const operation = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });

    if (!operation || operation.status !== BranchOperationStatus.OPEN) {
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

    return this.getToday(user, {
      branchId: branch.id,
      date: bounds.dateLabel,
    });
  }

  async recordAgentReturn(
    user: AuthenticatedUser,
    dto: RecordAgentReturnDto,
  ): Promise<DailyOperationResponseContract> {
    this.assertCanReturnFloat(user);

    const response = await this.recordAgentReturnInternal(user, dto, {
      reloadBranchOperation: true,
    });

    if (!response) {
      throw new InternalServerErrorException(
        'Unable to reload branch operation after recording agent return.',
      );
    }

    return response;
  }

  async recordOwnAgentReturn(
    user: AuthenticatedUser,
    dto: RecordOwnAgentReturnDto,
  ): Promise<AgentDailyOperationResponseContract> {
    this.assertTenant(user);
    this.assertCanOperateBranch(user);

    if (!user.branchId) {
      throw new ForbiddenException('Branch scope is required.');
    }

    await this.recordAgentReturnInternal(
      user,
      {
        date: dto.date,
        branchId: user.branchId,
        agentId: user.userId,
        amountReturned: dto.amountReturned,
        shortageReason: dto.shortageReason,
        notes: dto.notes,
      },
      {
        reloadBranchOperation: false,
      },
    );

    return this.getAgentToday(user);
  }

  private async recordAgentReturnInternal(
    user: AuthenticatedUser,
    dto: RecordAgentReturnDto,
    options: { reloadBranchOperation: boolean },
  ): Promise<DailyOperationResponseContract | null> {
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

    if (!operation || operation.status !== BranchOperationStatus.OPEN) {
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

    if (float?.amountReturned != null) {
      throw new BadRequestException(
        'This agent cash handover has already been recorded.',
      );
    }

    /*
     * Calculate the expected handover BEFORE writing anything.
     *
     * Expected handover:
     *
     * float received
     * - loans issued
     * + collections
     * + processing fees
     */
    const [loansAgg, disbursementsAgg, collectionsAgg] = await Promise.all([
      this.repository.sumLoansIssuedForAgent({
        tenantId: user.tenantId,
        branchId: branch.id,
        agentId: dto.agentId,
        dayStart: bounds.dayStart,
        dayEnd: bounds.dayEnd,
      }),
      this.repository.sumLoanDisbursementsForAgent({
        tenantId: user.tenantId,
        branchId: branch.id,
        agentId: dto.agentId,
        dayStart: bounds.dayStart,
        dayEnd: bounds.dayEnd,
      }),

      this.repository.sumCollectionsForAgent({
        tenantId: user.tenantId,
        branchId: branch.id,
        agentId: dto.agentId,
        dayStart: bounds.dayStart,
        dayEnd: bounds.dayEnd,
      }),
    ]);

    const amountGiven = this.decimalToNumber(float?.amountGiven);

    const amountDisbursed = this.decimalToNumber(disbursementsAgg._sum.amount);

    const processingFees = this.decimalToNumber(loansAgg._sum.processingFee);

    const amountCollected = this.decimalToNumber(collectionsAgg._sum.amount);

    const expectedReturn = this.roundMoney(
      amountGiven - amountDisbursed + amountCollected + processingFees,
    );

    const amountReturned = this.roundMoney(dto.amountReturned);

    if (
      !float &&
      amountGiven <= 0 &&
      amountDisbursed <= 0 &&
      processingFees <= 0 &&
      amountCollected <= 0 &&
      amountReturned <= 0
    ) {
      throw new BadRequestException(
        'No cash handover is due for this officer.',
      );
    }

    const handoverVariance = this.roundMoney(amountReturned - expectedReturn);

    /*
     * A shortage must be classified before the
     * cash handover is persisted.
     */
    if (handoverVariance < 0 && !dto.shortageReason) {
      throw new BadRequestException('Choose a reason for the cash shortage.');
    }

    const returnedFloat = await this.repository.recordAgentReturn({
      tenantId: user.tenantId,
      branchId: branch.id,
      agentId: dto.agentId,
      floatDate: operation.operationDate,
      amountReturned: new Prisma.Decimal(amountReturned),
      returnedAt: new Date(),
      returnedByUserId: user.userId,
      notes: dto.notes?.trim() || null,
      operationId: operation.id,
      operationDate: operation.operationDate,
    });

    /*
     * A negative variance becomes an accountable
     * shortage against this agent.
     */
    if (handoverVariance < 0) {
      await this.cashShortagesService.createShortage({
        tenantId: user.tenantId,
        branchId: branch.id,
        responsibleUserId: dto.agentId,
        createdByUserId: user.userId,

        sourceType: CashShortageSource.AGENT_FLOAT_RETURN,

        sourceId: returnedFloat.id,

        reason: dto.shortageReason!,

        operationDate: operation.operationDate,

        amount: Math.abs(handoverVariance),

        notes: dto.notes?.trim() || 'Agent cash handover shortage',
      });
    }

    this.broadcastOperationEvent(OPERATIONS_EVENTS.agentFloatReturned, {
      operationId: operation.id,
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateLabel,
      status: operation.status,

      agentId: dto.agentId,

      floatId: returnedFloat.id,

      amountReturned,
      expectedReturn,
      variance: handoverVariance,

      handoverStatus:
        handoverVariance === 0
          ? 'RETURNED'
          : handoverVariance < 0
            ? 'SHORT'
            : 'OVER',
    });

    if (!options.reloadBranchOperation) {
      return null;
    }

    return this.getToday(user, {
      branchId: branch.id,
      date: bounds.dateLabel,
    });
  }

  /**
   * Starts end-of-day reconciliation.
   *
   * Once reconciliation starts:
   * - every agent must already have handed over;
   * - the branch moves from OPEN -> CLOSING;
   * - field money operations are therefore locked;
   * - the manager may count physical cash repeatedly before submission.
   */

  async updateReconciliationNotes(
    user: AuthenticatedUser,
    dto: UpdateOperationReconciliationNotesDto,
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

    if (!operation) {
      throw new BadRequestException('There is no branch day to reconcile.');
    }

    if (operation.status === BranchOperationStatus.CLOSED) {
      throw new BadRequestException('This branch day has already been closed.');
    }

    let reconciliation = await this.repository.findReconciliationForOperation({
      tenantId: user.tenantId,
      operationId: operation.id,
    });

    if (!reconciliation) {
      const contract = await this.toContract(
        operation,
        bounds.dayStart,
        bounds.dayEnd,
      );

      const pendingReturns = contract.agentReturns.filter(
        (row) => row.amountReturned == null,
      );

      if (pendingReturns.length > 0) {
        throw new BadRequestException(
          'Record all agent cash returns before starting reconciliation.',
        );
      }

      reconciliation = await this.repository.startReconciliation({
        tenantId: user.tenantId,
        branchId: branch.id,
        operationId: operation.id,
        startedByUserId: user.userId,
        notes: dto.notes.trim() || null,
      });
    } else {
      await this.repository.updateReconciliationNotes({
        tenantId: user.tenantId,
        reconciliationId: reconciliation.id,
        updatedByUserId: user.userId,
        notes: dto.notes.trim() || null,
      });
    }

    return this.getToday(user, {
      branchId: branch.id,
      date: bounds.dateLabel,
    });
  }

  /**
   * Finalises reconciliation and closes the business day.
   *
   * The persisted reconciliation.countedCash is authoritative.
   * The client does NOT send the closing balance again here.
   */

  async startReconciliation(
    user: AuthenticatedUser,
    dto: StartOperationReconciliationDto,
  ): Promise<DailyOperationResponseContract> {
    this.assertCanClose(user);

    const branch = await this.resolveBranch(user, dto.branchId);

    if (!branch) {
      throw new NotFoundException('Branch was not found.');
    }

    const bounds = this.parseDayBounds(dto.date);

    /*
     * IMPORTANT:
     *
     * Do not call assertCanChangeDay() here.
     *
     * A previous business day may legitimately remain OPEN/CLOSING
     * until the manager completes reconciliation on a later calendar day.
     */

    const operation = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });

    if (!operation) {
      throw new BadRequestException('There is no branch day to reconcile.');
    }

    if (operation.status === BranchOperationStatus.CLOSED) {
      throw new BadRequestException('This branch day has already been closed.');
    }

    /*
     * Starting reconciliation is idempotent.
     */
    const existingReconciliation =
      await this.repository.findReconciliationForOperation({
        tenantId: user.tenantId,
        operationId: operation.id,
      });

    if (existingReconciliation) {
      return this.getToday(user, {
        branchId: branch.id,
        date: bounds.dateLabel,
      });
    }

    if (
      operation.status !== BranchOperationStatus.OPEN &&
      operation.status !== BranchOperationStatus.CLOSING
    ) {
      throw new BadRequestException('This branch day cannot be reconciled.');
    }

    /*
     * Every agent who received float must first complete
     * their cash handover.
     */
    const operationContract = await this.toContract(
      operation,
      bounds.dayStart,
      bounds.dayEnd,
    );

    const pendingReturns = operationContract.agentReturns.filter(
      (agentReturn) => agentReturn.amountReturned == null,
    );

    if (pendingReturns.length > 0) {
      throw new BadRequestException(
        'Record all agent cash returns before starting reconciliation.',
      );
    }

    await this.repository.startReconciliation({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationId: operation.id,
      startedByUserId: user.userId,
    });

    this.broadcastOperationEvent('operation.reconciliation.started', {
      operationId: operation.id,
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateLabel,
      status: BranchOperationStatus.CLOSING,
    });

    return this.getToday(user, {
      branchId: branch.id,
      date: bounds.dateLabel,
    });
  }

  async updateReconciliationCashCount(
    user: AuthenticatedUser,
    dto: UpdateOperationCashCountDto,
  ): Promise<DailyOperationResponseContract> {
    this.assertCanClose(user);

    const branch = await this.resolveBranch(user, dto.branchId);

    if (!branch) {
      throw new NotFoundException('Branch was not found.');
    }

    const bounds = this.parseDayBounds(dto.date);

    /*
     * Do NOT use assertCanChangeDay().
     *
     * Reconciliation is allowed for an unresolved previous
     * business day.
     */

    const operation = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });

    if (!operation) {
      throw new BadRequestException('There is no branch day to reconcile.');
    }

    if (operation.status === BranchOperationStatus.CLOSED) {
      throw new BadRequestException('This branch day has already been closed.');
    }

    if (
      operation.status !== BranchOperationStatus.OPEN &&
      operation.status !== BranchOperationStatus.CLOSING
    ) {
      throw new BadRequestException(
        'This branch day cannot accept another cash count.',
      );
    }

    let reconciliation = await this.repository.findReconciliationForOperation({
      tenantId: user.tenantId,
      operationId: operation.id,
    });

    /*
     * Defensive handling:
     *
     * If the client submits the first count before explicitly
     * starting reconciliation, create the reconciliation here.
     */
    if (!reconciliation) {
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
          'Record all agent cash handovers before counting branch cash.',
        );
      }

      reconciliation = await this.repository.startReconciliation({
        tenantId: user.tenantId,
        branchId: branch.id,
        operationId: operation.id,
        startedByUserId: user.userId,
        notes: dto.notes?.trim() || null,
      });
    }

    /*
     * Every count is immutable history.
     *
     * The reconciliation itself stores the latest authoritative
     * physical cash value.
     */
    await this.repository.recordReconciliationCashCount({
      tenantId: user.tenantId,
      reconciliationId: reconciliation.id,
      countedAmount: new Prisma.Decimal(this.roundMoney(dto.countedCash)),
      recordedByUserId: user.userId,
    });

    /*
     * If the client supplied a reconciliation note alongside
     * the count, persist it.
     */
    if (dto.notes !== undefined) {
      await this.repository.updateReconciliationNotes({
        tenantId: user.tenantId,
        reconciliationId: reconciliation.id,
        updatedByUserId: user.userId,
        notes: dto.notes?.trim() || null,
      });
    }

    this.broadcastOperationEvent('operation.reconciliation.cash-counted', {
      operationId: operation.id,
      reconciliationId: reconciliation.id,
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateLabel,
      status: operation.status,
      countedCash: this.roundMoney(dto.countedCash),
    });

    return this.getToday(user, {
      branchId: branch.id,
      date: bounds.dateLabel,
    });
  }

  async updateExpense(
    user: AuthenticatedUser,
    expenseId: string,
    dto: UpdateOperationExpenseDto,
  ): Promise<DailyOperationResponseContract | AgentDailyOperationResponseContract> {
    const branch = await this.resolveBranch(user, undefined);

    if (!branch) {
      throw new NotFoundException('Branch was not found.');
    }

    const expense = await this.repository.findExpenseById({
      tenantId: user.tenantId,
      branchId: branch.id,
      expenseId,
    });

    if (!expense) {
      throw new NotFoundException('Expense was not found.');
    }

    await this.assertCanMutateExpense(user, expense);

    if (expense.operation.status !== BranchOperationStatus.OPEN) {
      throw new BadRequestException(
        'Expenses can only be edited while the branch day is open.',
      );
    }

    if (expense.voidedAt) {
      throw new BadRequestException('A voided expense cannot be edited.');
    }

    if (
      dto.amount !== undefined &&
      expense.paidFrom === BranchOperationExpensePaidFrom.AGENT_FLOAT
    ) {
      const bounds = this.parseDayBounds(
        this.formatDateLabel(expense.operation.operationDate),
      );
      await this.assertAgentExpenseFitsFloat({
        user,
        branchId: branch.id,
        operation: expense.operation,
        bounds,
        amount: dto.amount,
        excludeExpenseId: expense.id,
      });
    }

    await this.repository.updateExpense({
      tenantId: user.tenantId,
      expenseId: expense.id,
      actorUserId: user.userId,
      amount:
        dto.amount === undefined ? undefined : new Prisma.Decimal(dto.amount),
      description:
        dto.description === undefined
          ? undefined
          : dto.description.trim() || null,
    });

    if (expense.paidFrom === BranchOperationExpensePaidFrom.AGENT_FLOAT) {
      return this.getAgentToday(user);
    }

    return this.getToday(user, {
      branchId: branch.id,
      date: this.formatDateLabel(expense.operation.operationDate),
    });
  }

  async voidExpense(
    user: AuthenticatedUser,
    expenseId: string,
    dto: VoidOperationExpenseDto,
  ): Promise<DailyOperationResponseContract | AgentDailyOperationResponseContract> {
    const branch = await this.resolveBranch(user, undefined);

    if (!branch) {
      throw new NotFoundException('Branch was not found.');
    }

    const expense = await this.repository.findExpenseById({
      tenantId: user.tenantId,
      branchId: branch.id,
      expenseId,
    });

    if (!expense) {
      throw new NotFoundException('Expense was not found.');
    }

    await this.assertCanMutateExpense(user, expense);

    if (expense.operation.status !== BranchOperationStatus.OPEN) {
      throw new BadRequestException(
        'Expenses can only be voided while the branch day is open.',
      );
    }

    if (expense.voidedAt) {
      throw new BadRequestException('This expense has already been voided.');
    }

    await this.repository.voidExpense({
      tenantId: user.tenantId,
      expenseId: expense.id,
      actorUserId: user.userId,
      reason: dto.reason,
    });

    if (expense.paidFrom === BranchOperationExpensePaidFrom.AGENT_FLOAT) {
      return this.getAgentToday(user);
    }

    return this.getToday(user, {
      branchId: branch.id,
      date: this.formatDateLabel(expense.operation.operationDate),
    });
  }

  async submitReconciliation(
    user: AuthenticatedUser,
    dto: SubmitOperationReconciliationDto,
  ): Promise<DailyOperationResponseContract> {
    this.assertCanClose(user);

    const branch = await this.resolveBranch(user, dto.branchId);

    if (!branch) {
      throw new NotFoundException('Branch was not found.');
    }

    const bounds = this.parseDayBounds(dto.date);

    /*
     * Do NOT call assertCanChangeDay().
     *
     * An unresolved previous business day must remain
     * closable until reconciliation is completed.
     */

    const operation = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateOnly,
    });

    if (!operation) {
      throw new BadRequestException('There is no branch day to close.');
    }

    if (operation.status === BranchOperationStatus.CLOSED) {
      throw new BadRequestException('This branch day has already been closed.');
    }

    if (
      operation.status !== BranchOperationStatus.OPEN &&
      operation.status !== BranchOperationStatus.CLOSING
    ) {
      throw new BadRequestException(
        'This branch day cannot be submitted for reconciliation.',
      );
    }

    const reconciliation = await this.repository.findReconciliationForOperation(
      {
        tenantId: user.tenantId,
        operationId: operation.id,
      },
    );

    if (!reconciliation) {
      throw new BadRequestException(
        'Start reconciliation before submitting the branch close.',
      );
    }

    if (reconciliation.countedCash == null) {
      throw new BadRequestException(
        'Count the physical branch cash before submitting reconciliation.',
      );
    }

    /*
     * Recalculate everything from authoritative server data
     * immediately before closing.
     */
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
        'Record all agent cash returns before submitting reconciliation.',
      );
    }

    const countedCash = this.roundMoney(
      this.decimalToNumber(reconciliation.countedCash),
    );

    const expectedClosingBalance = this.roundMoney(
      contract.expectedClosingBalance,
    );

    const variance = this.roundMoney(countedCash - expectedClosingBalance);

    /*
     * Prefer a note supplied at final submission, otherwise
     * retain the persisted draft reconciliation note.
     */
    const finalNotes =
      dto.notes?.trim() || reconciliation.notes?.trim() || null;

    /*
     * Any difference between expected and physical cash must
     * have an explanation.
     */
    if (variance !== 0 && !finalNotes) {
      throw new BadRequestException(
        'Add a note explaining the cash variance before closing the branch.',
      );
    }

    /*
     * IMPORTANT:
     *
     * We no longer require shortageResponsibleUserId merely
     * because branch variance is negative.
     *
     * Agent shortages were already established during agent
     * balancing. A residual branch discrepancy must not be
     * arbitrarily attributed to an individual.
     */

    if (finalNotes !== reconciliation.notes) {
      await this.repository.updateReconciliationNotes({
        tenantId: user.tenantId,
        reconciliationId: reconciliation.id,
        updatedByUserId: user.userId,
        notes: finalNotes,
      });
    }

    /*
     * Ensure the operation is in the controlled closing state
     * before committing the close.
     */
    if (operation.status === BranchOperationStatus.OPEN) {
      await this.repository.markOperationClosing({
        tenantId: user.tenantId,
        operationId: operation.id,
        actorUserId: user.userId,
      });
    }

    /*
     * The persisted physical cash count is authoritative.
     */
    const closedOperation = await this.repository.closeBranch({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationId: operation.id,
      closedAt: new Date(),
      closedByUserId: user.userId,
      closingBalance: new Prisma.Decimal(countedCash),
      closingNotes: finalNotes,
      operationDate: operation.operationDate,
      expectedClosingBalance,
      variance,
    });

    /*
     * Only create a person-accountable BRANCH_CLOSE shortage
     * when the caller explicitly identifies a responsible user.
     *
     * Otherwise the negative branch variance remains recorded
     * in reconciliation/report variance without falsely assigning
     * liability.
     */
    if (variance < 0 && dto.shortageResponsibleUserId?.trim()) {
      await this.cashShortagesService.createShortage({
        tenantId: user.tenantId,
        branchId: branch.id,
        responsibleUserId: dto.shortageResponsibleUserId,
        createdByUserId: user.userId,
        sourceType: CashShortageSource.BRANCH_CLOSE,
        sourceId: closedOperation.id,
        operationDate: operation.operationDate,
        amount: Math.abs(variance),
        notes: finalNotes || 'Branch reconciliation cash shortage',
      });
    }

    this.broadcastOperationEvent(OPERATIONS_EVENTS.branchClosed, {
      operationId: closedOperation.id,
      reconciliationId: reconciliation.id,
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: bounds.dateLabel,
      status: closedOperation.status,
      expectedClosingBalance,
      countedCash,
      variance,
    });

    /*
     * Reload the CLOSED operation so the report snapshot is
     * generated from final persisted values.
     */
    const closedForReport = await this.repository.findOperationForDay({
      tenantId: user.tenantId,
      branchId: branch.id,
      operationDate: operation.operationDate,
    });

    let reportForSubmission: OperationReportRecord | null = null;

    if (closedForReport) {
      const closedContract = await this.toContract(
        closedForReport,
        bounds.dayStart,
        bounds.dayEnd,
      );

      reportForSubmission = await this.ensureReportForClosedOperation(
        user,
        closedForReport,
        closedContract,
      );
    }

    if (
      reportForSubmission &&
      (reportForSubmission.status ===
        BranchOperationReportStatus.MANAGER_REVIEW ||
        reportForSubmission.status ===
          BranchOperationReportStatus.RETURNED_TO_MANAGER)
    ) {
      const updated = await this.repository.managerConfirmReport({
        tenantId: user.tenantId,
        reportId: reportForSubmission.id,
        reviewedByUserId: user.userId,
        notes: finalNotes,
      });

      this.broadcastOperationEvent(OPERATIONS_EVENTS.reportManagerReviewed, {
        operationId: reportForSubmission.operationId,
        reportId: updated.id,
        tenantId: user.tenantId,
        branchId: branch.id,
        operationDate: this.formatDateLabel(reportForSubmission.operationDate),
        status: updated.status,
      });

      const nextBounds = this.parseDayBounds(
        this.nextDateLabel(reportForSubmission.operationDate),
      );

      await this.autoOpenBranchIfEligible({
        tenantId: user.tenantId,
        branchId: branch.id,
        branchName: branch.name,
        bounds: nextBounds,
        openedByUserId: user.userId,
        allowFirstDay: false,
      });

      return this.getToday(user, {
        branchId: branch.id,
        date: nextBounds.dateLabel,
      });
    }

    return this.getToday(user, {
      branchId: branch.id,
      date: bounds.dateLabel,
    });
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

    await this.billingService.assertBranchSubscriptionActive(
      input.tenantId,
      input.branchId,
    );

    const bounds = this.parseDayBounds(input.date);

    this.assertCanChangeDay(bounds.dateOnly);

    const operation = await this.repository.findOperationForDay({
      tenantId: input.tenantId,
      branchId: input.branchId,
      operationDate: bounds.dateOnly,
    });

    if (!operation || operation.status !== BranchOperationStatus.OPEN) {
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

    await this.billingService.assertBranchSubscriptionActive(
      input.tenantId,
      input.branchId,
    );

    const bounds = this.parseDayBounds(input.date);

    const operation = await this.repository.findOperationForDay({
      tenantId: input.tenantId,
      branchId: input.branchId,
      operationDate: bounds.dateOnly,
    });

    if (!operation || operation.status !== BranchOperationStatus.OPEN) {
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
          paidFrom: BranchOperationExpensePaidFrom.BRANCH_CASH,
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

  /**
   * Converts persisted draft reconciliation state into
   * the public operations API contract.
   */
  private async getReconciliationContract(input: {
    tenantId: string;
    operationId: string;
    expectedClosingBalance: number;
  }): Promise<BranchOperationReconciliationContract | null> {
    const reconciliation = await this.repository.findReconciliationForOperation(
      {
        tenantId: input.tenantId,
        operationId: input.operationId,
      },
    );

    if (!reconciliation) {
      return null;
    }

    const countedCash =
      reconciliation.countedCash == null
        ? null
        : this.decimalToNumber(reconciliation.countedCash);

    const variance =
      countedCash == null
        ? null
        : this.roundMoney(countedCash - input.expectedClosingBalance);

    return {
      id: reconciliation.id,
      operationId: reconciliation.operationId,
      branchId: reconciliation.branchId,

      countedCash,
      expectedClosingBalance: input.expectedClosingBalance,
      variance,

      notes: reconciliation.notes,

      startedAt: reconciliation.startedAt.toISOString(),
      startedByName: reconciliation.startedBy.displayName,

      updatedAt: reconciliation.updatedAt.toISOString(),
      updatedByName: reconciliation.updatedBy?.displayName ?? null,

      cashCounts: reconciliation.cashCounts.map((count) => ({
        id: count.id,
        previousAmount:
          count.previousAmount == null
            ? null
            : this.decimalToNumber(count.previousAmount),
        countedAmount: this.decimalToNumber(count.countedAmount),
        recordedAt: count.recordedAt.toISOString(),
        recordedByName: count.recordedBy.displayName,
      })),
    };
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
      cashDisbursementsAgg,
      collectionsAgg,
      expensesAgg,
      branchCashExpensesAgg,
      agentFloatExpensesAgg,
      expenses,
      topUps,
      agentFloats,
      activeUsers,
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

      this.repository.sumLoanDisbursements({
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

      this.repository.sumExpensesForOperation({
        tenantId: operation.tenantId,
        operationId: operation.id,
        paidFrom: BranchOperationExpensePaidFrom.BRANCH_CASH,
      }),

      this.repository.sumExpensesForOperation({
        tenantId: operation.tenantId,
        operationId: operation.id,
        paidFrom: BranchOperationExpensePaidFrom.AGENT_FLOAT,
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

      this.repository.listOperationActiveUsers({
        tenantId: operation.tenantId,
        branchId: operation.branchId,
        floatDate: operation.operationDate,
        dayStart,
        dayEnd,
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

    const agentIds = [
      ...new Set([
        ...agentFloats.map((float) => float.agentId),
        ...activeUsers.map((staff) => staff.id),
      ]),
    ];

    const [
      loanDisbursementsByAgentRows,
      loansByAgentRows,
      collectionsByAgentRows,
    ] =
      agentIds.length === 0
        ? [[], [], []]
        : await Promise.all([
            this.repository.sumLoanDisbursementsByAgent({
              tenantId: operation.tenantId,
              branchId: operation.branchId,
              agentIds,
              dayStart,
              dayEnd,
            }),

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
    const branchCashExpensesTotal = this.decimalToNumber(
      branchCashExpensesAgg._sum.amount,
    );
    const agentFloatExpensesTotal = this.decimalToNumber(
      agentFloatExpensesAgg._sum.amount,
    );

    const loansIssuedPrincipal = this.decimalToNumber(
      cashDisbursementsAgg._sum.amount,
    );

    const processingFeesTotal = this.decimalToNumber(
      loansAgg._sum.processingFee,
    );

    const collectionsReceived = this.decimalToNumber(
      collectionsAgg._sum.amount,
    );

    const agentReturns = this.toAgentReturnContracts(
      agentFloats,
      activeUsers,
      loanDisbursementsByAgentRows,
      loansByAgentRows,
      collectionsByAgentRows,
      expenses,
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
        branchCashExpensesTotal +
        cashReturnedByAgents,
    );

    const floatRemaining = Math.max(branchCashRemaining, 0);

    const expectedClosingBalance = this.roundMoney(
      cashAvailableAtOpening -
        loansIssuedPrincipal +
        processingFeesTotal +
        collectionsReceived -
        branchCashExpensesTotal,
    );

    const closingBalance =
      operation.closingBalance == null
        ? null
        : this.decimalToNumber(operation.closingBalance);

    /*
     * Reconciliation is deliberately separate from the final
     * BranchDailyOperation.closingBalance.
     *
     * During reconciliation the physical cash count may be
     * edited multiple times.
     */
    const reconciliation = operation.reconciliation ?? null;

    const reconciliationCountedCash =
      reconciliation?.countedCash == null
        ? null
        : this.decimalToNumber(reconciliation.countedCash);

    const reconciliationVariance =
      reconciliationCountedCash == null
        ? null
        : this.roundMoney(reconciliationCountedCash - expectedClosingBalance);

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
      branchCashExpensesTotal,
      agentFloatExpensesTotal,

      expenses: expenses.map((expense) => this.toExpenseContract(expense)),

      branchCashRemaining,

      expectedClosingBalance,

      reconciliationStarted: reconciliation != null,

      reconciliationCountedCash,

      reconciliationVariance,

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
      collectedRepaymentsAvailable: 0,
      unusedFloat: 0,
      expectedHandover: 0,
      expensesTotal: 0,
      expenses: [],
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

    if (existing) {
      return existing;
    }

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

        if (concurrent) {
          return concurrent;
        }
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

    /*
     * Persist the branch fragment so report numbers remain
     * unique across a multi-branch tenant.
     *
     * UI can still display just DRDDMMYY.
     */
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
        branchCashExpenses: operation.branchCashExpensesTotal,
        agentFloatExpenses: operation.agentFloatExpensesTotal,
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
        branchExpenses: operation.branchCashExpensesTotal,
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

        if (fee <= 0) {
          return null;
        }

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

      if (agentReturn.amountReturned == null || variance === 0) {
        continue;
      }

      const shortage = shortagesBySourceId.get(agentReturn.floatId);

      if (shortage) {
        usedShortageIds.add(shortage.id);
      }

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

      if (shortage) {
        usedShortageIds.add(shortage.id);
      }

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
      if (usedShortageIds.has(shortage.id)) {
        continue;
      }

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
      {
        product: string;
        count: number;
        amount: number;
      }
    >();

    for (const loan of loans) {
      const fee = this.decimalToNumber(loan.processingFee);

      if (fee <= 0) {
        continue;
      }

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
      {
        product: string;
        count: number;
        amount: number;
      }
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
    options?: {
      includeManagerReview?: boolean;
    },
  ) {
    if (!value?.trim() || value === 'all') {
      return null;
    }

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

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

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
    activeUsers: Awaited<
      ReturnType<OperationsRepository['listOperationActiveUsers']>
    >,
    loanDisbursementsByAgentRows: Awaited<
      ReturnType<OperationsRepository['sumLoanDisbursementsByAgent']>
    >,
    loansByAgentRows: Awaited<
      ReturnType<OperationsRepository['sumLoansIssuedByAgent']>
    >,
    collectionsByAgentRows: Awaited<
      ReturnType<OperationsRepository['sumCollectionsByAgent']>
    >,
    expenses: Awaited<
      ReturnType<OperationsRepository['listExpensesForOperation']>
    >,
  ): DailyOperationAgentReturnContract[] {
    const disbursementsByAgent = new Map(
      loanDisbursementsByAgentRows.map((row) => [
        row.recordedByUserId,
        this.decimalToNumber(row._sum.amount),
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

    const expensesByAgent = new Map<string, number>();
    for (const expense of expenses) {
      if (expense.voidedAt) continue;
      if (expense.paidFrom !== BranchOperationExpensePaidFrom.AGENT_FLOAT) {
        continue;
      }
      const agentId = expense.agentId ?? expense.recordedByUserId;
      expensesByAgent.set(
        agentId,
        (expensesByAgent.get(agentId) ?? 0) +
          (this.decimalToNumber(expense.amount) ?? 0),
      );
    }

    const floatsByAgent = new Map(
      agentFloats.map((float) => [float.agentId, float]),
    );

    const usersById = new Map(activeUsers.map((staff) => [staff.id, staff]));

    /*
     * Build a cash position for every staff member who was financially
     * active during the day, together with every actual float recipient.
     *
     * This intentionally includes managers and cashiers. The same contract
     * drives the staff-balancing views in both mobile and web.
     */
    const agentIds = [
      ...new Set([
        ...activeUsers.map((staff) => staff.id),
        ...agentFloats.map((float) => float.agentId),
      ]),
    ];

    return agentIds.map((agentId) => {
      const float = floatsByAgent.get(agentId);

      const staff = usersById.get(agentId);

      const amountGiven = this.decimalToNumber(float?.amountGiven);

      const amountDisbursed = disbursementsByAgent.get(agentId) ?? 0;

      const processingFees = feesByAgent.get(agentId) ?? 0;

      const amountCollected = collectionsByAgent.get(agentId) ?? 0;

      const expensesTotal = this.roundMoney(expensesByAgent.get(agentId) ?? 0);

      const expectedReturn = this.roundMoney(
        amountGiven -
          amountDisbursed +
          amountCollected +
          processingFees -
          expensesTotal,
      );

      const amountReturned =
        float == null || float.amountReturned == null
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
        floatId: float?.id ?? '',

        agentId,

        agentName: staff?.displayName ?? float?.agent.displayName ?? 'Staff',

        agentPublicId: staff?.publicId ?? float?.agent.publicId ?? null,

        agentPhone: staff?.phone ?? null,

        agentRoleName: this.operationUserRoleName(staff),

        agentPhotoUrl: null,

        amountGiven,

        amountDisbursed,

        processingFees,

        amountCollected,

        expensesTotal,

        expectedReturn,

        amountReturned,

        variance,

        returnedAt: float?.returnedAt?.toISOString() ?? null,

        returnedByName: float?.returnedBy?.displayName ?? null,

        notes: float?.returnNotes ?? null,

        status,
      };
    });
  }

  private operationUserRoleName(
    user:
      | {
          roles?: { role?: { name?: string | null } | null }[] | null;
        }
      | null
      | undefined,
  ) {
    const roleNames = (user?.roles ?? [])
      .map((row) => row.role?.name?.trim())
      .filter((name): name is string => Boolean(name));

    return (
      roleNames.find((name) => name.toLowerCase().includes('manager')) ??
      roleNames.find((name) => name.toLowerCase().includes('cashier')) ??
      roleNames.find((name) => {
        const normalized = name.toLowerCase();
        return (
          normalized.includes('field officer') ||
          normalized.includes('loan officer') ||
          normalized === 'agent'
        );
      }) ??
      roleNames[0] ??
      null
    );
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

    if (!user.permissions.includes(OPERATIONS_PERMISSIONS.cashTopUp)) {
      throw new ForbiddenException('Missing permission to add cash.');
    }
  }

  private async assertCanMutateExpense(
    user: AuthenticatedUser,
    expense: {
      paidFrom: BranchOperationExpensePaidFrom;
      agentId: string | null;
      recordedByUserId: string;
    },
  ) {
    if (user.permissions.includes(OPERATIONS_PERMISSIONS.expenseCreate)) {
      this.assertCanCreateExpense(user);
      return;
    }

    await this.assertCanCreateAgentExpense(user);

    if (
      expense.paidFrom !== BranchOperationExpensePaidFrom.AGENT_FLOAT ||
      (expense.agentId ?? expense.recordedByUserId) !== user.userId
    ) {
      throw new ForbiddenException(
        'You can only change your own field expenses.',
      );
    }
  }

  private assertCanCreateExpense(user: AuthenticatedUser) {
    this.assertTenant(user);
    this.assertCanOperateBranch(user);

    if (!user.permissions.includes(OPERATIONS_PERMISSIONS.expenseCreate)) {
      throw new ForbiddenException('Missing permission to record expenses.');
    }
  }

  private async assertCanCreateAgentExpense(user: AuthenticatedUser) {
    this.assertTenant(user);

    if (user.permissions.includes(BRANCH_PERMISSIONS.create)) {
      throw new ForbiddenException(
        'Branch operations are handled by branch managers.',
      );
    }

    if (!user.branchId) {
      throw new ForbiddenException('Branch scope is required.');
    }

    if (!user.permissions.includes(OPERATIONS_PERMISSIONS.agentExpenseCreate)) {
      throw new ForbiddenException(
        'Missing permission to record field expenses.',
      );
    }

    const branch = await this.repository.findBranch({
      tenantId: user.tenantId,
      branchId: user.branchId,
    });

    if (!branch?.agentFieldExpensesEnabled) {
      throw new ForbiddenException(
        'Your manager has turned off field expense recording.',
      );
    }
  }

  private resolveExpensePaidFrom(
    user: AuthenticatedUser,
    requested?: 'BRANCH_CASH' | 'AGENT_FLOAT',
  ) {
    const canBranch = user.permissions.includes(
      OPERATIONS_PERMISSIONS.expenseCreate,
    );
    const canAgent = user.permissions.includes(
      OPERATIONS_PERMISSIONS.agentExpenseCreate,
    );

    if (requested === 'AGENT_FLOAT' || (!canBranch && canAgent)) {
      return BranchOperationExpensePaidFrom.AGENT_FLOAT;
    }

    if (canBranch) {
      return BranchOperationExpensePaidFrom.BRANCH_CASH;
    }

    if (canAgent) {
      return BranchOperationExpensePaidFrom.AGENT_FLOAT;
    }

    throw new ForbiddenException('Missing permission to record expenses.');
  }

  private toExpenseContract(expense: {
    id: string;
    amount: Prisma.Decimal | number;
    description: string | null;
    paidFrom?: BranchOperationExpensePaidFrom | null;
    agentId?: string | null;
    agent?: { displayName: string } | null;
    incurredAt: Date;
    recordedBy: { displayName: string };
    approvedAt: Date | null;
    approvedBy?: { displayName: string } | null;
    voidedAt: Date | null;
    voidedBy?: { displayName: string } | null;
    voidReason: string | null;
  }): DailyOperationExpenseContract {
    const paidFrom =
      expense.paidFrom === BranchOperationExpensePaidFrom.AGENT_FLOAT
        ? 'AGENT_FLOAT'
        : 'BRANCH_CASH';

    return {
      id: expense.id,
      amount: this.decimalToNumber(expense.amount) ?? 0,
      description: expense.description ?? '',
      paidFrom,
      agentId: expense.agentId ?? null,
      agentName: expense.agent?.displayName ?? null,
      incurredAt: expense.incurredAt.toISOString(),
      recordedByName: expense.recordedBy.displayName,
      approvedAt: expense.approvedAt?.toISOString() ?? null,
      approvedByName: expense.approvedBy?.displayName ?? null,
      voidedAt: expense.voidedAt?.toISOString() ?? null,
      voidedByName: expense.voidedBy?.displayName ?? null,
      voidReason: expense.voidReason,
    };
  }

  private async assertAgentExpenseFitsFloat(input: {
    user: AuthenticatedUser;
    branchId: string;
    operation: { id: string; operationDate: Date };
    bounds: { dayStart: Date; dayEnd: Date };
    amount: number;
    excludeExpenseId?: string;
  }) {
    const [float, disbursementsAgg, loansAgg, collectionsAgg, expensesAgg] =
      await Promise.all([
        this.repository.findAgentFloatForDay({
          tenantId: input.user.tenantId,
          branchId: input.branchId,
          agentId: input.user.userId,
          floatDate: input.operation.operationDate,
        }),
        this.repository.sumLoanDisbursementsForAgent({
          tenantId: input.user.tenantId,
          branchId: input.branchId,
          agentId: input.user.userId,
          dayStart: input.bounds.dayStart,
          dayEnd: input.bounds.dayEnd,
        }),
        this.repository.sumLoansIssuedForAgent({
          tenantId: input.user.tenantId,
          branchId: input.branchId,
          agentId: input.user.userId,
          dayStart: input.bounds.dayStart,
          dayEnd: input.bounds.dayEnd,
        }),
        this.repository.sumCollectionsForAgent({
          tenantId: input.user.tenantId,
          branchId: input.branchId,
          agentId: input.user.userId,
          dayStart: input.bounds.dayStart,
          dayEnd: input.bounds.dayEnd,
        }),
        this.repository.sumExpensesForOperation({
          tenantId: input.user.tenantId,
          operationId: input.operation.id,
          paidFrom: BranchOperationExpensePaidFrom.AGENT_FLOAT,
          agentId: input.user.userId,
        }),
      ]);

    if (float?.returnedAt) {
      throw new BadRequestException(
        'Your cash handover has already been recorded.',
      );
    }

    const unusedFloat = this.roundMoney(
      this.decimalToNumber(float?.amountGiven) -
        this.decimalToNumber(disbursementsAgg._sum.assignedFloatAmount),
    );
    const collectedRepaymentsAvailable = this.roundMoney(
      this.decimalToNumber(collectionsAgg._sum.amount) -
        this.decimalToNumber(disbursementsAgg._sum.collectedRepaymentsAmount),
    );
    const processingFees = this.decimalToNumber(loansAgg._sum.processingFee);
    let existingExpenses = this.decimalToNumber(expensesAgg._sum.amount);

    if (input.excludeExpenseId) {
      const current = await this.repository.findExpenseById({
        tenantId: input.user.tenantId,
        branchId: input.branchId,
        expenseId: input.excludeExpenseId,
      });
      if (current && !current.voidedAt) {
        existingExpenses = this.roundMoney(
          existingExpenses - (this.decimalToNumber(current.amount) ?? 0),
        );
      }
    }

    const available = this.roundMoney(
      unusedFloat +
        collectedRepaymentsAvailable +
        processingFees -
        existingExpenses,
    );

    if (input.amount > available) {
      throw new BadRequestException(
        `Expense exceeds remaining field cash. Available: ${available}.`,
      );
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

    if (label === today) {
      return;
    }

    // After close + report the next day may open immediately.
    if (label === this.nextDateLabel(this.parseDayBounds(today).dateOnly)) {
      return;
    }

    throw new BadRequestException("Only today's records can be changed.");
  }

  private isAutoOpenableDate(dateLabel: string) {
    const today = this.currentBusinessDateLabel();

    if (dateLabel === today) {
      return true;
    }

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

    if (typeof tenantId !== 'string' || typeof branchId !== 'string') {
      return;
    }

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
        `Submit the close report for ${this.formatDateLabel(
          previousClosed.operationDate,
        )} before opening a new day.`,
      );
    }

    if (!this.isReportSubmitted(report.status)) {
      throw new BadRequestException(
        `Submit the close report for ${this.formatDateLabel(
          previousClosed.operationDate,
        )} before opening a new day.`,
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

      if (!previousClosed) {
        return null;
      }

      const bounds = this.parseDayBounds(
        this.formatDateLabel(previousClosed.operationDate),
      );

      if (!(await this.isEmptyClosedOperation(previousClosed, bounds))) {
        return previousClosed;
      }

      this.logger.log(
        `Ignoring empty closed operation ${previousClosed.id} for ${previousClosed.branch.name} (${this.formatDateLabel(
          previousClosed.operationDate,
        )})`,
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
    if (operation.status !== BranchOperationStatus.CLOSED) {
      return false;
    }

    if (operation.closingBalance == null || operation.closedAt == null) {
      return false;
    }

    const [topUps, expenses, agentFloats, loans, collections, report] =
      await Promise.all([
        this.prisma.branchOperationTopUp.count({
          where: {
            tenantId: operation.tenantId,
            operationId: operation.id,
          },
        }),

        this.prisma.branchOperationExpense.count({
          where: {
            tenantId: operation.tenantId,
            operationId: operation.id,
          },
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
          where: {
            tenantId: operation.tenantId,
            operationId: operation.id,
          },
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

      if (!empty) {
        break;
      }

      await this.prisma.branchDailyOperation.delete({
        where: {
          id: pending.id,
        },
      });

      retired += 1;

      this.logger.log(
        `Retired empty operation ${pending.id} for ${pending.branch.name} (${this.formatDateLabel(
          pending.operationDate,
        )})`,
      );
    }

    return retired;
  }

  private async isEmptyUnclosedOperation(
    operation: NonNullable<
      Awaited<ReturnType<OperationsRepository['findOperationForDay']>>
    >,
  ) {
    if (operation.status === BranchOperationStatus.CLOSED) {
      return false;
    }

    if (operation.closingBalance != null || operation.closedAt != null) {
      return false;
    }

    if (
      operation.status === BranchOperationStatus.OPEN &&
      this.decimalToNumber(operation.cashAddedToday) !== 0
    ) {
      return false;
    }

    const bounds = this.parseDayBounds(
      this.formatDateLabel(operation.operationDate),
    );

    const [topUps, expenses, agentFloats, loans, collections, report] =
      await Promise.all([
        this.prisma.branchOperationTopUp.count({
          where: {
            tenantId: operation.tenantId,
            operationId: operation.id,
          },
        }),

        this.prisma.branchOperationExpense.count({
          where: {
            tenantId: operation.tenantId,
            operationId: operation.id,
          },
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
          where: {
            tenantId: operation.tenantId,
            operationId: operation.id,
          },
        }),
      ]);

    return topUps + expenses + agentFloats + loans + collections + report === 0;
  }

  /**
   * Auto-open each branch at 00:05 Africa/Kampala when
   * yesterday is closed and the report has been submitted.
   *
   * Agents remain locked from money operations until 06:00.
   */
  @Cron('5 0 * * *', {
    timeZone: 'Africa/Kampala',
  })
  async autoOpenBusinessDaysCron() {
    const dateLabel = this.currentBusinessDateLabel();

    const bounds = this.parseDayBounds(dateLabel);

    const branches = await this.prisma.branch.findMany({
      select: {
        id: true,
        tenantId: true,
        name: true,
      },
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

    if (existing) {
      return existing;
    }

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

    if (pendingClosure) {
      return null;
    }

    let openingBalance = 0;

    let openedByUserId = input.openedByUserId ?? null;

    if (previousClosed) {
      const report = await this.repository.findReportForOperation({
        tenantId: input.tenantId,
        operationId: previousClosed.id,
      });

      if (!report || !this.isReportSubmitted(report.status)) {
        return null;
      }

      openingBalance = this.decimalToNumber(previousClosed.closingBalance);

      openedByUserId =
        openedByUserId ??
        previousClosed.closedByUserId ??
        previousClosed.openedByUserId;
    } else if (!input.allowFirstDay) {
      return null;
    }

    if (!openedByUserId) {
      return null;
    }

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

  private async getBranchAccessContract(
    tenantId: string,
    branchId: string,
  ): Promise<DailyOperationBranchAccessContract> {
    try {
      const subscription =
        await this.billingService.assertBranchSubscriptionActive(
          tenantId,
          branchId,
        );

      return {
        canOperate: this.billingService.isBranchMutationsAllowed(
          subscription.status,
        ),
        locked: false,
        subscriptionStatus: subscription.status,
        message: null,
      };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 402) {
        return {
          canOperate: false,
          locked: true,
          subscriptionStatus: 'LOCKED',
          message:
            error.message ||
            'This branch is paused. Renew on Subscription to continue.',
        };
      }

      throw error;
    }
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
    if (value == null) {
      return 0;
    }

    if (typeof value === 'number') {
      return value;
    }

    return Number(value.toString());
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }
}
