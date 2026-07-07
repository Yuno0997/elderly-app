import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { initDb } from './db.js';
import { BACKUP_DIR, DB_DIR } from './paths.js';
import { sendUnismsSms, hasUnismsCredentials } from './unisms.js';
import { getRtdbConfig, rtdbGetJson, rtdbSetJson } from './firebaseRtdb.js';

const app = express();
const PORT = process.env.PORT || 4000;
const FIRST_ADMIN_BOOTSTRAP_KEY = process.env.FIRST_ADMIN_BOOTSTRAP_KEY || '';
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;
const TEMP_PASSWORD_MIN_LENGTH = 4;
const IS_PRODUCTION = process.env.APP_ENV === 'production';
const BAND_FALL_POLL_INTERVAL_MS = Math.max(1000, Number(process.env.BAND_FALL_POLL_INTERVAL_MS || 3000));
const BAND_VITALS_POLL_INTERVAL_MS = Math.max(1000, Number(process.env.BAND_VITALS_POLL_INTERVAL_MS || 3000));
const DEFAULT_BAND_DEVICE_ID = String(process.env.BAND_DEVICE_ID || 'SAFEBAND-001').trim();
const VITALS_STALE_THRESHOLD_MS = Number(process.env.VITALS_STALE_THRESHOLD_MS || 60_000);

// ── JWT Secret Hardening ──────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'dev-secret-change-me' || JWT_SECRET.length < 32) {
  if (IS_PRODUCTION) {
    console.error('[FATAL] JWT_SECRET is missing, too short, or using the insecure default value.');
    console.error('[FATAL] Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  } else {
    console.warn('[security] JWT_SECRET is weak or missing — using insecure fallback for development only.');
  }
}
const _JWT_SECRET = JWT_SECRET || 'dev-secret-change-me-generate-a-real-one';

if (IS_PRODUCTION && !FIRST_ADMIN_BOOTSTRAP_KEY) {
  throw new Error('FIRST_ADMIN_BOOTSTRAP_KEY must be set in production.');
}

// Trust the first proxy (ngrok, nginx, etc.) so rate-limit can read real IPs
// from X-Forwarded-For. Required whenever the app runs behind any proxy.
app.set('trust proxy', 1);

// ── HTTP Security Headers (Helmet) ────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ─────────────────────────────────────────────────────────────────────
// Allow all origins. The API is protected by JWT tokens on every authenticated
// route — CORS headers add no meaningful security for a token-based API and
// only cause breakage with ngrok / external domains.
app.use(cors({ origin: true, credentials: true }));

// ── Rate Limiters ─────────────────────────────────────────────────────────────
// Progressive login lockout (per IP):
//   • First  5 consecutive failures  → locked for  1 minute
//   • Next   5 consecutive failures  → locked for  5 minutes
// A successful login resets the counter for that IP.
const loginAttempts = new Map(); // ip → { count, lockedUntil, tier }
const LOGIN_TIER1_LIMIT = 5;     // attempts before first lock
const LOGIN_TIER2_LIMIT = 5;     // additional attempts before second lock
const LOGIN_TIER1_MS   = 60 * 1000;      // 1 minute
const LOGIN_TIER2_MS   = 5 * 60 * 1000; // 5 minutes

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function loginLimiter(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, lockedUntil: 0, tier: 0 };

  if (entry.lockedUntil > now) {
    const retryAfter = Math.ceil((entry.lockedUntil - now) / 1000);
    const mins = entry.tier >= 2 ? 5 : 1;
    return res.status(429).json({
      error: `Too many login attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.`,
      retryAfter,
    });
  }

  // Lock window has passed — reset tier tracking if the lock expired
  if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
    entry.lockedUntil = 0;
    entry.count = 0;
    // Keep tier so repeated offences escalate
  }

  req._loginIp = ip;
  loginAttempts.set(ip, entry);
  next();
}

function recordLoginFailure(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, lockedUntil: 0, tier: 0 };
  entry.count += 1;
  const tier1Total = LOGIN_TIER1_LIMIT;
  const tier2Total = LOGIN_TIER1_LIMIT + LOGIN_TIER2_LIMIT;
  if (entry.count >= tier2Total && entry.tier < 2) {
    entry.tier = 2;
    entry.lockedUntil = Date.now() + LOGIN_TIER2_MS;
    entry.count = 0;
  } else if (entry.count >= tier1Total && entry.tier < 1) {
    entry.tier = 1;
    entry.lockedUntil = Date.now() + LOGIN_TIER1_MS;
    entry.count = 0;
  }
  loginAttempts.set(ip, entry);
}

function recordLoginSuccess(ip) {
  loginAttempts.delete(ip);
}

// Keep the generic api limiter (generous — mainly flood protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !IS_PRODUCTION,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 500,              // generous — accounts for polling
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !IS_PRODUCTION,
});

app.use(express.json({ limit: '5mb' }));
app.use('/api/', apiLimiter);
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
let lastBandFallDetected = null;
let bandFallPollInFlight = false;
let bandVitalsPollInFlight = false;
let lastBandUnusualPulseDetected = null;
let bandUnusualPulsePollInFlight = false;
let lastBandSleepAnomalyDetected = null;
let bandSleepAnomalyPollInFlight = false;

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
  email: z.string().trim().email('Invalid email address').optional(),
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
    _JWT_SECRET,
    { expiresIn: '12h' }
  );
}

// ── Transaction Helper ────────────────────────────────────────────────────────
async function withTransaction(fn) {
  await db.run('BEGIN IMMEDIATE');
  try {
    const result = await fn();
    await db.run('COMMIT');
    return result;
  } catch (err) {
    try { await db.run('ROLLBACK'); } catch {}
    throw err;
  }
}

// ── SSE (Server-Sent Events) — Alert Push ─────────────────────────────────────
// Clients connect to GET /api/alerts/stream; server pushes alert events.
const sseClients = new Map(); // userId (string) → Set<res>

function broadcastAlertUpdate(payload) {
  const json = JSON.stringify(payload);
  for (const clients of sseClients.values()) {
    for (const res of clients) {
      try { res.write(`data: ${json}\n\n`); } catch {}
    }
  }
}

async function logAudit({ category, action, req, details }) {
  try {
    await db.run(
      `INSERT INTO audit_logs (id, timestamp, category, action, user_id, user_name, details)
       VALUES (?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        category,
        action,
        req?.user?.sub ?? null,
        req?.user?.name ?? null,
        details ?? null,
      ]
    );
  } catch (err) {
    console.error('[audit] logAudit failed:', err?.message || err);
    // Audit logging must not block primary request flow.
  }
}

async function logMedicationEvent({ medicationId, resident, medication, action, req, actorUserId, actorName }) {
  try {
    await db.run(
      `INSERT INTO medication_events (id, medication_id, resident, medication, action, actor_user_id, actor_name, event_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        randomUUID(),
        medicationId,
        resident,
        medication,
        action,
        actorUserId ?? req?.user?.sub ?? null,
        actorName ?? req?.user?.name ?? null,
      ]
    );
  } catch (err) {
    console.error('[medication-event] logMedicationEvent failed:', err?.message || err);
    // Event logging must not block primary request flow.
  }
}

