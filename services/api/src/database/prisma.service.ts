import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { Pool, type PoolConfig } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly isLocalDatabase: boolean;
  private readonly databaseHost: string;

  constructor(configService: ConfigService) {
    const connectionString = stripEnvQuotes(
      configService.getOrThrow<string>('DATABASE_URL'),
    );
    const poolConfig = buildPoolConfig(connectionString);
    const adapter = new PrismaPg(new Pool(poolConfig));

    super({
      adapter,
      log:
        configService.get<string>('NODE_ENV') === 'development'
          ? ['warn', 'error']
          : ['error'],
    });

    this.databaseHost = poolConfig.host ?? 'unknown';
    this.isLocalDatabase = isLocalHostname(this.databaseHost);
    this.logger.log(
      `Prisma datasource host=${this.databaseHost} local=${this.isLocalDatabase}`,
    );
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async ping() {
    await this.$queryRaw`SELECT 1`;
    return true;
  }

  private async connectWithRetry(attempts = 10, delayMs = 1000) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.$connect();
        await this.ping();
        this.logger.log('PostgreSQL connection ready');
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `PostgreSQL not ready (attempt ${attempt}/${attempts}) host=${this.databaseHost}. Check DATABASE_URL and network access.`,
        );

        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    const hint = this.isLocalDatabase
      ? 'Start local Postgres with `docker compose up -d` and retry.'
      : 'Verify RDS security group, SSL settings, and DATABASE_URL credentials.';

    throw new Error(
      `Unable to connect to PostgreSQL using DATABASE_URL. ${hint} Last error: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }
}

function stripEnvQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isLocalHostname(host: string | undefined): boolean {
  if (!host) {
    return true;
  }

  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local')
  );
}

function buildPoolConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  const host = url.hostname;
  const sslmode = url.searchParams.get('sslmode');
  const sslrootcert = url.searchParams.get('sslrootcert');
  const wantsSsl =
    Boolean(sslmode && sslmode !== 'disable') || !isLocalHostname(host);

  // Prefer discrete fields so special characters / SSL query params do not
  // confuse the pg connection-string parser.
  const config: PoolConfig = {
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
    throw new Error(
      `RDS SSL root certificate not found at ${caPath}. Download global-bundle.pem to the repo root.`,
    );
  }

  config.ssl = {
    rejectUnauthorized: sslmode !== 'no-verify',
    ca: readFileSync(caPath, 'utf8'),
  };

  return config;
}

function resolveSslRootCertPath(sslrootcert: string | null): string {
  const candidates: string[] = [];

  if (sslrootcert) {
    if (isAbsolute(sslrootcert)) {
      candidates.push(sslrootcert);
    } else {
      candidates.push(
        resolve(process.cwd(), sslrootcert),
        resolve(process.cwd(), '../../', sslrootcert),
      );
    }
  }

  candidates.push(
    resolve(process.cwd(), 'global-bundle.pem'),
    resolve(process.cwd(), '../../global-bundle.pem'),
  );

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}
