import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { OpeningRecordService } from './opening-record.service';

describe('opening record', () => {
  const user: AuthenticatedUser = {
    userId: 'officer',
    tenantId: 'tenant',
    branchId: 'branch',
    email: 'manager@example.test',
    displayName: 'Manager',
    permissions: [],
  };
  const input = {
    requestId: 'dffea409-9b5a-4408-8451-3f264a2af7b3',
    fullName: 'Test Borrower',
    phone: '0701234567',
    issueDate: '2025-01-01',
    paymentStartDate: '2025-01-02',
    principal: '100000',
    repayable: '120000',
    outstanding: '90000',
    flatInterestPercent: '20',
    durationDays: 30,
    repaymentFrequency: 'DAILY',
  };
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn((sql: TemplateStringsArray) =>
      Promise.resolve(
        sql[0].includes('SELECT id FROM branches')
          ? [{ id: 'branch' }]
          : [{ phones: 0n, identities: 0n, names: 0n }],
      ),
    ),
    borrowerOnboardingReceipt: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    customer: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'customer' }),
    },
    loan: { create: jest.fn().mockResolvedValue({ id: 'loan' }) },
    loanApplication: {
      create: jest.fn().mockResolvedValue({ id: 'application' }),
    },
    clientWallet: { create: jest.fn() },
    loanDisbursement: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const db = {
    borrowerOnboardingReceipt: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn((fn: (arg: typeof tx) => unknown) => fn(tx)),
  };
  const service = new OpeningRecordService(db as unknown as PrismaService);
  beforeEach(() => jest.clearAllMocks());

  it('creates a branch-scoped opening loan with no invented repayment', async () => {
    await expect(service.create(user, input)).resolves.toEqual({
      customerId: 'customer',
      loanId: 'loan',
      status: 'COMPLETE',
      replayed: false,
    });
    expect(tx.customer.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 'tenant',
      branchId: 'branch',
      fullName: 'TEST BORROWER',
      phone: '+256701234567',
    });
    expect(tx.loanApplication.create.mock.calls[0][0].data).toMatchObject({
      isOpeningMigration: true,
      repaymentFrequency: 'DAILY',
    });
    expect(tx.borrowerOnboardingReceipt.create).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid dates and inconsistent balances before writing', async () => {
    await expect(
      service.create(user, { ...input, issueDate: '2025-02-30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(user, { ...input, outstanding: '130000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects separate names that do not match the borrower identity', async () => {
    await expect(
      service.create(user, {
        ...input,
        givenNames: 'Test Borrower',
        surname: 'Borrower',
      }),
    ).rejects.toThrow('must match the full name');
    await expect(
      service.create(user, { ...input, approvalDate: '2025-01-02' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('accepts a surname-first full name without repeating names', async () => {
    await service.create(user, { ...input, fullName: 'Borrower Test', givenNames: 'Test', surname: 'Borrower' });
    expect(tx.loanApplication.create.mock.calls[0][0].data).toMatchObject({ givenNames: 'TEST', surname: 'BORROWER' });
  });

  it('does not create another borrower when the identity already exists', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 'branch' }])
      .mockResolvedValueOnce([{ phones: 1n, identities: 0n, names: 0n }]);
    await expect(service.create(user, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.customer.create).not.toHaveBeenCalled();
  });

  it('returns the original result on a retry with the same request ID', async () => {
    await service.create(user, input);
    const receipt = tx.borrowerOnboardingReceipt.create.mock.calls[0][0].data;
    db.borrowerOnboardingReceipt.findUnique.mockResolvedValueOnce(receipt);
    await expect(service.create(user, input)).resolves.toEqual({
      customerId: 'customer',
      loanId: 'loan',
      status: 'COMPLETE',
      replayed: true,
    });
    expect(tx.customer.create).toHaveBeenCalledTimes(1);
  });
});
