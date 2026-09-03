#!/usr/bin/env node

const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomBytes, randomInt, scrypt: scryptCallback } = require('node:crypto');
const { promisify } = require('node:util');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const scrypt = promisify(scryptCallback);

const PRO_PLANS = [
  {
    code: 'PRO',
    name: 'Pro',
    amount: 255000,
    interval: 'MONTHLY',
  },
  {
    code: 'PRO_3M',
    name: 'Pro',
    amount: 725000,
    interval: 'THREE_MONTHS',
  },
  {
    code: 'PRO_6M',
    name: 'Pro',
    amount: 1385000,
    interval: 'SIX_MONTHS',
  },
];

const BRANCH_MANAGER_PERMISSIONS = [
  'sync.download',
  'sync.upload',
  'branch.read',
  'branch.staff.read',
  'branch.staff.invite',
  'user.read',
  'user.invite',
  'user.activate',
  'customer.create',
  'customer.read',
  'customer.update',
  'loan.create',
  'loan.read',
  'loan.update',
  'loan.product.manage',
  'collection.create',
  'collection.read',
  'operation.read',
  'operation.open',
  'operation.cash.topup',
  'operation.float.manage',
  'operation.float.return',
  'operation.expense.create',
  'operation.expense.approve',
  'operation.close',
  'operation.report.review',
  'report.read',
];

const ENABLED_MODULES = [
  'workspace',
  'identity',
  'customers',
  'loans',
  'collections',
  'operations',
  'cashiers',
  'reports',
  'notifications',
  'sync',
  'enterprise',
];

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (process.env[key]) {
      continue;
    }

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

function buildPoolConfig(connectionString) {
  const url = new URL(stripEnvQuotes(connectionString));
  const host = url.hostname;
  const sslmode = url.searchParams.get('sslmode');
  const sslrootcert = url.searchParams.get('sslrootcert');
  const wantsSsl =
    Boolean(sslmode && sslmode !== 'disable') || !isLocalHostname(host);

  const config = {
    host,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    ssl: undefined,
  };

  if (!wantsSsl) {
    return config;
  }

  const caPath = resolveSslRootCertPath(sslrootcert);
  if (!existsSync(caPath)) {
    throw new Error(`RDS SSL root certificate not found at ${caPath}`);
  }

  config.ssl = {
    rejectUnauthorized: sslmode !== 'no-verify',
    ca: readFileSync(caPath, 'utf8'),
  };

  return config;
}

