import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { initDb } from './db.js';
import { BACKUP_DIR, DB_DIR } from './paths.js';
import { sendUnismsSms, hasUnismsCredentials } from './unisms.js';

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const FIRST_ADMIN_BOOTSTRAP_KEY = process.env.FIRST_ADMIN_BOOTSTRAP_KEY || '';
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;
const TEMP_PASSWORD_MIN_LENGTH = 4;
const IS_PRODUCTION = process.env.APP_ENV === 'production';

if (IS_PRODUCTION && JWT_SECRET === 'dev-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production.');
}
if (IS_PRODUCTION && !FIRST_ADMIN_BOOTSTRAP_KEY) {
  throw new Error('FIRST_ADMIN_BOOTSTRAP_KEY must be set in production.');
}

app.use(cors());
app.use(express.json({ limit: '5mb' }));
const db = await initDb();
await fs.mkdir(DB_DIR, { recursive: true });
await fs.mkdir(BACKUP_DIR, { recursive: true });
try {
  const probe = `${BACKUP_DIR}/.write-test`;
  await fs.writeFile(probe, 'ok');
  await fs.unlink(probe);
} catch {
  throw new Error(`Backup directory is not writable: ${BACKUP_DIR}`);
}
let residentSeq = 1000;

const residentCreateSchema = z.object({
  name: z.string().trim().min(2),
  room: z.string().trim().min(2),
  dateOfBirth: z.string().trim().max(30).nullable().optional(),
  gender: z.enum(['female', 'male', 'other']).nullable().optional(),
  status: z.enum(['stable', 'needs_attention', 'offline']).default('stable'),
  medicalConditions: z.array(z.string().trim().min(1)).max(50).optional(),
  allergies: z.string().trim().max(500).nullable().optional(),
  deviceId: z.string().trim().max(100).nullable().optional(),
  medications: z.array(z.string().trim().min(1)).max(100).optional(),
  contacts: z
    .object({
      primaryName: z.string().trim().max(120).nullable().optional(),
      primaryRelationship: z.string().trim().max(120).nullable().optional(),
      primaryPhone: z.string().trim().max(30).nullable().optional(),
      secondaryName: z.string().trim().max(120).nullable().optional(),
      secondaryRelationship: z.string().trim().max(120).nullable().optional(),
      secondaryPhone: z.string().trim().max(30).nullable().optional(),
      tertiaryName: z.string().trim().max(120).nullable().optional(),
      tertiaryRelationship: z.string().trim().max(120).nullable().optional(),
      tertiaryPhone: z.string().trim().max(30).nullable().optional(),
    })
    .nullable()
    .optional(),
  caregiverUserId: z.string().trim().nullable().optional(),
  profilePhoto: z
    .string()
    .trim()
    .max(2_000_000, 'Profile photo payload too large')
    .regex(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, 'Profile photo must be a data URL')
    .nullable()
    .optional(),
});

const residentUpdateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  room: z.string().trim().min(2).optional(),
  dateOfBirth: z.string().trim().max(30).nullable().optional(),
  gender: z.enum(['female', 'male', 'other']).nullable().optional(),
  status: z.enum(['stable', 'needs_attention', 'offline']).optional(),
  medicalConditions: z.array(z.string().trim().min(1)).max(50).optional(),
  allergies: z.string().trim().max(500).nullable().optional(),
  deviceId: z.string().trim().max(100).nullable().optional(),
  medications: z.array(z.string().trim().min(1)).max(100).optional(),
  contacts: z
    .object({
      primaryName: z.string().trim().max(120).nullable().optional(),
      primaryRelationship: z.string().trim().max(120).nullable().optional(),
      primaryPhone: z.string().trim().max(30).nullable().optional(),
      secondaryName: z.string().trim().max(120).nullable().optional(),
      secondaryRelationship: z.string().trim().max(120).nullable().optional(),
      secondaryPhone: z.string().trim().max(30).nullable().optional(),
      tertiaryName: z.string().trim().max(120).nullable().optional(),
      tertiaryRelationship: z.string().trim().max(120).nullable().optional(),
      tertiaryPhone: z.string().trim().max(30).nullable().optional(),
    })
    .nullable()
    .optional(),
  caregiverUserId: z.string().trim().nullable().optional(),
  profilePhoto: z
    .string()
    .trim()
    .max(2_000_000, 'Profile photo payload too large')
    .regex(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, 'Profile photo must be a data URL')
    .nullable()
    .optional(),
  archived: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, {
  message: 'At least one field is required',
});

const alertStatusSchema = z.object({
  status: z.enum(['unacknowledged', 'acknowledged', 'resolved']),
});

const medicationPatchSchema = z.object({
  given: z.boolean(),
});
const medicationCreateSchema = z.object({
  residentId: z.coerce.number().int().positive().optional(),
  resident: z.string().trim().min(2).optional(),
  medication: z.string().trim().min(2),
  time: z.string().trim().min(1),
}).refine((v) => Number.isFinite(v.residentId) || Boolean(v.resident), {
  message: 'Resident is required',
});
const careTaskCreateSchema = z.object({
  caregiverUserId: z.string().trim().min(1),
  residentIds: z.array(z.coerce.number().int().positive()).min(1),
  taskType: z.string().trim().min(2),
  scheduleTime: z.string().trim().min(1),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  notes: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null || String(v).trim() === '' ? undefined : String(v).trim())),
});
const careTaskPatchSchema = z.object({
  completed: z.boolean(),
});
const deviceCreateSchema = z.object({
  deviceId: z.string().trim().min(3),
  status: z.enum(['online', 'offline', 'maintenance']).default('online'),
  battery: z.number().int().min(0).max(100).default(100),
});
const deviceUpdateSchema = z.object({
  status: z.enum(['online', 'offline', 'maintenance']).optional(),
  battery: z.number().int().min(0).max(100).optional(),
  assignedResident: z.string().trim().nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const authLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  profilePhoto: z
    .string()
    .trim()
    .max(2_000_000, 'Profile photo payload too large')
    .regex(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, 'Profile photo must be a data URL')
    .nullable()
    .optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
const userCreateSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(TEMP_PASSWORD_MIN_LENGTH, `Temporary password must be at least ${TEMP_PASSWORD_MIN_LENGTH} characters`),
  role: z.enum(['admin', 'caregiver', 'relative']),
  residentId: z.string().trim().optional(),
  residentIds: z.array(z.string().trim()).optional(),
});
const userUpdateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  role: z.enum(['admin', 'caregiver', 'relative']).optional(),
  active: z.boolean().optional(),
  residentId: z.string().trim().nullable().optional(),
  residentIds: z.array(z.string().trim()).nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().regex(PASSWORD_REGEX, 'Password must be 6+ chars and include letters and numbers'),
});
const resetPasswordSchema = z.object({
  newPassword: z.string().min(TEMP_PASSWORD_MIN_LENGTH, `Temporary password must be at least ${TEMP_PASSWORD_MIN_LENGTH} characters`),
});
const bootstrapAdminSchema = z.object({
  key: z.string().min(1),
  name: z.string().trim().min(2),
  email: z.string().email(),
  password: z.string().regex(PASSWORD_REGEX, 'Password must be 6+ chars and include letters and numbers'),
});
const adminSmsTestSchema = z.object({
  scenario: z.enum(['fall', 'sleep', 'pulse']),
  recipient: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, 'Use E.164 format, e.g. +639123456789'),
});

