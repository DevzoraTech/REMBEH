import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { BorrowerOnboardingSetupService } from './setup.service';

describe('borrower onboarding setup', () => {
  const user = {
    userId: 'user',
    tenantId: 'tenant',
    branchId: 'branch',
    email: 'manager@example.test',
    displayName: 'Manager',
    permissions: [],
  } as AuthenticatedUser;
  const fields = [
    'full_name',
    'phone',
    'repayable',
    'outstanding',
    'date_issued',
  ];
  const store = {
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };
  const service = new BorrowerOnboardingSetupService({
    borrowerOnboardingSetup: store,
  } as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it('scopes reads to the signed-in branch and tenant', async () => {
    await service.get(user);
    expect(store.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant', branchId: 'branch' },
    });
  });

  it('requires a branch', async () => {
    await expect(
      service.get({ ...user, branchId: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects missing and unknown fields', async () => {
    await expect(
      service.save(user, { revision: 0, selectedFields: ['full_name'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.save(user, {
        revision: 0,
        selectedFields: [...fields, 'unknown'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to overwrite a changed revision', async () => {
    store.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.save(user, { revision: 2, selectedFields: fields }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(store.updateMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant',
      branchId: 'branch',
      revision: 2,
    });
  });

  it('creates a setup using the authenticated scope', async () => {
    store.create.mockResolvedValue({ revision: 1 });
    await service.save(user, {
      revision: 0,
      selectedFields: fields,
      branchId: 'another',
    });
    expect(store.create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant', branchId: 'branch', selectedFields: fields },
    });
  });
});
