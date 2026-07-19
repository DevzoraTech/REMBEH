import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LoanStatus, Prisma, RepaymentMethod } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { generateAgentPublicId } from '../../common/security/agent-public-id';
import { PrismaService } from '../../database/prisma.service';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { computeLoanPricing } from '../loan-products/loan-pricing';
import { SmsService } from '../notifications/sms.service';
import { REALTIME_EVENTS } from '../realtime/realtime.events';
import { RealtimeGateway } from '../realtime/realtime.gateway';
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
  RecordRepaymentResponseContract,
  RepaymentDetailContract,
  RepaymentListItemContract,
} from './collections.contracts';
import {
  CollectionsRepository,
  LoanWithCollections,
  activeLoanStatuses,
} from './collections.repository';
import { RecordRepaymentDto } from './dto/record-repayment.dto';

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    private readonly repository: CollectionsRepository,
    private readonly realtime: RealtimeGateway,
    private readonly smsService: SmsService,
    private readonly prisma: PrismaService,
    private readonly objectStorage: ObjectStorageService,
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
      .filter((item): item is DueClientContract => item != null && item.amountDue > 0)
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
    return { clients: summary.clientsDueToday };
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

    const repayments = await Promise.all(
      rows.map(async (row) => {
        const loan = row.loan as LoanWithCollections;
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

    return { repayments };
  }

  async searchClients(
    user: AuthenticatedUser,
    query: string,
  ): Promise<{ clients: ClientLoanDetailContract[] }> {
    this.assertBranchAccess(user);
    const q = query.trim();
    if (q.length < 1) {
      return { clients: [] };
    }
    const loans = await this.repository.searchLoans({
      ...this.scope(user),
      query: q,
    });
    const clients = (
      await Promise.all(loans.map((loan) => this.buildDetail(loan)))
    ).sort((a, b) => {
      const aAt = a.lastPaymentAt ?? a.paymentStartDate ?? a.loanStartDate;
      const bAt = b.lastPaymentAt ?? b.paymentStartDate ?? b.loanStartDate;
      return new Date(bAt).getTime() - new Date(aAt).getTime();
    });
    return { clients };
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
    return { detail: await this.buildDetail(loan) };
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

    const loan = row.loan as LoanWithCollections;
    const detail = await this.buildDetail(loan);
    const agentPhotoStorageKey =
      row.recordedBy.profilePhotoStorageKey ?? null;

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
        companyName: row.tenant.name,
        branchName: row.branch?.name ?? null,
        branchId: row.branchId,
        currency: loan.currency,
        loanOutstanding: detail.outstanding,
        loanStatus: detail.status,
      },
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
      if (activity !== 0) return activity;
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
          clientName:
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
          clientName: row.loan.customer.fullName,
          phone: row.loan.customer.phone,
          amount: this.decimalToNumber(row.amount) ?? 0,
          method: row.method,
          note: row.note,
          paidAt: row.paidAt.toISOString(),
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
      { fees: 0, interest: 0, principal: 0 },
    );

    const allocation = allocateRepayment({
      amount,
      remainingFees: Math.max(0, pricing.processingFee - totals.fees),
      remainingInterest: Math.max(0, pricing.interestAmount - totals.interest),
      remainingPrincipal: Math.max(0, pricing.principalAmount - totals.principal),
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

    void this.sendPaymentSms({
      userId: user.userId,
      phone: updatedLoan.customer.phone,
      amount,
      currency: updatedLoan.currency,
      paidAt: repayment.paidAt,
    }).catch((error) => {
      this.logger.warn(`Payment SMS failed: ${String(error)}`);
    });

    return { repayment: item, detail };
  }

  private async sendPaymentSms(input: {
    userId: string;
    phone: string;
    amount: number;
    currency: string;
    paidAt: Date;
  }) {
    const agent = await this.prisma.user.findUnique({
      where: { id: input.userId },
      include: { tenant: true },
    });
    if (!input.phone?.trim()) {
      return;
    }

    let publicId = agent?.publicId ?? null;
    if (agent && !publicId) {
      publicId = await this.assignPublicId(agent.id);
    }

    const amountLabel = `${input.currency} ${input.amount.toLocaleString('en-UG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;

    await this.smsService.sendPaymentRecordedSms({
      destination: input.phone,
      amountLabel,
      agentName: agent?.displayName ?? 'Agent',
      agentPublicId: publicId ?? 'A-00000',
      companyName: agent?.tenant.name ?? 'REMBEH',
      paidAt: input.paidAt,
    });
  }

  private async assignPublicId(userId: string): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateAgentPublicId();
      try {
        const updated = await this.prisma.user.update({
          where: { id: userId },
          data: { publicId: candidate },
        });
        return updated.publicId!;
      } catch {
        // unique collision — retry
      }
    }
    const fallback = `A-${Date.now().toString().slice(-5)}`;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { publicId: fallback },
    });
    return updated.publicId!;
  }

  private scope(user: AuthenticatedUser) {
    const canAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );
    return {
      tenantId: user.tenantId,
      branchId: canAllBranches ? null : user.branchId,
    };
  }

  private assertBranchAccess(user: AuthenticatedUser) {
    const canAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );
    if (!canAllBranches && !user.branchId) {
      throw new ForbiddenException('Branch scope is required.');
    }
  }

  private async buildDetail(
    loan: LoanWithCollections,
  ): Promise<ClientLoanDetailContract> {
    const pricing = this.loanPricing(loan);
    // Prefer stored paymentStartDate (manager policy); fall back for legacy loans.
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
      (row) => row.paidAt instanceof Date && !Number.isNaN(row.paidAt.getTime()),
    );
    // Paid is strictly the sum of recorded repayments — never fees/interest
    // inferred from totalRepayable − balance (that caused spurious "paid" on new loans).
    const recordedPaidAmount = this.roundMoney(
      repayments.reduce(
        (sum, row) => sum + (this.decimalToNumber(row.amount) ?? 0),
        0,
      ),
    );
    const openingBalance = this.decimalToNumber(loan.wallet?.openingBalance);
    const schedule = computeCollectionSchedule({
      principalAmount: pricing.principalAmount,
      interestRatePercent: pricing.interestRatePercent,
      durationDays: pricing.durationDays,
      processingFee: pricing.processingFee,
      balance: this.decimalToNumber(loan.balance) ?? 0,
      recordedPaidAmount,
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
    const paymentHistory = repayments.map((row, index) => ({
      id: row.id,
      amount: this.decimalToNumber(row.amount) ?? 0,
      method: row.method,
      paidAt: row.paidAt.toISOString(),
      recordedByName: row.recordedBy?.displayName ?? 'Agent',
      recordedByPublicId: row.recordedBy?.publicId ?? null,
      agentPhotoUrl: historyPhotos[index] ?? null,
      note: row.note,
    }));

    return {
      id: loan.id,
      loanId: loan.id,
      walletId: loan.wallet?.id ?? null,
      customerId: loan.customerId,
      fullName: loan.customer.fullName,
      phone: loan.customer.phone,
      registeredBy: officer?.displayName ?? 'Branch officer',
      registeredByPublicId: officer?.publicId ?? null,
      agentPhotoUrl,
      agentPhotoStorageKey,
      outstanding: schedule.outstanding,
      lastPaymentAmount: last
        ? (this.decimalToNumber(last.amount) ?? 0)
        : 0,
      lastPaymentAt: last?.paidAt.toISOString() ?? null,
      lastPaymentBy: last?.recordedBy?.displayName ?? null,
      lastPaymentByPhotoUrl,
      expectedToday: schedule.expectedToday,
      carriedForward: schedule.carriedForward,
      dailyInstalment: schedule.dailyInstalment,
      loanPeriodDays: schedule.loanPeriodDays,
      daysLeft: schedule.daysLeft,
      nextDueLabel: schedule.nextDueLabel,
      nextDueIsToday: schedule.nextDueIsToday,
      paidAmount: schedule.paidAmount,
      // Prefer wallet opening (set at submit to total repayable) when present.
      loanAmount: openingBalance ?? schedule.totalRepayable,
      interestRatePercent: pricing.interestRatePercent,
      interestAmount: schedule.interestAmount,
      processingFee: schedule.processingFee,
      loanStartDate: schedule.loanStartDate,
      paymentStartDate: startDate.toISOString(),
      maturityDate: schedule.maturityDate,
      status: loan.status,
      paymentHistory,
    };
  }

  private async toDueClient(
    loan: LoanWithCollections,
    asOf: Date,
  ): Promise<DueClientContract | null> {
    const detail = await this.buildDetail(loan);
    if (detail.outstanding <= 0) return null;
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
      lastActivityAt: (
        last?.paidAt ??
        loan.updatedAt ??
        asOf
      ).toISOString(),
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
    // Match submit-time pricing: missing duration must not invent a 30-day term
    // (that inflated totalRepayable and made interest look like "paid").
    const days = app?.durationDays ?? 0;
    const fee = this.decimalToNumber(app?.processingFee) ?? 0;
    return computeLoanPricing({
      principalAmount: principal,
      interestRatePercent: rate,
      durationDays: days,
      processingFee: fee,
    });
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

    const dateLabel = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { dayStart, dayEnd, dateLabel };
  }

  private filterToRange(filter?: string) {
    if (!filter || filter === 'all' || filter === 'dueToday') return null;
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    if (filter === 'collectedToday' || filter === 'today') {
      return { from: startOfToday, to: now };
    }
    if (filter === 'yesterday') {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - 1);
      const to = new Date(startOfToday);
      to.setMilliseconds(to.getMilliseconds() - 1);
      return { from, to };
    }
    if (filter === 'thisWeek') {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
      return { from, to: now };
    }
    if (filter === 'thisMonth') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: now };
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

  private decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
    if (value == null) return null;
    if (typeof value === 'number') return value;
    return Number(value.toString());
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