function resolveSslRootCertPath(sslrootcert) {
  const candidates = [];

  if (sslrootcert) {
    if (sslrootcert.startsWith('/')) {
      candidates.push(sslrootcert);
    } else {
      candidates.push(resolve(process.cwd(), sslrootcert));
      candidates.push(resolve(process.cwd(), '../../', sslrootcert));
    }
  }

  candidates.push(resolve(process.cwd(), 'global-bundle.pem'));
  candidates.push(resolve(process.cwd(), '../../global-bundle.pem'));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function stripEnvQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isLocalHostname(host) {
  return (
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local')
  );
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseLegacyRows(csvPath) {
  if (!existsSync(csvPath)) {
    throw new Error(`Legacy CSV not found at ${csvPath}`);
  }

  const csv = readFileSync(csvPath, 'utf8');
  const rows = parseCsv(csv).filter((row) =>
    row.some((field) => field.trim().length > 0),
  );

  if (rows.length < 2) {
    throw new Error('Legacy CSV must include a header row and data rows.');
  }

  const headers = rows[0].map((field) => normalizeHeader(field));
  const required = ['row_number', 'borrower_name', 'loan_amount', 'loan_balance'];
  for (const name of required) {
    if (!headers.includes(name)) {
      throw new Error(`Legacy CSV is missing required column: ${name}`);
    }
  }

  return rows.slice(1).map((values, index) => {
    const record = {};
    headers.forEach((header, headerIndex) => {
      record[header] = values[headerIndex]?.trim() ?? '';
    });

    const rowNumber = parseInteger(record.row_number, index + 1);
    const borrowerName = record.borrower_name.trim();
    const loanAmount = parseMoney(record.loan_amount, `loan_amount row ${rowNumber}`);
    const loanBalance = parseMoney(
      record.loan_balance,
      `loan_balance row ${rowNumber}`,
    );

    if (!borrowerName) {
      throw new Error(`Borrower name is missing on row ${rowNumber}`);
    }

    return {
      rowNumber,
      borrowerName,
      loanAmount,
      loanBalance,
    };
  });
}

function normalizeHeader(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value).replace(/,/g, ''), 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function parseMoney(value, label) {
  const parsed = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return Math.round(parsed * 100) / 100;
}

function decimal(value) {
  return new Prisma.Decimal(value.toFixed(2));
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function dateOnlyForTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const derivedKey = await scrypt(password, salt, 64);

  return `scrypt$${salt}$${Buffer.from(derivedKey).toString('base64url')}`;
}

function permissionModuleKey(permissionKey) {
  if (permissionKey.startsWith('sync.')) return 'sync';
  if (permissionKey.startsWith('branch.')) return 'workspace';
  if (permissionKey.startsWith('user.') || permissionKey.startsWith('role.')) {
    return 'identity';
  }
  if (permissionKey.startsWith('customer.')) return 'customers';
  if (permissionKey.startsWith('loan.')) return 'loans';
  if (permissionKey.startsWith('collection.')) return 'collections';
  if (permissionKey.startsWith('operation.')) return 'operations';
  if (permissionKey.startsWith('cashdrawer.') || permissionKey.startsWith('cashier.')) {
    return 'cashiers';
  }
  if (permissionKey.startsWith('report.')) return 'reports';
  return 'workspace';
}

function slug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function findUnusedPublicId(prisma) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const publicId = `A-${randomInt(10000, 100000)}`;
    const existing = await prisma.user.findUnique({
      where: { publicId },
      select: { id: true },
    });
    if (!existing) {
      return publicId;
    }
  }

  throw new Error('Could not generate a unique public ID for the manager.');
}

async function ensurePlans(prisma) {
  const plans = [];
  for (const plan of PRO_PLANS) {
    plans.push(
      await prisma.subscriptionPlan.upsert({
        where: { code: plan.code },
        update: {
          name: plan.name,
          amount: decimal(plan.amount),
          currency: 'UGX',
          interval: plan.interval,
          isActive: true,
        },
        create: {
          code: plan.code,
          name: plan.name,
          amount: decimal(plan.amount),
          currency: 'UGX',
          interval: plan.interval,
          isActive: true,
        },
      }),
    );
  }
  return plans;
}

async function ensureTenant(prisma, tenantName) {
  const existing = await prisma.tenant.findFirst({
    where: { name: tenantName },
    orderBy: { createdAt: 'asc' },
  });

  if (existing) {
    return prisma.tenant.update({
      where: { id: existing.id },
      data: {
        country: 'UG',
        currency: 'UGX',
        status: 'ACTIVE',
        storagePrefix: existing.storagePrefix ?? `${slug(tenantName)}/`,
      },
    });
  }

  return prisma.tenant.create({
    data: {
      name: tenantName,
      country: 'UG',
      currency: 'UGX',
      status: 'ACTIVE',
      storagePrefix: `${slug(tenantName)}/`,
    },
  });
}

async function ensureBranch(prisma, tenantId, branchName) {
  return prisma.branch.upsert({
    where: {
      tenantId_name: {
        tenantId,
        name: branchName,
      },
    },
    update: {
      address: 'Legacy import test branch',
    },
    create: {
      tenantId,
      name: branchName,
      address: 'Legacy import test branch',
    },
  });
}

async function resolveExistingBranch(prisma, input) {
  if (input.branchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: input.branchId },
      include: {
        tenant: true,
      },
    });

    if (!branch) {
      throw new Error(`Branch not found for LEGACY_BRANCH_ID=${input.branchId}`);
    }

    return {
      tenant: branch.tenant,
      branch,
    };
  }

  const matches = await prisma.branch.findMany({
    where: {
      name: {
        equals: input.branchName,
        mode: 'insensitive',
      },
    },
    include: {
      tenant: true,
    },
    orderBy: [{ tenant: { name: 'asc' } }, { name: 'asc' }],
  });

  if (matches.length === 0) {
    throw new Error(`No existing branch named "${input.branchName}" was found.`);
  }

  if (matches.length > 1) {
    const list = matches
      .map(
        (branch) =>
          `- ${branch.name} (${branch.id}) in ${branch.tenant.name} (${branch.tenant.id})`,
      )
      .join('\n');
    throw new Error(
      `More than one branch named "${input.branchName}" was found. ` +
        `Set LEGACY_BRANCH_ID to one of:\n${list}`,
    );
  }

  const branch = matches[0];
  return {
    tenant: branch.tenant,
    branch,
  };
}

