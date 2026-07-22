import { Injectable } from '@nestjs/common';
import { BorrowerListType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  BORROWER_LIST_EVENTS,
  BorrowerListEventPayload,
} from './borrower-lists.events';
import { BORROWER_LIST_PERMISSIONS } from './borrower-lists.permissions';

const borrowerListEntrySelect = {
  id: true,
  tenantId: true,
  branchId: true,
  customerId: true,
  createdByUserId: true,
  type: true,
  fullName: true,
  nationalId: true,
  phone: true,
  reason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BorrowerListEntrySelect;

export type BorrowerListEntryRecord = Prisma.BorrowerListEntryGetPayload<{
  select: typeof borrowerListEntrySelect;
}>;

type SaveEntryInput = {
  tenantId: string;
  branchId: string | null;
  customerId?: string | null;
  actorUserId: string;
  type: BorrowerListType;
  fullName?: string | null;
  nationalId: string;
  phone?: string | null;
  reason?: string | null;
};

@Injectable()
export class BorrowerListsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(input: {
    tenantId: string;
    branchId?: string | null;
    type?: BorrowerListType | null;
  }): Promise<BorrowerListEntryRecord[]> {
    return this.prisma.borrowerListEntry.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(input.type ? { type: input.type } : {}),
      },
      select: borrowerListEntrySelect,
      orderBy: { updatedAt: 'desc' },
    });
  }

  findById(input: {
    tenantId: string;
    branchId?: string | null;
    id: string;
  }): Promise<BorrowerListEntryRecord | null> {
    return this.prisma.borrowerListEntry.findFirst({
      where: {
        id: input.id,
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      select: borrowerListEntrySelect,
    });
  }

  findByNationalId(input: {
    tenantId: string;
    nationalId: string;
  }): Promise<BorrowerListEntryRecord | null> {
    return this.prisma.borrowerListEntry.findUnique({
      where: {
        tenantId_nationalId: {
          tenantId: input.tenantId,
          nationalId: input.nationalId,
        },
      },
      select: borrowerListEntrySelect,
    });
  }

  findCustomerForScope(input: {
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
      },
    });
  }

  saveWithAuditAndOutbox(input: SaveEntryInput) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.borrowerListEntry.upsert({
        where: {
          tenantId_nationalId: {
            tenantId: input.tenantId,
            nationalId: input.nationalId,
          },
        },
        create: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          customerId: input.customerId ?? null,
          createdByUserId: input.actorUserId,
          type: input.type,
          fullName: input.fullName ?? null,
          nationalId: input.nationalId,
          phone: input.phone ?? null,
          reason: input.reason ?? null,
        },
        update: {
          branchId: input.branchId,
          customerId: input.customerId ?? null,
          createdByUserId: input.actorUserId,
          type: input.type,
          fullName: input.fullName ?? null,
          phone: input.phone ?? null,
          reason: input.reason ?? null,
        },
        select: borrowerListEntrySelect,
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: BORROWER_LIST_PERMISSIONS.manage,
          entityType: 'borrower_list_entry',
          entityId: entry.id,
          newValue: {
            id: entry.id,
            type: entry.type,
            customerId: entry.customerId,
            nationalId: entry.nationalId,
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: BORROWER_LIST_EVENTS.saved,
          aggregateType: 'borrower_list_entry',
          aggregateId: entry.id,
          payload: this.toEventPayload(entry),
        },
      });

      return entry;
    });
  }

  updateWithAuditAndOutbox(input: {
    tenantId: string;
    actorUserId: string;
    entry: BorrowerListEntryRecord;
    data: Prisma.BorrowerListEntryUpdateInput;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.borrowerListEntry.update({
        where: { id: input.entry.id },
        data: input.data,
        select: borrowerListEntrySelect,
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: BORROWER_LIST_PERMISSIONS.manage,
          entityType: 'borrower_list_entry',
          entityId: entry.id,
          oldValue: {
            type: input.entry.type,
            reason: input.entry.reason,
          },
          newValue: {
            type: entry.type,
            reason: entry.reason,
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: BORROWER_LIST_EVENTS.saved,
          aggregateType: 'borrower_list_entry',
          aggregateId: entry.id,
          payload: this.toEventPayload(entry),
        },
      });

      return entry;
    });
  }

  removeWithAuditAndOutbox(input: {
    tenantId: string;
    actorUserId: string;
    entry: BorrowerListEntryRecord;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.borrowerListEntry.delete({
        where: { id: input.entry.id },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: BORROWER_LIST_PERMISSIONS.manage,
          entityType: 'borrower_list_entry',
          entityId: input.entry.id,
          oldValue: {
            type: input.entry.type,
            customerId: input.entry.customerId,
            nationalId: input.entry.nationalId,
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: BORROWER_LIST_EVENTS.removed,
          aggregateType: 'borrower_list_entry',
          aggregateId: input.entry.id,
          payload: this.toEventPayload(input.entry),
        },
      });
    });
  }

  private toEventPayload(
    entry: BorrowerListEntryRecord,
  ): BorrowerListEventPayload {
    return {
      entryId: entry.id,
      type: entry.type,
      nationalId: entry.nationalId,
      customerId: entry.customerId,
      actorUserId: entry.createdByUserId,
    };
  }
}
