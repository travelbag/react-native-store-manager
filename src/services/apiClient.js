import { API_CONFIG, buildApiUrl } from '../config/api';
import {
  getAccessToken,
  hydrateAuthSession,
  refreshAuthSession,
} from '../auth/authSession';

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value);

const isJsonBody = (body) =>
  body &&
  typeof body === 'object' &&
  !(typeof FormData !== 'undefined' && body instanceof FormData) &&
  !(typeof Blob !== 'undefined' && body instanceof Blob) &&
  !(typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer);

const shouldRetryUnauthorized = ({ response, url, requiresAuth, retryOn401, hasRetried }) => {
  if (response.status !== 401 || requiresAuth === false || retryOn401 === false || hasRetried) {
    return false;
  }

  return !url.includes(API_CONFIG.ENDPOINTS.LOGIN) && !url.includes(API_CONFIG.ENDPOINTS.REFRESH_TOKEN);
};

const buildRequestUrl = (endpoint) => (isAbsoluteUrl(endpoint) ? endpoint : buildApiUrl(endpoint));

const buildHeaders = async (headers, requiresAuth) => {
  const nextHeaders = new Headers(headers || {});

  if (requiresAuth !== false) {
    await hydrateAuthSession();
    const accessToken = getAccessToken();

    if (accessToken && !nextHeaders.has('Authorization')) {
      nextHeaders.set('Authorization', `Bearer ${accessToken}`);
    }
  }

  return nextHeaders;
};

const buildBody = (body, headers) => {
  if (typeof body === 'undefined' || body === null) {
    return undefined;
  }

  if (isJsonBody(body)) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return JSON.stringify(body);
  }

  return body;
};

async function request(endpoint, options = {}) {
  const {
    method = 'GET',
    headers,
    body,
    requiresAuth = true,
    retryOn401 = true,
    _hasRetried = false,
    ...rest
  } = options;

  const url = buildRequestUrl(endpoint);
  const requestHeaders = await buildHeaders(headers, requiresAuth);
  const requestBody = buildBody(body, requestHeaders);

  const response = await fetch(url, {
    ...rest,
    method,
    headers: requestHeaders,
    body: requestBody,
  });

  if (
    shouldRetryUnauthorized({
      response,
      url,
      requiresAuth,
      retryOn401,
      hasRetried: _hasRetried,
    })
  ) {
    const refreshedToken = await refreshAuthSession({ force: true });

    if (refreshedToken) {
      const retryHeaders = new Headers(headers || {});
      retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);

      if (isJsonBody(body) && !retryHeaders.has('Content-Type')) {
        retryHeaders.set('Content-Type', 'application/json');
      }

      return request(endpoint, {
        ...rest,
        method,
        headers: retryHeaders,
        body: requestBody,
        requiresAuth,
        retryOn401,
        _hasRetried: true,
      });
    }
  }

  return response;
}

export const apiClient = {
  request,
  get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, options = {}) => request(endpoint, { ...options, method: 'POST' }),
  put: (endpoint, options = {}) => request(endpoint, { ...options, method: 'PUT' }),
  patch: (endpoint, options = {}) => request(endpoint, { ...options, method: 'PATCH' }),
  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),
};