async function ensureBranchManagerRole(prisma, tenantId) {
  for (const moduleKey of ENABLED_MODULES) {
    await prisma.tenantModule.upsert({
      where: {
        tenantId_moduleKey: {
          tenantId,
          moduleKey,
        },
      },
      update: {
        status: 'ENABLED',
      },
      create: {
        tenantId,
        moduleKey,
        status: 'ENABLED',
      },
    });
  }

  const permissions = [];
  for (const key of BRANCH_MANAGER_PERMISSIONS) {
    permissions.push(
      await prisma.permission.upsert({
        where: {
          tenantId_key: {
            tenantId,
            key,
          },
        },
        update: {
          moduleKey: permissionModuleKey(key),
          description: key,
        },
        create: {
          tenantId,
          key,
          moduleKey: permissionModuleKey(key),
          description: key,
        },
      }),
    );
  }

  const role = await prisma.role.upsert({
    where: {
      tenantId_name: {
        tenantId,
        name: 'Branch Manager',
      },
    },
    update: {
      description: 'Can manage one branch and its daily operations.',
      isSystem: true,
    },
    create: {
      tenantId,
      name: 'Branch Manager',
      description: 'Can manage one branch and its daily operations.',
      isSystem: true,
    },
  });

  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: role.id,
        permissionId: permission.id,
      },
    });
  }

  return role;
}

async function ensureManager(prisma, input) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      tenantId: true,
      passwordHash: true,
      publicId: true,
    },
  });

  if (existing && existing.tenantId !== input.tenantId) {
    throw new Error(
      `A user with email ${input.email} already exists in a different tenant. ` +
        'Use a different test manager email or move the user deliberately.',
    );
  }

  if (!existing && !input.password) {
    throw new Error('LEGACY_MANAGER_PASSWORD is required for a new manager.');
  }

  const passwordHash = input.password
    ? await hashPassword(input.password)
    : existing?.passwordHash;

  const publicId = existing?.publicId ?? (await findUnusedPublicId(prisma));

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        displayName: input.displayName,
        status: 'ACTIVE',
        emailVerified: true,
        passwordHash,
        publicId,
      },
    });
  }

  return prisma.user.create({
    data: {
      tenantId: input.tenantId,
      branchId: input.branchId,
      email: input.email,
      displayName: input.displayName,
      status: 'ACTIVE',
      emailVerified: true,
      phoneVerified: false,
      passwordHash,
      publicId,
    },
  });
}

async function ensureActiveSubscription(prisma, input) {
  const now = new Date();
  const trialStartsAt = now;
  const trialEndsAt = addDays(now, 30);
  const currentPeriodEnd = addDays(now, 30);

  await prisma.tenantBilling.upsert({
    where: { tenantId: input.tenantId },
    update: {
      trialStartsAt,
      trialEndsAt,
    },
    create: {
      tenantId: input.tenantId,
      trialStartsAt,
      trialEndsAt,
    },
  });

  return prisma.branchSubscription.upsert({
    where: { branchId: input.branchId },
    update: {
      planId: input.planId,
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd,
      graceEndsAt: null,
      lockedAt: null,
      lastReminderAt: null,
    },
    create: {
      tenantId: input.tenantId,
      branchId: input.branchId,
      planId: input.planId,
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd,
    },
  });
}

