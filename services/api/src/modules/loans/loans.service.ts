import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchOperationStatus,
  LoanDisbursementSource,
  LoanStatus,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { computeCollectionSchedule, classifyDueDayCoverage, isSameCalendarDay } from '../collections/collection-schedule';
import { CreateLoanApplicationFromCustomerDto } from '../loan-applications/dto/create-from-customer.dto';
import { LoanApplicationsService } from '../loan-applications/loan-applications.service';
import { OPERATIONS_PERMISSIONS } from '../operations/operations.permissions';
import {
  computeLoanPricing,
  resolveBaseRepayable,
} from '../loan-products/loan-pricing';
import { LoanRemindersService } from './loan-reminders.service';
import {
  LoanDisbursementContract,
  LoanListItemContract,
  LoanListResponseContract,
  PendingDisbursementContract,
  PendingDisbursementListResponseContract,
  RecordLoanDisbursementResponseContract,
} from './loans.contracts';
import { RecordLoanDisbursementDto } from './dto/record-loan-disbursement.dto';
import { LoanListRecord, LoansRepository } from './loans.repository';
import { LoanProductsService } from '../loan-products/loan-products.service';
import { LOAN_PERMISSIONS } from './loans.permissions';

@Injectable()
export class LoansService {
  private readonly businessUtcOffsetMinutes = 180;

  constructor(
    private readonly loansRepository: LoansRepository,
    private readonly loanApplicationsService: LoanApplicationsService,
    private readonly loanRemindersService: LoanRemindersService,
    private readonly loanProductsService: LoanProductsService,
  ) {}

  async listLoans(user: AuthenticatedUser): Promise<LoanListResponseContract> {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Account access is required.');
    }

