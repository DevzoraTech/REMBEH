#!/usr/bin/env node

const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const MONTH_TRIAL_DAYS = 30;
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

function isCashbossTenant(name) {
  return /cashboss/i.test(name ?? '');
}

function isBurembaBranch(name) {
  return /buremba/i.test(name ?? '');
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
    const tenants = await prisma.tenant.findMany({
      where: { name: { contains: 'CASHBOSS', mode: 'insensitive' } },
      select: {
        id: true,
        name: true,
        billing: {
          select: { id: true, trialStartsAt: true, trialEndsAt: true },
        },
        branches: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            subscription: {
              select: {
                id: true,
                status: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
              },
            },
          },
        },
      },
    });

    const cashboss = tenants.filter((row) => isCashbossTenant(row.name));
    if (cashboss.length === 0) {
      throw new Error('No Cashboss organisation found.');
    }

    const billingUpdates = [];
    const subscriptionUpdates = [];
    const skippedBranches = [];

    for (const tenant of cashboss) {
      if (tenant.billing) {
        const nextEnd = addDays(tenant.billing.trialStartsAt, MONTH_TRIAL_DAYS);
        if (tenant.billing.trialEndsAt.getTime() !== nextEnd.getTime()) {
          await prisma.tenantBilling.update({
            where: { id: tenant.billing.id },
            data: { trialEndsAt: nextEnd },
          });
          billingUpdates.push({
            tenant: tenant.name,
            from: tenant.billing.trialEndsAt.toISOString(),
            to: nextEnd.toISOString(),
          });
        }
      }

      for (const branch of tenant.branches) {
        if (!isBurembaBranch(branch.name)) {
          skippedBranches.push({
            tenant: tenant.name,
            branch: branch.name,
            reason: 'not Buremba',
          });
          continue;
        }
        const sub = branch.subscription;
        if (!sub || sub.status !== 'TRIAL') {
          skippedBranches.push({
            tenant: tenant.name,
            branch: branch.name,
            reason: sub ? `status ${sub.status}` : 'no subscription',
          });
          continue;
        }
        const startsAt = branch.createdAt;
        const endsAt = addDays(startsAt, MONTH_TRIAL_DAYS);
        if (
          sub.currentPeriodStart?.getTime() === startsAt.getTime() &&
          sub.currentPeriodEnd?.getTime() === endsAt.getTime()
        ) {
          continue;
        }
        await prisma.branchSubscription.update({
          where: { id: sub.id },
          data: {
            currentPeriodStart: startsAt,
            currentPeriodEnd: endsAt,
          },
        });
        subscriptionUpdates.push({
          tenant: tenant.name,
          branch: branch.name,
          from: sub.currentPeriodEnd?.toISOString() ?? null,
          to: endsAt.toISOString(),
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          trialDays: MONTH_TRIAL_DAYS,
          tenants: cashboss.map((row) => ({
            name: row.name,
            branches: row.branches.map((branch) => branch.name),
          })),
          tenantBillingUpdated: billingUpdates.length,
          trialSubscriptionsUpdated: subscriptionUpdates.length,
          billingUpdates,
          subscriptionUpdates,
          skippedBranches,
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
