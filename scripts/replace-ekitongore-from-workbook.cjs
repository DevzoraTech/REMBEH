#!/usr/bin/env node

const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const ExcelJS = require('exceljs');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const BRANCH_ID = 'daafb2de-e605-4c87-94bb-9f6dbd53a019';
const BRANCH_NAME = 'EKITONGORE BRANCH';
const APPLY = process.argv.includes('--apply');
const workbookArg = process.argv.find((value) => value.startsWith('--workbook='));
const workbookPath = resolve(workbookArg?.slice('--workbook='.length) || 'Ekitongole Updated.xlsx');
const asOfArg = process.argv.find((value) => value.startsWith('--as-of='));
const asOfDate = asOfArg?.slice('--as-of='.length) || '2026-10-04';
const DRY_RUN_ROLLBACK = Symbol('dry-run-rollback');

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
if (!existsSync(workbookPath)) throw new Error(`Workbook not found: ${workbookPath}`);

const databaseUrl = new URL(process.env.DATABASE_URL);
const pool = new Pool({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || 5432),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: decodeURIComponent(databaseUrl.pathname.slice(1)),
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const decimal = (value) => new Prisma.Decimal(Number(value).toFixed(2));
const normalizeName = (value) => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
const phoneDigits = (value) => String(value || '').replace(/\D/g, '').slice(-9);
const money = (value) => Math.round(Number(value) * 100) / 100;
const dayMs = 86_400_000;

function utcDate(value) {
  return new Date(`${value}T09:00:00.000Z`);
}

function addDays(value, days) {
  return new Date(value.getTime() + days * dayMs);
}

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return { surname: parts.shift() || fullName, givenNames: parts.join(' ') || null };
}

async function readRows() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const sheet = workbook.getWorksheet('Transcription') || workbook.worksheets[0];
  if (!sheet) throw new Error('Workbook has no worksheet.');
  const headers = [1, 2, 3, 4, 5].map((column) => String(sheet.getCell(1, column).value || '').trim());
  const expected = ['No', 'Name', 'Amount payable', 'Oustanding', 'Telephone'];
  if (headers.join('|') !== expected.join('|')) {
    throw new Error(`Unexpected workbook headers: ${headers.join(', ')}`);
  }
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const values = [1, 2, 3, 4, 5].map((column) => sheet.getCell(rowNumber, column).value);
    if (values.every((value) => value == null || value === '')) continue;
    const [sourceNumber, rawName, rawPayable, rawOutstanding, rawPhone] = values;
    const name = String(rawName || '').trim();
    const totalPayable = Number(rawPayable);
    const outstanding = Number(rawOutstanding);
    const digits = phoneDigits(rawPhone);
    if (!Number.isInteger(Number(sourceNumber)) || !name || digits.length !== 9) {
      throw new Error(`Invalid identity data on workbook row ${rowNumber}.`);
    }
    if (!Number.isFinite(totalPayable) || totalPayable <= 0 || !Number.isFinite(outstanding) || outstanding < 0 || outstanding > totalPayable) {
      throw new Error(`Invalid financial data on workbook row ${rowNumber}.`);
    }
    rows.push({
      workbookRow: rowNumber,
      sourceNumber: Number(sourceNumber),
      name,
      nameKey: normalizeName(name),
      totalPayable: money(totalPayable),
      outstanding: money(outstanding),
      phoneDigits: digits,
      sourcePhone: `0${digits}`,
    });
  }
  if (!rows.length) throw new Error('Workbook contains no loan rows.');
  const sourceNumbers = new Set();
  for (const row of rows) {
    if (sourceNumbers.has(row.sourceNumber)) throw new Error(`Duplicate source number ${row.sourceNumber}.`);
    sourceNumbers.add(row.sourceNumber);
  }
  return rows;
}

function selectHistoricalLoan(row, customers, usedLoanIds) {
  const sameName = customers.filter((customer) => normalizeName(customer.fullName) === row.nameKey);
  const samePhone = customers.filter((customer) => phoneDigits(customer.phone) === row.phoneDigits);
  const customerCandidates = sameName.length ? sameName : samePhone;
  const principal = money(row.totalPayable / 1.2);
  const candidates = customerCandidates.flatMap((customer) => customer.loans.map((loan) => {
    const opening = Number(loan.wallet?.openingBalance ?? 0);
    const loanPrincipal = Number(loan.principal);
    const payableDifference = opening > 0
      ? Math.abs(opening - row.totalPayable)
      : Math.abs(money(loanPrincipal * 1.2) - row.totalPayable);
    return {
      customer,
      loan,
      score:
        payableDifference * 1000 +
        Math.abs(Number(loan.balance) - row.outstanding) +
        (phoneDigits(customer.phone) === row.phoneDigits ? 0 : 1_000_000) +
        (Math.abs(loanPrincipal - principal) < 1 ? 0 : 10_000_000),
    };
  })).filter((candidate) => !usedLoanIds.has(candidate.loan.id));
  candidates.sort((left, right) => left.score - right.score || new Date(right.loan.createdAt) - new Date(left.loan.createdAt));
  const selected = candidates[0];
  if (!selected || selected.score >= 50_000_000) return null;
  usedLoanIds.add(selected.loan.id);
  return selected;
}

