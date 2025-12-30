// Globally augment fetch to automatically attach Authorization header with token
// for all requests targeting our API base URL.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, buildApiUrl } from './api';

let installed = false;
let logoutCallback = null;
let isRefreshing = false;
let refreshPromise = null;
let originalFetch = null; // Store reference to original fetch

export function setupAuthFetch(onUnauthorized) {
  if (installed) return;
  installed = true;

  logoutCallback = onUnauthorized;

  originalFetch = global.fetch; // Store for use in refreshToken

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
      console.log('Response Status:', response.status, 'for URL:', url);
      console.log('Is Login Request:', isLoginRequest, 'Is Refresh Request:', isRefreshRequest);
      //console.log('Response Headers:', Array.from(response.headers.entries()));
      console.log('isRefreshRequest',isRefreshRequest);
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
            await AsyncStorage.multiRemove(['authToken', 'refreshToken', 'managerData']);
            if (logoutCallback) {
              setTimeout(() => logoutCallback(), 100);
            }
          }
        } catch (error) {
          console.error('❌ Error during token refresh:', error);
          await AsyncStorage.multiRemove(['authToken', 'refreshToken', 'managerData']);
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
      const refreshTokenStored = await AsyncStorage.getItem('refreshToken');
      
      // Use refresh token if available, otherwise fall back to access token
      const tokenToRefresh = refreshTokenStored || currentToken;
      
      if (!tokenToRefresh) {
        console.log('❌ No token available for refresh');
        return null;
      }

      const refreshUrl = buildApiUrl(API_CONFIG.ENDPOINTS.REFRESH_TOKEN);
      console.log('🔄 Refreshing token using:', refreshUrl);
      console.log('🔄 Refresh token available:', !!refreshTokenStored);
      console.log('🔄 Sending refresh token:', tokenToRefresh?.substring(0, 20) + '...');
      
      const requestBody = { refreshToken: tokenToRefresh };
      console.log('🔄 Request body:', JSON.stringify(requestBody).substring(0, 50) + '...');
      
      // Use originalFetch to bypass the interceptor and prevent infinite loop
      const response = await originalFetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Also try sending in x-refresh-token header as backend checks both
          'x-refresh-token': tokenToRefresh,
        },
        body: JSON.stringify(requestBody),
      });

      console.log('🔄 Refresh response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('🔄 Refresh response data:', data);
        // Backend returns 'accessToken' field
        const newToken = data.accessToken || data.token || data.authToken;
        
        if (newToken) {
          // Store the new access token
          await AsyncStorage.setItem('authToken', newToken);
          
          // Store new refresh token if provided
          if (data.refreshToken) {
            await AsyncStorage.setItem('refreshToken', data.refreshToken);
          }
          
          console.log('✅ New token stored successfully');
          return newToken;
        } else {
          console.log('❌ No token found in response:', data);
        }
      } else {
        let errorDetail;
        try {
          errorDetail = await response.json();
          console.log('❌ Refresh failed:', response.status, errorDetail);
          
          // Check if it's a refresh token expiration
          if (errorDetail.error === 'refresh_token_expired' || errorDetail.error === 'invalid_refresh_token') {
            console.log('🔒 Refresh token expired or invalid - clearing tokens and logging out');
            // Clear all tokens since refresh token is invalid
            await AsyncStorage.multiRemove(['authToken', 'refreshToken', 'managerData']);
          }
        } catch {
          const errorText = await response.text();
          console.log('❌ Refresh failed with status:', response.status, 'body:', errorText);
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
