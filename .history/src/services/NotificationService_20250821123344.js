import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class NotificationService {
  constructor() {
    this.expoPushToken = null;
    this.notificationListener = null;
    this.responseListener = null;
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
        console.error('❌ Error getting push token:', e);
        console.log('🔄 Trying fallback method...');
        
        // Fallback: try without project ID for development
        try {
          token = (await Notifications.getExpoPushTokenAsync()).data;
          console.log('✅ Fallback token obtained:', token);
        } catch (fallbackError) {
          console.error('❌ Fallback method also failed:', fallbackError);
          
          // For development, create a mock token
          if (isDevelopment && !isPhysicalDevice) {
            token = `ExponentPushToken[mock_token_${Date.now()}_simulator]`;
            console.log('🎭 Mock token created for simulator:', token);
          } else {
            return null;
          }
        }
      }
    } else {
      console.warn('⚠️ Not a physical device and not in development mode');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('orders', {
        name: 'New Orders',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

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
    // Listen for incoming notifications while app is foregrounded
    this.notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
      if (onNotificationReceived) {
        onNotificationReceived(notification);
      }
    });

    // Listen for notification responses (user taps notification)
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
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
        sound: true,
      },
      trigger: { seconds: 1 },
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
}

export default new NotificationService();
