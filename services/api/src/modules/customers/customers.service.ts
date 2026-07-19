import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Customer } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  isInternationalPhoneNumber,
  normalizeEmailAddress,
  normalizeInternationalPhoneNumber,
} from '../../common/security/identity-normalization';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import {
  CustomerApiContract,
  CustomerListResponseContract,
  CustomerResponseContract,
} from './customers.contracts';
import { CustomersRepository } from './customers.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly customersRepository: CustomersRepository) {}

  async listCustomers(
    user: AuthenticatedUser,
  ): Promise<CustomerListResponseContract> {
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
        'A customer with this phone already exists in this workspace.',
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

  private toCustomerContract(customer: Customer): CustomerApiContract {
    return {
      id: customer.id,
      branchId: customer.branchId ?? '',
      fullName: customer.fullName,
      phone: customer.phone,
      nationalId: customer.nationalId,
      email: customer.email,
      verifiedAt: customer.verifiedAt,
      createdAt: customer.createdAt,
    };
  }
}
