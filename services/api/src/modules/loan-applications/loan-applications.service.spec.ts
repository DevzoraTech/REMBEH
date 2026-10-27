import { LoanApplicationStatus, LoanApplicationSignerRole } from '@prisma/client';
import { LoanApplicationsService } from './loan-applications.service';
import { LoanApplicationRecord } from './loan-applications.repository';

describe('loan application submission evidence', () => {
  it('accepts a reused locked applicant signature without duplicate media', () => {
    const service = Object.create(LoanApplicationsService.prototype) as LoanApplicationsService;
    const application = {
      status: LoanApplicationStatus.VERIFIED,
      customerId: 'existing-customer',
      surname: 'MASUUDI',
      givenNames: 'KALYANGO',
      phone: '+256775224576',
      nationalId: 'CM1234567890',
      district: 'Ibanda',
      subCounty: 'Ishongororo',
      parish: 'Nyantsimbo',
      village: 'Ishongororo',
      principalAmount: 500000,
      interestRatePercent: 20,
      durationDays: 30,
      processingFee: 10000,
      collateralType: 'NONE',
      termsConfirmedAt: new Date(),
      guarantor: { fullName: 'GUARANTOR', phone: '+256700000000' },
      media: [
        { type: 'GUARANTOR_NIN_FRONT' },
        { type: 'GUARANTOR_NIN_BACK' },
      ],
      signatures: [
        LoanApplicationSignerRole.APPLICANT,
        LoanApplicationSignerRole.GUARANTOR,
        LoanApplicationSignerRole.OFFICER,
      ].map((signerRole) => ({ signerRole, version: 1, locked: true })),
    } as unknown as LoanApplicationRecord;

    expect(() => service['assertReadyForSubmit'](application)).not.toThrow();
  });
});
