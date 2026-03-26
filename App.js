import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from './src/context/AuthContext';
import { OrdersProvider } from './src/context/OrdersContext';
import AuthNavigator from './src/navigation/AuthNavigator';
import { hydrateAuthSession } from './src/auth/authSession';

export default function App() {
  const logoutHandlerRef = useRef(null);

  useEffect(() => {
    hydrateAuthSession();
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