async function ensureBandDeviceHeartbeat({ battery = 100, online = true } = {}) {
  if (!DEFAULT_BAND_DEVICE_ID) return null;

  const existing = await db.get(
    `SELECT id, device_id, status, assigned_resident, battery
     FROM devices
     WHERE lower(trim(device_id)) = lower(trim(?))
     LIMIT 1`,
    [DEFAULT_BAND_DEVICE_ID]
  );

  const nextStatus = online ? 'online' : 'offline';
  const nextBattery = Number.isFinite(Number(battery)) ? Math.max(0, Math.min(100, Number(battery))) : 100;

  if (!existing) {
    const id = randomUUID();
    await db.run(
      `INSERT INTO devices (id, device_id, status, assigned_resident, battery, last_seen, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, datetime('now'), datetime('now'), datetime('now'))`,
      [id, DEFAULT_BAND_DEVICE_ID, nextStatus, nextBattery]
    );
    return { id, deviceId: DEFAULT_BAND_DEVICE_ID, status: nextStatus, battery: nextBattery };
  }

  await db.run(
    `UPDATE devices
     SET status = ?, battery = ?, last_seen = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
    [nextStatus, nextBattery, existing.id]
  );
  return {
    id: existing.id,
    deviceId: existing.device_id,
    status: nextStatus,
    battery: nextBattery,
    assignedResident: existing.assigned_resident ?? null,
  };
}

async function getAssignedBandResidentContext() {
  const device = await db.get(
    `SELECT id, device_id, assigned_resident
     FROM devices
     WHERE assigned_resident IS NOT NULL AND trim(assigned_resident) != ''
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`
  );
  if (!device?.assigned_resident) return null;

  const resident = await db.get(
    `SELECT id, name, room
     FROM residents
     WHERE archived = 0 AND lower(trim(name)) = lower(trim(?))
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [String(device.assigned_resident || '').trim()]
  );
  if (!resident) return null;

  return {
    deviceId: String(device.device_id || '').trim(),
    residentId: resident.id,
    residentName: String(resident.name || '').trim(),
    room: String(resident.room || '').trim() || 'N/A',
  };
}

/**
 * Normalize any Philippine phone number format to E.164 (+639XXXXXXXXX).
 * Accepts: 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX, +639XXXXXXXXX
 * Returns null if the number doesn't look like a valid PH mobile number.
 */
function normalizePHPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[\s\-().+]/g, ''); // strip spaces, dashes, parens, dots, plus

  // Already E.164 style digits: 639XXXXXXXXX (12 digits)
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;

  // Local format: 09XXXXXXXXX (11 digits)
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;

  // Without leading 0: 9XXXXXXXXX (10 digits)
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;

  // Already has + but stripped: just prepend
  if (/^63\d{10}$/.test(digits)) return `+${digits}`;

  return null; // unrecognized format — skip
}

/**
 * Collect phone numbers for a resident and send an SMS alert to all relevant contacts.
 * Recipients: assigned caregiver, family member users, resident emergency contacts.
 * Fire-and-forget — never throws; failures are logged only.
 */
async function sendAlertSms({ residentName, room, message }) {
  if (!hasUnismsCredentials()) return;
  try {
    const phones = new Set();

    // 1. Assigned caregiver's phone
    const caregiver = await db.get(
      `SELECT u.phone FROM users u
       INNER JOIN residents r ON r.caregiver_user_id = u.id
       WHERE lower(trim(r.name)) = lower(trim(?)) AND r.archived = 0
       LIMIT 1`,
      [residentName]
    );
    const normalized1 = normalizePHPhone(caregiver?.phone);
    if (normalized1) phones.add(normalized1);

    // 2. Family member (relative) accounts linked to this resident
    const relatives = await db.all(
      `SELECT phone, resident_id, resident_ids FROM users
       WHERE role = 'relative' AND active = 1 AND phone IS NOT NULL AND trim(phone) != ''`
    );
    const residentRow = await db.get(
      `SELECT id FROM residents WHERE lower(trim(name)) = lower(trim(?)) AND archived = 0 LIMIT 1`,
      [residentName]
    );
    if (residentRow) {
      const rid = residentRow.id;
      const pubId = `RES-${1000 + rid}`;
      for (const u of relatives) {
        let ids = [];
        try { ids = JSON.parse(u.resident_ids || '[]'); } catch { ids = []; }
        if (ids.includes(rid) || ids.includes(String(rid)) || ids.includes(pubId)
            || u.resident_id === pubId || u.resident_id === String(rid)) {
          const normalized2 = normalizePHPhone(u.phone);
          if (normalized2) phones.add(normalized2);
        }
      }
    }

    // 3. Emergency contacts stored in residents.contacts JSON
    const residentContacts = await db.get(
      `SELECT contacts FROM residents WHERE lower(trim(name)) = lower(trim(?)) AND archived = 0 LIMIT 1`,
      [residentName]
    );
    if (residentContacts?.contacts) {
      try {
        const contacts = JSON.parse(residentContacts.contacts);
        if (Array.isArray(contacts)) {
          for (const c of contacts) {
            const ph = c?.phone || c?.number || c?.mobile || '';
            const normalized3 = normalizePHPhone(ph);
            if (normalized3) phones.add(normalized3);
          }
        }
      } catch { /* ignore malformed contacts */ }
    }

    if (phones.size === 0) {
      console.log('[sms] No phone numbers found for resident:', residentName);
      return;
    }

    const smsBody = message.slice(0, 160);
    for (const phone of phones) {
      const result = await sendUnismsSms({ recipient: phone, content: smsBody });
      if (result.ok) {
        console.log(`[sms] Sent to ${phone}: OK`);
      } else {
        console.warn(`[sms] Failed to send to ${phone}:`, result.error);
      }
    }
  } catch (err) {
    console.error('[sms] sendAlertSms error:', err?.message || err);
  }
}

async function createBandFallAlert({ timestamp }) {
  const ctx = await getAssignedBandResidentContext();
  if (!ctx) return { created: false, reason: 'no_assigned_resident' };

  const existing = await db.get(
    `SELECT id, status
     FROM alerts
     WHERE lower(trim(type)) = lower('Fall Detected')
       AND lower(trim(resident)) = lower(trim(?))
       AND status = 'unacknowledged'
     ORDER BY timestamp DESC, created_at DESC
     LIMIT 1`,
    [ctx.residentName]
  );
  if (existing) return { created: false, reason: 'existing_open_alert', alertId: existing.id };

  const id = randomUUID();
  const finalTimestamp = timestamp || new Date().toISOString();
  await db.run(
    `INSERT INTO alerts (id, type, severity, resident, room, timestamp, status, created_at, updated_at)
     VALUES (?, 'Fall Detected', 'critical', ?, ?, ?, 'unacknowledged', datetime('now'), datetime('now'))`,
    [id, ctx.residentName, ctx.room, finalTimestamp]
  );
  await logAudit({
    category: 'incident',
    action: 'Band fall detected',
    req: null,
    details: `Band-triggered fall alert for ${ctx.residentName} room=${ctx.room} device=${ctx.deviceId || 'unknown'}`,
  });

  // Notify caregiver, family, and emergency contacts via SMS
  void sendAlertSms({
    residentName: ctx.residentName,
    room: ctx.room,
    message: `SAFEBAND ALERT: Fall detected for ${ctx.residentName} in Room ${ctx.room}. Please respond immediately. -SafeAlert Band`,
  });

  return { created: true, alertId: id, residentName: ctx.residentName };
}

