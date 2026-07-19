import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LoanApplicationMediaType,
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
} from './loan-applications.contracts';
import {
  LOAN_APPLICATION_EVENTS,
  LoanApplicationEventPayload,
} from './loan-applications.events';
import { LOAN_APPLICATION_PERMISSIONS } from './loan-applications.permissions';
import {
  LoanApplicationRecord,
  LoanApplicationsRepository,
} from './loan-applications.repository';
import { MediaConfirmDto, MediaPresignDto } from './dto/media-presign.dto';
import { UpdateLoanApplicationDto } from './dto/update-loan-application.dto';
import { VerifyApplicantDto } from './dto/verify-applicant.dto';

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

@Injectable()
export class LoanApplicationsService {
  constructor(
    private readonly repository: LoanApplicationsRepository,
    private readonly identityVerification: IdentityVerificationService,
    private readonly objectStorage: ObjectStorageService,
    private readonly realtimeGateway: RealtimeGateway,
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
    return { application: this.toContract(application) };
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

    const updated = await this.repository.updateApplication(existing.id, {
      surname: dto.surname?.trim(),
      givenNames: dto.givenNames?.trim(),
      phone: dto.phone,
      nationalId: dto.nationalId?.trim().toUpperCase(),
      district: dto.district?.trim(),
      subCounty: dto.subCounty?.trim(),
      parish: dto.parish?.trim(),
      village: dto.village?.trim(),
      principalAmount:
        dto.principalAmount !== undefined
          ? new Prisma.Decimal(dto.principalAmount)
          : undefined,
      interestRatePercent:
        dto.interestRatePercent !== undefined
          ? new Prisma.Decimal(dto.interestRatePercent)
          : undefined,
      durationDays: dto.durationDays,
      processingFee:
        dto.processingFee !== undefined
          ? new Prisma.Decimal(dto.processingFee)
          : undefined,
      collateralType: dto.collateralType?.trim(),
      termsConfirmedAt:
        dto.termsConfirmed === true
          ? new Date()
          : dto.termsConfirmed === false
            ? null
            : undefined,
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

    const verification = await this.identityVerification.verifyNationalId({
      nationalId,
      country: dto.country ?? 'UG',
      firstName: dto.givenNames,
      lastName: dto.surname,
      phoneNumber: phone,
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

  async submit(
    user: AuthenticatedUser,
    id: string,
  ): Promise<LoanApplicationResponseContract> {
    const application = await this.requireWritableDraft(user, id);
    this.assertReadyForSubmit(application);

    const eventPayload = this.toEventPayload({
      ...application,
      status: LoanApplicationStatus.SUBMITTED,
      submittedAt: new Date(),
      syncedAt: new Date(),
    });

    const submitted = await this.repository.submitWithCustomerLoanAndOutbox({
      application,
      actorUserId: user.userId,
      currency: 'UGX',
      eventPayload,
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

    if (missing.length > 0) {
      throw new BadRequestException(
        `Application is incomplete. Missing: ${missing.join(', ')}.`,
      );
    }
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
    return {
      id: application.id,
      branchId: application.branchId,
      officerUserId: application.officerUserId,
      status: application.status,
      surname: application.surname,
      givenNames: application.givenNames,
      phone: application.phone,
      nationalId: application.nationalId,
      district: application.district,
      subCounty: application.subCounty,
      parish: application.parish,
      village: application.village,
      principalAmount: this.decimalToNumber(application.principalAmount),
      interestRatePercent: this.decimalToNumber(
        application.interestRatePercent,
      ),
      durationDays: application.durationDays,
      processingFee: this.decimalToNumber(application.processingFee),
      collateralType: application.collateralType,
      verificationCode: application.verificationCode,
      verifiedAt: application.verifiedAt?.toISOString() ?? null,
      termsConfirmedAt: application.termsConfirmedAt?.toISOString() ?? null,
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
    };
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
