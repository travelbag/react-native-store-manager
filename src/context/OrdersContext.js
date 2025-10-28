import React, { createContext, useContext, useReducer, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import NotificationService from '../services/NotificationService';
import { API_CONFIG, buildApiUrl } from '../config/api';
import { useAuth } from './AuthContext';

const OrdersContext = createContext();

// Order statuses - simplified flow
export const ORDER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  READY: 'ready',
  ASSIGNED: 'assigned',
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
      // Replace existing order if present, otherwise add new
      const newOrderId = action.payload.orderId || action.payload.id;
      const orders = state.orders.filter(o => (o.orderId || o.id) !== newOrderId);
      return {
        ...state,
        orders: [action.payload, ...orders],
        loading: false,
      };
    
    case ACTIONS.UPDATE_ORDER_STATUS:
      return {
        ...state,
        orders: state.orders.map(order => {
          if (order.id === action.payload.orderId || order.orderId === action.payload.orderId) {
            return {
              ...order,
              status: action.payload.status,
              orderStatus: action.payload.status
            };
          }
          return order;
        }),
      };
    case ACTIONS.UPDATE_ITEM_STATUS: {
      const { orderId, itemId, status, scannedAt, pickedQuantity } = action.payload;
      
      console.log('🔄 UPDATE_ITEM_STATUS:', { orderId, itemId, status, scannedAt, pickedQuantity });

      return {
        ...state,
        orders: state.orders.map(order => {
          const matchesOrder = order.id === orderId || order.orderId === orderId;
          if (!matchesOrder) return order;

          console.log('✅ Found matching order:', order.id || order.orderId);

          // Normalize items to an array first (handles stringified JSON from backend)
          let normalizedItems = [];
          if (Array.isArray(order.items)) {
            normalizedItems = order.items;
          } else if (typeof order.items === 'string') {
            try {
              const parsed = JSON.parse(order.items);
              normalizedItems = Array.isArray(parsed) ? parsed : [];
            } catch (e) {
              console.warn('⚠️ Failed to parse order.items JSON during update; keeping empty array.', e);
              normalizedItems = [];
            }
          }

          const updatedItems = normalizedItems.map(item => {
            if (item.id === itemId) {
              console.log('✅ Updating item:', item.id, 'status:', status);
              return {
                ...item,
                status,
                scannedAt: (scannedAt ?? item.scannedAt),
                pickedQuantity: (pickedQuantity ?? item.pickedQuantity),
              };
            }
            return item;
          });

          return {
            ...order,
            // Ensure items remain an array after update
            items: updatedItems,
          };
        }),
      };
    }
    
    case ACTIONS.SET_ORDERS:
      // Remove duplicate orders by orderId (backend key)
      const uniqueOrders = [];
      const seenOrderIds = new Set();
      for (const order of action.payload) {
        const key = order.orderId || order.id;
        if (!seenOrderIds.has(key)) {
          uniqueOrders.push(order);
          seenOrderIds.add(key);
        }
      }
      return { ...state, orders: uniqueOrders, loading: false };
    
    case ACTIONS.REMOVE_ORDER:
      return {
        ...state,
        orders: state.orders.filter(order => order.id !== action.payload),
      };
            // Helper to ensure order.items is always an array and normalize shape
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
  const [demoInterval, setDemoInterval] = React.useState(null);
  const [syncInterval, setSyncInterval] = React.useState(null);

  // Normalize a raw order from backend into app shape and apply item scanned mapping
  const normalizeOrder = React.useCallback((orderRaw) => {
    if (!orderRaw) return null;
    const orderId = orderRaw.orderId ?? orderRaw.id;
    // Parse items from array or JSON string
    let rawItems = [];
    if (Array.isArray(orderRaw.items)) {
      rawItems = orderRaw.items;
    } else if (typeof orderRaw.items === 'string') {
      try {
        rawItems = JSON.parse(orderRaw.items);
      } catch {
        rawItems = [];
      }
    } else if (Array.isArray(orderRaw.ordered_items)) {
      rawItems = orderRaw.ordered_items;
    } else if (typeof orderRaw.ordered_items === 'string') {
      try {
        rawItems = JSON.parse(orderRaw.ordered_items);
      } catch {
        rawItems = [];
      }
    }

    const items = rawItems
      .filter(Boolean)
      .map((item, idx) => {
        const scanned = Boolean(item.scanned || item.status === ITEM_STATUS.SCANNED || item.status === 'scanned');
        const pickedQuantity = item.pickedQuantity ?? (scanned ? (item.quantity ?? 1) : undefined);
        return {
          id: item.id ?? `${orderId}_item_${idx}`,
          name: item.productName ?? item.name ?? '',
          price: parseFloat(item.price) || 0,
          quantity: item.quantity ?? 1,
          barcode: item.barcode ?? '',
          image: item.image ?? '',
          category: item.type ?? item.category ?? '',
          rack: item.rack ?? {},
          status: scanned ? ITEM_STATUS.SCANNED : (item.status && Object.values(ITEM_STATUS).includes(item.status) ? item.status : ITEM_STATUS.PENDING),
          weight: item.weight ?? '',
          mrp: item.mrp ?? '',
          scannedAt: item.scannedAt ?? null,
          pickedQuantity,
        };
      });

    return {
      id: orderId,
      orderId,
      customerName: orderRaw.customerName ?? orderRaw.customer_name ?? '',
      items,
      total: orderRaw.totalPrice ?? orderRaw.total ?? orderRaw.total_amount ?? '0.00',
      status: orderRaw.orderStatus ?? orderRaw.status ?? ORDER_STATUS.PENDING,
      orderStatus: orderRaw.orderStatus ?? orderRaw.status ?? ORDER_STATUS.PENDING,
      timestamp: orderRaw.orderDate ?? orderRaw.created_at ?? new Date().toISOString(),
      deliveryAddress: orderRaw.deliveryAddress ?? orderRaw.delivery_address ?? '',
      phoneNumber: orderRaw.phoneNumber ?? orderRaw.customer_phone ?? '',
      estimatedTime: orderRaw.estimatedTime ?? 30,
      orderType: orderRaw.orderType ?? 'grocery',
      deliveryType: orderRaw.deliveryType ?? 'home_delivery',
      specialInstructions: orderRaw.specialInstructions ?? '',
      storeId: orderRaw.storeId ?? orderRaw.store_id ?? '',
      deliveryLatitude: orderRaw.deliveryLatitude ?? '',
      deliveryLongitude: orderRaw.deliveryLongitude ?? '',
      paymentType: orderRaw.paymentType ?? '',
      driverId: orderRaw.driverId ?? null,
    };
  }, []);

  useEffect(() => {
    console.log('🛒 OrdersContext initialized', isAuthenticated, manager);
    if (isAuthenticated && manager) {
      console.log('📦 Initializing notifications for orders');
      
       // Fetch orders from DB after login
    fetchOrdersFromDB().then(orders => {
      dispatch({ type: ACTIONS.SET_ORDERS, payload: orders });
    });
    initializeNotifications();

    // Start foreground polling to keep devices in sync
    if (!syncInterval) {
      const id = setInterval(async () => {
        try {
          const orders = await fetchOrdersFromDB();
          dispatch({ type: ACTIONS.SET_ORDERS, payload: orders });
        } catch (e) {
          // ignore polling errors
        }
      }, 5000); // poll every 5s for faster cross-device sync
      setSyncInterval(id);
    }
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
    const rawOrders = data.orders || data || [];
    const normalized = Array.isArray(rawOrders)
      ? rawOrders.map(normalizeOrder).filter(Boolean)
      : [];
    return normalized;
  } catch (error) {
    console.error('❌ Error fetching orders from DB:', error);
    return [];
  }
};
  // Public refresh helper to manually re-fetch orders
  const refreshOrders = async (status = null) => {
    try {
      const orders = await fetchOrdersFromDB(status);
      dispatch({ type: ACTIONS.SET_ORDERS, payload: orders });
      return orders;
    } catch (e) {
      console.warn('⚠️ Failed to refresh orders:', e);
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
            } else if (data.type === 'order_status_updated' || data.type === 'order_updated') {
              // Sync with backend when other devices change status
              refreshOrders();
            }
          },
          (response) => {
            const data = response.notification.request.content.data;
            if (data.type === 'grocery_order') {
              handleNewOrderNotification(data);
            } else if (data.type === 'order_status_updated' || data.type === 'order_updated') {
              refreshOrders();
            }
          }
        );
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
        const orderData = normalizeOrder(orderRaw);
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

  const acceptOrder = async (orderId) => {
    console.log('✅ Accepting order ID:', orderId);
    try {
      console.log('🔄 Sending accept order request to backend...',buildApiUrl(`/orders/${orderId}/status`));
      // Update backend
      const response = await fetch(buildApiUrl(`/orders/${orderId}/status`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ status: ORDER_STATUS.ACCEPTED }),
      });
      
      console.log('🔄 Accept order API response status:', response.status);
      
      if (response.ok) {
        console.log('✅ Order accepted successfully in backend');
        // Update frontend state
        updateOrderStatus(orderId, ORDER_STATUS.ACCEPTED);
        // Fetch latest to reflect any concurrent changes
        refreshOrders();
      } else {
        console.error('❌ Failed to accept order in backend:', response.status);
        const errorText = await response.text();
        console.error('❌ Error details:', errorText);
        // Don't mutate local state on failure to avoid divergence
      }
    } catch (error) {
      console.error('❌ Error accepting order:', error);
      // Avoid local state change on failure
    }
  };

  const rejectOrder = async (orderId) => {
    console.log('❌ Rejecting order ID:', orderId);
    try {
      // Update backend
      const response = await fetch(buildApiUrl(`/orders/${orderId}/status`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ status: ORDER_STATUS.REJECTED }),
      });
      
      console.log('🔄 Reject order API response status:', response.status);
      
      if (response.ok) {
        console.log('✅ Order rejected successfully in backend');
      } else {
        console.error('❌ Failed to reject order in backend:', response.status);
      }
    } catch (error) {
      console.error('❌ Error rejecting order:', error);
    }
    // Update frontend state
    updateOrderStatus(orderId, ORDER_STATUS.REJECTED);
  };

  const updateItemStatus = (orderId, itemId, status, scannedAt = null, pickedQuantity = null) => {
    dispatch({ 
      type: ACTIONS.UPDATE_ITEM_STATUS, 
      payload: { orderId, itemId, status, scannedAt, pickedQuantity } 
    });
  };

  // Persist scanned state of an item in backend DB (ordered_items JSON)
  // Persist scanned state of an item in backend DB (ordered_items JSON)
  // Accepts optional itemId for backends that prefer id instead of barcode matching
  const persistItemScan = async (orderId, barcode, pickedQuantity = 1, scannedAt = new Date().toISOString(), itemId = null) => {
    try {
      const endpoint = `${API_CONFIG.ENDPOINTS.UPDATE_ITEM_SCAN}/${orderId}/items/${encodeURIComponent(barcode)}/scan`;
      const res = await fetch(buildApiUrl(endpoint), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ scanned: true, pickedQuantity, scannedAt, itemId }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`API ${res.status}: ${t}`);
      }
      // Optionally return updated order from backend if provided
      let updated = null;
      try {
        const json = await res.json();
        if (json?.order) updated = normalizeOrder(json.order);
      } catch {}
      return updated;
    } catch (e) {
      console.error('❌ Failed to persist item scan:', e.message);
      throw e;
    }
  };

  const scanBarcode = (orderId, itemId, scannedBarcode, pickedQuantity = 1) => {
    const order = state.orders.find(o => o.id === orderId);
    let items = [];
    if (Array.isArray(order?.items)) {
      items = order.items;
    } else if (typeof order?.items === 'string') {
      try {
        items = JSON.parse(order.items);
      } catch {
        items = [];
      }
    }
    const item = items.find(i => i.id === itemId);
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

   const markOrderReady = async (orderId) => {
    if (!orderId) {
      console.error('❌ markOrderReady called without a valid orderId');
      throw new Error('Order ID is required to mark as READY');
    }
    console.log('✅ Marking order as READY (pessimistic update), ID:', orderId);
    
    try {
      // 1) Update backend first
      const response = await fetch(buildApiUrl(`/orders/${orderId}/status`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ status: ORDER_STATUS.READY }),
      });
      
      console.log('🔄 Mark ready API response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to mark order as READY in backend:', response.status, errorText);
        throw new Error(`Backend error: ${response.status} - ${errorText}`);
      }

      // 2) Backend succeeded — now update local state for this one order only
      updateOrderStatus(orderId, ORDER_STATUS.READY);

      // 3) Optionally refetch orders from backend to ensure consistency (non-blocking)
      try {
        const orders = await fetchOrdersFromDB();
        dispatch({ type: ACTIONS.SET_ORDERS, payload: orders });
        console.log('✅ Orders refreshed from backend after marking ready');
      } catch (fetchError) {
        console.warn('⚠️ Failed to refresh orders after marking ready:', fetchError);
      }
    } catch (error) {
      console.error('❌ Error marking order as READY:', error);
      // Do NOT mutate local order status on failure (avoid moving orders across tabs)
      throw error;
    }
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
    refreshOrders,
    updateOrderStatus,
    updateItemStatus,
    acceptOrder,
    rejectOrder,
    scanBarcode,
    markItemUnavailable,
  persistItemScan,
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
    },
    // Manual notification trigger for testing
    triggerTestNotification: () => {
      console.log('🧪 Triggering test notification...');
      const newOrder = generateSampleGroceryOrder();
      addOrder(newOrder);
      NotificationService.simulateGroceryOrderNotification(newOrder);
      return newOrder;
    },
    // Control demo mode
    stopDemoMode: () => {
      if (demoInterval) {
        console.log('🛑 Stopping demo mode');
        clearInterval(demoInterval);
        setDemoInterval(null);
      }
    },
    startDemoMode: () => {
      if (!demoInterval && API_CONFIG.DEMO_MODE) {
        console.log('🧪 Starting demo mode manually...');
        const interval = startDemoMode();
        setDemoInterval(interval);
      }
    }
  };

  // Cleanup function
  useEffect(() => {
    return () => {
      console.log('🧹 Cleaning up OrdersContext...');
      NotificationService.removeNotificationListeners();
      if (demoInterval) {
        console.log('🛑 Clearing demo interval');
        clearInterval(demoInterval);
        setDemoInterval(null);
      }
      if (syncInterval) {
        console.log('🛑 Clearing sync interval');
        clearInterval(syncInterval);
        setSyncInterval(null);
      }
    };
  }, [demoInterval, syncInterval]);

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