async function pollBandFallState() {
  if (bandFallPollInFlight) return;
  bandFallPollInFlight = true;
  try {
    const cfg = getRtdbConfig();
    if (!cfg.databaseUrl) return;
    const data = await rtdbGetJson(cfg, `${cfg.prefix}/fall`);
    const detected = Boolean(data?.detected);
    const timestamp = typeof data?.timestamp === 'string' ? data.timestamp : new Date().toISOString();

    if (detected && lastBandFallDetected !== true) {
      // Fall just detected — create a new alert in the DB
      await createBandFallAlert({ timestamp });
    } else if (!detected && lastBandFallDetected === true) {
      // Fall cleared by hardware button press — auto-resolve any open DB alerts
      await autoResolveBandFallAlerts();
    }
    lastBandFallDetected = detected;
  } catch (err) {
    console.error('[band-fall] Poll failed:', err?.message || err);
  } finally {
    bandFallPollInFlight = false;
  }
}

async function pollBandVitalsState() {
  if (bandVitalsPollInFlight) return;
  bandVitalsPollInFlight = true;
  try {
    const cfg = getRtdbConfig();
    if (!cfg.databaseUrl) return;
    const data = await rtdbGetJson(cfg, `${cfg.prefix}/vitals`);

    // Read actual battery level from hardware (Arduino should send data.battery)
    const batteryRaw = data?.battery ?? data?.batteryLevel ?? data?.bat;
    const battery = Number.isFinite(Number(batteryRaw))
      ? Math.min(100, Math.max(0, Math.round(Number(batteryRaw))))
      : null; // null = hardware hasn’t sent battery yet

    const hasRecentSignal =
      Boolean(data) &&
      (
        Number.isFinite(Number(data?.heartRate)) ||
        Number.isFinite(Number(data?.spo2)) ||
        Number.isFinite(Number(data?.accel)) ||
        Number.isFinite(Number(data?.gyro)) ||
        typeof data?.timestamp === 'string'
      );
    await ensureBandDeviceHeartbeat({ battery: battery ?? 100, online: hasRecentSignal });

    // Low battery alert (< 20%) — create once, not repeatedly
    if (battery !== null && battery < 20) {
      const ctx = await getAssignedBandResidentContext();
      if (ctx) {
        const existing = await db.get(
          `SELECT id FROM alerts WHERE type = 'Low Band Battery' AND status = 'unacknowledged' LIMIT 1`
        );
        if (!existing) {
          const batteryAlertId = randomUUID();
          await db.run(
            `INSERT INTO alerts (id, type, severity, resident, room, timestamp, status, created_at, updated_at)
             VALUES (?, 'Low Band Battery', 'warning', ?, ?, ?, 'unacknowledged', datetime('now'), datetime('now'))`,
            [batteryAlertId, ctx.residentName, ctx.room, new Date().toISOString()]
          );
          console.warn(`[band-battery] Low battery (${battery}%) alert created for ${ctx.residentName}`);
          broadcastAlertUpdate({
            type: 'alert_created',
            alert: { id: batteryAlertId, type: 'Low Band Battery', severity: 'warning', resident: ctx.residentName, room: ctx.room, status: 'unacknowledged' },
          });
        }
      }
    }
  } catch (err) {
    console.error('[band-vitals] Poll failed:', err?.message || err);
  } finally {
    bandVitalsPollInFlight = false;
  }
}

async function clearBandFallState({ timestamp } = {}) {
  const cfg = getRtdbConfig();
  if (!cfg.databaseUrl) return { cleared: false, reason: 'missing_database_url' };
  const nextTimestamp = typeof timestamp === 'string' && timestamp.trim()
    ? timestamp.trim()
    : new Date().toISOString();
  await rtdbSetJson(cfg, `${cfg.prefix}/fall`, {
    detected: false,
    timestamp: nextTimestamp,
  });
  lastBandFallDetected = false;
  return { cleared: true };
}

async function clearBandUnusualPulseState() {
  const cfg = getRtdbConfig();
  if (!cfg.databaseUrl) return;
  await rtdbSetJson(cfg, `${cfg.prefix}/unusualPulse`, {
    detected: false,
    timestamp: new Date().toISOString(),
  });
  lastBandUnusualPulseDetected = false;
  console.log('[band-pulse] Firebase /unusualPulse cleared after acknowledge');
}

async function clearBandSleepAnomalyState() {
  const cfg = getRtdbConfig();
  if (!cfg.databaseUrl) return;
  await rtdbSetJson(cfg, `${cfg.prefix}/sleepAnomaly`, {
    detected: false,
    timestamp: new Date().toISOString(),
  });
  lastBandSleepAnomalyDetected = false;
  console.log('[band-sleep] Firebase /sleepAnomaly cleared after acknowledge');
}

// Auto-resolve all open band fall alerts in the DB.
// Called when the hardware button press clears /safeband/fall/detected → false.
async function autoResolveBandFallAlerts() {
  try {
    const ctx = await getAssignedBandResidentContext();
    if (!ctx) return;
    const openAlerts = await db.all(
      `SELECT id FROM alerts
       WHERE lower(trim(type)) = lower('Fall Detected')
         AND lower(trim(resident)) = lower(trim(?))
         AND status = 'unacknowledged'`,
      [ctx.residentName]
    );
    for (const alert of openAlerts) {
      await db.run(
        `UPDATE alerts SET status = 'resolved', updated_at = datetime('now') WHERE id = ?`,
        [alert.id]
      );
      console.log('[band-fall] Auto-resolved fall alert via hardware button:', alert.id);
    }
    if (openAlerts.length > 0) {
      await logAudit({
        category: 'incident',
        action: 'Band fall auto-resolved',
        req: null,
        details: `Hardware button pressed — auto-resolved ${openAlerts.length} fall alert(s) for ${ctx.residentName}`,
      });
    }
  } catch (err) {
    console.error('[band-fall] Auto-resolve failed:', err?.message || err);
  }
}

