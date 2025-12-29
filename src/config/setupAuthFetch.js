// Globally augment fetch to automatically attach Authorization header with token
// for all requests targeting our API base URL.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from './api';

let installed = false;
let logoutCallback = null;

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

      // Handle 401 Unauthorized - JWT expired or invalid (skip for login requests)
      const isLoginRequest = typeof url === 'string' && url.includes('/login');
      if (response.status === 401 && !isLoginRequest) {
        console.log('🔒 401 Unauthorized - Token expired or invalid, logging out...');
        
        // Clear stored auth data
        await AsyncStorage.multiRemove(['authToken', 'managerData']);
        
        // Trigger logout callback if provided
        if (logoutCallback) {
          logoutCallback();
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
