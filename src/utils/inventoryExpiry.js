/** Parse inventory expiry (YYYY-MM-DD or YYYY-MM → last day of month). */
export const parseInventoryExpiryDate = (value) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const fromDate = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    fromDate.setHours(0, 0, 0, 0);
    return fromDate;
  }

  const raw = String(value || '').trim();
  if (!raw) return null;

  const exact = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (exact) {
    const year = Number(exact[1]);
    const month = Number(exact[2]);
    const day = Number(exact[3]);
    const date = new Date(year, month - 1, day);
    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    date.setHours(0, 0, 0, 0);
    return date;
  }

  const monthYear = raw.match(/^(\d{4})[-/](\d{1,2})$/);
  if (monthYear) {
    const year = Number(monthYear[1]);
    const month = Number(monthYear[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return null;
    }
    // Month-year expiry → last day of that month
    const date = new Date(year, month, 0);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  // Legacy/serialized Date strings, e.g. "Thu Aug 06 2026 00:00:00 GMT+0530 (IST)".
  // Without an explicit year these parse to a bogus date, so require one.
  if (!/\d{4}/.test(raw)) return null;

  const fallback = new Date(raw);
  if (Number.isNaN(fallback.getTime())) return null;
  fallback.setHours(0, 0, 0, 0);
  return fallback;
};

const startOfLocalDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Show expiry alerts for products expiring within this many days (inclusive). */
export const EXPIRY_WARN_WITHIN_DAYS = 30;

/**
 * Calendar days from today until expiry (0 = expires today, negative = expired).
 * Returns null when expiry is missing or unparseable.
 */
export const getDaysUntilInventoryExpiry = (value) => {
  const expiry = parseInventoryExpiryDate(value);
  if (!expiry) return null;
  const today = startOfLocalDay();
  const utcExpiry = Date.UTC(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((utcExpiry - utcToday) / 86400000);
};

/**
 * Expiry alert for UI: expired, or expiring within `warnWithinDays`.
 * Returns null when no expiry or expiry is more than warnWithinDays away.
 */
export const getInventoryExpiryAlert = (value, { warnWithinDays = EXPIRY_WARN_WITHIN_DAYS } = {}) => {
  const daysRemaining = getDaysUntilInventoryExpiry(value);
  if (daysRemaining === null) return null;

  if (daysRemaining < 0) {
    return {
      status: 'expired',
      daysRemaining,
      label: 'Expired',
    };
  }

  if (daysRemaining <= warnWithinDays) {
    const label =
      daysRemaining === 0
        ? 'Expires today'
        : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`;
    return {
      status: 'expiring_soon',
      daysRemaining,
      label,
    };
  }

  return null;
};

export const isInventoryExpired = (value) => {
  const expiry = parseInventoryExpiryDate(value);
  if (!expiry) return false;
  return expiry.getTime() < startOfLocalDay().getTime();
};

export const formatInventoryExpiryDisplay = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const expiry = parseInventoryExpiryDate(raw);
  if (!expiry) return raw;
  try {
    return expiry.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return raw.slice(0, 10);
  }
};

export const normalizeExpiryInput = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const monthYear = trimmed.match(/^(\d{4})[-/](\d{1,2})$/);
  if (!monthYear) return '';
  const year = Number(monthYear[1]);
  const month = Number(monthYear[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return '';
  }
  return `${year}-${String(month).padStart(2, '0')}`;
};

/** Normalize any expiry input to `YYYY-MM-DD` (or `YYYY-MM`), else null. */
export const toExpiryDateOnly = (value) => {
  const raw = value instanceof Date ? value : String(value ?? '').trim();
  if (!(raw instanceof Date) && !raw) return null;

  if (typeof raw === 'string') {
    const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoPrefix) return isoPrefix[1];
    const normalizedMonth = normalizeExpiryInput(raw);
    if (normalizedMonth) return normalizedMonth;
  }

  const parsed = parseInventoryExpiryDate(raw);
  if (!parsed) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getItemExpiryValue = (item) =>
  item?.expiry_date ||
  item?.expiryDate ||
  item?.expiry ||
  '';