    const canSeeAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );
    const canSeeBranchLoanRecords = this.canSeeBranchLoanRecords(user);

    if (!canSeeAllBranches && !user.branchId) {
      return { loans: [] };
    }

    const loans = await this.loansRepository.listForScope({
      tenantId: user.tenantId,
      branchId: canSeeAllBranches ? null : user.branchId,
      officerUserId: canSeeBranchLoanRecords ? null : user.userId,
    });

    const reminders = await this.loanRemindersService.summarizeLoans(
      user.tenantId,
      loans.map((loan) => loan.id),
    );

    return {
      loans: loans.map((loan) => {
        const contract = this.toContract(loan);
        return {
          ...contract,
          reminder: reminders.get(loan.id) ?? {
            status: 'not_sent',
            lastSentAt: null,
            lastFailureReason: null,
            canResend: false,
            activeBatchId: null,
          },
        };
      }),
    };
  }

  createApplication(user: AuthenticatedUser) {
    return this.loanApplicationsService.createDraft(user);
  }

  createApplicationFromBorrower(
    user: AuthenticatedUser,
    dto: CreateLoanApplicationFromCustomerDto,
  ) {
    return this.loanApplicationsService.createDraftFromCustomer(user, dto);
  }

  async listPendingDisbursements(
    user: AuthenticatedUser,
  ): Promise<PendingDisbursementListResponseContract> {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Account access is required.');
    }

    const canSeeAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );
    const canSeeBranchLoanRecords = this.canSeeBranchLoanRecords(user);

    if (!canSeeAllBranches && !user.branchId) {
      return {
        summary: {
          borrowersCount: 0,
          totalRemaining: 0,
        },
        pendingDisbursements: [],
      };
    }

    const loans = await this.loansRepository.listPendingDisbursements({
      tenantId: user.tenantId,
      branchId: canSeeAllBranches ? null : user.branchId,
      officerUserId: canSeeBranchLoanRecords ? null : user.userId,
    });

    const pendingDisbursements = loans
      .map((loan) => this.toPendingContract(loan))
      .filter((row) => row.remainingAmount > 0);

    return {
      summary: {
        borrowersCount: pendingDisbursements.length,
        totalRemaining: this.roundMoney(
          pendingDisbursements.reduce(
            (total, row) => total + row.remainingAmount,
            0,
          ),
        ),
      },
      pendingDisbursements,
    };
  }

  async recordDisbursement(
    user: AuthenticatedUser,
    loanId: string,
    dto: RecordLoanDisbursementDto,
  ): Promise<RecordLoanDisbursementResponseContract> {
    const bodyLoanId = dto.loanId?.trim();
    if (bodyLoanId && bodyLoanId !== loanId) {
      throw new BadRequestException(
        'Disbursement loan does not match the selected loan.',
      );
    }

    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Account access is required.');
    }

    const canSeeAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );

    const loan = await this.loansRepository.findByIdForScope({
      tenantId: user.tenantId,
      loanId,
      branchId: canSeeAllBranches ? null : user.branchId,
    });

    if (!loan) {
      throw new NotFoundException('Loan was not found.');
    }

    if (loan.status !== LoanStatus.PARTIALLY_DISBURSED) {
      throw new BadRequestException(
        'This loan is not waiting for further disbursement.',
      );
    }

    const issuedByUserId = dto.issuedByUserId?.trim() || user.userId;
    const isRecordingForSelf = issuedByUserId === user.userId;
    const canManageBranch = user.permissions.includes(LOAN_PERMISSIONS.update);

    if (!isRecordingForSelf && !canManageBranch) {
      throw new ForbiddenException(
        'You cannot record a disbursement for another staff member.',
      );
    }

    if (!canSeeAllBranches && loan.application?.officer.id !== user.userId) {
      if (!canManageBranch) {
        throw new ForbiddenException(
          'You cannot complete another staff member’s disbursement.',
        );
      }
    }

    if (issuedByUserId !== user.userId) {
      const staff = await this.loansRepository.findAssignableStaff({
        tenantId: user.tenantId,
        branchId: loan.branchId,
        userId: issuedByUserId,
      });
      if (!staff) {
        throw new BadRequestException(
          'The selected staff member cannot issue cash for this branch.',
        );
      }
    }

    const disbursedAt = dto.disbursedAt
      ? new Date(dto.disbursedAt)
      : new Date();

    if (Number.isNaN(disbursedAt.getTime())) {
      throw new BadRequestException('Invalid disbursement date.');
    }

    const plan = await this.resolveDisbursementPlan({
      user,
      loan,
      dto,
      issuedByUserId,
      disbursedAt,
    });

    const activateLoan = plan.remainingAfterThis <= 0;
    const paymentStartDate = activateLoan
      ? await this.loanProductsService.resolvePaymentStartDate({
          tenantId: user.tenantId,
          branchId: loan.branchId,
          anchorDate: disbursedAt,
          agentPickedDate: null,
          paymentStartPolicy: loan.application?.paymentStartPolicy ?? null,
          paymentStartDelayDays:
            loan.application?.paymentStartDelayDays ?? null,
          allowAgentDatePick: false,
        })
      : null;

    const saved = await this.loansRepository.recordDisbursement({
      tenantId: user.tenantId,
      branchId: loan.branchId,
      loanId: loan.id,
      recordedByUserId: issuedByUserId,
      amount: plan.amount,
      assignedFloatAmount: plan.assignedFloatAmount,
      collectedRepaymentsAmount: plan.collectedRepaymentsAmount,
      source: plan.source,
      disbursedAt,
      note: dto.note?.trim() || null,
      localId: dto.localId?.trim() || null,
      activateLoan,
      paymentStartDate,
    });

    const pending = this.toPendingContract(saved.loan);

    return {
      pending: pending.remainingAmount > 0 ? pending : null,
      loan: this.toContract(saved.loan),
      disbursement: this.toDisbursementContract(saved.disbursement),
    };
  }

  private toContract(
    loan: LoanListRecord,
  ): Omit<LoanListItemContract, 'reminder'> {
    const paymentStartDate =
      loan.paymentStartDate ?? loan.application?.paymentStartDate ?? null;
    const durationDays = loan.application?.durationDays ?? null;
    const principal = this.decimalToNumber(loan.principal) ?? 0;
    const balance = this.decimalToNumber(loan.balance) ?? 0;
    const paidAmount = this.roundMoney(
      loan.repayments.reduce(
        (sum, repayment) => sum + (this.decimalToNumber(repayment.amount) ?? 0),
        0,
      ),
    );
    const openingBalance = this.decimalToNumber(loan.wallet?.openingBalance);
    const finesTotal = this.roundMoney(
      this.decimalToNumber(loan.finesTotal) ??
        this.decimalToNumber(loan.wallet?.finesTotal) ??
        0,
    );
    const processingFee = this.roundMoney(
      this.decimalToNumber(loan.application?.processingFee) ?? 0,
    );
    const disbursedAmount = this.totalDisbursed(loan);
    const pendingDisbursementAmount = this.roundMoney(
      Math.max(0, principal - disbursedAmount),
    );
    const interestRatePercent =
      this.decimalToNumber(loan.application?.interestRatePercent) ?? 0;
    const periodDays =
      durationDays != null && durationDays > 0 ? durationDays : 1;

    /*
     * Contractual borrower debt:
     * principal + interest.
     *
     * Processing fee is separate income and does not form part
     * of the loan balance or instalment.
     */
    // Prefer that when the wallet snapshot is missing interest (principal-only)
    // or still on the legacy days/365 formula.
    const priced = computeLoanPricing({
      principalAmount: principal,
      interestRatePercent,
      durationDays: periodDays,
      processingFee,
    });
    const baseRepayable = resolveBaseRepayable({
      openingBalance,
      pricedTotal: priced.totalRepayable,
      principal,
      paidAmount,
      balance,
      finesTotal,
    });

    const startDate = paymentStartDate ?? loan.disbursedAt ?? loan.createdAt;
    const schedule = computeCollectionSchedule({
      principalAmount: principal,
      interestRatePercent,
      durationDays: periodDays,
      repaymentFrequency: loan.application?.repaymentFrequency ?? 'DAILY',
      processingFee,
      balance,
      recordedPaidAmount: paidAmount,
      totalRepayableOverride: baseRepayable,
      startDate,
    });

    // Match collections: original repayable + applied fines.
    const totalRepayable = this.roundMoney(baseRepayable + finesTotal);
    const expectedInterest = this.roundMoney(
      Math.max(0, baseRepayable - principal),
    );

    if (loan.status === LoanStatus.PARTIALLY_DISBURSED) {
      return {
        id: loan.id,
        applicationId: loan.application?.id ?? null,
        customerId: loan.customerId,
        borrowerName: loan.customer.fullName,
        phone: loan.customer.phone,
        nationalId: loan.customer.nationalId,
        loanTypeName: this.loanTypeName(loan),
        status: loan.status,
        principal,
        disbursedAmount,
        pendingDisbursementAmount,
        disbursementCount: loan.disbursements.length,
        balance,
        paidAmount,
        openingBalance,
        finesTotal,
        totalRepayable,
        expectedInterest,
        processingFee,
        installmentAmount: 0,
        overdueDays: 0,
        nextDueLabel: 'Pending disbursement',
        nextDueIsToday: false,
        paidTodayAmount: 0,
        dueDayCoverage: 'none',
        nextDueDate: null,
        currency: loan.currency,
        officerName: loan.application?.officer.displayName ?? null,
        officerPublicId: loan.application?.officer.publicId ?? null,
        branchId: loan.branchId,
        paymentStartDate: null,
        durationDays,
        repaymentFrequency: loan.application?.repaymentFrequency ?? 'DAILY',
        dueDate: null,
        createdAt: loan.createdAt.toISOString(),
        disbursedAt: loan.disbursedAt?.toISOString() ?? null,
        updatedAt: loan.updatedAt.toISOString(),
      };
    }

    const dueDate = new Date(schedule.maturityDate);

    const overdueDays = this.scheduleOverdueDays({
      balance,
      paidAmount,
      dailyInstalment: schedule.dailyInstalment,
      daysElapsed: schedule.daysElapsed,
      periodDays: schedule.loanPeriodDays,
      nextDueIsToday: schedule.nextDueIsToday,
      nextDueLabel: schedule.nextDueLabel,
    });

    const nextDueDate = this.resolveNextDueDate({
      balance,
      startDate,
      dailyInstalment: schedule.dailyInstalment,
      paidAmount,
      maturityDate: new Date(schedule.maturityDate),
      nextDueIsToday: schedule.nextDueIsToday,
      nextDueLabel: schedule.nextDueLabel,
    });

    const now = new Date();
    const paidTodayAmount = this.roundMoney(
      loan.repayments.reduce((sum, repayment) => {
        if (
          !repayment.paidAt ||
          Number.isNaN(repayment.paidAt.getTime()) ||
          !isSameCalendarDay(repayment.paidAt, now)
        ) {
          return sum;
        }
        return sum + (this.decimalToNumber(repayment.amount) ?? 0);
      }, 0),
    );
    const paidBeforeToday = this.roundMoney(
      Math.max(0, paidAmount - paidTodayAmount),
    );
    const morningBalance = this.roundMoney(
      Math.max(0, balance + paidTodayAmount),
    );
    const morning = computeCollectionSchedule({
      principalAmount: principal,
      interestRatePercent,
      durationDays: periodDays,
      repaymentFrequency: loan.application?.repaymentFrequency ?? 'DAILY',
      processingFee,
      balance: morningBalance,
      recordedPaidAmount: paidBeforeToday,
      totalRepayableOverride: baseRepayable,
      startDate,
      asOf: now,
    });
    const dueDayCoverage = loan.customer.voidedAt
      ? 'none'
      : classifyDueDayCoverage({
          morningExpectedToday: morning.expectedToday,
          morningNextDueIsToday: morning.nextDueIsToday,
          morningNextDueLabel: morning.nextDueLabel,
          morningCarriedForward: morning.carriedForward,
          paidToday: paidTodayAmount,
        });

    return {
      id: loan.id,
      applicationId: loan.application?.id ?? null,
      customerId: loan.customerId,
      borrowerName: loan.customer.fullName,
      phone: loan.customer.phone,
      nationalId: loan.customer.nationalId,
      loanTypeName: this.loanTypeName(loan),
      status: loan.status,
      principal,
      disbursedAmount,
      pendingDisbursementAmount,
      disbursementCount: loan.disbursements.length,
      balance,
      paidAmount,
      openingBalance,
      finesTotal,
      totalRepayable,
      expectedInterest,
      processingFee,
      installmentAmount: schedule.dailyInstalment,
      overdueDays,
      nextDueLabel: loan.customer.voidedAt
        ? 'Set aside'
        : balance <= 0
          ? 'Paid up'
          : schedule.nextDueLabel,
      nextDueIsToday:
        !loan.customer.voidedAt && balance > 0 && schedule.nextDueIsToday,
      paidTodayAmount,
      dueDayCoverage: balance <= 0 ? 'none' : dueDayCoverage,
      nextDueDate: balance <= 0 ? null : nextDueDate,
      currency: loan.currency,
      officerName: loan.application?.officer.displayName ?? null,
      officerPublicId: loan.application?.officer.publicId ?? null,
      branchId: loan.branchId,
      paymentStartDate: paymentStartDate?.toISOString() ?? null,
      durationDays,
      repaymentFrequency: loan.application?.repaymentFrequency ?? 'DAILY',
      dueDate: dueDate.toISOString(),
      createdAt: loan.createdAt.toISOString(),
      disbursedAt: loan.disbursedAt?.toISOString() ?? null,
      updatedAt: loan.updatedAt.toISOString(),
    };
  }

  private canSeeBranchLoanRecords(user: AuthenticatedUser) {
    return (
      user.permissions.includes(BRANCH_PERMISSIONS.create) ||
      user.permissions.includes(BRANCH_PERMISSIONS.staffRead) ||
      user.permissions.includes(OPERATIONS_PERMISSIONS.read) ||
      user.permissions.includes(OPERATIONS_PERMISSIONS.floatManage) ||
      user.permissions.includes(LOAN_PERMISSIONS.update)
    );
  }

  private toPendingContract(loan: LoanListRecord): PendingDisbursementContract {
    const agreedAmount = this.decimalToNumber(loan.principal) ?? 0;
    const disbursedAmount = this.totalDisbursed(loan);
    const remainingAmount = this.roundMoney(
      Math.max(0, agreedAmount - disbursedAmount),
    );
    const lastDisbursement = loan.disbursements.at(-1) ?? null;

    return {
      loanId: loan.id,
      applicationId: loan.application?.id ?? null,
      customerId: loan.customerId,
      borrowerName: loan.customer.fullName,
      phone: loan.customer.phone,
      branchId: loan.branchId,
      branchName: loan.branch?.name ?? null,
      agreedAmount,
      disbursedAmount,
      remainingAmount,
      percentDisbursed:
        agreedAmount > 0
          ? Math.min(100, Math.round((disbursedAmount / agreedAmount) * 100))
          : 0,
      disbursementCount: loan.disbursements.length,
      lastDisbursementAt: lastDisbursement?.disbursedAt.toISOString() ?? null,
      lastDisbursementAmount: lastDisbursement
        ? (this.decimalToNumber(lastDisbursement.amount) ?? 0)
        : null,
      issuedByName: loan.application?.officer.displayName ?? null,
      issuedByPublicId: loan.application?.officer.publicId ?? null,
      status: loan.status,
      createdAt: loan.createdAt.toISOString(),
      disbursements: loan.disbursements.map((item) =>
        this.toDisbursementContract(item),
      ),
    };
  }

  private toDisbursementContract(
    disbursement: LoanListRecord['disbursements'][number],
  ): LoanDisbursementContract {
    return {
      id: disbursement.id,
      loanId: disbursement.loanId,
      amount: this.decimalToNumber(disbursement.amount) ?? 0,
      assignedFloatAmount:
        this.decimalToNumber(disbursement.assignedFloatAmount) ?? 0,
      collectedRepaymentsAmount:
        this.decimalToNumber(disbursement.collectedRepaymentsAmount) ?? 0,
      source: disbursement.source,
      disbursedAt: disbursement.disbursedAt.toISOString(),
      note: disbursement.note,
      recordedByName: disbursement.recordedBy.displayName,
      recordedByPublicId: disbursement.recordedBy.publicId ?? null,
      createdAt: disbursement.createdAt.toISOString(),
    };
  }

  private async resolveDisbursementPlan(input: {
    user: AuthenticatedUser;
    loan: LoanListRecord;
    dto: RecordLoanDisbursementDto;
    issuedByUserId: string;
    disbursedAt: Date;
  }) {
    const agreedAmount = this.decimalToNumber(input.loan.principal) ?? 0;
    const disbursedAmount = this.totalDisbursed(input.loan);
    const remainingBefore = this.roundMoney(
      Math.max(0, agreedAmount - disbursedAmount),
    );
    const amount = this.roundMoney(input.dto.amount);
    const collectedRepaymentsAmount = this.roundMoney(
      input.dto.collectedRepaymentsAmount ?? 0,
    );
    const assignedFloatAmount = this.roundMoney(
      amount - collectedRepaymentsAmount,
    );

    if (amount <= 0) {
      throw new BadRequestException('Enter the amount given to the borrower.');
    }

    if (amount > remainingBefore) {
      throw new BadRequestException(
        `Amount exceeds the remaining disbursement. Maximum: UGX ${this.formatMoney(
          remainingBefore,
        )}.`,
      );
    }

    if (collectedRepaymentsAmount < 0 || collectedRepaymentsAmount > amount) {
      throw new BadRequestException(
        'Repayments used must be part of the amount given now.',
      );
    }

    await this.assertDisbursementCashAvailable({
      user: input.user,
      loan: input.loan,
      issuedByUserId: input.issuedByUserId,
      assignedFloatAmount,
      collectedRepaymentsAmount,
      disbursedAt: input.disbursedAt,
    });

    return {
      amount,
      assignedFloatAmount,
      collectedRepaymentsAmount,
      source: this.disbursementSource({
        assignedFloatAmount,
        collectedRepaymentsAmount,
      }),
      remainingAfterThis: this.roundMoney(remainingBefore - amount),
    };
  }

  private async assertDisbursementCashAvailable(input: {
    user: AuthenticatedUser;
    loan: LoanListRecord;
    issuedByUserId: string;
    assignedFloatAmount: number;
    collectedRepaymentsAmount: number;
    disbursedAt: Date;
  }) {
    const bounds = this.currentBusinessDayBounds(input.disbursedAt);
    const operation = await this.loansRepository.findBranchOperationForDay({
      tenantId: input.user.tenantId,
      branchId: input.loan.branchId,
      operationDate: bounds.dateOnly,
    });

    if (!operation) {
      throw new BadRequestException(
        'This branch day is not open. Open the day before recording a disbursement.',
      );
    }

    if (operation.status !== BranchOperationStatus.OPEN) {
      throw new BadRequestException(
        'This branch day is closed. New disbursements cannot be recorded.',
      );
    }

    if (input.user.permissions.includes(OPERATIONS_PERMISSIONS.floatManage)) {
      return;
    }

    const [float, disbursed, collections] = await Promise.all([
      this.loansRepository.findFloatForRecorder({
        tenantId: input.user.tenantId,
        branchId: input.loan.branchId,
        recordedByUserId: input.issuedByUserId,
        floatDate: bounds.dateOnly,
      }),
      this.loansRepository.sumDisbursementsForRecorder({
        tenantId: input.user.tenantId,
        branchId: input.loan.branchId,
        recordedByUserId: input.issuedByUserId,
        dayStart: bounds.dayStart,
        dayEnd: bounds.dayEnd,
      }),
      this.loansRepository.sumCollectionsForRecorder({
        tenantId: input.user.tenantId,
        branchId: input.loan.branchId,
        recordedByUserId: input.issuedByUserId,
        dayStart: bounds.dayStart,
        dayEnd: bounds.dayEnd,
      }),
    ]);

    if (!float && input.assignedFloatAmount > 0) {
      throw new BadRequestException(
        'This staff member needs assigned float before using branch float for disbursement.',
      );
    }

    if (float?.returnedAt || float?.amountReturned != null) {
      throw new BadRequestException(
        'This staff member has already handed over today’s float.',
      );
    }

    const assignedFloat = this.decimalToNumber(float?.amountGiven) ?? 0;
    const returnedFloat = this.decimalToNumber(float?.amountReturned) ?? 0;
    const alreadyUsedFloat =
      this.decimalToNumber(disbursed._sum.assignedFloatAmount) ?? 0;
    const alreadyUsedCollections =
      this.decimalToNumber(disbursed._sum.collectedRepaymentsAmount) ?? 0;
    const amountCollected = this.decimalToNumber(collections._sum.amount) ?? 0;

    const remainingFloat = this.roundMoney(
      assignedFloat - returnedFloat - alreadyUsedFloat,
    );
    const collectedCashAvailable = this.roundMoney(
      amountCollected - alreadyUsedCollections,
    );

    if (input.assignedFloatAmount > remainingFloat) {
      throw new BadRequestException(
        `Disbursement exceeds the staff member’s remaining float. Available float: UGX ${this.formatMoney(
          Math.max(0, remainingFloat),
        )}.`,
      );
    }

    if (input.collectedRepaymentsAmount > collectedCashAvailable) {
      throw new BadRequestException(
        `Repayments used exceed collections still with this staff member. Available collected cash: UGX ${this.formatMoney(
          Math.max(0, collectedCashAvailable),
        )}.`,
      );
    }
  }

  private disbursementSource(input: {
    assignedFloatAmount: number;
    collectedRepaymentsAmount: number;
  }): LoanDisbursementSource {
    if (input.assignedFloatAmount > 0 && input.collectedRepaymentsAmount > 0) {
      return LoanDisbursementSource.MIXED_CASH;
    }
    if (input.collectedRepaymentsAmount > 0) {
      return LoanDisbursementSource.COLLECTED_REPAYMENTS;
    }
    return LoanDisbursementSource.ASSIGNED_FLOAT;
  }

  private totalDisbursed(loan: LoanListRecord) {
    return this.roundMoney(
      loan.disbursements.reduce(
        (total, item) => total + (this.decimalToNumber(item.amount) ?? 0),
        0,
      ),
    );
  }

  private currentBusinessDayBounds(anchor: Date) {
    const shifted = new Date(
      anchor.getTime() + this.businessUtcOffsetMinutes * 60_000,
    );
    const dateOnly = new Date(
      Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
      ),
    );
    const dayStart = new Date(
      dateOnly.getTime() - this.businessUtcOffsetMinutes * 60_000,
    );

    return {
      dateOnly,
      dayStart,
      dayEnd: new Date(dayStart.getTime() + 86_400_000 - 1),
    };
  }

  private formatMoney(value: number) {
    return new Intl.NumberFormat('en-UG', {
      maximumFractionDigits: 0,
    }).format(Math.max(0, Math.round(value)));
  }

  private loanTypeName(loan: LoanListRecord) {
    const named =
      loan.application?.templateName?.trim() ||
      loan.application?.loanProductTemplate?.name.trim() ||
      null;
    if (named) return named;
    const rate = this.decimalToNumber(loan.application?.interestRatePercent);
    const days = loan.application?.durationDays;
    if (rate != null && days != null && days > 0) {
      return `Flat ${rate}% · ${days} days`;
    }
    return null;
  }

  private calendarDaysBetween(from: Date, to: Date) {
    const left = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());

    const right = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());

    return Math.max(0, Math.floor((right - left) / 86_400_000));
  }

  private scheduleOverdueDays(input: {
    balance: number;
    paidAmount: number;
    dailyInstalment: number;
    daysElapsed: number;
    periodDays: number;
    nextDueIsToday: boolean;
    nextDueLabel: string;
  }) {
    if (input.balance <= 0 || input.dailyInstalment <= 0) {
      return 0;
    }

    /*
     * daysElapsed means the number of repayment-calendar dates
     * that have become due INCLUDING today.
     *
     * Example:
     *
     * repayment starts 27 Aug
     *
     * on 27 Aug:
     *   daysElapsed = 1
     *
     * But that first instalment is merely DUE TODAY.
     * It is not overdue yet.
     */
    const scheduledDaysReached = Math.min(
      input.periodDays,
      Math.max(0, input.daysElapsed),
    );

    if (scheduledDaysReached <= 0) {
      return 0;
    }

    const coveredDays = Math.min(
      scheduledDaysReached,
      Math.floor(Math.max(0, input.paidAmount) / input.dailyInstalment),
    );

    /*
     * Today's scheduled instalment must not be counted as overdue.
     *
     * Therefore:
     *
     * DUE TODAY:
     * missed historical days =
     * scheduled days reached - paid days - today's day
     *
     * OVERDUE:
     * there is no current on-time instalment to protect,
     * so all uncovered scheduled days are overdue.
     */
    const currentDueDayAllowance =
      input.nextDueIsToday && input.nextDueLabel === 'Due today' ? 1 : 0;

    return Math.max(
      0,
      scheduledDaysReached - coveredDays - currentDueDayAllowance,
    );
  }

  private resolveNextDueDate(input: {
    balance: number;
    startDate: Date;
    dailyInstalment: number;
    paidAmount: number;
    maturityDate: Date;
    nextDueIsToday: boolean;
    nextDueLabel: string;
  }) {
    if (input.balance <= 0) return null;
    const today = this.startOfLocalDay(new Date());
    if (input.nextDueIsToday || input.nextDueLabel === 'Overdue') {
      return today.toISOString();
    }
    if (input.dailyInstalment <= 0) {
      return this.startOfLocalDay(input.maturityDate).toISOString();
    }
    const coveredDays = Math.floor(
      Math.max(0, input.paidAmount) / input.dailyInstalment,
    );
    const next = this.startOfLocalDay(input.startDate);
    next.setDate(next.getDate() + coveredDays);
    const maturity = this.startOfLocalDay(input.maturityDate);
    if (next > maturity) return maturity.toISOString();
    if (next < today) return today.toISOString();
    return next.toISOString();
  }

  private startOfLocalDay(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private decimalToNumber(
    value: Prisma.Decimal | number | string | null | undefined,
  ): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    const next = Number(value.toString());
    return Number.isFinite(next) ? next : null;
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + Math.max(0, days));
    return next;
  }
}
