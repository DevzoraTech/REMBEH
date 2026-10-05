#!/usr/bin/env node

const { readFileSync } = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const reported = [
  ['Nuwamanya Jannat', 140000],
  ['Turyatunga Mable', 60000],
  ['Nampurira Shallon', 48000],
  ['Nayebare Hilda', 30000],
  ['Mutatina Israel', 164000],
  ['Asiimwe Justus', 170000],
  ['Kembabazi Hellen', 160000],
  ['Atukwatza Caroline', 0],
  ['Nuwamanya Cranimar', 840000],
  ['Nyangoma Rosette', 48000],
  ['Nabukalu Monic', 248000],
  ['Natukunda Agnes', 2630000],
  ['Marembo David', 1000],
  ['Nuwahereza Moneck', 0],
  ['Nalugwa Pauline', 160000],
  ['Ahimbisibwe Annet', 3360000],
  ['Babigamba Hamidu', 66000],
  ['Turyatunga Vicensio', 169000],
  ['Amanyire Medrine', 352000],
  ['Banyanga Sam', 252000],
  ['Atwebembeire Apophia', 78000],
  ['Kyabagye Scovia', 33000],
  ['Bamwiine Alex', 176000],
  ['Sande John', 181000],
  ['Arinaitwe Ameria', 55000],
  ['Barigahare Boniface', 297000],
  ['Kasipi Margret', 30000],
  ['Ainembabazi Ronah', 178000],
  ['Asasira Catherine', 273000],
  ['Mwebembezi Adellah', 279000],
  ['Asiimwe Akim', 114000],
  ['Nuwagaba Alex', 160000],
  ['Kwesiga Nathan', 82000],
  ['Tushemereirwe Peace', 34000],
  ['Kyomugisha Allen', 239000],
  ['Kamwesigye Gideon', 116000],
  ['Ayebare Medard', 150000],
  ['Ainebyoona Leonard', 275000],
  ['Ninsiima Banabas', 58000],
  ['Tusasiime Adah', 134000],
  ['Karungyi Phionah', 20000],
  ['Kabagyenzi Lillian', 180000],
  ['Nuwahine James', 121000],
  ['Kyarukutamba Shallon', 33000],
  ['Kashaagire Stellah', 173000],
  ['Aryasingura Emmanuel', 42000],
  ['Ainembabazi Zahara', 92000],
  ['Nayebare Judith', 89000],
  ['Amhaire Loyce', 158000],
  ['Muhini Goreth', 14000],
  ['Kyomukama Mauda', 65000],
  ['Bakashaba Daniel', 5000],
];

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

const normalize = (value) =>
  value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

function levenshtein(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length];
}

async function main() {
  const branch = await prisma.branch.findFirst({
    where: { name: { contains: 'EKITONGORE', mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (!branch) throw new Error('Ekitongore branch was not found.');

  const customers = await prisma.customer.findMany({
    where: { branchId: branch.id, voidedAt: null },
    select: {
      id: true,
      fullName: true,
      phone: true,
      loans: {
        select: {
          id: true,
          status: true,
          principal: true,
          balance: true,
          createdAt: true,
          disbursedAt: true,
          wallet: { select: { openingBalance: true } },
          application: {
            select: {
              localId: true,
              paymentStartDate: true,
              durationDays: true,
            },
          },
          repayments: {
            where: { voidedAt: null },
            select: { amount: true, paidAt: true, localId: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  const rows = reported.map(([reportedName, reportedBalance]) => {
    const candidates = customers
      .map((customer) => ({
        customer,
        distance: levenshtein(reportedName, customer.fullName),
      }))
      .sort((a, b) => a.distance - b.distance);
    const { customer, distance } = candidates[0];
    const positiveLoans = customer.loans.filter((loan) => Number(loan.balance) > 0);
    const productionBalance = positiveLoans.reduce(
      (sum, loan) => sum + Number(loan.balance),
      0,
    );
    const postCutoverRepayments = customer.loans
      .flatMap((loan) => loan.repayments)
      .filter((repayment) => repayment.paidAt >= new Date('2026-09-24T00:00:00.000Z'))
      .reduce((sum, repayment) => sum + Number(repayment.amount), 0);
    const todayRepayments = customer.loans
      .flatMap((loan) => loan.repayments)
      .filter((repayment) => repayment.paidAt >= new Date('2026-10-02T00:00:00.000Z'))
      .reduce((sum, repayment) => sum + Number(repayment.amount), 0);
    return {
      reportedName,
      matchedName: customer.fullName,
      distance,
      reportedBalance,
      productionBalance,
      difference: productionBalance - reportedBalance,
      productionAtDayStart: productionBalance + todayRepayments,
      dayStartDifference:
        productionBalance + todayRepayments - reportedBalance,
      postCutoverRepayments,
      todayRepayments,
      positiveLoanCount: positiveLoans.length,
      allLoans: customer.loans.map((loan) => ({
        id: loan.id,
        status: loan.status,
        principal: Number(loan.principal),
        balance: Number(loan.balance),
        openingBalance: loan.wallet ? Number(loan.wallet.openingBalance) : null,
        localId: loan.application?.localId ?? null,
        paymentStartDate:
          loan.application?.paymentStartDate?.toISOString().slice(0, 10) ?? null,
        durationDays: loan.application?.durationDays ?? null,
        repaymentCount: loan.repayments.length,
        createdAt: loan.createdAt.toISOString(),
      })),
      positiveLoans: positiveLoans.map((loan) => ({
        id: loan.id,
        status: loan.status,
        principal: Number(loan.principal),
        balance: Number(loan.balance),
        openingBalance: loan.wallet ? Number(loan.wallet.openingBalance) : null,
        localId: loan.application?.localId ?? null,
        paymentStartDate:
          loan.application?.paymentStartDate?.toISOString().slice(0, 10) ?? null,
        durationDays: loan.application?.durationDays ?? null,
        repaymentCount: loan.repayments.length,
      })),
    };
  });

  const summary = {
    branch: branch.name,
    reportedCount: rows.length,
    reportedTotal: rows.reduce((sum, row) => sum + row.reportedBalance, 0),
    productionTotal: rows.reduce((sum, row) => sum + row.productionBalance, 0),
    exactBalanceMatches: rows.filter((row) => row.difference === 0).length,
    mismatches: rows.filter((row) => row.difference !== 0).length,
    ambiguousNameMatches: rows.filter((row) => row.distance > 3).length,
  };

  console.log(JSON.stringify({ summary, rows }, null, 2));
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
