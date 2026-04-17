import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

/** Must match Android channelId in local schedules + Expo push `channelId` for FCM. */
export const ORDER_NOTIFICATION_CHANNEL_ID = 'orders';

export function logNotificationPath(kind, detail = {}) {
  const payload = {
    kind,
    appState: AppState.currentState,
    ...detail,
  };
  console.log('[notification-path]', JSON.stringify(payload));
}

/**
 * Single app-wide handler for notifications presented while the app is foregrounded.
 * Do not call setNotificationHandler elsewhere (e.g. in context) or behavior becomes undefined.
 */
function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

configureNotificationHandler();

class NotificationService {
  constructor() {
    this.expoPushToken = null;
    this.notificationListener = null;
    this.responseListener = null;
  }

  /**
   * Call once on app mount (e.g. App.js) to log when the app was opened from a notification
   * (background → foreground or cold start from tray). Does not replace response listeners.
   */
  async logColdStartOrBackgroundOpenFromTray() {
    try {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last?.notification) {
        const data = last.notification.request.content.data || {};
        logNotificationPath('cold_start_or_tray_open', {
          type: data.type,
          orderId: data.orderId,
          actionIdentifier: last.actionIdentifier,
        });
      }
    } catch (e) {
      if (__DEV__) console.warn('[notification-path] cold start check failed:', e?.message);
    }
  }

  /**
   * Android: channel must exist before any local notification with channelId (e.g. pending-order sound).
   * Safe to call repeatedly; call from sound scheduling if init races the first poll.
   */
  async ensureOrdersChannelAsync() {
    if (Platform.OS !== 'android') {
      return;
    }
    await Notifications.setNotificationChannelAsync(ORDER_NOTIFICATION_CHANNEL_ID, {
      name: 'New Orders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#FF231F7C',
      sound: 'default',
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });
  }

  async registerForPushNotificationsAsync() {
    let token;

    // Check if we're on a physical device OR in development mode
    const isPhysicalDevice = Device.isDevice;
    const isDevelopment = __DEV__;
    
    console.log('🔍 Device check:', { isPhysicalDevice, isDevelopment });

    if (isPhysicalDevice || isDevelopment) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      console.log('📋 Permission status:', finalStatus);
      
      if (finalStatus !== 'granted') {
        console.warn('⚠️ Push notification permissions not granted');
        if (isPhysicalDevice) {
          alert('Failed to get push token for push notification!');
        }
        return null;
      }
      
      try {
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        console.log('🔍 Project ID found:', projectId);
        
        if (!projectId || isDevelopment) {
          console.log('🧪 Development mode: Getting token without project ID...');
          // For development, try to get a token anyway
          token = (await Notifications.getExpoPushTokenAsync()).data;
        } else {
          console.log('🏭 Production mode: Getting token with project ID...');
          token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        }
        
        console.log('✅ Expo Push Token obtained:', token);
      } catch (e) {
        const isNetworkError = e.message?.includes('Network request failed') || e.message?.includes('network');
        
        if (isNetworkError) {
          console.warn('⚠️ Network error getting push token - working offline');
          console.log('💡 Push notifications will work once network is restored');
        } else {
          console.error('❌ Error getting push token:', e.message || e);
        }
        
        // Create a local token for development/offline mode
        // This allows the app to continue functioning without crashing
        if (isDevelopment || !isPhysicalDevice) {
          const deviceType = Platform.OS === 'ios' ? 'ios' : 'android';
          const deviceId = Device.modelName || 'unknown';
          token = `ExponentPushToken[local_${deviceType}_${deviceId}_${Date.now()}]`;
          console.log('🎭 Generated local token (offline mode):', token);
        } else {
          // For production on physical device, try one more time with timeout
          console.log('🔄 Retrying with timeout...');
          try {
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 5000)
            );
            const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
            const tokenPromise = Notifications.getExpoPushTokenAsync({ projectId });
            token = (await Promise.race([tokenPromise, timeoutPromise])).data;
            console.log('✅ Token obtained on retry:', token);
          } catch (retryError) {
            console.warn('⚠️ Push token unavailable - notifications disabled');
            // Return null so the app knows notifications are unavailable
            return null;
          }
        }
      }
    } else {
      console.warn('⚠️ Not a physical device and not in development mode');
      return null;
    }

    await this.ensureOrdersChannelAsync();

    this.expoPushToken = token;
    
    // Enhanced logging for development
    console.log('🔚 Final token result:', token);
    console.log('📱 Device info:', {
      isDevice: Device.isDevice,
      deviceType: Device.deviceType,
      platform: Platform.OS,
      isDevelopment: __DEV__
    });
    
    return token;
  }

  setupNotificationListeners(onNotificationReceived, onNotificationResponseReceived) {
    // Re-registering without this stacks duplicate handlers (e.g. after appState/manager effect re-runs).
    this.removeNotificationListeners();

    // Foreground only: Expo does not invoke this when the app is backgrounded (OS shows the notification).
    this.notificationListener = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data || {};
      logNotificationPath('foreground_received', {
        type: data.type,
        orderId: data.orderId,
        identifier: notification.request.identifier,
      });
      if (onNotificationReceived) {
        onNotificationReceived(notification);
      }
    });

    // User tapped notification (from foreground, background, or killed state after launch).
    this.responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data || {};
      logNotificationPath('notification_tap', {
        type: data.type,
        orderId: data.orderId,
        actionIdentifier: response.actionIdentifier,
      });
      if (onNotificationResponseReceived) {
        onNotificationResponseReceived(response);
      }
    });
  }

  removeNotificationListeners() {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
    }
  }

  async scheduleLocalNotification(title, body, data = {}) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        interruptionLevel: 'timeSensitive',
      },
      trigger: Platform.OS === 'android' ? { channelId: ORDER_NOTIFICATION_CHANNEL_ID, seconds: 1 } : { seconds: 1 },
    });
  }

  // Enhanced notification handling for production
  async simulateGroceryOrderNotification(order) {
    // In production, this would be called by your backend push service
    await this.scheduleLocalNotification(
      'New Grocery Order! 🛒',
      `Order #${order.id} - ${order.customerName} - ${order.items.length} items - $${order.total}`,
      { 
        orderId: order.id, 
        type: 'grocery_order', // Changed from 'grocery_order' for consistency
        customerName: order.customerName,
        itemCount: order.items.length,
        total: order.total,
        timestamp: new Date().toISOString()
      }
    );
  }

  // Method to handle production push notifications
  async handleProductionNotification(pushData) {
    // This method would be called when a real push notification arrives
    console.log('🔔 Production notification received:', pushData);
    
    // The push notification payload from your backend would contain:
    // {
    //   title: "New Grocery Order!",
    //   body: "Order #1234 - John Doe - 3 items - $25.99",
    //   data: {
    //     type: "grocery_order",
    //     orderId: "1234",
    //     storeId: "STORE_001",
    //     priority: "high"
    //   }
    // }
    
    return pushData;
  }

  // Original method kept for backward compatibility
  async simulateOrderNotification(order) {
    await this.simulateGroceryOrderNotification(order);
  }

  getExpoPushToken() {
    return this.expoPushToken;
  }

  // Development helper method to test token generation
  async testTokenGeneration() {
    console.log('🧪 Testing push token generation...');
    console.log('📱 Device info:', {
      isDevice: Device.isDevice,
      deviceType: Device.deviceType,
      platform: Platform.OS,
      isDevelopment: __DEV__,
      deviceName: Device.deviceName,
      osName: Device.osName,
      osVersion: Device.osVersion
    });

    try {
      const token = await this.registerForPushNotificationsAsync();
      console.log('🎯 Test result - Token:', token);
      return token;
    } catch (error) {
      console.error('❌ Test failed:', error);
      return null;
    }
  }

  // Method to create a development mock token
  createMockToken() {
    const mockToken = `ExponentPushToken[mock_dev_${Platform.OS}_${Date.now()}]`;
    console.log('🎭 Created mock token:', mockToken);
    this.expoPushToken = mockToken;
    return mockToken;
  }
}

export default new NotificationService();
