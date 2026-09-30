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
const amount = (value) => (value == null ? null : Number(value));
const date = (value) => value.toISOString().slice(0, 10);

async function main() {
  const branch = await prisma.branch.findFirst({
    where: { name: { contains: 'EKITONGORE', mode: 'insensitive' } },
    select: { id: true, name: true, tenant: { select: { name: true } } },
  });
  if (!branch) throw new Error('Ekitongore branch was not found.');

  const operations = await prisma.branchDailyOperation.findMany({
    where: {
      branchId: branch.id,
      operationDate: { gte: new Date('2026-09-23T00:00:00.000Z') },
    },
    orderBy: { operationDate: 'asc' },
    include: { report: { select: { status: true, snapshot: true } } },
  });

  const rows = operations.map((operation, index) => {
    const previous = operations[index - 1];
    const snapshot = operation.report?.snapshot ?? {};
    const cash = snapshot.cashPosition ?? snapshot.operation?.cashPosition ?? {};
    return {
      date: date(operation.operationDate),
      status: operation.status,
      opening: amount(operation.previousClosingBalance),
      cashAdded: amount(operation.cashAddedToday),
      closing: amount(operation.closingBalance),
      reportStatus: operation.report?.status ?? null,
      reportOpening: amount(cash.openingBalance),
      reportExpectedClosing: amount(cash.expectedClosingBalance),
      inheritedPreviousClosing:
        !previous || previous.closingBalance == null
          ? null
          : amount(operation.previousClosingBalance) === amount(previous.closingBalance),
      previousDayClosing: previous ? amount(previous.closingBalance) : null,
      notes: operation.closingNotes,
      snapshot: operation.report?.snapshot ?? null,
    };
  });

  console.log(JSON.stringify({ tenant: branch.tenant.name, branch: branch.name, rows }, null, 2));
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
