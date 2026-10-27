import { LoanApplicationMediaType, LoanApplicationSignerRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LoanApplicationsRepository } from './loan-applications.repository';

describe('existing borrower signature reuse', () => {
  it('finds a locked applicant signature beyond the newest prior draft', async () => {
    const findFirst = jest.fn()
      .mockResolvedValueOnce({ media: [] })
      .mockResolvedValueOnce({ signatures: [{
        locked: true,
        signerName: 'BORROWER',
        signedAt: new Date('2026-10-01T10:00:00Z'),
        signatureStorageKey: 'signature.png',
        strokesStorageKey: 'strokes.json',
        metadataStorageKey: 'metadata.json',
        pngContentHash: 'hash',
        strokesContentHash: 'hash',
        metadata: {},
      }] });
    const signatureCreate = jest.fn().mockResolvedValue({});
    const tx = {
      loanApplication: {
        findFirst,
        create: jest.fn().mockResolvedValue({ id: 'new-application' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'new-application' }),
      },
      loanApplicationMedia: { createMany: jest.fn() },
      loanApplicationSignature: { create: signatureCreate },
    };
    const prisma = {
      $transaction: (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService;

    await new LoanApplicationsRepository(prisma).createDraftForCustomer({
      tenantId: 'tenant',
      branchId: 'branch',
      officerUserId: 'officer',
      customerId: 'customer',
      givenNames: 'BORROWER',
      surname: 'NAME',
      phone: '+256700000000',
      nationalId: 'CM000000000000',
      verifiedAt: new Date(),
    });

    expect(findFirst.mock.calls[1][0].where.signatures.some).toEqual({
      signerRole: LoanApplicationSignerRole.APPLICANT,
      locked: true,
    });
    expect(findFirst.mock.calls[0][0].where.media.some.type.in).toEqual([
      LoanApplicationMediaType.PASSPORT,
      LoanApplicationMediaType.NIN_FRONT,
      LoanApplicationMediaType.NIN_BACK,
    ]);
    expect(signatureCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        loanApplicationId: 'new-application',
        signerRole: LoanApplicationSignerRole.APPLICANT,
        locked: true,
      }),
    }));
  });
});
