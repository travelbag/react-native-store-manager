// API Configuration
export const API_CONFIG = {
  // Replace with your actual backend URL
  // BASE_URL: 'http://192.168.1.204:8080/api', //home
  //BASE_URL: 'http://192.168.1.211:8080/api', // dot it
    //BASE_URL: 'http://localhost:8080/api',
  BASE_URL: 'https://ubgukf7hdu.us-east-1.awsapprunner.com/api',

  
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

// Helper function to get headers with authentication (deprecated - use AuthContext.getAuthHeaders instead)
export const getAuthHeaders = () => {
  console.warn('getAuthHeaders from api.js is deprecated. Use AuthContext.getAuthHeaders instead');
  return {
    'Content-Type': 'application/json',
  };
};

// Helper function to build API URL
export const buildApiUrl = (endpoint, params = '') => {
  return `${API_CONFIG.BASE_URL}${endpoint}${params}`;
};
