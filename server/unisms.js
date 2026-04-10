/**
 * UniSMS — https://unismsapi.com/docs/sms
 */

const UNISMS_BASE = 'https://unismsapi.com/api';

function getSecret() {
  return process.env.UNISMS_API_SECRET || process.env.UNISMS_SECRET || '';
}

/** UniSMS may return Laravel-style JSON: { message, errors: { field: [...] } } or { error: "..." }. */
function formatUnismsErrorBody(body, status) {
  if (typeof body === 'string') {
    const t = body.trim();
    return t || `HTTP ${status}`;
  }
  if (!body || typeof body !== 'object') {
    return `HTTP ${status}`;
  }
  if (typeof body.message === 'string' && body.message.trim()) {
    return body.message.trim();
  }
  if (typeof body.error === 'string' && body.error.trim()) {
    return body.error.trim();
  }
  if (body.errors && typeof body.errors === 'object') {
    const parts = [];
    for (const [key, val] of Object.entries(body.errors)) {
      if (Array.isArray(val)) {
        val.forEach((v) => parts.push(`${key}: ${v}`));
      } else if (val != null) {
        parts.push(`${key}: ${val}`);
      }
    }
    if (parts.length) return parts.join('; ');
  }
  try {
    return JSON.stringify(body);
  } catch {
    return `HTTP ${status}`;
  }
}

/**
 * @param {{ recipient: string; content: string; senderId?: string; metadata?: Record<string, unknown> }} opts
 */
export async function sendUnismsSms(opts) {
  const secret = getSecret();
  if (!secret) {
    return { ok: false, status: 0, body: null, error: 'UNISMS_API_SECRET not set' };
  }

  const auth = Buffer.from(`${secret}:`, 'utf8').toString('base64');
  const senderRaw = process.env.UNISMS_SENDER_ID || opts.senderId;
  const senderId =
    typeof senderRaw === 'string' ? senderRaw.trim() || undefined : senderRaw || undefined;
  const payload = {
    recipient: opts.recipient,
    content: opts.content.slice(0, 160),
    ...(senderId ? { sender_id: senderId } : {}),
    ...(opts.metadata && Object.keys(opts.metadata).length ? { metadata: opts.metadata } : {}),
  };

  let res;
  try {
    res = await fetch(`${UNISMS_BASE}/sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ok: false, status: 0, body: null, error: String(e?.message || e) };
  }

  const text = await res.text();
  let body = null;
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    return { ok: false, status: res.status, body, error: formatUnismsErrorBody(body, res.status) };
  }

  return { ok: true, status: res.status, body };
}

export function hasUnismsCredentials() {
  return Boolean(getSecret());
}
