import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BorrowerListType, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  isInternationalPhoneNumber,
  normalizeInternationalPhoneNumber,
} from '../../common/security/identity-normalization';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import {
  BorrowerListEntryContract,
  BorrowerListListResponseContract,
  BorrowerListResponseContract,
} from './borrower-lists.contracts';
import {
  BorrowerListEntryRecord,
  BorrowerListsRepository,
} from './borrower-lists.repository';
import {
  CreateBorrowerListEntryDto,
  UpdateBorrowerListEntryDto,
} from './dto/borrower-list-entry.dto';

@Injectable()
export class BorrowerListsService {
  constructor(private readonly repository: BorrowerListsRepository) {}

  async listEntries(
    user: AuthenticatedUser,
    type?: string,
  ): Promise<BorrowerListListResponseContract> {
    this.requireTenant(user);
    const parsedType = this.parseType(type);
    const scope = this.branchScopeForRead(user);

    if (scope.blocked) {
      return { entries: [] };
    }

    const entries = await this.repository.list({
      tenantId: user.tenantId,
      branchId: scope.branchId,
      type: parsedType,
    });

    return { entries: entries.map((entry) => this.toContract(entry)) };
  }

  async saveEntry(
    user: AuthenticatedUser,
    dto: CreateBorrowerListEntryDto,
  ): Promise<BorrowerListResponseContract> {
    this.requireTenant(user);
    const scope = this.branchScopeForWrite(user);

    let fullName = dto.fullName?.trim() || null;
    let phone = dto.phone ? this.normalizePhone(dto.phone) : null;
    let nationalId = this.normalizeNationalId(dto.nationalId);
    let customerId = dto.customerId ?? null;
    let branchId = scope.branchId;

    if (customerId) {
      const customer = await this.repository.findCustomerForScope({
        tenantId: user.tenantId,
        branchId: scope.canSeeAllBranches ? null : scope.branchId,
        customerId,
      });

      if (!customer) {
        throw new NotFoundException('Borrower was not found.');
      }

      if (customer.nationalId?.trim()) {
        const customerNationalId = this.normalizeNationalId(
          customer.nationalId,
        );
        if (nationalId !== customerNationalId) {
          throw new BadRequestException(
            'National ID must match the selected borrower.',
          );
        }
        nationalId = customerNationalId;
      }

      fullName = fullName || customer.fullName;
      phone = phone || customer.phone;
      branchId = customer.branchId ?? branchId;
      customerId = customer.id;
    }

    const existing = await this.repository.findByNationalId({
      tenantId: user.tenantId,
      nationalId,
    });
    if (
      existing &&
      !scope.canSeeAllBranches &&
      existing.branchId !== scope.branchId
    ) {
      throw new ConflictException('This national ID is already listed.');
    }

    const entry = await this.repository.saveWithAuditAndOutbox({
      tenantId: user.tenantId,
      branchId,
      customerId,
      actorUserId: user.userId,
      type: dto.type,
      fullName,
      nationalId,
      phone,
      reason: dto.reason?.trim() || null,
    });

    return { entry: this.toContract(entry) };
  }

  async updateEntry(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateBorrowerListEntryDto,
  ): Promise<BorrowerListResponseContract> {
    this.requireTenant(user);
    const scope = this.branchScopeForWrite(user);
    const entry = await this.repository.findById({
      tenantId: user.tenantId,
      branchId: scope.canSeeAllBranches ? null : scope.branchId,
      id,
    });

    if (!entry) {
      throw new NotFoundException('Entry was not found.');
    }

    const data: Prisma.BorrowerListEntryUpdateInput = {
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.fullName !== undefined
        ? { fullName: dto.fullName.trim() || null }
        : {}),
      ...(dto.phone !== undefined
        ? { phone: dto.phone ? this.normalizePhone(dto.phone) : null }
        : {}),
      ...(dto.reason !== undefined
        ? { reason: dto.reason.trim() || null }
        : {}),
    };

    const updated = await this.repository.updateWithAuditAndOutbox({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      entry,
      data,
    });

    return { entry: this.toContract(updated) };
  }

  async removeEntry(user: AuthenticatedUser, id: string) {
    this.requireTenant(user);
    const scope = this.branchScopeForWrite(user);
    const entry = await this.repository.findById({
      tenantId: user.tenantId,
      branchId: scope.canSeeAllBranches ? null : scope.branchId,
      id,
    });

    if (!entry) {
      throw new NotFoundException('Entry was not found.');
    }

    await this.repository.removeWithAuditAndOutbox({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      entry,
    });

    return { removed: true };
  }

  async assertCanReceiveLoan(user: AuthenticatedUser, nationalId: string) {
    this.requireTenant(user);
    const normalized = this.normalizeNationalId(nationalId);
    const entry = await this.repository.findByNationalId({
      tenantId: user.tenantId,
      nationalId: normalized,
    });

    if (entry?.type === BorrowerListType.BLACKLISTED) {
      throw new ConflictException('This borrower cannot receive a new loan.');
    }
  }

  private requireTenant(user: AuthenticatedUser) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Account access is required.');
    }
  }

  private branchScopeForRead(
    user: AuthenticatedUser,
  ):
    | { blocked: true; branchId?: never }
    | { blocked: false; branchId: string | null } {
    const canSeeAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );

    if (canSeeAllBranches) {
      return { blocked: false, branchId: null };
    }

    if (!user.branchId) {
      return { blocked: true };
    }

    return { blocked: false, branchId: user.branchId };
  }

  private branchScopeForWrite(user: AuthenticatedUser) {
    const canSeeAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );

    if (!canSeeAllBranches && !user.branchId) {
      throw new ForbiddenException('Branch access is required.');
    }

    return {
      canSeeAllBranches,
      branchId: canSeeAllBranches ? null : user.branchId!,
    };
  }

  private parseType(type?: string): BorrowerListType | null {
    if (!type) return null;
    if (type === BorrowerListType.BLACKLISTED) {
      return BorrowerListType.BLACKLISTED;
    }
    if (type === BorrowerListType.WATCHLIST) {
      return BorrowerListType.WATCHLIST;
    }
    throw new BadRequestException('Unknown list type.');
  }

  private normalizeNationalId(nationalId: string) {
    const normalized = nationalId.trim().toUpperCase();
    if (normalized.length < 5) {
      throw new BadRequestException('National ID is required.');
    }
    return normalized;
  }

  private normalizePhone(phone: string) {
    const normalized = normalizeInternationalPhoneNumber(phone);
    if (!isInternationalPhoneNumber(normalized)) {
      throw new BadRequestException(
        'phone must be a valid international phone number.',
      );
    }
    return normalized;
  }

  private toContract(
    entry: BorrowerListEntryRecord,
  ): BorrowerListEntryContract {
    return {
      id: entry.id,
      type: entry.type,
      borrowerName: entry.fullName,
      nationalId: entry.nationalId,
      phone: entry.phone,
      reason: entry.reason,
      customerId: entry.customerId,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
