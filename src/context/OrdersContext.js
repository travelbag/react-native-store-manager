import React, { createContext, useContext, useReducer, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import NotificationService from '../services/NotificationService';
import { API_CONFIG, buildApiUrl } from '../config/api';
import { useAuth } from './AuthContext';

const OrdersContext = createContext();

// Order statuses
export const ORDER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  PICKING: 'picking', // New status for item picking
  PREPARING: 'preparing',
  READY: 'ready',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
};

// Item statuses for tracking individual product pickup
export const ITEM_STATUS = {
  PENDING: 'pending',
  LOCATED: 'located',
  SCANNED: 'scanned',
  UNAVAILABLE: 'unavailable',
};

// Initial state
const initialState = {
  orders: [],
  loading: false,
  error: null,
};

// Actions
const ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  ADD_ORDER: 'ADD_ORDER',
  UPDATE_ORDER_STATUS: 'UPDATE_ORDER_STATUS',
  UPDATE_ITEM_STATUS: 'UPDATE_ITEM_STATUS',
  SET_ORDERS: 'SET_ORDERS',
  REMOVE_ORDER: 'REMOVE_ORDER',
};

// Reducer
function ordersReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_LOADING:
      return { ...state, loading: action.payload };
    
    case ACTIONS.SET_ERROR:
      return { ...state, error: action.payload, loading: false };
    
    case ACTIONS.ADD_ORDER:
      return {
        ...state,
        orders: [action.payload, ...state.orders],
        loading: false,
      };
    
    case ACTIONS.UPDATE_ORDER_STATUS:
      return {
        ...state,
        orders: state.orders.map(order =>
          order.id === action.payload.orderId
            ? { ...order, status: action.payload.status }
            : order
        ),
      };
    
    case ACTIONS.UPDATE_ITEM_STATUS:
      return {
        ...state,
        orders: state.orders.map(order =>
          order.id === action.payload.orderId
            ? {
                ...order,
                items: order.items.map(item =>
                  item.id === action.payload.itemId
                    ? { 
                        ...item, 
                        status: action.payload.status, 
                        scannedAt: action.payload.scannedAt,
                        pickedQuantity: action.payload.pickedQuantity
                      }
                    : item
                )
              }
            : order
        ),
      };
    
    case ACTIONS.SET_ORDERS:
      return { ...state, orders: action.payload, loading: false };
    
    case ACTIONS.REMOVE_ORDER:
      return {
        ...state,
        orders: state.orders.filter(order => order.id !== action.payload),
      };
    
    default:
      return state;
  }
}

