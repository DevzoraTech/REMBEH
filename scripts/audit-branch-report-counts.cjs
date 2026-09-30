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
const number = (value) => Number(value || 0);
const snapshotPerformance = (snapshot) =>
  snapshot?.portfolioPerformance ??
  snapshot?.portfolio?.performance ??
  snapshot?.operation?.portfolioPerformance ??
  null;

async function main() {
  const branches = await prisma.branch.findMany({
    include: { tenant: { select: { name: true } } },
    orderBy: [{ tenant: { name: 'asc' } }, { name: 'asc' }],
  });
  for (const branch of branches) {
    const [customers, loans, reports] = await Promise.all([
      prisma.customer.count({ where: { branchId: branch.id, voidedAt: null } }),
      prisma.loan.findMany({
        where: { branchId: branch.id },
        select: {
          id: true,
          customerId: true,
          status: true,
          balance: true,
          principal: true,
        },
      }),
      prisma.branchOperationReport.findMany({
        where: { branchId: branch.id },
        orderBy: { operationDate: 'desc' },
        take: 5,
        select: {
          id: true,
          reportNumber: true,
          operationDate: true,
          status: true,
          snapshot: true,
        },
      }),
    ]);
    const open = loans.filter((loan) =>
      ['CURRENT', 'IN_ARREARS', 'PARTIALLY_DISBURSED'].includes(loan.status),
    );
    const positive = loans.filter((loan) => number(loan.balance) > 0);
    const closedPositive = loans.filter(
      (loan) => loan.status === 'CLOSED' && number(loan.balance) > 0,
    );
    const unique = (rows) => new Set(rows.map((row) => row.customerId)).size;
    console.log(JSON.stringify({
      tenant: branch.tenant.name,
      branch: branch.name,
      branchId: branch.id,
      registeredBorrowers: customers,
      totalLoanCycles: loans.length,
      openLoans: open.length,
      openBorrowers: unique(open),
      positiveBalanceLoans: positive.length,
      positiveBalanceBorrowers: unique(positive),
      closedLoansWithPositiveBalance: closedPositive.length,
      closedBorrowersWithPositiveBalance: unique(closedPositive),
      recentReports: reports.map((report) => ({
        id: report.id,
        number: report.reportNumber,
        date: report.operationDate.toISOString().slice(0, 10),
        status: report.status,
        portfolioPerformance: snapshotPerformance(report.snapshot),
      })),
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
