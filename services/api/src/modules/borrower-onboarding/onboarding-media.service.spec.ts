import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { OnboardingMediaService } from './onboarding-media.service';

describe('onboarding attachment uploads', () => {
  const user: AuthenticatedUser = {
    userId: 'manager',
    tenantId: 'tenant',
    branchId: 'branch',
    email: 'a@example.test',
    displayName: 'Manager',
    permissions: [],
  };
  const upload = {
    id: 'upload',
    tenantId: 'tenant',
    branchId: 'branch',
    loanId: 'loan',
    applicationId: 'application',
    mediaType: 'PASSPORT',
    storageKey: 'temporary-key',
    mimeType: 'image/jpeg',
    byteSize: 100,
    fileName: 'photo.jpg',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    confirmedAt: null,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'application' }]),
    borrowerOnboardingUpload: { findFirst: jest.fn(), update: jest.fn() },
    loanApplicationMedia: { upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const db = {
    borrowerOnboardingReceipt: { findFirst: jest.fn() },
    loanApplication: { findFirst: jest.fn() },
    borrowerOnboardingUpload: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const storage = {
    buildObjectKey: jest.fn().mockReturnValue('final-key'),
    presignPut: jest.fn(),
    inspectObject: jest.fn(),
    readObjectPrefix: jest.fn(),
    copyObjectIfUnchanged: jest.fn(),
  };
  const service = new OnboardingMediaService(
    db as unknown as PrismaService,
    storage as unknown as ObjectStorageService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    tx.$queryRaw.mockResolvedValue([]);
    db.$transaction.mockImplementation((fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );
  });

  it('refuses unsupported types and files over 10 MB', async () => {
    await expect(
      service.prepare(user, 'loan', {
        mediaType: 'SIGNATURE_APPLICANT',
        mimeType: 'image/png',
        byteSize: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.prepare(user, 'loan', {
        mediaType: 'PASSPORT',
        mimeType: 'image/jpeg',
        byteSize: 11 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.presignPut).not.toHaveBeenCalled();
  });

  it('does not allow uploads for another branch or a non-onboarding loan', async () => {
    db.borrowerOnboardingReceipt.findFirst.mockResolvedValue(null);
    await expect(
      service.prepare(user, 'loan', {
        mediaType: 'PASSPORT',
        mimeType: 'image/jpeg',
        byteSize: 100,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.borrowerOnboardingReceipt.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant',
        branchId: 'branch',
        OR: [{ loanId: 'loan' }, { requestId: 'loan' }],
      },
    });
  });

  it('rejects missing or mismatched uploaded bytes before linking them', async () => {
    db.borrowerOnboardingUpload.findFirst.mockResolvedValue(upload);
    storage.inspectObject.mockResolvedValue({
      byteSize: 99,
      mimeType: 'image/jpeg',
      etag: 'etag',
    });
    await expect(
      service.confirm(user, 'loan', 'upload'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('links only a verified immutable copy', async () => {
    db.borrowerOnboardingUpload.findFirst.mockResolvedValue(upload);
    storage.inspectObject.mockResolvedValue({
      byteSize: 100,
      mimeType: 'image/jpeg',
      etag: 'etag',
    });
    storage.readObjectPrefix.mockResolvedValue(
      Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0]),
    );
    storage.buildObjectKey.mockReturnValue('final-key');
    tx.borrowerOnboardingUpload.findFirst
      .mockResolvedValueOnce(upload)
      .mockResolvedValueOnce(null);
    await expect(service.confirm(user, 'loan', 'upload')).resolves.toEqual({
      confirmed: true,
    });
    expect(storage.copyObjectIfUnchanged).toHaveBeenCalledWith(
      'temporary-key',
      'final-key',
      'etag',
    );
    expect(
      tx.loanApplicationMedia.upsert.mock.calls[0][0].create.storageKey,
    ).toBe('final-key');
  });

  it('rejects content that does not match the claimed file type', async () => {
    db.borrowerOnboardingUpload.findFirst.mockResolvedValue(upload);
    storage.inspectObject.mockResolvedValue({
      byteSize: 100,
      mimeType: 'image/jpeg',
      etag: 'etag',
    });
    storage.readObjectPrefix.mockResolvedValue(Buffer.from('notjpeg'));
    await expect(
      service.confirm(user, 'loan', 'upload'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.copyObjectIfUnchanged).not.toHaveBeenCalled();
  });
});
