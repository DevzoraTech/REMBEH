import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { isPrismaUniqueConstraintError } from '../../common/database/prisma-errors';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { OPERATIONS_PERMISSIONS } from '../operations/operations.permissions';
import { ObjectStorageService } from '../storage/object-storage.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { RecordSalaryPaymentDto } from './dto/record-salary-payment.dto';
import { ReverseSalaryPaymentDto } from './dto/reverse-salary-payment.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import type {
  PayrollSummaryContract,
  SalariesDashboardContract,
  SalaryAgentCandidateContract,
  SalaryCycleContract,
  SalaryEmployeeContract,
  SalaryHistoryCycleContract,
  SalaryPaymentContract,
} from './salaries.contracts';
import { SalariesRepository } from './salaries.repository';

type SalaryEmployeeRow = Awaited<
  ReturnType<SalariesRepository['listEmployees']>
>[number];

type SalaryPaymentRow = SalaryEmployeeRow['salaryPayments'][number];

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SalariesService {
  constructor(
    private readonly repository: SalariesRepository,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  async dashboard(
    user: AuthenticatedUser,
    options?: { branchId?: string; cycleStart?: string; search?: string },
  ): Promise<SalariesDashboardContract> {
    this.assertCanRead(user);
    const scope = this.scope(user, options?.branchId);
    const cycle = this.resolveCycle(options?.cycleStart);

    const rows = await this.repository.listEmployees({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      search: options?.search,
      cycleStart: cycle.startDate,
      cycleEnd: cycle.endDate,
    });

    const shortages = await this.shortageMap(user.tenantId, rows);
    const employees = await Promise.all(
      rows.map((row) => this.toEmployeeContract(row, cycle, shortages)),
    );

    return {
      cycle: this.toCycleContract(cycle),
      summary: this.summary(employees),
      employees,
    };
  }

  async listAgentCandidates(
    user: AuthenticatedUser,
    branchId?: string,
  ): Promise<{ agents: SalaryAgentCandidateContract[] }> {
    this.assertCanManage(user);
    const scope = this.scope(user, branchId);
    const agents = await this.repository.listAgentCandidates(scope);
    const rows = await Promise.all(
      agents.map(async (agent) => ({
        id: agent.id,
        name: agent.displayName,
        phone: agent.phone,
        email: agent.email,
        roleName: agent.roles[0]?.role.name ?? null,
        branchId: agent.branchId,
        photoUrl: await this.presignPhotoUrl(agent.profilePhotoStorageKey),
      })),
    );

    return { agents: rows };
  }

  async createEmployee(user: AuthenticatedUser, dto: CreateEmployeeDto) {
    this.assertCanManage(user);
    const scope = this.scope(user, dto.branchId);
    let linkedAgent: Awaited<
      ReturnType<SalariesRepository['findAgentCandidate']>
    > | null = null;

    if (dto.agentUserId) {
      linkedAgent = await this.repository.findAgentCandidate({
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        userId: dto.agentUserId,
      });
      if (!linkedAgent) {
        throw new BadRequestException(
          'Select an agent that belongs to this branch and is not already managed as an employee.',
        );
      }
    }

    const fullName = this.clean(dto.fullName) ?? linkedAgent?.displayName;
    if (!fullName) {
      throw new BadRequestException('Employee name is required.');
    }

    try {
      const employee = await this.repository.createEmployee({
        tenantId: scope.tenantId,
        branchId: scope.branchId ?? linkedAgent?.branchId ?? null,
        userId: linkedAgent?.id ?? null,
        fullName,
        phone: this.clean(dto.phone) ?? linkedAgent?.phone ?? null,
        email: this.clean(dto.email) ?? linkedAgent?.email ?? null,
        ninNumber: this.clean(dto.ninNumber),
        roleName:
          this.clean(dto.roleName) ?? linkedAgent?.roles[0]?.role.name ?? null,
        status: dto.status ?? EmployeeStatus.ACTIVE,
        monthlySalary: this.money(dto.monthlySalary),
        dateJoined: this.parseDate(dto.dateJoined),
        paymentMethod: dto.paymentMethod ?? null,
        paymentProvider: this.clean(dto.paymentProvider),
        paymentAccountName: this.clean(dto.paymentAccountName),
        paymentAccountNumber: this.clean(dto.paymentAccountNumber),
        notes: this.clean(dto.notes),
        createdByUserId: user.userId,
      });

      return this.getEmployee(user, employee.id);
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new ConflictException(
          'This agent is already in employee salary management.',
        );
      }
      throw error;
    }
  }

  async getEmployee(
    user: AuthenticatedUser,
    employeeId: string,
    cycleStart?: string,
  ) {
    this.assertCanRead(user);
    const scope = this.scope(user);
    const cycle = this.resolveCycle(cycleStart);
    const row = await this.repository.findEmployee({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      employeeId,
      cycleStart: cycle.startDate,
      cycleEnd: cycle.endDate,
    });
    if (!row) throw new NotFoundException('Employee was not found.');

    const shortages = await this.shortageMap(user.tenantId, [row]);
    return {
      cycle: this.toCycleContract(cycle),
      employee: await this.toEmployeeContract(row, cycle, shortages),
    };
  }

  async updateEmployee(
    user: AuthenticatedUser,
    employeeId: string,
    dto: UpdateEmployeeDto,
  ) {
    this.assertCanManage(user);
    const scope = this.scope(user);
    const data: Prisma.EmployeeUpdateInput = {
      ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
      ...(dto.phone !== undefined ? { phone: this.clean(dto.phone) } : {}),
      ...(dto.email !== undefined ? { email: this.clean(dto.email) } : {}),
      ...(dto.ninNumber !== undefined
        ? { ninNumber: this.clean(dto.ninNumber) }
        : {}),
      ...(dto.roleName !== undefined
        ? { roleName: this.clean(dto.roleName) }
        : {}),
      ...(dto.monthlySalary !== undefined
        ? { monthlySalary: new Prisma.Decimal(this.money(dto.monthlySalary)) }
        : {}),
      ...(dto.dateJoined !== undefined
        ? { dateJoined: this.parseDate(dto.dateJoined) }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.paymentMethod !== undefined
        ? { paymentMethod: dto.paymentMethod }
        : {}),
      ...(dto.paymentProvider !== undefined
        ? { paymentProvider: this.clean(dto.paymentProvider) }
        : {}),
      ...(dto.paymentAccountName !== undefined
        ? { paymentAccountName: this.clean(dto.paymentAccountName) }
        : {}),
      ...(dto.paymentAccountNumber !== undefined
        ? { paymentAccountNumber: this.clean(dto.paymentAccountNumber) }
        : {}),
      ...(dto.notes !== undefined ? { notes: this.clean(dto.notes) } : {}),
    };

    const result = await this.repository.updateEmployee({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      employeeId,
      data,
    });
    if (result.count === 0) {
      throw new NotFoundException('Employee was not found.');
    }

    return this.getEmployee(user, employeeId);
  }

  async recordPayment(
    user: AuthenticatedUser,
    employeeId: string,
    dto: RecordSalaryPaymentDto,
    cycleStart?: string,
  ) {
    this.assertCanManage(user);
    const current = await this.getEmployee(user, employeeId, cycleStart);
    const amount = this.money(dto.amount);
    if (amount > current.employee.outstanding + 0.001) {
      throw new BadRequestException(
        `Payment exceeds outstanding salary (${current.employee.outstanding}).`,
      );
    }

    const cycle = this.resolveCycle(cycleStart);
    const payment = await this.repository.recordPayment({
      tenantId: user.tenantId,
      branchId: current.employee.branchId,
      employeeId,
      cycleStart: cycle.startDate,
      cycleEnd: cycle.endDate,
      amount,
      method: dto.method,
      paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
      referenceNote: this.clean(dto.referenceNote),
      recordedByUserId: user.userId,
    });

    return {
      payment: this.toPaymentContract(payment),
      ...(await this.getEmployee(user, employeeId, cycleStart)),
    };
  }

  async reversePayment(
    user: AuthenticatedUser,
    paymentId: string,
    dto: ReverseSalaryPaymentDto,
  ) {
    this.assertCanManage(user);
    const scope = this.scope(user);
    const payment = await this.repository.findPayment({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      paymentId,
    });
    if (!payment) {
      throw new NotFoundException('Salary payment was not found.');
    }
    if (payment.reversedAt) {
      throw new BadRequestException('This salary payment is already reversed.');
    }

    const result = await this.repository.reversePayment({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      paymentId,
      reason: dto.reason,
    });
    if (result.count === 0) {
      throw new NotFoundException('Salary payment was not found.');
    }

    return this.getEmployee(
      user,
      payment.employeeId,
      this.formatDate(payment.cycleStart),
    );
  }

  async history(
    user: AuthenticatedUser,
    employeeId: string,
  ): Promise<{
    employee: SalaryEmployeeContract;
    cycles: SalaryHistoryCycleContract[];
    summary: { totalCycles: number; totalPaid: number; totalDue: number };
  }> {
    this.assertCanRead(user);
    const current = await this.getEmployee(user, employeeId);
    const cycles = this.previousCycles(6);
    const payments = await this.repository.listPaymentsForEmployee({
      tenantId: user.tenantId,
      employeeId,
      cycleStarts: cycles.map((cycle) => cycle.startDate),
    });
    const paymentsByCycle = new Map<string, SalaryPaymentRow[]>();
    for (const payment of payments) {
      const key = this.formatDate(payment.cycleStart);
      const rows = paymentsByCycle.get(key) ?? [];
      rows.push(payment as SalaryPaymentRow);
      paymentsByCycle.set(key, rows);
    }

    const historyCycles = cycles.map((cycle) => {
      const rows = paymentsByCycle.get(this.formatDate(cycle.startDate)) ?? [];
      const salaryDue = this.salaryDueFor(
        current.employee.monthlySalary,
        current.employee.dateJoined,
        cycle,
      ).salaryDue;
      const paid = this.sumActivePayments(rows);
      const outstanding = this.roundMoney(Math.max(0, salaryDue - paid));
      return {
        start: this.formatDate(cycle.startDate),
        end: this.formatDate(cycle.endDate),
        label: this.cycleLabel(cycle.startDate, cycle.endDate),
        salaryDue,
        paid,
        outstanding,
        paymentStatus: this.paymentStatus(salaryDue, paid),
        payments: rows.map((payment) => this.toPaymentContract(payment)),
      };
    });

    const totalDue = historyCycles.reduce((sum, row) => sum + row.salaryDue, 0);
    const totalPaid = historyCycles.reduce((sum, row) => sum + row.paid, 0);

    return {
      employee: current.employee,
      cycles: historyCycles,
      summary: {
        totalCycles: historyCycles.length,
        totalPaid: this.roundMoney(totalPaid),
        totalDue: this.roundMoney(totalDue),
      },
    };
  }

  private async toEmployeeContract(
    row: SalaryEmployeeRow,
    cycle: CycleBounds,
    shortageByUser: Map<string, number>,
  ): Promise<SalaryEmployeeContract> {
    const salary = this.salaryDueFor(
      Number(row.monthlySalary),
      row.dateJoined,
      cycle,
    );
    const paid = this.sumActivePayments(row.salaryPayments);
    const outstanding = this.roundMoney(Math.max(0, salary.salaryDue - paid));
    const userId = row.userId ?? row.user?.id ?? null;
    const shortageOutstanding = userId ? (shortageByUser.get(userId) ?? 0) : 0;

    return {
      id: row.id,
      userId,
      branchId: row.branchId,
      fullName: row.fullName,
      phone: row.phone,
      email: row.email,
      ninNumber: row.ninNumber,
      roleName: row.roleName,
      status: row.status,
      photoUrl: await this.presignPhotoUrl(row.user?.profilePhotoStorageKey),
      monthlySalary: Number(row.monthlySalary),
      salaryDue: salary.salaryDue,
      paid,
      outstanding,
      shortageOutstanding,
      paymentStatus: this.paymentStatus(salary.salaryDue, paid),
      isProrated: salary.eligibleDays < salary.cycleDays,
      cycleDays: salary.cycleDays,
      eligibleDays: salary.eligibleDays,
      dateJoined: this.formatDate(row.dateJoined),
      paymentMethod: row.paymentMethod,
      paymentProvider: row.paymentProvider,
      paymentAccountName: row.paymentAccountName,
      paymentAccountNumber: row.paymentAccountNumber,
      notes: row.notes,
      payments: row.salaryPayments.map((payment) =>
        this.toPaymentContract(payment),
      ),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private summary(employees: SalaryEmployeeContract[]): PayrollSummaryContract {
    const totalPayrollDue = this.roundMoney(
      employees.reduce((sum, employee) => sum + employee.salaryDue, 0),
    );
    const paid = this.roundMoney(
      employees.reduce((sum, employee) => sum + employee.paid, 0),
    );
    const outstanding = this.roundMoney(
      employees.reduce((sum, employee) => sum + employee.outstanding, 0),
    );
    const employeeShortages = this.roundMoney(
      employees.reduce(
        (sum, employee) => sum + employee.shortageOutstanding,
        0,
      ),
    );

    return {
      totalPayrollDue,
      employeeCount: employees.length,
      paid,
      outstanding,
      paidPercent:
        totalPayrollDue > 0 ? Math.round((paid / totalPayrollDue) * 100) : 0,
      outstandingPercent:
        totalPayrollDue > 0
          ? Math.round((outstanding / totalPayrollDue) * 100)
          : 0,
      employeeShortages,
      shortageEmployeeCount: employees.filter(
        (employee) => employee.shortageOutstanding > 0,
      ).length,
      unpaidCount: employees.filter(
        (employee) => employee.paymentStatus === 'UNPAID',
      ).length,
      partialCount: employees.filter(
        (employee) => employee.paymentStatus === 'PARTIAL',
      ).length,
      paidCount: employees.filter(
        (employee) => employee.paymentStatus === 'PAID',
      ).length,
    };
  }

  private async shortageMap(tenantId: string, rows: SalaryEmployeeRow[]) {
    const userIds = rows
      .map((row) => row.userId ?? row.user?.id)
      .filter((id): id is string => Boolean(id));
    return this.repository.outstandingShortagesByUser({ tenantId, userIds });
  }

  private sumActivePayments(payments: SalaryPaymentRow[]) {
    return this.roundMoney(
      payments
        .filter((payment) => !payment.reversedAt)
        .reduce((sum, payment) => sum + Number(payment.amount), 0),
    );
  }

  private toPaymentContract(payment: SalaryPaymentRow): SalaryPaymentContract {
    return {
      id: payment.id,
      amount: Number(payment.amount),
      method: payment.method,
      paidAt: payment.paidAt.toISOString(),
      referenceNote: payment.referenceNote,
      recordedByName: payment.recordedBy.displayName,
      reversedAt: payment.reversedAt?.toISOString() ?? null,
    };
  }

  private salaryDueFor(
    monthlySalary: number,
    dateJoined: Date | string,
    cycle: CycleBounds,
  ) {
    const joined =
      typeof dateJoined === 'string'
        ? this.parseDate(dateJoined)
        : this.startOfUtcDate(
            dateJoined.getUTCFullYear(),
            dateJoined.getUTCMonth(),
            dateJoined.getUTCDate(),
          );
    const cycleDays = this.daysInclusive(cycle.startDate, cycle.endDate);
    if (joined > cycle.endDate) {
      return { salaryDue: 0, cycleDays, eligibleDays: 0 };
    }

    const eligibleStart = joined > cycle.startDate ? joined : cycle.startDate;
    const eligibleDays = this.daysInclusive(eligibleStart, cycle.endDate);
    const salaryDue = this.roundMoney(
      (this.money(monthlySalary) * eligibleDays) / cycleDays,
    );
    return { salaryDue, cycleDays, eligibleDays };
  }

  private paymentStatus(salaryDue: number, paid: number) {
    if (salaryDue <= 0 || paid >= salaryDue - 0.001) return 'PAID' as const;
    if (paid > 0) return 'PARTIAL' as const;
    return 'UNPAID' as const;
  }

  private resolveCycle(cycleStart?: string): CycleBounds {
    if (cycleStart) {
      const start = this.parseDate(cycleStart);
      return this.boundsFromStart(start);
    }

    const now = new Date();
    const utcToday = this.startOfUtcDate(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const startMonth =
      utcToday.getUTCDate() >= 22
        ? utcToday.getUTCMonth()
        : utcToday.getUTCMonth() - 1;
    return this.boundsFromStart(
      this.startOfUtcDate(utcToday.getUTCFullYear(), startMonth, 22),
    );
  }

  private previousCycles(count: number) {
    const current = this.resolveCycle();
    const cycles: CycleBounds[] = [];
    for (let index = 1; index <= count; index += 1) {
      const start = this.startOfUtcDate(
        current.startDate.getUTCFullYear(),
        current.startDate.getUTCMonth() - index,
        22,
      );
      cycles.push(this.boundsFromStart(start));
    }
    return cycles;
  }

  private boundsFromStart(start: Date): CycleBounds {
    const normalizedStart = this.startOfUtcDate(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      22,
    );
    const endDate = this.startOfUtcDate(
      normalizedStart.getUTCFullYear(),
      normalizedStart.getUTCMonth() + 1,
      21,
    );
    const nextStart = this.startOfUtcDate(
      normalizedStart.getUTCFullYear(),
      normalizedStart.getUTCMonth() + 1,
      22,
    );
    const nextEnd = this.startOfUtcDate(
      normalizedStart.getUTCFullYear(),
      normalizedStart.getUTCMonth() + 2,
      21,
    );
    const paymentWindowStart = this.startOfUtcDate(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      27,
    );
    const paymentWindowEnd = this.startOfUtcDate(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth() + 1,
      31,
    );

    return {
      startDate: normalizedStart,
      endDate,
      nextStart,
      nextEnd,
      paymentWindowStart,
      paymentWindowEnd,
    };
  }

  private toCycleContract(cycle: CycleBounds): SalaryCycleContract {
    return {
      start: this.formatDate(cycle.startDate),
      end: this.formatDate(cycle.endDate),
      label: this.cycleLabel(cycle.startDate, cycle.endDate),
      paymentWindowStart: this.formatDate(cycle.paymentWindowStart),
      paymentWindowEnd: this.formatDate(cycle.paymentWindowEnd),
      nextStart: this.formatDate(cycle.nextStart),
      nextEnd: this.formatDate(cycle.nextEnd),
    };
  }

  private cycleLabel(start: Date, end: Date) {
    return `${this.shortDate(start)} - ${this.shortDate(end)}`;
  }

  private shortDate(date: Date) {
    return date.toLocaleDateString('en-UG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  private parseDate(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Enter a valid date.');
    }
    return this.startOfUtcDate(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
    );
  }

  private startOfUtcDate(year: number, month: number, day: number) {
    return new Date(Date.UTC(year, month, day));
  }

  private formatDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private daysInclusive(start: Date, end: Date) {
    return Math.max(
      0,
      Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1,
    );
  }

  private money(value: number) {
    return this.roundMoney(Math.max(0, Number(value) || 0));
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }

  private clean(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private scope(user: AuthenticatedUser, requestedBranchId?: string) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Account access is required.');
    }
    const canSeeAll = user.permissions.includes(BRANCH_PERMISSIONS.create);
    const branchId = canSeeAll
      ? (this.clean(requestedBranchId) ?? null)
      : (user.branchId ?? null);

    if (!canSeeAll && !branchId) {
      throw new ForbiddenException('Branch access is required.');
    }

    return { tenantId: user.tenantId, branchId };
  }

  private assertCanRead(user: AuthenticatedUser) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Account access is required.');
    }
    if (
      !user.permissions.some((permission) =>
        (
          [
            OPERATIONS_PERMISSIONS.read,
            OPERATIONS_PERMISSIONS.close,
            BRANCH_PERMISSIONS.read,
            BRANCH_PERMISSIONS.staffRead,
            BRANCH_PERMISSIONS.create,
          ] as string[]
        ).includes(permission),
      )
    ) {
      throw new ForbiddenException('You cannot view salaries.');
    }
  }

  private assertCanManage(user: AuthenticatedUser) {
    this.assertCanRead(user);
    if (
      !user.permissions.some((permission) =>
        (
          [
            OPERATIONS_PERMISSIONS.close,
            BRANCH_PERMISSIONS.update,
            BRANCH_PERMISSIONS.staffInvite,
            BRANCH_PERMISSIONS.create,
          ] as string[]
        ).includes(permission),
      )
    ) {
      throw new ForbiddenException('You cannot manage salaries.');
    }
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
}

type CycleBounds = {
  startDate: Date;
  endDate: Date;
  nextStart: Date;
  nextEnd: Date;
  paymentWindowStart: Date;
  paymentWindowEnd: Date;
};
