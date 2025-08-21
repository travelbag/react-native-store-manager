// API Configuration
export const API_CONFIG = {
  // Replace with your actual backend URL
  BASE_URL: 'https://your-api-domain.com/api',
  
  // Store Manager Configuration
  STORE_MANAGER_ID: 'SM_001', // Replace with actual store manager ID
  STORE_ID: 'STORE_001', // Replace with actual store ID
  
  // API Endpoints
  ENDPOINTS: {
    REGISTER_TOKEN: '/store-managers/register-token',
    ORDERS: '/orders',
    ORDER_DETAILS: '/orders', // /{orderId}
    UPDATE_ORDER_STATUS: '/orders', // /{orderId}/status
  },
  
  // Demo mode - set to false in production
  DEMO_MODE: true,
  DEMO_INTERVAL: 45000, // 45 seconds
};

// Helper function to get headers with authentication
export const getAuthHeaders = () => {
  // Replace with your actual authentication logic
  const authToken = null; // Get from secure storage or state
  
  return {
    'Content-Type': 'application/json',
    ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
  };
};

// Helper function to build API URL
export const buildApiUrl = (endpoint, params = '') => {
  return `${API_CONFIG.BASE_URL}${endpoint}${params}`;
};
