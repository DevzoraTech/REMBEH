import { Injectable } from '@nestjs/common';
import { BorrowerListType, CustomerVoidDisposition, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CUSTOMER_EVENTS,
  CustomerRegisteredEventPayload,
} from './customers.events';
import { CUSTOMER_PERMISSIONS } from './customers.permissions';

type CreateCustomerRecordInput = {
  tenantId: string;
  branchId: string;
  actorUserId: string;
  fullName: string;
  phone: string;
  nationalId?: string | null;
  email?: string | null;
};

const customerMediaSelect = {
  id: true,
  type: true,
  storageKey: true,
  mimeType: true,
  byteSize: true,
  fileName: true,
  createdAt: true,
} satisfies Prisma.LoanApplicationMediaSelect;

const applicationSummarySelect = {
  id: true,
  status: true,
  verifiedAt: true,
  templateName: true,
  loanProductTemplate: { select: { name: true } },
  loanPurpose: true,
  collateralType: true,
  district: true,
  subCounty: true,
  parish: true,
  village: true,
  updatedAt: true,
  createdAt: true,
  officer: {
    select: {
      displayName: true,
      publicId: true,
    },
  },
} satisfies Prisma.LoanApplicationSelect;

const applicationDetailSelect = {
  ...applicationSummarySelect,
  media: {
    select: customerMediaSelect,
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.LoanApplicationSelect;

const customerListInclude = {
  branch: { select: { id: true, name: true } },
  loanApplications: {
    select: applicationSummarySelect,
    orderBy: { createdAt: 'asc' as const },
    take: 20,
  },
  loans: {
    select: {
      id: true,
      status: true,
      balance: true,
      isFined: true,
    },
  },
  _count: { select: { loans: true } },
} satisfies Prisma.CustomerInclude;

const customerDetailInclude = {
  branch: { select: { id: true, name: true } },
  loanApplications: {
    select: applicationDetailSelect,
    orderBy: { updatedAt: 'desc' as const },
    take: 50,
  },
  loans: {
    include: {
      wallet: true,
      application: {
        select: {
          id: true,
          submittedAt: true,
          templateName: true,
          interestRatePercent: true,
          processingFee: true,
          durationDays: true,
          loanProductTemplate: { select: { name: true } },
          loanPurpose: true,
          collateralType: true,
          district: true,
          subCounty: true,
          parish: true,
          village: true,
          media: {
            select: customerMediaSelect,
            orderBy: { createdAt: 'asc' as const },
          },
          officer: {
            select: {
              displayName: true,
              publicId: true,
            },
          },
        },
      },
      repayments: {
        orderBy: { paidAt: 'desc' as const },
        include: {
          recordedBy: {
            select: {
              displayName: true,
              publicId: true,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' as const },
  },
} satisfies Prisma.CustomerInclude;

export type CustomerDetailRecord = Prisma.CustomerGetPayload<{
  include: typeof customerDetailInclude;
}>;

export type CustomerListRecord = Prisma.CustomerGetPayload<{
  include: typeof customerListInclude;
}>;

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTenantAndPhone(input: { tenantId: string; phone: string }) {
    return this.prisma.customer.findFirst({
      where: {
        tenantId: input.tenantId,
        phone: input.phone,
      },
      select: { id: true },
    });
  }

  listForScope(input: {
    tenantId: string;
    branchId?: string | null;
    limit?: number;
  }): Promise<CustomerListRecord[]> {
    return this.prisma.customer.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      include: customerListInclude,
      orderBy: { createdAt: 'desc' },
      ...(input.branchId
        ? {}
        : {
            take: input.limit ?? 2000,
          }),
    });
  }

  findByIdForScope(input: {
    tenantId: string;
    branchId?: string | null;
    customerId: string;
  }): Promise<CustomerDetailRecord | null> {
    return this.prisma.customer.findFirst({
      where: {
        id: input.customerId,
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      include: customerDetailInclude,
    });
  }

  createWithAuditAndOutbox(input: CreateCustomerRecordInput) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          fullName: input.fullName,
          phone: input.phone,
          nationalId: input.nationalId ?? null,
          email: input.email ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: CUSTOMER_PERMISSIONS.create,
          entityType: 'customer',
          entityId: customer.id,
          newValue: {
            id: customer.id,
            branchId: customer.branchId,
            fullName: customer.fullName,
            phone: customer.phone,
          },
        },
      });

      const payload: CustomerRegisteredEventPayload = {
        customerId: customer.id,
        branchId: input.branchId,
        registeredByUserId: input.actorUserId,
        fullName: customer.fullName,
        phone: customer.phone,
      };

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: CUSTOMER_EVENTS.registered,
          aggregateType: 'customer',
          aggregateId: customer.id,
          payload,
        },
      });

      return customer;
    });
  }

  /** National IDs / customer IDs present on blacklist or watchlist. */
  async listRiskHits(input: {
    tenantId: string;
    customerIds: string[];
    nationalIds: string[];
  }) {
    if (input.customerIds.length === 0 && input.nationalIds.length === 0) {
      return [] as Array<{
        customerId: string | null;
        nationalId: string;
        type: string;
      }>;
    }

    return this.prisma.borrowerListEntry.findMany({
      where: {
        tenantId: input.tenantId,
        OR: [
          ...(input.customerIds.length
            ? [{ customerId: { in: input.customerIds } }]
            : []),
          ...(input.nationalIds.length
            ? [{ nationalId: { in: input.nationalIds } }]
            : []),
        ],
      },
      select: {
        customerId: true,
        nationalId: true,
        type: true,
      },
    });
  }

  voidCustomer(input: {
    tenantId: string;
    customerId: string;
    actorUserId: string;
    disposition: CustomerVoidDisposition;
    reason: string | null;
    fullName: string;
    phone: string;
    nationalId: string | null;
    branchId: string | null;
  }) {
    const listType =
      input.disposition === CustomerVoidDisposition.BLACKLISTED
        ? BorrowerListType.BLACKLISTED
        : BorrowerListType.WATCHLIST;
    const nationalId = input.nationalId?.trim().toUpperCase() || null;

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.update({
        where: { id: input.customerId },
        data: {
          voidedAt: new Date(),
          voidedByUserId: input.actorUserId,
          voidDisposition: input.disposition,
          voidReason: input.reason,
        },
      });

      if (nationalId && nationalId.length >= 5) {
        await tx.borrowerListEntry.upsert({
          where: {
            tenantId_nationalId: {
              tenantId: input.tenantId,
              nationalId,
            },
          },
          create: {
            tenantId: input.tenantId,
            branchId: input.branchId,
            customerId: input.customerId,
            createdByUserId: input.actorUserId,
            type: listType,
            fullName: input.fullName,
            nationalId,
            phone: input.phone,
            reason: input.reason,
          },
          update: {
            branchId: input.branchId,
            customerId: input.customerId,
            type: listType,
            fullName: input.fullName,
            phone: input.phone,
            reason: input.reason,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'customer.void',
          entityType: 'customer',
          entityId: customer.id,
          oldValue: {
            voidedAt: null,
          },
          newValue: {
            voidedAt: customer.voidedAt,
            voidDisposition: customer.voidDisposition,
            voidReason: customer.voidReason,
          },
        },
      });

      return customer;
    });
  }

  restoreCustomer(input: {
    tenantId: string;
    customerId: string;
    actorUserId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.update({
        where: { id: input.customerId },
        data: {
          voidedAt: null,
          voidedByUserId: null,
          voidDisposition: null,
          voidReason: null,
        },
      });

      await tx.borrowerListEntry.deleteMany({
        where: {
          tenantId: input.tenantId,
          customerId: input.customerId,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'customer.restore',
          entityType: 'customer',
          entityId: customer.id,
          newValue: {
            voidedAt: null,
          },
        },
      });

      return customer;
    });
  }
}