// ── Unusual Pulse Polling ─────────────────────────────────────────────────────
async function pollBandUnusualPulseState() {
  if (bandUnusualPulsePollInFlight) return;
  bandUnusualPulsePollInFlight = true;
  try {
    const cfg = getRtdbConfig();
    if (!cfg.databaseUrl) return;
    const data = await rtdbGetJson(cfg, `${cfg.prefix}/unusualPulse`);
    const detected = Boolean(data?.detected);

    if (detected && lastBandUnusualPulseDetected !== true) {
      // Transition false→true: create a DB alert
      const ctx = await getAssignedBandResidentContext();
      if (ctx) {
        const existing = await db.get(
          `SELECT id FROM alerts
           WHERE (lower(trim(type)) LIKE '%pulse%'
              OR lower(trim(type)) LIKE '%heart rate%'
              OR lower(trim(type)) LIKE '%tachycardia%'
              OR lower(trim(type)) LIKE '%bradycardia%')
             AND lower(trim(resident)) = lower(trim(?))
             AND status = 'unacknowledged'
           ORDER BY timestamp DESC LIMIT 1`,
          [ctx.residentName]
        );
        if (!existing) {
          const severity = String(data?.severity || 'warning') === 'critical' ? 'critical' : 'warning';
          const label = String(data?.type || 'Unusual Pulse Rate');
          const ts = String(data?.timestamp || new Date().toISOString());
          const id = randomUUID();
          await db.run(
            `INSERT INTO alerts (id, type, severity, resident, room, timestamp, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'unacknowledged', datetime('now'), datetime('now'))`,
            [id, label, severity, ctx.residentName, ctx.room, ts]
          );
          await logAudit({
            category: 'incident',
            action: 'Band unusual pulse detected',
            req: null,
            details: `Unusual pulse alert (${label} / ${severity}) for ${ctx.residentName} room=${ctx.room}`,
          });
          console.log('[band-pulse] Alert created:', label, severity, ctx.residentName);

          // SMS only for critical pulse alerts
          if (severity === 'critical') {
            void sendAlertSms({
              residentName: ctx.residentName,
              room: ctx.room,
              message: `SAFEBAND ALERT: Critical pulse anomaly (${label}) detected for ${ctx.residentName}, Room ${ctx.room}. HR: ${data?.heartRate || 'N/A'} bpm. -SafeAlert Band`,
            });
          }
        }
      }
    } else if (!detected && lastBandUnusualPulseDetected === true) {
      // Transition true→false: auto-resolve open pulse alerts
      const ctx = await getAssignedBandResidentContext();
      if (ctx) {
        const openAlerts = await db.all(
          `SELECT id FROM alerts
           WHERE (lower(trim(type)) LIKE '%pulse%' OR lower(trim(type)) LIKE '%heart rate%'
             OR lower(trim(type)) LIKE '%tachycardia%' OR lower(trim(type)) LIKE '%bradycardia%')
             AND lower(trim(resident)) = lower(trim(?))
             AND status = 'unacknowledged'`,
          [ctx.residentName]
        );
        for (const alert of openAlerts) {
          await db.run(
            `UPDATE alerts SET status = 'resolved', updated_at = datetime('now') WHERE id = ?`,
            [alert.id]
          );
          console.log('[band-pulse] Auto-resolved pulse alert:', alert.id);
        }
      }
    }
    lastBandUnusualPulseDetected = detected;
  } catch (err) {
    console.error('[band-pulse] Poll failed:', err?.message || err);
  } finally {
    bandUnusualPulsePollInFlight = false;
  }
}

