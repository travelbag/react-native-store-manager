import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
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

const HIDDEN_TAB_ROUTES = new Set([
  'OrderPicking',
  'BarcodeScanner',
  'BarcodeScannerFallback',
]);

function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OrdersList" component={OrdersScreen} />
      <Stack.Screen name="OrderPicking" component={OrderPickingScreen} />
      <Stack.Screen name="BarcodeScanner" component={BarcodeScannerScreen} />
      <Stack.Screen name="BarcodeScannerFallback" component={BarcodeScannerFallback} />
    </Stack.Navigator>
  );
}

const TabNavigator = () => {
  const insets = useSafeAreaInsets();
  const tabBarStyle = {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    height: 56 + Math.max(insets.bottom, 6),
    paddingTop: 6,
    paddingBottom: Math.max(insets.bottom, 6),
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Home: focused ? 'home' : 'home-outline',
            Stats: focused ? 'bar-chart' : 'bar-chart-outline',
            Profile: focused ? 'person-circle' : 'person-circle-outline',
          };
          return <Ionicons name={icons[route.name] || 'ellipse-outline'} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: Platform.OS === 'ios' ? 0 : 2,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Home"
        component={OrdersStack}
        options={({ route }) => {
          const focused = getFocusedRouteNameFromRoute(route) ?? 'OrdersList';
          return {
            tabBarLabel: 'Home',
            tabBarStyle: HIDDEN_TAB_ROUTES.has(focused) ? { display: 'none' } : tabBarStyle,
          };
        }}
      />
      <Tab.Screen
        name="Stats"
        component={StatsScreen}
        options={{ tabBarLabel: 'Analytics' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

export default TabNavigator;
