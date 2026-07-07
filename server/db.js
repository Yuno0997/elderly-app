import fs from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { DB_DIR, DB_PATH } from './paths.js';

async function ensureColumn(db, table, column, sqlType) {
  const columns = await db.all(`PRAGMA table_info(${table})`);
  const exists = columns.some((c) => c.name === column);
  if (!exists) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`);
  }
}

/** Older DB files may predate care_tasks; ensure table exists before ALTERs. */
async function ensureCareTasksTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS care_tasks (
      id TEXT PRIMARY KEY,
      caregiver_user_id TEXT NOT NULL,
      resident_ids TEXT NOT NULL,
      task_type TEXT NOT NULL,
      schedule_time TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      notes TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

async function seedIfEmpty(db) {
  const allowDemoSeeds = process.env.ALLOW_DEMO_SEED === 'true' || process.env.APP_ENV !== 'production';
  const userCount = await db.get('SELECT COUNT(*) AS count FROM users');
  if (userCount.count === 0 && allowDemoSeeds) {
    await db.run(
      `INSERT INTO users (id, name, email, password_hash, role, resident_id, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['u1', 'Dr. Sarah Johnson', 'admin@safealert.com', bcrypt.hashSync('admin', 10), 'admin', null, 1]
    );
  }
  if (userCount.count === 0 && !allowDemoSeeds) {
    console.warn('[seed] Skipped demo users (production mode). Create your first admin via onboarding procedure.');
  }

  // Residents/alerts/medications intentionally start empty for production-like setup.
}