// ── Sleep Anomaly Polling ─────────────────────────────────────────────────────
async function pollBandSleepAnomalyState() {
  if (bandSleepAnomalyPollInFlight) return;
  bandSleepAnomalyPollInFlight = true;
  try {
    const cfg = getRtdbConfig();
    if (!cfg.databaseUrl) return;
    const data = await rtdbGetJson(cfg, `${cfg.prefix}/sleepAnomaly`);
    const detected = Boolean(data?.detected);

    if (detected && lastBandSleepAnomalyDetected !== true) {
      // Transition false→true: create a DB alert
      const ctx = await getAssignedBandResidentContext();
      if (ctx) {
        const label = String(data?.type || 'Sleep Anomaly');
        const ts = String(data?.timestamp || new Date().toISOString());
        const id = `band-sleep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const existing = await db.get(
          `SELECT id FROM alerts
           WHERE (lower(trim(type)) LIKE '%sleep%'
              OR lower(trim(type)) LIKE '%restless%'
              OR lower(trim(type)) LIKE '%spo2%'
              OR lower(trim(type)) LIKE '%apnea%')
             AND lower(trim(resident)) = lower(trim(?))
             AND status = 'unacknowledged'
           ORDER BY timestamp DESC LIMIT 1`,
          [ctx.residentName]
        );
        if (!existing) {
          await db.run(
            `INSERT INTO alerts (id, type, severity, resident, room, timestamp, status, created_at, updated_at)
             VALUES (?, ?, 'warning', ?, ?, ?, 'unacknowledged', datetime('now'), datetime('now'))`,
            [id, label, ctx.residentName, ctx.room, ts]
          );
          await logAudit({
            category: 'incident',
            action: 'Band sleep anomaly detected',
            req: null,
            details: `Sleep anomaly (${label}) for ${ctx.residentName} room=${ctx.room}`,
          });
          console.log('[band-sleep] Alert created:', label, ctx.residentName);

          // Notify via SMS
          void sendAlertSms({
            residentName: ctx.residentName,
            room: ctx.room,
            message: `SAFEBAND ALERT: Sleep anomaly detected (${label}) for ${ctx.residentName}, Room ${ctx.room}. Please check on resident. -SafeAlert Band`,
          });
        }
      }
    } else if (!detected && lastBandSleepAnomalyDetected === true) {
      // Transition true→false: auto-resolve open sleep anomaly alerts
      const ctx = await getAssignedBandResidentContext();
      if (ctx) {
        const openAlerts = await db.all(
          `SELECT id FROM alerts
           WHERE lower(trim(type)) LIKE '%sleep%'
             AND lower(trim(resident)) = lower(trim(?))
             AND status = 'unacknowledged'`,
          [ctx.residentName]
        );
        for (const alert of openAlerts) {
          await db.run(
            `UPDATE alerts SET status = 'resolved', updated_at = datetime('now') WHERE id = ?`,
            [alert.id]
          );
          console.log('[band-sleep] Auto-resolved sleep anomaly alert:', alert.id);
        }
      }
    }
    lastBandSleepAnomalyDetected = detected;
  } catch (err) {
    console.error('[band-sleep] Poll failed:', err?.message || err);
  } finally {
    bandSleepAnomalyPollInFlight = false;
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

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const ip = req._loginIp || getClientIp(req);
  const parsed = authLoginSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { email, password } = parsed.data;
  try {
    const user = await db.get(
      'SELECT id, name, email, password_hash, role, resident_id, resident_ids, active, must_change_password, token_version FROM users WHERE email = ?',
      [email.toLowerCase()]
    );
    if (!user) {
      recordLoginFailure(ip);
      // Return remaining retryAfter if we just got locked
      const entry = loginAttempts.get(ip);
      if (entry?.lockedUntil > Date.now()) {
        const retryAfter = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
        const mins = entry.tier >= 2 ? 5 : 1;
        return res.status(401).json({ error: 'Invalid credentials', lockedOut: true, retryAfter, lockMessage: `Too many login attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.` });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.active) return res.status(403).json({ error: 'Account disabled' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      recordLoginFailure(ip);
      const entry = loginAttempts.get(ip);
      if (entry?.lockedUntil > Date.now()) {
        const retryAfter = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
        const mins = entry.tier >= 2 ? 5 : 1;
        return res.status(401).json({ error: 'Invalid credentials', lockedOut: true, retryAfter, lockMessage: `Too many login attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.` });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Successful login — clear lockout state for this IP
    recordLoginSuccess(ip);
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

app.post('/api/auth/bootstrap-admin', authLimiter, async (req, res) => {
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
    const id = randomUUID();
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
  if (parsed.data.email !== undefined) {
    const newEmail = parsed.data.email.toLowerCase();
    // Check if the new email is already taken by another user
    const existing = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', [newEmail, req.user.sub]);
    if (existing) return res.status(409).json({ error: 'Email is already in use by another account.' });
    fields.push('email = ?');
    values.push(newEmail);
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
    const emailChanged = parsed.data.email !== undefined && parsed.data.email.toLowerCase() !== req.user.email?.toLowerCase();
    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      profilePhoto: user.profile_photo ?? null,
      role: user.role,
      residentId: user.resident_id ?? undefined,
      mustChangePassword: Boolean(user.must_change_password),
      emailChanged,
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

app.post('/api/auth/change-password', authLimiter, requireAuth, async (req, res) => {
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
    // Ensure timestamp strings are unambiguous UTC so the browser parses them correctly.
    // SQLite datetime('now') returns "2026-05-26 05:26:14" (no timezone marker).
    // Appending 'Z' makes it ISO-8601 UTC so new Date('...Z') gives the right time.
    return res.json(rows.map((r) => ({
      ...r,
      timestamp: r.timestamp
        ? (String(r.timestamp).endsWith('Z') ? r.timestamp : String(r.timestamp).replace(' ', 'T') + 'Z')
        : r.timestamp,
    })));
  } catch {
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

app.delete('/api/admin/logs/clear-all', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const before = {
      incidentLogs: (await db.get('SELECT COUNT(*) AS count FROM alerts'))?.count ?? 0,
      medicationEvents: (await db.get('SELECT COUNT(*) AS count FROM medication_events'))?.count ?? 0,
      completedTasks: (await db.get('SELECT COUNT(*) AS count FROM care_tasks WHERE completed = 1'))?.count ?? 0,
      givenMedications: (await db.get('SELECT COUNT(*) AS count FROM medications WHERE given = 1'))?.count ?? 0,
    };

    // NOTE: Audit logs are intentionally NOT deleted — they are retained by policy.
    // Deleting audit evidence after an incident would be a regulatory violation.
    await db.run('DELETE FROM alerts');
    await db.run('DELETE FROM medication_events');
    await db.run('DELETE FROM care_tasks WHERE completed = 1');
    await db.run('DELETE FROM medications WHERE given = 1');

    const cleared = {
      incidentLogs: before.incidentLogs,
      medicationEvents: before.medicationEvents,
      completedTasks: before.completedTasks,
      givenMedications: before.givenMedications,
      auditLogs: 0, // audit logs are never deleted
    };
    const totalCleared = Object.values(cleared).reduce((sum, n) => sum + Number(n || 0), 0);

    await logAudit({
      category: 'admin',
      action: 'Operational logs cleared',
      req,
      details: `Cleared: ${before.incidentLogs} alerts, ${before.medicationEvents} medication events, ${before.completedTasks} completed tasks, ${before.givenMedications} given medications. Audit log retained.`,
    });
    return res.json({ ok: true, cleared, totalCleared });
  } catch (err) {
    console.error('[clear-all]', err);
    return res.status(500).json({ error: 'Failed to clear logs' });
  }
});

// ── Shift Handover Report ────────────────────────────────────────────────────
app.get('/api/reports/shift-handover', requireAuth, requireRole('admin', 'caregiver'), async (req, res) => {
  const hoursBack = Math.min(48, Math.max(1, Number(req.query.hours ?? 12)));
  const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
  try {
    const [recentAlerts, medicationsGiven, medicationsPending, tasksCompleted] = await Promise.all([
      db.all(
        `SELECT type, severity, resident, room, timestamp, status
         FROM alerts WHERE created_at >= ? ORDER BY timestamp DESC LIMIT 100`,
        [since]
      ),
      db.all(
        `SELECT me.resident, me.medication, me.event_at, me.actor_name
         FROM medication_events me
         WHERE me.event_at >= ? AND me.action = 'given'
         ORDER BY me.event_at DESC LIMIT 200`,
        [since]
      ),
      db.all(
        `SELECT m.resident, m.medication, m.time
         FROM medications m
         WHERE m.given = 0 AND m.time != 'As prescribed'
         ORDER BY m.time ASC LIMIT 100`
      ),
      db.all(
        `SELECT t.task_type, t.completed_at, u.name AS caregiver_name, t.priority
         FROM care_tasks t
         LEFT JOIN users u ON u.id = t.caregiver_user_id
         WHERE t.completed = 1 AND t.completed_at >= ?
         ORDER BY t.completed_at DESC LIMIT 100`,
        [since]
      ),
    ]);
    return res.json({
      generatedAt: new Date().toISOString(),
      periodHours: hoursBack,
      since,
      summary: {
        totalAlerts: recentAlerts.length,
        criticalAlerts: recentAlerts.filter((a) => a.severity === 'critical').length,
        unresolvedAlerts: recentAlerts.filter((a) => a.status === 'unacknowledged').length,
        medicationsGiven: medicationsGiven.length,
        medicationsPending: medicationsPending.length,
        tasksCompleted: tasksCompleted.length,
      },
      alerts: recentAlerts,
      medicationsGiven,
      medicationsPending,
      tasksCompleted,
    });
  } catch (err) {
    console.error('[shift-handover]', err);
    return res.status(500).json({ error: 'Failed to generate shift handover report' });
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
    const id = randomUUID();
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
        // intentionally not deleting previous simulation alerts so they can stack
        await makeAlert({ resident: r.name, room: r.room, simulationTarget: 'admin', simulationTargetUserId: targetAdminId });
        created += 1;
      }
      await logAudit({
        category: 'incident',
        action: 'Alert simulation',
        req,
        details: `Scenario: ${scenario} — Target: Admins (${targets.length} recipient(s)) — Resident: ${r.name} (Room ${r.room})`,
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
        // intentionally not deleting previous simulation alerts so they can stack
        await makeAlert({ resident: r.name, room: r.room, simulationTarget: 'caregiver', simulationTargetUserId: targetCaregiverId });
        created += 1;
      }
      await logAudit({
        category: 'incident',
        action: 'Alert simulation',
        req,
        details: `Scenario: ${scenario} — Target: Caregivers (${targets.length} selected, ${created} created, ${skipped} skipped)`,
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

    // Clear previous simulation entries removed to allow stacking simulated alerts

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
      details: `Scenario: ${scenario} — Target: All staff (admins + caregivers) — ${created} alert(s) created, ${skipped} skipped`,
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
    const id = randomUUID();
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
      details: `New ${user.role} account created for ${user.name} (${user.email})`,
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
      details: `Profile updated for ${user.name} (${user.email})`,
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
      details: `Account deleted for ${user.name} (${user.email}), role: ${user.role}`,
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
      details: `Temporary password set for user ID ${id} — must change on next login`,
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

// ─── SafeAlert Band (Firebase RTDB bridge) ─────────────────────────────────────
app.get('/api/band/status', requireAuth, async (_req, res) => {
  const cfg = getRtdbConfig();
  return res.json({
    configured: Boolean(cfg.databaseUrl),
    prefix: cfg.prefix,
    hasSecret: Boolean(cfg.secret),
  });
});

// ── Raw Firebase debug endpoint (admin only) ──────────────────────────────────
// Visit /api/band/raw to see exactly what your Arduino is sending.
// Use this to verify field names (heartRate vs bpm vs pulse, etc.)
app.get('/api/band/raw', requireAuth, requireRole('admin'), async (_req, res) => {
  const cfg = getRtdbConfig();
  if (!cfg.databaseUrl) return res.status(503).json({ error: 'Firebase not configured' });
  try {
    const data = await rtdbGetJson(cfg, cfg.prefix);
    const device = await db.get(
      `SELECT device_id, assigned_resident, battery, status, last_seen FROM devices WHERE lower(trim(device_id)) = lower(trim(?)) LIMIT 1`,
      [DEFAULT_BAND_DEVICE_ID]
    );
    return res.json({
      firebase_raw: data,
      firebase_prefix: cfg.prefix,
      db_device: device ?? null,
      field_check: {
        heartRate:  data?.vitals?.heartRate  ?? data?.heartRate  ?? '(missing)',
        bpm:        data?.vitals?.bpm        ?? data?.bpm        ?? '(missing)',
        pulse:      data?.vitals?.pulse      ?? data?.pulse      ?? '(missing)',
        heart_rate: data?.vitals?.heart_rate ?? data?.heart_rate ?? '(missing)',
        hr:         data?.vitals?.hr         ?? data?.hr         ?? '(missing)',
        spo2:       data?.vitals?.spo2       ?? data?.spo2       ?? '(missing)',
        SpO2:       data?.vitals?.SpO2       ?? data?.SpO2       ?? '(missing)',
        timestamp:  data?.vitals?.timestamp  ?? data?.timestamp  ?? '(missing)',
      },
    });
  } catch (err) {
    return res.status(502).json({ error: String(err?.message || err) });
  }
});

app.get('/api/band/vitals', requireAuth, async (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  const cfg = getRtdbConfig();
  if (!cfg.databaseUrl) {
    return res.status(503).json({
      error: 'Band feed not configured',
      detail: 'Set FIREBASE_DATABASE_URL (and optionally FIREBASE_DB_SECRET) on the backend.',
    });
  }
  try {
    const data = await rtdbGetJson(cfg, `${cfg.prefix}/vitals`);

    // ── Field-name resolution ─────────────────────────────────────────────────
    // Arduino sketches use many different field names. Try them all.
    const resolveNum = (...keys) => {
      for (const k of keys) {
        const v = data?.[k];
        if (v !== undefined && v !== null && Number.isFinite(Number(v))) return Number(v);
      }
      return null;
    };

    const heartRate = resolveNum('heartRate', 'heart_rate', 'bpm', 'pulse', 'hr', 'BPM', 'HeartRate');
    const spo2     = resolveNum('spo2', 'SpO2', 'SPO2', 'sp02', 'oxygen', 'bloodOxygen');
    const accel    = resolveNum('accel', 'acceleration', 'accelMag', 'accelTotal', 'ax');
    const gyro     = resolveNum('gyro', 'gyroscope', 'gyroMag', 'gz');

    // ── Stale Data Detection ──────────────────────────────────────────────────
    // The Arduino's clock is 15 hours out of sync with the server, meaning
    // any timestamp calculation marks the data as heavily stale and hides the HR.
    // For now, we will trust the data in Firebase directly.
    let isStale = false;
    let dataAgeSeconds = null;

    const rawTs = data?.timestamp ?? data?.ts ?? data?.time ?? null;
    // We still extract the timestamp to pass to the frontend, but we DO NOT
    // enforce isStale = true anymore.
    if (rawTs !== null && rawTs !== undefined) {
      let tsMs = null;
      if (typeof rawTs === 'string') {
        const parsed = new Date(rawTs).getTime();
        if (!isNaN(parsed)) tsMs = parsed;
      } else if (typeof rawTs === 'number' && rawTs > 0) {
        tsMs = rawTs < 1e10 ? rawTs * 1000 : rawTs;
      }
      if (tsMs !== null) {
        const ageMs = Date.now() - tsMs;
        dataAgeSeconds = Math.round(ageMs / 1000);
      }
    }

    return res.json({
      fingerDetected: isStale ? false : Boolean(data?.fingerDetected ?? data?.finger ?? data?.fingerOn),
      heartRate: isStale ? null : heartRate,
      spo2:      isStale ? null : spo2,
      accel:     isStale ? null : accel,
      gyro:      isStale ? null : gyro,
      isSleeping: Boolean(data?.isSleeping ?? data?.sleeping ?? false),
      timestamp: rawTs ?? null,
      isStale,
      dataAgeSeconds,
      raw: data ?? null,
    });
  } catch (err) {
    return res.status(502).json({
      error: 'Failed to fetch band vitals',
      detail: IS_PRODUCTION ? undefined : String(err?.message || err),
    });
  }
});

app.get('/api/band/fall', requireAuth, async (_req, res) => {
  const cfg = getRtdbConfig();
  if (!cfg.databaseUrl) {
    return res.status(503).json({
      error: 'Band feed not configured',
      detail: 'Set FIREBASE_DATABASE_URL (and optionally FIREBASE_DB_SECRET) on the backend.',
    });
  }
  try {
    const data = await rtdbGetJson(cfg, `${cfg.prefix}/fall`);
    return res.json({
      detected: Boolean(data?.detected),
      timestamp: typeof data?.timestamp === 'string' ? data.timestamp : null,
      heartRate: Number.isFinite(Number(data?.heartRate)) ? Number(data?.heartRate) : null,
      spo2: Number.isFinite(Number(data?.spo2)) ? Number(data?.spo2) : null,
      raw: data ?? null,
    });
  } catch (err) {
    return res.status(502).json({
      error: 'Failed to fetch band fall status',
      detail: IS_PRODUCTION ? undefined : String(err?.message || err),
    });
  }
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
      details: [
        facilityName !== undefined ? `Facility Name: "${facilityName}"` : null,
        facilityId !== undefined ? `Facility ID: "${facilityId}"` : null,
      ].filter(Boolean).join(' — ') || 'No changes',
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

// ─── Sleep Window Settings ─────────────────────────────────────────────────────
app.get('/api/settings/sleep-window', requireAuth, async (_req, res) => {
  try {
    const rows = await db.all(
      `SELECT key, value FROM app_settings WHERE key IN ('sleep_window_start', 'sleep_window_end')`
    );
    const map = new Map(rows.map((r) => [String(r.key), String(r.value ?? '')]));
    return res.json({
      startHour: Number(map.get('sleep_window_start') ?? 21),
      endHour: Number(map.get('sleep_window_end') ?? 6),
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch sleep window settings' });
  }
});

app.put('/api/settings/sleep-window', requireAuth, requireRole('admin'), async (req, res) => {
  const { startHour, endHour } = req.body ?? {};
  const start = Number(startHour);
  const end   = Number(endHour);
  if (!Number.isInteger(start) || start < 0 || start > 23 ||
      !Number.isInteger(end)   || end   < 0 || end   > 23) {
    return res.status(400).json({ error: 'startHour and endHour must be integers 0–23' });
  }
  if (start === end) {
    return res.status(400).json({ error: 'Start and end hour cannot be the same' });
  }
  try {
    await db.run(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('sleep_window_start', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [String(start)]
    );
    await db.run(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('sleep_window_end', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [String(end)]
    );
    // Push to Firebase RTDB so the hardware picks it up automatically
    try {
      const cfg = getRtdbConfig();
      if (cfg.databaseUrl) {
        await rtdbSetJson(cfg, `${cfg.prefix}/config/sleepWindow`, {
          startHour: start,
          endHour: end,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (fbErr) {
      console.warn('[sleep-window] Firebase write failed:', fbErr?.message || fbErr);
      // Non-fatal — DB is source of truth, Firebase is for hardware sync
    }
    await logAudit({
      category: 'settings',
      action: 'Sleep window updated',
      req,
      details: `Sleep window set to ${start}:00 – ${end}:00 (24-hour)`,
    });
    return res.json({ startHour: start, endHour: end });
  } catch {
    return res.status(500).json({ error: 'Failed to update sleep window settings' });
  }
});

// ─── HR Threshold Settings ─────────────────────────────────────────────────────
app.get('/api/settings/hr-thresholds', requireAuth, async (_req, res) => {
  try {
    const keys = ['hr_warn_low', 'hr_warn_high', 'hr_crit_low', 'hr_crit_high'];
    const rows = await db.all(
      `SELECT key, value FROM app_settings WHERE key IN ('hr_warn_low','hr_warn_high','hr_crit_low','hr_crit_high')`
    );
    const map = new Map(rows.map((r) => [String(r.key), String(r.value ?? '')]));
    return res.json({
      warnLow:  Number(map.get('hr_warn_low')  ?? 60),
      warnHigh: Number(map.get('hr_warn_high') ?? 100),
      critLow:  Number(map.get('hr_crit_low')  ?? 45),
      critHigh: Number(map.get('hr_crit_high') ?? 130),
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch HR threshold settings' });
  }
});

app.put('/api/settings/hr-thresholds', requireAuth, requireRole('admin'), async (req, res) => {
  const { warnLow, warnHigh, critLow, critHigh } = req.body ?? {};
  const wl = Number(warnLow);
  const wh = Number(warnHigh);
  const cl = Number(critLow);
  const ch = Number(critHigh);

  if (!Number.isInteger(wl) || wl < 20 || wl > 200 ||
      !Number.isInteger(wh) || wh < 20 || wh > 250 ||
      !Number.isInteger(cl) || cl < 20 || cl > 200 ||
      !Number.isInteger(ch) || ch < 20 || ch > 250) {
    return res.status(400).json({ error: 'All HR thresholds must be integers between 20 and 250 bpm' });
  }
  if (cl >= wl) return res.status(400).json({ error: 'Critical low must be less than warning low' });
  if (wl >= wh) return res.status(400).json({ error: 'Warning low must be less than warning high' });
  if (wh >= ch) return res.status(400).json({ error: 'Warning high must be less than critical high' });

  try {
    const upsert = async (key, val) => db.run(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [key, String(val)]
    );
    await upsert('hr_warn_low',  wl);
    await upsert('hr_warn_high', wh);
    await upsert('hr_crit_low',  cl);
    await upsert('hr_crit_high', ch);

    // Push to Firebase RTDB so the hardware picks it up automatically
    try {
      const cfg = getRtdbConfig();
      if (cfg.databaseUrl) {
        await rtdbSetJson(cfg, `${cfg.prefix}/config/hrThresholds`, {
          warnLow:  wl,
          warnHigh: wh,
          critLow:  cl,
          critHigh: ch,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (fbErr) {
      console.warn('[hr-thresholds] Firebase write failed:', fbErr?.message || fbErr);
      // Non-fatal — DB is source of truth, Firebase is for hardware sync
    }

    await logAudit({
      category: 'settings',
      action: 'HR thresholds updated',
      req,
      details: `Warning: ${wl}–${wh} bpm — Critical: below ${cl} or above ${ch} bpm`,
    });
    return res.json({ warnLow: wl, warnHigh: wh, critLow: cl, critHigh: ch });
  } catch {
    return res.status(500).json({ error: 'Failed to update HR threshold settings' });
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

// Returns detailed info for one resident + their assigned caregiver (for family Health Records page)
app.get('/api/family/resident-info', requireAuth, requireRole('relative'), async (req, res) => {
  try {
    const residentPublicId = String(req.query.residentId || '').trim();
    const m = /^RES-(\d+)$/i.exec(residentPublicId);
    const dbId = m ? Number(m[1]) - 1000 : NaN;
    if (!Number.isFinite(dbId)) return res.status(400).json({ error: 'Invalid residentId' });

    const linked = await getFamilyLinkedResidents(req);
    if (!linked.includes(dbId)) return res.status(403).json({ error: 'Not authorized for this resident' });

    const row = await db.get(
      `SELECT r.id, r.name, r.room, r.status, r.profile_photo,
              r.date_of_birth, r.gender, r.medical_conditions AS condition,
              u.name          AS caregiver_name,
              u.profile_photo AS caregiver_photo,
              u.email         AS caregiver_email,
              u.phone         AS caregiver_phone
       FROM residents r
       LEFT JOIN users u ON u.id = r.caregiver_user_id AND u.role = 'caregiver'
       WHERE r.id = ? AND r.archived = 0`,
      [dbId]
    );
    if (!row) return res.status(404).json({ error: 'Resident not found' });
    return res.json(row);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch resident info' });
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
      details: `New resident profile: ${row.name}, Room ${row.room}, Status: ${row.status}, Caregiver: ${row.caregiver_name ?? 'Unassigned'}`,
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
      details: `Updated profile for ${row.name} — Room: ${row.room}, Status: ${row.status}, Caregiver: ${row.caregiver_name ?? 'Unassigned'}`,
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
      details: `Resident ID ${id} moved to archive`,
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
      details: `Permanently deleted resident: ${resident.name} (ID: ${id})`,
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
    const id = randomUUID();
    await db.run(
      `INSERT INTO care_tasks (id, caregiver_user_id, resident_ids, task_type, schedule_time, priority, notes, completed, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, datetime('now'), datetime('now'))`,
      [id, caregiverUserId, JSON.stringify(uniqueIds), taskType, scheduleTime, priority, notes ?? null]
    );
    await logAudit({
      category: 'task',
      action: 'Care task created',
      req,
      details: `Task "${taskType}" assigned to ${caregiver.name} for ${uniqueIds.length} resident(s)`,
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
      details: `Removed care task: ${task.task_type}`,
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
      details: `Task "${task.task_type}" marked as ${completed ? 'completed' : 'reopened'}`,
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

// ── SSE — Alert Stream Endpoint ────────────────────────────────────────────────────
app.get('/api/alerts/stream', requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  // Tell client to auto-reconnect after 3s if stream drops
  res.write('retry: 3000\n\n');

  const userId = String(req.user.sub);
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId).add(res);

  // Heartbeat so proxies don't close the connection
  const hb = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 25000);

  req.on('close', () => {
    clearInterval(hb);
    sseClients.get(userId)?.delete(res);
    if (sseClients.get(userId)?.size === 0) sseClients.delete(userId);
  });
});

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

// ── Medication duplicate prevention + allergy cross-check ───────────────────
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
  const id = randomUUID();
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

    // Allergy cross-check before creating
    const residentRecord = await db.get(
      'SELECT allergies FROM residents WHERE lower(trim(name)) = lower(trim(?)) AND archived = 0 LIMIT 1',
      [resolvedResidentName]
    );
    if (residentRecord?.allergies) {
      const allergyText = String(residentRecord.allergies).toLowerCase();
      const medName = medication.toLowerCase();
      const medWords = medName.split(/[\s,/\-]+/).filter((w) => w.length > 3);
      const hasConflict = allergyText.includes(medName) ||
        medWords.some((w) => allergyText.includes(w));
      if (hasConflict && !req.body?.overrideAllergyCheck) {
        return res.status(409).json({
          error: 'Allergy conflict detected',
          detail: `"${medication}" may conflict with recorded allergy: "${residentRecord.allergies}". Send overrideAllergyCheck: true to proceed.`,
          allergyConflict: true,
        });
      }
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
  const id = randomUUID();
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
      details: `Device "${row.device_id}" registered — Status: ${row.status}, Battery: ${row.battery}%`,
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
      details: `Device "${row.device_id}" updated — Status: ${row.status}, Assigned to: ${row.assigned_resident ?? 'None'}`,
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

app.patch('/api/alerts/:id', requireAuth, requireRole('admin', 'caregiver'), async (req, res) => {
  const { id } = req.params;
  const parsed = alertStatusSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const requestedStatus = parsed.data.status;
  try {
    const existing = await db.get('SELECT id, type, severity, resident, room, timestamp, status FROM alerts WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Alert not found' });

    const isFallAlert  = /fall/i.test(String(existing.type || ''));
    const isPulseAlert = /(pulse|tachycardia|bradycardia|heart rate)/i.test(String(existing.type || ''));
    const isSleepAlert = /(sleep|restless|spo2|apnea|awake at midnight|prolonged sleep)/i.test(String(existing.type || ''));

    // Fall alerts: treat acknowledge as resolve so future falls create fresh alerts
    const finalStatus = (isFallAlert && requestedStatus === 'acknowledged') ? 'resolved' : requestedStatus;

    const result = await db.run('UPDATE alerts SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [finalStatus, id]);
    if (!result.changes) return res.status(404).json({ error: 'Alert not found' });

    const row = await db.get('SELECT id, type, severity, resident, room, timestamp, status FROM alerts WHERE id = ?', [id]);
    if (!row) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Clear Firebase detected flag so the next hardware trigger fires a fresh notification
    if (isFallAlert && (finalStatus === 'acknowledged' || finalStatus === 'resolved')) {
      try {
        await clearBandFallState({ timestamp: row.timestamp });
      } catch (err) {
        console.error('[band-fall] Failed to clear RTDB state after alert acknowledgement:', err?.message || err);
      }
    }
    if (isPulseAlert && (finalStatus === 'acknowledged' || finalStatus === 'resolved')) {
      try {
        await clearBandUnusualPulseState();
      } catch (err) {
        console.error('[band-pulse] Failed to clear RTDB state after alert acknowledgement:', err?.message || err);
      }
    }
    if (isSleepAlert && (finalStatus === 'acknowledged' || finalStatus === 'resolved')) {
      try {
        await clearBandSleepAnomalyState();
      } catch (err) {
        console.error('[band-sleep] Failed to clear RTDB state after alert acknowledgement:', err?.message || err);
      }
    }

    await logAudit({
      category: 'incident',
      action: 'Alert status updated',
      req,
      details: `${row.type} alert for ${row.resident} — Status changed to: ${row.status}`,
    });
    return res.json(row);
  } catch {
    return res.status(500).json({ error: 'Failed to update alert' });
  }
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
            details: `${row.medication} for ${row.resident} marked as ${row.given ? 'Given' : 'Pending'}`,
          });
          return res.json({ ...row, given: Boolean(row.given) });
        });
    })
    .catch(() => res.status(500).json({ error: 'Failed to update medication' }));
});

const server = http.createServer(app);

// ── Missed Medication Checker (every 15 min) ────────────────────────────────────
async function checkMissedMedications() {
  try {
    const overdue = await db.all(`
      SELECT m.id, m.resident, m.medication, m.time
      FROM medications m
      WHERE m.given = 0
        AND m.time != 'As prescribed'
        AND m.time GLOB '[0-2][0-9]:[0-5][0-9]'
    `);

    // Use Philippine time (UTC+8)
    const nowPH = new Date(Date.now() + 8 * 3_600_000);
    const nowMinutes = nowPH.getUTCHours() * 60 + nowPH.getUTCMinutes();

    for (const med of overdue) {
      const [hStr, mStr] = String(med.time).split(':');
      const schedMinutes = Number(hStr) * 60 + Number(mStr);
      if (isNaN(schedMinutes)) continue;
      const lateMinutes = nowMinutes - schedMinutes;
      // Flag as missed if 30min–240min past scheduled time
      if (lateMinutes < 30 || lateMinutes > 240) continue;

      const existingAlert = await db.get(
        `SELECT id FROM alerts
         WHERE type = 'Missed Medication' AND resident = ?
           AND status = 'unacknowledged'
           AND details LIKE ?`,
        [med.resident, `%${med.medication}%`]
      );
      if (existingAlert) continue;

      const residentRow = await db.get(
        `SELECT room FROM residents WHERE lower(trim(name)) = lower(trim(?)) AND archived = 0 LIMIT 1`,
        [med.resident]
      );
      const alertId = randomUUID();
      await db.run(
        `INSERT INTO alerts (id, type, severity, resident, room, timestamp, status, created_at, updated_at)
         VALUES (?, 'Missed Medication', 'warning', ?, ?, ?, 'unacknowledged', datetime('now'), datetime('now'))`,
        [alertId, med.resident, residentRow?.room ?? 'N/A', new Date().toISOString()]
      );
      console.warn(`[med-check] Missed medication: ${med.medication} for ${med.resident} (${lateMinutes}min late)`);
      broadcastAlertUpdate({
        type: 'alert_created',
        alert: { id: alertId, type: 'Missed Medication', severity: 'warning', resident: med.resident, room: residentRow?.room ?? 'N/A', status: 'unacknowledged', timestamp: new Date().toISOString() },
      });
    }
  } catch (err) {
    console.error('[med-check] Failed:', err?.message || err);
  }
}

let fallPollTimer, vitalsPollTimer, pulsePollTimer, sleepPollTimer, medCheckTimer;

// --- Serve React Frontend in Production ---
const distPath = path.join(process.cwd(), 'build');
app.use(express.static(distPath));
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  void pollBandVitalsState();
  void pollBandFallState();
  void pollBandUnusualPulseState();
  void pollBandSleepAnomalyState();
  vitalsPollTimer = setInterval(() => void pollBandVitalsState(), BAND_VITALS_POLL_INTERVAL_MS);
  fallPollTimer   = setInterval(() => void pollBandFallState(),   BAND_FALL_POLL_INTERVAL_MS);
  pulsePollTimer  = setInterval(() => void pollBandUnusualPulseState(), BAND_FALL_POLL_INTERVAL_MS);
  sleepPollTimer  = setInterval(() => void pollBandSleepAnomalyState(), BAND_FALL_POLL_INTERVAL_MS);
  medCheckTimer   = setInterval(() => void checkMissedMedications(), 15 * 60_000);
  // Run first check after 1 min to avoid false positives on server start
  setTimeout(() => void checkMissedMedications(), 60_000);
});

server.on('error', (err) => {
  console.error('[server] Failed to start HTTP server:', err.message || err);
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[server] Port ${PORT} is already in use. Stop the other Node process or run with a different PORT.`
    );
  }
  process.exit(1);
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`[server] ${signal} received — shutting down gracefully...`);
  clearInterval(fallPollTimer);
  clearInterval(vitalsPollTimer);
  clearInterval(pulsePollTimer);
  clearInterval(sleepPollTimer);
  clearInterval(medCheckTimer);
  // Close all SSE connections
  for (const clients of sseClients.values()) {
    for (const res of clients) { try { res.end(); } catch {} }
  }
  server.close(async () => {
    try { await db.close(); } catch {}
    console.log('[server] Database closed. Goodbye.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT',  () => void shutdown('SIGINT'));
