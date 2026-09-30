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

async function main() {
  const query = (process.argv[2] || '').trim();
  if (!query) throw new Error('Pass a branch name fragment.');
  const branches = await prisma.branch.findMany({
    where: { name: { contains: query, mode: 'insensitive' } },
    include: { tenant: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  for (const branch of branches) {
    const [customers, loans, repayments, operations, applications, openPortfolio] = await Promise.all([
      prisma.customer.count({ where: { branchId: branch.id } }),
      prisma.loan.count({ where: { branchId: branch.id } }),
      prisma.repayment.count({ where: { branchId: branch.id } }),
      prisma.branchDailyOperation.count({ where: { branchId: branch.id } }),
      prisma.loanApplication.count({ where: { branchId: branch.id } }),
      prisma.loan.aggregate({
        where: { branchId: branch.id, status: { in: ['CURRENT', 'IN_ARREARS'] } },
        _count: { _all: true },
        _sum: { principal: true, balance: true },
      }),
    ]);
    console.log(JSON.stringify({
      branchId: branch.id,
      branchName: branch.name,
      tenantId: branch.tenant.id,
      tenantName: branch.tenant.name,
      customers,
      loans,
      repayments,
      operations,
      applications,
      openLoans: openPortfolio._count._all,
      openPrincipal: Number(openPortfolio._sum.principal || 0),
      openBalance: Number(openPortfolio._sum.balance || 0),
      createdAt: branch.createdAt,
    }));
    const recentOperations = await prisma.branchDailyOperation.findMany({
      where: { branchId: branch.id },
      orderBy: { operationDate: 'desc' },
      take: 5,
      select: {
        id: true,
        operationDate: true,
        status: true,
        previousClosingBalance: true,
        openingFloatAvailable: true,
        cashAddedToday: true,
        floatSetAsideAmount: true,
        closingBalance: true,
        notes: true,
        closingNotes: true,
      },
    });
    console.log(JSON.stringify({ recentOperations }, null, 2));
    const invalidSchedules = await prisma.loanApplication.count({
      where: {
        branchId: branch.id,
        OR: [
          { durationDays: { not: 30 } },
          { repaymentFrequency: { not: 'DAILY' } },
          { paymentStartDate: null },
        ],
      },
    });
    const [importedApplications, invalidImportedSchedules] = await Promise.all([
      prisma.loanApplication.count({
        where: { branchId: branch.id, localId: { startsWith: 'coglim-app-eki-' } },
      }),
      prisma.loanApplication.count({
        where: {
          branchId: branch.id,
          localId: { startsWith: 'coglim-app-eki-' },
          OR: [
            { durationDays: { not: 30 } },
            { repaymentFrequency: { not: 'DAILY' } },
            { paymentStartDate: null },
          ],
        },
      }),
    ]);
    console.log(JSON.stringify({
      importedApplications,
      invalidImportedSchedules,
      invalidSchedulesIncludingPreexistingDrafts: invalidSchedules,
    }));
  }
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
