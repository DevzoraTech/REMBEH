#!/usr/bin/env node

const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');
const inputArg = process.argv.find((value) => value.startsWith('--input='));
const inputPath = resolve(
  inputArg?.slice('--input='.length) ??
    'data/reconciliations/ekitongore-confirmed-balances-2026-10-02.csv',
);

for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match || process.env[match[1]]) continue;
  process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing.');
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

// Confirmed cross-reference where the branch workbook name differs materially
// from the customer's registered production name.
const confirmedNameAliases = new Map([
  [normalize('Barunaba Karuhanga'), normalize('Ninsiima Banabas')],
]);

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

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function readConfirmedRows(path) {
  const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift());
  return lines.map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    const confirmedBalance = Number(row.confirmed_balance);
    if (!row.client_name || !Number.isSafeInteger(confirmedBalance) || confirmedBalance < 0) {
      throw new Error(`Invalid confirmed row: ${line}`);
    }
    return {
      sourceRow: Number(row.source_row),
      sourceNumber: row.source_number || null,
      clientName: row.client_name.trim(),
      confirmedBalance,
    };
  });
}

function correctedStatus(loan, confirmedBalance) {
  if (confirmedBalance === 0) return 'CLOSED';
  if (!['CLOSED', 'WRITTEN_OFF', 'REJECTED', 'DRAFT', 'SUBMITTED'].includes(loan.status)) {
    return loan.status;
  }
  const start = loan.paymentStartDate ?? loan.application?.paymentStartDate;
  const durationDays = loan.application?.durationDays;
  if (!start || !durationDays) return 'IN_ARREARS';
  const maturity = new Date(start);
  maturity.setUTCDate(maturity.getUTCDate() + Math.max(0, durationDays - 1));
  return maturity >= new Date() ? 'CURRENT' : 'IN_ARREARS';
}