// Sample grocery order data generator
function generateSampleGroceryOrder() {
  const customerNames = ['John Doe', 'Jane Smith', 'Mike Johnson', 'Sarah Wilson', 'Tom Brown'];
  const groceryItems = [
    { 
      id: 'item_001',
      name: 'Organic Bananas', 
      price: 2.99, 
      quantity: 2,
      barcode: '123456789012',
      image: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=300',
      category: 'Fruits',
      rack: { 
        location: 'A1-B2', 
        aisle: 'Produce Section', 
        description: 'Fresh Fruits - Left side near entrance',
        floor: 'Ground Floor'
      },
      status: ITEM_STATUS.PENDING
    },
    { 
      id: 'item_002',
      name: 'Whole Milk 1 Gallon', 
      price: 4.50, 
      quantity: 1,
      barcode: '234567890123',
      image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300',
      category: 'Dairy',
      rack: { 
        location: 'C3-D1', 
        aisle: 'Dairy Section', 
        description: 'Refrigerated section - Middle aisle',
        floor: 'Ground Floor'
      },
      status: ITEM_STATUS.PENDING
    },
    { 
      id: 'item_003',
      name: 'Whole Wheat Bread', 
      price: 3.25, 
      quantity: 1,
      barcode: '345678901234',
      image: 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=300',
      category: 'Bakery',
      rack: { 
        location: 'B2-A3', 
        aisle: 'Bakery Section', 
        description: 'Fresh bread shelf - Right side',
        floor: 'Ground Floor'
      },
      status: ITEM_STATUS.PENDING
    },
    { 
      id: 'item_004',
      name: 'Ground Beef 1lb', 
      price: 6.99, 
      quantity: 1,
      barcode: '456789012345',
      image: 'https://images.unsplash.com/photo-1588347818113-f4be09cb3b34?w=300',
      category: 'Meat',
      rack: { 
        location: 'D1-C2', 
        aisle: 'Meat Department', 
        description: 'Refrigerated meat counter - Back of store',
        floor: 'Ground Floor'
      },
      status: ITEM_STATUS.PENDING
    },
    { 
      id: 'item_005',
      name: 'Roma Tomatoes', 
      price: 1.99, 
      quantity: 3,
      barcode: '567890123456',
      image: 'https://images.unsplash.com/photo-1546470427-e5e5c0d4b9c0?w=300',
      category: 'Vegetables',
      rack: { 
        location: 'A2-B1', 
        aisle: 'Produce Section', 
        description: 'Fresh vegetables - Center display',
        floor: 'Ground Floor'
      },
      status: ITEM_STATUS.PENDING
    }
  ];

  const orderId = Math.floor(Math.random() * 10000) + 1000;
  const customerName = customerNames[Math.floor(Math.random() * customerNames.length)];
  const numItems = Math.floor(Math.random() * 3) + 2; // 2-4 items
  const orderItems = groceryItems.slice(0, numItems).map(item => ({
    ...item,
    id: `${orderId}_${item.id}`, // Unique item ID per order
  }));
  const total = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return {
    id: orderId,
    customerName,
    items: orderItems,
    total: total.toFixed(2),
    status: ORDER_STATUS.PENDING,
    timestamp: new Date().toISOString(),
    deliveryAddress: '123 Main St, City, State',
    phoneNumber: '+1 (555) 123-4567',
    estimatedTime: Math.floor(Math.random() * 30) + 15, // 15-45 minutes
    orderType: 'grocery',
    deliveryType: 'home_delivery', // or 'pickup'
    specialInstructions: 'Please check expiry dates on dairy products',
  };
}