async function ensureOpenOperation(prisma, input) {
  return prisma.branchDailyOperation.upsert({
    where: {
      tenantId_branchId_operationDate: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        operationDate: input.operationDate,
      },
    },
    update: {
      status: 'OPEN',
      openedByUserId: input.openedByUserId,
      closedAt: null,
      closedByUserId: null,
      closingBalance: null,
      closingNotes: null,
    },
    create: {
      tenantId: input.tenantId,
      branchId: input.branchId,
      operationDate: input.operationDate,
      status: 'OPEN',
      openedAt: new Date(),
      openedByUserId: input.openedByUserId,
      cashInVault: decimal(0),
      cashInSafe: decimal(0),
      cashAddedToday: decimal(0),
      openingFloatAvailable: decimal(0),
      previousClosingBalance: decimal(0),
      floatSetAsideAmount: decimal(0),
      notes: 'Opened automatically for legacy import test.',
    },
  });
}

async function importLegacyLoans(prisma, input) {
  let customersCreated = 0;
  let customersUpdated = 0;
  let loansCreated = 0;
  let loansSkipped = 0;
  let walletsBackfilled = 0;

  for (const row of input.rows) {
    const rowToken = String(row.rowNumber).padStart(4, '0');
    const placeholderPhone = `${input.placeholderPhonePrefix}-${rowToken}`;
    const nationalId = `LEGACY-${slug(input.branchName).toUpperCase()}-${rowToken}`;

    const existingCustomer = await prisma.customer.findUnique({
      where: {
        tenantId_branchId_phone: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          phone: placeholderPhone,
        },
      },
      select: { id: true },
    });

    const customer = await prisma.customer.upsert({
      where: {
        tenantId_branchId_phone: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          phone: placeholderPhone,
        },
      },
      update: {
        branchId: input.branchId,
        fullName: row.borrowerName,
        nationalId,
        verifiedAt: new Date(),
      },
      create: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        fullName: row.borrowerName,
        phone: placeholderPhone,
        nationalId,
        verifiedAt: new Date(),
      },
    });

    if (existingCustomer) {
      customersUpdated += 1;
    } else {
      customersCreated += 1;
    }

    const existingLoan = await prisma.loan.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        customerId: customer.id,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        balance: true,
        wallet: {
          select: { id: true },
        },
      },
    });

    if (existingLoan) {
      loansSkipped += 1;

      if (!existingLoan.wallet) {
        await prisma.clientWallet.create({
          data: {
            tenantId: input.tenantId,
            branchId: input.branchId,
            customerId: customer.id,
            loanId: existingLoan.id,
            currency: 'UGX',
            openingBalance: existingLoan.balance,
          },
        });
        walletsBackfilled += 1;
      }

      continue;
    }

    const loan = await prisma.loan.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        customerId: customer.id,
        principal: decimal(row.loanAmount),
        balance: decimal(row.loanBalance),
        currency: 'UGX',
        status: row.loanBalance > 0 ? 'CURRENT' : 'CLOSED',
        approvedAt: input.operationDate,
        disbursedAt: input.operationDate,
        paymentStartDate: input.operationDate,
      },
    });

    await prisma.clientWallet.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        customerId: customer.id,
        loanId: loan.id,
        currency: 'UGX',
        openingBalance: decimal(row.loanBalance),
      },
    });

    loansCreated += 1;
  }

  return {
    customersCreated,
    customersUpdated,
    loansCreated,
    loansSkipped,
    walletsBackfilled,
  };
}

