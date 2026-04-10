import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DB_DIR = path.join(__dirname, 'data');
export const DB_PATH = path.join(DB_DIR, 'elderly-app.sqlite');
export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DB_DIR, 'backups');
