import { ConflictException, Injectable } from '@nestjs/common';
import {
  LoanApplicationMediaType,
  LoanApplicationSignerRole,
  LoanApplicationStatus,
  LoanDisbursementSource,
  LoanStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { computeLoanPricing } from '../loan-products/loan-pricing';
import {
  LOAN_APPLICATION_EVENTS,
  LoanApplicationEventPayload,
} from './loan-applications.events';
import { LOAN_APPLICATION_PERMISSIONS } from './loan-applications.permissions';

export const loanApplicationInclude = {
  guarantor: true,
  media: { orderBy: { createdAt: 'asc' as const } },
  signatures: {
    orderBy: [{ signerRole: 'asc' as const }, { version: 'desc' as const }],
  },
  officer: {
    select: {
      id: true,
      displayName: true,
      publicId: true,
      profilePhotoStorageKey: true,
    },
  },
  tenant: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, address: true, phone: true } },
  loan: {
    select: {
      id: true,
      status: true,
      balance: true,
      approvedAt: true,
      disbursedAt: true,
      disbursements: {
        select: {
          amount: true,
          disbursedAt: true,
        },
      },
    },
  },
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

  createDraftForCustomer(input: {
    tenantId: string;
    branchId: string;
    officerUserId: string;
    customerId: string;
    givenNames: string;
    surname: string | null;
    phone: string;
    nationalId: string | null;
    verifiedAt: Date | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      // Only borrower identity evidence belongs to a later application.
      // Guarantor, collateral and officer evidence must be captured again.
      const previousIdentity = await tx.loanApplication.findFirst({
        where: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          customerId: input.customerId,
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          media: {
            where: {
              type: {
                in: [
                  LoanApplicationMediaType.PASSPORT,
                  LoanApplicationMediaType.NIN_FRONT,
                  LoanApplicationMediaType.NIN_BACK,
                ],
              },
            },
            select: {
              type: true,
              storageKey: true,
              mimeType: true,
              byteSize: true,
              checksum: true,
              fileName: true,
            },
          },
          signatures: {
            where: { signerRole: LoanApplicationSignerRole.APPLICANT },
            orderBy: { version: 'desc' },
            take: 1,
            select: {
              locked: true,
              signerName: true,
              signedAt: true,
              signatureStorageKey: true,
              strokesStorageKey: true,
              metadataStorageKey: true,
              pngContentHash: true,
              strokesContentHash: true,
              metadata: true,
            },
          },
        },
      });

      const application = await tx.loanApplication.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          officerUserId: input.officerUserId,
          customerId: input.customerId,
          // Keep the customer name in its proper parts. Storing the complete
          // name as givenNames made repeat applications render a surname twice.
          givenNames: input.givenNames,
          surname: input.surname,
          phone: input.phone,
          nationalId: input.nationalId,
          status:
            input.nationalId && input.verifiedAt
              ? LoanApplicationStatus.VERIFIED
              : LoanApplicationStatus.DRAFT,
          verifiedAt: input.verifiedAt,
        },
      });

      if (previousIdentity?.media.length) {
        await tx.loanApplicationMedia.createMany({
          data: previousIdentity.media.map((media) => ({
            loanApplicationId: application.id,
            type: media.type,
            storageKey: media.storageKey,
            mimeType: media.mimeType,
            byteSize: media.byteSize,
            checksum: media.checksum,
            fileName: media.fileName,
          })),
        });
      }

      const applicantSignature = previousIdentity?.signatures[0];
      if (applicantSignature) {
        await tx.loanApplicationSignature.create({
          data: {
            loanApplicationId: application.id,
            signerRole: LoanApplicationSignerRole.APPLICANT,
            version: 1,
            locked: applicantSignature.locked,
            signerName: applicantSignature.signerName,
            signedAt: applicantSignature.signedAt,
            signatureStorageKey: applicantSignature.signatureStorageKey,
            strokesStorageKey: applicantSignature.strokesStorageKey,
            metadataStorageKey: applicantSignature.metadataStorageKey,
            pngContentHash: applicantSignature.pngContentHash,
            strokesContentHash: applicantSignature.strokesContentHash,
            metadata: applicantSignature.metadata as Prisma.InputJsonValue,
          },
        });
      }

      return tx.loanApplication.findUniqueOrThrow({
        where: { id: application.id },
        include: loanApplicationInclude,
      });
    });
  }

  findCustomerForApplication(input: {
    tenantId: string;
    branchId?: string | null;
    customerId: string;
  }) {
    return this.prisma.customer.findFirst({
      where: {
        id: input.customerId,
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      select: {
        id: true,
        branchId: true,
        fullName: true,
        phone: true,
        nationalId: true,
        verifiedAt: true,
        loans: {
          where: {
            status: {
              notIn: [
                LoanStatus.REJECTED,
                LoanStatus.WRITTEN_OFF,
                LoanStatus.CLOSED,
              ],
            },
          },
          select: { id: true, status: true },
          take: 1,
        },
      },
    });
  }

  countActiveLoansForCustomer(input: { tenantId: string; customerId: string }) {
    return this.prisma.loan.count({
      where: {
        tenantId: input.tenantId,
        customerId: input.customerId,
        status: {
          notIn: [
            LoanStatus.REJECTED,
            LoanStatus.WRITTEN_OFF,
            LoanStatus.CLOSED,
          ],
        },
      },
    });
  }

  countActiveLoansForIdentity(input: {
    tenantId: string;
    phone?: string | null;
    nationalId?: string | null;
  }) {
    const phone = input.phone?.trim();
    const nationalId = input.nationalId?.trim().toUpperCase();
    if (!phone && !nationalId) return Promise.resolve(0);

    return this.prisma.loan.count({
      where: {
        tenantId: input.tenantId,
        status: {
          notIn: [
            LoanStatus.REJECTED,
            LoanStatus.WRITTEN_OFF,
            LoanStatus.CLOSED,
          ],
        },
        customer: {
          OR: [
            ...(phone
              ? [
                  {
                    phone: {
                      equals: phone,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                ]
              : []),
            ...(nationalId
              ? [
                  {
                    nationalId: {
                      equals: nationalId,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                ]
              : []),
          ],
        },
      },
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
        ...(input.officerUserId ? { officerUserId: input.officerUserId } : {}),
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
        OR: [
          { phone: input.phone },
          {
            nationalId: {
              equals: input.nationalId,
              mode: 'insensitive',
            },
          },
        ],
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
        OR: [
          { phone: input.phone },
          {
            nationalId: {
              equals: input.nationalId,
              mode: 'insensitive',
            },
          },
        ],
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

  findBranchOperationForDay(input: {
    tenantId: string;
    branchId: string;
    operationDate: Date;
  }) {
    return this.prisma.branchDailyOperation.findUnique({
      where: {
        tenantId_branchId_operationDate: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          operationDate: input.operationDate,
        },
      },
      select: { id: true, status: true },
    });
  }

  findAgentFloatForDay(input: {
    tenantId: string;
    branchId: string;
    agentId: string;
    floatDate: Date;
  }) {
    return this.prisma.agentDailyFloat.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        agentId: input.agentId,
        floatDate: input.floatDate,
      },
      select: {
        id: true,
        amountGiven: true,
        amountReturned: true,
        returnedAt: true,
      },
    });
  }

  sumSubmittedPrincipalForOfficer(input: {
    tenantId: string;
    branchId: string;
    officerUserId: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.loanApplication.aggregate({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        officerUserId: input.officerUserId,
        status: LoanApplicationStatus.SUBMITTED,
        submittedAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: { principalAmount: true },
      _count: { _all: true },
    });
  }

  sumDisbursementsForOfficer(input: {
    tenantId: string;
    branchId: string;
    officerUserId: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.loanDisbursement.aggregate({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        recordedByUserId: input.officerUserId,
        disbursedAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: {
        amount: true,
        assignedFloatAmount: true,
        collectedRepaymentsAmount: true,
      },
      _count: { _all: true },
    });
  }

  sumCollectionsForOfficer(input: {
    tenantId: string;
    branchId: string;
    officerUserId: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    return this.prisma.repayment.aggregate({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        recordedByUserId: input.officerUserId,
        voidedAt: null,
        paidAt: {
          gte: input.dayStart,
          lte: input.dayEnd,
        },
      },
      _sum: { amount: true },
      _count: { _all: true },
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
    goLiveAt: Date;
    paymentStartDate: Date | null;
    initialDisbursementAmount: number;
    assignedFloatAmount: number;
    collectedRepaymentsAmount: number;
    disbursementSource: LoanDisbursementSource;
    loanStatus: LoanStatus;
    disbursementNote: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const fullName = [
        input.application.givenNames?.trim().replace(/\s+/g, ' ').toUpperCase(),
        input.application.surname?.trim().replace(/\s+/g, ' ').toUpperCase(),
      ]
        .filter(Boolean)
        .join(' ');

      let customerId = input.application.customerId;
      if (!customerId) {
        const identities: Prisma.CustomerWhereInput[] = [];
        if (input.application.phone?.trim()) {
          identities.push({ phone: input.application.phone });
        }
        if (input.application.nationalId?.trim()) {
          identities.push({
            nationalId: {
              equals: input.application.nationalId.trim().toUpperCase(),
              mode: 'insensitive',
            },
          });
        }
        const existing = identities.length
          ? await tx.customer.findFirst({
              where: {
                tenantId: input.application.tenantId,
                branchId: input.application.branchId,
                OR: identities,
              },
            })
          : null;

        if (existing) {
          customerId = existing.id;
        } else {
          const created = await tx.customer.create({
            data: {
              tenantId: input.application.tenantId,
              branchId: input.application.branchId,
              fullName: fullName || 'Unknown applicant',
              phone: input.application.phone!.trim(),
              nationalId:
                input.application.nationalId?.trim().toUpperCase() || null,
              verifiedAt: input.application.verifiedAt,
            },
          });
          customerId = created.id;
        }
      }

      const selectedCustomer = await tx.customer.findUniqueOrThrow({
        where: { id: customerId },
        select: { id: true, branchId: true, phone: true, nationalId: true },
      });
      const canonicalNationalId = selectedCustomer.nationalId
        ?.trim()
        .toUpperCase();
      const canonicalPhone = selectedCustomer.phone.trim().toUpperCase();
      const canonicalIdentity = canonicalNationalId
        ? `NIN:${canonicalNationalId}`
        : canonicalPhone
          ? `PHONE:${canonicalPhone}`
          : `CUSTOMER:${customerId}`;

      // Lock and check the stable borrower identity, not only the selected
      // customer row. Legacy imports may contain multiple rows for one person.
      await tx.$executeRaw(
        Prisma.sql`
          SELECT pg_advisory_xact_lock(
            hashtext(${input.application.tenantId}),
            hashtext(${canonicalIdentity})
          )
        `,
      );
      const identityCustomers = await tx.customer.findMany({
        where: {
          tenantId: input.application.tenantId,
          branchId: input.application.branchId,
          OR: [
            { id: customerId },
            ...(canonicalNationalId
              ? [
                  {
                    nationalId: {
                      equals: canonicalNationalId,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                ]
              : []),
            ...(canonicalPhone
              ? [
                  {
                    phone: {
                      equals: selectedCustomer.phone.trim(),
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                ]
              : []),
          ],
        },
        select: { id: true },
      });
      const existingOpenLoan = await tx.loan.findFirst({
        where: {
          tenantId: input.application.tenantId,
          branchId: input.application.branchId,
          customerId: { in: identityCustomers.map((customer) => customer.id) },
          status: {
            notIn: [
              LoanStatus.REJECTED,
              LoanStatus.WRITTEN_OFF,
              LoanStatus.CLOSED,
            ],
          },
        },
        select: { id: true },
      });
      if (existingOpenLoan) {
        throw new ConflictException(
          'This borrower already has an open loan. Close or resolve it before creating another loan.',
        );
      }

      const principal =
        input.application.principalAmount ?? new Prisma.Decimal(0);
      const rate = Number(input.application.interestRatePercent ?? 0);
      const days = input.application.durationDays ?? 0;
      const fee = Number(input.application.processingFee ?? 0);
      // Snapshot total repayable at submit (flat percent interest). Wallet
      // openingBalance / loan.balance keep this value even if pricing changes later.
      const pricing = computeLoanPricing({
        principalAmount: Number(principal),
        interestRatePercent: rate,
        durationDays: days,
        processingFee: fee,
      });
      const balance = new Prisma.Decimal(pricing.totalRepayable);
      const loan = await tx.loan.create({
        data: {
          tenantId: input.application.tenantId,
          branchId: input.application.branchId,
          customerId,
          principal,
          balance,
          currency: input.currency,
          status: input.loanStatus,
          approvedAt: input.goLiveAt,
          disbursedAt:
            input.loanStatus === LoanStatus.CURRENT ? input.goLiveAt : null,
          paymentStartDate: input.paymentStartDate,
        },
      });

      await tx.loanDisbursement.create({
        data: {
          tenantId: input.application.tenantId,
          branchId: input.application.branchId,
          loanId: loan.id,
          recordedByUserId: input.actorUserId,
          amount: new Prisma.Decimal(
            input.initialDisbursementAmount.toFixed(2),
          ),
          assignedFloatAmount: new Prisma.Decimal(
            input.assignedFloatAmount.toFixed(2),
          ),
          collectedRepaymentsAmount: new Prisma.Decimal(
            input.collectedRepaymentsAmount.toFixed(2),
          ),
          source: input.disbursementSource,
          disbursedAt: input.goLiveAt,
          note: input.disbursementNote,
        },
      });

      await tx.clientWallet.create({
        data: {
          tenantId: input.application.tenantId,
          branchId: input.application.branchId,
          customerId,
          loanId: loan.id,
          loanApplicationId: input.application.id,
          currency: input.currency,
          openingBalance: balance,
        },
      });

      const application = await tx.loanApplication.update({
        where: { id: input.application.id },
        data: {
          customerId,
          loanId: loan.id,
          status: LoanApplicationStatus.SUBMITTED,
          submittedAt: input.goLiveAt,
          syncedAt: input.goLiveAt,
          paymentStartDate: input.paymentStartDate,
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
