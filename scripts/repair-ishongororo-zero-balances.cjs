#!/usr/bin/env node

/**
 * Restore Ishongororo official-open loans whose live balance was zeroed by
 * rebuild/void paths. Target = Coglim cutover balance − live (non-COGLIM)
 * repayments. Allocations are left alone.
 */

const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const BRANCH_ID = '2d0be4c2-cf83-4b29-9ebb-1f15f0988243';
const IMPORT_PATH = resolve(
  process.cwd(),
  'data/coglim-export/ishongororo/ishongororo-import.json',
);
const DRY_RUN = process.env.DRY_RUN === '1';

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function stripEnvQuotes(value) {
  const t = value.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function buildPoolConfig(connectionString) {
  const url = new URL(stripEnvQuotes(connectionString));
  const host = url.hostname;
  const sslmode = url.searchParams.get('sslmode');
  const sslrootcert = url.searchParams.get('sslrootcert');
  const local =
    !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const wantsSsl = Boolean(sslmode && sslmode !== 'disable') || !local;
  const config = {
    host,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    connectionTimeoutMillis: 20000,
  };
  if (wantsSsl) {
    const caPath =
      sslrootcert && existsSync(sslrootcert)
        ? sslrootcert
        : resolve(process.cwd(), 'global-bundle.pem');
    config.ssl = {
      rejectUnauthorized: sslmode !== 'no-verify',
      ca: readFileSync(caPath, 'utf8'),
    };
  }
  return config;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env'));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  if (!existsSync(IMPORT_PATH)) throw new Error(`Missing ${IMPORT_PATH}`);

  const pack = JSON.parse(readFileSync(IMPORT_PATH, 'utf8'));
  const byKey = new Map(
    (pack.loans || [])
      .filter((loan) => loan.isOfficialCurrent)
      .map((loan) => [loan.sourceLoanKey, loan]),
  );

  const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ['error'],
  });

  try {
    const disbs = await prisma.loanDisbursement.findMany({
      where: {
        branchId: BRANCH_ID,
        note: { contains: 'official open book' },
      },
      include: {
        loan: {
          include: {
            customer: { select: { fullName: true } },
            repayments: {
              where: { voidedAt: null },
              select: { amount: true, note: true },
            },
          },
        },
      },
    });

    const repairs = [];
    for (const disb of disbs) {
      const key = ((disb.note || '').match(/Cycle\s+(\S+)/) || [])[1];
      const row = key ? byKey.get(key) : null;
      if (!row) continue;

      const livePaid = round2(
        disb.loan.repayments
          .filter((r) => !(r.note || '').includes('COGLIM'))
          .reduce((sum, r) => sum + Number(r.amount), 0),
      );
      const target = Math.max(0, round2(Number(row.balance) - livePaid));
      const current = round2(Number(disb.loan.balance));
      const statusWant =
        target <= 0
          ? 'CLOSED'
          : row.isDefaulter
            ? 'IN_ARREARS'
            : row.status === 'IN_ARREARS'
              ? 'IN_ARREARS'
              : 'CURRENT';

      const needsBalance = Math.abs(current - target) > 1;
      const needsReopen = target > 0 && disb.loan.status === 'CLOSED';
      if (!needsBalance && !needsReopen) continue;

      repairs.push({
        loanId: disb.loan.id,
        tenantId: disb.loan.tenantId,
        name: disb.loan.customer.fullName,
        key,
        current,
        target,
        status: disb.loan.status,
        statusWant,
        importBal: Number(row.balance),
        livePaid,
      });
    }

    console.log(
      JSON.stringify(
        {
          dryRun: DRY_RUN,
          candidates: repairs.length,
          repairs,
        },
        null,
        2,
      ),
    );

    if (DRY_RUN || repairs.length === 0) return;

    for (const item of repairs) {
      await prisma.loan.update({
        where: { id: item.loanId },
        data: {
          balance: new Prisma.Decimal(item.target.toFixed(2)),
          status: item.statusWant,
        },
      });
      await prisma.auditLog.create({
        data: {
          tenantId: item.tenantId,
          actorUserId: null,
          action: 'loan.balance.repaired',
          entityType: 'Loan',
          entityId: item.loanId,
          oldValue: {
            balance: item.current,
            status: item.status,
          },
          newValue: {
            balance: item.target,
            status: item.statusWant,
            reason:
              'Restore official Coglim open-book balance after void/rebuild zeroing',
            importBalance: item.importBal,
            livePaid: item.livePaid,
            sourceLoanKey: item.key,
          },
        },
      });
    }

    console.log(JSON.stringify({ applied: repairs.length }, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
