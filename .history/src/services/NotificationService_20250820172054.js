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

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        alert('Failed to get push token for push notification!');
        return;
      }
      
      try {
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        if (!projectId) {
          throw new Error('Project ID not found');
        }
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        console.log('Expo Push Token:', token);
      } catch (e) {
        console.error('Error getting push token:', e);
      }
    } else {
      alert('Must use physical device for Push Notifications');
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

  // Simulate receiving a grocery order notification
  async simulateGroceryOrderNotification(order) {
    await this.scheduleLocalNotification(
      'New Grocery Order!',
      `Order #${order.id} - ${order.customerName} - ${order.items.length} items - $${order.total}`,
      { 
        orderId: order.id, 
        type: 'grocery_order',
        customerName: order.customerName,
        itemCount: order.items.length,
        total: order.total
      }
    );
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
