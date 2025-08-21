import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

import { OrdersProvider } from './src/context/OrdersContext';
import TabNavigator from './src/navigation/TabNavigator';

export default function App() {
  return (
    <OrdersProvider>
      <NavigationContainer>
        <TabNavigator />
        <StatusBar style="auto" />
      </NavigationContainer>
    </OrdersProvider>
  );
}