export async function initDb() {
  await fs.mkdir(DB_DIR, { recursive: true });
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  // ── Performance & Reliability Pragmas ──────────────────────────────────────────
  // WAL mode allows concurrent reads during writes and is crash-safer
  await db.exec(`PRAGMA journal_mode=WAL`);
  // NORMAL sync is safe with WAL and much faster than FULL
  await db.exec(`PRAGMA synchronous=NORMAL`);
  // Enforce foreign key constraints
  await db.exec(`PRAGMA foreign_keys=ON`);
  // Wait up to 5 seconds if the DB is locked (prevents SQLITE_BUSY errors)
  await db.exec(`PRAGMA busy_timeout=5000`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      profile_photo TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      resident_id TEXT,
      resident_ids TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS residents (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      room TEXT NOT NULL,
      gender TEXT,
      status TEXT NOT NULL,
      medical_conditions TEXT,
      allergies TEXT,
      device_id TEXT,
      medications TEXT,
      contacts TEXT,
      profile_photo TEXT,
      caregiver_user_id TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      resident TEXT NOT NULL,
      room TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS medications (
      id TEXT PRIMARY KEY,
      resident TEXT NOT NULL,
      medication TEXT NOT NULL,
      time TEXT NOT NULL,
      given INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS medication_events (
      id TEXT PRIMARY KEY,
      medication_id TEXT NOT NULL,
      resident TEXT NOT NULL,
      medication TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_user_id TEXT,
      actor_name TEXT,
      event_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'online',
      assigned_resident TEXT,
      battery INTEGER NOT NULL DEFAULT 100,
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      category TEXT NOT NULL,
      action TEXT NOT NULL,
      user_id TEXT,
      user_name TEXT,
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS care_tasks (
      id TEXT PRIMARY KEY,
      caregiver_user_id TEXT NOT NULL,
      resident_ids TEXT NOT NULL,
      task_type TEXT NOT NULL,
      schedule_time TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      notes TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await ensureColumn(db, 'residents', 'archived', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'residents', 'caregiver_user_id', 'TEXT');
  await ensureColumn(db, 'residents', 'medical_conditions', 'TEXT');
  await ensureColumn(db, 'residents', 'allergies', 'TEXT');
  await ensureColumn(db, 'residents', 'device_id', 'TEXT');
  await ensureColumn(db, 'residents', 'medications', 'TEXT');
  await ensureColumn(db, 'residents', 'contacts', 'TEXT');
  await ensureColumn(db, 'residents', 'profile_photo', 'TEXT');
  await ensureColumn(db, 'residents', 'date_of_birth', 'TEXT');
  await ensureColumn(db, 'residents', 'gender', 'TEXT');
  await ensureColumn(db, 'users', 'phone', 'TEXT');
  await ensureColumn(db, 'users', 'profile_photo', 'TEXT');
  await ensureColumn(db, 'users', 'resident_id', 'TEXT');
  await ensureColumn(db, 'users', 'resident_ids', 'TEXT');
  await ensureColumn(db, 'users', 'active', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn(db, 'users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'users', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'users', 'created_at', 'TEXT');
  await ensureColumn(db, 'users', 'updated_at', 'TEXT');
  await ensureColumn(db, 'residents', 'created_at', 'TEXT');
  await ensureColumn(db, 'residents', 'updated_at', 'TEXT');
  await ensureColumn(db, 'alerts', 'created_at', 'TEXT');
  await ensureColumn(db, 'alerts', 'updated_at', 'TEXT');
  await ensureColumn(db, 'alerts', 'is_simulation', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'alerts', 'simulation_target', 'TEXT');
  await ensureColumn(db, 'alerts', 'simulation_target_user_id', 'TEXT');
  await ensureColumn(db, 'medications', 'created_at', 'TEXT');
  await ensureColumn(db, 'medications', 'updated_at', 'TEXT');
  await ensureColumn(db, 'medication_events', 'medication_id', 'TEXT');
  await ensureColumn(db, 'medication_events', 'resident', 'TEXT');
  await ensureColumn(db, 'medication_events', 'medication', 'TEXT');
  await ensureColumn(db, 'medication_events', 'action', 'TEXT');
  await ensureColumn(db, 'medication_events', 'actor_user_id', 'TEXT');
  await ensureColumn(db, 'medication_events', 'actor_name', 'TEXT');
  await ensureColumn(db, 'medication_events', 'event_at', 'TEXT');
  await ensureColumn(db, 'medication_events', 'created_at', 'TEXT');
  await ensureColumn(db, 'devices', 'status', "TEXT NOT NULL DEFAULT 'online'");
  await ensureColumn(db, 'devices', 'assigned_resident', 'TEXT');
  await ensureColumn(db, 'devices', 'battery', 'INTEGER NOT NULL DEFAULT 100');
  await ensureColumn(db, 'devices', 'last_seen', 'TEXT');
  await ensureColumn(db, 'devices', 'created_at', 'TEXT');
  await ensureColumn(db, 'devices', 'updated_at', 'TEXT');
  await ensureColumn(db, 'audit_logs', 'timestamp', 'TEXT');
  await ensureColumn(db, 'audit_logs', 'category', 'TEXT');
  await ensureColumn(db, 'audit_logs', 'action', 'TEXT');
  await ensureColumn(db, 'audit_logs', 'user_id', 'TEXT');
  await ensureColumn(db, 'audit_logs', 'user_name', 'TEXT');
  await ensureColumn(db, 'audit_logs', 'details', 'TEXT');
  await ensureCareTasksTable(db);
  await ensureColumn(db, 'care_tasks', 'caregiver_user_id', 'TEXT');
  await ensureColumn(db, 'care_tasks', 'resident_ids', 'TEXT');
  await ensureColumn(db, 'care_tasks', 'task_type', 'TEXT');
  await ensureColumn(db, 'care_tasks', 'schedule_time', 'TEXT');
  await ensureColumn(db, 'care_tasks', 'priority', "TEXT NOT NULL DEFAULT 'medium'");
  await ensureColumn(db, 'care_tasks', 'notes', 'TEXT');
  await ensureColumn(db, 'care_tasks', 'created_at', 'TEXT');
  await ensureColumn(db, 'care_tasks', 'updated_at', 'TEXT');
  await ensureColumn(db, 'care_tasks', 'completed', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'care_tasks', 'completed_at', 'TEXT');

  await db.exec(`
    UPDATE users SET created_at = datetime('now') WHERE created_at IS NULL;
    UPDATE users SET updated_at = datetime('now') WHERE updated_at IS NULL;
    UPDATE residents SET created_at = datetime('now') WHERE created_at IS NULL;
    UPDATE residents SET updated_at = datetime('now') WHERE updated_at IS NULL;
    UPDATE alerts SET created_at = datetime('now') WHERE created_at IS NULL;
    UPDATE alerts SET updated_at = datetime('now') WHERE updated_at IS NULL;
    UPDATE medications SET created_at = datetime('now') WHERE created_at IS NULL;
    UPDATE medications SET updated_at = datetime('now') WHERE updated_at IS NULL;
    UPDATE medication_events SET event_at = datetime('now') WHERE event_at IS NULL;
    UPDATE medication_events SET created_at = datetime('now') WHERE created_at IS NULL;
    UPDATE devices SET last_seen = datetime('now') WHERE last_seen IS NULL;
    UPDATE devices SET created_at = datetime('now') WHERE created_at IS NULL;
    UPDATE devices SET updated_at = datetime('now') WHERE updated_at IS NULL;
    UPDATE audit_logs SET timestamp = datetime('now') WHERE timestamp IS NULL;
    UPDATE care_tasks SET created_at = datetime('now') WHERE created_at IS NULL;
    UPDATE care_tasks SET updated_at = datetime('now') WHERE updated_at IS NULL;
  `);

  await db.run(
    `INSERT OR IGNORE INTO app_settings (key, value, updated_at)
     VALUES ('facility_name', 'Sunrise Senior Care', datetime('now'))`
  );
  await db.run(
    `INSERT OR IGNORE INTO app_settings (key, value, updated_at)
     VALUES ('facility_id', 'SCF-2024', datetime('now'))`
  );

  await seedIfEmpty(db);

  // ── Performance Indexes ────────────────────────────────────────────────────────────
  // Created after all schema migrations so they always cover current columns.
  // CREATE INDEX IF NOT EXISTS is idempotent — safe to run on every boot.
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alerts_status       ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_resident     ON alerts(resident);
    CREATE INDEX IF NOT EXISTS idx_alerts_timestamp    ON alerts(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_created_at   ON alerts(created_at);
    CREATE INDEX IF NOT EXISTS idx_meds_resident       ON medications(resident);
    CREATE INDEX IF NOT EXISTS idx_meds_given          ON medications(given);
    CREATE INDEX IF NOT EXISTS idx_tasks_caregiver     ON care_tasks(caregiver_user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_completed     ON care_tasks(completed);
    CREATE INDEX IF NOT EXISTS idx_med_events_med_id   ON medication_events(medication_id);
    CREATE INDEX IF NOT EXISTS idx_med_events_event_at ON medication_events(event_at DESC);
    CREATE INDEX IF NOT EXISTS idx_residents_archived  ON residents(archived);
    CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role          ON users(role, active);
  `);

  return db;
}
