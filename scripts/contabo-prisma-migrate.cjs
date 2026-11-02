const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const targets = {
  staging: { database: 'rembeh_stagecopy', role: 'rembeh_stage_migrator' },
  production: { database: 'rembeh_prod', role: 'rembeh_migrator' },
};
const target = targets[process.argv[2]];
const action = process.argv[3];
if (!target || !['status', 'deploy'].includes(action) || process.argv.length !== 4) {
  console.error('Usage: node contabo-prisma-migrate.cjs staging|production status|deploy');
  process.exit(2);
}
try {
  const url = new URL(process.env.DATABASE_URL || '');
  if (url.hostname !== 'antikra-postgres' || decodeURIComponent(url.pathname.slice(1)) !== target.database) {
    throw new Error('Database target does not match the selected environment.');
  }
  const password = fs.readFileSync('/run/secrets/rembeh-migrator-password', 'utf8').trimEnd();
  if (!password) throw new Error('Migration password is missing.');
  url.username = target.role;
  url.password = password;
  const env = { ...process.env, DATABASE_URL: url.toString() };
  const result = spawnSync('../../node_modules/.bin/prisma', ['migrate', action], { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Migration failed.');
  process.exit(1);
}
