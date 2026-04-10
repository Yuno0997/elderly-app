import fs from 'node:fs/promises';
import path from 'node:path';
import { DB_PATH, BACKUP_DIR } from '../server/paths.js';

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function main() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    throw new Error(`Database file not found: ${DB_PATH}`);
  }
  const target = path.join(BACKUP_DIR, `elderly-app-${timestamp()}.sqlite`);
  await fs.copyFile(DB_PATH, target);
  console.log(`Backup created: ${target}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
