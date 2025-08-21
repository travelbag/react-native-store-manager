import React, { createContext, useContext, useReducer, useEffect } from 'react';
import NotificationService from '../services/NotificationService';

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
                    ? { ...item, status: action.payload.status, scannedAt: action.payload.scannedAt }
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

  useEffect(() => {
    // Initialize notification service
    NotificationService.registerForPushNotificationsAsync();
    
    // Set up notification listeners
    NotificationService.setupNotificationListeners(
      (notification) => {
        // Handle incoming notification
        const data = notification.request.content.data;
        if (data.type === 'new_order') {
          // You could fetch the actual order data here
          console.log('New order notification received');
        }
      },
      (response) => {
        // Handle notification tap
        const data = response.notification.request.content.data;
        if (data.type === 'new_order') {
          console.log('User tapped on order notification');
        }
      }
    );

    // Simulate receiving orders periodically (for demo purposes)
    const interval = setInterval(() => {
      const newOrder = generateSampleGroceryOrder();
      addOrder(newOrder);
      NotificationService.simulateGroceryOrderNotification(newOrder);
    }, 45000); // Every 45 seconds

    return () => {
      clearInterval(interval);
      NotificationService.removeNotificationListeners();
    };
  }, []);

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
    acceptOrder,
    rejectOrder,
    startPreparingOrder,
    markOrderReady,
    completeOrder,
    removeOrder,
  };

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
