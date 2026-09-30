#!/usr/bin/env node

const { readFileSync } = require("node:fs");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match || process.env[match[1]]) continue;
  process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
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
  const branchName = process.argv[2] ?? "ISHONGORORO";
  const date = process.argv[3] ?? "2026-09-24";
  const reportNumber = process.argv[4];
  const report = await prisma.branchOperationReport.findFirstOrThrow({
    where: reportNumber
      ? { reportNumber }
      : {
          branch: { name: { contains: branchName, mode: "insensitive" } },
          operationDate: {
            gte: new Date(`${date}T00:00:00.000Z`),
            lt: new Date(`${date}T23:59:59.999Z`),
          },
        },
    orderBy: { createdAt: "desc" },
    include: { branch: { select: { name: true } } },
  });
  const snapshot = report.snapshot;
  const repayments = snapshot.repayments ?? [];
  const loanIds = [...new Set(repayments.map((row) => row.loanId))];
  const loans = await prisma.loan.findMany({
    where: { id: { in: loanIds } },
    select: { id: true, status: true },
  });
  const statuses = new Map(loans.map((loan) => [loan.id, loan.status]));
  const repaymentTotalsByCurrentLoanStatus = repayments.reduce(
    (totals, row) => {
      const status = statuses.get(row.loanId) ?? "MISSING";
      totals[status] = (totals[status] ?? 0) + Number(row.amount ?? 0);
      return totals;
    },
    {},
  );
  console.log(
    JSON.stringify(
      {
        branch: report.branch.name,
        report: report.reportNumber,
        status: report.status,
        snapshotVersion: snapshot.version,
        collectionsReceived: snapshot.collectionsReceived,
        portfolioPerformance: snapshot.portfolioPerformance,
        repaymentsCount: repayments.length,
        repaymentsSum: repayments.reduce(
          (sum, row) => sum + Number(row.amount ?? 0),
          0,
        ),
        repaymentTotalsByCurrentLoanStatus,
        repayments,
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