function inferredDates(row) {
  const daily = row.totalPayable / 30;
  const paid = Math.max(0, row.totalPayable - row.outstanding);
  const coveredDays = Math.min(29, Math.floor(paid / daily));
  const paymentStart = addDays(utcDate(asOfDate), -coveredDays);
  return { issuedAt: addDays(paymentStart, -1), paymentStart };
}

async function snapshotCounts(client, branchId) {
  const tables = [
    'users', 'customers', 'loans', 'loan_applications', 'loan_disbursements', 'repayments',
    'client_wallets', 'branch_daily_operations', 'branch_operation_expenses',
    'branch_operation_topups', 'branch_operation_bankings', 'branch_operation_reports',
    'agent_daily_floats', 'cash_shortages', 'employees', 'salary_payments',
    'loan_reminder_batches', 'loan_reminder_items', 'branch_subscriptions',
    'subscription_payments', 'branch_sms_wallets', 'sms_purchases', 'sms_wallet_ledger',
    'controlled_feature_access', 'subscription_price_overrides',
  ];
  const result = {};
  for (const table of tables) {
    const [{ count }] = await client.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${table}" WHERE branch_id = $1::uuid`, branchId);
    result[table] = count;
  }
  return result;
}

async function deleteOperationalData(transaction, branchId) {
  const statements = [
    `DELETE FROM "loan_reminder_items" WHERE branch_id = $1::uuid`,
    `DELETE FROM "loan_reminder_batches" WHERE branch_id = $1::uuid`,
    `DELETE FROM "repayment_correction_requests" WHERE branch_id = $1::uuid`,
    `DELETE FROM "loan_fines" WHERE branch_id = $1::uuid`,
    `DELETE FROM "repayments" WHERE branch_id = $1::uuid`,
    `DELETE FROM "loan_disbursements" WHERE branch_id = $1::uuid`,
    `DELETE FROM "client_wallets" WHERE branch_id = $1::uuid`,
    `DELETE FROM "loan_application_signatures" WHERE loan_application_id IN (SELECT id FROM "loan_applications" WHERE branch_id = $1::uuid)`,
    `DELETE FROM "loan_application_media" WHERE loan_application_id IN (SELECT id FROM "loan_applications" WHERE branch_id = $1::uuid)`,
    `DELETE FROM "loan_application_guarantors" WHERE loan_application_id IN (SELECT id FROM "loan_applications" WHERE branch_id = $1::uuid)`,
    `DELETE FROM "loan_applications" WHERE branch_id = $1::uuid`,
    `UPDATE "payment_gateway_intents" SET loan_id = NULL WHERE branch_id = $1::uuid AND loan_id IS NOT NULL`,
    `DELETE FROM "loans" WHERE branch_id = $1::uuid`,
    `DELETE FROM "borrower_list_entries" WHERE branch_id = $1::uuid`,
    `DELETE FROM "customers" WHERE branch_id = $1::uuid`,
    `DELETE FROM "branch_operation_cash_counts" WHERE reconciliation_id IN (SELECT id FROM "branch_operation_reconciliations" WHERE branch_id = $1::uuid)`,
    `DELETE FROM "branch_operation_reports" WHERE branch_id = $1::uuid`,
    `DELETE FROM "branch_operation_reconciliations" WHERE branch_id = $1::uuid`,
    `DELETE FROM "branch_operation_expenses" WHERE branch_id = $1::uuid`,
    `DELETE FROM "branch_operation_topups" WHERE branch_id = $1::uuid`,
    `DELETE FROM "branch_operation_bankings" WHERE branch_id = $1::uuid`,
    `DELETE FROM "cash_shortage_payments" WHERE shortage_id IN (SELECT id FROM "cash_shortages" WHERE branch_id = $1::uuid)`,
    `DELETE FROM "cash_shortages" WHERE branch_id = $1::uuid`,
    `DELETE FROM "salary_payments" WHERE branch_id = $1::uuid`,
    `DELETE FROM "employees" WHERE branch_id = $1::uuid`,
    `DELETE FROM "agent_daily_floats" WHERE branch_id = $1::uuid`,
    `DELETE FROM "branch_daily_operations" WHERE branch_id = $1::uuid`,
  ];
  for (const statement of statements) await transaction.$executeRawUnsafe(statement, branchId);
}

