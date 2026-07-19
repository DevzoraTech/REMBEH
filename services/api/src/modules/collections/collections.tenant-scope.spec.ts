import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  CollectionsRepository,
  requireTenantId,
} from './collections.repository';
import { CollectionsService } from './collections.service';

describe('collections tenant scope', () => {
  it('requireTenantId rejects missing tenant', () => {
    expect(() => requireTenantId(undefined)).toThrow(BadRequestException);
    expect(() => requireTenantId('')).toThrow(BadRequestException);
    expect(() => requireTenantId('   ')).toThrow(BadRequestException);
  });

  it('requireTenantId returns trimmed tenant id', () => {
    expect(requireTenantId('  tenant-a  ')).toBe('tenant-a');
  });

  it('branchScope always includes tenantId from auth input', () => {
    const repository = new CollectionsRepository({} as never);
    expect(
      repository.branchScope({ tenantId: 'tenant-a', branchId: 'branch-1' }),
    ).toEqual({ tenantId: 'tenant-a', branchId: 'branch-1' });
    expect(
      repository.branchScope({ tenantId: 'tenant-a', branchId: null }),
    ).toEqual({ tenantId: 'tenant-a' });
    expect(() =>
      repository.branchScope({ tenantId: '', branchId: 'branch-1' }),
    ).toThrow(BadRequestException);
  });

  it('searchClients refuses users without tenantId', async () => {
    const repository = {
      searchLoans: jest.fn(),
    };
    const service = new CollectionsService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.searchClients(
        {
          userId: 'user-1',
          tenantId: '',
          branchId: 'branch-1',
          email: 'a@example.com',
          displayName: 'Agent',
          permissions: ['collection.read'],
        },
        '0700123456',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.searchLoans).not.toHaveBeenCalled();
  });

  it('searchClients passes auth tenantId into searchLoans', async () => {
    const repository = {
      searchLoans: jest.fn().mockResolvedValue([]),
    };
    const service = new CollectionsService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.searchClients(
      {
        userId: 'user-1',
        tenantId: 'tenant-a',
        branchId: 'branch-1',
        email: 'a@example.com',
        displayName: 'Agent',
        permissions: ['collection.read'],
      },
      '0700123456',
    );

    expect(repository.searchLoans).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        branchId: 'branch-1',
        query: '0700123456',
      }),
    );
  });
});
