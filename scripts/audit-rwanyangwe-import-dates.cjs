#!/usr/bin/env node

/*
 * Read-only reconciliation for the Rwanyangwe opening-register import.
 * It deliberately makes no database changes. Its output is a JSON audit that
 * can be reviewed before any financial dates are corrected.
 */

const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');

const workbookArg = process.argv.find((value) => value.startsWith('--workbook='));
const branchArg = process.argv.find((value) => value.startsWith('--branch='));
const workbookPath = resolve(workbookArg?.slice(11) || 'Loan Register.xlsx');
const branchName = (branchArg?.slice(9) || 'rwanyangwe').trim();

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function dateKey(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function parseIssueDate(value, rowNumber) {
  const source = String(value || '').trim();
  const match = source.match(/^(\d{1,2})(?:st|nd|rd|th)?\/(\d{1,2})(?:\/)?(\d{4})$/i);
  if (!match) throw new Error(`Workbook row ${rowNumber}: invalid issue date "${source}".`);
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

async function readSourceDates() {
  if (!existsSync(workbookPath)) throw new Error(`Workbook not found: ${workbookPath}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Workbook has no worksheet.');
  const rows = new Map();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (!row.getCell(2).text.trim()) continue;
    rows.set(rowNumber, {
      name: row.getCell(2).text.trim(),
      sourceIssueDate: parseIssueDate(row.getCell(6).text, rowNumber),
      total: money(row.getCell(3).value),
      balance: money(row.getCell(4).value),
    });
  }
  return rows;
}

async function main() {
  loadEnv(resolve(process.cwd(), '.env'));
  loadEnv(resolve(process.cwd(), 'services/api/.env'));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
  const source = await readSourceDates();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const branchResult = await pool.query(
      `select b.id, b.name, t.name as tenant_name
       from branches b join tenants t on t.id = b.tenant_id
       where lower(b.name) = lower($1)`,
      [branchName],
    );
    if (branchResult.rowCount !== 1) throw new Error(`Expected one ${branchName} branch, found ${branchResult.rowCount}.`);
    const branch = branchResult.rows[0];
    const id = branch.id;
    const imports = await pool.query(
      `select la.local_id, c.full_name, l.id as loan_id, l.principal, l.balance, l.status,
              l.disbursed_at, l.payment_start_date, l.created_at as loan_created_at,
              ld.disbursed_at as disbursement_at, ld.created_at as disbursement_created_at,
              coalesce((select min(r.paid_at) from repayments r where r.loan_id = l.id), null) as first_repayment_at
       from loan_applications la
       join loans l on l.id = la.loan_id
       join customers c on c.id = l.customer_id
       left join lateral (
         select * from loan_disbursements d where d.loan_id = l.id order by d.disbursed_at asc limit 1
       ) ld on true
       where la.branch_id = $1 and la.local_id like 'rwanyangwe-opening-app-%'
       order by la.local_id`,
      [id],
    );
    const mismatches = [];
    const importedRows = imports.rows.map((record) => {
      const match = record.local_id.match(/^rwanyangwe-opening-app-(\d+)-/);
      const workbookRow = match ? Number(match[1]) : null;
      const input = workbookRow ? source.get(workbookRow) : null;
      const expected = input?.sourceIssueDate || null;
      const dates = {
        loanDisbursed: dateKey(record.disbursed_at),
        loanCreated: dateKey(record.loan_created_at),
        disbursement: dateKey(record.disbursement_at),
        repayment: dateKey(record.first_repayment_at),
      };
      const wrong = expected && Object.entries(dates)
        .filter(([key, value]) => value && value !== expected && key !== 'repayment')
        .map(([key, value]) => ({ field: key, actual: value, expected }));
      if (wrong.length || !input) mismatches.push({ localId: record.local_id, workbookRow, customer: record.full_name, wrong, sourceFound: Boolean(input) });
      return { workbookRow, localId: record.local_id, customer: record.full_name, sourceIssueDate: expected, dates, principal: money(record.principal), balance: money(record.balance), status: record.status };
    });
    const [operations, loansByDate, repaymentsByDate, topUps, expenses, bankings, cashRecordsAt450k] = await Promise.all([
      pool.query(`select operation_date, status, previous_closing_balance, cash_added_today, closing_balance, created_at from branch_daily_operations where branch_id=$1 order by operation_date`, [id]),
      pool.query(`select disbursed_at::date as day, count(*)::int as records, coalesce(sum(amount),0) as amount from loan_disbursements where branch_id=$1 group by 1 order by 1`, [id]),
      pool.query(`select paid_at::date as day, count(*)::int as records, coalesce(sum(amount),0) as amount from repayments where branch_id=$1 and voided_at is null group by 1 order by 1`, [id]),
      pool.query(`select t.id, t.amount, t.description, t.added_at, t.created_at, o.operation_date from branch_operation_topups t join branch_daily_operations o on o.id=t.operation_id where t.branch_id=$1 order by t.added_at`, [id]),
      pool.query(`select e.id, e.amount, e.description, e.incurred_at, e.created_at, o.operation_date from branch_operation_expenses e join branch_daily_operations o on o.id=e.operation_id where e.branch_id=$1 order by e.incurred_at`, [id]),
      pool.query(`select b.id, b.amount, b.type, b.banked_at, b.created_at, o.operation_date from branch_operation_bankings b join branch_daily_operations o on o.id=b.operation_id where b.branch_id=$1 order by b.banked_at`, [id]),
      pool.query(
        `select 'topup' as record_type, id, amount, added_at as occurred_at, description from branch_operation_topups where branch_id=$1 and amount=450000
         union all select 'expense', id, amount, incurred_at, description from branch_operation_expenses where branch_id=$1 and amount=450000
         union all select 'banking', id, amount, banked_at, coalesce(notes, reference) from branch_operation_bankings where branch_id=$1 and amount=450000
         union all select 'repayment', id, amount, paid_at, null from repayments where branch_id=$1 and voided_at is null and amount=450000
         union all select 'disbursement', id, amount, disbursed_at, note from loan_disbursements where branch_id=$1 and amount=450000
         order by occurred_at`,
        [id],
      ),
    ]);
    const result = {
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY',
      branch: { id, name: branch.name, tenant: branch.tenant_name },
      sourceRows: source.size,
      importedLoans: importedRows.length,
      importedDateMismatchCount: mismatches.length,
      importedDateMismatches: mismatches,
      importedLoansOn2026_10_16: importedRows.filter((row) => row.dates.loanDisbursed === '2026-10-16'),
      dailyOperations: operations.rows,
      loansByDisbursementDate: loansByDate.rows,
      repaymentsByPaymentDate: repaymentsByDate.rows,
      topUps: topUps.rows,
      suspicious450kTopUps: topUps.rows.filter((row) => money(row.amount) === 450000),
      recordsAt450k: cashRecordsAt450k.rows,
      expenses: expenses.rows,
      bankings: bankings.rows,
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
