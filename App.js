import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from './src/context/AuthContext';
import { OrdersProvider } from './src/context/OrdersContext';
import AuthNavigator from './src/navigation/AuthNavigator';
import { setupAuthFetch, setLogoutCallback } from './src/config/setupAuthFetch';

export default function App() {
  const logoutHandlerRef = useRef(null);

  // Install global fetch augmentation once at app start
  useEffect(() => {
    setupAuthFetch(() => {
      // This callback will be invoked when 401 is detected
      if (logoutHandlerRef.current) {
        console.log('🚪 Calling logout handler due to 401');
        logoutHandlerRef.current();
      }
    });
  }, []);

  return (
    <AuthProvider logoutHandlerRef={logoutHandlerRef}>
      <OrdersProvider>
        <AuthNavigator />
        <StatusBar style="auto" />
      </OrdersProvider>
    </AuthProvider>
  );
}
