/** Parse inventory expiry (YYYY-MM-DD or YYYY-MM → last day of month). */
export const parseInventoryExpiryDate = (value) => {
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

export const getItemExpiryValue = (item) =>
  item?.expiry_date ||
  item?.expiryDate ||
  item?.expiry ||
  '';
