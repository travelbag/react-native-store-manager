// Globally augment fetch to automatically attach Authorization header with token
// for all requests targeting our API base URL.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, buildApiUrl } from './api';

let installed = false;
let logoutCallback = null;
let isRefreshing = false;
let refreshPromise = null;

export function setupAuthFetch(onUnauthorized) {
  if (installed) return;
  installed = true;

  logoutCallback = onUnauthorized;

  const originalFetch = global.fetch;

  global.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url;

      // Only apply to our backend API requests
      const shouldAttach = typeof url === 'string' && url.startsWith(API_CONFIG.BASE_URL);
      if (!shouldAttach) {
        return originalFetch(input, init);
      }

      // Create a mutable Headers instance from existing headers
      const headers = new Headers(init?.headers || {});

      // Attach Authorization if not already present and token exists
      if (!headers.has('Authorization')) {
        const token = await AsyncStorage.getItem('authToken');
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      }

      // Ensure Content-Type for JSON bodies when not set
      const hasBody = typeof init?.body !== 'undefined' && init.body !== null;
      if (hasBody && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const nextInit = { ...init, headers };
      const response = await originalFetch(input, nextInit);

      // Handle 401 Unauthorized - JWT expired or invalid (skip for login/refresh requests)
      const isLoginRequest = typeof url === 'string' && url.includes('/login');
      const isRefreshRequest = typeof url === 'string' && url.includes('/refresh');
      
      if (response.status === 401 && !isLoginRequest && !isRefreshRequest) {
        console.log('🔒 401 Unauthorized - Attempting token refresh...');
        
        try {
          // Attempt to refresh the token
          const newToken = await refreshToken();
          
          if (newToken) {
            console.log('✅ Token refreshed successfully, retrying request...');
            // Update headers with new token
            headers.set('Authorization', `Bearer ${newToken}`);
            const retryInit = { ...init, headers };
            // Retry the original request with new token
            return originalFetch(input, retryInit);
          } else {
            // Refresh failed, logout
            console.log('❌ Token refresh failed, logging out...');
            await AsyncStorage.multiRemove(['authToken', 'managerData']);
            if (logoutCallback) {
              setTimeout(() => logoutCallback(), 100);
            }
          }
        } catch (error) {
          console.error('❌ Error during token refresh:', error);
          await AsyncStorage.multiRemove(['authToken', 'managerData']);
          if (logoutCallback) {
            setTimeout(() => logoutCallback(), 100);
          }
        }
      }

      return response;
    } catch (e) {
      // In case of any interceptor error, fall back to the original fetch
      return originalFetch(input, init);
    }
  };
}

export function setLogoutCallback(callback) {
  logoutCallback = callback;
}

// Refresh the access token using the refresh endpoint
async function refreshToken() {
  // Prevent multiple simultaneous refresh attempts
  if (isRefreshing) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const currentToken = await AsyncStorage.getItem('authToken');
      if (!currentToken) {
        return null;
      }

      const refreshUrl = buildApiUrl(API_CONFIG.ENDPOINTS.REFRESH_TOKEN);
      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const newToken = data.token || data.accessToken;
        
        if (newToken) {
          // Store the new token
          await AsyncStorage.setItem('authToken', newToken);
          return newToken;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Token refresh error:', error);
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
