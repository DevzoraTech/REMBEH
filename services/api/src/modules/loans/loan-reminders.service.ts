import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  LoanReminderBatchStatus,
  LoanReminderItemStatus,
  LoanStatus,
  Prisma,
  SmsMessageStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { computeCollectionSchedule } from '../collections/collection-schedule';
import {
  computeLoanPricing,
  resolveBaseRepayable,
} from '../loan-products/loan-pricing';
import { SmsCreditsService } from '../sms-credits/sms-credits.service';
import {
  LoanReminderFilter,
} from './dto/loan-reminders.dto';
import {
  LoanReminderBatchContract,
  LoanReminderEnqueueResponseContract,
  LoanReminderSummaryContract,
} from './loan-reminders.contracts';
import { LOAN_PERMISSIONS } from './loans.permissions';
import { LoanListRecord, LoansRepository } from './loans.repository';

const PURPOSE = 'loan_reminder';
const CLOSED_STATUSES = new Set<string>([
  LoanStatus.CLOSED,
  LoanStatus.WRITTEN_OFF,
]);

@Injectable()
export class LoanRemindersService {
  private readonly logger = new Logger(LoanRemindersService.name);
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly loansRepository: LoansRepository,
    private readonly smsCreditsService: SmsCreditsService,
  ) {}

  async enqueueSingle(
    user: AuthenticatedUser,
    loanId: string,
    options?: { resend?: boolean },
  ): Promise<LoanReminderEnqueueResponseContract> {
    this.assertCanSend(user);
    const branchId = this.requireBranchId(user);
    const loan = await this.prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: user.tenantId!,
        branchId,
      },
      include: {
        customer: { select: { fullName: true, phone: true } },
        branch: { select: { name: true } },
        application: {
          select: {
            durationDays: true,
            paymentStartDate: true,
            processingFee: true,
            interestRatePercent: true,
          },
        },
        wallet: { select: { openingBalance: true, finesTotal: true } },
        repayments: { select: { amount: true } },
      },
    });
    if (!loan) {
      throw new NotFoundException('Loan was not found.');
    }
    if (CLOSED_STATUSES.has(loan.status) || Number(loan.balance) <= 0) {
      throw new BadRequestException(
        'Reminders can only be sent for open loans with a balance.',
      );
    }

    const phone = loan.customer.phone?.trim() ?? '';
    const resend = Boolean(options?.resend);
    const day = this.kampalaDateLabel();
    const idempotencyKey = await this.resolveReminderIdempotencyKey({
      loanId: loan.id,
      day,
      resend,
    });

    if (!resend) {
      const existingOpen = await this.prisma.loanReminderItem.findFirst({
        where: {
          tenantId: user.tenantId!,
          loanId: loan.id,
          status: {
            in: [LoanReminderItemStatus.QUEUED, LoanReminderItemStatus.SENDING],
          },
        },
      });
      if (existingOpen) {
        throw new BadRequestException(
          'A reminder is already being sent for this loan.',
        );
      }

      const alreadySent = await this.findSuccessfulReminderToday(loan.id, day);
      if (alreadySent) {
        const batch = await this.createBatch({
          tenantId: user.tenantId!,
          branchId,
          filter: 'single',
          createdByUserId: user.userId,
          items: [
            {
              loanId: loan.id,
              idempotencyKey: `${idempotencyKey}_dup_${randomUUID()}`,
              status: LoanReminderItemStatus.SKIPPED_ALREADY_SENT,
              failureReason: 'already_sent_today',
              smsMessageId: alreadySent.id,
              sentAt: alreadySent.sentAt,
            },
          ],
        });
        await this.refreshBatchCounts(batch.id);
        return {
          batch: await this.toBatchContract(batch.id),
          reminder: await this.summarizeLoan(user.tenantId!, loan.id),
        };
      }
    }

    if (!phone) {
      const batch = await this.createBatch({
        tenantId: user.tenantId!,
        branchId,
        filter: 'single',
        createdByUserId: user.userId,
        items: [
          {
            loanId: loan.id,
            idempotencyKey: `${idempotencyKey}_nophone_${randomUUID()}`,
            status: LoanReminderItemStatus.SKIPPED_NO_PHONE,
            failureReason: 'no_phone',
          },
        ],
      });
      await this.refreshBatchCounts(batch.id);
      return {
        batch: await this.toBatchContract(batch.id),
        reminder: await this.summarizeLoan(user.tenantId!, loan.id),
      };
    }

    const batch = await this.createBatch({
      tenantId: user.tenantId!,
      branchId,
      filter: 'single',
      createdByUserId: user.userId,
      items: [
        {
          loanId: loan.id,
          idempotencyKey,
          status: LoanReminderItemStatus.QUEUED,
        },
      ],
    });

    await this.processBatchUntilIdle(batch.id);
    return {
      batch: await this.toBatchContract(batch.id),
      reminder: await this.summarizeLoan(user.tenantId!, loan.id),
    };
  }

  async enqueueBulk(
    user: AuthenticatedUser,
    filter: Exclude<LoanReminderFilter, 'single'>,
  ): Promise<LoanReminderBatchContract> {
    this.assertCanSend(user);
    const branchId = this.requireBranchId(user);

    const activeBatch = await this.prisma.loanReminderBatch.findFirst({
      where: {
        tenantId: user.tenantId!,
        branchId,
        status: {
          in: [
            LoanReminderBatchStatus.QUEUED,
            LoanReminderBatchStatus.PROCESSING,
          ],
        },
      },
    });
    if (activeBatch) {
      throw new BadRequestException(
        'A reminder batch is already running for this branch. Wait for it to finish.',
      );
    }

    const loans = await this.loansRepository.listForScope({
      tenantId: user.tenantId!,
      branchId,
    });
    const matching = loans.filter((loan) =>
      this.loanMatchesFilter(loan, filter),
    );

    if (matching.length === 0) {
      throw new BadRequestException('No loans matched that reminder filter.');
    }

    const day = this.kampalaDateLabel();
    const items = [];
    for (const loan of matching) {
      const phone = loan.customer.phone?.trim() ?? '';
      if (!phone) {
        items.push({
          loanId: loan.id,
          idempotencyKey: `loan_reminder_${loan.id}_${day}_nophone_${randomUUID()}`,
          status: LoanReminderItemStatus.SKIPPED_NO_PHONE,
          failureReason: 'no_phone' as string | undefined,
        });
        continue;
      }
      const alreadySent = await this.findSuccessfulReminderToday(loan.id, day);
      if (alreadySent) {
        items.push({
          loanId: loan.id,
          idempotencyKey: `loan_reminder_${loan.id}_${day}_dup_${randomUUID()}`,
          status: LoanReminderItemStatus.SKIPPED_ALREADY_SENT,
          failureReason: 'already_sent_today',
          smsMessageId: alreadySent.id,
          sentAt: alreadySent.sentAt,
        });
        continue;
      }
      items.push({
        loanId: loan.id,
        idempotencyKey: await this.resolveReminderIdempotencyKey({
          loanId: loan.id,
          day,
          resend: false,
        }),
        status: LoanReminderItemStatus.QUEUED,
        failureReason: undefined as string | undefined,
      });
    }

    const batch = await this.createBatch({
      tenantId: user.tenantId!,
      branchId,
      filter,
      createdByUserId: user.userId,
      items,
    });
    await this.refreshBatchCounts(batch.id);
    this.kickDrain();
    return this.toBatchContract(batch.id);
  }

  async getBatch(
    user: AuthenticatedUser,
    batchId: string,
  ): Promise<LoanReminderBatchContract> {
    this.assertCanRead(user);
    const batch = await this.prisma.loanReminderBatch.findFirst({
      where: {
        id: batchId,
        tenantId: user.tenantId!,
        ...(user.permissions.includes(BRANCH_PERMISSIONS.create)
          ? {}
          : { branchId: this.requireBranchId(user) }),
      },
    });
    if (!batch) {
      throw new NotFoundException('Reminder batch was not found.');
    }
    return this.toBatchContract(batch.id);
  }

  async summarizeLoans(
    tenantId: string,
    loanIds: string[],
  ): Promise<Map<string, LoanReminderSummaryContract>> {
    const map = new Map<string, LoanReminderSummaryContract>();
    if (loanIds.length === 0) return map;

    const [openItems, sentMessages, failedItems] = await Promise.all([
      this.prisma.loanReminderItem.findMany({
        where: {
          tenantId,
          loanId: { in: loanIds },
          status: {
            in: [LoanReminderItemStatus.QUEUED, LoanReminderItemStatus.SENDING],
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          loanId: true,
          status: true,
          batchId: true,
          failureReason: true,
        },
      }),
      this.prisma.smsMessage.findMany({
        where: {
          tenantId,
          messageType: PURPOSE,
          triggerReferenceId: { in: loanIds },
          status: {
            in: [SmsMessageStatus.PROVIDER_ACCEPTED, SmsMessageStatus.SENT],
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          triggerReferenceId: true,
          sentAt: true,
          createdAt: true,
        },
      }),
      this.prisma.loanReminderItem.findMany({
        where: {
          tenantId,
          loanId: { in: loanIds },
          status: {
            in: [
              LoanReminderItemStatus.FAILED,
              LoanReminderItemStatus.SKIPPED_NO_CREDIT,
              LoanReminderItemStatus.SKIPPED_NO_PHONE,
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          loanId: true,
          status: true,
          failureReason: true,
        },
      }),
    ]);

    const openByLoan = new Map<string, (typeof openItems)[number]>();
    for (const item of openItems) {
      if (!openByLoan.has(item.loanId)) openByLoan.set(item.loanId, item);
    }
    const sentByLoan = new Map<string, (typeof sentMessages)[number]>();
    for (const message of sentMessages) {
      const loanId = message.triggerReferenceId;
      if (loanId && !sentByLoan.has(loanId)) sentByLoan.set(loanId, message);
    }
    const failedByLoan = new Map<string, (typeof failedItems)[number]>();
    for (const item of failedItems) {
      if (!failedByLoan.has(item.loanId)) failedByLoan.set(item.loanId, item);
    }

    for (const loanId of loanIds) {
      const open = openByLoan.get(loanId);
      const sent = sentByLoan.get(loanId);
      const failed = failedByLoan.get(loanId);
      if (open) {
        map.set(loanId, {
          status:
            open.status === LoanReminderItemStatus.SENDING
              ? 'sending'
              : 'queued',
          lastSentAt: sent?.sentAt?.toISOString() ?? sent?.createdAt.toISOString() ?? null,
          lastFailureReason: null,
          canResend: false,
          activeBatchId: open.batchId,
        });
        continue;
      }
      if (sent) {
        map.set(loanId, {
          status: 'sent',
          lastSentAt: sent.sentAt?.toISOString() ?? sent.createdAt.toISOString(),
          lastFailureReason: null,
          canResend: true,
          activeBatchId: null,
        });
        continue;
      }
      if (failed) {
        map.set(loanId, {
          status: 'failed',
          lastSentAt: null,
          lastFailureReason: failed.failureReason ?? failed.status.toLowerCase(),
          canResend: true,
          activeBatchId: null,
        });
        continue;
      }
      map.set(loanId, {
        status: 'not_sent',
        lastSentAt: null,
        lastFailureReason: null,
        canResend: false,
        activeBatchId: null,
      });
    }

    return map;
  }

  @Cron('*/20 * * * * *')
  async drainQueuedRemindersCron() {
    await this.drainQueuedReminders();
  }

  kickDrain() {
    setImmediate(() => {
      void this.drainQueuedReminders();
    });
  }

  private async drainQueuedReminders() {
    if (this.draining) return;
    this.draining = true;
    try {
      for (let i = 0; i < 25; i += 1) {
        const processed = await this.processNextQueuedItem();
        if (!processed) break;
      }
    } catch (error) {
      this.logger.warn(
        `Loan reminder drain failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
    } finally {
      this.draining = false;
    }
  }

  private async processBatchUntilIdle(batchId: string) {
    await this.prisma.loanReminderBatch.update({
      where: { id: batchId },
      data: { status: LoanReminderBatchStatus.PROCESSING },
    });
    for (let i = 0; i < 50; i += 1) {
      const next = await this.prisma.loanReminderItem.findFirst({
        where: {
          batchId,
          status: LoanReminderItemStatus.QUEUED,
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!next) break;
      await this.processItem(next.id);
    }
    await this.refreshBatchCounts(batchId);
  }

  private async processNextQueuedItem() {
    const next = await this.prisma.loanReminderItem.findFirst({
      where: { status: LoanReminderItemStatus.QUEUED },
      orderBy: { createdAt: 'asc' },
      select: { id: true, batchId: true },
    });
    if (!next) return false;
    await this.prisma.loanReminderBatch.updateMany({
      where: {
        id: next.batchId,
        status: LoanReminderBatchStatus.QUEUED,
      },
      data: { status: LoanReminderBatchStatus.PROCESSING },
    });
    await this.processItem(next.id);
    await this.refreshBatchCounts(next.batchId);
    return true;
  }

  private async processItem(itemId: string) {
    const claimed = await this.prisma.loanReminderItem.updateMany({
      where: {
        id: itemId,
        status: LoanReminderItemStatus.QUEUED,
      },
      data: { status: LoanReminderItemStatus.SENDING },
    });
    if (claimed.count === 0) return;

    const item = await this.prisma.loanReminderItem.findUnique({
      where: { id: itemId },
      include: {
        loan: {
          include: {
            customer: { select: { fullName: true, phone: true } },
            branch: { select: { name: true } },
            application: {
              select: {
                durationDays: true,
                paymentStartDate: true,
                processingFee: true,
                interestRatePercent: true,
              },
            },
            wallet: { select: { openingBalance: true, finesTotal: true } },
            repayments: { select: { amount: true } },
          },
        },
      },
    });
    if (!item) return;

    const phone = item.loan.customer.phone?.trim() ?? '';
    if (!phone) {
      await this.prisma.loanReminderItem.update({
        where: { id: item.id },
        data: {
          status: LoanReminderItemStatus.SKIPPED_NO_PHONE,
          failureReason: 'no_phone',
        },
      });
      return;
    }

    const metrics = this.loanReminderMetrics(item.loan);
    const body = this.buildReminderBody({
      borrowerName: item.loan.customer.fullName,
      balance: metrics.balance,
      overdueDays: metrics.overdueDays,
      nextDueDate: metrics.nextDueDate,
      branchName: item.loan.branch.name,
    });

    const result = await this.smsCreditsService.sendBranchSms({
      tenantId: item.tenantId,
      branchId: item.branchId,
      destination: phone,
      body,
      purpose: PURPOSE,
      triggerSource: 'loans_workspace',
      triggerReferenceId: item.loanId,
      requestedByUserId: undefined,
      idempotencyKey: item.idempotencyKey,
    });

    if (result.sent) {
      await this.prisma.loanReminderItem.update({
        where: { id: item.id },
        data: {
          status: LoanReminderItemStatus.SENT,
          smsMessageId: result.messageId ?? null,
          sentAt: new Date(),
          failureReason: null,
        },
      });
      return;
    }

    const reason = result.reason ?? 'send_failed';
    if (reason === 'no_credits') {
      await this.prisma.loanReminderItem.update({
        where: { id: item.id },
        data: {
          status: LoanReminderItemStatus.SKIPPED_NO_CREDIT,
          smsMessageId: result.messageId ?? null,
          failureReason: 'no_credits',
        },
      });
      await this.prisma.loanReminderItem.updateMany({
        where: {
          batchId: item.batchId,
          status: LoanReminderItemStatus.QUEUED,
        },
        data: {
          status: LoanReminderItemStatus.SKIPPED_NO_CREDIT,
          failureReason: 'no_credits',
        },
      });
      return;
    }

    // Idempotent hit that already sent.
    if (result.messageId && !result.reason) {
      await this.prisma.loanReminderItem.update({
        where: { id: item.id },
        data: {
          status: LoanReminderItemStatus.SENT,
          smsMessageId: result.messageId,
          sentAt: new Date(),
        },
      });
      return;
    }

    if (reason === 'already_sent' || result.messageId) {
      const existing = result.messageId
        ? await this.prisma.smsMessage.findUnique({
            where: { id: result.messageId },
          })
        : null;
      if (
        existing &&
        (existing.status === SmsMessageStatus.PROVIDER_ACCEPTED ||
          existing.status === SmsMessageStatus.SENT)
      ) {
        await this.prisma.loanReminderItem.update({
          where: { id: item.id },
          data: {
            status: LoanReminderItemStatus.SKIPPED_ALREADY_SENT,
            smsMessageId: existing.id,
            sentAt: existing.sentAt,
            failureReason: 'already_sent_today',
          },
        });
        return;
      }
    }

    await this.prisma.loanReminderItem.update({
      where: { id: item.id },
      data: {
        status: LoanReminderItemStatus.FAILED,
        smsMessageId: result.messageId ?? null,
        failureReason: reason,
      },
    });
  }

  private async createBatch(input: {
    tenantId: string;
    branchId: string;
    filter: string;
    createdByUserId: string;
    items: Array<{
      loanId: string;
      idempotencyKey: string;
      status: LoanReminderItemStatus;
      failureReason?: string;
      smsMessageId?: string;
      sentAt?: Date | null;
    }>;
  }) {
    return this.prisma.loanReminderBatch.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        filter: input.filter,
        status: LoanReminderBatchStatus.QUEUED,
        totalCount: input.items.length,
        createdByUserId: input.createdByUserId,
        items: {
          create: input.items.map((item) => ({
            tenantId: input.tenantId,
            branchId: input.branchId,
            loanId: item.loanId,
            idempotencyKey: item.idempotencyKey,
            status: item.status,
            failureReason: item.failureReason ?? null,
            smsMessageId: item.smsMessageId ?? null,
            sentAt: item.sentAt ?? null,
          })),
        },
      },
    });
  }

  private async refreshBatchCounts(batchId: string) {
    const items = await this.prisma.loanReminderItem.groupBy({
      by: ['status'],
      where: { batchId },
      _count: { _all: true },
    });
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let queued = 0;
    let sending = 0;
    let total = 0;
    for (const row of items) {
      const count = row._count._all;
      total += count;
      switch (row.status) {
        case LoanReminderItemStatus.SENT:
          sent += count;
          break;
        case LoanReminderItemStatus.FAILED:
          failed += count;
          break;
        case LoanReminderItemStatus.QUEUED:
          queued += count;
          break;
        case LoanReminderItemStatus.SENDING:
          sending += count;
          break;
        default:
          skipped += count;
          break;
      }
    }

    const done = queued === 0 && sending === 0;
    let status: LoanReminderBatchStatus = LoanReminderBatchStatus.PROCESSING;
    if (done) {
      if (failed > 0 && sent === 0 && skipped === total) {
        status = LoanReminderBatchStatus.FAILED;
      } else if (failed > 0 || skipped > 0) {
        status =
          sent > 0
            ? LoanReminderBatchStatus.PARTIAL
            : LoanReminderBatchStatus.COMPLETED;
      } else {
        status = LoanReminderBatchStatus.COMPLETED;
      }
    } else if (queued === total && sending === 0 && sent === 0) {
      status = LoanReminderBatchStatus.QUEUED;
    }

    await this.prisma.loanReminderBatch.update({
      where: { id: batchId },
      data: {
        totalCount: total,
        sentCount: sent,
        failedCount: failed,
        skippedCount: skipped,
        status,
        completedAt: done ? new Date() : null,
      },
    });
  }

  private async toBatchContract(batchId: string): Promise<LoanReminderBatchContract> {
    const batch = await this.prisma.loanReminderBatch.findUniqueOrThrow({
      where: { id: batchId },
    });
    return {
      id: batch.id,
      branchId: batch.branchId,
      filter: batch.filter,
      status: batch.status,
      totalCount: batch.totalCount,
      sentCount: batch.sentCount,
      failedCount: batch.failedCount,
      skippedCount: batch.skippedCount,
      createdAt: batch.createdAt.toISOString(),
      completedAt: batch.completedAt?.toISOString() ?? null,
    };
  }

  private async summarizeLoan(tenantId: string, loanId: string) {
    const map = await this.summarizeLoans(tenantId, [loanId]);
    return (
      map.get(loanId) ?? {
        status: 'not_sent' as const,
        lastSentAt: null,
        lastFailureReason: null,
        canResend: false,
        activeBatchId: null,
      }
    );
  }

  private loanMatchesFilter(loan: LoanListRecord, filter: string) {
    const balance = Number(loan.balance);
    if (balance <= 0 || CLOSED_STATUSES.has(loan.status)) return false;
    const metrics = this.loanReminderMetrics(loan);
    if (filter === 'active') return true;
    if (filter === 'overdue') return metrics.overdueDays >= 1;
    if (filter === 'due_today') {
      return metrics.overdueDays === 0 && metrics.nextDueIsToday;
    }
    if (filter === 'repayment:2-3') {
      return metrics.overdueDays >= 2 && metrics.overdueDays <= 3;
    }
    if (filter === 'repayment:4-7') {
      return metrics.overdueDays >= 4 && metrics.overdueDays <= 7;
    }
    if (filter === 'repayment:8+') return metrics.overdueDays >= 8;
    return false;
  }

  private loanReminderMetrics(loan: {
    principal: Prisma.Decimal | number;
    balance: Prisma.Decimal | number;
    paymentStartDate: Date | null;
    disbursedAt: Date | null;
    createdAt: Date;
    finesTotal?: Prisma.Decimal | number | null;
    application?: {
      durationDays: number | null;
      paymentStartDate: Date | null;
      processingFee: Prisma.Decimal | number | null;
      interestRatePercent: Prisma.Decimal | number | null;
    } | null;
    wallet?: {
      openingBalance: Prisma.Decimal | number;
      finesTotal: Prisma.Decimal | number;
    } | null;
    repayments: Array<{ amount: Prisma.Decimal | number }>;
  }) {
    const principal = Number(loan.principal);
    const balance = Number(loan.balance);
    const paidAmount = loan.repayments.reduce(
      (sum, repayment) => sum + Number(repayment.amount),
      0,
    );
    const openingBalance =
      loan.wallet?.openingBalance == null
        ? null
        : Number(loan.wallet.openingBalance);
    const finesTotal = Number(
      loan.finesTotal ?? loan.wallet?.finesTotal ?? 0,
    );
    const processingFee = Number(loan.application?.processingFee ?? 0);
    const interestRatePercent = Number(
      loan.application?.interestRatePercent ?? 0,
    );
    const durationDays = loan.application?.durationDays ?? 1;
    const periodDays = durationDays > 0 ? durationDays : 1;
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
    const startDate =
      loan.paymentStartDate ??
      loan.application?.paymentStartDate ??
      loan.disbursedAt ??
      loan.createdAt;
    const schedule = computeCollectionSchedule({
      principalAmount: principal,
      interestRatePercent,
      durationDays: periodDays,
      processingFee,
      balance,
      recordedPaidAmount: paidAmount,
      totalRepayableOverride: baseRepayable,
      startDate,
    });
    const expectedDays = Math.min(
      schedule.loanPeriodDays,
      Math.max(0, schedule.daysElapsed),
    );
    const coveredDays = Math.min(
      expectedDays,
      schedule.dailyInstalment > 0
        ? Math.floor(Math.max(0, paidAmount) / schedule.dailyInstalment)
        : 0,
    );
    const overdueDays =
      balance <= 0 || schedule.dailyInstalment <= 0
        ? 0
        : Math.max(0, expectedDays - coveredDays);

    return {
      balance,
      overdueDays,
      nextDueIsToday: balance > 0 && schedule.nextDueIsToday,
      nextDueDate: schedule.nextDueLabel,
    };
  }

  private buildReminderBody(input: {
    borrowerName: string;
    balance: number;
    overdueDays: number;
    nextDueDate: string;
    branchName: string;
  }) {
    const amount = `UGX ${Math.round(input.balance).toLocaleString('en-UG')}`;
    const duePart =
      input.overdueDays >= 1
        ? `${input.overdueDays} day(s) overdue`
        : `due ${input.nextDueDate}`;
    return `REMBEH: Reminder for ${input.borrowerName}. Loan balance ${amount}. ${duePart}. Please repay. - ${input.branchName}`;
  }

  private async resolveReminderIdempotencyKey(input: {
    loanId: string;
    day: string;
    resend: boolean;
  }) {
    if (input.resend) {
      return `loan_reminder_${input.loanId}_resend_${randomUUID()}`;
    }
    const key = `loan_reminder_${input.loanId}_${input.day}`;
    const existing = await this.prisma.smsMessage.findUnique({
      where: { idempotencyKey: key },
    });
    if (!existing) return key;
    if (
      existing.status === SmsMessageStatus.PROVIDER_ACCEPTED ||
      existing.status === SmsMessageStatus.SENT
    ) {
      return key;
    }
    // Prior failed attempt (e.g. no credits) — allow a fresh try.
    return `loan_reminder_${input.loanId}_${input.day}_retry_${randomUUID()}`;
  }

  private async findSuccessfulReminderToday(loanId: string, day: string) {
    const prefix = `loan_reminder_${loanId}_${day}`;
    return this.prisma.smsMessage.findFirst({
      where: {
        messageType: PURPOSE,
        triggerReferenceId: loanId,
        status: {
          in: [SmsMessageStatus.PROVIDER_ACCEPTED, SmsMessageStatus.SENT],
        },
        OR: [
          { idempotencyKey: prefix },
          { idempotencyKey: { startsWith: `${prefix}_` } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private kampalaDateLabel() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Kampala',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const byType = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return `${byType.year}${byType.month}${byType.day}`;
  }

  private assertCanSend(user: AuthenticatedUser) {
    this.assertCanRead(user);
    if (!user.permissions.includes(LOAN_PERMISSIONS.update)) {
      throw new ForbiddenException(
        'You do not have permission to send loan reminders.',
      );
    }
  }

  private assertCanRead(user: AuthenticatedUser) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Account access is required.');
    }
    if (!user.permissions.includes(LOAN_PERMISSIONS.read)) {
      throw new ForbiddenException('You cannot view loans.');
    }
  }

  private requireBranchId(user: AuthenticatedUser) {
    if (!user.branchId?.trim()) {
      throw new BadRequestException(
        'A branch workspace is required to send loan reminders.',
      );
    }
    return user.branchId;
  }
}