async function main() {
  const confirmedRows = readConfirmedRows(inputPath);
  const branch = await prisma.branch.findFirst({
    where: { name: { contains: 'EKITONGORE', mode: 'insensitive' } },
    select: { id: true, tenantId: true, name: true },
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
          balance: true,
          principal: true,
          paymentStartDate: true,
          createdAt: true,
          application: {
            select: { paymentStartDate: true, durationDays: true, localId: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  const matchedCustomerIds = new Set();
  const rows = confirmedRows.map((confirmed) => {
    const confirmedAlias = confirmedNameAliases.get(normalize(confirmed.clientName));
    const candidates = customers
      .map((customer) => ({
        customer,
        distance: confirmedAlias
          ? normalize(customer.fullName) === confirmedAlias
            ? 0
            : 1000
          : levenshtein(confirmed.clientName, customer.fullName),
      }))
      .sort((left, right) => left.distance - right.distance);
    const best = candidates[0];
    const second = candidates[1];
    const exact = normalize(best.customer.fullName) === normalize(confirmed.clientName);
    const uniqueEnough = exact || (best.distance <= 4 && second.distance - best.distance >= 2);
    if (!uniqueEnough) {
      throw new Error(
        `Ambiguous customer match for "${confirmed.clientName}": ` +
          `${best.customer.fullName} (${best.distance}), ${second.customer.fullName} (${second.distance})`,
      );
    }
    if (matchedCustomerIds.has(best.customer.id)) {
      throw new Error(`Multiple confirmed rows matched ${best.customer.fullName}.`);
    }
    matchedCustomerIds.add(best.customer.id);

    const positiveLoans = best.customer.loans.filter((loan) => Number(loan.balance) > 0);
    if (positiveLoans.length > 1) {
      throw new Error(`${best.customer.fullName} has ${positiveLoans.length} loans with positive balances.`);
    }
    const targetLoan = positiveLoans[0] ?? best.customer.loans[0];
    if (!targetLoan) throw new Error(`${best.customer.fullName} has no loan to reconcile.`);
    const oldBalance = Number(targetLoan.balance);
    const oldStatus = targetLoan.status;
    const newStatus = correctedStatus(targetLoan, confirmed.confirmedBalance);
    return {
      ...confirmed,
      customerId: best.customer.id,
      matchedName: best.customer.fullName,
      phone: best.customer.phone,
      matchDistance: best.distance,
      loanId: targetLoan.id,
      loanLocalId: targetLoan.application?.localId ?? null,
      oldBalance,
      confirmedBalance: confirmed.confirmedBalance,
      difference: confirmed.confirmedBalance - oldBalance,
      oldStatus,
      newStatus,
      changed: oldBalance !== confirmed.confirmedBalance || oldStatus !== newStatus,
    };
  });

  const summary = {
    branchId: branch.id,
    branch: branch.name,
    input: inputPath,
    confirmedCount: rows.length,
    confirmedTotal: rows.reduce((sum, row) => sum + row.confirmedBalance, 0),
    productionBeforeTotal: rows.reduce((sum, row) => sum + row.oldBalance, 0),
    netAdjustment: rows.reduce((sum, row) => sum + row.difference, 0),
    changedRows: rows.filter((row) => row.changed).length,
    exactNameMatches: rows.filter((row) => row.matchDistance === 0).length,
    fuzzyNameMatches: rows.filter((row) => row.matchDistance > 0).length,
    applied: APPLY,
  };

  const confirmedLoanIds = new Set(rows.map((row) => row.loanId));
  const outsideConfirmedRows = customers.flatMap((customer) =>
    customer.loans
      .filter((loan) => Number(loan.balance) > 0 && !confirmedLoanIds.has(loan.id))
      .map((loan) => ({
        customerId: customer.id,
        customerName: customer.fullName,
        phone: customer.phone,
        loanId: loan.id,
        loanLocalId: loan.application?.localId ?? null,
        balance: Number(loan.balance),
        status: loan.status,
        createdAt: loan.createdAt.toISOString(),
      })),
  );
  summary.outsideConfirmedPositiveLoanCount = outsideConfirmedRows.length;
  summary.outsideConfirmedPositiveLoanTotal = outsideConfirmedRows.reduce(
    (sum, row) => sum + row.balance,
    0,
  );
  const obsoleteLegacyRows = outsideConfirmedRows.filter((row) =>
    row.loanLocalId?.startsWith('coglim-app-eki-'),
  );
  const preservedNativeRows = outsideConfirmedRows.filter(
    (row) => !row.loanLocalId?.startsWith('coglim-app-eki-'),
  );
  summary.obsoleteLegacyLoanCount = obsoleteLegacyRows.length;
  summary.obsoleteLegacyBalanceToClose = obsoleteLegacyRows.reduce(
    (sum, row) => sum + row.balance,
    0,
  );
  summary.preservedNativeLoanCount = preservedNativeRows.length;
  summary.preservedNativeLoanTotal = preservedNativeRows.reduce(
    (sum, row) => sum + row.balance,
    0,
  );
  summary.expectedBranchPositiveBalanceAfter =
    summary.confirmedTotal + summary.preservedNativeLoanTotal;

  mkdirSync('data/audits', { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotPath = resolve(`data/audits/ekitongore-confirmed-balance-${APPLY ? 'apply' : 'dry-run'}-${timestamp}.json`);
  writeFileSync(
    snapshotPath,
    JSON.stringify(
      { summary, rows, obsoleteLegacyRows, preservedNativeRows },
      null,
      2,
    ),
  );

  if (APPLY) {
    const correlationId = `ekitongore-confirmed-balance-${timestamp}`;
    await prisma.$transaction(async (transaction) => {
      for (const row of rows.filter((item) => item.changed)) {
        await transaction.loan.update({
          where: { id: row.loanId },
          data: { balance: row.confirmedBalance.toFixed(2), status: row.newStatus },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: branch.tenantId,
            actorUserId: null,
            action: 'loan.balance.reconciled_from_confirmed_records',
            entityType: 'Loan',
            entityId: row.loanId,
            oldValue: {
              customerId: row.customerId,
              customerName: row.matchedName,
              balance: row.oldBalance,
              status: row.oldStatus,
            },
            newValue: {
              customerId: row.customerId,
              customerName: row.matchedName,
              balance: row.confirmedBalance,
              status: row.newStatus,
              sourceFile: 'Records Reconciliation-1.xlsx',
              sourceRow: row.sourceRow,
              sourceNumber: row.sourceNumber,
              reason: 'Confirmed Ekitongore borrower balance reconciliation supplied by the branch.',
            },
            device: 'production-reconciliation-script',
            correlationId,
          },
        });
      }
      for (const row of obsoleteLegacyRows) {
        await transaction.loan.update({
          where: { id: row.loanId },
          data: { balance: '0.00', status: 'CLOSED' },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: branch.tenantId,
            actorUserId: null,
            action: 'loan.balance.closed_from_confirmed_records',
            entityType: 'Loan',
            entityId: row.loanId,
            oldValue: {
              customerId: row.customerId,
              customerName: row.customerName,
              balance: row.balance,
              status: row.status,
            },
            newValue: {
              customerId: row.customerId,
              customerName: row.customerName,
              balance: 0,
              status: 'CLOSED',
              sourceFile: 'Records Reconciliation-1.xlsx',
              reason:
                'Legacy Coglim balance was not present in the branch-confirmed outstanding balance reconciliation.',
            },
            device: 'production-reconciliation-script',
            correlationId,
          },
        });
      }
    }, { maxWait: 10_000, timeout: 120_000 });

    const verified = await prisma.loan.findMany({
      where: { id: { in: rows.map((row) => row.loanId) } },
      select: { id: true, balance: true, status: true },
    });
    const byId = new Map(verified.map((loan) => [loan.id, loan]));
    const failures = rows.filter((row) => {
      const loan = byId.get(row.loanId);
      return !loan || Number(loan.balance) !== row.confirmedBalance || loan.status !== row.newStatus;
    });
    if (failures.length > 0) {
      throw new Error(`Post-apply verification failed for ${failures.length} loan(s).`);
    }
    const obsoleteFailures = await prisma.loan.count({
      where: {
        id: { in: obsoleteLegacyRows.map((row) => row.loanId) },
        OR: [{ balance: { not: '0.00' } }, { status: { not: 'CLOSED' } }],
      },
    });
    if (obsoleteFailures > 0) {
      throw new Error(
        `Post-apply verification failed for ${obsoleteFailures} obsolete legacy loan(s).`,
      );
    }

    const branchPositiveLoans = await prisma.loan.aggregate({
      where: { branchId: branch.id, balance: { gt: 0 } },
      _count: { _all: true },
      _sum: { balance: true },
    });
    const actualBranchPositiveBalance = Number(branchPositiveLoans._sum.balance ?? 0);
    if (actualBranchPositiveBalance !== summary.expectedBranchPositiveBalanceAfter) {
      throw new Error(
        `Branch verification failed: expected positive balance ${summary.expectedBranchPositiveBalanceAfter}, ` +
          `found ${actualBranchPositiveBalance}.`,
      );
    }
    summary.verifiedBranchPositiveLoanCount = branchPositiveLoans._count._all;
    summary.verifiedBranchPositiveBalance = actualBranchPositiveBalance;
  }

  console.log(
    JSON.stringify(
      { summary, snapshotPath, rows, obsoleteLegacyRows, preservedNativeRows },
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
