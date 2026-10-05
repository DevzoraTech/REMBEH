#!/usr/bin/env node

const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const BRANCH_ID = 'daafb2de-e605-4c87-94bb-9f6dbd53a019';
const APPLY = process.argv.includes('--apply');
const AS_OF = new Date('2026-10-05T09:00:00.000Z');
const DAY_MS = 86_400_000;
const rows = [
  { source: 134, name: 'Abenanye George', phone: '0785342929', payable: 120000, balance: 40000 },
  { source: 135, name: 'Aryampa Isaac', phone: '0781212941', payable: 1200000, balance: 720000 },
];

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

loadEnv(resolve(process.cwd(), '.env'));
loadEnv(resolve(process.cwd(), 'services/api/.env'));
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');

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
const decimal = (value) => new Prisma.Decimal(Number(value).toFixed(2));
const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);
const digits = (value) => String(value).replace(/\D/g, '').slice(-9);
const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');

function datesFor(row) {
  const daily = row.payable / 30;
  const paid = row.payable - row.balance;
  const coveredDays = Math.min(29, Math.floor(paid / daily));
  const paymentStart = addDays(AS_OF, -coveredDays);
  return { issuedAt: addDays(paymentStart, -1), paymentStart };
}

async function main() {
  const branch = await prisma.branch.findUnique({
    where: { id: BRANCH_ID },
    include: { users: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } } },
  });
  if (!branch || branch.name !== 'EKITONGORE BRANCH') throw new Error('Exact Ekitongore branch not found.');
  const recorder = branch.users[0];
  if (!recorder) throw new Error('No active Ekitongore user is available.');

  const existing = await prisma.customer.findMany({
    where: { branchId: BRANCH_ID, voidedAt: null },
    include: { loans: true },
  });
  for (const row of rows) {
    const match = existing.find((customer) =>
      digits(customer.phone) === digits(row.phone) || normalize(customer.fullName) === normalize(row.name),
    );
    if (match?.loans.length) throw new Error(`${row.name} already has a loan; refusing duplicate import.`);
  }

  const before = await prisma.loan.aggregate({ where: { branchId: BRANCH_ID }, _sum: { balance: true }, _count: true });
  const created = [];
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const principal = row.payable / 1.2;
      const interest = row.payable - principal;
      const paid = row.payable - row.balance;
      const principalPaid = Math.min(paid, principal);
      const { issuedAt, paymentStart } = datesFor(row);
      const customer = await tx.customer.create({
        data: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          fullName: row.name,
          phone: row.phone,
          nationalId: `EKITONGORE-CONFIRMED-${row.source}`,
          verifiedAt: AS_OF,
          createdAt: issuedAt,
        },
      });
      const loan = await tx.loan.create({
        data: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          customerId: customer.id,
          principal: decimal(principal),
          balance: decimal(row.balance),
          currency: 'UGX',
          status: 'CURRENT',
          approvedAt: issuedAt,
          disbursedAt: issuedAt,
          paymentStartDate: paymentStart,
          createdAt: issuedAt,
        },
      });
      const [surname, ...given] = row.name.split(/\s+/);
      const application = await tx.loanApplication.create({
        data: {
          localId: `ekitongore-confirmed-app-${row.source}-2026-10-05`,
          tenantId: branch.tenantId,
          branchId: branch.id,
          officerUserId: recorder.id,
          customerId: customer.id,
          loanId: loan.id,
          status: 'VERIFIED',
          surname,
          givenNames: given.join(' ') || null,
          phone: row.phone,
          nationalId: `EKITONGORE-CONFIRMED-${row.source}`,
          principalAmount: decimal(principal),
          interestRatePercent: decimal(20),
          durationDays: 30,
          processingFee: decimal(0),
          templateName: 'Ekitongore confirmed 30-day loan',
          interestType: 'FLAT',
          termValue: 30,
          termUnit: 'DAYS',
          repaymentFrequency: 'DAILY',
          processingFeeType: 'FIXED',
          processingFeeFixedAmount: decimal(0),
          paymentStartPolicy: 'NEXT_DAY',
          paymentStartDelayDays: 1,
          paymentStartDate: paymentStart,
          verifiedAt: issuedAt,
          submittedAt: issuedAt,
          syncedAt: issuedAt,
          createdAt: issuedAt,
        },
      });
      await tx.clientWallet.create({
        data: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          customerId: customer.id,
          loanId: loan.id,
          loanApplicationId: application.id,
          currency: 'UGX',
          openingBalance: decimal(row.payable),
          createdAt: issuedAt,
        },
      });
      await tx.loanDisbursement.create({
        data: {
          localId: `ekitongore-confirmed-disbursement-${row.source}-2026-10-05`,
          tenantId: branch.tenantId,
          branchId: branch.id,
          loanId: loan.id,
          recordedByUserId: recorder.id,
          amount: decimal(principal),
          assignedFloatAmount: decimal(0),
          collectedRepaymentsAmount: decimal(0),
          source: 'MIXED_CASH',
          disbursedAt: issuedAt,
          note: 'Confirmed omitted opening record added on 5 Oct 2026.',
          createdAt: issuedAt,
        },
      });
      if (paid > 0) {
        await tx.repayment.create({
          data: {
            localId: `ekitongore-confirmed-opening-paid-${row.source}-2026-10-05`,
            tenantId: branch.tenantId,
            branchId: branch.id,
            loanId: loan.id,
            recordedByUserId: recorder.id,
            amount: decimal(paid),
            principalAllocated: decimal(principalPaid),
            interestAllocated: decimal(Math.max(0, paid - principalPaid)),
            feesAllocated: decimal(0),
            method: 'CASH',
            paidAt: issuedAt,
            note: 'Cumulative amount paid before confirmed opening import.',
            receiptNumber: `EKI-OPEN-${row.source}`,
            createdAt: issuedAt,
          },
        });
      }
      created.push({ name: row.name, payable: row.payable, balance: row.balance, principal, interest, issuedAt, paymentStart });
    }

    const after = await tx.loan.aggregate({ where: { branchId: BRANCH_ID }, _sum: { balance: true }, _count: true });
    const increase = Number(after._sum.balance || 0) - Number(before._sum.balance || 0);
    if (after._count !== before._count + 2 || increase !== 760000) {
      throw new Error(`Post-import reconciliation failed (count=${after._count}, increase=${increase}).`);
    }
    if (!APPLY) throw new Error('__DRY_RUN_ROLLBACK__');
  }, { timeout: 60_000 });

  console.log(JSON.stringify({ mode: 'APPLIED', created }, null, 2));
}

main()
  .catch((error) => {
    if (error.message === '__DRY_RUN_ROLLBACK__') {
      console.log(JSON.stringify({ mode: 'DRY_RUN_ROLLED_BACK', rows }, null, 2));
      return;
    }
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
