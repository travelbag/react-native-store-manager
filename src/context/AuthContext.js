import React, { createContext, useContext, useReducer, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, buildApiUrl } from '../config/api';

const AuthContext = createContext();

// Auth states
const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  SET_MANAGER: 'SET_MANAGER',
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
    
    case AUTH_ACTIONS.LOGIN_SUCCESS:
      return {
        ...state,
        isAuthenticated: true,
        isLoading: false,
        token: action.payload.token,
        manager: action.payload.manager,
        error: null,
      };
    
    case AUTH_ACTIONS.LOGIN_FAILURE:
      return {
        ...state,
        isAuthenticated: false,
        isLoading: false,
        token: null,
        manager: null,
        error: action.payload,
      };
    
    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        isAuthenticated: false,
        isLoading: false,
        token: null,
        manager: null,
        error: null,
      };
    
    case AUTH_ACTIONS.SET_MANAGER:
      return {
        ...state,
        manager: action.payload,
      };
    
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    checkStoredAuth();
  }, []);

  // Check if user is already logged in
  const checkStoredAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const managerData = await AsyncStorage.getItem('managerData');
      
      if (token && managerData) {
        const manager = JSON.parse(managerData);
        
        // Verify token is still valid
        const isValid = await verifyToken(token);
        if (isValid) {
          dispatch({
            type: AUTH_ACTIONS.LOGIN_SUCCESS,
            payload: { token, manager }
          });
        } else {
          await clearStoredAuth();
          dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        }
      } else {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      }
    } catch (error) {
      console.error('Error checking stored auth:', error);
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
    }
  };

  // Verify token with backend
  const verifyToken = async (token) => {
    try {
      // For now, just check if token exists and is not expired
      // In production, you would verify with your backend
      if (!token) return false;
      
      // Simple JWT expiry check (if using JWT)
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          const currentTime = Math.floor(Date.now() / 1000);
          return payload.exp > currentTime;
        }
      } catch (e) {
        // If not JWT, just return true for now
        return true;
      }
      
      return true;
    } catch (error) {
      console.error('Token verification failed:', error);
      return false;
    }
  };

  // Login function
  const login = async (username, password) => {
    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
    
    try {
    //   // Demo mode login for testing
    //   if (API_CONFIG.DEMO_MODE && username === 'admin' && password === 'admin123') {
    //     const mockManager = {
    //       id: 'SM_001',
    //       name: 'John Manager',
    //       username: 'admin',
    //       storeId: 'STORE_001',
    //       storeName: 'Downtown Grocery',
    //       role: 'manager'
    //     };

    //     const mockToken = 'demo_token_' + Date.now();

    //     // Store auth data
    //     await AsyncStorage.setItem('authToken', mockToken);
    //     await AsyncStorage.setItem('managerData', JSON.stringify(mockManager));
        
    //     dispatch({
    //       type: AUTH_ACTIONS.LOGIN_SUCCESS,
    //       payload: {
    //         token: mockToken,
    //         manager: mockManager
    //       }
    //     });

    //     return { success: true, manager: mockManager };
    //   }
   console.log(buildApiUrl(API_CONFIG.ENDPOINTS.LOGIN));
    //console.log(JSON.stringify({ username, password }))

      // Real API login
      const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.LOGIN), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
       console.log('Login response data:', data);
      if (response.ok) {
        // Store auth data
        await AsyncStorage.setItem('authToken', data.token);
        await AsyncStorage.setItem('managerData', JSON.stringify(data.manager));
        
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: {
            token: data.token,
            manager: data.manager
          }
        });

        return { success: true, manager: data.manager };
      } else {
        dispatch({
          type: AUTH_ACTIONS.LOGIN_FAILURE,
          payload: data.message || 'Login failed'
        });
        return { success: false, error: data.message || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = 'Network error. Please check your connection.';
      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: errorMessage
      });
      return { success: false, error: errorMessage };
    }
  };

  // Logout function
  const logout = async () => {
    await clearStoredAuth();
    dispatch({ type: AUTH_ACTIONS.LOGOUT });
  };

  // Clear stored authentication data
  const clearStoredAuth = async () => {
    try {
      await AsyncStorage.multiRemove(['authToken', 'managerData']);
    } catch (error) {
      console.error('Error clearing stored auth:', error);
    }
  };

  // Get auth headers for API requests
  const getAuthHeaders = () => {
    return {
      'Content-Type': 'application/json',
      ...(state.token && { 'Authorization': `Bearer ${state.token}` }),
    };
  };

  // Update manager data
  const updateManager = async (managerData) => {
    await AsyncStorage.setItem('managerData', JSON.stringify(managerData));
    dispatch({
      type: AUTH_ACTIONS.SET_MANAGER,
      payload: managerData
    });
  };

  const value = {
    ...state,
    login,
    logout,
    getAuthHeaders,
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
