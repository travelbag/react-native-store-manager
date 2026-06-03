import * as FileSystem from 'expo-file-system';
import { API_CONFIG } from '../config/api';
import { getAccessToken, hydrateAuthSession } from '../auth/authSession';

const LOCALHOST_ORIGIN_PATTERN = /^https?:\/\/(?:localhost|127(?:\.\d{1,3}){0,3}|0\.0\.0\.0)(?::\d+)?/i;
const IMAGE_EXT_PATTERN = /\.(png|jpe?g|webp|gif|bmp|heic)$/i;

function isLoopbackHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h || h === 'localhost') return true;
  if (h === '0.0.0.0') return true;
  if (h.startsWith('127.')) return true;
  return false;
}

function parseOriginFromBaseUrl(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  try {
    return new URL(base).origin;
  } catch {
    return '';
  }
}

/** Prefer a LAN/prod origin so physical devices never hit localhost from backend URLs. */
function getReachableApiOrigin() {
  const configuredOrigin = parseOriginFromBaseUrl(API_CONFIG.BASE_URL);
  if (configuredOrigin && !isLoopbackHost(new URL(configuredOrigin).hostname)) {
    return configuredOrigin;
  }

  const envCandidates = [
    process.env.EXPO_PUBLIC_LOCAL_API_BASE_URL,
    process.env.EXPO_PUBLIC_PROD_API_BASE_URL,
    process.env.EXPO_PUBLIC_MEDIA_BASE_URL,
  ];

  for (const candidate of envCandidates) {
    const origin = parseOriginFromBaseUrl(candidate);
    if (!origin) continue;
    try {
      if (!isLoopbackHost(new URL(origin).hostname)) return origin;
    } catch {
      // ignore invalid env URL
    }
  }

  return configuredOrigin;
}

/**
 * Backend often returns upload URLs with localhost; on a device that must use the app API host.
 */
export function resolveMediaUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';

  const origin = getReachableApiOrigin();
  if (!origin) return raw;

  if (LOCALHOST_ORIGIN_PATTERN.test(raw)) {
    const pathAndQuery = raw.replace(LOCALHOST_ORIGIN_PATTERN, '');
    return `${origin}${pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`}`;
  }

  if (raw.startsWith('/')) {
    const base = String(API_CONFIG.BASE_URL || '').trim().replace(/\/+$/, '');
    if (raw.startsWith('/api/') && base.endsWith('/api')) {
      return `${origin}${raw}`;
    }
    return `${base}${raw}`;
  }

  try {
    const parsed = new URL(raw);
    if (isLoopbackHost(parsed.hostname)) {
      return `${origin}${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // not a valid absolute URL
  }

  return raw;
}

export function resolvePrintItemUrl(item) {
  return resolveMediaUrl(
    item?.fileUrl ||
      item?.file_url ||
      item?.printUrl ||
      item?.print_url ||
      item?.document_url ||
      item?.documentUrl ||
      ''
  );
}

export function getPrintItemFileName(item) {
  return item?.fileName || item?.file_name || item?.item_name || item?.name || 'Document';
}

function decodeObjectKeyFromUrl(url) {
  try {
    const parsed = new URL(url, 'http://placeholder.local');
    const objectKey =
      parsed.searchParams.get('objectKey') ||
      parsed.searchParams.get('object_key') ||
      parsed.searchParams.get('key') ||
      '';
    return objectKey ? decodeURIComponent(objectKey) : '';
  } catch {
    return '';
  }
}

export function getMediaFileExtension(url, fileName = '') {
  const name = String(fileName || '').trim();
  if (name.includes('.')) {
    const ext = name.split('.').pop();
    if (ext) return ext.toLowerCase();
  }

  const objectKey = decodeObjectKeyFromUrl(url);
  if (objectKey.includes('.')) {
    const ext = objectKey.split('.').pop();
    if (ext) return ext.toLowerCase();
  }

  const pathPart = String(url || '').split('?')[0];
  if (pathPart.includes('.')) {
    const ext = pathPart.split('.').pop();
    if (ext) return ext.toLowerCase();
  }

  return '';
}

export function isImageMediaUrl(url, fileName = '') {
  const objectKey = decodeObjectKeyFromUrl(url);
  const candidates = [
    String(fileName || ''),
    objectKey,
    String(url || '').split('?')[0],
    String(url || ''),
  ];
  return candidates.some((part) => IMAGE_EXT_PATTERN.test(String(part || '').toLowerCase()));
}

export async function getMediaAuthHeaders() {
  await hydrateAuthSession();
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function sanitizeFileName(name) {
  return String(name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (b1 << 16) | (b2 << 8) | b3;
    output += table[(triplet >> 18) & 63];
    output += table[(triplet >> 12) & 63];
    output += i + 1 < bytes.length ? table[(triplet >> 6) & 63] : '=';
    output += i + 2 < bytes.length ? table[triplet & 63] : '=';
  }
  return output;
}

async function fetchMediaToLocal(resolvedUrl, localUri, headers) {
  const response = await fetch(resolvedUrl, { headers });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  await FileSystem.writeAsStringAsync(localUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return localUri;
}

/**
 * Download a remote print/upload file to local storage (with auth when available).
 */
export async function downloadMediaToLocal(url, fileName) {
  const resolvedUrl = resolveMediaUrl(url);
  if (!resolvedUrl) throw new Error('File URL is missing');
  if (resolvedUrl.startsWith('file://')) return resolvedUrl;

  const safeName = sanitizeFileName(fileName);
  const ext = getMediaFileExtension(resolvedUrl, fileName);
  const nameWithExt =
    ext && !safeName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
      ? `${safeName}.${ext}`
      : safeName;
  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDir) throw new Error('No local storage available');

  const localUri = `${baseDir}${Date.now()}_${nameWithExt}`;
  const headers = await getMediaAuthHeaders();

  try {
    const result = await FileSystem.downloadAsync(resolvedUrl, localUri, { headers });
    if (result?.uri && (result.status == null || result.status < 400)) {
      return result.uri;
    }
    if (result?.status != null && result.status >= 400) {
      throw new Error(`Download failed (${result.status})`);
    }
  } catch (downloadError) {
    if (__DEV__) {
      console.warn('⚠️ FileSystem.downloadAsync failed, trying fetch fallback:', {
        message: downloadError?.message,
        resolvedUrl,
      });
    }
    try {
      return await fetchMediaToLocal(resolvedUrl, localUri, headers);
    } catch (fetchError) {
      const detail = fetchError?.message || downloadError?.message || 'Unknown error';
      throw new Error(`${detail} (${resolvedUrl})`);
    }
  }

  throw new Error(`Download failed (${resolvedUrl})`);
}
