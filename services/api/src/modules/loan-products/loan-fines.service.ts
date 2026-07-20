import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoanStatus, Prisma, TenantStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SmsService } from '../notifications/sms.service';
import { REALTIME_EVENTS } from '../realtime/realtime.events';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  computeLoanDueDate,
  computeMissingFinePeriods,
} from './loan-fine-schedule';
import { LoanProductsRepository } from './loan-products.repository';

const ACTIVE_FOR_FINES: LoanStatus[] = [
  LoanStatus.SUBMITTED,
  LoanStatus.APPROVED,
  LoanStatus.DISBURSED,
  LoanStatus.CURRENT,
  LoanStatus.IN_ARREARS,
  LoanStatus.RESTRUCTURED,
];

@Injectable()
export class LoanFinesService {
  private readonly logger = new Logger(LoanFinesService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: LoanProductsRepository,
    private readonly smsService: SmsService,
    private readonly realtime: RealtimeGateway,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Daily scan (timezone via CRON_TZ / TZ env, default host local).
   * Also callable via POST /loan-products/fines/run.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async runScheduled(): Promise<void> {
    if (this.configService.get<string>('LOAN_FINES_CRON_ENABLED') === 'false') {
      return;
    }
    await this.runAllTenants();
  }

  async runAllTenants(): Promise<{
    tenantsScanned: number;
    finesApplied: number;
    loansTouched: number;
  }> {
    if (this.running) {
      this.logger.warn('Fine job already running; skipping overlapping run.');
      return { tenantsScanned: 0, finesApplied: 0, loansTouched: 0 };
    }
    this.running = true;
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: { status: TenantStatus.ACTIVE },
        select: { id: true },
      });
      let finesApplied = 0;
      let loansTouched = 0;
      for (const tenant of tenants) {
        const result = await this.runForTenant(tenant.id);
        finesApplied += result.finesApplied;
        loansTouched += result.loansTouched;
      }
      this.logger.log(
        `Fine job done: tenants=${tenants.length} fines=${finesApplied} loans=${loansTouched}`,
      );
      return {
        tenantsScanned: tenants.length,
        finesApplied,
        loansTouched,
      };
    } finally {
      this.running = false;
    }
  }

  async runForTenant(tenantId: string): Promise<{
    tenantId: string;
    finesApplied: number;
    loansTouched: number;
  }> {
    const asOf = new Date();
    const loans = await this.prisma.loan.findMany({
      where: {
        tenantId,
        status: { in: ACTIVE_FOR_FINES },
        balance: { gt: 0 },
      },
      include: {
        customer: true,
        wallet: true,
        application: { select: { durationDays: true, paymentStartDate: true } },
        fines: { select: { periodIndex: true } },
      },
    });

    let finesApplied = 0;
    let loansTouched = 0;

    // Cache effective policy per branch
    const policyCache = new Map<
      string,
      Awaited<ReturnType<LoanProductsRepository['findEffectiveFinePolicy']>>
    >();

    for (const loan of loans) {
      const cacheKey = loan.branchId;
      if (!policyCache.has(cacheKey)) {
        policyCache.set(
          cacheKey,
          await this.repository.findEffectiveFinePolicy({
            tenantId,
            branchId: loan.branchId,
          }),
        );
      }
      const policy = policyCache.get(cacheKey);
      if (
        !policy ||
        !policy.isActive ||
        policy.finePeriodDays < 1 ||
        Number(policy.fineAmount.toString()) <= 0
      ) {
        continue;
      }

      const paymentStartDate =
        loan.paymentStartDate ??
        loan.application?.paymentStartDate ??
        loan.disbursedAt ??
        loan.createdAt;
      const durationDays = loan.application?.durationDays ?? 0;
      if (!paymentStartDate || durationDays < 1) {
        continue;
      }

      const balance = Number(loan.balance.toString());
      const appliedIndexes = loan.fines.map((f) => f.periodIndex);
      const missing = computeMissingFinePeriods({
        paymentStartDate,
        durationDays,
        finePeriodDays: policy.finePeriodDays,
        balance,
        asOf,
        appliedPeriodIndexes: appliedIndexes,
      });
      if (missing.length === 0) {
        continue;
      }

      let loanTouched = false;
      let currentBalance = balance;
      for (const period of missing) {
        if (currentBalance <= 0) {
          break;
        }
        const applied = await this.applyFinePeriod({
          loanId: loan.id,
          tenantId: loan.tenantId,
          branchId: loan.branchId,
          customerPhone: loan.customer.phone,
          customerName: loan.customer.fullName,
          currency: loan.currency,
          periodIndex: period.periodIndex,
          dueAt: period.dueAt,
          fineAmount: policy.fineAmount,
          finePeriodDays: policy.finePeriodDays,
          companyName: undefined,
        });
        if (applied) {
          finesApplied += 1;
          loanTouched = true;
          currentBalance = applied.nextBalance;
        }
      }
      if (loanTouched) {
        loansTouched += 1;
      }
    }

    return { tenantId, finesApplied, loansTouched };
  }

  private async applyFinePeriod(input: {
    loanId: string;
    tenantId: string;
    branchId: string;
    customerPhone: string;
    customerName: string;
    currency: string;
    periodIndex: number;
    dueAt: Date;
    fineAmount: Prisma.Decimal;
    finePeriodDays: number;
    companyName?: string;
  }): Promise<{ nextBalance: number } | null> {
    const amount = Number(input.fineAmount.toString());
    if (amount <= 0) {
      return null;
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const loan = await tx.loan.findFirst({
          where: {
            id: input.loanId,
            tenantId: input.tenantId,
            balance: { gt: 0 },
          },
          include: { wallet: true, tenant: true },
        });
        if (!loan) {
          return null;
        }

        const existing = await tx.loanFine.findUnique({
          where: {
            loanId_periodIndex: {
              loanId: input.loanId,
              periodIndex: input.periodIndex,
            },
          },
        });
        if (existing) {
          return {
            nextBalance: Number(loan.balance.toString()),
            skipped: true as const,
            fineId: existing.id,
            outstanding: Number(loan.balance.toString()),
            finesTotal: Number(loan.finesTotal.toString()),
            companyName: loan.tenant.name,
          };
        }

        const nextBalance = new Prisma.Decimal(
          (Number(loan.balance.toString()) + amount).toFixed(2),
        );
        const nextFinesTotal = new Prisma.Decimal(
          (Number(loan.finesTotal.toString()) + amount).toFixed(2),
        );

        const fine = await tx.loanFine.create({
          data: {
            tenantId: input.tenantId,
            branchId: input.branchId,
            loanId: input.loanId,
            periodIndex: input.periodIndex,
            amount: input.fineAmount,
            dueAt: input.dueAt,
          },
        });

        await tx.loan.update({
          where: { id: input.loanId },
          data: {
            balance: nextBalance,
            finesTotal: nextFinesTotal,
            isFined: true,
            status:
              loan.status === LoanStatus.CLOSED
                ? loan.status
                : LoanStatus.IN_ARREARS,
          },
        });

        if (loan.wallet) {
          await tx.clientWallet.update({
            where: { id: loan.wallet.id },
            data: {
              isFined: true,
              finesTotal: nextFinesTotal,
            },
          });
        }

        return {
          nextBalance: Number(nextBalance.toString()),
          skipped: false as const,
          fineId: fine.id,
          outstanding: Number(nextBalance.toString()),
          finesTotal: Number(nextFinesTotal.toString()),
          companyName: loan.tenant.name,
        };
      });

      if (!result || result.skipped) {
        return result ? { nextBalance: result.nextBalance } : null;
      }

      this.realtime.emitToTenant(input.tenantId, REALTIME_EVENTS.loanFined, {
        fineId: result.fineId,
        loanId: input.loanId,
        tenantId: input.tenantId,
        branchId: input.branchId,
        clientName: input.customerName,
        phone: input.customerPhone,
        amount,
        periodIndex: input.periodIndex,
        outstanding: result.outstanding,
        finesTotal: result.finesTotal,
        appliedAt: new Date().toISOString(),
      });
      this.realtime.emitToBranch(
        input.tenantId,
        input.branchId,
        REALTIME_EVENTS.loanFined,
        {
          fineId: result.fineId,
          loanId: input.loanId,
          tenantId: input.tenantId,
          branchId: input.branchId,
          clientName: input.customerName,
          phone: input.customerPhone,
          amount,
          periodIndex: input.periodIndex,
          outstanding: result.outstanding,
          finesTotal: result.finesTotal,
          appliedAt: new Date().toISOString(),
        },
      );

      void this.sendFineSms({
        destination: input.customerPhone,
        amount,
        currency: input.currency,
        periodIndex: input.periodIndex,
        finePeriodDays: input.finePeriodDays,
        outstanding: result.outstanding,
        companyName: result.companyName,
      }).catch((error) => {
        this.logger.warn(`Fine SMS failed: ${String(error)}`);
      });

      return { nextBalance: result.nextBalance };
    } catch (error) {
      // Unique violation = another worker applied the same period — ignore.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      this.logger.warn(
        `Failed to apply fine loan=${input.loanId} period=${input.periodIndex}: ${String(error)}`,
      );
      return null;
    }
  }

  private async sendFineSms(input: {
    destination: string;
    amount: number;
    currency: string;
    periodIndex: number;
    finePeriodDays: number;
    outstanding: number;
    companyName: string;
  }) {
    if (!input.destination?.trim()) {
      return;
    }
    const amountLabel = `${input.currency} ${input.amount.toLocaleString('en-UG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
    const outstandingLabel = `${input.currency} ${input.outstanding.toLocaleString(
      'en-UG',
      { minimumFractionDigits: 0, maximumFractionDigits: 0 },
    )}`;
    const body =
      `REMBEH overdue fine: ${amountLabel} added to your loan at ${input.companyName} ` +
      `(period ${input.periodIndex}, every ${input.finePeriodDays} day` +
      `${input.finePeriodDays === 1 ? '' : 's'} unpaid after due date). ` +
      `New outstanding: ${outstandingLabel}. Please pay to avoid further fines.`;

    await this.smsService.sendText({
      destination: input.destination,
      body,
    });
  }

  /** Exposed for tests / docs — maturity helper. */
  loanDueDate(paymentStartDate: Date, durationDays: number) {
    return computeLoanDueDate(paymentStartDate, durationDays);
  }
}
