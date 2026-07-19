import { Injectable } from '@nestjs/common';
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
  }) {
    return this.prisma.customer.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit ?? 100,
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
}
