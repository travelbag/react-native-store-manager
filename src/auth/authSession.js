import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, buildApiUrl } from '../config/api';

const STORAGE_KEYS = {
  accessToken: 'authToken',
  refreshToken: 'refreshToken',
  manager: 'managerData',
};

const emptySession = {
  accessToken: null,
  refreshToken: null,
  manager: null,
  hydrated: false,
};

let currentSession = { ...emptySession };
let hydratePromise = null;
let refreshPromise = null;
const listeners = new Set();

const cloneSession = (session = currentSession) => ({
  accessToken: session.accessToken ?? null,
  refreshToken: session.refreshToken ?? null,
  manager: session.manager ?? null,
  hydrated: Boolean(session.hydrated),
});

const emitSessionChange = () => {
  const snapshot = cloneSession();
  listeners.forEach((listener) => listener(snapshot));
};

const setCurrentSession = (nextSession) => {
  currentSession = {
    accessToken: nextSession.accessToken ?? null,
    refreshToken: nextSession.refreshToken ?? null,
    manager: nextSession.manager ?? null,
    hydrated: true,
  };

  emitSessionChange();
  return cloneSession();
};

const decodeJwtPayload = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || typeof atob !== 'function') {
      return null;
    }

    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

const getTokenExpiryMs = (token) => {
  if (!token) {
    return null;
  }

  const payload = decodeJwtPayload(token);
  if (!payload?.exp) {
    return null;
  }

  return payload.exp * 1000;
};

const shouldRefreshToken = (token, minValidityMs = 60 * 1000) => {
  const expiryMs = getTokenExpiryMs(token);
  if (!expiryMs) {
    return false;
  }

  return expiryMs - Date.now() <= minValidityMs;
};

const persistSession = async ({ accessToken, refreshToken, manager }) => {
  const writes = [];
  const removals = [];

  if (accessToken) {
    writes.push([STORAGE_KEYS.accessToken, accessToken]);
  } else {
    removals.push(STORAGE_KEYS.accessToken);
  }

  if (refreshToken) {
    writes.push([STORAGE_KEYS.refreshToken, refreshToken]);
  } else {
    removals.push(STORAGE_KEYS.refreshToken);
  }

  if (manager) {
    writes.push([STORAGE_KEYS.manager, JSON.stringify(manager)]);
  } else {
    removals.push(STORAGE_KEYS.manager);
  }

  if (writes.length > 0) {
    await AsyncStorage.multiSet(writes);
  }

  if (removals.length > 0) {
    await AsyncStorage.multiRemove(removals);
  }
};

const readStoredSession = async () => {
  const values = await AsyncStorage.multiGet([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.manager,
  ]);

  const accessToken = values[0]?.[1] ?? null;
  const refreshToken = values[1]?.[1] ?? null;
  const managerRaw = values[2]?.[1] ?? null;

  let manager = null;
  if (managerRaw) {
    try {
      manager = JSON.parse(managerRaw);
    } catch (error) {
      console.error('Failed to parse stored manager data:', error);
    }
  }

  return {
    accessToken,
    refreshToken,
    manager,
  };
};

const readResponseJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const subscribeToAuthSession = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getAuthSession = () => cloneSession();

export const getAccessToken = () => currentSession.accessToken;

export const hydrateAuthSession = async () => {
  if (currentSession.hydrated) {
    return cloneSession();
  }

  if (hydratePromise) {
    return hydratePromise;
  }

  hydratePromise = (async () => {
    try {
      const storedSession = await readStoredSession();
      return setCurrentSession(storedSession);
    } catch (error) {
      console.error('Failed to hydrate auth session:', error);
      return setCurrentSession(emptySession);
    } finally {
      hydratePromise = null;
    }
  })();

  return hydratePromise;
};

export const writeAuthSession = async ({
  accessToken,
  refreshToken = currentSession.refreshToken,
  manager = currentSession.manager,
}) => {
  const nextSession = {
    accessToken: accessToken ?? null,
    refreshToken: refreshToken ?? null,
    manager: manager ?? null,
  };

  await persistSession(nextSession);
  return setCurrentSession(nextSession);
};

export const updateAuthSessionManager = async (manager) => {
  const nextSession = {
    accessToken: currentSession.accessToken,
    refreshToken: currentSession.refreshToken,
    manager: manager ?? null,
  };

  await persistSession(nextSession);
  return setCurrentSession(nextSession);
};

export const clearAuthSession = async () => {
  await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
  return setCurrentSession(emptySession);
};

export const refreshAuthSession = async ({
  force = true,
  minValidityMs = 60 * 1000,
} = {}) => {
  await hydrateAuthSession();

  if (!force && !shouldRefreshToken(currentSession.accessToken, minValidityMs)) {
    return currentSession.accessToken;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const tokenToRefresh = currentSession.refreshToken;

    if (!tokenToRefresh) {
      await clearAuthSession();
      return null;
    }

    try {
      const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.REFRESH_TOKEN), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenToRefresh}`,
          'Content-Type': 'application/json',
          'x-refresh-token': tokenToRefresh,
        },
        body: JSON.stringify({ refreshToken: tokenToRefresh }),
      });

      const data = await readResponseJson(response);

      if (!response.ok) {
        throw new Error(data?.message || data?.error || `Refresh failed with status ${response.status}`);
      }

      const nextAccessToken = data?.accessToken || data?.token || data?.authToken;
      if (!nextAccessToken) {
        throw new Error('Refresh response did not include an access token');
      }

      await writeAuthSession({
        accessToken: nextAccessToken,
        refreshToken: data?.refreshToken ?? currentSession.refreshToken,
        manager: data?.manager ?? currentSession.manager,
      });

      return currentSession.accessToken;
    } catch (error) {
      console.error('Failed to refresh auth session:', error);
      await clearAuthSession();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

export const isAccessTokenStale = (minValidityMs = 60 * 1000) =>
  shouldRefreshToken(currentSession.accessToken, minValidityMs);
