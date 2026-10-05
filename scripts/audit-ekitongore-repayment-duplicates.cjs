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

async function main() {
  const branch = await prisma.branch.findFirst({
    where: { name: { contains: 'EKITONGORE', mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (!branch) throw new Error('Ekitongore branch was not found.');

  const groups = await prisma.$queryRaw`
    SELECT
      c.full_name AS "borrowerName",
      r.loan_id AS "loanId",
      r.amount,
      r.paid_at AS "paidAt",
      r.recorded_by_user_id AS "recordedByUserId",
      COUNT(*)::int AS "count",
      ARRAY_AGG(r.id ORDER BY r.created_at) AS "repaymentIds",
      ARRAY_AGG(r.local_id ORDER BY r.created_at) AS "localIds"
    FROM repayments r
    JOIN loans l ON l.id = r.loan_id
    JOIN customers c ON c.id = l.customer_id
    WHERE r.branch_id = ${branch.id}::uuid
      AND r.voided_at IS NULL
      AND r.paid_at >= '2026-09-24T00:00:00.000Z'::timestamptz
    GROUP BY c.full_name, r.loan_id, r.amount, r.paid_at, r.recorded_by_user_id
    HAVING COUNT(*) > 1
    ORDER BY r.paid_at ASC, c.full_name ASC
  `;

  console.log(JSON.stringify({ branch: branch.name, duplicateGroups: groups }, null, 2));
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
