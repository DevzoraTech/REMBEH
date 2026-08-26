import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { computeCollectionSchedule } from '../collections/collection-schedule';
import { CreateLoanApplicationFromCustomerDto } from '../loan-applications/dto/create-from-customer.dto';
import { LoanApplicationsService } from '../loan-applications/loan-applications.service';
import {
  computeLoanPricing,
  resolveBaseRepayable,
} from '../loan-products/loan-pricing';
import { LoanRemindersService } from './loan-reminders.service';
import {
  LoanListItemContract,
  LoanListResponseContract,
} from './loans.contracts';
import { LoanListRecord, LoansRepository } from './loans.repository';

@Injectable()
export class LoansService {
  constructor(
    private readonly loansRepository: LoansRepository,
    private readonly loanApplicationsService: LoanApplicationsService,
    private readonly loanRemindersService: LoanRemindersService,
  ) {}

  async listLoans(user: AuthenticatedUser): Promise<LoanListResponseContract> {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Account access is required.');
    }

    const canSeeAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );

    if (!canSeeAllBranches && !user.branchId) {
      return { loans: [] };
    }

    const loans = await this.loansRepository.listForScope({
      tenantId: user.tenantId,
      branchId: canSeeAllBranches ? null : user.branchId,
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
      balance,
      paidAmount,
      openingBalance,
      finesTotal,
      totalRepayable,
      expectedInterest,
      processingFee,
      installmentAmount: schedule.dailyInstalment,
      overdueDays,
      nextDueLabel: balance <= 0 ? 'Paid up' : schedule.nextDueLabel,
      nextDueIsToday: balance > 0 && schedule.nextDueIsToday,
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
