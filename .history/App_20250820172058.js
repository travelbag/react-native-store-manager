import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';

import { OrdersProvider } from './src/context/OrdersContext';
import TabNavigator from './src/navigation/TabNavigator';
import OrderPickingScreen from './src/screens/OrderPickingScreen';
import BarcodeScannerScreen from './src/screens/BarcodeScannerScreen';

const Stack = createStackNavigator();

function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen 
        name="OrderPicking" 
        component={OrderPickingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="BarcodeScanner" 
        component={BarcodeScannerScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <OrdersProvider>
      <NavigationContainer>
        <MainStack />
        <StatusBar style="auto" />
      </NavigationContainer>
    </OrdersProvider>
  );
}
