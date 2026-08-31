import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchOperationReportStatus,
  ControlledFeatureScope,
  LoanApplicationMediaType,
  LoanApplicationStatus,
  LoanStatus,
  Prisma,
  RepaymentCorrectionRequestStatus,
  RepaymentMethod,
  SmsMessageStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { BillingService } from '../billing/billing.service';
import {
  isInternationalPhoneNumber,
  normalizeEmailAddress,
  normalizeInternationalPhoneNumber,
} from '../../common/security/identity-normalization';
import {
  computeLoanPricing,
  resolveBaseRepayable,
} from '../loan-products/loan-pricing';
import { REALTIME_EVENTS } from '../realtime/realtime.events';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SmsCreditsService } from '../sms-credits/sms-credits.service';
import { SmsNotificationSettingsService } from '../sms-credits/sms-notification-settings.service';
import { buildPaymentConfirmationSms } from '../sms-credits/sms-notification-templates';
import { ObjectStorageService } from '../storage/object-storage.service';
import {
  allocateRepayment,
  computeCollectionSchedule,
} from './collection-schedule';
import {
  ClientLoanDetailContract,
  CollectionSummaryContract,
  DailyAgentDetailContract,
  DailyAgentSummaryContract,
  DailyCollectionsSummaryContract,
  DueClientContract,
  LegacyLoanCorrectionMediaPresignResponseContract,
  RepaymentBulkSmsResultContract,
  RepaymentCorrectionRequestContract,
  RecordRepaymentResponseContract,
  RepaymentDetailContract,
  RepaymentListItemContract,
  RepaymentSmsSendResultContract,
  RepaymentSmsStatusContract,
} from './collections.contracts';
import {
  CollectionsRepository,
  LoanWithCollections,
  activeLoanStatuses,
} from './collections.repository';
import { RecordRepaymentDto } from './dto/record-repayment.dto';
import {
  LegacyLoanCorrectionDto,
  LegacyLoanDeleteDto,
} from './dto/legacy-loan-correction.dto';
import {
  LegacyLoanMediaConfirmDto,
  LegacyLoanMediaPresignDto,
} from './dto/legacy-loan-media.dto';
import {
  BulkRepaymentSmsDto,
  SendRepaymentSmsDto,
} from './dto/repayment-sms.dto';
import {
  ApplyRepaymentCorrectionDto,
  CreateRepaymentCorrectionRequestDto,
  ReviewRepaymentCorrectionRequestDto,
} from './dto/repayment-correction-request.dto';
import { FcmPushService } from '../notifications/fcm-push.service';
import { COLLECTION_PERMISSIONS } from './collections.permissions';

const PAYMENT_CONFIRMATION_PURPOSE = 'payment_confirmation';
const PAYMENT_CONFIRMATION_TRIGGER = 'repayment_recorded';
const LEGACY_DATA_CORRECTION_FEATURE = 'legacy_data_corrections';
const CORRECTION_SIGNATURE_MEDIA_TYPES = new Set<LoanApplicationMediaType>([
  LoanApplicationMediaType.SIGNATURE_APPLICANT,
  LoanApplicationMediaType.SIGNATURE_GUARANTOR,
  LoanApplicationMediaType.SIGNATURE_OFFICER,
]);

const ACCEPTED_SMS_STATUSES = new Set<SmsMessageStatus>([
  SmsMessageStatus.PROVIDER_ACCEPTED,
  SmsMessageStatus.SENT,
]);

const ACTIVE_SMS_STATUSES = new Set<SmsMessageStatus>([
  SmsMessageStatus.PENDING_VALIDATION,
  SmsMessageStatus.RESERVED,
  SmsMessageStatus.PROVIDER_UNCERTAIN,
]);

const RETRYABLE_PAYMENT_SMS_STATUSES = new Set<SmsMessageStatus>([
  SmsMessageStatus.FAILED_INSUFFICIENT_CREDITS,
  SmsMessageStatus.BLOCKED_PROVIDER_UNAVAILABLE,
  SmsMessageStatus.PROVIDER_FAILED,
  SmsMessageStatus.RELEASED,
]);

type RepaymentSmsMessageRecord = {
  id: string;
  triggerReferenceId: string | null;
  status: SmsMessageStatus;
  failureReason: string | null;
  sentAt: Date | null;
  createdAt: Date;
};

const repaymentCorrectionRequestInclude = {
  branch: true,
  loan: {
    include: {
      customer: true,
    },
  },
  repayment: {
    include: {
      recordedBy: true,
      loan: {
        include: {
          customer: true,
        },
      },
    },
  },
  requestedBy: true,
  reviewedBy: true,
  correctionAppliedBy: true,
} satisfies Prisma.RepaymentCorrectionRequestInclude;

