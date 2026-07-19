import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// prisma.config.ts resolves env('DATABASE_URL') at load time and does not
// auto-load dotenv; prefer services/api/.env, then monorepo root .env.
const apiEnv = resolve(__dirname, '.env');
const rootEnv = resolve(__dirname, '../../.env');
if (existsSync(apiEnv)) {
  loadEnv({ path: apiEnv });
} else if (existsSync(rootEnv)) {
  loadEnv({ path: rootEnv });
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
