import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from './src/context/AuthContext';
import { OrdersProvider } from './src/context/OrdersContext';
import AuthNavigator from './src/navigation/AuthNavigator';
import { setupAuthFetch } from './src/config/setupAuthFetch';

export default function App() {
  // Install global fetch augmentation once at app start
  useEffect(() => {
    setupAuthFetch();
  }, []);
  return (
    <AuthProvider>
      <OrdersProvider>
        <AuthNavigator />
        <StatusBar style="auto" />
      </OrdersProvider>
    </AuthProvider>
  );
}