export function OrdersProvider({ children }) {
  const [state, dispatch] = useReducer(ordersReducer, initialState);
  const { isAuthenticated, manager, getAuthHeaders } = useAuth();

  useEffect(() => {
    console.log('🛒 OrdersContext initialized', isAuthenticated, manager);
    if (isAuthenticated && manager) {
      console.log('📦 Initializing notifications for orders');
      
       // Fetch orders from DB after login
    fetchOrdersFromDB().then(orders => {
      dispatch({ type: ACTIONS.SET_ORDERS, payload: orders });
    });initializeNotifications();
    }
  }, [isAuthenticated, manager]);
// Fetch orders from backend DB by storeId and optional status
const fetchOrdersFromDB = async (status = null) => {
  if (!manager || !manager.storeId) {
    console.error('❌ No storeId found for manager');
    return [];
  }
  let url = buildApiUrl(`/orders/by-store/${manager.storeId}`);
  console.log('Fetching orders from DB with URL:', url);
  if (status) url += `?status=${status}`;
  try {
    const response = await fetch(url, { headers: getAuthHeaders() });
    const data = await response.json();
    // Map DB fields to your frontend order format if needed
    console.log('📦 Orders fetched from DB:', data.orders);
    return data.orders || [];
  } catch (error) {
    console.error('❌ Error fetching orders from DB:', error);
    return [];
  }
};
  const initializeNotifications = async () => {
    try {
      console.log('🚀 Starting notification initialization...');
      // If Android and not using Firebase, use local notifications
      if (Platform.OS === 'android' && !API_CONFIG.USE_FIREBASE) {
        console.log('🔔 Using Expo local notifications for Android (no Firebase)');
        await Notifications.requestPermissionsAsync();
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
      } else {
        // Get push token and register with backend
        const token = await NotificationService.registerForPushNotificationsAsync();
        console.log('📲 Push token obtained:', token);
        if (token) {
          console.log('✅ Valid push token received, registering with backend...');
          await registerStoreManagerToken(token);
        } else {
          console.warn('⚠️ No push token received.');
          if (__DEV__) {
            console.log('🧪 Development mode: Creating mock token for testing...');
            const mockToken = NotificationService.createMockToken();
            if (mockToken) {
              console.log('🎭 Using mock token for development:', mockToken);
              await registerStoreManagerToken(mockToken);
            }
          } else {
            console.log('💡 Push notifications require physical device in production.');
          }
        }
        // Set up notification listeners for real push notifications
        NotificationService.setupNotificationListeners(
          (notification) => {
            console.log('🔔 Notification received:', notification);
            const data = notification.request.content.data;
            console.log('🔍 Notification data:', data);
            if (data.type === 'grocery_order') {
              handleNewOrderNotification(data);
            }
          },
          (response) => {
            const data = response.notification.request.content.data;
            if (data.type === 'grocery_order') {
              handleNewOrderNotification(data);
            }
          }
        );
      }
      // DEMO MODE - Remove in production
      if (API_CONFIG.DEMO_MODE) {
        // startDemoMode();
      }
    } catch (error) {
      console.error('Failed to initialize notifications:', error);
    }
  };

  // Demo mode for testing (remove in production)
  const startDemoMode = () => {
    console.log('🧪 Demo mode: Generating sample orders every', API_CONFIG.DEMO_INTERVAL / 1000, 'seconds');
    const interval = setInterval(() => {
      const newOrder = generateSampleGroceryOrder();
      addOrder(newOrder);
      NotificationService.simulateGroceryOrderNotification(newOrder);
    }, API_CONFIG.DEMO_INTERVAL);

    // Store interval for cleanup
    return interval;
  };

  // Register store manager token with backend
  const registerStoreManagerToken = async (pushToken) => {
    if (!manager) {
      console.error('❌ No manager data available for token registration');
      return null;
    }

    try {
      // Replace {id} with actual store manager ID
      const endpoint = API_CONFIG.ENDPOINTS.REGISTER_TOKEN.replace('{id}', manager.id);
      // Results in: /store-managers/SM_001/register-token

      const response = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          storeManagerId: manager.id,
          storeId: manager.storeId,
          pushToken: pushToken,
          deviceInfo: {
            platform: Platform.OS,
            timestamp: new Date().toISOString(),
          }
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Store manager token registered successfully:', result);
        return result;
      } else {
        console.error('❌ Failed to register token:', response.status);
        return null;
      }
    } catch (error) {
      console.error('❌ Error registering token:', error);
      return null;
    }
  };

  // Handle new order notification
  const handleNewOrderNotification = async (notificationData) => {
    try {
      // Fetch full order details from backend
      const orderId = notificationData.orderId;
      console.log('📦 Handling new order notification for order ID:', orderId);
      const orderDetails = await fetchOrderDetails(orderId);
      console.log('📦 New order details fetched:', orderDetails);
      if (orderDetails) {
        addOrder(orderDetails);
        // If Android and not using Firebase, show local notification
        if (Platform.OS === 'android' && !API_CONFIG.USE_FIREBASE) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'New Grocery Order',
              body: `Order #${orderId} received!`,
              data: notificationData,
            },
            trigger: null,
          });
        }
      }
    } catch (error) {
      console.error('Error handling new order notification:', error);
    }
  };

  // Fetch order details from backend
  const fetchOrderDetails = async (orderId) => {
    try {
      const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.ORDER_DETAILS, `/${orderId}`), {
        headers: getAuthHeaders(),
      });
      console.log(buildApiUrl(API_CONFIG.ENDPOINTS.ORDER_DETAILS, `/${orderId}`));
      console.log('📦 Fetching order details for order ID:', orderId, 'Response status:', response.status);
      if (response.ok) {
        const result = await response.json();
        const orderRaw = result.data || result;
        // Parse items if they are a stringified array
        let items = [];
        if (typeof orderRaw.items === 'string') {
          try {
            items = JSON.parse(orderRaw.items);
          } catch (e) {
            console.error('❌ Error parsing items JSON:', e);
            items = [];
          }
        } else if (Array.isArray(orderRaw.items)) {
          items = orderRaw.items;
        }

        // Map backend fields to frontend order format
        const orderData = {
          id: orderRaw.orderId,
          customerName: orderRaw.customerName,
          items: items.map((item, idx) => ({
            id: `${orderRaw.orderId}_item_${idx}`,
            name: item.productName || item.name || '',
            price: parseFloat(item.price) || 0,
            quantity: item.quantity || 1,
            barcode: item.barcode || '',
            image: item.image || '',
            category: item.type || '',
            rack: {},
            status: ITEM_STATUS.PENDING,
            weight: item.weight || '',
            mrp: item.mrp || '',
          })),
          total: orderRaw.totalPrice || '0.00',
          status: orderRaw.orderStatus || ORDER_STATUS.PENDING,
          timestamp: orderRaw.orderDate || new Date().toISOString(),
          deliveryAddress: orderRaw.deliveryAddress || '',
          phoneNumber: orderRaw.phoneNumber || '',
          estimatedTime: 30, // Placeholder
          orderType: 'grocery',
          deliveryType: 'home_delivery',
          specialInstructions: '',
          storeId: orderRaw.storeId || '',
          deliveryLatitude: orderRaw.deliveryLatitude || '',
          deliveryLongitude: orderRaw.deliveryLongitude || '',
          paymentType: orderRaw.paymentType || '',
          driverId: orderRaw.driverId || null,
        };
        console.log('📦 Order details mapped:', orderData);
        return orderData;
      } else {
        console.error('❌ Failed to fetch order details:', response.status);
        return null;
      }
    } catch (error) {
      console.error('❌ Error fetching order details:', error);
      return null;
    }
  };

  const addOrder = (order) => {
    dispatch({ type: ACTIONS.ADD_ORDER, payload: order });
  };

  const updateOrderStatus = (orderId, status) => {
    dispatch({ type: ACTIONS.UPDATE_ORDER_STATUS, payload: { orderId, status } });
  };

  const acceptOrder = (orderId) => {
    updateOrderStatus(orderId, ORDER_STATUS.ACCEPTED);
  };

  const rejectOrder = (orderId) => {
    updateOrderStatus(orderId, ORDER_STATUS.REJECTED);
  };

  const startPickingOrder = (orderId) => {
    updateOrderStatus(orderId, ORDER_STATUS.PICKING);
  };

  const updateItemStatus = (orderId, itemId, status, scannedAt = null, pickedQuantity = null) => {
    dispatch({ 
      type: ACTIONS.UPDATE_ITEM_STATUS, 
      payload: { orderId, itemId, status, scannedAt, pickedQuantity } 
    });
  };

  const scanBarcode = (orderId, itemId, scannedBarcode, pickedQuantity = 1) => {
    const order = state.orders.find(o => o.id === orderId);
    const item = order?.items.find(i => i.id === itemId);
    
    if (item && item.barcode === scannedBarcode) {
      updateItemStatus(orderId, itemId, ITEM_STATUS.SCANNED, new Date().toISOString(), pickedQuantity);
      return { 
        success: true, 
        message: `Item scanned successfully! Picked ${pickedQuantity} of ${item.quantity}` 
      };
    } else {
      return { success: false, message: 'Barcode does not match expected item' };
    }
  };

  const markItemUnavailable = (orderId, itemId) => {
    updateItemStatus(orderId, itemId, ITEM_STATUS.UNAVAILABLE);
  };

  const startPreparingOrder = (orderId) => {
    updateOrderStatus(orderId, ORDER_STATUS.PREPARING);
  };

  const markOrderReady = (orderId) => {
    updateOrderStatus(orderId, ORDER_STATUS.READY);
  };

  const completeOrder = (orderId) => {
    updateOrderStatus(orderId, ORDER_STATUS.COMPLETED);
  };

  const removeOrder = (orderId) => {
    dispatch({ type: ACTIONS.REMOVE_ORDER, payload: orderId });
  };

  const value = {
    orders: state.orders,
    loading: state.loading,
    error: state.error,
    addOrder,
    updateOrderStatus,
    updateItemStatus,
    acceptOrder,
    rejectOrder,
    startPickingOrder,
    scanBarcode,
    markItemUnavailable,
    startPreparingOrder,
    markOrderReady,
    completeOrder,
    removeOrder,
    // Add method to manually register token if needed
    registerStoreManagerToken,
    // Development helpers
    testPushToken: async () => {
      console.log('🧪 Manual push token test...');
      const token = await NotificationService.testTokenGeneration();
      if (token) {
        await registerStoreManagerToken(token);
      }
      return token;
    },
    createMockToken: () => {
      return NotificationService.createMockToken();
    }
  };

  // Cleanup function
  useEffect(() => {
    return () => {
      NotificationService.removeNotificationListeners();
    };
  }, []);

  return (
    <OrdersContext.Provider value={value}>
      {children}
    </OrdersContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrdersContext);
  if (!context) {
    throw new Error('useOrders must be used within an OrdersProvider');
  }
  return context;
}
