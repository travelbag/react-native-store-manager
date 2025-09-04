// API Configuration
export const API_CONFIG = {
  // Replace with your actual backend URL
  BASE_URL: 'http://10.0.2.2:8080/api',
    //BASE_URL: 'http://localhost:8080/api',

  
  // Store Manager Configuration - will be set from logged in user
  STORE_MANAGER_ID: null, // Set after login
  STORE_ID: null, // Set after login
  USE_FIREBASE: true,
  // API Endpoints
  ENDPOINTS: {
    LOGIN: '/store-managers/login',
    VERIFY_TOKEN: '/store-managers/verify',
    REGISTER_TOKEN: '/store-managers/{id}/register-token',
    ORDERS: '/api/orders',
    ORDER_DETAILS: '/orders', // /{orderId}
    UPDATE_ORDER_STATUS: '/orders', // /{orderId}/status
  },
  
  // Demo mode - set to false in production
  DEMO_MODE: true,
  DEMO_INTERVAL: 45000, // 45 seconds
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
