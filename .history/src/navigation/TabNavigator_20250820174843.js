import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';

import OrdersScreen from '../screens/OrdersScreen';
import StatsScreen from '../screens/StatsScreen';
import OrderPickingScreen from '../screens/OrderPickingScreen';
import BarcodeScannerScreen from '../screens/BarcodeScannerScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Stack navigator for Orders tab
function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OrdersList" component={OrdersScreen} />
      <Stack.Screen name="OrderPicking" component={OrderPickingScreen} />
      <Stack.Screen name="BarcodeScanner" component={BarcodeScannerScreen} />
    </Stack.Navigator>
  );
}

const TabNavigator = () => {
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
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E5E5E5',
          paddingBottom: Platform.OS === 'ios' ? 20 : 5,
          height: Platform.OS === 'ios' ? 85 : 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerShown: false,
      })}
    >
      <Tab.Screen 
        name="Orders" 
        component={OrdersStack}
        options={{
          tabBarLabel: 'Orders',
        }}
      />
      <Tab.Screen 
        name="Analytics" 
        component={StatsScreen}
        options={{
          tabBarLabel: 'Analytics',
        }}
      />
    </Tab.Navigator>
  );
};

export default TabNavigator;
