import React from 'react';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from './src/context/AuthContext';
import { OrdersProvider } from './src/context/OrdersContext';
import AuthNavigator from './src/navigation/AuthNavigator';

export default function App() {
  return (
    <AuthProvider>
      <OrdersProvider>
        <AuthNavigator />
        <StatusBar style="auto" />
      </OrdersProvider>
    </AuthProvider>
  );
}
