function normalizeDbUrl(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  return s.replace(/\/$/, '');
}

function normalizePath(p) {
  let s = String(p || '').trim();
  if (!s) return '/';
  if (!s.startsWith('/')) s = `/${s}`;
  return s;
}

export function getRtdbConfig() {
  const databaseUrl =
    normalizeDbUrl(process.env.FIREBASE_DATABASE_URL) ||
    normalizeDbUrl(process.env.FIREBASE_RTDB_URL) ||
    null;
  const secret =
    String(process.env.FIREBASE_DB_SECRET || process.env.FIREBASE_DATABASE_SECRET || '').trim() || null;
  const prefix = normalizePath(process.env.FIREBASE_RTDB_PREFIX || '/safeband');
  return { databaseUrl, secret, prefix };
}

export function buildRtdbUrl({ databaseUrl, secret }, path) {
  if (!databaseUrl) throw new Error('Missing FIREBASE_DATABASE_URL');
  const p = normalizePath(path).replace(/\/$/, '');
  const auth = secret ? `?auth=${encodeURIComponent(secret)}` : '';
  return `${databaseUrl}${p}.json${auth}`;
}

export async function rtdbGetJson(config, path) {
  const url = buildRtdbUrl(config, path);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const msg = text?.slice(0, 300) || `RTDB request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

export async function rtdbSetJson(config, path, value) {
  const url = buildRtdbUrl(config, path);
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const msg = text?.slice(0, 300) || `RTDB write failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