type RepaymentCorrectionRequestRecord =
  Prisma.RepaymentCorrectionRequestGetPayload<{
    include: typeof repaymentCorrectionRequestInclude;
  }>;

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    private readonly repository: CollectionsRepository,
    private readonly realtime: RealtimeGateway,
    private readonly prisma: PrismaService,
    private readonly objectStorage: ObjectStorageService,
    private readonly billingService: BillingService,
    private readonly smsCreditsService: SmsCreditsService,
    private readonly smsNotificationSettings: SmsNotificationSettingsService,
    private readonly fcmPushService: FcmPushService,
  ) {}

  async getSummary(
    user: AuthenticatedUser,
  ): Promise<{ summary: CollectionSummaryContract }> {
    this.assertBranchAccess(user);

    const scope = this.scope(user);

    const now = new Date();

    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    dayEnd.setMilliseconds(dayEnd.getMilliseconds() - 1);

    const [loans, todayAgg] = await Promise.all([
      this.repository.listActiveLoans(scope),

      this.repository.sumRepaymentsToday({
        ...scope,
        dayStart,
        dayEnd,
      }),
    ]);

    const dueCandidates = await Promise.all(
      loans.map((loan) => this.toDueClient(loan, now)),
    );

    const clientsDueToday = dueCandidates
      .filter(
        (item): item is DueClientContract => item != null && item.amountDue > 0,
      )
      .sort(
        (a, b) =>
          new Date(b.lastActivityAt).getTime() -
          new Date(a.lastActivityAt).getTime(),
      );

    return {
      summary: {
        amountCollectedToday: this.decimalToNumber(todayAgg._sum.amount) ?? 0,

        repaymentsTodayCount: todayAgg._count._all,

        dueTodayCount: clientsDueToday.length,

        pendingSyncCount: 0,

        clientsDueToday,
      },
    };
  }

  async listDueToday(
    user: AuthenticatedUser,
  ): Promise<{ clients: DueClientContract[] }> {
    const { summary } = await this.getSummary(user);

    return {
      clients: summary.clientsDueToday,
    };
  }

  async listRepayments(
    user: AuthenticatedUser,
    filter?: string,
  ): Promise<{ repayments: RepaymentListItemContract[] }> {
    this.assertBranchAccess(user);

    const scope = this.scope(user);

    const range = this.filterToRange(filter);

    const rows = await this.repository.listRepayments({
      ...scope,
      from: range?.from,
      to: range?.to,
    });

    const smsByRepayment = await this.summarizeRepaymentSms(
      user.tenantId!,
      rows.map((row) => row.id),
    );

    const repayments = await Promise.all(
      rows.map(async (row) => {
        const loan = row.loan;

        const detail = await this.buildDetail(loan);

        const agentPhotoStorageKey =
          row.recordedBy.profilePhotoStorageKey ?? null;

        return {
          id: row.id,

          loanId: row.loanId,

          customerId: loan.customerId,

          clientName: loan.customer.fullName,

          phone: loan.customer.phone,

          amount: this.decimalToNumber(row.amount) ?? 0,

          amountPaid: detail.paidAmount,

          loanAmount: detail.loanAmount,

          recordedAt: row.paidAt.toISOString(),

          synced: true,

          dueToday: detail.nextDueIsToday,

          note: row.note,

          method: row.method,

          recordedByName: row.recordedBy.displayName,

          recordedByPublicId: row.recordedBy.publicId ?? null,

          agentPhotoUrl: await this.presignPhotoUrl(agentPhotoStorageKey),

          agentPhotoStorageKey,

          sms: smsByRepayment.get(row.id) ?? this.emptyRepaymentSmsStatus(),
        } satisfies RepaymentListItemContract;
      }),
    );

    if (filter === 'dueToday') {
      return {
        repayments: repayments.filter((item) => item.dueToday),
      };
    }

    if (filter === 'collectedToday') {
      const now = new Date();

      return {
        repayments: repayments.filter((item) =>
          this.sameDay(new Date(item.recordedAt), now),
        ),
      };
    }

    return {
      repayments,
    };
  }

  async searchClients(
    user: AuthenticatedUser,
    query: string,
  ): Promise<{ clients: ClientLoanDetailContract[] }> {
    this.assertBranchAccess(user);

    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Tenant scope is required.');
    }

    const q = query.trim();

    if (q.length < 1) {
      return {
        clients: [],
      };
    }

    const scope = this.scope(user);

    const loans = await this.repository.searchLoans({
      ...scope,
      query: q,
    });

    /*
     * Preserve repository phone-first ranking.
     */
    const clients = await Promise.all(
      loans.map((loan) => this.buildDetail(loan)),
    );

    return {
      clients,
    };
  }

  async offlineSnapshot(user: AuthenticatedUser): Promise<{
    cachedAt: string;

    clients: Array<{
      loanId: string;
      customerId: string;
      fullName: string;
      phone: string;
      nationalId: string | null;

      outstanding: number;
      loanAmount: number;

      registeredBy: string;

      expectedToday: number;
      paidAmount: number;

      isFined: boolean;
      finesTotal: number;

      nextDueLabel: string;
      nextDueIsToday: boolean;

      daysLeft: number;
      loanPeriodDays: number;

      interestRatePercent: number;

      loanStartDate: string;
      maturityDate: string | null;
    }>;
  }> {
    this.assertBranchAccess(user);

    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Tenant scope is required.');
    }

    const scope = this.scope(user);

    const loans = await this.repository.listActiveLoansForOffline(scope);

    const clients = await Promise.all(
      loans.map(async (loan) => {
        // =====================================================================
        // BASE LOAN VALUES
        // =====================================================================

        const principal =
          this.decimalToNumber(loan.application?.principalAmount) ??
          this.decimalToNumber(loan.principal) ??
          0;

        const balance = this.decimalToNumber(loan.balance) ?? 0;

        const interestRatePercent =
          this.decimalToNumber(loan.application?.interestRatePercent) ?? 0;

        const processingFee =
          this.decimalToNumber(loan.application?.processingFee) ?? 0;

        const finesTotal =
          this.decimalToNumber(loan.finesTotal) ??
          this.decimalToNumber(loan.wallet?.finesTotal) ??
          0;

        const durationDays = loan.application?.durationDays ?? 1;

        const periodDays = durationDays > 0 ? durationDays : 1;

        const repaymentFrequency =
          loan.application?.repaymentFrequency ?? 'DAILY';

        // =====================================================================
        // CONTRACTUAL REPAYMENT START
        // =====================================================================

        /*
         * This is the first contractual repayment date.
         *
         * NEXT_DAY / AFTER_N_DAYS must remain respected.
         */
        const repaymentStartDate =
          loan.paymentStartDate ??
          loan.application?.paymentStartDate ??
          loan.disbursedAt ??
          loan.createdAt;

        // =====================================================================
        // PRICING
        // =====================================================================

        /*
         * Processing fee remains independent fee income.
         *
         * pricing.totalRepayable must therefore represent:
         *
         * principal + contractual interest.
         */
        const pricing = computeLoanPricing({
          principalAmount: principal,

          interestRatePercent,

          durationDays: periodDays,

          processingFee,
        });

        // =====================================================================
        // CONTRACTUAL OPENING DEBT
        // =====================================================================

        const openingBalance = this.decimalToNumber(
          loan.wallet?.openingBalance,
        );

        const baseRepayable = resolveBaseRepayable({
          openingBalance,

          pricedTotal: pricing.totalRepayable,

          principal,

          balance,

          finesTotal,
        });

        /*
         * Offline snapshot does not load repayment rows.
         *
         * Current balance may include fines, so remove that effect
         * when deriving contractual paid amount.
         */
        const contractualPaid = this.roundMoney(
          Math.max(
            0,

            baseRepayable + finesTotal - balance,
          ),
        );

        // =====================================================================
        // SCHEDULE
        // =====================================================================

        const schedule = computeCollectionSchedule({
          principalAmount: principal,

          interestRatePercent,

          durationDays: periodDays,

          repaymentFrequency,

          processingFee,

          balance,

          recordedPaidAmount: contractualPaid,

          /*
           * principal + interest only.
           */
          totalRepayableOverride: baseRepayable,

          /*
           * First contractual repayment date.
           */
          startDate: repaymentStartDate,
        });

        const correctionAccess = await this.resolveLegacyCorrectionAccess(
          loan.tenantId,
          loan.branchId,
        );

        // =====================================================================
        // OUTPUT
        // =====================================================================

        return {
          loanId: loan.id,

          customerId: loan.customerId,

          fullName: loan.customer.fullName,

          phone: loan.customer.phone,

          nationalId: loan.customer.nationalId ?? null,

          customerEmail: loan.customer.email ?? null,

          outstanding: schedule.outstanding,

          /*
           * Borrower's current obligation.
           *
           * Processing fee excluded.
           */
          loanAmount: this.roundMoney(baseRepayable + finesTotal),

          principalAmount: principal,

          openingBalance: openingBalance ?? null,

          registeredBy:
            loan.application?.officer?.displayName ?? 'Branch officer',

          expectedToday: schedule.expectedToday,

          paidAmount: schedule.paidAmount,

          isFined: loan.isFined || (loan.wallet?.isFined ?? false),

          finesTotal,

          nextDueLabel: schedule.nextDueLabel,

          nextDueIsToday: schedule.nextDueIsToday,

          daysLeft: schedule.daysLeft,

          loanPeriodDays: schedule.loanPeriodDays,

          interestRatePercent,

          /*
           * Compatibility field.
           *
           * Represents first repayment date.
           */
          loanStartDate: schedule.loanStartDate,

          paymentStartDate: repaymentStartDate.toISOString(),

          maturityDate: schedule.maturityDate,

          status: loan.status,

          correctionAccess,
        };
      }),
    );

    return {
      cachedAt: new Date().toISOString(),

      clients,
    };
  }

  async getLoanDetail(
    user: AuthenticatedUser,
    loanId: string,
  ): Promise<{ detail: ClientLoanDetailContract }> {
    this.assertBranchAccess(user);

    const loan = await this.repository.findLoanById({
      ...this.scope(user),
      loanId,
    });

    if (!loan) {
      throw new NotFoundException('Loan not found.');
    }

    return {
      detail: await this.buildDetail(loan),
    };
  }

  async correctLegacyLoan(
    user: AuthenticatedUser,
    loanId: string,
    dto: LegacyLoanCorrectionDto,
  ): Promise<{ detail: ClientLoanDetailContract }> {
    this.assertBranchAccess(user);

    const loan = await this.repository.findLoanById({
      ...this.scope(user),
      loanId,
    });

    if (!loan) {
      throw new NotFoundException('Loan not found.');
    }

    const access = await this.resolveLegacyCorrectionAccess(
      loan.tenantId,
      loan.branchId,
    );

    if (!access.enabled) {
      throw new ForbiddenException(
        'Legacy data correction is not enabled for this branch.',
      );
    }

    const cleanReason = dto.reason.trim();
    const customerUpdate: Prisma.CustomerUpdateInput = {};
    const loanUpdate: Prisma.LoanUpdateInput = {};

    if (dto.customerFullName !== undefined) {
      const fullName = dto.customerFullName.trim();
      if (fullName.length < 2) {
        throw new BadRequestException('Customer name is too short.');
      }
      customerUpdate.fullName = fullName;
    }

    let nextPhone: string | undefined;
    if (dto.phone !== undefined) {
      nextPhone = this.normalizeCorrectionPhone(dto.phone);
      customerUpdate.phone = nextPhone;
    }

    if (dto.nationalId !== undefined) {
      customerUpdate.nationalId = this.cleanOptionalText(dto.nationalId);
    }

    if (dto.email !== undefined) {
      customerUpdate.email = dto.email
        ? normalizeEmailAddress(dto.email)
        : null;
    }

    if (dto.principalAmount !== undefined) {
      loanUpdate.principal = new Prisma.Decimal(
        this.roundMoney(dto.principalAmount).toFixed(2),
      );
    }

    const currentBalance = this.decimalToNumber(loan.balance) ?? 0;
    const nextBalance =
      dto.outstandingBalance !== undefined
        ? this.roundMoney(dto.outstandingBalance)
        : currentBalance;

    if (dto.outstandingBalance !== undefined) {
      loanUpdate.balance = new Prisma.Decimal(nextBalance.toFixed(2));
    }

    const nextStatus = dto.status ?? loan.status;
    if (
      nextBalance > 0 &&
      (nextStatus === LoanStatus.CLOSED ||
        nextStatus === LoanStatus.WRITTEN_OFF)
    ) {
      throw new BadRequestException(
        'Set outstanding balance to zero before closing or writing off this loan.',
      );
    }
    loanUpdate.status = nextStatus;

    const loanStartDate = this.parseCorrectionDate(
      dto.loanStartDate,
      'loanStartDate',
    );
    if (loanStartDate) {
      loanUpdate.disbursedAt = loanStartDate;
      loanUpdate.approvedAt = loan.approvedAt ?? loanStartDate;
    }

    const paymentStartDate = this.parseCorrectionDate(
      dto.paymentStartDate,
      'paymentStartDate',
    );
    if (paymentStartDate) {
      loanUpdate.paymentStartDate = paymentStartDate;
    }

    const hasLoanChange =
      Object.keys(loanUpdate).some((key) => key !== 'status') ||
      nextStatus !== loan.status;

    if (Object.keys(customerUpdate).length === 0 && !hasLoanChange) {
      throw new BadRequestException('No correction changes were provided.');
    }

    const oldValue = this.legacyLoanAuditValue(loan);
    const newValue = this.legacyLoanCorrectionAuditValue({
      reason: cleanReason,
      customer: {
        ...(dto.customerFullName !== undefined
          ? { fullName: customerUpdate.fullName as string }
          : {}),
        ...(nextPhone !== undefined ? { phone: nextPhone } : {}),
        ...(dto.nationalId !== undefined
          ? { nationalId: this.cleanOptionalText(dto.nationalId) }
          : {}),
        ...(dto.email !== undefined
          ? { email: dto.email ? normalizeEmailAddress(dto.email) : null }
          : {}),
      },
      loan: {
        ...(dto.principalAmount !== undefined
          ? { principal: this.roundMoney(dto.principalAmount) }
          : {}),
        ...(dto.outstandingBalance !== undefined
          ? { balance: nextBalance }
          : {}),
        status: nextStatus,
        ...(loanStartDate
          ? { approvedAt: (loan.approvedAt ?? loanStartDate).toISOString() }
          : {}),
        ...(loanStartDate ? { disbursedAt: loanStartDate.toISOString() } : {}),
        ...(paymentStartDate
          ? { paymentStartDate: paymentStartDate.toISOString() }
          : {}),
      },
      access,
    });

    await this.prisma.$transaction(async (tx) => {
      if (nextPhone && nextPhone !== loan.customer.phone) {
        const duplicate = await tx.customer.findFirst({
          where: {
            tenantId: loan.tenantId,
            phone: nextPhone,
            id: { not: loan.customerId },
          },
          select: { id: true },
        });

        if (duplicate) {
          throw new ConflictException(
            'Another customer in this organization already uses this phone.',
          );
        }
      }

      if (Object.keys(customerUpdate).length > 0) {
        await tx.customer.update({
          where: { id: loan.customerId },
          data: customerUpdate,
        });
      }

      await tx.loan.update({
        where: { id: loan.id },
        data: loanUpdate,
      });

      if (
        dto.outstandingBalance !== undefined &&
        loan.repayments.length === 0
      ) {
        if (loan.wallet) {
          await tx.clientWallet.update({
            where: { loanId: loan.id },
            data: {
              openingBalance: new Prisma.Decimal(nextBalance.toFixed(2)),
            },
          });
        } else {
          await tx.clientWallet.create({
            data: {
              tenantId: loan.tenantId,
              branchId: loan.branchId,
              customerId: loan.customerId,
              loanId: loan.id,
              currency: loan.currency,
              openingBalance: new Prisma.Decimal(nextBalance.toFixed(2)),
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId: loan.tenantId,
          actorUserId: user.userId,
          action: 'legacy.loan.corrected',
          entityType: 'Loan',
          entityId: loan.id,
          oldValue,
          newValue,
        },
      });
    });

    const updated = await this.repository.findLoanById({
      ...this.scope(user),
      loanId,
    });

    if (!updated) {
      throw new NotFoundException('Corrected loan could not be loaded.');
    }

    return {
      detail: await this.buildDetail(updated),
    };
  }

  async deleteLegacyLoan(
    user: AuthenticatedUser,
    loanId: string,
    dto: LegacyLoanDeleteDto,
  ) {
    this.assertBranchAccess(user);

    const loan = await this.repository.findLoanById({
      ...this.scope(user),
      loanId,
    });

    if (!loan) {
      throw new NotFoundException('Loan not found.');
    }

    const access = await this.resolveLegacyCorrectionAccess(
      loan.tenantId,
      loan.branchId,
    );

    if (!access.enabled) {
      throw new ForbiddenException(
        'Legacy data correction is not enabled for this branch.',
      );
    }

    if (loan.repayments.length > 0) {
      throw new BadRequestException(
        'This loan already has repayments. Correct its status or balance instead of deleting it.',
      );
    }

    const oldValue = this.legacyLoanAuditValue(loan);
    const cleanReason = dto.reason.trim();

    let customerDeleted = false;

    await this.prisma.$transaction(async (tx) => {
      await tx.clientWallet.deleteMany({ where: { loanId: loan.id } });
      await tx.loanFine.deleteMany({ where: { loanId: loan.id } });
      await tx.loan.delete({ where: { id: loan.id } });

      const otherLoans = await tx.loan.count({
        where: {
          tenantId: loan.tenantId,
          customerId: loan.customerId,
        },
      });

      if (otherLoans === 0) {
        await tx.customer.delete({ where: { id: loan.customerId } });
        customerDeleted = true;
      }

      await tx.auditLog.create({
        data: {
          tenantId: loan.tenantId,
          actorUserId: user.userId,
          action: 'legacy.loan.deleted',
          entityType: 'Loan',
          entityId: loan.id,
          oldValue,
          newValue: {
            reason: cleanReason,
            customerDeleted: otherLoans === 0,
            access,
          },
        },
      });
    });

    return {
      deleted: true,
      loanId: loan.id,
      customerId: loan.customerId,
      customerDeleted,
    };
  }

  async presignLegacyLoanCorrectionMedia(
    user: AuthenticatedUser,
    loanId: string,
    dto: LegacyLoanMediaPresignDto,
  ): Promise<LegacyLoanCorrectionMediaPresignResponseContract> {
    this.assertBranchAccess(user);

    if (CORRECTION_SIGNATURE_MEDIA_TYPES.has(dto.mediaType)) {
      throw new BadRequestException(
        'Use the normal signing flow for electronic signatures.',
      );
    }

    const loan = await this.repository.findLoanById({
      ...this.scope(user),
      loanId,
    });

    if (!loan) {
      throw new NotFoundException('Loan not found.');
    }

    const access = await this.resolveLegacyCorrectionAccess(
      loan.tenantId,
      loan.branchId,
    );

    if (!access.enabled) {
      throw new ForbiddenException(
        'Legacy data correction is not enabled for this branch.',
      );
    }

    const application = await this.ensureCorrectionApplication(user, loan);
    const extension =
      dto.extension ||
      this.extensionFromMime(dto.mimeType) ||
      this.extensionFromFileName(dto.fileName) ||
      'bin';

    const storageKey = this.objectStorage.buildObjectKey({
      tenantId: loan.tenantId,
      branchId: loan.branchId,
      applicationId: application.id,
      mediaType: dto.mediaType,
      extension,
    });

    const presigned = await this.objectStorage.presignPut({
      storageKey,
      mimeType: dto.mimeType,
    });

    return {
      ...presigned,
      mediaType: dto.mediaType,
    };
  }

  async confirmLegacyLoanCorrectionMedia(
    user: AuthenticatedUser,
    loanId: string,
    dto: LegacyLoanMediaConfirmDto,
  ): Promise<{ detail: ClientLoanDetailContract }> {
    this.assertBranchAccess(user);

    if (CORRECTION_SIGNATURE_MEDIA_TYPES.has(dto.mediaType)) {
      throw new BadRequestException(
        'Use the normal signing flow for electronic signatures.',
      );
    }

    const loan = await this.repository.findLoanById({
      ...this.scope(user),
      loanId,
    });

    if (!loan) {
      throw new NotFoundException('Loan not found.');
    }

    const access = await this.resolveLegacyCorrectionAccess(
      loan.tenantId,
      loan.branchId,
    );

    if (!access.enabled) {
      throw new ForbiddenException(
        'Legacy data correction is not enabled for this branch.',
      );
    }

    const application = await this.ensureCorrectionApplication(user, loan);

    if (!dto.storageKey.includes(application.id)) {
      throw new BadRequestException(
        'storageKey does not match this loan correction record.',
      );
    }

    const previous = await this.prisma.loanApplicationMedia.findUnique({
      where: {
        loanApplicationId_type: {
          loanApplicationId: application.id,
          type: dto.mediaType,
        },
      },
    });

    const saved = await this.prisma.loanApplicationMedia.upsert({
      where: {
        loanApplicationId_type: {
          loanApplicationId: application.id,
          type: dto.mediaType,
        },
      },
      update: {
        storageKey: dto.storageKey,
        mimeType: dto.mimeType,
        byteSize: dto.byteSize,
        checksum: dto.checksum,
        fileName: dto.fileName,
      },
      create: {
        loanApplicationId: application.id,
        type: dto.mediaType,
        storageKey: dto.storageKey,
        mimeType: dto.mimeType,
        byteSize: dto.byteSize,
        checksum: dto.checksum,
        fileName: dto.fileName,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: loan.tenantId,
        actorUserId: user.userId,
        action: 'legacy.loan.media_updated',
        entityType: 'LoanApplicationMedia',
        entityId: saved.id,
        oldValue: previous
          ? {
              mediaType: previous.type,
              storageKey: previous.storageKey,
              fileName: previous.fileName,
              mimeType: previous.mimeType,
              byteSize: previous.byteSize,
            }
          : Prisma.JsonNull,
        newValue: {
          loanId: loan.id,
          applicationId: application.id,
          mediaType: saved.type,
          storageKey: saved.storageKey,
          fileName: saved.fileName,
          mimeType: saved.mimeType,
          byteSize: saved.byteSize,
          access,
        },
      },
    });

    const updated = await this.repository.findLoanById({
      ...this.scope(user),
      loanId,
    });

    if (!updated) {
      throw new NotFoundException('Corrected loan could not be loaded.');
    }

    return {
      detail: await this.buildDetail(updated),
    };
  }

  async getRepaymentDetail(
    user: AuthenticatedUser,
    repaymentId: string,
  ): Promise<{ repayment: RepaymentDetailContract }> {
    this.assertBranchAccess(user);

    const row = await this.repository.findRepaymentById({
      ...this.scope(user),
      repaymentId,
    });

    if (!row) {
      throw new NotFoundException('Payment not found.');
    }

    const loan = row.loan;

    const detail = await this.buildDetail(loan);

    const agentPhotoStorageKey = row.recordedBy.profilePhotoStorageKey ?? null;

    const smsByRepayment = await this.summarizeRepaymentSms(user.tenantId!, [
      row.id,
    ]);
    const historyItem = detail.paymentHistory.find(
      (item) => item.id === row.id,
    );

    return {
      repayment: {
        id: row.id,

        loanId: row.loanId,

        customerId: loan.customerId,

        clientName: loan.customer.fullName,

        phone: loan.customer.phone,

        amount: this.decimalToNumber(row.amount) ?? 0,

        amountPaid: detail.paidAmount,

        loanAmount: detail.loanAmount,

        recordedAt: row.paidAt.toISOString(),

        synced: true,

        dueToday: detail.nextDueIsToday,

        note: row.note,

        method: row.method,

        recordedByName: row.recordedBy.displayName,

        recordedByPublicId: row.recordedBy.publicId ?? null,

        agentPhotoUrl: await this.presignPhotoUrl(agentPhotoStorageKey),

        agentPhotoStorageKey,

        sms: smsByRepayment.get(row.id) ?? this.emptyRepaymentSmsStatus(),

        companyName: row.tenant.name,

        branchName: row.branch?.name ?? null,

        branchId: row.branchId,

        currency: loan.currency,

        loanOutstanding: detail.outstanding,

        loanStatus: detail.status,

        isFined: detail.isFined,

        finesTotal: detail.finesTotal,

        correctionLocked: historyItem?.correctionLocked ?? false,

        canRequestCorrection: historyItem?.canRequestCorrection ?? false,

        pendingCorrectionRequestId:
          historyItem?.pendingCorrectionRequestId ?? null,

        approvedCorrectionRequestId:
          historyItem?.approvedCorrectionRequestId ?? null,

        officerCanEdit: historyItem?.officerCanEdit ?? false,

        correctionAppliedAt: historyItem?.correctionAppliedAt ?? null,
      },
    };
  }

  async listRepaymentCorrectionRequests(
    user: AuthenticatedUser,
    status?: string,
  ): Promise<{ requests: RepaymentCorrectionRequestContract[] }> {
    this.assertBranchAccess(user);

    const scope = this.scope(user);
    const statusFilter = this.parseRepaymentCorrectionStatus(status);
    const canReview = this.canReviewRepaymentCorrections(user);

    const rows = await this.prisma.repaymentCorrectionRequest.findMany({
      where: {
        tenantId: scope.tenantId,
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(canReview ? {} : { requestedByUserId: user.userId }),
      },
      include: repaymentCorrectionRequestInclude,
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    return {
      requests: rows.map((row) =>
        this.toRepaymentCorrectionRequestContract(row),
      ),
    };
  }

  async createRepaymentCorrectionRequest(
    user: AuthenticatedUser,
    repaymentId: string,
    dto: CreateRepaymentCorrectionRequestDto,
  ): Promise<{ request: RepaymentCorrectionRequestContract }> {
    this.assertBranchAccess(user);

    const row = await this.repository.findRepaymentById({
      ...this.scope(user),
      repaymentId,
    });

    if (!row) {
      throw new NotFoundException('Payment not found.');
    }

    if (
      row.recordedByUserId !== user.userId &&
      !this.canReviewRepaymentCorrections(user)
    ) {
      throw new ForbiddenException(
        'Only the person who recorded this payment or a manager can request a correction.',
      );
    }

    await this.assertRepaymentOpenForCorrection(row);

    const reason = dto.reason.trim();
    const requestedPaidAt = this.parseOptionalIsoDate(
      dto.requestedPaidAt,
      'requestedPaidAt',
    );

    const existing = await this.prisma.repaymentCorrectionRequest.findFirst({
      where: {
        tenantId: row.tenantId,
        repaymentId: row.id,
        requestedByUserId: user.userId,
        status: RepaymentCorrectionRequestStatus.PENDING,
      },
      include: repaymentCorrectionRequestInclude,
    });

    if (existing) {
      return {
        request: this.toRepaymentCorrectionRequestContract(existing),
      };
    }

    const request = await this.prisma.repaymentCorrectionRequest.create({
      data: {
        tenantId: row.tenantId,
        branchId: row.branchId,
        repaymentId: row.id,
        loanId: row.loanId,
        requestedByUserId: user.userId,
        reason,
        ...(dto.requestedAmount !== undefined
          ? {
              requestedAmount: new Prisma.Decimal(
                this.roundMoney(dto.requestedAmount).toFixed(2),
              ),
            }
          : {}),
        ...(dto.requestedMethod
          ? { requestedMethod: dto.requestedMethod }
          : {}),
        ...(requestedPaidAt ? { requestedPaidAt } : {}),
        ...(dto.requestedNote !== undefined
          ? { requestedNote: this.cleanOptionalText(dto.requestedNote) }
          : {}),
      },
      include: repaymentCorrectionRequestInclude,
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: row.tenantId,
        actorUserId: user.userId,
        action: 'repayment.correction.requested',
        entityType: 'RepaymentCorrectionRequest',
        entityId: request.id,
        oldValue: Prisma.JsonNull,
        newValue: {
          repaymentId: row.id,
          loanId: row.loanId,
          branchId: row.branchId,
          amount: this.decimalToNumber(row.amount) ?? 0,
          reason,
          requestedAmount: dto.requestedAmount ?? null,
          requestedMethod: dto.requestedMethod ?? null,
          requestedPaidAt: requestedPaidAt?.toISOString() ?? null,
          requestedNote: dto.requestedNote ?? null,
        },
      },
    });

    void this.notifyRepaymentCorrectionManagers(request);

    return {
      request: this.toRepaymentCorrectionRequestContract(request),
    };
  }

  async reviewRepaymentCorrectionRequest(
    user: AuthenticatedUser,
    requestId: string,
    dto: ReviewRepaymentCorrectionRequestDto,
  ): Promise<{ request: RepaymentCorrectionRequestContract }> {
    this.assertBranchAccess(user);

    if (!this.canReviewRepaymentCorrections(user)) {
      throw new ForbiddenException(
        'Missing permission to review repayment correction requests.',
      );
    }

    if (
      dto.status !== RepaymentCorrectionRequestStatus.APPROVED &&
      dto.status !== RepaymentCorrectionRequestStatus.REJECTED
    ) {
      throw new BadRequestException(
        'Approve or reject the correction request.',
      );
    }

    const request = await this.findRepaymentCorrectionRequestForUser(
      user,
      requestId,
    );

    if (!request) {
      throw new NotFoundException('Correction request not found.');
    }

    if (request.status !== RepaymentCorrectionRequestStatus.PENDING) {
      throw new BadRequestException(
        'This correction request has already been reviewed.',
      );
    }

    await this.assertRepaymentOpenForCorrection(request.repayment);

    const updated = await this.prisma.repaymentCorrectionRequest.update({
      where: {
        id: request.id,
      },
      data: {
        status: dto.status,
        reviewedByUserId: user.userId,
        reviewedAt: new Date(),
        officerCanEdit:
          dto.status === RepaymentCorrectionRequestStatus.APPROVED &&
          dto.officerCanEdit === true,
        reviewerFeedback: this.cleanOptionalText(dto.feedback),
      },
      include: repaymentCorrectionRequestInclude,
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: request.tenantId,
        actorUserId: user.userId,
        action: 'repayment.correction.reviewed',
        entityType: 'RepaymentCorrectionRequest',
        entityId: request.id,
        oldValue: {
          status: request.status,
          officerCanEdit: request.officerCanEdit,
        },
        newValue: {
          status: updated.status,
          officerCanEdit: updated.officerCanEdit,
          reviewerFeedback: updated.reviewerFeedback,
        },
      },
    });

    void this.notifyRepaymentCorrectionRequester(updated);

    return {
      request: this.toRepaymentCorrectionRequestContract(updated),
    };
  }

  async applyRepaymentCorrection(
    user: AuthenticatedUser,
    repaymentId: string,
    dto: ApplyRepaymentCorrectionDto,
  ): Promise<{
    repayment: RepaymentDetailContract;
    detail: ClientLoanDetailContract;
    request: RepaymentCorrectionRequestContract | null;
  }> {
    this.assertBranchAccess(user);

    const canReview = this.canReviewRepaymentCorrections(user);
    const canRecord = user.permissions.includes(COLLECTION_PERMISSIONS.create);

    if (!canReview && !canRecord) {
      throw new ForbiddenException(
        'Missing permission to correct repayment records.',
      );
    }

    const row = await this.repository.findRepaymentById({
      ...this.scope(user),
      repaymentId,
    });

    if (!row) {
      throw new NotFoundException('Payment not found.');
    }

    await this.assertRepaymentOpenForCorrection(row);

    let request: RepaymentCorrectionRequestRecord | null = null;

    if (!canReview) {
      if (row.recordedByUserId !== user.userId) {
        throw new ForbiddenException(
          'Only the person who recorded this payment can apply an approved correction.',
        );
      }

      if (!dto.correctionRequestId) {
        throw new ForbiddenException(
          'A manager-approved correction request is required.',
        );
      }

      request = await this.findRepaymentCorrectionRequestForUser(
        user,
        dto.correctionRequestId,
      );

      if (
        !request ||
        request.repaymentId !== row.id ||
        request.requestedByUserId !== user.userId ||
        request.status !== RepaymentCorrectionRequestStatus.APPROVED ||
        !request.officerCanEdit ||
        request.correctionAppliedAt
      ) {
        throw new ForbiddenException(
          'This payment is not open for officer correction.',
        );
      }
    } else if (dto.correctionRequestId) {
      request = await this.findRepaymentCorrectionRequestForUser(
        user,
        dto.correctionRequestId,
      );

      if (!request || request.repaymentId !== row.id) {
        throw new NotFoundException('Correction request not found.');
      }

      if (
        request.status === RepaymentCorrectionRequestStatus.REJECTED ||
        request.status === RepaymentCorrectionRequestStatus.CANCELLED
      ) {
        throw new BadRequestException(
          'This correction request is not open for changes.',
        );
      }
    }

    const previousAmount = this.decimalToNumber(row.amount) ?? 0;
    const nextAmount =
      dto.amount !== undefined
        ? this.roundMoney(dto.amount)
        : this.roundMoney(previousAmount);
    const nextMethod = dto.method ?? row.method;
    const nextPaidAt = dto.paidAt
      ? this.parseOptionalIsoDate(dto.paidAt, 'paidAt')
      : row.paidAt;
    const nextNote =
      dto.note !== undefined ? this.cleanOptionalText(dto.note) : row.note;
    const reason = dto.reason.trim();

    if (!nextPaidAt) {
      throw new BadRequestException('paidAt must be a valid date.');
    }

    await this.assertRepaymentOpenForCorrection({
      tenantId: row.tenantId,
      branchId: row.branchId,
      paidAt: nextPaidAt,
    });

    if (nextAmount <= 0) {
      throw new BadRequestException('Amount must be greater than zero.');
    }

    const changed =
      Math.abs(previousAmount - nextAmount) > 0.001 ||
      nextMethod !== row.method ||
      nextPaidAt.getTime() !== row.paidAt.getTime() ||
      nextNote !== row.note;

    if (!changed) {
      throw new BadRequestException('No correction changes were provided.');
    }

    const appliedRequest = await this.prisma.$transaction(async (tx) => {
      await tx.repayment.update({
        where: {
          id: row.id,
        },
        data: {
          amount: new Prisma.Decimal(nextAmount.toFixed(2)),
          method: nextMethod,
          paidAt: nextPaidAt,
          note: nextNote,
        },
      });

      const loan = await tx.loan.findUnique({
        where: {
          id: row.loanId,
        },
        include: {
          application: true,
          wallet: true,
          repayments: {
            orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });

      if (!loan) {
        throw new NotFoundException('Loan not found.');
      }

      const rebuild = this.rebuildLoanRepaymentState(loan);

      if (rebuild.totalPaid > rebuild.totalObligation + 0.001) {
        throw new BadRequestException(
          'Corrected repayments exceed the loan amount due.',
        );
      }

      await Promise.all(
        rebuild.allocations.map((allocation) =>
          tx.repayment.update({
            where: {
              id: allocation.repaymentId,
            },
            data: {
              principalAllocated: new Prisma.Decimal(
                allocation.principalAllocated.toFixed(2),
              ),
              interestAllocated: new Prisma.Decimal(
                allocation.interestAllocated.toFixed(2),
              ),
              feesAllocated: new Prisma.Decimal(
                allocation.feesAllocated.toFixed(2),
              ),
            },
          }),
        ),
      );

      await tx.loan.update({
        where: {
          id: row.loanId,
        },
        data: {
          balance: new Prisma.Decimal(rebuild.nextBalance.toFixed(2)),
          status: rebuild.nextStatus,
        },
      });

      let updatedRequest: RepaymentCorrectionRequestRecord | null = null;

      if (request) {
        updatedRequest = await tx.repaymentCorrectionRequest.update({
          where: {
            id: request.id,
          },
          data: {
            status: RepaymentCorrectionRequestStatus.APPROVED,
            officerCanEdit: !canReview && request.officerCanEdit,
            reviewedByUserId: request.reviewedByUserId ?? user.userId,
            reviewedAt: request.reviewedAt ?? new Date(),
            correctionAppliedByUserId: user.userId,
            correctionAppliedAt: new Date(),
          },
          include: repaymentCorrectionRequestInclude,
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: row.tenantId,
          actorUserId: user.userId,
          action: 'repayment.corrected',
          entityType: 'Repayment',
          entityId: row.id,
          oldValue: {
            amount: previousAmount,
            method: row.method,
            paidAt: row.paidAt.toISOString(),
            note: row.note,
            loanBalance: this.decimalToNumber(row.loan.balance) ?? null,
            loanStatus: row.loan.status,
          },
          newValue: {
            amount: nextAmount,
            method: nextMethod,
            paidAt: nextPaidAt.toISOString(),
            note: nextNote,
            reason,
            correctionRequestId: request?.id ?? null,
            loanBalance: rebuild.nextBalance,
            loanStatus: rebuild.nextStatus,
          },
        },
      });

      return updatedRequest;
    });

    const repayment = await this.getRepaymentDetail(user, repaymentId);
    const detail = await this.getLoanDetail(user, row.loanId);

    if (appliedRequest) {
      void this.notifyRepaymentCorrectionRequester(appliedRequest);
    }

    return {
      repayment: repayment.repayment,
      detail: detail.detail,
      request: appliedRequest
        ? this.toRepaymentCorrectionRequestContract(appliedRequest)
        : null,
    };
  }

  async getDailySummary(
    user: AuthenticatedUser,
    date?: string,
  ): Promise<{ summary: DailyCollectionsSummaryContract }> {
    this.assertBranchAccess(user);

    const scope = this.scope(user);

    const { dayStart, dayEnd, dateLabel } = this.parseDayBounds(date);

    const [agents, applications, repayments] = await Promise.all([
      this.repository.listFieldAgents(scope),

      this.repository.listApplicationsSubmittedForDay({
        ...scope,
        dayStart,
        dayEnd,
      }),

      this.repository.listRepaymentsForDay({
        ...scope,
        dayStart,
        dayEnd,
      }),
    ]);

    const agentMap = new Map<
      string,
      {
        agentId: string;
        agentName: string;
        agentPublicId: string | null;
        photoKey: string | null;
        roleName: string | null;
        branchId: string | null;
        branchName: string | null;
        applicationsCount: number;
        principalLent: number;
        paymentsCount: number;
        amountCollected: number;
      }
    >();

    for (const agent of agents) {
      agentMap.set(agent.id, {
        agentId: agent.id,

        agentName: agent.displayName,

        agentPublicId: agent.publicId ?? null,

        photoKey: agent.profilePhotoStorageKey ?? null,

        roleName: agent.roles[0]?.role.name ?? null,

        branchId: agent.branchId,

        branchName: agent.branch?.name ?? null,

        applicationsCount: 0,

        principalLent: 0,

        paymentsCount: 0,

        amountCollected: 0,
      });
    }

    for (const app of applications) {
      const existing = agentMap.get(app.officerUserId);

      const principal = this.decimalToNumber(app.principalAmount) ?? 0;

      if (existing) {
        existing.applicationsCount += 1;

        existing.principalLent = this.roundMoney(
          existing.principalLent + principal,
        );
      } else {
        agentMap.set(app.officerUserId, {
          agentId: app.officerUserId,

          agentName: app.officer.displayName,

          agentPublicId: app.officer.publicId ?? null,

          photoKey: app.officer.profilePhotoStorageKey ?? null,

          roleName: null,

          branchId: app.branchId,

          branchName: app.branch?.name ?? null,

          applicationsCount: 1,

          principalLent: principal,

          paymentsCount: 0,

          amountCollected: 0,
        });
      }
    }

    for (const payment of repayments) {
      const amount = this.decimalToNumber(payment.amount) ?? 0;

      const existing = agentMap.get(payment.recordedByUserId);

      if (existing) {
        existing.paymentsCount += 1;

        existing.amountCollected = this.roundMoney(
          existing.amountCollected + amount,
        );
      } else {
        agentMap.set(payment.recordedByUserId, {
          agentId: payment.recordedByUserId,

          agentName: payment.recordedBy.displayName,

          agentPublicId: payment.recordedBy.publicId ?? null,

          photoKey: payment.recordedBy.profilePhotoStorageKey ?? null,

          roleName: null,

          branchId: payment.branchId,

          branchName: null,

          applicationsCount: 0,

          principalLent: 0,

          paymentsCount: 1,

          amountCollected: amount,
        });
      }
    }

    const summaries = await Promise.all(
      [...agentMap.values()].map(async (row) => {
        const agentPhotoUrl = await this.presignPhotoUrl(row.photoKey);

        return {
          agentId: row.agentId,

          agentName: row.agentName,

          agentPublicId: row.agentPublicId,

          agentPhotoUrl,

          roleName: row.roleName,

          branchId: row.branchId,

          branchName: row.branchName,

          applicationsCount: row.applicationsCount,

          principalLent: row.principalLent,

          paymentsCount: row.paymentsCount,

          amountCollected: row.amountCollected,

          netCash: this.roundMoney(row.amountCollected - row.principalLent),
        } satisfies DailyAgentSummaryContract;
      }),
    );

    summaries.sort((a, b) => {
      const activity =
        b.paymentsCount +
        b.applicationsCount -
        (a.paymentsCount + a.applicationsCount);

      if (activity !== 0) {
        return activity;
      }

      return a.agentName.localeCompare(b.agentName);
    });

    const totals = summaries.reduce(
      (acc, row) => ({
        applicationsCount: acc.applicationsCount + row.applicationsCount,

        principalLent: this.roundMoney(acc.principalLent + row.principalLent),

        paymentsCount: acc.paymentsCount + row.paymentsCount,

        amountCollected: this.roundMoney(
          acc.amountCollected + row.amountCollected,
        ),

        netCash: 0,
      }),
      {
        applicationsCount: 0,

        principalLent: 0,

        paymentsCount: 0,

        amountCollected: 0,

        netCash: 0,
      },
    );

    totals.netCash = this.roundMoney(
      totals.amountCollected - totals.principalLent,
    );

    return {
      summary: {
        date: dateLabel,

        timezoneNote: 'Day bounds use the API server local calendar.',

        agents: summaries,

        totals,
      },
    };
  }

  async getDailyAgentDetail(
    user: AuthenticatedUser,
    agentId: string,
    date?: string,
  ): Promise<{ detail: DailyAgentDetailContract }> {
    this.assertBranchAccess(user);

    const scope = this.scope(user);

    const { dayStart, dayEnd, dateLabel } = this.parseDayBounds(date);

    const agent = await this.repository.findFieldAgentById({
      ...scope,
      agentId,
    });

    if (!agent) {
      throw new NotFoundException('Agent not found.');
    }

    const [applications, repayments] = await Promise.all([
      this.repository.listApplicationsSubmittedForDay({
        ...scope,
        dayStart,
        dayEnd,
        officerUserId: agentId,
      }),

      this.repository.listRepaymentsForDay({
        ...scope,
        dayStart,
        dayEnd,
        recordedByUserId: agentId,
      }),
    ]);

    const smsByRepayment = await this.summarizeRepaymentSms(
      user.tenantId!,
      repayments.map((row) => row.id),
    );

    const principalLent = this.roundMoney(
      applications.reduce(
        (sum, app) => sum + (this.decimalToNumber(app.principalAmount) ?? 0),
        0,
      ),
    );

    const amountCollected = this.roundMoney(
      repayments.reduce(
        (sum, row) => sum + (this.decimalToNumber(row.amount) ?? 0),
        0,
      ),
    );

    const summary: DailyAgentSummaryContract = {
      agentId: agent.id,

      agentName: agent.displayName,

      agentPublicId: agent.publicId ?? null,

      agentPhotoUrl: await this.presignPhotoUrl(
        agent.profilePhotoStorageKey ?? null,
      ),

      roleName: agent.roles[0]?.role.name ?? null,

      branchId: agent.branchId,

      branchName: agent.branch?.name ?? null,

      applicationsCount: applications.length,

      principalLent,

      paymentsCount: repayments.length,

      amountCollected,

      netCash: this.roundMoney(amountCollected - principalLent),
    };

    return {
      detail: {
        date: dateLabel,

        agent: summary,

        applications: applications.map((app) => ({
          id: app.id,

          customerId: app.customerId ?? app.customer?.id ?? null,

          clientName:
            app.customer?.fullName ||
            [app.surname, app.givenNames].filter(Boolean).join(' ') ||
            'Client',

          phone: app.phone,

          principalAmount: this.decimalToNumber(app.principalAmount) ?? 0,

          status: app.status,

          submittedAt: (app.submittedAt ?? app.createdAt).toISOString(),

          loanId: app.loanId,
        })),

        payments: repayments.map((row) => ({
          id: row.id,

          loanId: row.loanId,

          customerId: row.loan.customer.id,

          clientName: row.loan.customer.fullName,

          phone: row.loan.customer.phone,

          amount: this.decimalToNumber(row.amount) ?? 0,

          method: row.method,

          note: row.note,

          paidAt: row.paidAt.toISOString(),

          sms: smsByRepayment.get(row.id) ?? this.emptyRepaymentSmsStatus(),
        })),
      },
    };
  }

  async recordRepayment(
    user: AuthenticatedUser,
    dto: RecordRepaymentDto,
  ): Promise<RecordRepaymentResponseContract> {
    this.assertBranchAccess(user);

    if (!user.branchId) {
      throw new ForbiddenException(
        'A branch assignment is required to record repayments.',
      );
    }

    await this.billingService.assertBranchSubscriptionActive(
      user.tenantId,
      user.branchId,
    );

    const loan = await this.repository.findLoanById({
      ...this.scope(user),
      loanId: dto.loanId,
    });

    if (!loan) {
      throw new NotFoundException('Loan not found.');
    }

    if (!activeLoanStatuses.includes(loan.status)) {
      throw new BadRequestException('This loan cannot accept repayments.');
    }

    const amount = this.roundMoney(dto.amount);

    const balance = this.decimalToNumber(loan.balance) ?? 0;

    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero.');
    }

    if (amount > balance + 0.001) {
      throw new BadRequestException(
        `Amount exceeds outstanding balance of ${balance}.`,
      );
    }

    const pricing = this.loanPricing(loan);

    const totals = loan.repayments.reduce(
      (acc, item) => ({
        fees: acc.fees + (this.decimalToNumber(item.feesAllocated) ?? 0),

        interest:
          acc.interest + (this.decimalToNumber(item.interestAllocated) ?? 0),

        principal:
          acc.principal + (this.decimalToNumber(item.principalAllocated) ?? 0),
      }),
      {
        fees: 0,
        interest: 0,
        principal: 0,
      },
    );

    /*
     * Processing fee is NOT a repayment bucket.
     *
     * feesAllocated represents loan fines / penalties only.
     */
    const finesTotal =
      this.decimalToNumber(loan.finesTotal) ??
      this.decimalToNumber(loan.wallet?.finesTotal) ??
      0;

    const allocation = allocateRepayment({
      amount,

      remainingFees: Math.max(0, finesTotal - totals.fees),

      remainingInterest: Math.max(0, pricing.interestAmount - totals.interest),

      remainingPrincipal: Math.max(
        0,
        pricing.principalAmount - totals.principal,
      ),
    });

    const nextBalance = this.roundMoney(Math.max(0, balance - amount));

    const nextStatus =
      nextBalance <= 0
        ? LoanStatus.CLOSED
        : loan.status === LoanStatus.SUBMITTED ||
            loan.status === LoanStatus.APPROVED
          ? LoanStatus.CURRENT
          : loan.status;

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    if (Number.isNaN(paidAt.getTime())) {
      throw new BadRequestException('Invalid paidAt timestamp.');
    }

    const { repayment, loan: updatedLoan } =
      await this.repository.recordRepayment({
        tenantId: user.tenantId,

        branchId: loan.branchId,

        loanId: loan.id,

        recordedByUserId: user.userId,

        amount: new Prisma.Decimal(amount.toFixed(2)),

        principalAllocated: new Prisma.Decimal(
          allocation.principalAllocated.toFixed(2),
        ),

        interestAllocated: new Prisma.Decimal(
          allocation.interestAllocated.toFixed(2),
        ),

        feesAllocated: new Prisma.Decimal(allocation.feesAllocated.toFixed(2)),

        method: dto.method ?? RepaymentMethod.CASH,

        paidAt,

        note: dto.note?.trim() || null,

        receiptNumber: `RCP-${Date.now().toString(36).toUpperCase()}`,

        nextBalance: new Prisma.Decimal(nextBalance.toFixed(2)),

        nextStatus,
      });

    const detail = await this.buildDetail(updatedLoan);

    const agentPhotoStorageKey =
      repayment.recordedBy.profilePhotoStorageKey ?? null;

    const item: RepaymentListItemContract = {
      id: repayment.id,

      loanId: repayment.loanId,

      customerId: updatedLoan.customerId,

      clientName: updatedLoan.customer.fullName,

      phone: updatedLoan.customer.phone,

      amount,

      amountPaid: detail.paidAmount,

      loanAmount: detail.loanAmount,

      recordedAt: repayment.paidAt.toISOString(),

      synced: true,

      dueToday: detail.nextDueIsToday,

      note: repayment.note,

      method: repayment.method,

      recordedByName: repayment.recordedBy.displayName,

      recordedByPublicId: repayment.recordedBy.publicId ?? null,

      agentPhotoUrl: await this.presignPhotoUrl(agentPhotoStorageKey),

      agentPhotoStorageKey,

      sms: this.emptyRepaymentSmsStatus(),
    };

    this.realtime.broadcastPayment(REALTIME_EVENTS.paymentMade, {
      repaymentId: item.id,

      loanId: item.loanId,

      customerId: item.customerId,

      tenantId: user.tenantId,

      branchId: loan.branchId,

      clientName: item.clientName,

      phone: item.phone,

      amount: item.amount,

      amountPaid: item.amountPaid,

      loanAmount: item.loanAmount,

      outstanding: detail.outstanding,

      recordedAt: item.recordedAt,

      method: item.method,

      note: item.note,

      synced: true,

      recordedByUserId: user.userId,

      recordedByName: item.recordedByName,

      agentPhotoUrl: item.agentPhotoUrl,
    });

    void this.sendPaymentConfirmationSms({
      tenantId: user.tenantId!,

      branchId: loan.branchId,

      repaymentId: item.id,

      phone: item.phone,

      fullName: item.clientName,

      amount,

      balance: detail.outstanding,
    });

    return {
      repayment: item,

      detail,
    };
  }

  async sendRepaymentSms(
    user: AuthenticatedUser,
    repaymentId: string,
    dto: SendRepaymentSmsDto,
    requestIdempotencyKey?: string,
  ): Promise<{ result: RepaymentSmsSendResultContract }> {
    this.assertBranchAccess(user);

    return {
      result: await this.sendRepaymentSmsForId({
        user,
        repaymentId,
        resend: Boolean(dto.resend),
        requestIdempotencyKey,
      }),
    };
  }

  async sendBulkRepaymentSms(
    user: AuthenticatedUser,
    dto: BulkRepaymentSmsDto,
    requestIdempotencyKey?: string,
  ): Promise<RepaymentBulkSmsResultContract> {
    this.assertBranchAccess(user);

    const uniqueIds = [...new Set(dto.repaymentIds.map((id) => id.trim()))];

    const bulkKey = this.safeIdempotencyPart(
      requestIdempotencyKey || `bulk_${randomUUID()}`,
    );

    const results: RepaymentSmsSendResultContract[] = [];

    for (const [index, repaymentId] of uniqueIds.entries()) {
      try {
        results.push(
          await this.sendRepaymentSmsForId({
            user,

            repaymentId,

            resend: Boolean(dto.resendFailed),

            requestIdempotencyKey: `${bulkKey}_${index}`,
          }),
        );
      } catch (error) {
        results.push({
          repaymentId,

          clientName: 'Unknown repayment',

          phone: null,

          sms: {
            status: 'failed',

            messageId: null,

            lastSentAt: null,

            lastFailureReason:
              error instanceof Error ? error.message : 'send_failed',

            canRetry: false,
          },

          sent: false,

          alreadySent: false,

          skipped: false,

          reason: error instanceof Error ? error.message : 'send_failed',
        });
      }
    }

    const failures = results.filter(
      (result) => !result.sent && !result.alreadySent && !result.skipped,
    );

    return {
      totalCount: results.length,

      sentCount: results.filter((result) => result.sent).length,

      alreadySentCount: results.filter((result) => result.alreadySent).length,

      skippedCount: results.filter((result) => result.skipped).length,

      failedCount: failures.length,

      results,

      failures,
    };
  }

  private async sendPaymentConfirmationSms(input: {
    tenantId: string;
    branchId: string;
    repaymentId: string;
    phone: string;
    fullName: string;
    amount: number;
    balance: number;
  }) {
    try {
      const result = await this.dispatchPaymentConfirmationSms({
        tenantId: input.tenantId,

        branchId: input.branchId,

        repaymentId: input.repaymentId,

        phone: input.phone,

        fullName: input.fullName,

        amount: input.amount,

        balance: input.balance,

        idempotencyKey: `payment_confirmation_${input.repaymentId}`,
      });

      if (!result.sent) {
        this.logger.log(
          `Payment confirmation SMS skipped for ${input.repaymentId}: ${
            result.reason ?? 'skipped'
          }`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Payment confirmation SMS failed for ${input.repaymentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async sendRepaymentSmsForId(input: {
    user: AuthenticatedUser;
    repaymentId: string;
    resend: boolean;
    requestIdempotencyKey?: string;
  }): Promise<RepaymentSmsSendResultContract> {
    const row = await this.repository.findRepaymentById({
      ...this.scope(input.user),

      repaymentId: input.repaymentId,
    });

    if (!row) {
      throw new NotFoundException('Payment not found.');
    }

    const existingSms =
      (
        await this.summarizeRepaymentSms(input.user.tenantId!, [
          input.repaymentId,
        ])
      ).get(input.repaymentId) ?? this.emptyRepaymentSmsStatus();

    if (existingSms.status === 'sent') {
      return {
        repaymentId: row.id,

        clientName: row.loan.customer.fullName,

        phone: row.loan.customer.phone,

        sms: existingSms,

        sent: false,

        alreadySent: true,

        skipped: true,

        reason: 'already_sent',
      };
    }

    if (existingSms.status === 'sending') {
      return {
        repaymentId: row.id,

        clientName: row.loan.customer.fullName,

        phone: row.loan.customer.phone,

        sms: existingSms,

        sent: false,

        alreadySent: false,

        skipped: true,

        reason: 'already_sending',
      };
    }

    const detail = await this.buildDetail(row.loan);

    const retrying =
      input.resend || (existingSms.status === 'failed' && existingSms.canRetry);

    const idempotencyKey = retrying
      ? [
          PAYMENT_CONFIRMATION_PURPOSE,
          row.id,
          'retry',
          this.safeIdempotencyPart(input.requestIdempotencyKey || randomUUID()),
        ].join('_')
      : `${PAYMENT_CONFIRMATION_PURPOSE}_${row.id}`;

    const result = await this.dispatchPaymentConfirmationSms({
      tenantId: row.tenantId,

      branchId: row.branchId,

      repaymentId: row.id,

      phone: row.loan.customer.phone,

      fullName: row.loan.customer.fullName,

      amount: this.decimalToNumber(row.amount) ?? 0,

      balance: detail.outstanding,

      idempotencyKey,

      parentMessageId:
        retrying && existingSms.messageId ? existingSms.messageId : undefined,

      requestedByUserId: input.user.userId,
    });

    const nextSms =
      (await this.summarizeRepaymentSms(row.tenantId, [row.id])).get(row.id) ??
      this.failedRepaymentSmsStatus(result.reason ?? 'send_failed');

    return {
      repaymentId: row.id,

      clientName: row.loan.customer.fullName,

      phone: row.loan.customer.phone,

      sms: nextSms,

      sent: result.sent,

      alreadySent: false,

      skipped: result.reason === 'sms_setting_disabled',

      reason: result.reason ?? null,
    };
  }

  private async dispatchPaymentConfirmationSms(input: {
    tenantId: string;
    branchId: string;
    repaymentId: string;
    phone: string;
    fullName: string;
    amount: number;
    balance: number;
    idempotencyKey: string;
    parentMessageId?: string;
    requestedByUserId?: string;
  }) {
    const allowed = await this.smsNotificationSettings.isKindEnabled(
      input.tenantId,
      'payment_confirmation',
    );

    if (!allowed) {
      return {
        sent: false,

        reason: 'sms_setting_disabled',
      };
    }

    const supportPhone = await this.smsNotificationSettings.resolveSupportPhone(
      input.branchId,
    );

    const body = buildPaymentConfirmationSms({
      fullName: input.fullName,

      amount: input.amount,

      balance: input.balance,

      supportPhone,
    });

    return this.smsCreditsService.sendBranchSms({
      tenantId: input.tenantId,

      branchId: input.branchId,

      destination: input.phone?.trim() ?? '',

      body,

      purpose: PAYMENT_CONFIRMATION_PURPOSE,

      triggerSource: PAYMENT_CONFIRMATION_TRIGGER,

      triggerReferenceId: input.repaymentId,

      requestedByUserId: input.requestedByUserId,

      idempotencyKey: input.idempotencyKey,

      parentMessageId: input.parentMessageId,
    });
  }

  private async summarizeRepaymentSms(
    tenantId: string,
    repaymentIds: string[],
  ): Promise<Map<string, RepaymentSmsStatusContract>> {
    const uniqueIds = [...new Set(repaymentIds.filter(Boolean))];

    const statusByRepayment = new Map<string, RepaymentSmsStatusContract>();

    if (uniqueIds.length === 0) {
      return statusByRepayment;
    }

    const messages = await this.prisma.smsMessage.findMany({
      where: {
        tenantId,

        messageType: PAYMENT_CONFIRMATION_PURPOSE,

        triggerReferenceId: {
          in: uniqueIds,
        },
      },

      orderBy: {
        createdAt: 'desc',
      },

      select: {
        id: true,

        triggerReferenceId: true,

        status: true,

        failureReason: true,

        sentAt: true,

        createdAt: true,
      },
    });

    const grouped = new Map<string, RepaymentSmsMessageRecord[]>();

    for (const message of messages) {
      if (!message.triggerReferenceId) {
        continue;
      }

      const list = grouped.get(message.triggerReferenceId) ?? [];

      list.push(message);

      grouped.set(message.triggerReferenceId, list);
    }

    for (const repaymentId of uniqueIds) {
      statusByRepayment.set(
        repaymentId,

        this.repaymentSmsStatusFromMessages(grouped.get(repaymentId) ?? []),
      );
    }

    return statusByRepayment;
  }

  private repaymentSmsStatusFromMessages(
    messages: RepaymentSmsMessageRecord[],
  ): RepaymentSmsStatusContract {
    const sent = messages.find((message) =>
      ACCEPTED_SMS_STATUSES.has(message.status),
    );

    if (sent) {
      return {
        status: 'sent',

        messageId: sent.id,

        lastSentAt: (sent.sentAt ?? sent.createdAt).toISOString(),

        lastFailureReason: null,

        canRetry: false,
      };
    }

    const active = messages.find((message) =>
      ACTIVE_SMS_STATUSES.has(message.status),
    );

    if (active) {
      return {
        status: 'sending',

        messageId: active.id,

        lastSentAt: null,

        lastFailureReason: null,

        canRetry: false,
      };
    }

    const failed = messages[0];

    if (failed) {
      const reason = failed.failureReason ?? failed.status.toLowerCase();

      return {
        status: 'failed',

        messageId: failed.id,

        lastSentAt: null,

        lastFailureReason: reason,

        canRetry: this.canRetryPaymentConfirmationSms(failed),
      };
    }

    return this.emptyRepaymentSmsStatus();
  }

  private emptyRepaymentSmsStatus(): RepaymentSmsStatusContract {
    return {
      status: 'not_sent',

      messageId: null,

      lastSentAt: null,

      lastFailureReason: null,

      canRetry: false,
    };
  }

  private failedRepaymentSmsStatus(reason: string): RepaymentSmsStatusContract {
    return {
      status: 'failed',

      messageId: null,

      lastSentAt: null,

      lastFailureReason: reason,

      canRetry: reason !== 'sms_setting_disabled',
    };
  }

  private canRetryPaymentConfirmationSms(
    message: RepaymentSmsMessageRecord,
  ): boolean {
    if (
      message.failureReason === 'invalid_phone' ||
      message.failureReason === 'no_phone'
    ) {
      return false;
    }

    return RETRYABLE_PAYMENT_SMS_STATUSES.has(message.status);
  }

  private parseRepaymentCorrectionStatus(status?: string) {
    const normalized = status?.trim().toUpperCase();
    if (!normalized) {
      return null;
    }

    const allowed = Object.values(RepaymentCorrectionRequestStatus);
    if (!allowed.includes(normalized as RepaymentCorrectionRequestStatus)) {
      throw new BadRequestException(
        'Choose a valid correction request status.',
      );
    }

    return normalized as RepaymentCorrectionRequestStatus;
  }

  private canReviewRepaymentCorrections(user: AuthenticatedUser) {
    return user.permissions.includes(COLLECTION_PERMISSIONS.reconcile);
  }

  private async findRepaymentCorrectionRequestForUser(
    user: AuthenticatedUser,
    requestId: string,
  ) {
    const scope = this.scope(user);

    return this.prisma.repaymentCorrectionRequest.findFirst({
      where: {
        id: requestId,
        tenantId: scope.tenantId,
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
      },
      include: repaymentCorrectionRequestInclude,
    });
  }

  private async assertRepaymentOpenForCorrection(input: {
    tenantId: string;
    branchId: string;
    paidAt: Date;
  }) {
    const report = await this.prisma.branchOperationReport.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        operationDate: this.dateOnly(input.paidAt),
        status: {
          in: [
            BranchOperationReportStatus.SENT_TO_OWNER,
            BranchOperationReportStatus.OWNER_APPROVED,
          ],
        },
      },
      select: {
        reportNumber: true,
        status: true,
      },
    });

    if (report) {
      throw new ForbiddenException(
        `This payment is locked because report ${report.reportNumber} has already been submitted.`,
      );
    }
  }

  private async submittedReportDateSet(
    tenantId: string,
    branchId: string,
    dates: Date[],
  ) {
    const dateKeys = [
      ...new Set(
        dates
          .filter(
            (date) => date instanceof Date && !Number.isNaN(date.getTime()),
          )
          .map((date) => this.dateLabel(date)),
      ),
    ];

    if (dateKeys.length === 0) {
      return new Set<string>();
    }

    const rows = await this.prisma.branchOperationReport.findMany({
      where: {
        tenantId,
        branchId,
        operationDate: {
          in: dateKeys.map((dateKey) =>
            this.dateOnly(new Date(`${dateKey}T00:00:00`)),
          ),
        },
        status: {
          in: [
            BranchOperationReportStatus.SENT_TO_OWNER,
            BranchOperationReportStatus.OWNER_APPROVED,
          ],
        },
      },
      select: {
        operationDate: true,
      },
    });

    return new Set(rows.map((row) => this.dateLabel(row.operationDate)));
  }

  private parseOptionalIsoDate(
    value: string | null | undefined,
    field: string,
  ) {
    if (value == null || value.trim() === '') {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid date.`);
    }

    return parsed;
  }

  private toRepaymentCorrectionRequestContract(
    row: RepaymentCorrectionRequestRecord,
  ): RepaymentCorrectionRequestContract {
    const loan = row.loan ?? row.repayment.loan;
    const customer = loan.customer ?? row.repayment.loan.customer;

    return {
      id: row.id,
      repaymentId: row.repaymentId,
      loanId: row.loanId,
      tenantId: row.tenantId,
      branchId: row.branchId,
      borrowerName: customer.fullName,
      borrowerPhone: customer.phone ?? null,
      amount: this.decimalToNumber(row.repayment.amount) ?? 0,
      paidAt: row.repayment.paidAt.toISOString(),
      method: row.repayment.method,
      reason: row.reason,
      requestedAmount: this.decimalToNumber(row.requestedAmount),
      requestedMethod: row.requestedMethod,
      requestedPaidAt: row.requestedPaidAt?.toISOString() ?? null,
      requestedNote: row.requestedNote,
      status: row.status,
      officerCanEdit: row.officerCanEdit,
      requestedByName: row.requestedBy.displayName,
      reviewedByName: row.reviewedBy?.displayName ?? null,
      correctionAppliedByName: row.correctionAppliedBy?.displayName ?? null,
      reviewerFeedback: row.reviewerFeedback,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      correctionAppliedAt: row.correctionAppliedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private rebuildLoanRepaymentState(loan: {
    principal: Prisma.Decimal | number;
    status: LoanStatus;
    finesTotal: Prisma.Decimal | number | null;
    application: {
      principalAmount: Prisma.Decimal | number | null;
      interestRatePercent: Prisma.Decimal | number | null;
      durationDays: number | null;
      processingFee: Prisma.Decimal | number | null;
    } | null;
    wallet: {
      openingBalance: Prisma.Decimal | number;
      finesTotal: Prisma.Decimal | number | null;
    } | null;
    repayments: {
      id: string;
      amount: Prisma.Decimal | number;
    }[];
  }) {
    const computed = computeLoanPricing({
      principalAmount:
        this.decimalToNumber(loan.application?.principalAmount) ??
        this.decimalToNumber(loan.principal) ??
        0,
      interestRatePercent:
        this.decimalToNumber(loan.application?.interestRatePercent) ?? 0,
      durationDays: loan.application?.durationDays ?? 0,
      processingFee: this.decimalToNumber(loan.application?.processingFee) ?? 0,
    });

    const openingBalance = this.decimalToNumber(loan.wallet?.openingBalance);
    const baseRepayable = openingBalance ?? computed.totalRepayable;
    const principalTotal = computed.principalAmount;
    const interestTotal = this.roundMoney(
      Math.max(0, baseRepayable - principalTotal),
    );
    const finesTotal =
      this.decimalToNumber(loan.finesTotal) ??
      this.decimalToNumber(loan.wallet?.finesTotal) ??
      0;
    const totalObligation = this.roundMoney(baseRepayable + finesTotal);
    const totalPaid = this.roundMoney(
      loan.repayments.reduce(
        (sum, repayment) => sum + (this.decimalToNumber(repayment.amount) ?? 0),
        0,
      ),
    );

    let remainingFees = finesTotal;
    let remainingInterest = interestTotal;
    let remainingPrincipal = principalTotal;

    const allocations = loan.repayments.map((repayment) => {
      const allocation = allocateRepayment({
        amount: this.decimalToNumber(repayment.amount) ?? 0,
        remainingFees,
        remainingInterest,
        remainingPrincipal,
      });

      remainingFees = this.roundMoney(
        Math.max(0, remainingFees - allocation.feesAllocated),
      );
      remainingInterest = this.roundMoney(
        Math.max(0, remainingInterest - allocation.interestAllocated),
      );
      remainingPrincipal = this.roundMoney(
        Math.max(0, remainingPrincipal - allocation.principalAllocated),
      );

      return {
        repaymentId: repayment.id,
        feesAllocated: allocation.feesAllocated,
        interestAllocated: allocation.interestAllocated,
        principalAllocated: allocation.principalAllocated,
      };
    });

    const nextBalance = this.roundMoney(
      Math.max(0, totalObligation - totalPaid),
    );
    const nextStatus =
      nextBalance <= 0
        ? LoanStatus.CLOSED
        : loan.status === LoanStatus.CLOSED ||
            loan.status === LoanStatus.SUBMITTED ||
            loan.status === LoanStatus.APPROVED
          ? LoanStatus.CURRENT
          : loan.status;

    return {
      allocations,
      nextBalance,
      nextStatus,
      totalObligation,
      totalPaid,
    };
  }

  private async notifyRepaymentCorrectionManagers(
    request: RepaymentCorrectionRequestRecord,
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId: request.tenantId,
        status: UserStatus.ACTIVE,
        OR: [{ branchId: request.branchId }, { branchId: null }],
        roles: {
          some: {
            role: {
              name: {
                in: ['Account Owner', 'Owner', 'Manager', 'Branch Manager'],
              },
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    await Promise.allSettled(
      users.map((manager) =>
        this.fcmPushService.sendToUser(request.tenantId, manager.id, {
          title: 'Repayment correction requested',
          body: `${request.requestedBy.displayName} requested a correction for ${request.loan.customer.fullName}.`,
          href: '/collections/corrections',
          data: {
            type: 'repayment_correction_request',
            requestId: request.id,
            repaymentId: request.repaymentId,
            loanId: request.loanId,
          },
        }),
      ),
    );
  }

  private async notifyRepaymentCorrectionRequester(
    request: RepaymentCorrectionRequestRecord,
  ) {
    const approved =
      request.status === RepaymentCorrectionRequestStatus.APPROVED;
    const applied = Boolean(request.correctionAppliedAt);

    await this.fcmPushService.sendToUser(
      request.tenantId,
      request.requestedByUserId,
      {
        title: applied
          ? 'Repayment correction applied'
          : approved
            ? 'Repayment correction approved'
            : 'Repayment correction reviewed',
        body: applied
          ? `The correction for ${request.loan.customer.fullName} has been saved.`
          : approved && request.officerCanEdit
            ? `You can now edit the repayment for ${request.loan.customer.fullName}.`
            : approved
              ? `A manager approved the correction for ${request.loan.customer.fullName} and will update it.`
              : `The correction request for ${request.loan.customer.fullName} was not approved.`,
        href: '/records',
        data: {
          type: 'repayment_correction_review',
          requestId: request.id,
          repaymentId: request.repaymentId,
          loanId: request.loanId,
          status: request.status,
        },
      },
    );
  }

  private safeIdempotencyPart(value: string): string {
    const safe = value
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 80);

    return safe || randomUUID();
  }

  private scope(user: AuthenticatedUser) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Tenant scope is required.');
    }

    /*
     * Only workspace owners with branch.create can cross branch boundaries.
     *
     * Branch managers and agents stay branch scoped.
     */
    const canAllBranches = user.permissions.includes(BRANCH_PERMISSIONS.create);

    return {
      tenantId: user.tenantId,

      branchId: canAllBranches ? null : user.branchId,
    };
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

  private async resolveLegacyCorrectionAccess(
    tenantId: string,
    branchId: string,
  ): Promise<{
    enabled: boolean;
    source: 'ORGANIZATION' | 'BRANCH' | null;
    reason: string | null;
  }> {
    const rows = await this.prisma.controlledFeatureAccess.findMany({
      where: {
        featureKey: LEGACY_DATA_CORRECTION_FEATURE,
        OR: [
          {
            scope: ControlledFeatureScope.BRANCH,
            scopeId: branchId,
          },
          {
            scope: ControlledFeatureScope.TENANT,
            scopeId: tenantId,
          },
        ],
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const branchRow =
      rows.find((row) => row.scope === ControlledFeatureScope.BRANCH) ?? null;
    const tenantRow =
      rows.find((row) => row.scope === ControlledFeatureScope.TENANT) ?? null;
    const effective = branchRow ?? tenantRow;

    return {
      enabled: effective?.enabled ?? false,
      source:
        effective?.scope === ControlledFeatureScope.BRANCH
          ? 'BRANCH'
          : effective?.scope === ControlledFeatureScope.TENANT
            ? 'ORGANIZATION'
            : null,
      reason: effective?.reason ?? null,
    };
  }

  private normalizeCorrectionPhone(value: string) {
    const normalized = normalizeInternationalPhoneNumber(value);
    if (normalized.startsWith('legacy-') || normalized.includes('-legacy-')) {
      return normalized;
    }

    if (!isInternationalPhoneNumber(normalized)) {
      throw new BadRequestException(
        'Phone must be a valid international number, for example +256700000000.',
      );
    }

    return normalized;
  }

  private parseCorrectionDate(value: string | undefined, field: string) {
    if (value === undefined) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid date.`);
    }

    return parsed;
  }

  private cleanOptionalText(value: string | null | undefined) {
    const clean = value?.trim() ?? '';
    return clean.length > 0 ? clean : null;
  }

  private async ensureCorrectionApplication(
    user: AuthenticatedUser,
    loan: LoanWithCollections,
  ) {
    if (loan.application) {
      return {
        id: loan.application.id,
        tenantId: loan.application.tenantId,
        branchId: loan.application.branchId,
      };
    }

    const name = this.splitCustomerName(loan.customer.fullName);
    const created = await this.prisma.loanApplication.create({
      data: {
        tenantId: loan.tenantId,
        branchId: loan.branchId,
        officerUserId: user.userId,
        customerId: loan.customerId,
        loanId: loan.id,
        status: LoanApplicationStatus.SUBMITTED,
        surname: name.surname,
        givenNames: name.givenNames,
        phone: loan.customer.phone,
        nationalId: loan.customer.nationalId,
        principalAmount: loan.principal,
        paymentStartDate: loan.paymentStartDate,
        submittedAt: loan.disbursedAt ?? loan.createdAt,
        syncedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: loan.tenantId,
        actorUserId: user.userId,
        action: 'legacy.loan.application_created_for_media',
        entityType: 'LoanApplication',
        entityId: created.id,
        oldValue: Prisma.JsonNull,
        newValue: {
          loanId: loan.id,
          customerId: loan.customerId,
          reason: 'Created backing application so legacy media can be stored.',
        },
      },
    });

    return {
      id: created.id,
      tenantId: created.tenantId,
      branchId: created.branchId,
    };
  }

  private splitCustomerName(fullName: string) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      return {
        surname: parts[0] ?? 'Customer',
        givenNames: '',
      };
    }

    const surname = parts[parts.length - 1] ?? 'Customer';
    const givenNames = parts.slice(0, -1).join(' ');
    return { surname, givenNames };
  }

  private legacyLoanAuditValue(loan: LoanWithCollections) {
    return {
      loanId: loan.id,
      customerId: loan.customerId,
      branchId: loan.branchId,
      customer: {
        fullName: loan.customer.fullName,
        phone: loan.customer.phone,
        nationalId: loan.customer.nationalId,
        email: loan.customer.email,
      },
      loan: {
        principal: this.decimalToNumber(loan.principal) ?? 0,
        balance: this.decimalToNumber(loan.balance) ?? 0,
        openingBalance:
          this.decimalToNumber(loan.wallet?.openingBalance) ?? null,
        status: loan.status,
        approvedAt: loan.approvedAt?.toISOString() ?? null,
        disbursedAt: loan.disbursedAt?.toISOString() ?? null,
        paymentStartDate: loan.paymentStartDate?.toISOString() ?? null,
        repaymentCount: loan.repayments.length,
      },
    } satisfies Prisma.InputJsonObject;
  }

  private legacyLoanCorrectionAuditValue(input: {
    reason: string;
    customer: {
      fullName?: string;
      phone?: string;
      nationalId?: string | null;
      email?: string | null;
    };
    loan: {
      principal?: number;
      balance?: number;
      status: LoanStatus;
      approvedAt?: string;
      disbursedAt?: string;
      paymentStartDate?: string;
    };
    access: {
      enabled: boolean;
      source: 'ORGANIZATION' | 'BRANCH' | null;
      reason: string | null;
    };
  }) {
    return input as Prisma.InputJsonObject;
  }

  private async buildDetail(
    loan: LoanWithCollections,
  ): Promise<ClientLoanDetailContract> {
    const pricing = this.loanPricing(loan);

    /*
     * Stored paymentStartDate is the first contractual repayment date.
     *
     * Only legacy loans fall back to issue dates.
     */
    const startDate =
      loan.paymentStartDate ??
      loan.application?.paymentStartDate ??
      loan.disbursedAt ??
      loan.application?.submittedAt ??
      loan.createdAt;

    if (!startDate) {
      throw new BadRequestException(
        `Loan ${loan.id} is missing a payment/loan start date.`,
      );
    }

    const repayments = (loan.repayments ?? []).filter(
      (row) =>
        row.paidAt instanceof Date && !Number.isNaN(row.paidAt.getTime()),
    );

    /*
     * Actual repayments are the source of truth.
     *
     * Do not infer repayments from processing fees or pricing differences.
     */
    const recordedPaidAmount = this.roundMoney(
      repayments.reduce(
        (sum, row) => sum + (this.decimalToNumber(row.amount) ?? 0),
        0,
      ),
    );

    const openingBalance = this.decimalToNumber(loan.wallet?.openingBalance);

    const balance = this.decimalToNumber(loan.balance) ?? 0;

    const finesTotal =
      this.decimalToNumber(loan.finesTotal) ??
      this.decimalToNumber(loan.wallet?.finesTotal) ??
      0;

    const baseRepayable = resolveBaseRepayable({
      openingBalance,

      pricedTotal: pricing.totalRepayable,

      principal: pricing.principalAmount,

      paidAmount: recordedPaidAmount,

      balance,

      finesTotal,
    });

    const schedule = computeCollectionSchedule({
      principalAmount: pricing.principalAmount,

      interestRatePercent: pricing.interestRatePercent,

      durationDays: pricing.durationDays,

      repaymentFrequency: loan.application?.repaymentFrequency ?? 'DAILY',

      processingFee: pricing.processingFee,

      balance,

      recordedPaidAmount,

      totalRepayableOverride: baseRepayable,

      startDate,
    });

    const last = repayments[0] ?? null;

    const officer = loan.application?.officer;

    const agentPhotoStorageKey = officer?.profilePhotoStorageKey ?? null;

    const lastPaymentKey = last?.recordedBy?.profilePhotoStorageKey ?? null;

    const [agentPhotoUrl, lastPaymentByPhotoUrl, ...historyPhotos] =
      await Promise.all([
        this.presignPhotoUrl(agentPhotoStorageKey),

        this.presignPhotoUrl(lastPaymentKey),

        ...repayments.map((row) =>
          this.presignPhotoUrl(row.recordedBy?.profilePhotoStorageKey ?? null),
        ),
      ]);

    const lockedPaymentDates = await this.submittedReportDateSet(
      loan.tenantId,
      loan.branchId,
      repayments.map((row) => row.paidAt),
    );

    const paymentHistory = repayments.map((row, index) => {
      const pendingCorrection =
        row.correctionRequests.find(
          (request) =>
            request.status === RepaymentCorrectionRequestStatus.PENDING,
        ) ?? null;
      const approvedCorrection =
        row.correctionRequests.find(
          (request) =>
            request.status === RepaymentCorrectionRequestStatus.APPROVED &&
            !request.correctionAppliedAt,
        ) ?? null;
      const appliedCorrection =
        row.correctionRequests.find((request) => request.correctionAppliedAt) ??
        null;
      const correctionLocked = lockedPaymentDates.has(
        this.dateLabel(row.paidAt),
      );

      return {
        id: row.id,

        amount: this.decimalToNumber(row.amount) ?? 0,

        method: row.method,

        paidAt: row.paidAt.toISOString(),

        recordedByName: row.recordedBy?.displayName ?? 'Field Officer',

        recordedByPublicId: row.recordedBy?.publicId ?? null,

        agentPhotoUrl: historyPhotos[index] ?? null,

        note: row.note,

        correctionLocked,

        canRequestCorrection: !correctionLocked && !pendingCorrection,

        pendingCorrectionRequestId: pendingCorrection?.id ?? null,

        approvedCorrectionRequestId: approvedCorrection?.id ?? null,

        officerCanEdit: approvedCorrection?.officerCanEdit ?? false,

        correctionAppliedAt:
          appliedCorrection?.correctionAppliedAt?.toISOString() ?? null,
      };
    });

    const isFined = loan.isFined || (loan.wallet?.isFined ?? false);

    const fineHistory = (loan.fines ?? []).map((row) => ({
      id: row.id,

      periodIndex: row.periodIndex,

      amount: this.decimalToNumber(row.amount) ?? 0,

      dueAt: row.dueAt.toISOString(),

      appliedAt: row.appliedAt.toISOString(),
    }));

    /*
     * Once genuinely overdue or fined, entire outstanding obligation
     * can be surfaced as due.
     */
    const expectedToday =
      schedule.nextDueLabel === 'Overdue' || finesTotal > 0
        ? schedule.outstanding
        : schedule.expectedToday;

    const correctionAccess = await this.resolveLegacyCorrectionAccess(
      loan.tenantId,
      loan.branchId,
    );

    const mediaRows = loan.application?.media ?? [];
    const mediaUrls = await Promise.all(
      mediaRows.map((row) => this.presignPhotoUrl(row.storageKey)),
    );

    return {
      id: loan.id,

      loanId: loan.id,

      walletId: loan.wallet?.id ?? null,

      customerId: loan.customerId,

      fullName: loan.customer.fullName,

      phone: loan.customer.phone,

      nationalId: loan.customer.nationalId,

      customerEmail: loan.customer.email,

      registeredBy: officer?.displayName ?? 'Branch officer',

      registeredByPublicId: officer?.publicId ?? null,

      agentPhotoUrl,

      agentPhotoStorageKey,

      outstanding: schedule.outstanding,

      lastPaymentAmount: last ? (this.decimalToNumber(last.amount) ?? 0) : 0,

      lastPaymentAt: last?.paidAt.toISOString() ?? null,

      lastPaymentBy: last?.recordedBy?.displayName ?? null,

      lastPaymentByPhotoUrl,

      expectedToday,

      carriedForward: schedule.carriedForward,

      dailyInstalment: schedule.dailyInstalment,

      loanPeriodDays: schedule.loanPeriodDays,

      daysLeft: schedule.daysLeft,

      nextDueLabel: schedule.nextDueLabel,

      nextDueIsToday: schedule.nextDueIsToday,

      paidAmount: schedule.paidAmount,

      /*
       * Borrower obligation:
       *
       * principal + interest + applied fines.
       *
       * Processing fee excluded.
       */
      loanAmount: this.roundMoney(baseRepayable + finesTotal),

      principalAmount: pricing.principalAmount,

      openingBalance: openingBalance ?? null,

      interestRatePercent: pricing.interestRatePercent,

      interestAmount: schedule.interestAmount,

      processingFee: schedule.processingFee,

      /*
       * Compatibility API field.
       *
       * Represents first repayment date.
       */
      loanStartDate: schedule.loanStartDate,

      paymentStartDate: startDate.toISOString(),

      maturityDate: schedule.maturityDate,

      status: loan.status,

      isFined,

      finesTotal,

      paymentHistory,

      fineHistory,

      media: mediaRows.map((row, index) => ({
        id: row.id,
        mediaType: row.type,
        fileName: row.fileName,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
        url: mediaUrls[index] ?? null,
        createdAt: row.createdAt.toISOString(),
      })),

      correctionAccess,
    };
  }

  private async toDueClient(
    loan: LoanWithCollections,
    asOf: Date,
  ): Promise<DueClientContract | null> {
    const detail = await this.buildDetail(loan);

    if (detail.outstanding <= 0) {
      return null;
    }

    const last = loan.repayments[0];

    return {
      id: loan.id,

      loanId: loan.id,

      customerId: loan.customerId,

      fullName: detail.fullName,

      phone: detail.phone,

      amountPaid: detail.paidAmount,

      loanAmount: detail.loanAmount,

      amountDue: detail.expectedToday,

      lastActivityAt: (last?.paidAt ?? loan.updatedAt ?? asOf).toISOString(),

      synced: true,
    };
  }

  private loanPricing(loan: LoanWithCollections) {
    const app = loan.application;

    const principal =
      this.decimalToNumber(app?.principalAmount) ??
      this.decimalToNumber(loan.principal) ??
      0;

    const rate = this.decimalToNumber(app?.interestRatePercent) ?? 0;

    const days = app?.durationDays ?? 0;

    const fee = this.decimalToNumber(app?.processingFee) ?? 0;

    const computed = computeLoanPricing({
      principalAmount: principal,

      interestRatePercent: rate,

      durationDays: days,

      processingFee: fee,
    });

    /*
     * Wallet openingBalance represents contractual borrower debt:
     *
     * principal + interest.
     *
     * Processing fee is separate income.
     */
    const opening = this.decimalToNumber(loan.wallet?.openingBalance);

    if (opening == null) {
      return computed;
    }

    const interestAmount = this.roundMoney(
      Math.max(0, opening - computed.principalAmount),
    );

    return {
      ...computed,

      interestAmount,

      totalRepayable: opening,
    };
  }

  private async presignPhotoUrl(storageKey: string | null | undefined) {
    if (!storageKey) {
      return null;
    }

    try {
      const signed = await this.objectStorage.presignGet({
        storageKey,
      });

      return signed.downloadUrl;
    } catch {
      return null;
    }
  }

  private extensionFromMime(mimeType: string) {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    };
    return map[mimeType.toLowerCase()];
  }

  private extensionFromFileName(fileName?: string) {
    if (!fileName?.includes('.')) return undefined;
    return fileName.split('.').pop()?.toLowerCase();
  }

  private parseDayBounds(date?: string): {
    dayStart: Date;
    dayEnd: Date;
    dateLabel: string;
  } {
    const trimmed = date?.trim();

    let year: number;
    let month: number;
    let day: number;

    if (trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map((part) => Number(part));

      year = y;
      month = m;
      day = d;
    } else if (trimmed) {
      throw new BadRequestException('date must be YYYY-MM-DD.');
    } else {
      const now = new Date();

      year = now.getFullYear();

      month = now.getMonth() + 1;

      day = now.getDate();
    }

    const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);

    const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999);

    if (Number.isNaN(dayStart.getTime()) || Number.isNaN(dayEnd.getTime())) {
      throw new BadRequestException('Invalid date.');
    }

    const dateLabel = `${year}-${String(month).padStart(2, '0')}-${String(
      day,
    ).padStart(2, '0')}`;

    return {
      dayStart,
      dayEnd,
      dateLabel,
    };
  }

  private filterToRange(filter?: string) {
    if (!filter || filter === 'all' || filter === 'dueToday') {
      return null;
    }

    const now = new Date();

    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    if (filter === 'collectedToday' || filter === 'today') {
      return {
        from: startOfToday,

        to: now,
      };
    }

    if (filter === 'yesterday') {
      const from = new Date(startOfToday);

      from.setDate(from.getDate() - 1);

      const to = new Date(startOfToday);

      to.setMilliseconds(to.getMilliseconds() - 1);

      return {
        from,
        to,
      };
    }

    if (filter === 'thisWeek') {
      const from = new Date(startOfToday);

      from.setDate(
        from.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1),
      );

      return {
        from,

        to: now,
      };
    }

    if (filter === 'thisMonth') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);

      return {
        from,

        to: now,
      };
    }

    return null;
  }

  private sameDay(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private dateOnly(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private dateLabel(value: Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(
      2,
      '0',
    )}-${String(value.getDate()).padStart(2, '0')}`;
  }

  private decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
    if (value == null) {
      return null;
    }

    if (typeof value === 'number') {
      return value;
    }

    return Number(value.toString());
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
