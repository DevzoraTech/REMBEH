import { Injectable } from '@nestjs/common';
import {
  LoanApplicationMediaType,
  LoanApplicationSignerRole,
  LoanApplicationStatus,
  LoanStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  LOAN_APPLICATION_EVENTS,
  LoanApplicationEventPayload,
} from './loan-applications.events';
import { LOAN_APPLICATION_PERMISSIONS } from './loan-applications.permissions';

export const loanApplicationInclude = {
  guarantor: true,
  media: { orderBy: { createdAt: 'asc' as const } },
  signatures: { orderBy: [{ signerRole: 'asc' as const }, { version: 'desc' as const }] },
} satisfies Prisma.LoanApplicationInclude;

export type LoanApplicationRecord = Prisma.LoanApplicationGetPayload<{
  include: typeof loanApplicationInclude;
}>;

@Injectable()
export class LoanApplicationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createDraft(input: {
    tenantId: string;
    branchId: string;
    officerUserId: string;
  }) {
    return this.prisma.loanApplication.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        officerUserId: input.officerUserId,
        status: LoanApplicationStatus.DRAFT,
      },
      include: loanApplicationInclude,
    });
  }

  findById(input: { tenantId: string; id: string }) {
    return this.prisma.loanApplication.findFirst({
      where: { id: input.id, tenantId: input.tenantId },
      include: loanApplicationInclude,
    });
  }

  listForScope(input: {
    tenantId: string;
    branchId?: string | null;
    officerUserId?: string | null;
    limit?: number;
  }) {
    return this.prisma.loanApplication.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(input.officerUserId
          ? { officerUserId: input.officerUserId }
          : {}),
        status: {
          in: [
            LoanApplicationStatus.SUBMITTED,
            LoanApplicationStatus.VERIFIED,
            LoanApplicationStatus.DRAFT,
          ],
        },
      },
      include: loanApplicationInclude,
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
      take: input.limit ?? 200,
    });
  }

  findCustomerConflict(input: {
    tenantId: string;
    phone: string;
    nationalId: string;
    excludeApplicationId?: string;
  }) {
    return this.prisma.customer.findFirst({
      where: {
        tenantId: input.tenantId,
        OR: [{ phone: input.phone }, { nationalId: input.nationalId }],
      },
      select: { id: true, phone: true, nationalId: true, fullName: true },
    });
  }

  findOtherDraftWithIdentity(input: {
    tenantId: string;
    phone: string;
    nationalId: string;
    excludeApplicationId: string;
  }) {
    return this.prisma.loanApplication.findFirst({
      where: {
        tenantId: input.tenantId,
        id: { not: input.excludeApplicationId },
        status: {
          in: [
            LoanApplicationStatus.DRAFT,
            LoanApplicationStatus.VERIFIED,
            LoanApplicationStatus.SUBMITTED,
          ],
        },
        OR: [{ phone: input.phone }, { nationalId: input.nationalId }],
      },
      select: { id: true, status: true },
    });
  }

  updateApplication(
    id: string,
    data: Prisma.LoanApplicationUpdateInput,
  ): Promise<LoanApplicationRecord> {
    return this.prisma.loanApplication.update({
      where: { id },
      data,
      include: loanApplicationInclude,
    });
  }

  upsertGuarantor(input: {
    applicationId: string;
    fullName?: string | null;
    phone?: string | null;
  }) {
    return this.prisma.loanApplicationGuarantor.upsert({
      where: { loanApplicationId: input.applicationId },
      create: {
        loanApplicationId: input.applicationId,
        fullName: input.fullName ?? null,
        phone: input.phone ?? null,
      },
      update: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      },
    });
  }

  upsertMedia(input: {
    applicationId: string;
    type: LoanApplicationMediaType;
    storageKey: string;
    mimeType: string;
    byteSize: number;
    checksum?: string | null;
    fileName?: string | null;
  }) {
    return this.prisma.loanApplicationMedia.upsert({
      where: {
        loanApplicationId_type: {
          loanApplicationId: input.applicationId,
          type: input.type,
        },
      },
      create: {
        loanApplicationId: input.applicationId,
        type: input.type,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        checksum: input.checksum ?? null,
        fileName: input.fileName ?? null,
      },
      update: {
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        checksum: input.checksum ?? null,
        fileName: input.fileName ?? null,
      },
    });
  }

  findLatestSignature(input: {
    applicationId: string;
    signerRole: LoanApplicationSignerRole;
  }) {
    return this.prisma.loanApplicationSignature.findFirst({
      where: {
        loanApplicationId: input.applicationId,
        signerRole: input.signerRole,
      },
      orderBy: { version: 'desc' },
    });
  }

  createSignature(input: {
    applicationId: string;
    signerRole: LoanApplicationSignerRole;
    version: number;
    locked: boolean;
    signerName: string;
    signedAt: Date;
    signatureStorageKey: string;
    strokesStorageKey: string;
    metadataStorageKey: string;
    pngContentHash: string;
    strokesContentHash: string;
    metadata: Prisma.InputJsonValue;
  }) {
    return this.prisma.loanApplicationSignature.create({
      data: {
        loanApplicationId: input.applicationId,
        signerRole: input.signerRole,
        version: input.version,
        locked: input.locked,
        signerName: input.signerName,
        signedAt: input.signedAt,
        signatureStorageKey: input.signatureStorageKey,
        strokesStorageKey: input.strokesStorageKey,
        metadataStorageKey: input.metadataStorageKey,
        pngContentHash: input.pngContentHash,
        strokesContentHash: input.strokesContentHash,
        metadata: input.metadata,
      },
    });
  }

  updateSignedAgreement(input: {
    applicationId: string;
    storageKey: string;
    contentHash: string;
    version: number;
  }) {
    return this.prisma.loanApplication.update({
      where: { id: input.applicationId },
      data: {
        signedAgreementKey: input.storageKey,
        signedAgreementHash: input.contentHash,
        signedAgreementVersion: input.version,
      },
      include: loanApplicationInclude,
    });
  }

  submitWithCustomerLoanAndOutbox(input: {
    application: LoanApplicationRecord;
    actorUserId: string;
    currency: string;
    eventPayload: LoanApplicationEventPayload;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const fullName = [
        input.application.givenNames?.trim(),
        input.application.surname?.trim(),
      ]
        .filter(Boolean)
        .join(' ');

      let customerId = input.application.customerId;
      if (!customerId) {
        const existing = await tx.customer.findFirst({
          where: {
            tenantId: input.application.tenantId,
            OR: [
              { phone: input.application.phone ?? undefined },
              { nationalId: input.application.nationalId ?? undefined },
            ],
          },
        });

        if (existing) {
          customerId = existing.id;
          await tx.customer.update({
            where: { id: existing.id },
            data: {
              fullName: fullName || existing.fullName,
              phone: input.application.phone ?? existing.phone,
              nationalId: input.application.nationalId ?? existing.nationalId,
              branchId: input.application.branchId,
              verifiedAt: input.application.verifiedAt ?? existing.verifiedAt,
            },
          });
        } else {
          const created = await tx.customer.create({
            data: {
              tenantId: input.application.tenantId,
              branchId: input.application.branchId,
              fullName: fullName || 'Unknown applicant',
              phone: input.application.phone!,
              nationalId: input.application.nationalId,
              verifiedAt: input.application.verifiedAt,
            },
          });
          customerId = created.id;
        }
      }

      const principal = input.application.principalAmount ?? new Prisma.Decimal(0);
      const loan = await tx.loan.create({
        data: {
          tenantId: input.application.tenantId,
          branchId: input.application.branchId,
          customerId,
          principal,
          balance: principal,
          currency: input.currency,
          status: LoanStatus.SUBMITTED,
        },
      });

      const now = new Date();
      const application = await tx.loanApplication.update({
        where: { id: input.application.id },
        data: {
          customerId,
          loanId: loan.id,
          status: LoanApplicationStatus.SUBMITTED,
          submittedAt: now,
          syncedAt: now,
        },
        include: loanApplicationInclude,
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.application.tenantId,
          actorUserId: input.actorUserId,
          action: LOAN_APPLICATION_PERMISSIONS.create,
          entityType: 'loan_application',
          entityId: application.id,
          newValue: {
            id: application.id,
            loanId: loan.id,
            customerId,
            status: application.status,
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.application.tenantId,
          topic: LOAN_APPLICATION_EVENTS.submitted,
          aggregateType: 'loan_application',
          aggregateId: application.id,
          payload: input.eventPayload,
        },
      });

      return application;
    });
  }

  writeOutbox(input: {
    tenantId: string;
    topic: string;
    applicationId: string;
    payload: LoanApplicationEventPayload;
  }) {
    return this.prisma.outboxEvent.create({
      data: {
        tenantId: input.tenantId,
        topic: input.topic,
        aggregateType: 'loan_application',
        aggregateId: input.applicationId,
        payload: input.payload,
      },
    });
  }
}
