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

    return {
      customers: customers
        .filter((customer) => customer.branchId)
        .map((customer) => this.toCustomerContract(customer)),
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

    return {
      customer: await this.toCustomerDetailContract(customer),
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

  private toCustomerContract(
    customer: Customer | CustomerListRecord | CustomerDetailRecord,
  ): CustomerApiContract {
    const latestApplication = this.latestApplication(customer);
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
      verifiedAt: customer.verifiedAt?.toISOString() ?? null,
      createdAt: customer.createdAt.toISOString(),
    };
  }

  private async toCustomerDetailContract(
    customer: CustomerDetailRecord,
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

    return {
      ...this.toCustomerContract(customer),
      branchName: customer.branch?.name ?? null,
      loans: customer.loans.map((loan) => {
        const paidAmount = this.roundMoney(
          loan.repayments.reduce(
            (sum, repayment) =>
              sum + (this.decimalToNumber(repayment.amount) ?? 0),
            0,
          ),
        );
        const lastPayment = loan.repayments[0] ?? null;

        return {
          id: loan.id,
          applicationId: loan.application?.id ?? null,
          status: loan.status,
          currency: loan.currency,
          principal: this.decimalToNumber(loan.principal) ?? 0,
          balance: this.decimalToNumber(loan.balance) ?? 0,
          openingBalance: this.decimalToNumber(loan.wallet?.openingBalance),
          finesTotal: this.decimalToNumber(loan.finesTotal) ?? 0,
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
    if ('loanApplications' in customer) {
      return customer.loanApplications[0] ?? null;
    }
    return null;
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
          village?: string | null;
        }
      | null
      | undefined,
  ) {
    return (
      application?.district?.trim() ||
      application?.subCounty?.trim() ||
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
}
