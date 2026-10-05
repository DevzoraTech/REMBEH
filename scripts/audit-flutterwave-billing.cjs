#!/usr/bin/env node

const { readFileSync } = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match || process.env[match[1]]) continue;
  process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
}

const url = new URL(process.env.DATABASE_URL);
const pool = new Pool({
  host: url.hostname,
  port: Number(url.port || 5432),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.slice(1)),
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const safePayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  return {
    id: payload.id ?? null,
    tx_ref: payload.tx_ref ?? null,
    flw_ref: payload.flw_ref ?? null,
    status: payload.status ?? null,
    amount: payload.amount ?? null,
    charged_amount: payload.charged_amount ?? null,
    currency: payload.currency ?? null,
    payment_type: payload.payment_type ?? null,
    processor_response: payload.processor_response ?? null,
    failure_reason: payload.failure_reason ?? null,
    provider_environment: payload.provider_environment ?? null,
  };
};

async function main() {
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
  const branches = await prisma.branch.findMany({
    where: {
      OR: [
        { name: { contains: 'ISHONGORORO', mode: 'insensitive' } },
        { tenant: { name: { contains: 'ISHONGORORO', mode: 'insensitive' } } },
      ],
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      tenant: { select: { name: true } },
      subscription: true,
      smsWallet: true,
    },
  });
  const branchIds = branches.map((branch) => branch.id);

  const [users, subscriptionPayments, smsPurchases, ledger, messages] =
    await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { branchId: { in: branchIds } },
            { email: { in: ['sarahnisimenta316@gmail.com', 'akundwerena@gmail.com'] } },
          ],
        },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          email: true,
          displayName: true,
          status: true,
        },
      }),
      prisma.subscriptionPayment.findMany({
        where: {
          createdAt: { gte: since },
          OR: [{ branchId: { in: branchIds } }, { amount: { in: [20000, 120000] } }],
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.smsPurchase.findMany({
        where: {
          createdAt: { gte: since },
          OR: [{ branchId: { in: branchIds } }, { amountExpected: { in: [20000, 120000] } }],
        },
        include: {
          branch: { select: { name: true } },
          bundle: { select: { name: true, smsUnits: true, priceUgx: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.smsWalletLedger.findMany({
        where: { branchId: { in: branchIds }, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.smsMessage.groupBy({
        by: ['branchId', 'status'],
        where: { branchId: { in: branchIds }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        branches,
        users,
        subscriptionPayments: subscriptionPayments.map((row) => ({
          ...row,
          amount: Number(row.amount),
          rawPayload: safePayload(row.rawPayload),
        })),
        smsPurchases: smsPurchases.map((row) => ({
          ...row,
          rawPayload: safePayload(row.rawPayload),
        })),
        ledger,
        messageStatusCounts: messages,
      },
      null,
      2,
    ),
  );
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