const adminAlertSimulationSchema = z.object({
  scenario: z.enum(['fall', 'sleep', 'pulse']),
  target: z.enum(['admin', 'caregiver', 'all']),
  caregiverUserId: z.string().trim().optional(),
  caregiverUserIds: z.array(z.string().trim().min(1)).optional(),
  adminUserIds: z.array(z.string().trim().min(1)).optional(),
});
const facilitySettingsUpdateSchema = z.object({
  facilityName: z.string().trim().min(2).max(120).optional(),
  facilityId: z.string().trim().min(2).max(60).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

function validationError(res, parsed) {
  const details = parsed.error.issues.map((i) => i.message);
  return res.status(400).json({
    error: 'Validation failed',
    details,
    detail: details[0] ?? 'Invalid request',
  });
}

function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      residentId: user.resident_id ?? undefined,
      tokenVersion: user.token_version ?? 0,
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

async function logAudit({ category, action, req, details }) {
  try {
    await db.run(
      `INSERT INTO audit_logs (id, timestamp, category, action, user_id, user_name, details)
       VALUES (?, datetime('now'), ?, ?, ?, ?, ?)`,
      [
        `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        category,
        action,
        req?.user?.sub ?? null,
        req?.user?.name ?? null,
        details ?? null,
      ]
    );
  } catch {
    // Audit logging must not block primary request flow.
  }
}

async function logMedicationEvent({ medicationId, resident, medication, action, req, actorUserId, actorName }) {
  try {
    await db.run(
      `INSERT INTO medication_events (id, medication_id, resident, medication, action, actor_user_id, actor_name, event_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        `medevt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        medicationId,
        resident,
        medication,
        action,
        actorUserId ?? req?.user?.sub ?? null,
        actorName ?? req?.user?.name ?? null,
      ]
    );
  } catch {
    // Event logging must not block primary request flow.
  }
}

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await db.get('SELECT id, active, token_version FROM users WHERE id = ?', [payload.sub]);
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if ((payload.tokenVersion ?? 0) !== (user.token_version ?? 0)) {
      return res.status(401).json({ error: 'Session expired' });
    }
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

function toDbResidentId(publicId) {
  if (publicId === undefined || publicId === null) return null;
  const s = String(publicId).trim();
  // Accept UI ids like "RES-2003" (public) or numeric DB ids.
  const pub = /^RES-(\d+)$/i.exec(s);
  if (pub) {
    const n = Number(pub[1]);
    if (Number.isFinite(n) && n >= 1000) return n - 1000;
    return null;
  }
  const raw = /^(\d+)$/.exec(s);
  if (raw) return Number(raw[1]);
  return null;
}

async function getFamilyLinkedResidents(req) {
  const row = await db.get('SELECT resident_id, resident_ids FROM users WHERE id = ?', [req.user.sub]);
  let residentIds = [];
  try {
    residentIds = JSON.parse(row?.resident_ids || '[]');
  } catch {
    residentIds = [];
  }
  if (!residentIds.length && row?.resident_id) residentIds = [row.resident_id];
  const dbIds = residentIds.map(toDbResidentId).filter((n) => Number.isFinite(n) && n !== null);
  return [...new Set(dbIds)];
}

async function validateCaregiverUserId(caregiverUserId) {
  if (caregiverUserId === undefined) return { ok: true, value: undefined };
  if (caregiverUserId === null || caregiverUserId === '') return { ok: true, value: null };
  const caregiver = await db.get(
    "SELECT id FROM users WHERE id = ? AND role = 'caregiver' AND active = 1",
    [caregiverUserId]
  );
  if (!caregiver) return { ok: false };
  return { ok: true, value: caregiverUserId };
}

async function mapCareTaskRowsToPayload(rows) {
  const residentRows = await db.all('SELECT id, name, room FROM residents');
  const residentMap = new Map(residentRows.map((r) => [r.id, { id: r.id, name: r.name, room: r.room }]));
  return rows.map((r) => {
    let residentIds = [];
    try {
      residentIds = JSON.parse(r.resident_ids || '[]');
    } catch {
      residentIds = [];
    }
    const residents = residentIds
      .map((id) => residentMap.get(id))
      .filter(Boolean);
    return {
      id: r.id,
      caregiverUserId: r.caregiver_user_id,
      caregiverName: r.caregiver_name,
      residentIds,
      residents,
      taskType: r.task_type,
      scheduleTime: r.schedule_time,
      priority: r.priority,
      notes: r.notes,
      completed: Boolean(r.completed),
      completedAt: r.completed_at ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

app.post('/api/auth/login', async (req, res) => {
  const parsed = authLoginSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { email, password } = parsed.data;
  try {
    const user = await db.get(
      'SELECT id, name, email, password_hash, role, resident_id, resident_ids, active, must_change_password, token_version FROM users WHERE email = ?',
      [email.toLowerCase()]
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.active) return res.status(403).json({ error: 'Account disabled' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = createToken(user);
    let residentIds = [];
    try {
      residentIds = JSON.parse(user.resident_ids || '[]');
    } catch {
      residentIds = [];
    }
    if (!residentIds.length && user.resident_id) residentIds = [user.resident_id];
    const primaryResidentId = user.resident_id ?? (residentIds[0] ?? undefined);
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        residentId: primaryResidentId,
        residentIds,
        mustChangePassword: Boolean(user.must_change_password),
      },
    });
  } catch {
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/bootstrap-admin', async (req, res) => {
  const parsed = bootstrapAdminSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  if (!FIRST_ADMIN_BOOTSTRAP_KEY || parsed.data.key !== FIRST_ADMIN_BOOTSTRAP_KEY) {
    return res.status(403).json({ error: 'Invalid bootstrap key' });
  }
  try {
    const adminCount = await db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
    if ((adminCount?.count ?? 0) > 0) {
      return res.status(409).json({ error: 'Bootstrap already completed' });
    }
    const id = `u${Date.now()}`;
    const hash = await bcrypt.hash(parsed.data.password, 10);
    await db.run(
      `INSERT INTO users (id, name, email, password_hash, role, resident_id, active, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'admin', NULL, 1, 0, datetime('now'), datetime('now'))`,
      [id, parsed.data.name, parsed.data.email.toLowerCase(), hash]
    );
    await logAudit({
      category: 'user',
      action: 'Bootstrap admin created',
      req: null,
      details: `Bootstrap admin created for ${parsed.data.email.toLowerCase()}`,
    });
    return res.status(201).json({ success: true, id });
  } catch {
    return res.status(500).json({ error: 'Failed to bootstrap admin' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, name, email, phone, profile_photo, role, resident_id, resident_ids, must_change_password FROM users WHERE id = ?',
      [req.user.sub]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    let residentIds = [];
    try {
      residentIds = JSON.parse(user.resident_ids || '[]');
    } catch {
      residentIds = [];
    }
    if (!residentIds.length && user.resident_id) residentIds = [user.resident_id];
    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      profilePhoto: user.profile_photo ?? null,
      role: user.role,
      residentId: user.resident_id ?? undefined,
      residentIds,
      mustChangePassword: Boolean(user.must_change_password),
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.patch('/api/auth/profile', requireAuth, async (req, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const fields = [];
  const values = [];
  if (parsed.data.name !== undefined) {
    fields.push('name = ?');
    values.push(parsed.data.name);
  }
  if (parsed.data.phone !== undefined) {
    fields.push('phone = ?');
    values.push(parsed.data.phone);
  }
  if (parsed.data.profilePhoto !== undefined) {
    fields.push('profile_photo = ?');
    values.push(parsed.data.profilePhoto);
  }
  fields.push("updated_at = datetime('now')");
  try {
    const result = await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...values, req.user.sub]);
    if (!result.changes) return res.status(404).json({ error: 'User not found' });
    const user = await db.get(
      'SELECT id, name, email, phone, profile_photo, role, resident_id, must_change_password FROM users WHERE id = ?',
      [req.user.sub]
    );
    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      profilePhoto: user.profile_photo ?? null,
      role: user.role,
      residentId: user.resident_id ?? undefined,
      mustChangePassword: Boolean(user.must_change_password),
    });
  } catch {
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.get('/api/auth/session', requireAuth, async (req, res) => {
  return res.json({
    userId: req.user.sub,
    issuedAt: req.user.iat ? new Date(req.user.iat * 1000).toISOString() : null,
    expiresAt: req.user.exp ? new Date(req.user.exp * 1000).toISOString() : null,
    tokenVersion: req.user.tokenVersion ?? 0,
  });
});

app.post('/api/auth/logout-all-sessions', requireAuth, async (req, res) => {
  try {
    await db.run(
      "UPDATE users SET token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?",
      [req.user.sub]
    );
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  try {
    const user = await db.get('SELECT id, password_hash FROM users WHERE id = ?', [req.user.sub]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(parsed.data.currentPassword, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(parsed.data.newPassword, 10);
    await db.run(
      "UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?",
      [hash, req.user.sub]
    );
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

app.get('/api/users', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const users = await db.all(
      'SELECT id, name, email, phone, profile_photo, role, resident_id, resident_ids, active, created_at, updated_at FROM users ORDER BY name'
    );
    return res.json(users.map((u) => {
      let residentIds = [];
      try {
        residentIds = JSON.parse(u.resident_ids || '[]');
      } catch {
        residentIds = [];
      }
      // Back-compat: if old single link exists but array is empty, expose it.
      if (!residentIds.length && u.resident_id) residentIds = [u.resident_id];
      return {
        ...u,
        active: Boolean(u.active),
        residentId: u.resident_id ?? undefined,
        residentIds,
      };
    }));
  } catch {
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/audit-logs', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const rows = await db.all(
      'SELECT id, timestamp, category, action, user_id, user_name, details FROM audit_logs ORDER BY timestamp DESC LIMIT 500'
    );
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

app.delete('/api/admin/logs/clear-all', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const before = {
      auditLogs: (await db.get('SELECT COUNT(*) AS count FROM audit_logs'))?.count ?? 0,
      incidentLogs: (await db.get('SELECT COUNT(*) AS count FROM alerts'))?.count ?? 0,
      medicationEvents: (await db.get('SELECT COUNT(*) AS count FROM medication_events'))?.count ?? 0,
      completedTasks: (await db.get('SELECT COUNT(*) AS count FROM care_tasks WHERE completed = 1'))?.count ?? 0,
      givenMedications: (await db.get('SELECT COUNT(*) AS count FROM medications WHERE given = 1'))?.count ?? 0,
    };

    await db.run('DELETE FROM alerts');
    await db.run('DELETE FROM medication_events');
    await db.run('DELETE FROM care_tasks WHERE completed = 1');
    await db.run('DELETE FROM medications WHERE given = 1');
    await db.run('DELETE FROM audit_logs');

    const cleared = {
      auditLogs: before.auditLogs,
      incidentLogs: before.incidentLogs,
      medicationEvents: before.medicationEvents,
      completedTasks: before.completedTasks,
      givenMedications: before.givenMedications,
    };
    const totalCleared = Object.values(cleared).reduce((sum, n) => sum + Number(n || 0), 0);

    // Do not write another audit log entry after clearing, because audit logs are intentionally wiped.
    return res.json({ ok: true, cleared, totalCleared });
  } catch {
    return res.status(500).json({ error: 'Failed to clear all logs' });
  }
});

function unismsStatusHandler(_req, res) {
  return res.json({ configured: hasUnismsCredentials() });
}
app.get('/api/admin/unisms-status', requireAuth, requireRole('admin'), unismsStatusHandler);
app.get('/api/sms/unisms-status', requireAuth, requireRole('admin'), unismsStatusHandler);

async function handleAdminTestSms(req, res) {
  const parsed = adminSmsTestSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { scenario, recipient } = parsed.data;
  if (!hasUnismsCredentials()) {
    return res.status(503).json({
      error: 'SMS not configured',
      detail: 'Set UNISMS_API_SECRET (or UNISMS_SECRET) in .env (project root) or your environment and restart the backend.',
    });
  }
  const contentByScenario = {
    fall: 'SafeAlert: FALL - Demo Resident, rm 101. Open app or check floor.',
    sleep: 'SafeAlert: SLEEP ALERT - Demo Resident, rm 101. Review monitoring.',
    pulse: 'SafeAlert: PULSE ALERT - Demo Resident, rm 101. Check vitals.',
  };
  const content = contentByScenario[scenario].slice(0, 160);
  const result = await sendUnismsSms({
    recipient,
    content,
    metadata: { scenario, source: 'admin_test', ts: new Date().toISOString() },
  });
  if (!result.ok) {
    return res.status(502).json({
      error: 'UniSMS request failed',
      detail: result.error,
      status: result.status,
    });
  }
  const ref =
    result.body && typeof result.body === 'object' && result.body.message && typeof result.body.message === 'object'
      ? result.body.message.reference_id
      : undefined;
  await logAudit({
    category: 'sms',
    action: 'Admin SMS test',
    req,
    details: `Test scenario=${scenario} recipient=${recipient.slice(0, 6)}… ref=${ref ?? 'n/a'}`,
  });
  return res.status(201).json({
    ok: true,
    scenario,
    referenceId: ref ?? null,
    message: 'Test SMS queued.',
  });
}

app.post('/api/admin/test-sms', requireAuth, requireRole('admin'), handleAdminTestSms);
/** Alias — same handler (some setups had stale servers; both paths work once restarted). */
app.post('/api/sms/test-alert', requireAuth, requireRole('admin'), handleAdminTestSms);

app.post('/api/admin/alert-simulation', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = adminAlertSimulationSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);

  const { scenario, target, caregiverUserId, caregiverUserIds, adminUserIds } = parsed.data;

  const scenarioMeta = {
    fall: { type: 'Fall Detected', severity: 'critical' },
    sleep: { type: 'Sleep Anomaly', severity: 'warning' },
    pulse: { type: 'Unusual Pulse', severity: 'critical' },
  }[scenario];

  const makeAlert = async ({ resident, room, simulationTarget, simulationTargetUserId }) => {
    const id = `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await db.run(
      `INSERT INTO alerts (id, type, severity, resident, room, timestamp, status, is_simulation, simulation_target, simulation_target_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'unacknowledged', 1, ?, ?, datetime('now'), datetime('now'))`,
      [
        id,
        scenarioMeta.type,
        scenarioMeta.severity,
        resident,
        room,
        new Date().toISOString(),
        simulationTarget,
        simulationTargetUserId ?? null,
      ]
    );
    return id;
  };

  const pickResidentForCaregiver = async (cid) => {
    return await db.get(
      `SELECT id, name, room FROM residents WHERE archived = 0 AND caregiver_user_id = ? ORDER BY id LIMIT 1`,
      [cid]
    );
  };

  const pickAnyResident = async () => {
    return await db.get(`SELECT id, name, room FROM residents WHERE archived = 0 ORDER BY id LIMIT 1`);
  };

  try {
    let created = 0;
    let skipped = 0;

    if (target === 'admin') {
      const r = await pickAnyResident();
      if (!r) {
        return res.status(409).json({
          error: 'No residents available',
          detail: 'Create at least one resident before simulating alerts.',
        });
      }
      const targetsRaw = Array.isArray(adminUserIds) && adminUserIds.length > 0
        ? adminUserIds
        : [String(req.user.sub || '')];
      const targets = [...new Set(targetsRaw.map((id) => String(id || '').trim()).filter(Boolean))];
      if (targets.length === 0) {
        return res.status(400).json({ error: 'Select at least one admin' });
      }
      for (const targetAdminId of targets) {
        const dup = await db.get(
          `SELECT id FROM alerts
           WHERE is_simulation = 1 AND simulation_target = 'admin' AND simulation_target_user_id = ?
             AND type = ?
             AND created_at >= datetime('now', '-5 seconds')
           ORDER BY created_at DESC LIMIT 1`,
          [targetAdminId, scenarioMeta.type]
        );
        if (dup) continue;
        await db.run(
          `DELETE FROM alerts
           WHERE is_simulation = 1 AND simulation_target = 'admin' AND simulation_target_user_id = ?`,
          [targetAdminId]
        );
        await makeAlert({ resident: r.name, room: r.room, simulationTarget: 'admin', simulationTargetUserId: targetAdminId });
        created += 1;
      }
      await logAudit({
        category: 'incident',
        action: 'Alert simulation',
        req,
        details: `scenario=${scenario} target=admin recipients=${targets.length} resident=${r.name} room=${r.room}`,
      });
      return res.status(201).json({ created, skipped: 0 });
    }

    if (target === 'caregiver') {
      const targetsRaw = Array.isArray(caregiverUserIds) && caregiverUserIds.length > 0
        ? caregiverUserIds
        : (caregiverUserId ? [caregiverUserId] : []);
      const targets = [...new Set(targetsRaw.map((id) => String(id || '').trim()).filter(Boolean))];
      if (targets.length === 0) {
        return res.status(400).json({ error: 'Select at least one caregiver' });
      }
      for (const targetCaregiverId of targets) {
        const r = await pickResidentForCaregiver(targetCaregiverId);
        if (!r) {
          skipped += 1;
          continue;
        }
        const dup = await db.get(
          `SELECT id FROM alerts
           WHERE is_simulation = 1 AND simulation_target = 'caregiver' AND simulation_target_user_id = ?
             AND type = ?
             AND created_at >= datetime('now', '-5 seconds')
           ORDER BY created_at DESC LIMIT 1`,
          [targetCaregiverId, scenarioMeta.type]
        );
        if (dup) continue;
        await db.run(
          `DELETE FROM alerts
           WHERE is_simulation = 1 AND simulation_target = 'caregiver' AND simulation_target_user_id = ?`,
          [targetCaregiverId]
        );
        await makeAlert({ resident: r.name, room: r.room, simulationTarget: 'caregiver', simulationTargetUserId: targetCaregiverId });
        created += 1;
      }
      await logAudit({
        category: 'incident',
        action: 'Alert simulation',
        req,
        details: `scenario=${scenario} target=caregiver selected=${targets.length} created=${created} skipped=${skipped}`,
      });
      return res.status(201).json({ created, skipped });
    }

    // target === 'all' (admins + caregivers)
    const caregiverRows = await db.all("SELECT id FROM users WHERE role = 'caregiver' AND active = 1");
    const adminRows = await db.all("SELECT id FROM users WHERE role = 'admin' AND active = 1");
    if (!caregiverRows.length && !adminRows.length) {
      return res.status(409).json({
        error: 'No active recipients',
        detail: 'Create/activate at least one caregiver or admin to simulate alerts for all.',
      });
    }

    // Clear previous simulation entries for a clean "all" send.
    await db.run(`DELETE FROM alerts WHERE is_simulation = 1 AND simulation_target IN ('all', 'caregiver', 'admin')`);

    for (const c of caregiverRows) {
      const r = await pickResidentForCaregiver(String(c.id));
      if (!r) {
        skipped += 1;
        continue;
      }
      await makeAlert({ resident: r.name, room: r.room, simulationTarget: 'caregiver', simulationTargetUserId: String(c.id) });
      created += 1;
    }
    const anyResident = await pickAnyResident();
    if (!anyResident && adminRows.length > 0) {
      skipped += adminRows.length;
    } else if (anyResident) {
      for (const a of adminRows) {
        await makeAlert({
          resident: anyResident.name,
          room: anyResident.room,
          simulationTarget: 'admin',
          simulationTargetUserId: String(a.id),
        });
        created += 1;
      }
    }
    await logAudit({
      category: 'incident',
      action: 'Alert simulation',
      req,
      details: `scenario=${scenario} target=all recipients=admins+caregivers created=${created} skipped=${skipped}`,
    });
    return res.status(201).json({ created, skipped });
  } catch (err) {
    console.error('[alert-simulation] POST', err);
    return res.status(500).json({
      error: 'Failed to simulate alerts',
      detail: IS_PRODUCTION ? undefined : String(err?.message || err),
    });
  }
});

app.post('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { name, email, phone, password, role, residentId, residentIds } = parsed.data;
  try {
    const exists = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (exists) return res.status(409).json({ error: 'Email already exists' });
    const id = `u${Date.now()}`;
    const hash = await bcrypt.hash(password, 10);
    let finalResidentIds = Array.isArray(residentIds) ? residentIds.filter(Boolean) : [];
    if (residentId && !finalResidentIds.includes(residentId)) finalResidentIds = [residentId, ...finalResidentIds];
    finalResidentIds = [...new Set(finalResidentIds.map((s) => String(s).trim()).filter(Boolean))];
    const residentIdsJson = finalResidentIds.length ? JSON.stringify(finalResidentIds) : null;
    await db.run(
      `INSERT INTO users (id, name, email, phone, password_hash, role, resident_id, resident_ids, active, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))`,
      [id, name, email.toLowerCase(), phone || null, hash, role, residentId ?? null, residentIdsJson]
    );
    const user = await db.get(
      'SELECT id, name, email, phone, profile_photo, role, resident_id, resident_ids, active, created_at, updated_at FROM users WHERE id = ?',
      [id]
    );
    await logAudit({
      category: 'user',
      action: 'User created',
      req,
      details: `Created user ${user.name} (${user.email}) role=${user.role}`,
    });
    let outResidentIds = [];
    try {
      outResidentIds = JSON.parse(user.resident_ids || '[]');
    } catch {
      outResidentIds = [];
    }
    if (!outResidentIds.length && user.resident_id) outResidentIds = [user.resident_id];
    return res.status(201).json({
      ...user,
      active: Boolean(user.active),
      residentId: user.resident_id ?? undefined,
      residentIds: outResidentIds,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

app.patch('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { id } = req.params;
  const existing = await db.get('SELECT id, role, active FROM users WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const nextRole = parsed.data.role ?? existing.role;
  const nextActive = parsed.data.active ?? Boolean(existing.active);
  const adminActiveRow = await db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1");
  const activeAdminCount = adminActiveRow?.count ?? 0;
  const wasActiveAdmin = existing.role === 'admin' && Boolean(existing.active);
  const willBeActiveAdmin = nextRole === 'admin' && Boolean(nextActive);
  const projectedActiveAdminCount =
    activeAdminCount + (wasActiveAdmin ? -1 : 0) + (willBeActiveAdmin ? 1 : 0);

  if (projectedActiveAdminCount < 1) {
    return res.status(409).json({
      error: 'Cannot remove last active admin',
      detail: 'At least one administrator account must remain active.',
    });
  }
  const fields = [];
  const values = [];
  if (parsed.data.name !== undefined) {
    fields.push('name = ?');
    values.push(parsed.data.name);
  }
  if (parsed.data.phone !== undefined) {
    fields.push('phone = ?');
    values.push(parsed.data.phone);
  }
  if (parsed.data.role !== undefined) {
    fields.push('role = ?');
    values.push(parsed.data.role);
  }
  if (parsed.data.active !== undefined) {
    fields.push('active = ?');
    values.push(parsed.data.active ? 1 : 0);
  }
  if (parsed.data.residentId !== undefined) {
    fields.push('resident_id = ?');
    values.push(parsed.data.residentId);
  }
  if (parsed.data.residentIds !== undefined) {
    const incoming = parsed.data.residentIds;
    if (incoming === null) {
      fields.push('resident_ids = ?');
      values.push(null);
    } else {
      const cleaned = [...new Set(incoming.map((s) => String(s).trim()).filter(Boolean))];
      fields.push('resident_ids = ?');
      values.push(cleaned.length ? JSON.stringify(cleaned) : null);
    }
  }
  fields.push("updated_at = datetime('now')");
  try {
    const result = await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
    if (!result.changes) return res.status(404).json({ error: 'User not found' });
    const user = await db.get(
      'SELECT id, name, email, phone, profile_photo, role, resident_id, resident_ids, active, created_at, updated_at FROM users WHERE id = ?',
      [id]
    );
    await logAudit({
      category: 'user',
      action: 'User updated',
      req,
      details: `Updated user ${user.name} (${user.email})`,
    });
    let outResidentIds = [];
    try {
      outResidentIds = JSON.parse(user.resident_ids || '[]');
    } catch {
      outResidentIds = [];
    }
    if (!outResidentIds.length && user.resident_id) outResidentIds = [user.resident_id];
    return res.json({
      ...user,
      active: Boolean(user.active),
      residentId: user.resident_id ?? undefined,
      residentIds: outResidentIds,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  if (id === req.user.sub) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  try {
    const user = await db.get(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') {
      const adminCount = await db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
      if ((adminCount?.count ?? 0) <= 1) {
        return res.status(409).json({ error: 'Cannot delete the last admin account' });
      }
    }
    const assignedResidentCount = await db.get(
      'SELECT COUNT(*) AS count FROM residents WHERE caregiver_user_id = ? AND archived = 0',
      [id]
    );
    if ((assignedResidentCount?.count ?? 0) > 0) {
      return res.status(409).json({
        error: 'Cannot delete user with assigned residents',
        detail: 'Reassign or archive residents first.',
      });
    }
    const assignedTaskCount = await db.get(
      'SELECT COUNT(*) AS count FROM care_tasks WHERE caregiver_user_id = ? AND completed = 0',
      [id]
    );
    if ((assignedTaskCount?.count ?? 0) > 0) {
      return res.status(409).json({
        error: 'Cannot delete user with active care tasks',
        detail: 'Complete or remove assigned care tasks first.',
      });
    }
    await db.run('DELETE FROM users WHERE id = ?', [id]);
    await logAudit({
      category: 'user',
      action: 'User deleted',
      req,
      details: `Deleted user ${user.name} (${user.email}) role=${user.role}`,
    });
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.patch('/api/users/:id/reset-password', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { id } = req.params;
  try {
    const hash = await bcrypt.hash(parsed.data.newPassword, 10);
    const result = await db.run(
      "UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?",
      [hash, id]
    );
    if (!result.changes) return res.status(404).json({ error: 'User not found' });
    await logAudit({
      category: 'user',
      action: 'Password reset',
      req,
      details: `Reset password for user ${id}`,
    });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'elderly-app-backend',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/settings/facility', requireAuth, async (_req, res) => {
  try {
    const rows = await db.all(
      `SELECT key, value FROM app_settings WHERE key IN ('facility_name', 'facility_id')`
    );
    const map = new Map(rows.map((r) => [String(r.key), String(r.value ?? '')]));
    return res.json({
      facilityName: map.get('facility_name') || 'Sunrise Senior Care',
      facilityId: map.get('facility_id') || 'SCF-2024',
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch facility settings' });
  }
});

app.patch('/api/settings/facility', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = facilitySettingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { facilityName, facilityId } = parsed.data;
  try {
    if (facilityName !== undefined) {
      await db.run(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('facility_name', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
        [facilityName]
      );
    }
    if (facilityId !== undefined) {
      await db.run(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('facility_id', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
        [facilityId]
      );
    }
    await logAudit({
      category: 'settings',
      action: 'Facility settings updated',
      req,
      details: `facilityName=${facilityName ?? '(unchanged)'} facilityId=${facilityId ?? '(unchanged)'}`,
    });
    const rows = await db.all(
      `SELECT key, value FROM app_settings WHERE key IN ('facility_name', 'facility_id')`
    );
    const map = new Map(rows.map((r) => [String(r.key), String(r.value ?? '')]));
    return res.json({
      facilityName: map.get('facility_name') || 'Sunrise Senior Care',
      facilityId: map.get('facility_id') || 'SCF-2024',
    });
  } catch {
    return res.status(500).json({ error: 'Failed to update facility settings' });
  }
});

// ─── Family portal (relative-only) endpoints ──────────────────────────────────
app.get('/api/family/residents', requireAuth, requireRole('relative'), async (req, res) => {
  try {
    const ids = await getFamilyLinkedResidents(req);
    if (!ids.length) return res.json([]);
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.all(
      `SELECT id, name, room, status, profile_photo
       FROM residents
       WHERE archived = 0 AND id IN (${placeholders})
       ORDER BY id`,
      ids
    );
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch family residents' });
  }
});

app.get('/api/family/alerts', requireAuth, requireRole('relative'), async (req, res) => {
  try {
    const residentPublicId = String(req.query.residentId || '').trim();
    const dbId = toDbResidentId(residentPublicId);
    if (!dbId && residentPublicId) return res.status(400).json({ error: 'Invalid residentId' });
    const linked = await getFamilyLinkedResidents(req);
    const targetId = dbId ?? linked[0] ?? null;
    if (!targetId || !linked.includes(targetId)) return res.json([]);
    const r = await db.get('SELECT name FROM residents WHERE id = ? AND archived = 0', [targetId]);
    if (!r) return res.json([]);
    const rows = await db.all(
      `SELECT a.id, a.type, a.severity, a.resident, a.room, a.timestamp, a.status,
              (
                SELECT rr.profile_photo
                FROM residents rr
                WHERE lower(trim(rr.name)) = lower(trim(a.resident))
                ORDER BY rr.id DESC
                LIMIT 1
              ) AS resident_profile_photo
       FROM alerts a
       WHERE a.resident = ?
       ORDER BY a.timestamp DESC`,
      [r.name]
    );
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch family alerts' });
  }
});

app.get('/api/family/medications', requireAuth, requireRole('relative'), async (req, res) => {
  try {
    const residentPublicId = String(req.query.residentId || '').trim();
    const dbId = toDbResidentId(residentPublicId);
    if (!dbId && residentPublicId) return res.status(400).json({ error: 'Invalid residentId' });
    const linked = await getFamilyLinkedResidents(req);
    const targetId = dbId ?? linked[0] ?? null;
    if (!targetId || !linked.includes(targetId)) return res.json([]);
    const r = await db.get('SELECT name, medications FROM residents WHERE id = ? AND archived = 0', [targetId]);
    if (!r) return res.json([]);
    const rows = await db.all(
      `SELECT m.id, m.resident, m.medication, m.time, m.given,
              (
                SELECT e.event_at
                FROM medication_events e
                WHERE e.medication_id = m.id
                ORDER BY e.event_at DESC
                LIMIT 1
              ) AS last_event_at,
              (
                SELECT e.action
                FROM medication_events e
                WHERE e.medication_id = m.id
                ORDER BY e.event_at DESC
                LIMIT 1
              ) AS last_event_action,
              (
                SELECT e.actor_name
                FROM medication_events e
                WHERE e.medication_id = m.id
                ORDER BY e.event_at DESC
                LIMIT 1
              ) AS last_event_actor
       FROM medications m
       WHERE m.resident = ?
       ORDER BY m.id DESC`,
      [r.name]
    );
    const scheduled = rows.map((m) => ({
      ...m,
      given: Boolean(m.given),
      lastEventAt: m.last_event_at ?? null,
      lastEventAction: m.last_event_action ?? null,
      lastEventActor: m.last_event_actor ?? null,
    }));

    // Fallback for demo flow: medications entered in Resident Profile are stored
    // on the resident record, not in medication schedules table.
    let profileMeds = [];
    try {
      const parsed = JSON.parse(r.medications || '[]');
      profileMeds = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string' && x.trim()) : [];
    } catch {
      profileMeds = [];
    }
    const existingNames = new Set(scheduled.map((m) => String(m.medication || '').trim().toLowerCase()));
    const synthetic = profileMeds
      .filter((name) => !existingNames.has(String(name).trim().toLowerCase()))
      .map((name, i) => ({
        id: `profile-med-${targetId}-${i}`,
        resident: r.name,
        medication: String(name).trim(),
        time: 'As prescribed',
        given: false,
        lastEventAt: null,
        lastEventAction: null,
        lastEventActor: null,
      }));
    return res.json([...scheduled, ...synthetic]);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch family medications' });
  }
});

app.get('/api/residents', requireAuth, requireRole('admin', 'caregiver'), (_req, res) => {
  const includeArchived = _req.query.includeArchived === 'true';
  const filters = [];
  const values = [];
  if (!includeArchived) filters.push('r.archived = 0');
  if (_req.user?.role === 'caregiver') {
    filters.push('r.caregiver_user_id = ?');
    values.push(_req.user.sub);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  db.all(
    `SELECT r.id, r.name, r.room, r.date_of_birth, r.gender, r.status, r.medical_conditions, r.allergies, r.device_id, r.medications, r.contacts, r.profile_photo, r.archived, r.caregiver_user_id, u.name AS caregiver_name, r.created_at, r.updated_at
     FROM residents r
     LEFT JOIN users u ON u.id = r.caregiver_user_id
     ${where}
     ORDER BY r.id`,
    values
  )
    .then((rows) => res.json(rows))
    .catch(() => res.status(500).json({ error: 'Failed to fetch residents' }));
});

app.get('/api/residents/:id', requireAuth, requireRole('admin', 'caregiver'), async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid resident id' });
  try {
    const row = await db.get(
      `SELECT r.id, r.name, r.room, r.date_of_birth, r.gender, r.status, r.medical_conditions, r.allergies, r.device_id, r.medications, r.contacts, r.profile_photo, r.archived, r.caregiver_user_id, u.name AS caregiver_name, r.created_at, r.updated_at
       FROM residents r
       LEFT JOIN users u ON u.id = r.caregiver_user_id
       WHERE r.id = ?`,
      [id]
    );
    if (!row) return res.status(404).json({ error: 'Resident not found' });
    return res.json(row);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch resident' });
  }
});

app.post('/api/residents', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = residentCreateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { name, room, dateOfBirth, gender, status, medicalConditions, allergies, deviceId, medications, contacts, caregiverUserId, profilePhoto } = parsed.data;
  try {
    const caregiverCheck = await validateCaregiverUserId(caregiverUserId);
    if (!caregiverCheck.ok) return res.status(400).json({ error: 'Invalid caregiver assignment' });
    const maxRow = await db.get('SELECT MAX(id) AS maxId FROM residents');
    residentSeq = Math.max(residentSeq, (maxRow?.maxId ?? 0) + 1);
    const id = residentSeq;
    await db.run(
      `INSERT INTO residents (id, name, room, date_of_birth, gender, status, medical_conditions, allergies, device_id, medications, contacts, profile_photo, caregiver_user_id, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
      [
        id,
        name,
        room,
        dateOfBirth || null,
        gender || null,
        status,
        medicalConditions?.length ? JSON.stringify(medicalConditions) : null,
        allergies || null,
        deviceId || null,
        medications?.length ? JSON.stringify(medications) : null,
        contacts ? JSON.stringify(contacts) : null,
        profilePhoto ?? null,
        caregiverCheck.value ?? null,
      ]
    );
    const row = await db.get(
      `SELECT r.id, r.name, r.room, r.date_of_birth, r.gender, r.status, r.medical_conditions, r.allergies, r.device_id, r.medications, r.contacts, r.profile_photo, r.archived, r.caregiver_user_id, u.name AS caregiver_name, r.created_at, r.updated_at
       FROM residents r
       LEFT JOIN users u ON u.id = r.caregiver_user_id
       WHERE r.id = ?`,
      [id]
    );
    await logAudit({
      category: 'resident',
      action: 'Resident created',
      req,
      details: `Created resident ${row.name} room=${row.room} status=${row.status} caregiver=${row.caregiver_name ?? 'unassigned'}`,
    });
    return res.status(201).json(row);
  } catch {
    return res.status(500).json({ error: 'Failed to create resident' });
  }
});

app.patch('/api/residents/:id', requireAuth, requireRole('admin', 'caregiver'), async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid resident id' });
  const parsed = residentUpdateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const updates = parsed.data;
  if (updates.caregiverUserId !== undefined && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can change caregiver assignment' });
  }
  if (updates.profilePhoto !== undefined && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can change resident profile photo' });
  }
  const fields = [];
  const values = [];
  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.room !== undefined) {
    fields.push('room = ?');
    values.push(updates.room);
  }
  if (updates.dateOfBirth !== undefined) {
    fields.push('date_of_birth = ?');
    values.push(updates.dateOfBirth || null);
  }
  if (updates.gender !== undefined) {
    fields.push('gender = ?');
    values.push(updates.gender || null);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.medicalConditions !== undefined) {
    fields.push('medical_conditions = ?');
    values.push(updates.medicalConditions.length ? JSON.stringify(updates.medicalConditions) : null);
  }
  if (updates.allergies !== undefined) {
    fields.push('allergies = ?');
    values.push(updates.allergies || null);
  }
  if (updates.deviceId !== undefined) {
    fields.push('device_id = ?');
    values.push(updates.deviceId || null);
  }
  if (updates.medications !== undefined) {
    fields.push('medications = ?');
    values.push(updates.medications.length ? JSON.stringify(updates.medications) : null);
  }
  if (updates.contacts !== undefined) {
    fields.push('contacts = ?');
    values.push(updates.contacts ? JSON.stringify(updates.contacts) : null);
  }
  if (updates.caregiverUserId !== undefined) {
    const caregiverCheck = await validateCaregiverUserId(updates.caregiverUserId);
    if (!caregiverCheck.ok) return res.status(400).json({ error: 'Invalid caregiver assignment' });
    fields.push('caregiver_user_id = ?');
    values.push(caregiverCheck.value ?? null);
  }
  if (updates.profilePhoto !== undefined) {
    fields.push('profile_photo = ?');
    values.push(updates.profilePhoto);
  }
  if (updates.archived !== undefined) {
    fields.push('archived = ?');
    values.push(updates.archived ? 1 : 0);
  }
  fields.push("updated_at = datetime('now')");
  try {
    const existing = await db.get('SELECT id, name FROM residents WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Resident not found' });
    const result = await db.run(`UPDATE residents SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
    if (!result.changes) return res.status(404).json({ error: 'Resident not found' });
    const finalResidentName = updates.name !== undefined ? updates.name : existing.name;

    // Keep medication schedule rows aligned with resident profile edits.
    // If resident name changes, migrate existing schedule ownership.
    if (updates.name !== undefined && updates.name !== existing.name) {
      await db.run(
        "UPDATE medications SET resident = ?, updated_at = datetime('now') WHERE resident = ?",
        [updates.name, existing.name]
      );
    }
    // If profile medication list changes, sync it into real medication schedule rows.
    // We only manage rows with time='As prescribed' to avoid touching custom timed schedules.
    if (updates.medications !== undefined) {
      const desired = [...new Set(updates.medications.map((m) => String(m).trim()).filter(Boolean))];
      const currentRows = await db.all(
        `SELECT id, medication, given
         FROM medications
         WHERE resident = ? AND time = 'As prescribed'
         ORDER BY id`,
        [finalResidentName]
      );
      const desiredKey = new Set(desired.map((m) => m.toLowerCase()));
      const currentByKey = new Map(
        currentRows.map((row) => [String(row.medication || '').trim().toLowerCase(), row])
      );

      // Remove stale profile-derived rows no longer listed.
      for (const row of currentRows) {
        const key = String(row.medication || '').trim().toLowerCase();
        if (!desiredKey.has(key)) {
          await db.run('DELETE FROM medications WHERE id = ?', [row.id]);
        }
      }

      // Add newly listed meds as real schedules.
      for (const med of desired) {
        const key = med.toLowerCase();
        if (currentByKey.has(key)) continue;
        const medId = `med-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        await db.run(
          `INSERT INTO medications (id, resident, medication, time, given, created_at, updated_at)
           VALUES (?, ?, ?, 'As prescribed', 0, datetime('now'), datetime('now'))`,
          [medId, finalResidentName, med]
        );
        await logMedicationEvent({
          medicationId: medId,
          resident: finalResidentName,
          medication: med,
          action: 'assigned',
          req,
        });
      }
    }

    const row = await db.get(
      `SELECT r.id, r.name, r.room, r.date_of_birth, r.gender, r.status, r.medical_conditions, r.allergies, r.device_id, r.medications, r.contacts, r.profile_photo, r.archived, r.caregiver_user_id, u.name AS caregiver_name, r.created_at, r.updated_at
       FROM residents r
       LEFT JOIN users u ON u.id = r.caregiver_user_id
       WHERE r.id = ?`,
      [id]
    );
    await logAudit({
      category: 'resident',
      action: 'Resident updated',
      req,
      details: `Updated resident ${row.name} room=${row.room} status=${row.status} archived=${row.archived} caregiver=${row.caregiver_name ?? 'unassigned'}`,
    });
    return res.json(row);
  } catch {
    return res.status(500).json({ error: 'Failed to update resident' });
  }
});

app.delete('/api/residents/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid resident id' });
  try {
    const result = await db.run(
      "UPDATE residents SET archived = 1, updated_at = datetime('now') WHERE id = ?",
      [id]
    );
    if (!result.changes) return res.status(404).json({ error: 'Resident not found' });
    await logAudit({
      category: 'resident',
      action: 'Resident archived',
      req,
      details: `Archived resident id=${id}`,
    });
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: 'Failed to archive resident' });
  }
});

app.delete('/api/residents/:id/permanent', requireAuth, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid resident id' });
  try {
    const resident = await db.get('SELECT id, name, archived FROM residents WHERE id = ?', [id]);
    if (!resident) return res.status(404).json({ error: 'Resident not found' });
    if (!Boolean(resident.archived)) {
      return res.status(409).json({ error: 'Resident must be archived before permanent deletion' });
    }

    const publicId = `RES-${1000 + Number(id)}`;
    const users = await db.all('SELECT id, resident_id, resident_ids FROM users');
    for (const u of users) {
      let changed = false;
      let residentIds = [];
      try {
        residentIds = JSON.parse(u.resident_ids || '[]');
      } catch {
        residentIds = [];
      }
      const nextResidentIds = residentIds.filter((rid) => String(rid).trim() !== publicId);
      if (nextResidentIds.length !== residentIds.length) changed = true;
      let nextResidentId = u.resident_id;
      if (String(u.resident_id || '').trim() === publicId) {
        nextResidentId = nextResidentIds[0] ?? null;
        changed = true;
      }
      if (changed) {
        await db.run(
          "UPDATE users SET resident_id = ?, resident_ids = ?, updated_at = datetime('now') WHERE id = ?",
          [nextResidentId, nextResidentIds.length ? JSON.stringify(nextResidentIds) : null, u.id]
        );
      }
    }

    await db.run('DELETE FROM medication_events WHERE resident = ?', [resident.name]);
    await db.run('DELETE FROM medications WHERE resident = ?', [resident.name]);
    await db.run('DELETE FROM alerts WHERE resident = ?', [resident.name]);

    const tasks = await db.all('SELECT id, resident_ids FROM care_tasks');
    for (const t of tasks) {
      let ids = [];
      try {
        ids = JSON.parse(t.resident_ids || '[]');
      } catch {
        ids = [];
      }
      const next = ids.filter((rid) => Number(rid) !== id);
      if (next.length === ids.length) continue;
      if (next.length === 0) {
        await db.run('DELETE FROM care_tasks WHERE id = ?', [t.id]);
      } else {
        await db.run(
          "UPDATE care_tasks SET resident_ids = ?, updated_at = datetime('now') WHERE id = ?",
          [JSON.stringify(next), t.id]
        );
      }
    }

    const result = await db.run('DELETE FROM residents WHERE id = ?', [id]);
    if (!result.changes) return res.status(404).json({ error: 'Resident not found' });
    await logAudit({
      category: 'resident',
      action: 'Resident permanently deleted',
      req,
      details: `Permanently deleted resident id=${id} name=${resident.name}`,
    });
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: 'Failed to permanently delete resident' });
  }
});

app.get('/api/care-tasks', requireAuth, requireRole('admin', 'caregiver'), async (req, res) => {
  try {
    const where = req.user.role === 'caregiver' ? 'WHERE t.caregiver_user_id = ?' : '';
    const values = req.user.role === 'caregiver' ? [String(req.user.sub ?? '')] : [];
    const rows = await db.all(
      `SELECT t.id, t.caregiver_user_id, u.name AS caregiver_name, t.resident_ids, t.task_type, t.schedule_time, t.priority, t.notes, t.completed, t.completed_at, t.created_at, t.updated_at
       FROM care_tasks t
       LEFT JOIN users u ON u.id = t.caregiver_user_id
       ${where}
       ORDER BY t.completed ASC, t.schedule_time ASC, t.created_at DESC`,
      values
    );
    const payload = await mapCareTaskRowsToPayload(rows);
    return res.json(payload);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch care tasks' });
  }
});

app.post('/api/care-tasks', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = careTaskCreateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { caregiverUserId, residentIds, taskType, scheduleTime, priority, notes } = parsed.data;
  try {
    const caregiver = await db.get(
      "SELECT id, name FROM users WHERE id = ? AND role = 'caregiver' AND active = 1",
      [caregiverUserId]
    );
    if (!caregiver) return res.status(400).json({ error: 'Invalid caregiver selected' });
    const uniqueIds = [...new Set(residentIds)];
    const placeholders = uniqueIds.map(() => '?').join(',');
    const residentRows = await db.all(
      `SELECT id, name, room FROM residents WHERE id IN (${placeholders}) AND archived = 0`,
      uniqueIds
    );
    if (residentRows.length !== uniqueIds.length) {
      return res.status(400).json({ error: 'One or more residents are invalid or archived' });
    }
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await db.run(
      `INSERT INTO care_tasks (id, caregiver_user_id, resident_ids, task_type, schedule_time, priority, notes, completed, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, datetime('now'), datetime('now'))`,
      [id, caregiverUserId, JSON.stringify(uniqueIds), taskType, scheduleTime, priority, notes ?? null]
    );
    await logAudit({
      category: 'task',
      action: 'Care task created',
      req,
      details: `Created task ${taskType} for caregiver ${caregiver.name} with ${uniqueIds.length} resident(s)`,
    });
    const created = await db.get(
      `SELECT t.id, t.caregiver_user_id, u.name AS caregiver_name, t.resident_ids, t.task_type, t.schedule_time, t.priority, t.notes, t.completed, t.completed_at, t.created_at, t.updated_at
       FROM care_tasks t
       LEFT JOIN users u ON u.id = t.caregiver_user_id
       WHERE t.id = ?`,
      [id]
    );
    if (!created) {
      console.error('[care-tasks] INSERT succeeded but row not found for id', id);
      return res.status(500).json({ error: 'Failed to create care task' });
    }
    let parsedResidentIds = uniqueIds;
    try {
      parsedResidentIds = JSON.parse(created.resident_ids || '[]');
    } catch {
      parsedResidentIds = uniqueIds;
    }
    return res.status(201).json({
      id: created.id,
      caregiverUserId: created.caregiver_user_id,
      caregiverName: created.caregiver_name,
      residentIds: parsedResidentIds,
      residents: residentRows,
      taskType: created.task_type,
      scheduleTime: created.schedule_time,
      priority: created.priority,
      notes: created.notes,
      completed: Boolean(created.completed),
      completedAt: created.completed_at ?? null,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    });
  } catch (err) {
    console.error('[care-tasks] POST', err);
    return res.status(500).json({
      error: 'Failed to create care task',
      detail: IS_PRODUCTION ? undefined : String(err?.message || err),
    });
  }
});

app.delete('/api/care-tasks/completed', requireAuth, requireRole('admin', 'caregiver'), async (req, res) => {
  try {
    let result;
    if (req.user.role === 'caregiver') {
      result = await db.run(
        'DELETE FROM care_tasks WHERE completed = 1 AND caregiver_user_id = ?',
        [String(req.user.sub ?? '')]
      );
    } else {
      result = await db.run('DELETE FROM care_tasks WHERE completed = 1');
    }
    await logAudit({
      category: 'task',
      action: 'Completed task logs cleared',
      req,
      details: `Deleted ${result?.changes ?? 0} completed task log(s)`,
    });
    return res.json({ deleted: result?.changes ?? 0 });
  } catch {
    return res.status(500).json({ error: 'Failed to clear completed task logs' });
  }
});

app.delete('/api/care-tasks/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const task = await db.get('SELECT id, task_type FROM care_tasks WHERE id = ?', [id]);
    if (!task) return res.status(404).json({ error: 'Care task not found' });
    await db.run('DELETE FROM care_tasks WHERE id = ?', [id]);
    await logAudit({
      category: 'task',
      action: 'Care task removed',
      req,
      details: `Removed task ${task.task_type} (${id})`,
    });
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: 'Failed to remove care task' });
  }
});

async function handleCareTaskCompletion(req, res) {
  const { id } = req.params;
  const parsed = careTaskPatchSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { completed } = parsed.data;
  try {
    const task = await db.get(
      'SELECT id, caregiver_user_id, task_type FROM care_tasks WHERE id = ?',
      [id]
    );
    if (!task) return res.status(404).json({ error: 'Care task not found' });
    const caregiverId = String(task.caregiver_user_id ?? '');
    const sessionUserId = String(req.user.sub ?? '');
    if (req.user.role === 'caregiver' && caregiverId !== sessionUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (completed) {
      await db.run(
        `UPDATE care_tasks SET completed = 1, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        [id]
      );
    } else {
      await db.run(
        `UPDATE care_tasks SET completed = 0, completed_at = NULL, updated_at = datetime('now') WHERE id = ?`,
        [id]
      );
    }
    const row = await db.get(
      `SELECT t.id, t.caregiver_user_id, u.name AS caregiver_name, t.resident_ids, t.task_type, t.schedule_time, t.priority, t.notes, t.completed, t.completed_at, t.created_at, t.updated_at
       FROM care_tasks t
       LEFT JOIN users u ON u.id = t.caregiver_user_id
       WHERE t.id = ?`,
      [id]
    );
    const [payload] = await mapCareTaskRowsToPayload(row ? [row] : []);
    if (!payload) return res.status(500).json({ error: 'Failed to load care task' });
    await logAudit({
      category: 'task',
      action: completed ? 'Care task completed' : 'Care task reopened',
      req,
      details: `${completed ? 'Completed' : 'Reopened'} task ${task.task_type} (${id})`,
    });
    return res.json(payload);
  } catch (err) {
    console.error('[care-tasks] PATCH/PUT', err);
    return res.status(500).json({
      error: 'Failed to update care task',
      detail: IS_PRODUCTION ? undefined : String(err?.message || err),
    });
  }
}

app.patch('/api/care-tasks/:id', requireAuth, requireRole('admin', 'caregiver'), handleCareTaskCompletion);
app.put('/api/care-tasks/:id', requireAuth, requireRole('admin', 'caregiver'), handleCareTaskCompletion);

app.get('/api/alerts', requireAuth, requireRole('admin', 'caregiver'), async (_req, res) => {
  try {
    // Auto-expire simulation alerts so they don't keep showing up later.
    // Uses created_at (sqlite datetime('now')) for reliable comparison.
    await db.run(
      `UPDATE alerts
       SET status = 'resolved', updated_at = datetime('now')
       WHERE is_simulation = 1 AND status != 'resolved'
         AND created_at <= datetime('now', '-2 minutes')`
    );

    // Caregivers see all alerts (filtered client-side by their residents in the current UI).
    // Admins should not be "notified" by simulation alerts unless they explicitly targeted themselves.
    if (_req.user?.role === 'admin') {
      const rows = await db.all(
        `SELECT a.id, a.type, a.severity, a.resident, a.room, a.timestamp, a.status, a.is_simulation, a.simulation_target, a.simulation_target_user_id,
                (
                  SELECT rr.profile_photo
                  FROM residents rr
                  WHERE lower(trim(rr.name)) = lower(trim(a.resident))
                  ORDER BY rr.id DESC
                  LIMIT 1
                ) AS resident_profile_photo
         FROM alerts a
         WHERE NOT (is_simulation = 1 AND simulation_target != 'admin')
           AND (
             is_simulation != 1
             OR simulation_target != 'admin'
             OR simulation_target_user_id IS NULL
             OR simulation_target_user_id = ?
           )
         ORDER BY a.timestamp DESC`
        ,
        [String(_req.user?.sub || '')]
      );
      return res.json(rows);
    }

    const rows = await db.all(
      `SELECT a.id, a.type, a.severity, a.resident, a.room, a.timestamp, a.status, a.is_simulation, a.simulation_target, a.simulation_target_user_id,
              (
                SELECT rr.profile_photo
                FROM residents rr
                WHERE lower(trim(rr.name)) = lower(trim(a.resident))
                ORDER BY rr.id DESC
                LIMIT 1
              ) AS resident_profile_photo
       FROM alerts a
       ORDER BY a.timestamp DESC`
    );
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

app.post('/api/admin/alert-simulation/clear', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = adminAlertSimulationSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { target, caregiverUserId, caregiverUserIds, adminUserIds } = parsed.data;
  try {
    if (target === 'caregiver') {
      const targetsRaw = Array.isArray(caregiverUserIds) && caregiverUserIds.length > 0
        ? caregiverUserIds
        : (caregiverUserId ? [caregiverUserId] : []);
      const targets = [...new Set(targetsRaw.map((id) => String(id || '').trim()).filter(Boolean))];
      if (targets.length === 0) {
        return res.status(400).json({ error: 'Select at least one caregiver' });
      }
      let deleted = 0;
      for (const cid of targets) {
        const r = await db.run(
          `DELETE FROM alerts WHERE is_simulation = 1 AND simulation_target = 'caregiver' AND simulation_target_user_id = ?`,
          [cid]
        );
        deleted += r.changes ?? 0;
      }
      return res.json({ deleted });
    }
    if (target === 'admin') {
      const targetsRaw = Array.isArray(adminUserIds) && adminUserIds.length > 0
        ? adminUserIds
        : [String(req.user.sub || '')];
      const targets = [...new Set(targetsRaw.map((id) => String(id || '').trim()).filter(Boolean))];
      let deleted = 0;
      for (const aid of targets) {
        const r = await db.run(
          `DELETE FROM alerts WHERE is_simulation = 1 AND simulation_target = 'admin' AND simulation_target_user_id = ?`,
          [aid]
        );
        deleted += r.changes ?? 0;
      }
      return res.json({ deleted });
    }
    // all (admins + caregivers + legacy all)
    const r = await db.run(
      `DELETE FROM alerts WHERE is_simulation = 1 AND simulation_target IN ('all', 'admin', 'caregiver')`
    );
    return res.json({ deleted: r.changes ?? 0 });
  } catch {
    return res.status(500).json({ error: 'Failed to clear simulation alerts' });
  }
});

app.get('/api/medications', requireAuth, requireRole('admin', 'caregiver'), (_req, res) => {
  db.all(
    `SELECT m.id, m.resident, m.medication, m.time, m.given,
            (
              SELECT e.event_at
              FROM medication_events e
              WHERE e.medication_id = m.id
              ORDER BY e.event_at DESC
              LIMIT 1
            ) AS last_event_at,
            (
              SELECT e.action
              FROM medication_events e
              WHERE e.medication_id = m.id
              ORDER BY e.event_at DESC
              LIMIT 1
            ) AS last_event_action,
            (
              SELECT e.actor_name
              FROM medication_events e
              WHERE e.medication_id = m.id
              ORDER BY e.event_at DESC
              LIMIT 1
            ) AS last_event_actor
     FROM medications m
     ORDER BY m.id`
  )
    .then((rows) =>
      res.json(
        rows.map((m) => ({
          ...m,
          given: Boolean(m.given),
          lastEventAt: m.last_event_at ?? null,
          lastEventAction: m.last_event_action ?? null,
          lastEventActor: m.last_event_actor ?? null,
        }))
      )
    )
    .catch(() => res.status(500).json({ error: 'Failed to fetch medications' }));
});

app.post('/api/medications', requireAuth, requireRole('admin', 'caregiver'), async (req, res) => {
  const parsed = medicationCreateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { residentId, resident, medication, time } = parsed.data;
  const id = `med-${Date.now()}`;
  try {
    let resolvedResidentName = '';
    if (Number.isFinite(residentId)) {
      const row = await db.get(
        'SELECT id, name, caregiver_user_id, archived FROM residents WHERE id = ?',
        [residentId]
      );
      if (!row || Boolean(row.archived)) {
        return res.status(400).json({ error: 'Invalid resident selected' });
      }
      if (req.user.role === 'caregiver' && String(row.caregiver_user_id || '') !== String(req.user.sub || '')) {
        return res.status(403).json({ error: 'You can only add medications for your assigned residents' });
      }
      resolvedResidentName = String(row.name || '').trim();
    } else {
      const byName = await db.get(
        'SELECT id, name, caregiver_user_id, archived FROM residents WHERE lower(trim(name)) = lower(trim(?)) LIMIT 1',
        [resident || '']
      );
      if (!byName || Boolean(byName.archived)) {
        return res.status(400).json({ error: 'Resident not found' });
      }
      if (req.user.role === 'caregiver' && String(byName.caregiver_user_id || '') !== String(req.user.sub || '')) {
        return res.status(403).json({ error: 'You can only add medications for your assigned residents' });
      }
      resolvedResidentName = String(byName.name || '').trim();
    }

    await db.run(
      `INSERT INTO medications (id, resident, medication, time, given, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
      [id, resolvedResidentName, medication, time]
    );
    const row = await db.get('SELECT id, resident, medication, time, given FROM medications WHERE id = ?', [id]);
    await logMedicationEvent({
      medicationId: row.id,
      resident: row.resident,
      medication: row.medication,
      action: 'assigned',
      req,
    });
    await logAudit({
      category: 'medication',
      action: 'Medication created',
      req,
      details: `Created medication for ${row.resident}: ${row.medication} at ${row.time}`,
    });
    return res.status(201).json({ ...row, given: Boolean(row.given) });
  } catch {
    return res.status(500).json({ error: 'Failed to create medication' });
  }
});

app.delete('/api/medications/logs', requireAuth, requireRole('admin', 'caregiver'), async (req, res) => {
  try {
    let medsToDelete = [];
    if (req.user.role === 'caregiver') {
      const caregiverId = String(req.user.sub ?? '');
      const assignedResidents = await db.all(
        'SELECT name FROM residents WHERE caregiver_user_id = ?',
        [caregiverId]
      );
      const residentNames = assignedResidents
        .map((r) => String(r.name || '').trim())
        .filter(Boolean);
      if (residentNames.length === 0) {
        return res.json({ deleted: 0 });
      }
      const placeholders = residentNames.map(() => '?').join(',');
      medsToDelete = await db.all(
        `SELECT id FROM medications WHERE given = 1 AND resident IN (${placeholders})`,
        residentNames
      );
      await db.run(
        `DELETE FROM medications WHERE given = 1 AND resident IN (${placeholders})`,
        residentNames
      );
    } else {
      medsToDelete = await db.all('SELECT id FROM medications WHERE given = 1');
      await db.run('DELETE FROM medications WHERE given = 1');
    }

    const medIds = medsToDelete
      .map((m) => String(m.id || '').trim())
      .filter(Boolean);
    if (medIds.length > 0) {
      const placeholders = medIds.map(() => '?').join(',');
      await db.run(`DELETE FROM medication_events WHERE medication_id IN (${placeholders})`, medIds);
    }

    await logAudit({
      category: 'medication',
      action: 'Medication logs cleared',
      req,
      details: `Deleted ${medIds.length} completed medication log(s)`,
    });
    return res.json({ deleted: medIds.length });
  } catch {
    return res.status(500).json({ error: 'Failed to clear medication logs' });
  }
});

app.get('/api/devices', requireAuth, requireRole('admin', 'caregiver'), async (_req, res) => {
  try {
    const rows = await db.all(
      'SELECT id, device_id, status, assigned_resident, battery, last_seen, created_at, updated_at FROM devices ORDER BY created_at DESC'
    );
    return res.json(rows.map((d) => ({
      id: d.id,
      deviceId: d.device_id,
      status: d.status,
      assignedResident: d.assigned_resident,
      battery: d.battery,
      lastSeen: d.last_seen,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    })));
  } catch {
    return res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

app.post('/api/devices', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = deviceCreateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { deviceId, status, battery } = parsed.data;
  const id = `dev-${Date.now()}`;
  try {
    await db.run(
      `INSERT INTO devices (id, device_id, status, assigned_resident, battery, last_seen, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, datetime('now'), datetime('now'), datetime('now'))`,
      [id, deviceId, status, battery]
    );
    const row = await db.get(
      'SELECT id, device_id, status, assigned_resident, battery, last_seen, created_at, updated_at FROM devices WHERE id = ?',
      [id]
    );
    await logAudit({
      category: 'device',
      action: 'Device created',
      req,
      details: `Created device ${row.device_id} status=${row.status} battery=${row.battery}`,
    });
    return res.status(201).json({
      id: row.id,
      deviceId: row.device_id,
      status: row.status,
      assignedResident: row.assigned_resident,
      battery: row.battery,
      lastSeen: row.last_seen,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to create device' });
  }
});

app.patch('/api/devices/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const parsed = deviceUpdateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const fields = [];
  const values = [];
  if (parsed.data.status !== undefined) {
    fields.push('status = ?');
    values.push(parsed.data.status);
  }
  if (parsed.data.battery !== undefined) {
    fields.push('battery = ?');
    values.push(parsed.data.battery);
  }
  if (parsed.data.assignedResident !== undefined) {
    fields.push('assigned_resident = ?');
    values.push(parsed.data.assignedResident);
  }
  fields.push("last_seen = datetime('now')");
  fields.push("updated_at = datetime('now')");
  try {
    const result = await db.run(`UPDATE devices SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
    if (!result.changes) return res.status(404).json({ error: 'Device not found' });
    const row = await db.get(
      'SELECT id, device_id, status, assigned_resident, battery, last_seen, created_at, updated_at FROM devices WHERE id = ?',
      [id]
    );
    await logAudit({
      category: 'device',
      action: 'Device updated',
      req,
      details: `Updated device ${row.device_id} status=${row.status} assignedResident=${row.assigned_resident ?? 'none'}`,
    });
    return res.json({
      id: row.id,
      deviceId: row.device_id,
      status: row.status,
      assignedResident: row.assigned_resident,
      battery: row.battery,
      lastSeen: row.last_seen,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to update device' });
  }
});

app.patch('/api/alerts/:id', requireAuth, requireRole('admin', 'caregiver'), (req, res) => {
  const { id } = req.params;
  const parsed = alertStatusSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { status } = parsed.data;
  db.run('UPDATE alerts SET status = ? WHERE id = ?', [status, id])
    .then((result) => {
      if (!result.changes) {
        return res.status(404).json({ error: 'Alert not found' });
      }
      return db.get('SELECT id, type, severity, resident, room, timestamp, status FROM alerts WHERE id = ?', [id])
        .then(async (row) => {
          await logAudit({
            category: 'incident',
            action: 'Alert status updated',
            req,
            details: `Alert ${id} set to ${row.status} (${row.type} for ${row.resident})`,
          });
          return res.json(row);
        });
    })
    .catch(() => res.status(500).json({ error: 'Failed to update alert' }));
});

app.patch('/api/medications/:id', requireAuth, requireRole('admin', 'caregiver'), (req, res) => {
  const { id } = req.params;
  const parsed = medicationPatchSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { given } = parsed.data;
  db.run('UPDATE medications SET given = ?, updated_at = datetime(\'now\') WHERE id = ?', [given ? 1 : 0, id])
    .then((result) => {
      if (!result.changes) {
        return res.status(404).json({ error: 'Medication not found' });
      }
      return db.get('SELECT id, resident, medication, time, given FROM medications WHERE id = ?', [id])
        .then(async (row) => {
          // Keep duplicate rows aligned for demo consistency.
          // Some records can exist twice (e.g. profile-derived + schedule entry).
          await db.run(
            `UPDATE medications
             SET given = ?, updated_at = datetime('now')
             WHERE resident = ? AND lower(trim(medication)) = lower(trim(?))`,
            [row.given ? 1 : 0, row.resident, row.medication]
          );
          await logMedicationEvent({
            medicationId: row.id,
            resident: row.resident,
            medication: row.medication,
            action: row.given ? 'given' : 'pending',
            req,
          });
          await logAudit({
            category: 'medication',
            action: 'Medication updated',
            req,
            details: `Medication ${row.medication} for ${row.resident} marked ${row.given ? 'given' : 'pending'}`,
          });
          return res.json({ ...row, given: Boolean(row.given) });
        });
    })
    .catch(() => res.status(500).json({ error: 'Failed to update medication' }));
});

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
server.on('error', (err) => {
  console.error('[server] Failed to start HTTP server:', err.message || err);
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[server] Port ${PORT} is already in use. Stop the other Node process or run with a different PORT (e.g. set PORT=4001 and match Vite proxy).`
    );
  }
  process.exit(1);
});
