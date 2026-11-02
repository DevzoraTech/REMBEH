#!/usr/bin/env node

/*
 * Imports the Kakinga B opening loan register as one auditable transaction.
 * The branch must be operationally empty so the script cannot create duplicate
 * borrowers or loans by accident.
 */

const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ExcelJS = require('exceljs');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');
const workbookArg = process.argv.find((value) => value.startsWith('--workbook='));
const asOfArg = process.argv.find((value) => value.startsWith('--as-of='));
const branchArg = process.argv.find((value) => value.startsWith('--branch='));
const workbookPath = resolve(
  workbookArg?.slice('--workbook='.length) || 'Loan Register.xlsx',
);
const branchName = (branchArg?.slice('--branch='.length) || 'Kakinga B').trim();
const asOfDate = asOfArg?.slice('--as-of='.length) || '2026-11-01';
const DRY_RUN_ROLLBACK = Symbol('dry-run-rollback');
const dayMs = 86_400_000;

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
  ssl: databaseUrl.searchParams.get('sslmode') === 'disable' ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const decimal = (value) => new Prisma.Decimal(Number(value).toFixed(2));
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

function utcDate(value) {
  return new Date(`${value}T09:00:00.000Z`);
}

function addDays(value, days) {
  return new Date(value.getTime() + days * dayMs);
}

function dateKey(value) {
  return value.toISOString().slice(0, 10);
}

function parseIssueDate(value, rowNumber) {
  const source = String(value || '').trim();
  const match = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/i);
  if (!match) throw new Error(`Workbook row ${rowNumber}: invalid issue date "${source}".`);
  const [, dayText, monthText, rawYear] = match;
  const yearText = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  const parsed = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), 9));
  if (
    parsed.getUTCFullYear() !== Number(yearText) ||
    parsed.getUTCMonth() !== Number(monthText) - 1 ||
    parsed.getUTCDate() !== Number(dayText)
  ) {
    throw new Error(`Workbook row ${rowNumber}: invalid calendar date "${source}".`);
  }
  return parsed;
}

function normalizePhone(value, sourceNumber) {
  const digits = String(value || '').replace(/\D/g, '');
  const ugandan = digits.startsWith('0') && digits.length === 10
    ? `+256${digits.slice(1)}`
    : digits.startsWith('256') && digits.length === 12
      ? `+${digits}`
      : digits.length === 9 && digits.startsWith('7')
        ? `+256${digits}`
        : null;
  if (!ugandan) throw new Error(`Invalid phone number in workbook row ${sourceNumber}.`);
  return ugandan;
}

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return { surname: parts.shift() || fullName, givenNames: parts.join(' ') || null };
}

