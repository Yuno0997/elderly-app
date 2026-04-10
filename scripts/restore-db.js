import fs from 'node:fs/promises';
import path from 'node:path';
import { DB_PATH, BACKUP_DIR } from '../server/paths.js';

async function main() {
  const sourceArg = process.argv[2];
  if (!sourceArg) {
    throw new Error('Usage: npm run db:restore -- "<backup-file-path-or-name>"');
  }
  const sourcePath = path.isAbsolute(sourceArg) ? sourceArg : path.join(BACKUP_DIR, sourceArg);
  await fs.access(sourcePath);
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.copyFile(sourcePath, DB_PATH);
  console.log(`Database restored from: ${sourcePath}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
