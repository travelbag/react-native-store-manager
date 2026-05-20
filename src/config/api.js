// API Configuration
const USE_LOCAL_API = process.env.EXPO_PUBLIC_USE_LOCAL_API?.trim().toLowerCase() === 'true';

const API_BASE_URLS = {
  local: process.env.EXPO_PUBLIC_LOCAL_API_BASE_URL?.trim(),
  prod: process.env.EXPO_PUBLIC_PROD_API_BASE_URL?.trim(),
};

function resolveBaseUrl() {
  const apiTarget = USE_LOCAL_API ? 'local' : 'prod';
  const API_BASE_URL = API_BASE_URLS[apiTarget];

  if (!API_BASE_URL) {
    throw new Error(`Missing ${apiTarget} API base URL. Check your environment variables.`);
  }

  return API_BASE_URL.replace(/\/+$/, '');
}

export const API_CONFIG = {
  BASE_URL: resolveBaseUrl(),
  // Store Manager Configuration - will be set from logged in user
  STORE_MANAGER_ID: null, // Set after login
  STORE_ID: null, // Set after login
  USE_FIREBASE: true,
  // API Endpoints
  ENDPOINTS: {
    LOGIN: '/store-managers/login',
    REFRESH_TOKEN: '/auth/refresh',
    VERIFY_TOKEN: '/store-managers/verify',
    REGISTER_TOKEN: '/store-managers/{id}/register-token',
    // Keep endpoints relative to BASE_URL (which already ends with /api)
    ORDERS: '/orders',
    ORDER_DETAILS: '/orders', // /{orderId}
    UPDATE_ORDER_STATUS: '/orders', // /{orderId}/status
    // Persist item-level scan state
    UPDATE_ITEM_SCAN: '/orders', // /{orderId}/items/{barcode}/scan
  },
  
  // Demo mode - set to false in production
  DEMO_MODE: true,
  DEMO_INTERVAL: 45000, // 45 seconds
  // Polling interval for foreground order sync (ms)
  // Reduced from 10000 -> 5000 to achieve ~5s polling cadence
  POLL_INTERVAL: 5000,
};

// Helper function to build API URL
export const buildApiUrl = (endpoint, params = '') => {
  return `${API_CONFIG.BASE_URL}${endpoint}${params}`;
};