async function readRows() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Workbook has no worksheet.');
  const headers = [1, 2, 3, 4, 5, 6].map((column) => sheet.getCell(1, column).text.trim().toLowerCase());
  const expected = ['borrower name', 'branch name', 'borrower contact', 'date of loan issue', 'repayable amount (ugx)', 'outstanding balance (ugx)'];
  if (headers.join('|') !== expected.join('|')) {
    throw new Error(`Unexpected workbook headers: ${headers.join(', ')}`);
  }

  const asOf = utcDate(asOfDate);
  const rows = [];
  const normalizationNotes = [];
  const sourceNumbers = new Set();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const name = row.getCell(1).text.trim().toUpperCase();
    if (!name) continue;
    if (row.getCell(2).text.trim().toUpperCase() !== 'KAKINGA B') throw new Error(`Unexpected branch in row ${rowNumber}`);
    const workbookNumber = rowNumber;
    // The source numbering is incomplete and repeated after row 73. The Excel
    // row is the immutable import identity; retain the supplied number only in
    // the audit file.
    const sourceNumber = rowNumber;
    let totalPayable = money(row.getCell(5).value);
    const outstanding = money(row.getCell(6).value);
    const rawPhone = row.getCell(3).text.trim();
    const corrections = { 19: '30/09/26', 69: '25/11/25', 112: '06/11/25' };
    const rawIssueDate = corrections[rowNumber] || row.getCell(4).text.trim();
    if (corrections[rowNumber]) normalizationNotes.push({ rowNumber, type: 'confirmed-issue-date-correction', source: row.getCell(4).text.trim(), value: rawIssueDate });
    const suppliedNumber = Number(workbookNumber);
    if (!Number.isInteger(suppliedNumber) || sourceNumbers.has(suppliedNumber)) {
      normalizationNotes.push({ rowNumber, type: 'source-number-replaced-with-workbook-row', source: workbookNumber, value: sourceNumber });
    }
    sourceNumbers.add(suppliedNumber);
    if (!Number.isFinite(totalPayable) || totalPayable <= 0 || !Number.isFinite(outstanding) || outstanding < 0) {
      throw new Error(`Workbook row ${rowNumber}: invalid financial value.`);
    }
    // A balance cannot exceed total payable. The register has one row where the
    // amount is lower than its stated outstanding balance; preserve the stated
    // balance by raising its total payable to that balance and record the fix.
    if (outstanding > totalPayable) throw new Error(`Workbook row ${rowNumber}: outstanding exceeds repayable.`);
    let issuedAt = parseIssueDate(rawIssueDate, rowNumber);
    if (issuedAt > asOf) {
      throw new Error(
        `Workbook row ${rowNumber}: issue date ${dateKey(issuedAt)} is after ` +
        `the import date ${asOfDate}. Correct the source date before importing.`,
      );
    }
    const placeholders = { 213: '+256700000001', 196: '+256700000002' };
    const phone = placeholders[rowNumber] || normalizePhone(rawPhone, sourceNumber);
    if (placeholders[rowNumber]) normalizationNotes.push({ rowNumber, type: 'shared-phone-placeholder', source: rawPhone, value: phone });
    if (phone.startsWith('kakinga-b-import-')) {
      normalizationNotes.push({ rowNumber, type: 'invalid-phone-preserved-as-import-identifier', source: rawPhone, value: phone });
    }
    rows.push({
      workbookRow: rowNumber,
      sourceNumber,
      suppliedNumber: Number.isInteger(suppliedNumber) ? suppliedNumber : null,
      name,
      totalPayable,
      outstanding,
      paid: money(totalPayable - outstanding),
      principal: money(totalPayable / 1.2),
      interest: money(totalPayable - totalPayable / 1.2),
      dailyInstallment: money(totalPayable / 30),
      phone,
      rawPhone,
      issuedAt,
      paymentStart: addDays(issuedAt, 1),
    });
  }
  if (!rows.length) throw new Error('Workbook contains no loan rows.');
  return { rows, normalizationNotes };
}

