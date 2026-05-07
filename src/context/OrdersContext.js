import React, { createContext, useContext, useReducer, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform, AppState, DeviceEventEmitter } from 'react-native';
import { io } from 'socket.io-client';
import NotificationService, { ORDER_NOTIFICATION_CHANNEL_ID } from '../services/NotificationService';
import {
  startPendingOrderAlertLoop,
  stopPendingOrderAlertLoop,
} from '../services/PendingOrderAlertSound';
import { API_CONFIG, buildApiUrl } from '../config/api';
import { apiClient } from '../services/apiClient';
import { assignDriver, wasOrderAssigned } from '../services/DriverService';
import { useAuth } from './AuthContext';

const OrdersContext = createContext();

// Order statuses - simplified flow
export const ORDER_STATUS = {
  PENDING: 'pending' || 'confirmed',
  ACCEPTED: 'accepted',
  READY: 'ready',
  ASSIGNED: 'assigned',
  COMPLETED: 'delivered',
  REJECTED: 'rejected',
};

// Item statuses for tracking individual product pickup
export const ITEM_STATUS = {
  PENDING: 'pending' || 'confirmed',
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

const normalizeValue = (value) => String(value ?? '').trim();
const normalizeStatusValue = (value) => normalizeValue(value).toLowerCase();
const normalizeStoreIdValue = (value) => normalizeValue(value).replace(/^store-/i, '');
const extractOrderIdValue = (order = {}) => normalizeValue(order?.orderId ?? order?.id);
const extractAcceptedManagerIdValue = (order = {}) =>
  normalizeValue(order?.acceptedByManagerId ?? order?.accepted_by_manager_id);

/** Map API variants so the Assigned tab matches (`assigned` filter). */
const ASSIGNED_ORDER_STATUS_ALIASES = new Set([
  'driver_assigned',
  'driverassigned',
  'out_for_delivery',
  'outfordelivery',
  'dispatched',
  'in_transit',
  'intransit',
]);

const canonicalizeOrderStatus = (value) => {
  const s = normalizeStatusValue(value);
  if (!s) return ORDER_STATUS.PENDING;
  if (ASSIGNED_ORDER_STATUS_ALIASES.has(s)) return ORDER_STATUS.ASSIGNED;
  return s;
};

/** Backend often sends `confirmed` for brand-new orders; treat like pending for alerts */
const isPendingNewOrderStatus = (status) => {
  const s = normalizeStatusValue(status);
  return (
    s === '' ||
    s === 'pending' ||
    s === 'confirmed' ||
    s === 'new' ||
    s === 'placed' ||
    s === 'received'
  );
};

const buildSocketBaseUrl = () => {
  const configured = String(API_CONFIG.BASE_URL || '').trim();
  if (!configured) return '';
  return configured.replace(/\/api\/?$/i, '');
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
      // Normalize IDs so merges match the same row even when API mixes id / orderId types
      const newOrderKey = extractOrderIdValue(action.payload);
      const orders = state.orders.filter((o) => extractOrderIdValue(o) !== newOrderKey);
      return {
        ...state,
        orders: [action.payload, ...orders],
        loading: false,
      };
    
    case ACTIONS.UPDATE_ORDER_STATUS:
      return {
        ...state,
        orders: state.orders.map(order => {
          const orderKey = String(order.id ?? order.orderId ?? '');
          const targetKey = String(action.payload.orderId ?? '');
          if (orderKey === targetKey) {
            return {
              ...order,
              status: action.payload.status,
              orderStatus: action.payload.status,
              backendStatus: action.payload.status,
            };
          }
          return order;
        }),
      };
    case ACTIONS.UPDATE_ITEM_STATUS: {
      const { orderId, itemId, status, scannedAt, pickedQuantity } = action.payload;
      
      //log('🔄 UPDATE_ITEM_STATUS:', { orderId, itemId, status, scannedAt, pickedQuantity });

      return {
        ...state,
        orders: state.orders.map(order => {
          const matchesOrder = order.id === orderId || order.orderId === orderId;
          if (!matchesOrder) return order;

        //  console.log('✅ Found matching order:', order.id || order.orderId);

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
              //console.log('✅ Updating item:', item.id, 'status:', status);
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
      // Remove duplicate orders by orderId (backend key) — coerce to string for reliable comparison
      const uniqueOrders = [];
      const seenOrderIds = new Set();
      const existingOrdersById = new Map(
        state.orders.map((order) => [String(order.orderId ?? order.id ?? ''), order])
      );
      for (const order of action.payload) {
        const key = String(order.orderId ?? order.id ?? '');
        if (!seenOrderIds.has(key)) {
          const existingOrder = existingOrdersById.get(key);
          const incomingRack = String(
            order?.packageRack ?? order?.rackNumber ?? order?.rack_number ?? order?.pickup_rack ?? ''
          ).trim();
          const existingRack = String(
            existingOrder?.packageRack ??
              existingOrder?.rackNumber ??
              existingOrder?.rack_number ??
              existingOrder?.pickup_rack ??
              ''
          ).trim();
          uniqueOrders.push(
            !incomingRack && existingRack
              ? {
                  ...order,
                  packageRack: existingRack,
                  rackNumber: existingRack,
                  rack_number: existingRack,
                  pickup_rack: existingRack,
                }
              : order
          );
          seenOrderIds.add(key);
        }
      }
      return { ...state, orders: uniqueOrders, loading: false };
    
    case ACTIONS.REMOVE_ORDER:
      const targetOrderKey = normalizeValue(action.payload);
      return {
        ...state,
        orders: state.orders.filter(
          (order) => extractOrderIdValue(order) !== targetOrderKey
        ),
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
  const { isAuthenticated, manager } = useAuth();
  const [demoInterval, setDemoInterval] = React.useState(null);
  // Use ref for polling interval to avoid stale closures and duplicate timers
  const syncIntervalRef = React.useRef(null);
  // Switch to timeout-based polling to ensure spacing after each fetch completes
  const pollTimeoutRef = React.useRef(null);
  const socketRef = React.useRef(null);
  const ordersRef = React.useRef([]);
  const [isAppActive, setIsAppActive] = React.useState(true);
  const consecutiveFailuresRef = React.useRef(0);
  const appStateRef = React.useRef(AppState.currentState);
  const isFetchingRef = React.useRef(false);
  const lastFetchAtRef = React.useRef(0);
  /** orderId -> last successfully merged time (dedupes duplicate push bursts) */
  const groceryOrderHandledAtRef = React.useRef(new Map());
  const groceryOrderFetchInFlightRef = React.useRef(new Set());
  /** null until first list snapshot; then Set of order ids last seen from fetch/poll */
  const previousPollOrderIdsRef = React.useRef(null);
  const pendingOrderSoundAtRef = React.useRef(new Map());
  /** Dedupe DeviceEventEmitter newOrderReceived (push + poll can fire within seconds) */
  const newOrderEventAtRef = React.useRef(new Map());

  const emitNewOrderReceived = React.useCallback((order, source) => {
    const orderId = String(order?.orderId ?? order?.id ?? '');
    if (!orderId) return;
    const now = Date.now();
    const last = newOrderEventAtRef.current.get(orderId);
    if (last != null && now - last < 2000) return;
    newOrderEventAtRef.current.set(orderId, now);
    DeviceEventEmitter.emit('newOrderReceived', { orderId, source, order });
  }, []);

  useEffect(() => {
    ordersRef.current = Array.isArray(state.orders) ? state.orders : [];
  }, [state.orders]);

  useEffect(() => {
    previousPollOrderIdsRef.current = null;
  }, [manager?.storeId, manager?.id]);

  const createLocalItemId = React.useCallback((orderId, item, idx, fallbackType = 'item') => {
    const type = item?.item_type || item?.type || fallbackType;
    const identityValue =
      item?.barcode ??
      item?.item_barcode ??
      item?.file_name ??
      item?.fileName ??
      item?.item_name ??
      item?.name ??
      'unnamed';

    return `${orderId}:${type}:${identityValue}:${idx}`;
  }, []);

  const isOrderVisibleToManager = React.useCallback(
    (order) => {
      const status = normalizeStatusValue(order?.status ?? order?.orderStatus);
      const acceptedByManagerId = extractAcceptedManagerIdValue(order);
      const currentManagerId = normalizeValue(manager?.id);

      if (status === ORDER_STATUS.PENDING || status === '') {
        return true;
      }

      // Shared store queue: once driver is assigned or order is terminal, every store manager must see it.
      // (Otherwise only the accepting manager matched acceptedByManagerId and others saw an empty Assigned tab.)
      if (
        status === ORDER_STATUS.ASSIGNED ||
        status === ORDER_STATUS.COMPLETED ||
        status === 'cancelled' ||
        status === ORDER_STATUS.REJECTED
      ) {
        return true;
      }

      if (!acceptedByManagerId) {
        return true;
      }

      return acceptedByManagerId === currentManagerId;
    },
    [manager?.id]
  );

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

    if ((!rawItems || rawItems.length === 0) && (Array.isArray(orderRaw.print_items) || Array.isArray(orderRaw.product_items))) {
      rawItems = [
        ...(Array.isArray(orderRaw.product_items) ? orderRaw.product_items : []),
        ...(Array.isArray(orderRaw.print_items) ? orderRaw.print_items : []),
      ];
    }

    const items = rawItems
      .filter(Boolean)
      .map((item, idx) => {
        const rawType = String(item?.item_type || item?.type || '').toLowerCase();
        const isPrintItem =
          rawType === 'print' ||
          Boolean(item?.file_url || item?.fileUrl || item?.print_url || item?.printUrl || item?.document_url || item?.documentUrl);
        const rawStatus = String(item?.status || '').toLowerCase();
        const scanned = Boolean(
          item.scanned ||
          rawStatus === ITEM_STATUS.SCANNED ||
          rawStatus === 'scanned' ||
          rawStatus === 'printed'
        );
        const pickedQuantity = item.pickedQuantity ?? (scanned ? (item.quantity ?? 1) : undefined);

        if (isPrintItem) {
          const backendItemId = item?.id ?? item?.item_id ?? item?.itemId ?? null;
          const fileUrl =
            item?.file_url ||
            item?.fileUrl ||
            item?.print_url ||
            item?.printUrl ||
            item?.document_url ||
            item?.documentUrl ||
            '';
          const fileName =
            item?.file_name ||
            item?.fileName ||
            item?.item_name ||
            item?.name ||
            'Document';
          const pages = Number(item?.pages ?? item?.page_count ?? 1);
          const quantity = Number(item?.quantity ?? 1);
          const price = Number(item?.price ?? 0);
          const colorMode = String(item?.color_mode || item?.colorMode || item?.print_color || item?.printColor || '').toLowerCase();
          const orientation = String(item?.orientation || item?.print_orientation || item?.printOrientation || '').toLowerCase();

          return {
            id: createLocalItemId(orderId, item, idx, 'print'),
            backendItemId,
            item_type: 'print',
            type: 'print',
            name: fileName,
            fileName,
            fileUrl,
            printUrl: fileUrl,
            pages: Number.isFinite(pages) && pages > 0 ? pages : 1,
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
            price: Number.isFinite(price) ? price : 0,
            colorMode: colorMode || 'color',
            orientation: orientation === 'landscape' ? 'landscape' : 'portrait',
            status: scanned ? ITEM_STATUS.SCANNED : (item.status && Object.values(ITEM_STATUS).includes(item.status) ? item.status : ITEM_STATUS.PENDING),
            scannedAt: item.scannedAt ?? null,
            pickedQuantity,
          };
        }

        const backendItemId = item?.id ?? item?.item_id ?? item?.itemId ?? null;
        const productRack = String(
          item?.product_racknumber ??
            item?.rack_number ??
            item?.rackNumber ??
            item?.racknumber ??
            ''
        ).trim();
        const existingRack = item?.rack && typeof item.rack === 'object' ? item.rack : {};
        const rackLocation =
          productRack ||
          String(existingRack?.location ?? existingRack?.Location ?? '').trim() ||
          '—';
        const rack = {
          ...existingRack,
          location: rackLocation,
        };

        return {
          id: createLocalItemId(orderId, item, idx, 'product'),
          backendItemId,
          item_type: item.item_type ?? 'product',
          type: item.type ?? 'product',
          name: item.productName ?? item.item_name ?? item.name ?? '',
          price: parseFloat(item.price) || 0,
          quantity: item.quantity ?? 1,
          barcode: item.barcode ?? item.item_barcode ?? '',
          image: item.image ?? '',
          category: item.type ?? item.category ?? '',
          rack,
          product_racknumber: productRack || null,
          status: scanned ? ITEM_STATUS.SCANNED : (item.status && Object.values(ITEM_STATUS).includes(item.status) ? item.status : ITEM_STATUS.PENDING),
          weight: item.weight ?? item.selectedWeight ?? '',
          mrp: item.mrp ?? item.mrp_price ?? item.mrpPrice ?? '',
          scannedAt: item.scannedAt ?? null,
          pickedQuantity,
        };
      });

    const rawOrderStatus =
      orderRaw.orderStatus ??
      orderRaw.order_status ??
      orderRaw.status ??
      orderRaw.backendStatus ??
      orderRaw.backend_status ??
      ORDER_STATUS.PENDING;
    const driverId = orderRaw.driverId ?? orderRaw.driver_id ?? orderRaw.driver?.id ?? null;
    const orderStatusCanonical = canonicalizeOrderStatus(rawOrderStatus);

    return {
      id: orderId,
      orderId,
      customerName: orderRaw.customerName ?? orderRaw.customer_name ?? '',
      items,
      total: orderRaw.totalPrice ?? orderRaw.total ?? orderRaw.total_amount ?? '0.00',
      status: orderStatusCanonical,
      orderStatus: orderStatusCanonical,
      backendStatus: orderStatusCanonical,
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
      // Driver assignment fields (for Assigned tab display)
      driverId,
      driverName: orderRaw.driverName ?? orderRaw.driver_name ?? orderRaw.driver?.name ?? '',
      driverPhone: orderRaw.driverPhone ?? orderRaw.driver_phone ?? orderRaw.driver?.phone ?? orderRaw.driver_mobile ?? '',
      packageRack:
        orderRaw.packageRack ??
        orderRaw.rackNumber ??
        orderRaw.rack_number ??
        orderRaw.pickup_rack ??
        '',
      acceptedByManagerId: orderRaw.acceptedByManagerId ?? orderRaw.accepted_by_manager_id ?? null,
      acceptedByManagerName: orderRaw.acceptedByManagerName ?? orderRaw.accepted_by_manager_name ?? null,
      acceptedAt: orderRaw.acceptedAt ?? orderRaw.accepted_at ?? null,
    };
  }, [createLocalItemId]);

  const schedulePendingOrderSoundAlert = React.useCallback(async (order) => {
    const orderId = String(order?.orderId ?? order?.id ?? '');
    if (!orderId) return;
    if (!isPendingNewOrderStatus(order?.status ?? order?.orderStatus)) return;

    const now = Date.now();
    const last = pendingOrderSoundAtRef.current.get(orderId);
    if (last != null && now - last < 20000) return;
    pendingOrderSoundAtRef.current.set(orderId, now);

    try {
      const { status: perm } = await Notifications.getPermissionsAsync();
      if (perm !== 'granted') {
        const { status: next } = await Notifications.requestPermissionsAsync();
        if (next !== 'granted') {
          if (__DEV__) console.warn('⚠️ Pending order sound skipped: notification permission not granted');
          return;
        }
      }

      await NotificationService.ensureOrdersChannelAsync();

      // Explicit time trigger: Android requires channel + seconds>=1; iOS null trigger can skip sound in foreground.
      const trigger =
        Platform.OS === 'android'
          ? { channelId: ORDER_NOTIFICATION_CHANNEL_ID, seconds: 1 }
          : { seconds: 1 };

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'New order — pending',
          body: `Order #${orderId}${order.customerName ? ` · ${order.customerName}` : ''}`,
          data: {
            orderId,
            type: 'grocery_order_foreground',
            _isLocalForegroundAlert: true,
          },
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          interruptionLevel: 'timeSensitive',
        },
        trigger,
      });
    } catch (e) {
      console.warn('⚠️ Pending order sound failed:', e?.message ?? e);
    }
  }, []);

  const applyOrdersSnapshot = React.useCallback(
    (orders) => {
      const ids = new Set(orders.map((o) => String(o.orderId ?? o.id ?? '')));
      const prev = previousPollOrderIdsRef.current;
      if (prev !== null) {
        for (const order of orders) {
          const oid = String(order.orderId ?? order.id ?? '');
          if (prev.has(oid)) continue;
          if (isPendingNewOrderStatus(order.status ?? order.orderStatus)) {
            schedulePendingOrderSoundAlert(order);
            emitNewOrderReceived(order, 'poll_snapshot');
          }
        }
      }
      previousPollOrderIdsRef.current = ids;
      dispatch({ type: ACTIONS.SET_ORDERS, payload: orders });
    },
    [schedulePendingOrderSoundAlert, emitNewOrderReceived],
  );

  const fetchOrdersFromDB = React.useCallback(
    async (status = null, source = 'manual') => {
      if (!manager || !manager.storeId) {
        console.error('❌ No storeId found for manager');
        return [];
      }
      let endpoint = `/orders/by-store/${manager.storeId}`;
      if (status) endpoint += `?status=${status}`;
      try {
        const response = await apiClient.get(endpoint);
        const rawText = await response.text();
        if (!response.ok) {
          console.error('❌ Failed to fetch orders from DB:', {
            endpoint,
            status: response.status,
            body: rawText?.slice(0, 300) || '',
          });
          return [];
        }
        if (!rawText || !rawText.trim()) {
          console.warn('⚠️ Orders API returned empty response body', {
            endpoint,
            status: response.status,
            source,
          });
          return [];
        }
        let data;
        try {
          data = JSON.parse(rawText);
        } catch (parseError) {
          console.error('❌ Orders API returned invalid JSON:', {
            endpoint,
            status: response.status,
            body: rawText.slice(0, 300),
            parseError: parseError?.message || parseError,
          });
          return [];
        }

        const rawOrders = data.orders || data || [];
        const normalized = Array.isArray(rawOrders)
          ? rawOrders.map(normalizeOrder).filter(Boolean)
          : [];
        return normalized.filter(isOrderVisibleToManager);
      } catch (error) {
        console.error('❌ Error fetching orders from DB:', error);
        return [];
      }
    },
    [manager, normalizeOrder, isOrderVisibleToManager],
  );

  const refreshOrders = React.useCallback(
    async (status = null, options = {}) => {
      try {
        const { force = false } = options;
        const now = Date.now();
        if (!force && now - lastFetchAtRef.current < 1500) {
          return ordersRef.current;
        }
        const orders = await fetchOrdersFromDB(status, 'manual');
        applyOrdersSnapshot(orders);
        return orders;
      } catch (e) {
        console.warn('⚠️ Failed to refresh orders:', e);
        return [];
      }
    },
    [applyOrdersSnapshot, fetchOrdersFromDB],
  );

  useEffect(() => {
    // Start/stop foreground polling based on auth, manager, and app activity
    let cancelled = false;

    const stopTimers = () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };

    const schedulePoll = () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
      pollTimeoutRef.current = setTimeout(async () => {
        if (cancelled) return;
        if (isFetchingRef.current) {
          // If a fetch is in progress, reschedule to avoid overlap
          schedulePoll();
          return;
        }
        isFetchingRef.current = true;
        try {
          const orders = await fetchOrdersFromDB(null, 'interval');
          if (cancelled) return;
          consecutiveFailuresRef.current = 0; // reset failures on success
          applyOrdersSnapshot(orders);
        } catch (e) {
          consecutiveFailuresRef.current += 1;
          if (consecutiveFailuresRef.current >= 5) {
            console.warn('🛑 Stopping polling after repeated failures (server likely down).');
            stopTimers();
            return; // do not reschedule
          }
        } finally {
          lastFetchAtRef.current = Date.now();
          isFetchingRef.current = false;
          // Reschedule next tick
          schedulePoll();
        }
      }, API_CONFIG.POLL_INTERVAL);
    };

    if (isAuthenticated && manager?.storeId && isAppActive) {
      // Ensure no interval remains
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }

      // Register channel + listeners before first snapshot so Android pending-order alerts can play sound.
      (async () => {
        try {
          await initializeNotifications();
        } catch (e) {
          console.warn('⚠️ initializeNotifications failed:', e?.message ?? e);
        }
        if (cancelled) return;
        try {
          const orders = await fetchOrdersFromDB(null, 'initial');
          if (cancelled) return;
          applyOrdersSnapshot(orders);
        } catch (e) {
          console.warn('⚠️ Initial orders fetch failed:', e?.message ?? e);
        }
        if (cancelled) return;
        schedulePoll();
      })();
    } else {
      // Stop polling if conditions are not met (logged out, manager missing, or app background)
      stopTimers();
      if (!isAuthenticated || !manager?.storeId) {
        NotificationService.removeNotificationListeners();
      }
    }

    // Cleanup when deps change/unmount
    return () => {
      cancelled = true;
      stopTimers();
    };
  }, [isAuthenticated, manager?.storeId, isAppActive, applyOrdersSnapshot, fetchOrdersFromDB]);

  // Observe app state to pause polling when app goes to background/inactive
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      const active = nextState === 'active';
      setIsAppActive(active);
    });
    return () => {
      sub.remove();
    };
  }, []);

  const hasPendingOrdersAwaitingAcceptance = React.useMemo(
    () =>
      Array.isArray(state.orders) &&
      state.orders.some((o) => isPendingNewOrderStatus(o.status ?? o.orderStatus)),
    [state.orders],
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!isAuthenticated || !manager?.storeId || !isAppActive) {
        await stopPendingOrderAlertLoop();
        return;
      }
      if (cancelled) return;
      if (hasPendingOrdersAwaitingAcceptance) {
        await startPendingOrderAlertLoop();
      } else {
        await stopPendingOrderAlertLoop();
      }
    };

    run();

    return () => {
      cancelled = true;
      stopPendingOrderAlertLoop();
    };
  }, [
    hasPendingOrdersAwaitingAcceptance,
    isAuthenticated,
    manager?.storeId,
    isAppActive,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !manager?.storeId) return undefined;

    const socketBaseUrl = buildSocketBaseUrl();
    if (!socketBaseUrl) return undefined;

    const normalizedStoreId = normalizeStoreIdValue(manager.storeId);
    const rawStoreId = normalizeValue(manager.storeId);
    const socketClient = io(socketBaseUrl, {
      transports: ['websocket'],
      reconnection: true,
    });

    socketRef.current = socketClient;

    const joinStoreRooms = () => {
      const candidateStoreRooms = new Set(
        [rawStoreId, normalizedStoreId, normalizedStoreId ? `store-${normalizedStoreId}` : ''].filter(Boolean)
      );

      candidateStoreRooms.forEach((room) => {
        socketClient.emit('join-room', room);
      });
    };

    const handleOrderCancelled = (payload = {}) => {
      const eventOrderId = normalizeValue(payload?.orderId);
      if (!eventOrderId) return;

      const payloadStoreId = normalizeStoreIdValue(payload?.storeId);
      if (payloadStoreId && normalizedStoreId && payloadStoreId !== normalizedStoreId) return;

      const existingOrder = ordersRef.current.find(
        (order) => extractOrderIdValue(order) === eventOrderId
      );
      const existingOrderStatus = normalizeStatusValue(
        existingOrder?.status ?? existingOrder?.orderStatus
      );

      if (existingOrderStatus === ORDER_STATUS.ACCEPTED) {
        dispatch({ type: ACTIONS.REMOVE_ORDER, payload: eventOrderId });
      } else if (existingOrder) {
        dispatch({
          type: ACTIONS.ADD_ORDER,
          payload: {
            ...existingOrder,
            status: 'cancelled',
            orderStatus: 'cancelled',
          backendStatus: 'cancelled',
          },
        });
      }

      DeviceEventEmitter.emit('orderCancelled', {
        orderId: eventOrderId,
        cancelledBy: payload?.cancelledBy || 'system',
        reason: payload?.reason || '',
        trackingActive: Boolean(payload?.trackingActive),
      });
    };

    const handleOrderAssigned = (payload = {}) => {
      const eventOrderId = normalizeValue(payload?.orderId);
      if (!eventOrderId) return;

      const payloadStoreId = normalizeStoreIdValue(payload?.storeId);
      if (payloadStoreId && normalizedStoreId && payloadStoreId !== normalizedStoreId) return;

      const existingOrder = ordersRef.current.find(
        (order) => extractOrderIdValue(order) === eventOrderId
      );
      if (!existingOrder) return;

      dispatch({
        type: ACTIONS.ADD_ORDER,
        payload: {
          ...existingOrder,
          status: 'assigned',
          orderStatus: 'assigned',
          backendStatus: 'assigned',
          driverId: payload?.driverId ?? existingOrder?.driverId ?? null,
        },
      });
    };

    socketClient.on('connect', joinStoreRooms);
    socketClient.on('order_cancelled', handleOrderCancelled);
    socketClient.on('order_assigned', handleOrderAssigned);
    joinStoreRooms();

    return () => {
      socketClient.off('connect', joinStoreRooms);
      socketClient.off('order_cancelled', handleOrderCancelled);
      socketClient.off('order_assigned', handleOrderAssigned);
      socketClient.disconnect();
      if (socketRef.current === socketClient) {
        socketRef.current = null;
      }
    };
  }, [dispatch, isAuthenticated, manager?.storeId]);

  // Helpers to control sync polling manually (exposed via context for advanced control)
  const stopSyncPolling = () => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  };

  const startSyncPolling = () => {
    // Prefer timeout-based scheduler
    if (isAuthenticated && manager?.storeId && isAppActive) {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = setTimeout(async function scheduleManualStart() {
        if (isFetchingRef.current) {
          pollTimeoutRef.current = setTimeout(scheduleManualStart, API_CONFIG.POLL_INTERVAL);
          return;
        }
        isFetchingRef.current = true;
        try {
          const orders = await fetchOrdersFromDB(null, 'interval');
          consecutiveFailuresRef.current = 0;
          applyOrdersSnapshot(orders);
        } catch (e) {
          consecutiveFailuresRef.current += 1;
          if (consecutiveFailuresRef.current >= 5) {
            console.warn('🛑 Stopping polling after repeated failures (server likely down).');
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
            return;
          }
        } finally {
          lastFetchAtRef.current = Date.now();
          isFetchingRef.current = false;
          pollTimeoutRef.current = setTimeout(scheduleManualStart, API_CONFIG.POLL_INTERVAL);
        }
      }, API_CONFIG.POLL_INTERVAL);
    }
  };
  const initializeNotifications = async () => {
    try {
      //log('🚀 Starting notification initialization...');
      // If Android and not using Firebase, use local notifications
      if (Platform.OS === 'android' && !API_CONFIG.USE_FIREBASE) {
        console.log('🔔 Using Expo local notifications for Android (no Firebase)');
        await Notifications.requestPermissionsAsync();
        await NotificationService.ensureOrdersChannelAsync();
        NotificationService.setupNotificationListeners(
          (notification) => {
            const data = notification.request.content.data || {};
            if (data._isLocalForegroundAlert || data.type === 'grocery_order_foreground') return;
            if (data.type === 'grocery_order') handleNewOrderNotification(data);
            else if (data.type === 'order_status_updated' || data.type === 'order_updated') refreshOrders();
          },
          (response) => {
            const data = response.notification.request.content.data || {};
            if (data._isLocalForegroundAlert || data.type === 'grocery_order_foreground') return;
            if (data.type === 'grocery_order') handleNewOrderNotification(data);
            else if (data.type === 'order_status_updated' || data.type === 'order_updated') refreshOrders();
          },
        );
      } else {
        // Get push token and register with backend
        const token = await NotificationService.registerForPushNotificationsAsync();
        console.log('📲 Push token result:', token ? 'obtained' : 'unavailable');
        
        if (token) {
          // Valid token received, register with backend
          await registerStoreManagerToken(token);
        } else {
          console.warn('⚠️ Push notifications unavailable (network issue or no device)');
          console.log('📱 App will continue to work, but notifications are disabled');
          console.log('💡 Push notifications will activate when network is restored');
        }
        
        // Set up notification listeners for real push notifications
        NotificationService.setupNotificationListeners(
          (notification) => {
            const data = notification.request.content.data || {};
            // Local "sound bridge" alerts must not re-run fetch (same payload as push → infinite loop)
            if (data._isLocalForegroundAlert || data.type === 'grocery_order_foreground') {
              return;
            }
            if (data.type === 'grocery_order') {
              handleNewOrderNotification(data);
            } else if (data.type === 'order_status_updated' || data.type === 'order_updated') {
              // Sync with backend when other devices change status
              refreshOrders();
            }
          },
          (response) => {
            const data = response.notification.request.content.data || {};
            if (data._isLocalForegroundAlert || data.type === 'grocery_order_foreground') {
              return;
            }
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

      const response = await apiClient.post(endpoint, {
        body: {
          storeManagerId: manager.id,
          storeId: manager.storeId,
          pushToken: pushToken,
          deviceInfo: {
            platform: Platform.OS,
            timestamp: new Date().toISOString(),
          },
        },
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Store manager token registered successfully:', result);
        return result;
      } else {
        // Don't log 401 errors - the fetch interceptor handles logout
        if (response.status !== 401) {
          console.error('❌ Failed to register token:', response.status);
        }
        return null;
      }
    } catch (error) {
      // Silent on network errors during logout flow
      console.error('❌ Error registering token:', error);
      return null;
    }
  };

  // Handle new order notification
  const handleNewOrderNotification = async (notificationData) => {
    try {
      if (notificationData?._isLocalForegroundAlert) {
        return;
      }
      const orderId = notificationData?.orderId;
      if (!orderId) {
        return;
      }
      const now = Date.now();
      const last = groceryOrderHandledAtRef.current.get(orderId);
      const dedupeMs = 15000;
      if (last != null && now - last < dedupeMs) {
        return;
      }
      if (groceryOrderFetchInFlightRef.current.has(orderId)) {
        return;
      }
      groceryOrderFetchInFlightRef.current.add(orderId);

      console.log('📦 Handling new order notification for order ID:', orderId);
      let orderDetails;
      try {
        orderDetails = await fetchOrderDetails(orderId);
      } finally {
        groceryOrderFetchInFlightRef.current.delete(orderId);
      }
      console.log('📦 New order details fetched:', orderDetails);
      if (orderDetails) {
        groceryOrderHandledAtRef.current.set(orderId, Date.now());
        addOrder(orderDetails);
        emitNewOrderReceived(orderDetails, 'push');
        if (previousPollOrderIdsRef.current) {
          previousPollOrderIdsRef.current.add(String(orderId));
        }
        if (isPendingNewOrderStatus(orderDetails.status ?? orderDetails.orderStatus)) {
          await schedulePendingOrderSoundAlert(orderDetails);
        }
      }
    } catch (error) {
      console.error('Error handling new order notification:', error);
    }
  };

  // Fetch order details from backend
  const fetchOrderDetails = async (orderId) => {
    try {
      const endpoint = `${API_CONFIG.ENDPOINTS.ORDER_DETAILS}/${orderId}`;
      const response = await apiClient.get(endpoint);
      console.log(endpoint);
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
      const endpoint = `/orders/${orderId}/status`;
      const fullUrl = buildApiUrl(endpoint);
      const payload = { status: ORDER_STATUS.ACCEPTED };
      console.log('🔄 Sending accept order request to backend...', {
        endpoint,
        fullUrl,
        payload,
        managerId: manager?.id,
        managerName: manager?.name,
      });
      // Update backend
      const response = await apiClient.put(endpoint, {
        body: payload,
      });
      
      console.log('🔄 Accept order API response status:', response.status);
      let responseData = null;
      try {
        responseData = await response.json();
      } catch (parseError) {
        console.warn('⚠️ Accept order response was not valid JSON');
      }
      console.log('🔄 Accept order API response body:', responseData);
      
      if (response.ok) {
        console.log('✅ Order accepted successfully in backend');
        // Update frontend state
        updateOrderStatus(orderId, ORDER_STATUS.ACCEPTED);
        // Fetch latest to reflect any concurrent changes
        refreshOrders();
      } else {
        console.error('❌ Failed to accept order in backend:', response.status);
        console.error('❌ Error details:', responseData);
        // Don't mutate local state on failure to avoid divergence
      }
    } catch (error) {
      console.error('❌ Error accepting order:', error);
      // Avoid local state change on failure
    }
  };

  const markOrderReady = async (orderId, packageRack = '') => {
    if (!orderId) {
      throw new Error('Order ID is required');
    }
    const storeId = manager?.storeId || manager?.store_id;
    if (!storeId) {
      throw new Error('Store ID is required');
    }
    const rackValue = String(packageRack || '').trim();
    const endpoint = `/orders/${orderId}/status`;
    const payload = {
      status: ORDER_STATUS.READY,
      storeId,
      ...(rackValue
        ? {
            rackNumber: rackValue,
            packageRack: rackValue,
          }
        : {}),
    };
    console.log('[ui->api] PUT /orders/:orderId/status', {
      orderId,
      endpoint,
      payload,
    });
    const response = await apiClient.put(endpoint, {
      body: payload,
    });
    let responseData = null;
    try {
      responseData = await response.json();
    } catch (_) {
      responseData = null;
    }
    if (!response.ok) {
      throw new Error(
        responseData?.message || responseData?.error || 'Failed to mark order ready'
      );
    }
    const updatedOrderFromApi = responseData?.order ? normalizeOrder(responseData.order) : null;
    if (updatedOrderFromApi) {
      dispatch({ type: ACTIONS.ADD_ORDER, payload: updatedOrderFromApi });
    } else {
      const existingOrder = ordersRef.current.find(
        (order) => extractOrderIdValue(order) === normalizeValue(orderId)
      );
      if (existingOrder) {
        dispatch({
          type: ACTIONS.ADD_ORDER,
          payload: {
            ...existingOrder,
            status: ORDER_STATUS.READY,
            orderStatus: ORDER_STATUS.READY,
            backendStatus: ORDER_STATUS.READY,
            ...(rackValue
              ? {
                  packageRack: rackValue,
                  rackNumber: rackValue,
                  rack_number: rackValue,
                  pickup_rack: rackValue,
                }
              : {}),
          },
        });
      } else {
        updateOrderStatus(orderId, ORDER_STATUS.READY);
      }
    }
    try {
      const orders = await fetchOrdersFromDB();
      applyOrdersSnapshot(orders);
    } catch (fetchError) {
      console.warn('⚠️ Failed to refresh orders after mark ready:', fetchError);
    }
    return responseData;
  };

  const rejectOrder = async (orderId) => {
    console.log('❌ Rejecting order ID:', orderId);
    try {
      // Update backend
      const response = await apiClient.put(`/orders/${orderId}/status`, {
        body: { status: ORDER_STATUS.REJECTED },
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
      const requestBody = {
        scanned: true,
        pickedQuantity,
        scannedAt,
        ...(itemId ? { itemId } : {}),
      };
      
      console.log('🔄 Persisting item scan to backend:', { orderId, barcode, pickedQuantity, scannedAt, itemId });
      const res = await apiClient.put(endpoint, {
        body: requestBody,
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

  /**
   * Single step after picking: assign driver directly.
   * Backend no longer requires a separate `ready` transition before assignment.
   */
  const completePickingAndAssignDriver = async (orderId, packageRack, options = {}) => {
    if (!orderId) {
      console.error('❌ completePickingAndAssignDriver: missing orderId');
      throw new Error('Order ID is required');
    }
    if (!packageRack) {
      throw new Error('Package rack is required');
    }
    const storeId = manager?.storeId || manager?.store_id;
    if (!storeId) {
      throw new Error('Store ID is required to assign a driver');
    }

    console.log('✅ Finalizing picking → assign driver directly, ID:', orderId);

    let assignResult;
    try {
      assignResult = await assignDriver(orderId, storeId, packageRack, options);
    } catch (e) {
      throw e;
    }
    const currentOrderAssigned = wasOrderAssigned(assignResult, orderId);

    if (assignResult?.alreadyAssigned) {
      console.log('ℹ️ Order was already assigned; syncing UI as assigned:', {
        orderId,
        driverId:
          assignResult?.driverId ??
          assignResult?.driver_id ??
          assignResult?.order?.driverId ??
          assignResult?.order?.driver_id ??
          null,
      });
    }
    if (currentOrderAssigned) {
      console.log('[ui-state] setting local order status after assign', {
        orderId,
        status: ORDER_STATUS.ASSIGNED,
        packageRack,
        assignResult,
      });
      const existingOrder = ordersRef.current.find(
        (order) => extractOrderIdValue(order) === normalizeValue(orderId)
      );
      const updatedOrderFromApi = assignResult?.order ? normalizeOrder(assignResult.order) : null;
      if (updatedOrderFromApi) {
        dispatch({ type: ACTIONS.ADD_ORDER, payload: updatedOrderFromApi });
      } else if (existingOrder) {
        dispatch({
          type: ACTIONS.ADD_ORDER,
          payload: {
            ...existingOrder,
            status: ORDER_STATUS.ASSIGNED,
            orderStatus: ORDER_STATUS.ASSIGNED,
            backendStatus: ORDER_STATUS.ASSIGNED,
            packageRack,
          },
        });
      } else {
        updateOrderStatus(orderId, ORDER_STATUS.ASSIGNED);
      }
    }
    try {
      const orders = await fetchOrdersFromDB();
      applyOrdersSnapshot(orders);
    } catch (fetchError) {
      console.warn('⚠️ Failed to refresh orders after assign:', fetchError);
    }
    return assignResult;
  };

  /** Persist selected package rack on the in-memory order (e.g. after picking, before assign driver). */
  const mergeOrderPackageRack = React.useCallback((orderId, rack) => {
    if (!orderId) return;
    const targetKey = normalizeValue(orderId);
    const rackValue = String(rack || '').trim();
    if (!rackValue) return;
    const existingOrder = ordersRef.current.find(
      (o) => extractOrderIdValue(o) === targetKey
    );
    if (!existingOrder) {
      console.warn('mergeOrderPackageRack: order not found', orderId);
      return;
    }
    dispatch({
      type: ACTIONS.ADD_ORDER,
      payload: {
        ...existingOrder,
        packageRack: rackValue,
        rackNumber: rackValue,
        rack_number: rackValue,
        pickup_rack: rackValue,
      },
    });
  }, [dispatch]);

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
    completePickingAndAssignDriver,
    markOrderReady,
    mergeOrderPackageRack,
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
    },
    // Manual sync polling control
    startSyncPolling,
    stopSyncPolling
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
      if (syncIntervalRef.current) {
        console.log('🛑 Clearing sync interval');
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
      if (pollTimeoutRef.current) {
        console.log('🛑 Clearing poll timeout');
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [demoInterval]);

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
