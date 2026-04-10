import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { DB_PATH } from '../server/paths.js';

async function main() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  const result = await db.run(
    "UPDATE users SET token_version = token_version + 1, updated_at = datetime('now')"
  );
  const changed = result?.changes ?? 0;
  console.log(`All sessions invalidated. Users updated: ${changed}`);
  await db.close();
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

