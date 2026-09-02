#!/usr/bin/env node

const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const TRIAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env'));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');

  const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ['error'],
  });

  try {
    const billings = await prisma.tenantBilling.findMany({
      include: { tenant: { select: { name: true } } },
    });

    const billingUpdates = [];
    for (const row of billings) {
      const nextEnd = addDays(row.trialStartsAt, TRIAL_DAYS);
      if (row.trialEndsAt.getTime() === nextEnd.getTime()) continue;
      await prisma.tenantBilling.update({
        where: { id: row.id },
        data: { trialEndsAt: nextEnd },
      });
      billingUpdates.push({
        tenant: row.tenant.name,
        from: row.trialEndsAt.toISOString(),
        to: nextEnd.toISOString(),
      });
    }

    const trialSubs = await prisma.branchSubscription.findMany({
      where: { status: 'TRIAL' },
      include: {
        branch: { select: { name: true, createdAt: true } },
        tenant: { select: { name: true } },
      },
    });

    const subscriptionUpdates = [];
    for (const row of trialSubs) {
      const startsAt = row.branch.createdAt;
      const endsAt = addDays(startsAt, TRIAL_DAYS);
      if (
        row.currentPeriodStart?.getTime() === startsAt.getTime() &&
        row.currentPeriodEnd?.getTime() === endsAt.getTime()
      ) {
        continue;
      }
      await prisma.branchSubscription.update({
        where: { id: row.id },
        data: {
          currentPeriodStart: startsAt,
          currentPeriodEnd: endsAt,
        },
      });
      subscriptionUpdates.push({
        tenant: row.tenant.name,
        branch: row.branch.name,
        from: row.currentPeriodEnd?.toISOString() ?? null,
        to: endsAt.toISOString(),
      });
    }

    console.log(
      JSON.stringify(
        {
          trialDays: TRIAL_DAYS,
          tenantBillingUpdated: billingUpdates.length,
          trialSubscriptionsUpdated: subscriptionUpdates.length,
          billingUpdates,
          subscriptionUpdates,
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
