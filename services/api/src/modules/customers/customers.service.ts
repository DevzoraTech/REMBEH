import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Customer } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  isInternationalPhoneNumber,
  normalizeEmailAddress,
  normalizeInternationalPhoneNumber,
} from '../../common/security/identity-normalization';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import {
  computeLoanPricing,
  resolveBaseRepayable,
} from '../loan-products/loan-pricing';
import { ObjectStorageService } from '../storage/object-storage.service';
import {
  CustomerApiContract,
  CustomerDetailContract,
  CustomerDetailResponseContract,
  CustomerDocumentContract,
  CustomerListResponseContract,
  CustomerResponseContract,
} from './customers.contracts';
import {
  CustomerDetailRecord,
  CustomerListRecord,
  CustomersRepository,
} from './customers.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { VoidCustomerDto } from './dto/void-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly customersRepository: CustomersRepository,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  async listCustomers(
    user: AuthenticatedUser,
  ): Promise<CustomerListResponseContract> {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Tenant scope is required.');
    }

    const canSeeAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );

    if (!canSeeAllBranches && !user.branchId) {
      return { customers: [] };
    }

    const customers = await this.customersRepository.listForScope({
      tenantId: user.tenantId,
      branchId: canSeeAllBranches ? null : user.branchId,
    });

    const scoped = customers.filter((customer) => customer.branchId);
    const riskHits = await this.customersRepository.listRiskHits({
      tenantId: user.tenantId,
      customerIds: scoped.map((customer) => customer.id),
      nationalIds: scoped
        .map((customer) => customer.nationalId)
        .filter((value): value is string => Boolean(value?.trim())),
    });
    const riskCustomerIds = new Set(
      riskHits
        .map((hit) => hit.customerId)
        .filter((value): value is string => Boolean(value)),
    );
    const riskNationalIds = new Set(
      riskHits.map((hit) => hit.nationalId.trim().toUpperCase()),
    );

    return {
      customers: scoped.map((customer) =>
        this.toCustomerContract(customer, {
          riskHit:
            riskCustomerIds.has(customer.id) ||
            Boolean(
              customer.nationalId &&
                riskNationalIds.has(customer.nationalId.trim().toUpperCase()),
            ),
        }),
      ),
    };
  }

  async getCustomer(
    user: AuthenticatedUser,
    customerId: string,
  ): Promise<CustomerDetailResponseContract> {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Tenant scope is required.');
    }

    const canSeeAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );

    if (!canSeeAllBranches && !user.branchId) {
      throw new ForbiddenException('Branch scope is required.');
    }

    const customer = await this.customersRepository.findByIdForScope({
      tenantId: user.tenantId,
      branchId: canSeeAllBranches ? null : user.branchId,
      customerId,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const riskHits = await this.customersRepository.listRiskHits({
      tenantId: user.tenantId,
      customerIds: [customer.id],
      nationalIds: customer.nationalId ? [customer.nationalId] : [],
    });

    return {
      customer: await this.toCustomerDetailContract(customer, {
        riskHit: riskHits.length > 0,
      }),
    };
  }

  async createCustomer(
    user: AuthenticatedUser,
    dto: CreateCustomerDto,
  ): Promise<CustomerResponseContract> {
    if (!user.branchId) {
      throw new ForbiddenException(
        'Customer registration requires a branch assignment.',
      );
    }

    const phone = normalizeInternationalPhoneNumber(dto.phone);

    if (!isInternationalPhoneNumber(phone)) {
      throw new BadRequestException(
        'phone must be a valid international phone number.',
      );
    }

    const existing = await this.customersRepository.findByTenantAndPhone({
      tenantId: user.tenantId,
      phone,
    });

    if (existing) {
      throw new ConflictException(
        'A customer with this phone already exists in this account.',
      );
    }

    const customer = await this.customersRepository.createWithAuditAndOutbox({
      tenantId: user.tenantId,
      branchId: user.branchId,
      actorUserId: user.userId,
      fullName: dto.fullName.trim(),
      phone,
      nationalId: dto.nationalId?.trim() || null,
      email: dto.email ? normalizeEmailAddress(dto.email) : null,
    });

    return {
      customer: this.toCustomerContract(customer),
    };
  }

  async voidCustomer(
    user: AuthenticatedUser,
    customerId: string,
    dto: VoidCustomerDto,
  ): Promise<CustomerResponseContract> {
    const customer = await this.requireOwnedCustomer(user, customerId);
    this.assertOwner(user);

    if (customer.voidedAt && customer.voidDisposition === dto.disposition) {
      throw new ConflictException('This client is already set aside.');
    }

    const updated = await this.customersRepository.voidCustomer({
      tenantId: user.tenantId,
      customerId: customer.id,
      actorUserId: user.userId,
      disposition: dto.disposition,
      reason: dto.reason?.trim() || null,
      fullName: customer.fullName,
      phone: customer.phone,
      nationalId: customer.nationalId,
      branchId: customer.branchId,
    });

    return { customer: this.toCustomerContract(updated) };
  }

  async restoreCustomer(
    user: AuthenticatedUser,
    customerId: string,
  ): Promise<CustomerResponseContract> {
    const customer = await this.requireOwnedCustomer(user, customerId);
    this.assertOwner(user);

    if (!customer.voidedAt) {
      throw new BadRequestException('This client is not set aside.');
    }

    const updated = await this.customersRepository.restoreCustomer({
      tenantId: user.tenantId,
      customerId: customer.id,
      actorUserId: user.userId,
    });

    return { customer: this.toCustomerContract(updated) };
  }

  private assertOwner(user: AuthenticatedUser) {
    if (!user.permissions.includes(BRANCH_PERMISSIONS.create)) {
      throw new ForbiddenException(
        'Only the account owner can void or restore clients.',
      );
    }
  }

  private async requireOwnedCustomer(
    user: AuthenticatedUser,
    customerId: string,
  ) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Tenant scope is required.');
    }

    const customer = await this.customersRepository.findByIdForScope({
      tenantId: user.tenantId,
      branchId: null,
      customerId,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    return customer;
  }

  private toCustomerContract(
    customer: Customer | CustomerListRecord | CustomerDetailRecord,
    options?: { riskHit?: boolean },
  ): CustomerApiContract {
    const latestApplication = this.latestApplication(customer);
    const registeredBy = this.registeredBy(customer);
    return {
      id: customer.id,
      branchId: customer.branchId ?? '',
      branchName: this.branchName(customer),
      fullName: customer.fullName,
      phone: customer.phone,
      nationalId: customer.nationalId,
      email: customer.email,
      businessName: this.businessName(latestApplication),
      collateralType: this.collateralType(latestApplication),
      city: this.city(latestApplication),
      loanCount: this.loanCount(customer),
      activeLoanCount: this.activeLoanCount(customer),
      activeLoanId: this.activeLoanId(customer),
      hasOverdueLoan: this.hasOverdueLoan(customer),
      registeredByName: registeredBy.name,
      registeredByPublicId: registeredBy.publicId,
      verifiedAt: customer.verifiedAt?.toISOString() ?? null,
      verificationStatus: this.resolveVerificationStatus(
        customer,
        options?.riskHit ?? false,
      ),
      voidedAt: customer.voidedAt?.toISOString() ?? null,
      voidDisposition: customer.voidDisposition ?? null,
      voidReason: customer.voidReason ?? null,
      createdAt: customer.createdAt.toISOString(),
    };
  }

  private resolveVerificationStatus(
    customer: Customer | CustomerListRecord | CustomerDetailRecord,
    riskHit: boolean,
  ): CustomerApiContract['verificationStatus'] {
    if (riskHit) return 'ISSUE';

    const applications =
      'loanApplications' in customer && Array.isArray(customer.loanApplications)
        ? customer.loanApplications
        : [];

    if (
      applications.some(
        (application) =>
          'status' in application && application.status === 'REJECTED',
      )
    ) {
      return 'ISSUE';
    }

    if (customer.verifiedAt) return 'VERIFIED';

    if (
      applications.some(
        (application) =>
          ('verifiedAt' in application && application.verifiedAt) ||
          ('status' in application &&
            (application.status === 'VERIFIED' ||
              application.status === 'SUBMITTED')),
      )
    ) {
      // SUBMITTED means NIN already passed Smile — treat as verified identity.
      return 'VERIFIED';
    }

    return 'NOT_VERIFIED';
  }

  private async toCustomerDetailContract(
    customer: CustomerDetailRecord,
    options?: { riskHit?: boolean },
  ): Promise<CustomerDetailContract> {
    const recentPayments = customer.loans
      .flatMap((loan) =>
        loan.repayments.map((repayment) => ({
          id: repayment.id,
          loanId: loan.id,
          amount: this.decimalToNumber(repayment.amount) ?? 0,
          method: repayment.method,
          paidAt: repayment.paidAt.toISOString(),
          recordedByName: repayment.recordedBy.displayName,
          recordedByPublicId: repayment.recordedBy.publicId ?? null,
          note: repayment.note,
        })),
      )
      .sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt))
      .slice(0, 12);

    const addressSource =
      this.latestApplication(customer) ??
      customer.loans.find((loan) => loan.application)?.application ??
      null;

    return {
      ...this.toCustomerContract(customer, options),
      branchName: customer.branch?.name ?? null,
      district: addressSource?.district?.trim() || null,
      subCounty: addressSource?.subCounty?.trim() || null,
      parish: addressSource?.parish?.trim() || null,
      village: addressSource?.village?.trim() || null,
      loans: customer.loans.map((loan) => {
        const paidAmount = this.roundMoney(
          loan.repayments.reduce(
            (sum, repayment) =>
              sum + (this.decimalToNumber(repayment.amount) ?? 0),
            0,
          ),
        );
        const lastPayment = loan.repayments[0] ?? null;

        const principal = this.decimalToNumber(loan.principal) ?? 0;
        const balance = this.decimalToNumber(loan.balance) ?? 0;
        const openingBalance = this.decimalToNumber(loan.wallet?.openingBalance);
        const finesTotal = this.decimalToNumber(loan.finesTotal) ?? 0;
        const rate =
          this.decimalToNumber(loan.application?.interestRatePercent) ?? 0;
        const fee =
          this.decimalToNumber(loan.application?.processingFee) ?? 0;
        const days = loan.application?.durationDays ?? 1;
        const priced = computeLoanPricing({
          principalAmount: principal,
          interestRatePercent: rate,
          durationDays: days > 0 ? days : 1,
          processingFee: fee,
        });
        const baseRepayable = resolveBaseRepayable({
          openingBalance,
          pricedTotal: priced.totalRepayable,
          principal,
          paidAmount,
          balance,
          finesTotal,
        });
        const totalRepayable = this.roundMoney(baseRepayable + finesTotal);

        return {
          id: loan.id,
          applicationId: loan.application?.id ?? null,
          status: loan.status,
          currency: loan.currency,
          principal,
          balance,
          openingBalance,
          finesTotal,
          totalRepayable,
          isFined: loan.isFined || (loan.wallet?.isFined ?? false),
          disbursedAt: loan.disbursedAt?.toISOString() ?? null,
          paymentStartDate: loan.paymentStartDate?.toISOString() ?? null,
          createdAt: loan.createdAt.toISOString(),
          updatedAt: loan.updatedAt.toISOString(),
          officerName: loan.application?.officer.displayName ?? null,
          officerPublicId: loan.application?.officer.publicId ?? null,
          loanTypeName: this.loanTypeName(loan.application),
          businessName: this.businessName(loan.application),
          collateralType: this.collateralType(loan.application),
          city: this.city(loan.application),
          repaymentsCount: loan.repayments.length,
          paidAmount,
          lastPaymentAt: lastPayment?.paidAt.toISOString() ?? null,
        };
      }),
      documents: await this.customerDocuments(customer),
      recentPayments,
    };
  }

  private async customerDocuments(
    customer: CustomerDetailRecord,
  ): Promise<CustomerDocumentContract[]> {
    type DocumentWithStorage = CustomerDocumentContract & {
      storageKey: string;
    };

    const applicationById = new Map<
      string,
      {
        id: string;
        loanPurpose?: string | null;
        collateralType?: string | null;
        media?: Array<{
          id: string;
          type: string;
          storageKey: string;
          mimeType: string;
          byteSize: number;
          fileName: string | null;
          createdAt: Date;
        }>;
      }
    >();
    const loanByApplicationId = new Map<string, string>();

    for (const application of customer.loanApplications) {
      applicationById.set(application.id, application);
    }

    for (const loan of customer.loans) {
      if (!loan.application) continue;
      loanByApplicationId.set(loan.application.id, loan.id);
      applicationById.set(loan.application.id, loan.application);
    }

    const baseDocuments: DocumentWithStorage[] = [];
    for (const application of applicationById.values()) {
      for (const media of application.media ?? []) {
        baseDocuments.push({
          id: media.id,
          applicationId: application.id,
          loanId: loanByApplicationId.get(application.id) ?? null,
          type: media.type,
          mimeType: media.mimeType,
          byteSize: media.byteSize,
          fileName: media.fileName,
          createdAt: media.createdAt.toISOString(),
          businessName: this.businessName(application),
          collateralType: this.collateralType(application),
          downloadUrl: null,
          storageKey: media.storageKey,
        });
      }
    }

    const documents = await Promise.all(
      baseDocuments.map(async ({ storageKey, ...document }) => {
        try {
          const signed = await this.objectStorage.presignGet({ storageKey });
          return { ...document, downloadUrl: signed.downloadUrl };
        } catch {
          return document;
        }
      }),
    );

    return documents.sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
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

  private branchName(
    customer: Customer | CustomerListRecord | CustomerDetailRecord,
  ) {
    return 'branch' in customer ? (customer.branch?.name ?? null) : null;
  }

  private latestApplication(
    customer: Customer | CustomerListRecord | CustomerDetailRecord,
  ) {
    if (!('loanApplications' in customer) || !customer.loanApplications.length) {
      return null;
    }
    return [...customer.loanApplications].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    )[0];
  }

  private registeredBy(
    customer: Customer | CustomerListRecord | CustomerDetailRecord,
  ): { name: string | null; publicId: string | null } {
    if (!('loanApplications' in customer)) {
      return { name: null, publicId: null };
    }
    const withOfficer = [...customer.loanApplications]
      .filter((app) => app.officer?.displayName)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    return {
      name: withOfficer?.officer?.displayName ?? null,
      publicId: withOfficer?.officer?.publicId ?? null,
    };
  }

  private businessName(
    application:
      | {
          loanPurpose?: string | null;
        }
      | null
      | undefined,
  ) {
    return application?.loanPurpose?.trim() || null;
  }

  private loanTypeName(
    application:
      | {
          templateName?: string | null;
          loanProductTemplate?: { name: string } | null;
        }
      | null
      | undefined,
  ) {
    return (
      application?.templateName?.trim() ||
      application?.loanProductTemplate?.name.trim() ||
      null
    );
  }

  private collateralType(
    application:
      | {
          collateralType?: string | null;
        }
      | null
      | undefined,
  ) {
    return application?.collateralType?.trim() || null;
  }

  private city(
    application:
      | {
          district?: string | null;
          subCounty?: string | null;
          parish?: string | null;
          village?: string | null;
        }
      | null
      | undefined,
  ) {
    return (
      application?.district?.trim() ||
      application?.subCounty?.trim() ||
      application?.parish?.trim() ||
      application?.village?.trim() ||
      null
    );
  }

  private loanCount(
    customer: Customer | CustomerListRecord | CustomerDetailRecord,
  ) {
    if ('_count' in customer) return customer._count.loans;
    if ('loans' in customer) return customer.loans.length;
    return 0;
  }

  private activeLoanCount(
    customer: Customer | CustomerListRecord | CustomerDetailRecord,
  ) {
    if (!('loans' in customer) || !Array.isArray(customer.loans)) {
      return 0;
    }
    return customer.loans.filter((loan) =>
      ACTIVE_LOAN_STATUSES.has(String(loan.status)),
    ).length;
  }

  private activeLoanId(
    customer: Customer | CustomerListRecord | CustomerDetailRecord,
  ): string | null {
    if (!('loans' in customer) || !Array.isArray(customer.loans)) {
      return null;
    }
    const active = customer.loans.find((loan) =>
      ACTIVE_LOAN_STATUSES.has(String(loan.status)),
    );
    return active?.id ?? null;
  }

  private hasOverdueLoan(
    customer: Customer | CustomerListRecord | CustomerDetailRecord,
  ) {
    if (!('loans' in customer) || !Array.isArray(customer.loans)) {
      return false;
    }
    return customer.loans.some(
      (loan) =>
        String(loan.status) === 'IN_ARREARS' ||
        ('isFined' in loan && Boolean(loan.isFined)),
    );
  }
}

const ACTIVE_LOAN_STATUSES = new Set([
  'SUBMITTED',
  'APPROVED',
  'DISBURSED',
  'CURRENT',
  'IN_ARREARS',
  'RESTRUCTURED',
]);
