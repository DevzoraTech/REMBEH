import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { OpeningRecordService } from './opening-record.service';
import { OperationsRepository } from '../operations/operations.repository';
import { OnboardingMediaService } from './onboarding-media.service';
import { ObjectStorageService } from '../storage/object-storage.service';

const databaseUrl = process.env.TEST_ONBOARDING_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('opening records in PostgreSQL', () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let user: AuthenticatedUser;
  let service: OpeningRecordService;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
      throw new Error(
        'Onboarding integration tests require a local disposable database.',
      );
    }
    pool = new Pool({ connectionString: databaseUrl });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    const tenant = await prisma.tenant.create({
      data: { name: 'Onboarding test', country: 'UG', currency: 'UGX' },
    });
    const branch = await prisma.branch.create({
      data: { tenantId: tenant.id, name: 'Test branch', address: 'Test' },
    });
    const officer = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        email: `${randomUUID()}@example.test`,
        displayName: 'Test manager',
      },
    });
    user = {
      userId: officer.id,
      tenantId: tenant.id,
      branchId: branch.id,
      email: officer.email,
      displayName: officer.displayName,
      permissions: [],
    };
    service = new OpeningRecordService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  it('saves a single opening loan and retries without creating cash transactions', async () => {
    const input = {
      requestId: randomUUID(),
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
      email: 'USER@example.test',
      gender: 'FEMALE',
      dateOfBirth: '1990-03-14',
      district: 'Kazo',
      village: 'Mishambya',
      loanPurpose: 'Business',
      guarantorName: 'Test Guarantor',
      guarantorPhone: '0701234571',
    };
    await expect(service.checkDuplicates(user, input)).resolves.toMatchObject({
      phoneExists: false,
      matchingNames: 0,
    });
    const created = await service.create(user, input);
    const listing = await service.list(user);
    expect(listing.total).toBe(1);
    expect(listing.records[0].customer?.fullName).toBe('TEST BORROWER');
    const otherBranch = await prisma.branch.create({
      data: { tenantId: user.tenantId, name: 'Other branch', address: 'Test' },
    });
    expect(
      (await service.list({ ...user, branchId: otherBranch.id })).total,
    ).toBe(0);
    await expect(service.checkDuplicates(user, input)).resolves.toMatchObject({
      alreadySaved: true,
    });
    await expect(
      service.checkDuplicates(user, { ...input, requestId: randomUUID() }),
    ).resolves.toMatchObject({ phoneExists: true, matchingNames: 1 });
    await expect(
      service.checkDuplicates(user, {
        ...input,
        requestId: randomUUID(),
        phone: '0701234570',
        fullName: 'test borrower',
      }),
    ).resolves.toMatchObject({ phoneExists: false, matchingNames: 1 });
    await expect(
      service.create(user, {
        ...input,
        requestId: randomUUID(),
        phone: '0701234570',
      }),
    ).rejects.toThrow('name already exists');
    const retried = await service.create(user, input);
    expect(retried).toMatchObject({
      customerId: created.customerId,
      loanId: created.loanId,
      replayed: true,
    });
    const loan = await prisma.loan.findUniqueOrThrow({
      where: { id: created.loanId },
      include: {
        application: true,
        wallet: true,
        repayments: true,
        disbursements: true,
      },
    });
    expect(loan.balance.toString()).toBe('90000');
    expect(loan.wallet?.openingBalance.toString()).toBe('120000');
    expect(loan.application?.isOpeningMigration).toBe(true);
    expect(loan.application).toMatchObject({
      gender: 'FEMALE',
      district: 'Kazo',
      village: 'Mishambya',
      loanPurpose: 'Business',
    });
    expect(
      (
        await prisma.customer.findUniqueOrThrow({
          where: { id: created.customerId },
        })
      ).email,
    ).toBe('user@example.test');
    expect(
      await prisma.loanApplicationGuarantor.findUnique({
        where: { loanApplicationId: loan.application!.id },
      }),
    ).toMatchObject({ fullName: 'TEST GUARANTOR', phone: '+256701234571' });
    expect(loan.repayments).toHaveLength(0);
    expect(loan.disbursements).toHaveLength(1);
    expect(loan.disbursements[0].isOpeningMigration).toBe(true);
    const operations = new OperationsRepository(
      prisma as unknown as PrismaService,
    );
    const reportScope = { tenantId: user.tenantId, branchId: user.branchId! };
    const beforeImport = await operations.listPortfolioLoansAsOf({
      ...reportScope,
      dayEnd: new Date('2025-12-31T23:59:59.999Z'),
    });
    expect(beforeImport.some((item) => item.id === created.loanId)).toBe(false);
    const afterImport = await operations.listPortfolioLoansAsOf({
      ...reportScope,
      dayEnd: new Date(Date.now() + 60_000),
    });
    expect(
      afterImport.find((item) => item.id === created.loanId)?.application
        ?.isOpeningMigration,
    ).toBe(true);
    await expect(
      service.create(user, { ...input, outstanding: '80000' }),
    ).rejects.toThrow('request ID');
    await expect(
      service.create(user, { ...input, requestId: randomUUID() }),
    ).rejects.toThrow('already exists');
    expect(
      await prisma.loan.count({ where: { branchId: user.branchId! } }),
    ).toBe(1);
  });

  it('never creates duplicate loans for simultaneous retries', async () => {
    const input = {
      requestId: randomUUID(),
      fullName: 'Concurrent Borrower',
      phone: '0701234568',
      issueDate: '2025-01-01',
      paymentStartDate: '2025-01-02',
      principal: '100000',
      repayable: '120000',
      outstanding: '90000',
      flatInterestPercent: '20',
      durationDays: 30,
      repaymentFrequency: 'DAILY',
    };
    const attempts = await Promise.allSettled([
      service.create(user, input),
      service.create(user, input),
    ]);
    expect(attempts.some((result) => result.status === 'fulfilled')).toBe(true);
    const replay = await service.create(user, input);
    expect(replay.replayed).toBe(true);
    expect(
      await prisma.customer.count({
        where: { branchId: user.branchId!, phone: '+256701234568' },
      }),
    ).toBe(1);
    expect(
      await prisma.borrowerOnboardingReceipt.count({
        where: {
          tenantId: user.tenantId,
          branchId: user.branchId!,
          requestId: input.requestId,
        },
      }),
    ).toBe(1);
  });

  it('detects legacy spacing and case differences in identity fields', async () => {
    await prisma.customer.create({
      data: {
        tenantId: user.tenantId,
        branchId: user.branchId!,
        fullName: '  Older   Borrower  ',
        phone: '+256 701 234 599',
        nationalId: 'Cf 68065102px6L',
      },
    });
    const input = {
      requestId: randomUUID(),
      fullName: 'older borrower',
      phone: '0701234599',
      nationalId: 'CF68065102PX6L',
      issueDate: '2025-01-01',
      paymentStartDate: '2025-01-02',
      principal: '100000',
      repayable: '120000',
      outstanding: '90000',
      flatInterestPercent: '20',
      durationDays: 30,
      repaymentFrequency: 'DAILY',
    };
    await expect(service.checkDuplicates(user, input)).resolves.toMatchObject({
      phoneExists: true,
      nationalIdExists: true,
      matchingNames: 1,
    });
    await expect(service.create(user, input)).rejects.toThrow('already exists');
  });

  it('links a verified onboarding attachment to its branch loan', async () => {
    const input = { requestId: randomUUID(), fullName: 'Image Borrower', phone: '0701234598', issueDate: '2025-01-01', paymentStartDate: '2025-01-02', principal: '100000', repayable: '120000', outstanding: '90000', flatInterestPercent: '20', durationDays: 30, repaymentFrequency: 'DAILY' };
    const loan = await service.create(user, input);
    const storage = { buildObjectKey: jest.fn(() => `test/${randomUUID()}`), presignPut: jest.fn().mockResolvedValue({ uploadUrl: 'https://storage.example.test/file', expiresInSeconds: 900 }), inspectObject: jest.fn().mockResolvedValue({ byteSize: 100, mimeType: 'image/jpeg', etag: 'etag' }), readObjectPrefix: jest.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0])), copyObjectIfUnchanged: jest.fn() };
    const media = new OnboardingMediaService(prisma as unknown as PrismaService, storage as unknown as ObjectStorageService);
    const prepared = await media.prepare(user, loan.loanId, { mediaType: 'PASSPORT', mimeType: 'image/jpeg', byteSize: 100, fileName: 'photo.jpg' });
    await expect(media.confirm(user, loan.loanId, prepared.uploadId)).resolves.toEqual({ confirmed: true });
    await expect(media.confirm(user, loan.loanId, prepared.uploadId)).resolves.toEqual({ confirmed: true });
    const application = await prisma.loanApplication.findUniqueOrThrow({ where: { loanId: loan.loanId }, include: { media: true } });
    expect(application.media).toHaveLength(1);
    expect(application.media[0]).toMatchObject({ type: 'PASSPORT', mimeType: 'image/jpeg', byteSize: 100 });
    expect(storage.copyObjectIfUnchanged).toHaveBeenCalledTimes(1);
  });
});
