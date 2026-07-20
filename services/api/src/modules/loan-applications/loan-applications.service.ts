import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicantGender,
  LoanApplicationMediaType,
  LoanApplicationSignerRole,
  LoanApplicationStatus,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  isInternationalPhoneNumber,
  normalizeInternationalPhoneNumber,
} from '../../common/security/identity-normalization';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import { IdentityVerificationService } from '../identity-verification/identity-verification.service';
import { REALTIME_EVENTS } from '../realtime/realtime.events';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ObjectStorageService } from '../storage/object-storage.service';
import {
  LoanApplicationContract,
  LoanApplicationListItemContract,
  LoanApplicationListResponseContract,
  LoanApplicationResponseContract,
  MediaPresignResponseContract,
  SignaturePresignResponseContract,
} from './loan-applications.contracts';
import {
  LOAN_APPLICATION_EVENTS,
  LoanApplicationEventPayload,
} from './loan-applications.events';
import {
  LoanApplicationRecord,
  LoanApplicationsRepository,
} from './loan-applications.repository';
import { buildSignedLoanAgreementPdf } from './loan-agreement-pdf.builder';
import { MediaConfirmDto, MediaPresignDto } from './dto/media-presign.dto';
import {
  SignatureConfirmDto,
  SignaturePresignDto,
} from './dto/signature.dto';
import { UpdateLoanApplicationDto } from './dto/update-loan-application.dto';
import { VerifyApplicantDto } from './dto/verify-applicant.dto';
import { computeLoanPricing } from '../loan-products/loan-pricing';
import {
  computePenaltyFineAmount,
  computeProcessingFeeAmount,
  describeLoanTerm,
  termToDurationDays,
} from '../loan-products/loan-term';
import { LoanProductsService } from '../loan-products/loan-products.service';

const REQUIRED_MEDIA_ON_SUBMIT: LoanApplicationMediaType[] = [
  LoanApplicationMediaType.PASSPORT,
  LoanApplicationMediaType.NIN_FRONT,
  LoanApplicationMediaType.NIN_BACK,
  LoanApplicationMediaType.GUARANTOR_NIN_FRONT,
  LoanApplicationMediaType.GUARANTOR_NIN_BACK,
  LoanApplicationMediaType.SIGNATURE_APPLICANT,
  LoanApplicationMediaType.SIGNATURE_GUARANTOR,
  LoanApplicationMediaType.SIGNATURE_OFFICER,
];

const REQUIRED_SIGNATURE_ROLES: LoanApplicationSignerRole[] = [
  LoanApplicationSignerRole.APPLICANT,
  LoanApplicationSignerRole.GUARANTOR,
  LoanApplicationSignerRole.OFFICER,
];

const SIGNATURE_MEDIA_TYPES = new Set<LoanApplicationMediaType>([
  LoanApplicationMediaType.SIGNATURE_APPLICANT,
  LoanApplicationMediaType.SIGNATURE_GUARANTOR,
  LoanApplicationMediaType.SIGNATURE_OFFICER,
]);

const SIGNER_ROLE_TO_MEDIA: Record<
  LoanApplicationSignerRole,
  LoanApplicationMediaType
> = {
  [LoanApplicationSignerRole.APPLICANT]:
    LoanApplicationMediaType.SIGNATURE_APPLICANT,
  [LoanApplicationSignerRole.GUARANTOR]:
    LoanApplicationMediaType.SIGNATURE_GUARANTOR,
  [LoanApplicationSignerRole.OFFICER]:
    LoanApplicationMediaType.SIGNATURE_OFFICER,
};

@Injectable()
export class LoanApplicationsService {
  constructor(
    private readonly repository: LoanApplicationsRepository,
    private readonly identityVerification: IdentityVerificationService,
    private readonly objectStorage: ObjectStorageService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly loanProducts: LoanProductsService,
  ) {}

  async createDraft(
    user: AuthenticatedUser,
  ): Promise<LoanApplicationResponseContract> {
    this.requireBranch(user);
    const application = await this.repository.createDraft({
      tenantId: user.tenantId,
      branchId: user.branchId!,
      officerUserId: user.userId,
    });
    return { application: this.toContract(application) };
  }

  async listApplications(
    user: AuthenticatedUser,
  ): Promise<LoanApplicationListResponseContract> {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Tenant scope is required.');
    }