async function main() {
  const rows = await readRows();
  const branch = await prisma.branch.findUnique({
    where: { id: BRANCH_ID },
    include: {
      tenant: { select: { id: true, name: true } },
      users: {
        select: { id: true, email: true, displayName: true, status: true, publicId: true },
        orderBy: { id: 'asc' },
      },
      customers: {
        where: { voidedAt: null },
        include: {
          loans: {
            include: { wallet: true, application: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  });
  if (!branch || branch.name !== BRANCH_NAME) throw new Error('Exact Ekitongore branch target was not found.');
  const recorder = branch.users.find((user) => user.status === 'ACTIVE');
  if (!recorder) throw new Error('Ekitongore has no active user to own imported records.');

  const usedHistoricalLoanIds = new Set();
  const prepared = rows.map((row) => {
    const historical = selectHistoricalLoan(row, branch.customers, usedHistoricalLoanIds);
    const fallback = inferredDates(row);
    const issuedAt = historical?.loan.disbursedAt || historical?.loan.approvedAt || historical?.loan.createdAt || fallback.issuedAt;
    const paymentStart = historical?.loan.paymentStartDate || historical?.loan.application?.paymentStartDate || addDays(new Date(issuedAt), 1);
    return {
      ...row,
      principal: money(row.totalPayable / 1.2),
      interest: money(row.totalPayable - row.totalPayable / 1.2),
      paid: money(row.totalPayable - row.outstanding),
      dailyInstalment: money(row.totalPayable / 30),
      issuedAt: new Date(issuedAt),
      paymentStart: new Date(paymentStart),
      dateSource: historical ? 'matched-production-loan' : 'inferred-from-confirmed-balance',
      historicalLoanId: historical?.loan.id || null,
    };
  });

  const phoneGroups = new Map();
  for (const row of prepared) {
    const key = `${row.nameKey}|${row.phoneDigits}`;
    if (!phoneGroups.has(key)) phoneGroups.set(key, []);
    phoneGroups.get(key).push(row);
  }
  const distinctBorrowers = [...phoneGroups.values()];
  const beforeCounts = await snapshotCounts(prisma, branch.id);
  const userSnapshot = JSON.stringify(branch.users);
  let afterCounts;
  let importedSummary;

  try {
    await prisma.$transaction(async (transaction) => {
      await deleteOperationalData(transaction, branch.id);
      const claimedPhones = new Set();
      let customerCount = 0;
      let loanCount = 0;
      let repaymentCount = 0;

      for (const group of distinctBorrowers) {
        const first = group[0];
        let customerPhone = first.sourcePhone;
        if (claimedPhones.has(customerPhone)) customerPhone = `+256${first.phoneDigits}`;
        if (claimedPhones.has(customerPhone)) customerPhone = `legacy-ekitongore-${String(first.sourceNumber).padStart(4, '0')}`;
        claimedPhones.add(customerPhone);
        const customer = await transaction.customer.create({
          data: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            fullName: first.name,
            phone: customerPhone,
            nationalId: `EKITONGORE-CONFIRMED-${String(first.sourceNumber).padStart(4, '0')}`,
            verifiedAt: utcDate(asOfDate),
            createdAt: first.issuedAt,
          },
        });
        customerCount += 1;

        for (const row of group) {
          const maturity = addDays(row.paymentStart, 29);
          const status = row.outstanding === 0 ? 'CLOSED' : maturity < utcDate(asOfDate) ? 'IN_ARREARS' : 'CURRENT';
          const loan = await transaction.loan.create({
            data: {
              tenantId: branch.tenantId,
              branchId: branch.id,
              customerId: customer.id,
              principal: decimal(row.principal),
              balance: decimal(row.outstanding),
              currency: 'UGX',
              status,
              approvedAt: row.issuedAt,
              disbursedAt: row.issuedAt,
              paymentStartDate: row.paymentStart,
              createdAt: row.issuedAt,
            },
          });
          const names = splitName(row.name);
          const application = await transaction.loanApplication.create({
            data: {
              localId: `ekitongore-confirmed-app-${row.sourceNumber}-${asOfDate}`,
              tenantId: branch.tenantId,
              branchId: branch.id,
              officerUserId: recorder.id,
              customerId: customer.id,
              loanId: loan.id,
              status: 'VERIFIED',
              surname: names.surname,
              givenNames: names.givenNames,
              phone: row.sourcePhone,
              nationalId: `EKITONGORE-CONFIRMED-${String(row.sourceNumber).padStart(4, '0')}`,
              principalAmount: decimal(row.principal),
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
              paymentStartDate: row.paymentStart,
              verifiedAt: row.issuedAt,
              submittedAt: row.issuedAt,
              syncedAt: row.issuedAt,
              createdAt: row.issuedAt,
            },
          });
          await transaction.clientWallet.create({
            data: {
              tenantId: branch.tenantId,
              branchId: branch.id,
              customerId: customer.id,
              loanId: loan.id,
              loanApplicationId: application.id,
              currency: 'UGX',
              openingBalance: decimal(row.totalPayable),
              createdAt: row.issuedAt,
            },
          });
          await transaction.loanDisbursement.create({
            data: {
              localId: `ekitongore-confirmed-disbursement-${row.sourceNumber}-${asOfDate}`,
              tenantId: branch.tenantId,
              branchId: branch.id,
              loanId: loan.id,
              recordedByUserId: recorder.id,
              amount: decimal(row.principal),
              assignedFloatAmount: decimal(0),
              collectedRepaymentsAmount: decimal(0),
              source: 'MIXED_CASH',
              disbursedAt: row.issuedAt,
              note: `Opening import from Ekitongole Updated.xlsx row ${row.workbookRow}.`,
              createdAt: row.issuedAt,
            },
          });
          if (row.paid > 0) {
            const principalAllocated = Math.min(row.paid, row.principal);
            await transaction.repayment.create({
              data: {
                localId: `ekitongore-confirmed-opening-paid-${row.sourceNumber}-${asOfDate}`,
                tenantId: branch.tenantId,
                branchId: branch.id,
                loanId: loan.id,
                recordedByUserId: recorder.id,
                amount: decimal(row.paid),
                principalAllocated: decimal(principalAllocated),
                interestAllocated: decimal(Math.max(0, row.paid - principalAllocated)),
                feesAllocated: decimal(0),
                method: 'CASH',
                paidAt: row.issuedAt,
                note: 'Cumulative amount already paid before the confirmed opening import.',
                receiptNumber: `EKI-OPEN-${row.sourceNumber}`,
                createdAt: row.issuedAt,
              },
            });
            repaymentCount += 1;
          }
          loanCount += 1;
        }
      }

      const usersAfter = await transaction.user.findMany({
        where: { branchId: branch.id },
        select: { id: true, email: true, displayName: true, status: true, publicId: true },
        orderBy: { id: 'asc' },
      });
      if (JSON.stringify(usersAfter) !== userSnapshot) throw new Error('User preservation check failed.');
      afterCounts = await snapshotCounts(transaction, branch.id);
      importedSummary = { customerCount, loanCount, repaymentCount };
      if (afterCounts.customers !== distinctBorrowers.length || afterCounts.loans !== rows.length) {
        throw new Error('Post-import row count check failed.');
      }
      const aggregate = await transaction.loan.aggregate({
        where: { branchId: branch.id },
        _sum: { principal: true, balance: true },
        _count: { _all: true },
      });
      const balanceTotal = Number(aggregate._sum.balance || 0);
      const expectedBalance = rows.reduce((sum, row) => sum + row.outstanding, 0);
      if (money(balanceTotal) !== money(expectedBalance)) throw new Error('Outstanding total check failed.');
      importedSummary.outstandingTotal = balanceTotal;
      importedSummary.principalTotal = Number(aggregate._sum.principal || 0);
      if (!APPLY) throw DRY_RUN_ROLLBACK;
    }, { timeout: 300_000, maxWait: 30_000 });
  } catch (error) {
    if (error !== DRY_RUN_ROLLBACK) throw error;
  }

  const report = {
    mode: APPLY ? 'APPLIED' : 'DRY_RUN_ROLLED_BACK',
    workbook: workbookPath,
    asOfDate,
    branch: { id: branch.id, name: branch.name, tenant: branch.tenant.name },
    preservedUsers: branch.users,
    workbookSummary: {
      rows: rows.length,
      distinctBorrowers: distinctBorrowers.length,
      totalPayable: rows.reduce((sum, row) => sum + row.totalPayable, 0),
      outstanding: rows.reduce((sum, row) => sum + row.outstanding, 0),
      alreadyPaid: rows.reduce((sum, row) => sum + row.totalPayable - row.outstanding, 0),
      openLoans: rows.filter((row) => row.outstanding > 0).length,
      closedLoans: rows.filter((row) => row.outstanding === 0).length,
      productionDateMatches: prepared.filter((row) => row.dateSource === 'matched-production-loan').length,
      inferredDates: prepared.filter((row) => row.dateSource !== 'matched-production-loan').length,
    },
    beforeCounts,
    transactionalAfterCounts: afterCounts,
    importedSummary,
    inferredDateRows: prepared.filter((row) => row.dateSource !== 'matched-production-loan').map((row) => ({
      workbookRow: row.workbookRow,
      name: row.name,
      phone: row.sourcePhone,
      issuedAt: row.issuedAt.toISOString(),
      paymentStart: row.paymentStart.toISOString(),
    })),
  };
  mkdirSync('data/audits', { recursive: true });
  const output = resolve(`data/audits/ekitongore-full-replacement-${APPLY ? 'apply' : 'dry-run'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, report: output }, null, 2));
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
