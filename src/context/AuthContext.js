import React, { createContext, useCallback, useContext, useEffect, useReducer } from 'react';
import { API_CONFIG } from '../config/api';
import {
  clearAuthSession,
  getAuthSession,
  hydrateAuthSession,
  isAccessTokenStale,
  refreshAuthSession,
  subscribeToAuthSession,
  updateAuthSessionManager,
  writeAuthSession,
} from '../auth/authSession';
import { apiClient } from '../services/apiClient';

const AuthContext = createContext();

// Auth states
const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_SESSION: 'SET_SESSION',
  SET_ERROR: 'SET_ERROR',
};

const initialState = {
  isAuthenticated: false,
  isLoading: true,
  token: null,
  manager: null,
  error: null,
};

function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return { ...state, isLoading: action.payload };

    case AUTH_ACTIONS.SET_SESSION:
      return {
        ...state,
        isAuthenticated: Boolean(action.payload.accessToken && action.payload.manager),
        token: action.payload.accessToken ?? null,
        manager: action.payload.manager ?? null,
        error: null,
      };

    case AUTH_ACTIONS.SET_ERROR:
      return { ...state, error: action.payload };

    default:
      return state;
  }
}

export function AuthProvider({ children, logoutHandlerRef }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const syncSessionState = useCallback((session) => {
    dispatch({
      type: AUTH_ACTIONS.SET_SESSION,
      payload: session,
    });
  }, []);

  const hydrateAuth = useCallback(async () => {
    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });

    try {
      const hydratedSession = await hydrateAuthSession();
      syncSessionState(hydratedSession);

      if (hydratedSession.accessToken && isAccessTokenStale()) {
        const refreshedToken = await refreshAuthSession({ force: false });
        if (!refreshedToken) {
          dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: 'Session expired. Please sign in again.' });
        }
      }
    } catch (error) {
      console.error('Error hydrating auth:', error);
    } finally {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
    }
  }, [syncSessionState]);

  useEffect(() => {
    syncSessionState(getAuthSession());
    const unsubscribe = subscribeToAuthSession(syncSessionState);
    hydrateAuth();

    return unsubscribe;
  }, [hydrateAuth, syncSessionState]);

  const login = useCallback(async (username, password) => {
    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });

    try {
      const response = await apiClient.post(API_CONFIG.ENDPOINTS.LOGIN, {
        requiresAuth: false,
        retryOn401: false,
        body: { username, password },
      });

      const data = await response.json();
      console.log('Login response data:', data);

      if (response.ok) {
        await writeAuthSession({
          accessToken: data.token || data.accessToken || data.authToken,
          refreshToken: data.refreshToken ?? null,
          manager: data.manager ?? null,
        });

        return { success: true, manager: data.manager };
      }

      const errorMessage = data.message || 'Login failed';
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: errorMessage });
      return { success: false, error: errorMessage };
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = 'Network error. Please check your connection.';
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: errorMessage });
      return { success: false, error: errorMessage };
    } finally {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
    }
  }, []);

  const logout = useCallback(async () => {
    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
    try {
      await clearAuthSession();
    } finally {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
    }
  }, []);

  const updateManager = useCallback(async (managerData) => {
    await updateAuthSessionManager(managerData);
  }, []);

  // Expose logout function to parent via ref
  useEffect(() => {
    if (logoutHandlerRef) {
      logoutHandlerRef.current = logout;
    }
  }, [logout, logoutHandlerRef]);

  const value = {
    ...state,
    login,
    logout,
    refreshSession: refreshAuthSession,
    updateManager,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