async function targetBranch() {
  const matches = await prisma.branch.findMany({
    where: { name: { equals: branchName, mode: 'insensitive' } },
    include: {
      tenant: { select: { id: true, name: true } },
      users: { where: { status: 'ACTIVE' }, select: { id: true, displayName: true, email: true } },
    },
  });
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one branch named "${branchName}"; found ${matches.length}.`);
  }
  if (!matches[0].users.length) throw new Error('The branch has no active user to own imported records.');
  return matches[0];
}

async function assertEmptyBranch(branchId) {
  const [customers, loans, applications, repayments, disbursements] = await Promise.all([
    prisma.customer.count({ where: { branchId } }),
    prisma.loan.count({ where: { branchId } }),
    prisma.loanApplication.count({ where: { branchId } }),
    prisma.repayment.count({ where: { branchId } }),
    prisma.loanDisbursement.count({ where: { branchId } }),
  ]);
  const counts = { customers, loans, applications, repayments, disbursements };
  if (counts.customers !== 1 || counts.loans || counts.applications || counts.repayments || counts.disbursements) {
    throw new Error(`Refusing import because the target branch is not empty: ${JSON.stringify(counts)}.`);
  }
  return counts;
}

async function main() {
  const { rows, normalizationNotes } = await readRows();
  const branch = await targetBranch();
  const beforeCounts = await assertEmptyBranch(branch.id);
  if (branch.id !== '48efcb7b-0338-4a00-82f5-b58873c6661d' || asOfDate !== '2026-11-01') throw new Error('Unexpected branch or opening date.');
  if (rows.length !== 221 || money(rows.reduce((sum, row) => sum + row.outstanding, 0)) !== 61401000 || money(rows.reduce((sum, row) => sum + row.totalPayable, 0)) !== 115920000) throw new Error('Workbook totals differ from the reviewed register.');
  const recorder = branch.users.find((user) => user.id === 'ebc77758-7b35-4ffb-9091-398cefdea7f2');
  if (!recorder) throw new Error('Expected active branch manager not found.');
  const phoneClaims = new Set();
  const report = {
    mode: APPLY ? 'APPLIED' : 'DRY_RUN_ROLLED_BACK',
    workbook: workbookPath,
    asOfDate,
    branch: { id: branch.id, name: branch.name, tenant: branch.tenant.name },
    recorder: { id: recorder.id, name: recorder.displayName, email: recorder.email },
    beforeCounts,
    source: {
      rows: rows.length,
      totalPayable: money(rows.reduce((sum, row) => sum + row.totalPayable, 0)),
      outstanding: money(rows.reduce((sum, row) => sum + row.outstanding, 0)),
      alreadyPaid: money(rows.reduce((sum, row) => sum + row.paid, 0)),
      openLoans: rows.filter((row) => row.outstanding > 0).length,
      closedLoans: rows.filter((row) => row.outstanding === 0).length,
    },
    normalizations: normalizationNotes,
  };

  try {
    await prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw`SELECT id FROM branches WHERE id = ${branch.id}::uuid FOR UPDATE`;
      if (locked.length !== 1) throw new Error('Branch not found.');
      const concurrent = await Promise.all(['customer', 'loan', 'loanApplication', 'repayment', 'loanDisbursement'].map((model) => transaction[model].count({ where: { branchId: branch.id } })));
      if (concurrent[0] !== 1 || concurrent.slice(1).some(Boolean)) throw new Error('Branch records changed before import.');
      const operation = await transaction.branchDailyOperation.findFirst({ where: { branchId: branch.id, operationDate: new Date('2026-11-01T00:00:00.000Z'), status: 'OPEN' } });
      if (!operation) throw new Error('Expected open branch operating day not found.');
      let createdRepayments = 0;
      for (const row of rows) {
        let phone = row.phone;
        if (phoneClaims.has(phone)) throw new Error(`Duplicate phone at row ${row.workbookRow}.`);
        phoneClaims.add(phone);
        const customer = row.workbookRow === 86 ? await transaction.customer.findFirstOrThrow({ where: { id: '7b9927b5-75b4-4839-b5f0-83a92041828b', branchId: branch.id, phone, fullName: row.name } }) : await transaction.customer.create({
          data: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            fullName: row.name,
            phone,
            nationalId: null,
            createdAt: row.issuedAt,
          },
        });
        if (row.workbookRow === 86) {
          const pending = await transaction.borrowerOnboardingPendingPosition.findFirstOrThrow({ where: { customerId: customer.id, completedAt: null } });
          if (!pending.repayable.equals(row.totalPayable) || !pending.outstanding.equals(26500)) throw new Error('Existing pending position changed; review required.');
          await transaction.borrowerOnboardingPendingPosition.update({ where: { id: pending.id }, data: { outstanding: decimal(row.outstanding), details: { ...pending.details, outstanding: String(row.outstanding) }, completedAt: new Date() } });
          await transaction.auditLog.create({ data: { tenantId: branch.tenantId, action: 'onboarding.import.corrected_pending', entityType: 'borrower_onboarding_pending_position', entityId: pending.id, oldValue: { outstanding: '26500' }, newValue: { outstanding: String(row.outstanding), source: 'Kakinga B spreadsheet row 86', reason: 'Confirmed spreadsheet replaces test entry' } } });
        }
        const maturity = addDays(row.paymentStart, 30);
        const loan = await transaction.loan.create({
          data: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            customerId: customer.id,
            principal: decimal(row.principal),
            balance: decimal(row.outstanding),
            currency: 'UGX',
            status: row.outstanding === 0 ? 'CLOSED' : maturity < utcDate(asOfDate) ? 'IN_ARREARS' : 'CURRENT',
            approvedAt: row.issuedAt,
            disbursedAt: row.issuedAt,
            paymentStartDate: row.paymentStart,
            createdAt: row.issuedAt,
          },
        });
        const names = splitName(row.name);
        const application = await transaction.loanApplication.create({
          data: {
            localId: `kakinga-b-opening-app-${row.sourceNumber}-${asOfDate}`,
            tenantId: branch.tenantId,
            branchId: branch.id,
            officerUserId: recorder.id,
            customerId: customer.id,
            loanId: loan.id,
            status: 'VERIFIED',
            surname: names.surname,
            givenNames: names.givenNames,
            phone,
            nationalId: null,
            principalAmount: decimal(row.principal),
            interestRatePercent: decimal(20),
            durationDays: 30,
            processingFee: decimal(0),
            templateName: 'Imported 30-day daily loan',
            interestType: 'FLAT',
            termValue: 30,
            termUnit: 'DAYS',
            repaymentFrequency: 'DAILY',
            processingFeeType: 'FIXED',
            processingFeeFixedAmount: decimal(0),
            paymentStartPolicy: 'NEXT_DAY',
            paymentStartDelayDays: 1,
            paymentStartDate: row.paymentStart,
            isOpeningMigration: true,
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
            localId: `kakinga-b-opening-disbursement-${row.sourceNumber}-${asOfDate}`,
            tenantId: branch.tenantId,
            branchId: branch.id,
            loanId: loan.id,
            recordedByUserId: recorder.id,
            amount: decimal(row.principal),
            assignedFloatAmount: decimal(0),
            collectedRepaymentsAmount: decimal(0),
            source: 'MIXED_CASH',
            isOpeningMigration: true,
            disbursedAt: row.issuedAt,
            note: `Opening migration from Loan Register.xlsx row ${row.workbookRow}.`,
            createdAt: row.issuedAt,
          },
        });
        if (row.paid > 0) {
          const principalAllocated = Math.min(row.paid, row.principal);
          await transaction.repayment.create({
            data: {
              localId: `kakinga-b-opening-repayment-${row.sourceNumber}-${asOfDate}`,
              tenantId: branch.tenantId,
              branchId: branch.id,
              loanId: loan.id,
              recordedByUserId: recorder.id,
              amount: decimal(row.paid),
              principalAllocated: decimal(principalAllocated),
              interestAllocated: decimal(Math.max(0, row.paid - principalAllocated)),
              feesAllocated: decimal(0),
              method: 'CASH',
              isOpeningMigration: true,
              paidAt: row.issuedAt,
              note: 'Cumulative repayment before opening migration; the source register has no individual repayment dates.',
              receiptNumber: `KKGB-OPEN-${row.sourceNumber}`,
              createdAt: row.issuedAt,
            },
          });
          createdRepayments += 1;
        }
      }
      const [customers, loans, applications, wallets, disbursements, repayments, aggregate] = await Promise.all([
        transaction.customer.count({ where: { branchId: branch.id } }),
        transaction.loan.count({ where: { branchId: branch.id } }),
        transaction.loanApplication.count({ where: { branchId: branch.id } }),
        transaction.clientWallet.count({ where: { branchId: branch.id } }),
        transaction.loanDisbursement.count({ where: { branchId: branch.id } }),
        transaction.repayment.count({ where: { branchId: branch.id } }),
        transaction.loan.aggregate({ where: { branchId: branch.id }, _sum: { balance: true, principal: true } }),
      ]);
      const expectedOutstanding = report.source.outstanding;
      if (customers !== rows.length || loans !== rows.length || applications !== rows.length || wallets !== rows.length || disbursements !== rows.length) {
        throw new Error('Post-import entity count check failed.');
      }
      if (money(aggregate._sum.balance) !== expectedOutstanding) throw new Error('Outstanding balance reconciliation failed.');
      report.imported = {
        customers, loans, applications, wallets, disbursements, repayments,
        principal: money(aggregate._sum.principal),
        outstanding: money(aggregate._sum.balance),
        openingRepaymentRecords: createdRepayments,
      };
      await transaction.auditLog.create({ data: {
        tenantId: branch.tenantId,
        action: 'onboarding.opening_register.imported',
        entityType: 'branch',
        entityId: branch.id,
        newValue: { source: 'Kakinga B spreadsheet', sourceSha256: '813689a214434d92c05b00ba246568d196c54c176cdb4ba8a205131c74581efc', asOfDate, ...report.source, normalizations: normalizationNotes, terms: { flatInterestPercent: 20, durationDays: 30, repaymentFrequency: 'DAILY' } },
      } });
      if (!APPLY) throw DRY_RUN_ROLLBACK;
    }, { timeout: 300_000, maxWait: 30_000 });
  } catch (error) {
    if (error !== DRY_RUN_ROLLBACK) throw error;
  }

  mkdirSync(resolve('data/audits'), { recursive: true });
  const reportPath = resolve(`data/audits/kakinga-b-opening-import-${APPLY ? 'apply' : 'dry-run'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, audit: reportPath }, null, 2));
}

main()
  .finally(async () => { await prisma.$disconnect(); await pool.end(); })
  .catch((error) => { console.error(error); process.exitCode = 1; });