    const canSeeAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );

    if (!canSeeAllBranches && !user.branchId) {
      return { applications: [] };
    }

    // Agent / manager: branch scope. Owner: all branches.
    const records = await this.repository.listForScope({
      tenantId: user.tenantId,
      branchId: canSeeAllBranches ? null : user.branchId,
    });

    return {
      applications: records
        .filter(
          (item) =>
            item.status === LoanApplicationStatus.SUBMITTED ||
            item.officerUserId === user.userId,
        )
        .map((item) => this.toListItem(item)),
    };
  }

  async getApplication(
    user: AuthenticatedUser,
    id: string,
  ): Promise<LoanApplicationResponseContract> {
    const application = await this.requireAccessibleApplication(user, id);
    return {
      application: await this.toContractWithPreviews(application),
    };
  }

  async updateApplication(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateLoanApplicationDto,
  ): Promise<LoanApplicationResponseContract> {
    const existing = await this.requireWritableDraft(user, id);

    if (dto.phone) {
      const phone = normalizeInternationalPhoneNumber(dto.phone);
      if (!isInternationalPhoneNumber(phone)) {
        throw new BadRequestException(
          'phone must be a valid international phone number.',
        );
      }
      dto.phone = phone;
    }

    const templateSnapshot = dto.loanProductTemplateId
      ? await this.buildTemplateSnapshot(user, dto)
      : null;

    const principalForFee =
      dto.principalAmount ??
      (existing.principalAmount != null
        ? Number(existing.principalAmount.toString())
        : null);

    let processingFeeFromTemplate: number | undefined;
    if (
      templateSnapshot &&
      principalForFee != null &&
      dto.processingFee === undefined
    ) {
      processingFeeFromTemplate = computeProcessingFeeAmount({
        principalAmount: principalForFee,
        processingFeePercent: templateSnapshot.processingFeePercent,
      });
    }

    if (templateSnapshot && principalForFee != null) {
      this.assertPrincipalWithinTemplate(
        principalForFee,
        templateSnapshot.minLoanAmount,
        templateSnapshot.maxLoanAmount,
      );
    }

    const updated = await this.repository.updateApplication(existing.id, {
      surname: dto.surname?.trim(),
      givenNames: dto.givenNames?.trim(),
      phone: dto.phone,
      nationalId: dto.nationalId?.trim().toUpperCase(),
      gender: dto.gender,
      dateOfBirth:
        dto.dateOfBirth !== undefined
          ? this.parseDateOnly(dto.dateOfBirth)
          : undefined,
      district: dto.district?.trim(),
      subCounty: dto.subCounty?.trim(),
      parish: dto.parish?.trim(),
      village: dto.village?.trim(),
      principalAmount:
        dto.principalAmount !== undefined
          ? new Prisma.Decimal(dto.principalAmount)
          : undefined,
      ...(templateSnapshot
        ? {
            loanProductTemplate: {
              connect: { id: templateSnapshot.templateId },
            },
            templateName: templateSnapshot.templateName,
            interestType: templateSnapshot.interestType,
            termValue: templateSnapshot.termValue,
            termUnit: templateSnapshot.termUnit,
            repaymentFrequency: templateSnapshot.repaymentFrequency,
            processingFeePercent: new Prisma.Decimal(
              templateSnapshot.processingFeePercent,
            ),
            penaltyRatePercent: new Prisma.Decimal(
              templateSnapshot.penaltyRatePercent,
            ),
            finePeriodDays: templateSnapshot.finePeriodDays,
            interestRatePercent: new Prisma.Decimal(
              templateSnapshot.interestRatePercent,
            ),
            durationDays: templateSnapshot.durationDays,
            processingFee: new Prisma.Decimal(
              (
                dto.processingFee ??
                processingFeeFromTemplate ??
                0
              ).toFixed(2),
            ),
          }
        : {
            interestRatePercent:
              dto.interestRatePercent !== undefined
                ? new Prisma.Decimal(dto.interestRatePercent)
                : undefined,
            durationDays: dto.durationDays,
            processingFee:
              dto.processingFee !== undefined
                ? new Prisma.Decimal(dto.processingFee)
                : undefined,
          }),
      loanPurpose:
        dto.loanPurpose !== undefined
          ? dto.loanPurpose.trim() || null
          : undefined,
      collateralType: dto.collateralType?.trim(),
      termsConfirmedAt:
        dto.termsConfirmed === true
          ? new Date()
          : dto.termsConfirmed === false
            ? null
            : undefined,
      ...(dto.paymentStartDate !== undefined
        ? {
            paymentStartDate: await this.resolveAgentPaymentStartDate(
              user,
              existing.branchId,
              dto.paymentStartDate,
            ),
          }
        : {}),
    });

    if (dto.guarantor) {
      await this.repository.upsertGuarantor({
        applicationId: updated.id,
        fullName: dto.guarantor.fullName?.trim() ?? null,
        phone: dto.guarantor.phone
          ? normalizeInternationalPhoneNumber(dto.guarantor.phone)
          : null,
      });
    }

    const fresh = await this.repository.findById({
      tenantId: user.tenantId,
      id: updated.id,
    });

    if (!fresh) {
      throw new NotFoundException('Loan application not found.');
    }

    await this.emitUpdated(fresh, user.userId);
    return { application: this.toContract(fresh) };
  }

  async verifyApplicant(
    user: AuthenticatedUser,
    id: string,
    dto: VerifyApplicantDto,
  ): Promise<LoanApplicationResponseContract> {
    const existing = await this.requireWritableDraft(user, id);
    const phone = normalizeInternationalPhoneNumber(dto.phone);
    const nationalId = dto.nationalId.trim().toUpperCase();

    if (!isInternationalPhoneNumber(phone)) {
      throw new BadRequestException(
        'phone must be a valid international phone number.',
      );
    }

    const customerConflict = await this.repository.findCustomerConflict({
      tenantId: user.tenantId,
      phone,
      nationalId,
    });

    if (customerConflict) {
      throw new ConflictException(
        'This applicant already exists in the system. Open their client profile instead.',
      );
    }

    const draftConflict = await this.repository.findOtherDraftWithIdentity({
      tenantId: user.tenantId,
      phone,
      nationalId,
      excludeApplicationId: existing.id,
    });

    if (draftConflict?.status === LoanApplicationStatus.SUBMITTED) {
      throw new ConflictException(
        'An application with this phone or NIN was already submitted.',
      );
    }

    const dateOfBirth = this.parseDateOnly(dto.dateOfBirth);
    const smileGender = this.toSmileGender(dto.gender);

    const verification = await this.identityVerification.verifyNationalId({
      nationalId,
      country: dto.country ?? 'UG',
      firstName: dto.givenNames,
      lastName: dto.surname,
      phoneNumber: phone,
      gender: smileGender,
      dob: this.formatDateOnly(dateOfBirth),
    });

    if (!verification.valid) {
      throw new BadRequestException(
        verification.errorMessage ??
          'National ID verification failed. Check the NIN and try again.',
      );
    }

    const updated = await this.repository.updateApplication(existing.id, {
      surname: dto.surname.trim(),
      givenNames: dto.givenNames.trim(),
      phone,
      nationalId,
      gender: dto.gender,
      dateOfBirth,
      status: LoanApplicationStatus.VERIFIED,
      smileJobId: verification.jobId,
      smileResult: verification.raw as Prisma.InputJsonValue,
      verificationCode: verification.verificationCode,
      verifiedAt: new Date(),
    });

    await this.emitUpdated(updated, user.userId);
    return { application: this.toContract(updated) };
  }

  async presignMedia(
    user: AuthenticatedUser,
    id: string,
    dto: MediaPresignDto,
  ): Promise<MediaPresignResponseContract> {
    const application = await this.requireWritableDraft(user, id);

    if (SIGNATURE_MEDIA_TYPES.has(dto.mediaType)) {
      throw new BadRequestException(
        'Use /signatures/presign for electronic signatures.',
      );
    }

    const extension =
      dto.extension ||
      this.extensionFromMime(dto.mimeType) ||
      this.extensionFromFileName(dto.fileName) ||
      'bin';

    const storageKey = this.objectStorage.buildObjectKey({
      tenantId: user.tenantId,
      applicationId: application.id,
      mediaType: dto.mediaType,
      extension,
    });

    const presigned = await this.objectStorage.presignPut({
      storageKey,
      mimeType: dto.mimeType,
    });

    return {
      ...presigned,
      mediaType: dto.mediaType,
    };
  }

  async confirmMedia(
    user: AuthenticatedUser,
    id: string,
    dto: MediaConfirmDto,
  ): Promise<LoanApplicationResponseContract> {
    const application = await this.requireWritableDraft(user, id);

    if (SIGNATURE_MEDIA_TYPES.has(dto.mediaType)) {
      throw new BadRequestException(
        'Use /signatures/presign and /signatures/confirm for electronic signatures.',
      );
    }

    if (!dto.storageKey.includes(application.id)) {
      throw new BadRequestException('storageKey does not match this application.');
    }

    await this.repository.upsertMedia({
      applicationId: application.id,
      type: dto.mediaType,
      storageKey: dto.storageKey,
      mimeType: dto.mimeType,
      byteSize: dto.byteSize,
      checksum: dto.checksum,
      fileName: dto.fileName,
    });

    const fresh = await this.repository.findById({
      tenantId: user.tenantId,
      id: application.id,
    });

    if (!fresh) {
      throw new NotFoundException('Loan application not found.');
    }

    const payload = this.toEventPayload(fresh);
    await this.repository.writeOutbox({
      tenantId: user.tenantId,
      topic: LOAN_APPLICATION_EVENTS.mediaUploaded,
      applicationId: fresh.id,
      payload,
    });
    this.realtimeGateway.broadcastLoanApplication(
      REALTIME_EVENTS.loanApplicationMediaUploaded,
      { ...payload, tenantId: user.tenantId },
    );

    return { application: this.toContract(fresh) };
  }

  async presignSignature(
    user: AuthenticatedUser,
    id: string,
    dto: SignaturePresignDto,
  ): Promise<SignaturePresignResponseContract> {
    const application = await this.requireWritableDraft(user, id);
    const latest = await this.repository.findLatestSignature({
      applicationId: application.id,
      signerRole: dto.signerRole,
    });

    let nextVersion = 1;
    if (latest) {
      if (latest.locked && !dto.createNewVersion) {
        throw new ConflictException(
          'This signature is locked. Pass createNewVersion=true to capture a new version.',
        );
      }
      nextVersion = latest.locked ? latest.version + 1 : latest.version;
    }

    const keys = this.objectStorage.buildSignatureObjectKeys({
      tenantId: user.tenantId,
      applicationId: application.id,
      signerRole: dto.signerRole,
    });

    const [signature, strokes, metadata] = await Promise.all([
      this.objectStorage.presignPut({
        storageKey: keys.signaturePngKey,
        mimeType: 'image/png',
      }),
      this.objectStorage.presignPut({
        storageKey: keys.strokesJsonKey,
        mimeType: 'application/json',
      }),
      this.objectStorage.presignPut({
        storageKey: keys.metadataJsonKey,
        mimeType: 'application/json',
      }),
    ]);

    return {
      assetId: keys.assetId,
      signerRole: dto.signerRole,
      version: nextVersion,
      expiresInSeconds: signature.expiresInSeconds,
      signature: {
        uploadUrl: signature.uploadUrl,
        storageKey: signature.storageKey,
        mimeType: 'image/png',
      },
      strokes: {
        uploadUrl: strokes.uploadUrl,
        storageKey: strokes.storageKey,
        mimeType: 'application/json',
      },
      metadata: {
        uploadUrl: metadata.uploadUrl,
        storageKey: metadata.storageKey,
        mimeType: 'application/json',
      },
    };
  }

  async confirmSignature(
    user: AuthenticatedUser,
    id: string,
    dto: SignatureConfirmDto,
  ): Promise<LoanApplicationResponseContract> {
    const application = await this.requireWritableDraft(user, id);
    this.assertSignatureKeysBelongToApplication(application.id, dto);

    const latest = await this.repository.findLatestSignature({
      applicationId: application.id,
      signerRole: dto.signerRole,
    });

    let version = 1;
    if (latest?.locked) {
      if (!dto.createNewVersion) {
        throw new ConflictException(
          'This signature is locked and cannot be replaced. Pass createNewVersion=true for a new version.',
        );
      }
      version = latest.version + 1;
    } else if (latest && !latest.locked) {
      throw new ConflictException(
        'An unlocked signature draft already exists for this role. Contact support.',
      );
    }

    const signedAt = new Date(dto.signedAt);
    if (Number.isNaN(signedAt.getTime())) {
      throw new BadRequestException('signedAt must be a valid ISO timestamp.');
    }

    const metadata = {
      ...dto.metadata,
      signerName: dto.signerName.trim(),
      signedAt: signedAt.toISOString(),
      signerRole: dto.signerRole,
      loanApplicationId: application.id,
      signatureStorageKey: dto.signatureStorageKey,
      version,
    };

    await this.repository.createSignature({
      applicationId: application.id,
      signerRole: dto.signerRole,
      version,
      locked: true,
      signerName: dto.signerName.trim(),
      signedAt,
      signatureStorageKey: dto.signatureStorageKey,
      strokesStorageKey: dto.strokesStorageKey,
      metadataStorageKey: dto.metadataStorageKey,
      pngContentHash: dto.pngContentHash.toLowerCase(),
      strokesContentHash: dto.strokesContentHash.toLowerCase(),
      metadata: metadata as Prisma.InputJsonValue,
    });

    await this.repository.upsertMedia({
      applicationId: application.id,
      type: SIGNER_ROLE_TO_MEDIA[dto.signerRole],
      storageKey: dto.signatureStorageKey,
      mimeType: 'image/png',
      byteSize: dto.signatureByteSize,
      checksum: dto.pngContentHash.toLowerCase(),
      fileName: `${dto.signerRole.toLowerCase()}-signature-v${version}.png`,
    });

    let fresh = await this.repository.findById({
      tenantId: user.tenantId,
      id: application.id,
    });

    if (!fresh) {
      throw new NotFoundException('Loan application not found.');
    }

    if (this.hasAllLockedSignatures(fresh)) {
      fresh = await this.generateAndStoreSignedAgreement(fresh);
    }

    const payload = this.toEventPayload(fresh);
    await this.repository.writeOutbox({
      tenantId: user.tenantId,
      topic: LOAN_APPLICATION_EVENTS.mediaUploaded,
      applicationId: fresh.id,
      payload,
    });
    this.realtimeGateway.broadcastLoanApplication(
      REALTIME_EVENTS.loanApplicationMediaUploaded,
      { ...payload, tenantId: user.tenantId },
    );

    return { application: this.toContract(fresh) };
  }

  async submit(
    user: AuthenticatedUser,
    id: string,
  ): Promise<LoanApplicationResponseContract> {
    const application = await this.requireWritableDraft(user, id);
    this.assertReadyForSubmit(application);

    const goLiveAt = new Date();
    const paymentStartDate = await this.loanProducts.resolvePaymentStartDate({
      tenantId: user.tenantId,
      branchId: application.branchId,
      anchorDate: goLiveAt,
      agentPickedDate: application.paymentStartDate,
    });

    const eventPayload = this.toEventPayload({
      ...application,
      status: LoanApplicationStatus.SUBMITTED,
      submittedAt: goLiveAt,
      syncedAt: goLiveAt,
      paymentStartDate,
    });

    const submitted = await this.repository.submitWithCustomerLoanAndOutbox({
      application,
      actorUserId: user.userId,
      currency: 'UGX',
      eventPayload,
      goLiveAt,
      paymentStartDate,
    });

    this.realtimeGateway.broadcastLoanApplication(
      REALTIME_EVENTS.loanApplicationSubmitted,
      { ...this.toEventPayload(submitted), tenantId: user.tenantId },
    );

    return { application: this.toContract(submitted) };
  }

  private assertReadyForSubmit(application: LoanApplicationRecord) {
    if (application.status !== LoanApplicationStatus.VERIFIED) {
      throw new BadRequestException(
        'Applicant must be verified before submitting.',
      );
    }

    const requiredFields: Array<[unknown, string]> = [
      [application.surname, 'surname'],
      [application.givenNames, 'given names'],
      [application.phone, 'phone'],
      [application.nationalId, 'national ID'],
      [application.district, 'district'],
      [application.subCounty, 'sub-county'],
      [application.parish, 'parish'],
      [application.village, 'village'],
      [application.principalAmount, 'principal amount'],
      [application.interestRatePercent, 'interest rate'],
      [application.durationDays, 'duration'],
      [application.processingFee, 'processing fee'],
      [application.collateralType, 'collateral type'],
      [application.termsConfirmedAt, 'terms confirmation'],
      [application.guarantor?.fullName, 'guarantor name'],
      [application.guarantor?.phone, 'guarantor phone'],
    ];

    const missing = requiredFields
      .filter(([value]) => value === null || value === undefined || value === '')
      .map(([, label]) => label);

    const mediaTypes = new Set(application.media.map((item) => item.type));
    for (const type of REQUIRED_MEDIA_ON_SUBMIT) {
      if (!mediaTypes.has(type)) {
        missing.push(type.toLowerCase().replaceAll('_', ' '));
      }
    }

    for (const role of REQUIRED_SIGNATURE_ROLES) {
      const latest = application.signatures
        .filter((item) => item.signerRole === role)
        .sort((a, b) => b.version - a.version)[0];
      if (!latest?.locked) {
        missing.push(`${role.toLowerCase()} electronic signature`);
      }
    }

    if (missing.length > 0) {
      throw new BadRequestException(
        `Application is incomplete. Missing: ${missing.join(', ')}.`,
      );
    }
  }

  private assertSignatureKeysBelongToApplication(
    applicationId: string,
    dto: SignatureConfirmDto,
  ) {
    const keys = [
      dto.signatureStorageKey,
      dto.strokesStorageKey,
      dto.metadataStorageKey,
    ];
    for (const key of keys) {
      if (!key.includes(applicationId) || !key.includes('/signatures/')) {
        throw new BadRequestException(
          'Signature storage keys do not match this application.',
        );
      }
    }

    const folder = dto.signatureStorageKey.replace(/\/signature\.png$/, '');
    if (
      !dto.strokesStorageKey.startsWith(`${folder}/`) ||
      !dto.metadataStorageKey.startsWith(`${folder}/`)
    ) {
      throw new BadRequestException(
        'Signature PNG, strokes, and metadata must share the same asset folder.',
      );
    }
  }

  private hasAllLockedSignatures(application: LoanApplicationRecord) {
    return REQUIRED_SIGNATURE_ROLES.every((role) => {
      const latest = application.signatures
        .filter((item) => item.signerRole === role)
        .sort((a, b) => b.version - a.version)[0];
      return Boolean(latest?.locked);
    });
  }

  private async generateAndStoreSignedAgreement(
    application: LoanApplicationRecord,
  ): Promise<LoanApplicationRecord> {
    const latestByRole = REQUIRED_SIGNATURE_ROLES.map((role) => {
      const latest = application.signatures
        .filter((item) => item.signerRole === role)
        .sort((a, b) => b.version - a.version)[0];
      return latest!;
    });

    const agreementVersion =
      (application.signedAgreementVersion ?? 0) + 1;

    const parties = await Promise.all(
      latestByRole.map(async (sig) => {
        const signaturePng = await this.objectStorage.getObjectBytes(
          sig.signatureStorageKey,
        );
        return {
          role: sig.signerRole,
          signerName: sig.signerName,
          signedAt: sig.signedAt.toISOString(),
          signaturePng,
        };
      }),
    );

    const principalAmount = this.decimalToNumber(application.principalAmount);
    const penaltyRate = this.decimalToNumber(application.penaltyRatePercent);
    const fineAmount =
      principalAmount != null && penaltyRate != null
        ? computePenaltyFineAmount({
            principalAmount,
            penaltyRatePercent: penaltyRate,
          })
        : null;
    const loanDurationLabel =
      application.termValue != null && application.termUnit != null
        ? describeLoanTerm(application.termValue, application.termUnit)
        : application.durationDays != null
          ? `${application.durationDays} days`
          : null;
    const finePeriodLabel =
      application.finePeriodDays != null
        ? `${application.finePeriodDays} day${
            application.finePeriodDays === 1 ? '' : 's'
          }`
        : null;

    const { pdfBytes, contentHash } = await buildSignedLoanAgreementPdf({
      applicationId: application.id,
      clientName: this.clientName(application),
      phone: application.phone,
      nationalId: application.nationalId,
      principalAmount,
      interestRatePercent: this.decimalToNumber(
        application.interestRatePercent,
      ),
      durationDays: application.durationDays,
      loanDurationLabel,
      processingFee: this.decimalToNumber(application.processingFee),
      collateralType: application.collateralType,
      loanPurpose: application.loanPurpose,
      district: application.district,
      subCounty: application.subCounty,
      parish: application.parish,
      village: application.village,
      guarantorName: application.guarantor?.fullName ?? null,
      companyName: application.tenant?.name ?? null,
      companyAddress: application.branch?.address ?? null,
      companyContact: application.branch?.phone ?? null,
      agentName: application.officer?.displayName ?? null,
      agreementDate: new Date(),
      dateLoanTaken: application.submittedAt ?? new Date(),
      fineAmount,
      finePeriodLabel,
      version: agreementVersion,
      parties,
    });

    const storageKey = this.objectStorage.buildSignedAgreementKey({
      tenantId: application.tenantId,
      applicationId: application.id,
      version: agreementVersion,
    });

    await this.objectStorage.upload({
      storageKey,
      body: Buffer.from(pdfBytes),
      mimeType: 'application/pdf',
    });

    return this.repository.updateSignedAgreement({
      applicationId: application.id,
      storageKey,
      contentHash,
      version: agreementVersion,
    });
  }

  private async requireAccessibleApplication(
    user: AuthenticatedUser,
    id: string,
  ) {
    const application = await this.repository.findById({
      tenantId: user.tenantId,
      id,
    });

    if (!application) {
      throw new NotFoundException('Loan application not found.');
    }

    const canSeeAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );

    if (!canSeeAllBranches && application.branchId !== user.branchId) {
      throw new ForbiddenException(
        'You cannot access applications outside your branch.',
      );
    }

    const isCreator = application.officerUserId === user.userId;
    const canManage =
      user.permissions.includes(BRANCH_PERMISSIONS.staffInvite) ||
      canSeeAllBranches;

    if (!isCreator && !canManage) {
      throw new ForbiddenException('You cannot access this application.');
    }

    return application;
  }

  private async requireWritableDraft(user: AuthenticatedUser, id: string) {
    this.requireBranch(user);
    const application = await this.requireAccessibleApplication(user, id);

    if (application.officerUserId !== user.userId) {
      throw new ForbiddenException(
        'Only the owning officer can edit this draft.',
      );
    }

    if (application.status === LoanApplicationStatus.SUBMITTED) {
      throw new BadRequestException('Submitted applications cannot be edited.');
    }

    return application;
  }

  private requireBranch(user: AuthenticatedUser) {
    if (!user.branchId) {
      throw new ForbiddenException(
        'Loan applications require a branch assignment.',
      );
    }
  }

  private async emitUpdated(
    application: LoanApplicationRecord,
    actorUserId: string,
  ) {
    const payload = this.toEventPayload(application);
    await this.repository.writeOutbox({
      tenantId: application.tenantId,
      topic: LOAN_APPLICATION_EVENTS.updated,
      applicationId: application.id,
      payload: { ...payload, officerUserId: actorUserId },
    });
    this.realtimeGateway.broadcastLoanApplication(
      REALTIME_EVENTS.loanApplicationUpdated,
      { ...payload, tenantId: application.tenantId },
    );
  }

  private toEventPayload(
    application: LoanApplicationRecord,
  ): LoanApplicationEventPayload {
    return {
      applicationId: application.id,
      branchId: application.branchId,
      officerUserId: application.officerUserId,
      status: application.status,
      clientName: this.clientName(application),
      phone: application.phone ?? '',
      amountRequested: this.decimalToNumber(application.principalAmount),
      interestRatePercent: this.decimalToNumber(
        application.interestRatePercent,
      ),
      registeredAt: (
        application.submittedAt ?? application.createdAt
      ).toISOString(),
      synced: Boolean(application.syncedAt),
    };
  }

  private toListItem(
    application: LoanApplicationRecord,
  ): LoanApplicationListItemContract {
    return {
      id: application.id,
      clientName: this.clientName(application),
      phone: application.phone ?? '',
      amountRequested: this.decimalToNumber(application.principalAmount) ?? 0,
      interestRatePercent:
        this.decimalToNumber(application.interestRatePercent) ?? 0,
      registeredAt: (
        application.submittedAt ?? application.createdAt
      ).toISOString(),
      synced: Boolean(application.syncedAt),
      status: application.status,
      branchId: application.branchId,
    };
  }

  private toContract(
    application: LoanApplicationRecord,
  ): LoanApplicationContract {
    const principalAmount = this.decimalToNumber(application.principalAmount);
    const interestRatePercent = this.decimalToNumber(
      application.interestRatePercent,
    );
    const processingFee = this.decimalToNumber(application.processingFee);
    const pricing =
      principalAmount != null &&
      interestRatePercent != null &&
      application.durationDays != null
        ? computeLoanPricing({
            principalAmount,
            interestRatePercent,
            durationDays: application.durationDays,
            processingFee,
          })
        : null;

    return {
      id: application.id,
      branchId: application.branchId,
      officerUserId: application.officerUserId,
      officerName: application.officer?.displayName ?? null,
      officerPublicId: application.officer?.publicId ?? null,
      agentPhotoUrl: null,
      agentPhotoStorageKey: application.officer?.profilePhotoStorageKey ?? null,
      status: application.status,
      surname: application.surname,
      givenNames: application.givenNames,
      phone: application.phone,
      nationalId: application.nationalId,
      gender: application.gender,
      dateOfBirth: application.dateOfBirth
        ? this.formatDateOnly(application.dateOfBirth)
        : null,
      district: application.district,
      subCounty: application.subCounty,
      parish: application.parish,
      village: application.village,
      principalAmount,
      interestRatePercent,
      durationDays: application.durationDays,
      processingFee,
      loanProductTemplateId: application.loanProductTemplateId,
      templateName: application.templateName,
      interestType: application.interestType,
      termValue: application.termValue,
      termUnit: application.termUnit,
      repaymentFrequency: application.repaymentFrequency,
      processingFeePercent: this.decimalToNumber(
        application.processingFeePercent,
      ),
      penaltyRatePercent: this.decimalToNumber(application.penaltyRatePercent),
      finePeriodDays: application.finePeriodDays,
      loanPurpose: application.loanPurpose,
      collateralType: application.collateralType,
      verificationCode: application.verificationCode,
      verifiedAt: application.verifiedAt?.toISOString() ?? null,
      termsConfirmedAt: application.termsConfirmedAt?.toISOString() ?? null,
      paymentStartDate: application.paymentStartDate?.toISOString() ?? null,
      submittedAt: application.submittedAt?.toISOString() ?? null,
      syncedAt: application.syncedAt?.toISOString() ?? null,
      createdAt: application.createdAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
      clientName: this.clientName(application),
      synced: Boolean(application.syncedAt),
      guarantor: application.guarantor
        ? {
            fullName: application.guarantor.fullName,
            phone: application.guarantor.phone,
          }
        : null,
      media: application.media.map((item) => ({
        id: item.id,
        type: item.type,
        storageKey: item.storageKey,
        mimeType: item.mimeType,
        byteSize: item.byteSize,
        fileName: item.fileName,
        createdAt: item.createdAt.toISOString(),
      })),
      signatures: application.signatures.map((item) => ({
        id: item.id,
        signerRole: item.signerRole,
        version: item.version,
        locked: item.locked,
        signerName: item.signerName,
        signedAt: item.signedAt.toISOString(),
        signatureStorageKey: item.signatureStorageKey,
        strokesStorageKey: item.strokesStorageKey,
        metadataStorageKey: item.metadataStorageKey,
        pngContentHash: item.pngContentHash,
        strokesContentHash: item.strokesContentHash,
        metadata:
          item.metadata && typeof item.metadata === 'object'
            ? (item.metadata as Record<string, unknown>)
            : {},
        createdAt: item.createdAt.toISOString(),
      })),
      signedAgreementKey: application.signedAgreementKey,
      signedAgreementHash: application.signedAgreementHash,
      signedAgreementVersion: application.signedAgreementVersion,
      pricing,
    };
  }

  private async toContractWithPreviews(
    application: LoanApplicationRecord,
  ): Promise<LoanApplicationContract> {
    const base = this.toContract(application);

    const media = await Promise.all(
      base.media.map(async (item) => {
        try {
          const signed = await this.objectStorage.presignGet({
            storageKey: item.storageKey,
          });
          return { ...item, downloadUrl: signed.downloadUrl };
        } catch {
          return { ...item, downloadUrl: null };
        }
      }),
    );

    const signatures = await Promise.all(
      base.signatures.map(async (item) => {
        try {
          const signed = await this.objectStorage.presignGet({
            storageKey: item.signatureStorageKey,
          });
          return { ...item, signatureDownloadUrl: signed.downloadUrl };
        } catch {
          return { ...item, signatureDownloadUrl: null };
        }
      }),
    );

    let signedAgreementDownloadUrl: string | null = null;
    if (base.signedAgreementKey) {
      try {
        const signed = await this.objectStorage.presignGet({
          storageKey: base.signedAgreementKey,
        });
        signedAgreementDownloadUrl = signed.downloadUrl;
      } catch {
        signedAgreementDownloadUrl = null;
      }
    }

    let agentPhotoUrl: string | null = null;
    if (base.agentPhotoStorageKey) {
      try {
        const signed = await this.objectStorage.presignGet({
          storageKey: base.agentPhotoStorageKey,
        });
        agentPhotoUrl = signed.downloadUrl;
      } catch {
        agentPhotoUrl = null;
      }
    }

    return {
      ...base,
      media,
      signatures,
      signedAgreementDownloadUrl,
      agentPhotoUrl,
    };
  }

  private async buildTemplateSnapshot(
    user: AuthenticatedUser,
    dto: UpdateLoanApplicationDto,
  ) {
    const template = await this.loanProducts.requireActiveTemplate({
      tenantId: user.tenantId,
      branchId: user.branchId,
      templateId: dto.loanProductTemplateId!,
    });
    return {
      templateId: template.id,
      templateName: template.name,
      interestType: template.interestType,
      termValue: template.termValue,
      termUnit: template.termUnit,
      repaymentFrequency: template.repaymentFrequency,
      interestRatePercent: Number(template.interestRatePercent.toString()),
      processingFeePercent: Number(template.processingFeePercent.toString()),
      penaltyRatePercent: Number(template.penaltyRatePercent.toString()),
      finePeriodDays: template.finePeriodDays,
      durationDays: termToDurationDays(template.termValue, template.termUnit),
      minLoanAmount:
        template.minLoanAmount != null
          ? Number(template.minLoanAmount.toString())
          : null,
      maxLoanAmount:
        template.maxLoanAmount != null
          ? Number(template.maxLoanAmount.toString())
          : null,
    };
  }

  private assertPrincipalWithinTemplate(
    principal: number,
    minLoanAmount: number | null,
    maxLoanAmount: number | null,
  ) {
    if (minLoanAmount != null && principal < minLoanAmount) {
      throw new BadRequestException(
        `Principal must be at least ${minLoanAmount}.`,
      );
    }
    if (maxLoanAmount != null && principal > maxLoanAmount) {
      throw new BadRequestException(
        `Principal must be at most ${maxLoanAmount}.`,
      );
    }
  }

  private async resolveAgentPaymentStartDate(
    user: AuthenticatedUser,
    branchId: string,
    raw: string,
  ): Promise<Date> {
    const catalog = await this.loanProducts.getCatalog(user);
    const policy = catalog.paymentStartPolicy;
    if (!policy?.allowAgentDatePick) {
      throw new BadRequestException(
        'This branch does not allow agents to pick a payment start date.',
      );
    }
    const picked = new Date(raw);
    if (Number.isNaN(picked.getTime())) {
      throw new BadRequestException('Invalid payment start date.');
    }
    // Validate against policy using "today" as provisional go-live anchor.
    return this.loanProducts.resolvePaymentStartDate({
      tenantId: user.tenantId,
      branchId,
      anchorDate: new Date(),
      agentPickedDate: picked,
    });
  }

  private parseDateOnly(raw: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
    if (!match) {
      throw new BadRequestException('dateOfBirth must be YYYY-MM-DD.');
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException('dateOfBirth must be a valid calendar date.');
    }
    const today = new Date();
    const todayUtc = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    );
    if (date.getTime() > todayUtc) {
      throw new BadRequestException('dateOfBirth cannot be in the future.');
    }
    return date;
  }

  private formatDateOnly(value: Date): string {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /** Smile ID accepts M/F only; OTHER is omitted from the verify payload. */
  private toSmileGender(gender: ApplicantGender): 'M' | 'F' | undefined {
    if (gender === ApplicantGender.MALE) return 'M';
    if (gender === ApplicantGender.FEMALE) return 'F';
    return undefined;
  }

  private clientName(application: LoanApplicationRecord) {
    return [application.givenNames, application.surname]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ');
  }

  private decimalToNumber(value: Prisma.Decimal | null | undefined) {
    if (value === null || value === undefined) return null;
    return Number(value.toString());
  }

  private extensionFromMime(mimeType: string) {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    };
    return map[mimeType.toLowerCase()];
  }

  private extensionFromFileName(fileName?: string) {
    if (!fileName?.includes('.')) return undefined;
    return fileName.split('.').pop()?.toLowerCase();
  }
}
