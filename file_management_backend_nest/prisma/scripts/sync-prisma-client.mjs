import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const src = join(root, 'node_modules/.prisma/client');
const pnpmRoot = join(root, 'node_modules/.pnpm');

function listPnpmPrismaClientDirs() {
  if (!existsSync(pnpmRoot)) return [];
  return readdirSync(pnpmRoot)
    .filter((name) => name.startsWith('@prisma+client@'))
    .map((name) => join(pnpmRoot, name, 'node_modules/.prisma/client'))
    .filter((dir) => existsSync(dir));
}

function syncGeneratedClient(dst) {
  for (const name of readdirSync(src)) {
    if (name.endsWith('.node')) continue;
    const from = join(src, name);
    const to = join(dst, name);
    cpSync(from, to, {
      recursive: statSync(from).isDirectory(),
      force: true,
    });
  }
}

if (!existsSync(src)) {
  process.exit(0);
}

for (const dst of listPnpmPrismaClientDirs()) {
  syncGeneratedClient(dst);
  console.log(`[sync-prisma-client] synced types to ${dst}`);
}
