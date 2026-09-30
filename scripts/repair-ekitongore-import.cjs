#!/usr/bin/env node

const { readFileSync } = require('node:fs');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const BRANCH_ID = 'daafb2de-e605-4c87-94bb-9f6dbd53a019';
const BUSINESS_DATE = '2026-09-24';
const CONFIRMED_CLOSING = 144700;

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
const money = (value) => new Prisma.Decimal(Number(value).toFixed(2));

async function main() {
  const branch = await prisma.branch.findUnique({
    where: { id: BRANCH_ID },
    include: { tenant: true },
  });
  if (!branch) throw new Error('Ekitongore branch not found.');

  const orphanLoans = await prisma.loan.findMany({
    where: {
      branchId: BRANCH_ID,
      application: null,
      disbursements: { none: {} },
      repayments: { none: {} },
    },
    select: { id: true, principal: true, wallet: { select: { id: true } } },
  });
  for (const loan of orphanLoans) {
    if (loan.wallet) await prisma.clientWallet.delete({ where: { id: loan.wallet.id } });
    await prisma.loan.delete({ where: { id: loan.id } });
  }

  const operationDate = new Date(`${BUSINESS_DATE}T00:00:00.000Z`);
  const operation = await prisma.branchDailyOperation.findUnique({
    where: {
      tenantId_branchId_operationDate: {
        tenantId: branch.tenantId,
        branchId: branch.id,
        operationDate,
      },
    },
  });
  if (!operation) throw new Error(`No Ekitongore operation exists for ${BUSINESS_DATE}.`);

  const updatedOperation = await prisma.branchDailyOperation.update({
    where: { id: operation.id },
    data: {
      closingBalance: money(CONFIRMED_CLOSING),
      closingNotes:
        '[COGLIM-EKITONGORE] Confirmed Coglim cutover closing cash UGX 144,700.',
    },
  });

  console.log(JSON.stringify({
    branch: branch.name,
    tenant: branch.tenant.name,
    orphanLoansRemoved: orphanLoans.map((loan) => ({
      id: loan.id,
      principal: Number(loan.principal),
    })),
    businessDate: BUSINESS_DATE,
    operationStatus: updatedOperation.status,
    closingBalance: Number(updatedOperation.closingBalance),
  }, null, 2));
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
