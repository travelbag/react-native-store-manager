import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

import { OrdersProvider } from './src/context/OrdersContext';
import OrdersScreen from './src/screens/OrdersScreen';
import StatsScreen from './src/screens/StatsScreen';
import TabNavigator from './src/navigation/TabNavigator';

const Stack = createStackNavigator();

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
