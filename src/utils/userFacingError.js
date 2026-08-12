/**
 * Maps raw API / fetch failures to short, non-technical copy for store staff.
 */

import { showAppDialog } from '../context/DialogContext';

const NETWORK_HINTS = [
  'network request failed',
  'failed to fetch',
  'network error',
  'network_error',
  'internet',
  'offline',
  'connection',
  'econnrefused',
  'enotfound',
  'etimedout',
  'econnreset',
  'socket',
];

const TIMEOUT_HINTS = [
  'request timed out',
  'timed out',
  'timeout',
  'aborted',
  'abort',
];

const normalizeErrorText = (error) => {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  if (typeof error?.message === 'string') return error.message;
  if (typeof error?.error === 'string') return error.error;
  try {
    return String(error);
  } catch (_) {
    return '';
  }
};

export const isTimeoutError = (error) => {
  const text = normalizeErrorText(error).toLowerCase();
  const name = String(error?.name || '').toLowerCase();
  if (name === 'aborterror') return true;
  return TIMEOUT_HINTS.some((hint) => text.includes(hint));
};

export const isNetworkError = (error) => {
  if (isTimeoutError(error)) return true;
  const text = normalizeErrorText(error).toLowerCase();
  if (!text) return false;
  if (text === 'http_408' || text === 'http_429') return true;
  if (text.startsWith('http_')) return false;
  return NETWORK_HINTS.some((hint) => text.includes(hint));
};

/**
 * @param {unknown} error
 * @param {{ action?: string }} [options]
 * @returns {{ kind: 'network' | 'timeout' | 'server' | 'generic', title: string, message: string }}
 */
export const getUserFacingError = (error, options = {}) => {
  const action = options.action || 'complete this action';
  const text = normalizeErrorText(error);
  const lower = text.toLowerCase();

  if (isTimeoutError(error) || lower.includes('slow')) {
    return {
      kind: 'timeout',
      title: 'Connection is slow',
      message:
        'Your internet connection is slow or the server is taking too long to respond. Please try again in a moment.',
    };
  }

  if (isNetworkError(error) || lower === 'network_error' || lower === 'empty_body') {
    return {
      kind: 'network',
      title: 'No internet connection',
      message:
        'Please check your Wi‑Fi or mobile data and try again. Orders will refresh automatically when you are back online.',
    };
  }

  if (lower.startsWith('http_5') || lower === 'invalid_json') {
    return {
      kind: 'server',
      title: 'Server unavailable',
      message:
        'We could not reach the server right now. Please wait a moment and try again.',
    };
  }

  if (lower.startsWith('http_4') || lower === 'no_store') {
    return {
      kind: 'server',
      title: 'Unable to load data',
      message: 'Something went wrong while loading. Please try again. If this continues, contact support.',
    };
  }

  // Never surface raw TypeErrors / stack fragments to store staff.
  const looksTechnical =
    !text ||
    /typeerror|syntaxerror|referenceerror|stack|exception|undefined is not|null is not|failed to fetch|http_/i.test(
      text
    );

  return {
    kind: 'generic',
    title: 'Something went wrong',
    message: looksTechnical
      ? `We could not ${action}. Please try again. If the problem continues, check your connection or contact support.`
      : text,
  };
};

export const showUserFacingErrorDialog = async (error, options = {}) => {
  const { title, message, kind } = getUserFacingError(error, options);
  const variant = kind === 'network' || kind === 'timeout' ? 'warning' : 'error';
  const icon =
    kind === 'network' || kind === 'timeout' ? 'cloud-offline-outline' : 'alert-circle';

  return showAppDialog(title, message, [{ text: 'OK' }], { variant, icon });
};
