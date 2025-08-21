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

// Sample order data generator
function generateSampleOrder() {
  const customerNames = ['John Doe', 'Jane Smith', 'Mike Johnson', 'Sarah Wilson', 'Tom Brown'];
  const items = [
    { name: 'Margherita Pizza', price: 12.99, quantity: 1 },
    { name: 'Caesar Salad', price: 8.50, quantity: 1 },
    { name: 'Cheeseburger', price: 10.99, quantity: 2 },
    { name: 'French Fries', price: 4.99, quantity: 1 },
    { name: 'Coca Cola', price: 2.50, quantity: 2 },
  ];

  const orderId = Math.floor(Math.random() * 10000) + 1000;
  const customerName = customerNames[Math.floor(Math.random() * customerNames.length)];
  const orderItems = items.slice(0, Math.floor(Math.random() * 3) + 1);
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
      const newOrder = generateSampleOrder();
      addOrder(newOrder);
      NotificationService.simulateOrderNotification(newOrder);
    }, 30000); // Every 30 seconds

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
