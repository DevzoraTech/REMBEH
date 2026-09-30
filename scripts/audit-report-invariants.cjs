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
const cents = (value) => Math.round(Number(value || 0) * 100);

async function main() {
  const reports = await prisma.branchOperationReport.findMany({
    include: { branch: { select: { name: true } } },
    orderBy: [{ operationDate: "asc" }, { reportNumber: "asc" }],
  });
  const failures = [];
  for (const report of reports) {
    const snapshot = report.snapshot || {};
    const value = snapshot.portfolioPerformance || {};
    const repaymentsTotal = (snapshot.repayments || []).reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    const label = `${report.branch.name} ${report.operationDate.toISOString().slice(0, 10)} ${report.reportNumber}`;
    const checks = [
      [Number(snapshot.version) === 14, "snapshot version is not 14"],
      [value.closedLoans != null, "closedLoans is missing"],
      [value.closedLoansAmount != null, "closedLoansAmount is missing"],
      [
        Number(value.borrowersPaid || 0) +
          Number(value.borrowersMissed || 0) ===
          Number(value.borrowersDue || 0),
        "paid + unpaid does not equal due",
      ],
      [
        cents(value.totalRepaid) === cents(repaymentsTotal),
        "paid amount does not equal repayment-detail total",
      ],
      [
        cents(value.totalStillDue) <= cents(value.totalDue),
        "unpaid amount exceeds amount due",
      ],
      [
        Number(value.closedLoans || 0) >= 0 &&
          cents(value.closedLoansAmount) >= 0,
        "closed loan values are negative",
      ],
    ];
    const expectedRate =
      Number(value.borrowersDue || 0) === 0
        ? 0
        : Math.round(
            (Number(value.borrowersPaid || 0) / Number(value.borrowersDue)) *
              10000,
          ) / 100;
    checks.push([
      Math.abs(Number(value.payerRatePercent || 0) - expectedRate) < 0.001,
      "payer rate does not match paid/due counts",
    ]);
    for (const [ok, message] of checks) {
      if (!ok) failures.push({ report: label, message });
    }
  }
  console.log(JSON.stringify({ reports: reports.length, failures }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
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
