#!/usr/bin/env node

require('dotenv').config({ path: '.env', quiet: true });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [statusRows, failureGroups, failures, providerLogs, branches] =
    await Promise.all([
    prisma.smsMessage.groupBy({
      by: ['branchId', 'status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { branchId: 'asc' },
    }),
    prisma.smsMessage.groupBy({
      by: ['branchId', 'status', 'failureReason'],
      where: {
        createdAt: { gte: since },
        status: {
          in: [
            'FAILED_VALIDATION',
            'PROVIDER_FAILED',
            'BLOCKED_PROVIDER_UNAVAILABLE',
            'FAILED_INSUFFICIENT_CREDITS',
          ],
        },
      },
      _count: { _all: true },
      orderBy: { branchId: 'asc' },
    }),
    prisma.smsMessage.findMany({
      where: {
        createdAt: { gte: since },
        status: {
          in: [
            'FAILED_VALIDATION',
            'PROVIDER_FAILED',
            'BLOCKED_PROVIDER_UNAVAILABLE',
            'FAILED_INSUFFICIENT_CREDITS',
          ],
        },
      },
      select: {
        branchId: true,
        status: true,
        recipientPhone: true,
        failureReason: true,
        createdAt: true,
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.smsProviderRequestLog.findMany({
      where: { createdAt: { gte: since } },
      select: {
        branchId: true,
        provider: true,
        responseCode: true,
        outcome: true,
        createdAt: true,
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.branch.findMany({
      select: {
        id: true,
        name: true,
        smsWallet: {
          select: {
            availableUnits: true,
            reservedUnits: true,
            status: true,
          },
        },
      },
    }),
  ]);

  process.stdout.write(
    `${JSON.stringify(
      { since, branches, statusRows, failureGroups, failures, providerLogs },
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
