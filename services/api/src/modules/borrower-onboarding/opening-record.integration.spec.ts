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
import { LoanApplicationsRepository } from '../loan-applications/loan-applications.repository';
import { CollectionsRepository } from '../collections/collections.repository';

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
      givenNames: 'Test',
      surname: 'Borrower',
      phone: '0701234567',
      issueDate: '2025-01-01',
      approvalDate: '2024-12-30',
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
      loanProductName: 'Enterprise',
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
      where: { id: created.loanId! },
      include: {
        application: true,
        wallet: true,
        repayments: true,
        disbursements: true,
      },
    });
    expect(loan.balance.toString()).toBe('90000');
    expect(loan.approvedAt?.toISOString().slice(0, 10)).toBe('2024-12-30');
    expect(loan.wallet?.openingBalance.toString()).toBe('120000');
    expect(loan.application?.isOpeningMigration).toBe(true);
    expect(loan.application).toMatchObject({
      gender: 'FEMALE',
      district: 'Kazo',
      village: 'Mishambya',
      loanPurpose: 'Business',
      givenNames: 'TEST',
      surname: 'BORROWER',
      templateName: 'Enterprise',
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
    const input = {
      requestId: randomUUID(),
      fullName: 'Image Borrower',
      phone: '0701234598',
      issueDate: '2025-01-01',
      paymentStartDate: '2025-01-02',
      principal: '100000',
      repayable: '120000',
      outstanding: '90000',
      flatInterestPercent: '20',
      durationDays: 30,
      repaymentFrequency: 'DAILY',
    };
    const loan = await service.create(user, input);
    const storage = {
      buildObjectKey: jest.fn(() => `test/${randomUUID()}`),
      presignPut: jest.fn().mockResolvedValue({
        uploadUrl: 'https://storage.example.test/file',
        expiresInSeconds: 900,
      }),
      inspectObject: jest.fn().mockResolvedValue({
        byteSize: 100,
        mimeType: 'image/jpeg',
        etag: 'etag',
      }),
      readObjectPrefix: jest
        .fn()
        .mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0])),
      copyObjectIfUnchanged: jest.fn(),
    };
    const media = new OnboardingMediaService(
      prisma as unknown as PrismaService,
      storage as unknown as ObjectStorageService,
    );
    const prepared = await media.prepare(user, loan.loanId!, {
      mediaType: 'PASSPORT',
      mimeType: 'image/jpeg',
      byteSize: 100,
      fileName: 'photo.jpg',
    });
    await expect(
      media.confirm(user, loan.loanId!, prepared.uploadId),
    ).resolves.toEqual({ confirmed: true });
    await expect(
      media.confirm(user, loan.loanId!, prepared.uploadId),
    ).resolves.toEqual({ confirmed: true });
    const application = await prisma.loanApplication.findUniqueOrThrow({
      where: { loanId: loan.loanId! },
      include: { media: true },
    });
    expect(application.media).toHaveLength(1);
    expect(application.media[0]).toMatchObject({
      type: 'PASSPORT',
      mimeType: 'image/jpeg',
      byteSize: 100,
    });
    expect(storage.copyObjectIfUnchanged).toHaveBeenCalledTimes(1);
  });

  it('keeps an incomplete opening position without inventing a loan or repayment', async () => {
    const input = {
      requestId: randomUUID(),
      fullName: 'Incomplete Borrower',
      phone: '0701234597',
      issueDate: '2025-01-01',
      repayable: '120000',
      outstanding: '90000',
    };
    const saved = await service.create(user, input);
    expect(saved).toMatchObject({ loanId: null, status: 'NEEDS_LOAN_DETAILS' });
    expect(await service.create(user, input)).toMatchObject({
      customerId: saved.customerId,
      replayed: true,
    });
    const pending =
      await prisma.borrowerOnboardingPendingPosition.findUniqueOrThrow({
        where: { customerId: saved.customerId },
      });
    expect(pending.outstanding.toString()).toBe('90000');
    const collections = new CollectionsRepository(
      prisma as unknown as PrismaService,
    );
    const searchScope = { tenantId: user.tenantId, branchId: user.branchId! };
    const pendingByName = await collections.listPendingOnboardingClients({
      ...searchScope,
      query: 'incomplete',
    });
    expect(pendingByName.map((item) => item.customerId)).toContain(
      saved.customerId,
    );
    const pendingByPhone = await collections.listPendingOnboardingClients({
      ...searchScope,
      query: '0701234597',
    });
    expect(pendingByPhone.map((item) => item.customerId)).toContain(
      saved.customerId,
    );
    expect(
      await collections.listPendingOnboardingClients({
        tenantId: user.tenantId,
        branchId: randomUUID(),
        query: 'incomplete',
      }),
    ).toHaveLength(0);
    const beforeVersion =
      await collections.getOfflineSnapshotVersion(searchScope);
    expect(
      await prisma.loan.count({ where: { customerId: saved.customerId } }),
    ).toBe(0);
    const applications = new LoanApplicationsRepository(
      prisma as unknown as PrismaService,
    );
    expect(
      await applications.countActiveLoansForIdentity({
        tenantId: user.tenantId,
        phone: '+256701234597',
      }),
    ).toBe(1);
    expect(
      await applications.countActiveLoansForIdentity({
        tenantId: user.tenantId,
        phone: '0701234597',
      }),
    ).toBe(1);
    expect(
      (await service.list(user)).records.find(
        (record) => record.customerId === saved.customerId,
      )?.status,
    ).toBe('NEEDS_LOAN_DETAILS');
    const storage = {
      buildObjectKey: jest.fn(() => `test/${randomUUID()}`),
      presignPut: jest.fn().mockResolvedValue({
        uploadUrl: 'https://storage.example.test/file',
        expiresInSeconds: 900,
      }),
      inspectObject: jest.fn().mockResolvedValue({
        byteSize: 100,
        mimeType: 'image/jpeg',
        etag: 'etag',
      }),
      readObjectPrefix: jest
        .fn()
        .mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0])),
      copyObjectIfUnchanged: jest.fn(),
    };
    const media = new OnboardingMediaService(
      prisma as unknown as PrismaService,
      storage as unknown as ObjectStorageService,
    );
    const upload = await media.prepare(user, input.requestId, {
      mediaType: 'PASSPORT',
      mimeType: 'image/jpeg',
      byteSize: 100,
    });
    await media.confirm(user, input.requestId, upload.uploadId);
    expect(
      await prisma.borrowerOnboardingPendingMedia.count({
        where: { pendingId: pending.id },
      }),
    ).toBe(1);
    const product = await prisma.loanProductTemplate.create({ data: {
      tenantId: user.tenantId, branchId: user.branchId!, name: 'Daily business loan',
      interestRatePercent: 20, termValue: 30, termUnit: 'DAYS',
      repaymentFrequency: 'DAILY', processingFeePercent: 0, penaltyRatePercent: 0,
    } });
    const terms = {
      principal: '100000',
      flatInterestPercent: '20',
      durationDays: 30,
      repaymentFrequency: 'DAILY',
      paymentStartDate: '2025-01-02',
      loanProductName: 'Daily business loan',
      loanProductTemplateId: product.id,
    };
    const completed = await service.complete(user, input.requestId, terms);
    expect(completed).toMatchObject({
      customerId: saved.customerId,
      status: 'COMPLETE',
      replayed: false,
    });
    expect(await service.complete(user, input.requestId, terms)).toMatchObject({
      loanId: completed.loanId,
      replayed: true,
    });
    expect(
      await prisma.loan.count({ where: { customerId: saved.customerId } }),
    ).toBe(1);
    expect(
      (await collections.listPendingOnboardingClients(searchScope)).some(
        (item) => item.customerId === saved.customerId,
      ),
    ).toBe(false);
    const afterVersion =
      await collections.getOfflineSnapshotVersion(searchScope);
    expect(afterVersion.pendingCount).toBe(beforeVersion.pendingCount - 1);
    const application = await prisma.loanApplication.findUniqueOrThrow({
      where: { loanId: completed.loanId },
      include: { media: true },
    });
    expect(application.media).toHaveLength(1);
    expect(application.templateName).toBe('Daily business loan');
    expect(application.loanProductTemplateId).toBe(product.id);
  });

  it('only corrects a saved total after confirmation and preserves the outstanding balance', async () => {
    const input = {
      requestId: randomUUID(),
      fullName: 'Correction Borrower',
      phone: '0701234569',
      issueDate: '2025-01-01',
      repayable: '120000',
      outstanding: '90000',
    };
    const saved = await service.create(user, input);
    const terms = {
      principal: '100000',
      flatInterestPercent: '50',
      durationDays: 30,
      repaymentFrequency: 'DAILY',
      paymentStartDate: '2025-01-02',
    };
    await expect(
      service.complete(user, input.requestId, terms),
    ).rejects.toThrow('do not agree');
    await expect(
      service.complete(user, input.requestId, {
        ...terms,
        repayable: '150000',
        expectedRepayable: '119000',
        confirmRepayableCorrection: true,
      }),
    ).rejects.toThrow('has changed');
    await expect(
      service.complete(user, input.requestId, {
        ...terms,
        repayable: '150000',
        expectedRepayable: '120000',
      }),
    ).rejects.toThrow('original and corrected');
    await expect(
      service.complete(user, input.requestId, {
        ...terms,
        principal: '50000',
        flatInterestPercent: '60',
        repayable: '80000',
        expectedRepayable: '120000',
        confirmRepayableCorrection: true,
      }),
    ).rejects.toThrow('Outstanding balance cannot exceed');
    const completed = await service.complete(user, input.requestId, {
      ...terms,
      repayable: '150000',
      expectedRepayable: '120000',
      confirmRepayableCorrection: true,
    });
    const loan = await prisma.loan.findUniqueOrThrow({
      where: { id: completed.loanId },
      include: { wallet: true },
    });
    expect(loan.customerId).toBe(saved.customerId);
    expect(loan.balance.toString()).toBe('90000');
    expect(loan.wallet?.openingBalance.toString()).toBe('150000');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        tenantId: user.tenantId,
        entityId: completed.loanId,
        action: 'borrower_onboarding.completed',
      },
    });
    expect(audit.oldValue).toMatchObject({
      repayable: '120000',
      outstanding: '90000',
    });
    expect(audit.newValue).toMatchObject({
      repayable: '150000',
      outstanding: '90000',
    });
  });
  it('saves the selected branch loan product with a completed opening loan', async () => {
    const product = await prisma.loanProductTemplate.create({ data: {
      tenantId: user.tenantId, branchId: user.branchId!, name: 'Opening daily',
      interestRatePercent: 20, termValue: 30, termUnit: 'DAYS', repaymentFrequency: 'DAILY', processingFeePercent: 0, penaltyRatePercent: 0,
    } });
    const input = { requestId: randomUUID(), fullName: 'PRODUCT BORROWER', phone: '0701234581', issueDate: '2025-01-01', paymentStartDate: '2025-01-02', principal: '100000', repayable: '120000', outstanding: '90000', flatInterestPercent: '20', durationDays: 30, repaymentFrequency: 'DAILY', loanProductName: product.name, loanProductTemplateId: product.id };
    expect((await service.checkDuplicates(user, input)).phoneExists).toBe(false);
    const saved = await service.create(user, input);
    const application = await prisma.loanApplication.findUniqueOrThrow({ where: { loanId: saved.loanId! } });
    expect(application.loanProductTemplateId).toBe(product.id);
    expect(application.templateName).toBe(product.name);
  });
});
