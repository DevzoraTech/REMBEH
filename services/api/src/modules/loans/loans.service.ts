import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { CreateLoanApplicationFromCustomerDto } from '../loan-applications/dto/create-from-customer.dto';
import { LoanApplicationsService } from '../loan-applications/loan-applications.service';
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

    return { loans: loans.map((loan) => this.toContract(loan)) };
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

  private toContract(loan: LoanListRecord): LoanListItemContract {
    return {
      id: loan.id,
      applicationId: loan.application?.id ?? null,
      customerId: loan.customerId,
      borrowerName: loan.customer.fullName,
      phone: loan.customer.phone,
      nationalId: loan.customer.nationalId,
      loanTypeName: this.loanTypeName(loan),
      status: loan.status,
      principal: this.decimalToNumber(loan.principal) ?? 0,
      balance: this.decimalToNumber(loan.balance) ?? 0,
      paidAmount: this.roundMoney(
        loan.repayments.reduce(
          (sum, repayment) =>
            sum + (this.decimalToNumber(repayment.amount) ?? 0),
          0,
        ),
      ),
      currency: loan.currency,
      officerName: loan.application?.officer.displayName ?? null,
      officerPublicId: loan.application?.officer.publicId ?? null,
      branchId: loan.branchId,
      createdAt: loan.createdAt.toISOString(),
      disbursedAt: loan.disbursedAt?.toISOString() ?? null,
      updatedAt: loan.updatedAt.toISOString(),
    };
  }

  private loanTypeName(loan: LoanListRecord) {
    return (
      loan.application?.templateName?.trim() ||
      loan.application?.loanProductTemplate?.name.trim() ||
      null
    );
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
}
