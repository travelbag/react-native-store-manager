// Globally augment fetch to automatically attach Authorization header with token
// for all requests targeting our API base URL.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from './api';

let installed = false;

export function setupAuthFetch() {
  if (installed) return;
  installed = true;

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
      return originalFetch(input, nextInit);
    } catch (e) {
      // In case of any interceptor error, fall back to the original fetch
      return originalFetch(input, init);
    }
  };
}
