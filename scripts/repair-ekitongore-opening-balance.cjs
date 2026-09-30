#!/usr/bin/env node

require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { Prisma } = require('@prisma/client');
const { AppModule } = require('../services/api/dist/src/app.module');
const {
  OperationsService,
} = require('../services/api/dist/src/modules/operations/operations.service');

const BRANCH_ID = 'daafb2de-e605-4c87-94bb-9f6dbd53a019';
const BUSINESS_DATE = '2026-09-24';
const OPENING_BALANCE = 144700;

async function main() {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const service = app.get(OperationsService);
    const prisma = service.repository.prisma;
    const bounds = service.parseDayBounds(BUSINESS_DATE);
    const operation = await service.repository.findOperationForDay({
      tenantId: (await prisma.branch.findUniqueOrThrow({ where: { id: BRANCH_ID } })).tenantId,
      branchId: BRANCH_ID,
      operationDate: bounds.dateOnly,
    });
    if (!operation) throw new Error(`No Ekitongore operation exists for ${BUSINESS_DATE}.`);

    const before = {
      previousClosingBalance: Number(operation.previousClosingBalance),
      openingFloatAvailable: Number(operation.openingFloatAvailable),
      floatSetAsideAmount: Number(operation.floatSetAsideAmount),
      closingBalance: operation.closingBalance == null ? null : Number(operation.closingBalance),
    };

    if (!apply) {
      console.log(JSON.stringify({ apply: false, operationId: operation.id, before, proposedOpeningBalance: OPENING_BALANCE }, null, 2));
      return;
    }

    if (before.previousClosingBalance !== 0 && before.previousClosingBalance !== OPENING_BALANCE) {
      throw new Error(`Refusing to replace non-zero opening balance ${before.previousClosingBalance}.`);
    }

    const opening = new Prisma.Decimal(OPENING_BALANCE);
    await prisma.$transaction(async (tx) => {
      await tx.branchDailyOperation.update({
        where: { id: operation.id },
        data: {
          previousClosingBalance: opening,
          openingFloatAvailable: opening,
          floatSetAsideAmount: opening,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: operation.tenantId,
          actorUserId: operation.openedByUserId,
          action: 'operations.opening_balance.corrected',
          entityType: 'branch_daily_operation',
          entityId: operation.id,
          oldValue: before,
          newValue: {
            previousClosingBalance: OPENING_BALANCE,
            openingFloatAvailable: OPENING_BALANCE,
            floatSetAsideAmount: OPENING_BALANCE,
            closingBalance: before.closingBalance,
            reason: 'Restored confirmed Coglim cutover cash as the first Rembeh operating-day opening balance.',
          },
        },
      });
    });

    const refreshed = await service.refreshDayAfterRepaymentCorrection({
      tenantId: operation.tenantId,
      branchId: operation.branchId,
      operationDate: BUSINESS_DATE,
      actorUserId: operation.openedByUserId,
    });

    console.log(JSON.stringify({ apply: true, operationId: operation.id, before, after: refreshed }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
