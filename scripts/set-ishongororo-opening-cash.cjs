#!/usr/bin/env node

const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const CLOSING = 54100;
const BRANCH_ID = '2d0be4c2-cf83-4b29-9ebb-1f15f0988243';
const YESTERDAY = '2026-09-01';

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

function kampalaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env'));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');

  const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ['error'] });
  const yesterday = new Date(`${YESTERDAY}T00:00:00.000Z`);
  const todayLabel = kampalaToday();
  const today = new Date(`${todayLabel}T00:00:00.000Z`);
  const amount = new Prisma.Decimal(CLOSING.toFixed(2));

  try {
    const branch = await prisma.branch.findUnique({
      where: { id: BRANCH_ID },
      include: { tenant: true },
    });
    if (!branch) throw new Error('Ishongororo branch not found');

    let yesterdayOp = await prisma.branchDailyOperation.findUnique({
      where: {
        tenantId_branchId_operationDate: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          operationDate: yesterday,
        },
      },
    });

    if (!yesterdayOp) {
      const recorder = await prisma.user.findFirst({
        where: { tenantId: branch.tenantId, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
      });
      if (!recorder) throw new Error('No active user to close yesterday');
      yesterdayOp = await prisma.branchDailyOperation.create({
        data: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          operationDate: yesterday,
          status: 'CLOSED',
          openedAt: new Date(`${YESTERDAY}T09:00:00.000Z`),
          openedByUserId: recorder.id,
          closedAt: new Date(`${YESTERDAY}T18:00:00.000Z`),
          closedByUserId: recorder.id,
          cashInVault: amount,
          cashInSafe: new Prisma.Decimal(0),
          cashAddedToday: new Prisma.Decimal(0),
          openingFloatAvailable: amount,
          previousClosingBalance: amount,
          floatSetAsideAmount: amount,
          closingBalance: amount,
          notes: '[COGLIM-ISHONGORORO] Cutover cash. Yesterday closing / today opening UGX 54,100.',
          closingNotes: '[COGLIM-ISHONGORORO] Confirmed office closing cash UGX 54,100.',
        },
      });
    } else {
      yesterdayOp = await prisma.branchDailyOperation.update({
        where: { id: yesterdayOp.id },
        data: {
          status: 'CLOSED',
          closedAt: yesterdayOp.closedAt || new Date(`${YESTERDAY}T18:00:00.000Z`),
          closingBalance: amount,
          closingNotes: '[COGLIM-ISHONGORORO] Confirmed office closing cash UGX 54,100.',
        },
      });
    }

    const todayOp = await prisma.branchDailyOperation.findUnique({
      where: {
        tenantId_branchId_operationDate: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          operationDate: today,
        },
      },
    });

    let todayUpdate = null;
    if (todayOp) {
      const cashAdded = Number(todayOp.cashAddedToday || 0);
      const available = CLOSING + cashAdded;
      todayUpdate = await prisma.branchDailyOperation.update({
        where: { id: todayOp.id },
        data: {
          previousClosingBalance: amount,
          openingFloatAvailable: new Prisma.Decimal(available.toFixed(2)),
          floatSetAsideAmount: new Prisma.Decimal(available.toFixed(2)),
        },
      });
    }

    console.log(
      JSON.stringify(
        {
          branch: branch.name,
          tenant: branch.tenant.name,
          yesterday: {
            date: YESTERDAY,
            status: yesterdayOp.status,
            closingBalance: Number(yesterdayOp.closingBalance),
          },
          today: todayOp
            ? {
                date: todayLabel,
                status: todayUpdate?.status || todayOp.status,
                previousClosingBalance: Number(
                  (todayUpdate || todayOp).previousClosingBalance,
                ),
                openingFloatAvailable: Number(
                  (todayUpdate || todayOp).openingFloatAvailable,
                ),
              }
            : {
                date: todayLabel,
                status: 'not opened yet',
                willOpenWith: CLOSING,
              },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
