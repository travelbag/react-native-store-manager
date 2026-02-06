import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import OrdersScreen from '../screens/OrdersScreen';
import StatsScreen from '../screens/StatsScreen';
import OrderPickingScreen from '../screens/OrderPickingScreen';
import BarcodeScannerScreen from '../screens/BarcodeScannerScreen';
import BarcodeScannerFallback from '../screens/BarcodeScannerFallback';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Orders stack
function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OrdersList" component={OrdersScreen} />
      <Stack.Screen name="OrderPicking" component={OrderPickingScreen} />
      <Stack.Screen name="BarcodeScanner" component={BarcodeScannerScreen} />
      <Stack.Screen name="BarcodeScannerFallback" component={BarcodeScannerFallback} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

const TabNavigator = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Orders') {
            iconName = focused ? 'list' : 'list-outline';
          } else if (route.name === 'Analytics') {
            iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },

        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',

        // 🔥 THIS IS THE IMPORTANT FIX
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          borderTopColor: '#E5E5E5',

          // dynamic padding for system nav buttons
          paddingBottom: Math.max(insets.bottom, 8),

          // let RN handle height naturally
        },

        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          marginBottom: Platform.OS === 'ios' ? 0 : 4,
        },

        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Orders"
        component={OrdersStack}
        options={{ tabBarLabel: 'Orders' }}
      />

      <Tab.Screen
        name="Analytics"
        component={StatsScreen}
        options={{ tabBarLabel: 'Analytics' }}
      />
    </Tab.Navigator>
  );
};

export default TabNavigator;
