#!/usr/bin/env node

const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const PACK_PATH = process.env.COGLIM_IMPORT_PATH;
const BRANCH_ID = process.env.LEGACY_BRANCH_ID;
const DRY_RUN = process.env.DRY_RUN === '1';
if (!PACK_PATH || !BRANCH_ID) {
  throw new Error('COGLIM_IMPORT_PATH and LEGACY_BRANCH_ID are required.');
}

for (const file of [resolve('.env'), resolve('../../.env')]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
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
const decimal = (value) => new Prisma.Decimal(Number(value || 0).toFixed(2));
const atNine = (iso) => new Date(`${iso}T09:00:00.000Z`);
const validDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());
const splitName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return { surname: parts[0] || null, givenNames: parts.slice(1).join(' ') || null };
};

async function main() {
  const pack = JSON.parse(readFileSync(PACK_PATH, 'utf8'));
  const branch = await prisma.branch.findUnique({ where: { id: BRANCH_ID } });
  if (!branch) throw new Error(`Branch ${BRANCH_ID} was not found.`);
  const recorder = await prisma.user.findFirst({
    where: { tenantId: branch.tenantId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!recorder) throw new Error('No active audit recorder exists.');
  const customers = new Map(pack.customers.map((row) => [String(row.sourceId), row]));
  let matched = 0;
  let alreadyLinked = 0;
  let missing = 0;
  let created = 0;

  for (const row of pack.loans) {
    const issue = await prisma.loanDisbursement.findUnique({
      where: { localId: `cil-issue-${row.sourceLoanKey}` },
      select: {
        disbursedAt: true,
        loan: {
          select: {
            id: true,
            customerId: true,
            application: { select: { id: true } },
          },
        },
      },
    });
    if (!issue || !issue.loan) {
      missing += 1;
      continue;
    }
    matched += 1;
    if (issue.loan.application) {
      alreadyLinked += 1;
      continue;
    }
    if (DRY_RUN) {
      created += 1;
      continue;
    }
    const customer = customers.get(String(row.sourceCustomerId));
    const name = splitName(customer?.fullName);
    const durationDays = Math.max(1, Number(row.durationDays) || 30);
    const sourceIssuedAt = row.issuedOn ? atNine(row.issuedOn) : issue.disbursedAt;
    const proposedStart = row.paymentStartDate
      ? atNine(row.paymentStartDate)
      : new Date(sourceIssuedAt.getTime() + 24 * 60 * 60 * 1000);
    const paymentStartDate = validDate(proposedStart)
      ? proposedStart
      : issue.disbursedAt;
    await prisma.$transaction([
      prisma.loan.update({
        where: { id: issue.loan.id },
        data: { paymentStartDate },
      }),
      prisma.loanApplication.create({
        data: {
          localId: `coglim-app-${row.sourceLoanKey}`,
          tenantId: branch.tenantId,
          branchId: branch.id,
          officerUserId: recorder.id,
          customerId: issue.loan.customerId,
          loanId: issue.loan.id,
          status: 'VERIFIED',
          surname: name.surname,
          givenNames: name.givenNames,
          phone: customer?.phone || null,
          nationalId: customer?.systemNumber || null,
          principalAmount: decimal(row.principal),
          interestRatePercent: decimal(row.interestRatePercent),
          durationDays,
          processingFee: decimal(0),
          templateName: 'Coglim legacy daily loan',
          interestType: 'FLAT',
          termValue: durationDays,
          termUnit: 'DAYS',
          repaymentFrequency: 'DAILY',
          processingFeeType: 'FIXED',
          processingFeeFixedAmount: decimal(0),
          paymentStartPolicy: 'NEXT_DAY',
          paymentStartDelayDays: 1,
          paymentStartDate,
          verifiedAt: sourceIssuedAt,
          submittedAt: sourceIssuedAt,
          syncedAt: sourceIssuedAt,
          createdAt: sourceIssuedAt,
        },
      }),
    ]);
    created += 1;
  }
  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    branch: branch.name,
    packLoans: pack.loans.length,
    matched,
    alreadyLinked,
    missing,
    schedulesToCreate: created,
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
