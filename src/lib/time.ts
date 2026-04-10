const PH_TIME_ZONE = 'Asia/Manila';
const DEFAULT_LOCALE = 'en-PH';

export function formatPHDateTime(value: string | number | Date, options: Intl.DateTimeFormatOptions = {}) {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value ?? '');
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: PH_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...options,
  }).format(d);
}

export function formatPHDate(value: string | number | Date, options: Intl.DateTimeFormatOptions = {}) {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value ?? '');
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: PH_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    ...options,
  }).format(d);
}

export function formatPHTime(value: string | number | Date, options: Intl.DateTimeFormatOptions = {}) {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value ?? '');
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: PH_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...options,
  }).format(d);
}
