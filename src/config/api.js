// API Configuration
const DEFAULT_PRODUCTION_BASE_URL = 'https://ubgukf7hdu.us-east-1.awsapprunner.com/api';

/** LAN backend (Mac IP + API port). Change port if your server uses something other than 8080. */
const LOCAL_API_BASE_URL = 'http://192.168.1.253:8080/api';

/**
 * Set `false` to hit production (`DEFAULT_PRODUCTION_BASE_URL`).
 * Override either URL with `EXPO_PUBLIC_API_BASE_URL` in `.env` (highest priority).
 */
const USE_LOCAL_DEVELOPMENT = false;

function resolveBaseUrl() {
  const envOverride = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envOverride) {
    return envOverride;
  }
  if (USE_LOCAL_DEVELOPMENT) {
    return LOCAL_API_BASE_URL;
  }
  return DEFAULT_PRODUCTION_BASE_URL;
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