async function summarize(prisma, input) {
  const [customerCount, loanAgg, managerRoleCount, subscription, operation] =
    await Promise.all([
      prisma.customer.count({
        where: {
          tenantId: input.tenantId,
          branchId: input.branchId,
        },
      }),
      prisma.loan.aggregate({
        where: {
          tenantId: input.tenantId,
          branchId: input.branchId,
        },
        _count: { _all: true },
        _sum: {
          principal: true,
          balance: true,
        },
      }),
      prisma.userRole.count({
        where: {
          userId: input.managerId,
          role: {
            name: 'Branch Manager',
            tenantId: input.tenantId,
          },
        },
      }),
      prisma.branchSubscription.findUnique({
        where: { branchId: input.branchId },
        select: {
          status: true,
          currentPeriodEnd: true,
        },
      }),
      prisma.branchDailyOperation.findUnique({
        where: {
          tenantId_branchId_operationDate: {
            tenantId: input.tenantId,
            branchId: input.branchId,
            operationDate: input.operationDate,
          },
        },
        select: {
          status: true,
          operationDate: true,
        },
      }),
    ]);

  return {
    customers: customerCount,
    loans: loanAgg._count._all,
    principalTotal: Number(loanAgg._sum.principal ?? 0),
    balanceTotal: Number(loanAgg._sum.balance ?? 0),
    managerHasBranchManagerRole: managerRoleCount > 0,
    subscriptionStatus: subscription?.status ?? null,
    subscriptionCurrentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    operationStatus: operation?.status ?? null,
    operationDate: operation?.operationDate ?? null,
  };
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env'));
  loadEnvFile(resolve(process.cwd(), '../../.env'));

  const csvPath = process.env.LEGACY_CSV_PATH;
  const tenantName =
    process.env.LEGACY_TENANT_NAME || 'Legacy Data Test Organization';
  const branchName = process.env.LEGACY_BRANCH_NAME || 'test branch';
  const branchId = process.env.LEGACY_BRANCH_ID || '';
  const useExistingBranch = process.env.LEGACY_USE_EXISTING_BRANCH === '1';
  const managerEmail = (process.env.LEGACY_MANAGER_EMAIL || '').trim().toLowerCase();
  const managerPassword = process.env.LEGACY_MANAGER_PASSWORD || '';
  const managerName = process.env.LEGACY_MANAGER_NAME || 'Bonnefilleul Manager';
  const phonePrefix =
    process.env.LEGACY_PLACEHOLDER_PHONE_PREFIX || `${slug(branchName)}-legacy`;
  const timezone = process.env.LEGACY_OPERATION_TIMEZONE || 'Africa/Kampala';

  if (!csvPath) {
    throw new Error('LEGACY_CSV_PATH is required.');
  }

  if (!managerEmail) {
    throw new Error('LEGACY_MANAGER_EMAIL is required.');
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required.');
  }

  const rows = parseLegacyRows(csvPath);
  const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ['error'],
  });

  try {
    await prisma.$connect();

    const plans = await ensurePlans(prisma);
    const monthlyPlan = plans.find((plan) => plan.code === 'PRO') ?? plans[0];
    const { tenant, branch } = useExistingBranch
      ? await resolveExistingBranch(prisma, {
          branchId,
          branchName,
        })
      : {
          tenant: await ensureTenant(prisma, tenantName),
          branch: null,
        };
    const resolvedBranch =
      branch ?? (await ensureBranch(prisma, tenant.id, branchName));

    const role = await ensureBranchManagerRole(prisma, tenant.id);
    const manager = await ensureManager(prisma, {
      tenantId: tenant.id,
      branchId: resolvedBranch.id,
      email: managerEmail,
      displayName: managerName,
      password: managerPassword,
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: manager.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId: manager.id,
        roleId: role.id,
      },
    });

    await ensureActiveSubscription(prisma, {
      tenantId: tenant.id,
      branchId: resolvedBranch.id,
      planId: monthlyPlan.id,
    });

    await prisma.tenantSmsNotificationSettings.upsert({
      where: { tenantId: tenant.id },
      update: { enabled: true },
      create: { tenantId: tenant.id, enabled: true },
    });

    const operationDate = dateOnlyForTimezone(new Date(), timezone);
    await ensureOpenOperation(prisma, {
      tenantId: tenant.id,
      branchId: resolvedBranch.id,
      operationDate,
      openedByUserId: manager.id,
    });

    const importResult = await importLegacyLoans(prisma, {
      rows,
      tenantId: tenant.id,
      branchId: resolvedBranch.id,
      branchName: resolvedBranch.name,
      placeholderPhonePrefix: phonePrefix,
      operationDate,
    });

    const summary = await summarize(prisma, {
      tenantId: tenant.id,
      branchId: resolvedBranch.id,
      managerId: manager.id,
      operationDate,
    });

    console.log(
      JSON.stringify(
        {
          tenant: {
            id: tenant.id,
            name: tenant.name,
          },
          branch: {
            id: resolvedBranch.id,
            name: resolvedBranch.name,
          },
          manager: {
            id: manager.id,
            email: manager.email,
            displayName: manager.displayName,
          },
          importedSourceRows: rows.length,
          ...importResult,
          summary,
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
