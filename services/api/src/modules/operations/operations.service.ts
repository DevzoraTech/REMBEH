import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  getPrismaUniqueConstraintTargets,
  isPrismaUniqueConstraintError,
} from '../../common/database/prisma-errors';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { CloseBranchOperationDto } from './dto/close-branch-operation.dto';
import { OpenBranchOperationDto } from './dto/open-branch-operation.dto';
import { RecordAgentReturnDto } from './dto/record-agent-return.dto';
import { RecordOperationExpenseDto } from './dto/record-operation-expense.dto';
import {
  DailyOperationAgentReturnContract,
  DailyOperationContract,
  DailyOperationResponseContract,
} from './operations.contracts';
import { OPERATIONS_PERMISSIONS } from './operations.permissions';
import { OperationsRepository } from './operations.repository';

@Injectable()
export class OperationsService {
  private readonly businessUtcOffsetMinutes = 180;

  constructor(private readonly repository: OperationsRepository) {}

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
        operation: null,
      };
    }

    const [operation, previousClosed] = await Promise.all([
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
    ]);

    return {
      date: bounds.dateLabel,
      branch: {
        id: branch.id,
        name: branch.name,
        address: branch.address,
      },
      openingBalance: previousClosed
        ? this.decimalToNumber(previousClosed.closingBalance)
        : null,
      operation: operation
        ? await this.toContract(operation, bounds.dayStart, bounds.dayEnd)
        : null,
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

    const previousClosed = await this.repository.findLatestClosedBefore({
      tenantId: user.tenantId,
      branchId: branch.id,
      beforeDate: bounds.dateOnly,
    });
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

    await this.repository
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
    this.assertCanChangeDay(bounds.dateOnly);
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
    this.assertCanChangeDay(bounds.dateOnly);
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

    await this.repository.recordAgentReturn({
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
    this.assertCanChangeDay(bounds.dateOnly);
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

    await this.repository.closeBranch({
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

    return this.getToday(user, { branchId: branch.id, date: bounds.dateLabel });
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

    if (existingFloat) {
      throw new BadRequestException(
        'This agent already has float for this day.',
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
      openingBalance,
      cashAddedToday,
      cashAvailableAtOpening,
      floatIssued,
      floatSetAside,
      floatRemaining,
      cashReturnedByAgents,
      agentsWithFloatCount: agentReturns.length,
      agentsReturnedCount: agentReturns.filter(
        (agentReturn) => agentReturn.amountReturned != null,
      ).length,
      expectedAgentReturnTotal,
      agentReturnVariance,
      agentReturns,
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
    const collectionsByAgent = new Map(
      collectionsByAgentRows.map((row) => [
        row.recordedByUserId,
        this.decimalToNumber(row._sum.amount),
      ]),
    );

    return agentFloats.map((float) => {
      const amountGiven = this.decimalToNumber(float.amountGiven);
      const amountDisbursed = loansByAgent.get(float.agentId) ?? 0;
      const amountCollected = collectionsByAgent.get(float.agentId) ?? 0;
      const expectedReturn = this.roundMoney(
        amountGiven - amountDisbursed + amountCollected,
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
    if (!user.permissions.includes(OPERATIONS_PERMISSIONS.open)) {
      throw new ForbiddenException('Missing permission to open branch.');
    }
  }

  private assertCanCreateExpense(user: AuthenticatedUser) {
    this.assertTenant(user);
    if (!user.permissions.includes(OPERATIONS_PERMISSIONS.expenseCreate)) {
      throw new ForbiddenException('Missing permission to record expenses.');
    }
  }

  private assertCanReturnFloat(user: AuthenticatedUser) {
    this.assertTenant(user);
    if (!user.permissions.includes(OPERATIONS_PERMISSIONS.floatReturn)) {
      throw new ForbiddenException('Missing permission to record returns.');
    }
  }

  private assertCanClose(user: AuthenticatedUser) {
    this.assertTenant(user);
    if (!user.permissions.includes(OPERATIONS_PERMISSIONS.close)) {
      throw new ForbiddenException('Missing permission to close branch.');
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
