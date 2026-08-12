import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Keyboard,
  Vibration,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  Pressable,
  Linking,
  ActivityIndicator,
  DeviceEventEmitter,
  ScrollView,
  useWindowDimensions,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useOrders, ORDER_STATUS, ITEM_STATUS } from '../context/OrdersContext';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { Image as ExpoImage } from 'expo-image';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useHardwareBarcodeWedge } from '../hooks/useHardwareBarcodeWedge';
import { downloadMediaToLocal, isImageMediaUrl, resolvePrintItemUrl } from '../utils/mediaUrl';
import { useAuth } from '../context/AuthContext';
import ExpiredProductModal from '../components/ExpiredProductModal';
import ItemExpiryBadge from '../components/ItemExpiryBadge';
import { resolvePickExpiryState } from '../utils/resolvePickExpiry';
import { getItemExpiryValue, getInventoryExpiryAlert } from '../utils/inventoryExpiry';
import { confirmAppDialog, showAppDialog } from '../context/DialogContext';
import { confirmExpiringSoonPick } from '../utils/expiryDialog';
import { showUserFacingErrorDialog } from '../utils/userFacingError';
import {
  isNoRacksAvailableError,
  resolveAssignedPackoutRack,
  showNoPackoutRacksDialog,
  showPackoutRackAssignedDialog,
} from '../utils/packoutRack';
import { formatItemWeightLabel } from '../utils/itemDisplay';

const sameOrderId = (o, routeOrderId) =>
  String(o?.id ?? o?.orderId ?? '').trim() === String(routeOrderId ?? '').trim();

const OrderPicking = ({ route, navigation }) => {
  const { orderId } = route.params;
  const { height: windowHeight } = useWindowDimensions();
  const { manager } = useAuth();
  const { 
    orders, 
    refreshOrders,
    updateItemStatus,
    markItemUnavailable,
    persistItemScan,
    markOrderReady,
    markOrderPickedUp,
  } = useOrders();
  
  const [order, setOrder] = useState(null);
  const [allPickedOrUnavailable, setAllPickedOrUnavailable] = useState(false);
  const [isAssigningDriver, setIsAssigningDriver] = useState(false);
  const [pickupOtpInput, setPickupOtpInput] = useState('');
  const [isCompletingPickup, setIsCompletingPickup] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewLocalUri, setPreviewLocalUri] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewLoadError, setPreviewLoadError] = useState('');
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadingItemId, setDownloadingItemId] = useState(null);
  const [pickingDetailItem, setPickingDetailItem] = useState(null);
  const [expiredGate, setExpiredGate] = useState(null);
  const [wedgeResume, setWedgeResume] = useState(0);
  const autoRackPromptRef = useRef(false);
  const wedgeLockRef = useRef(false);
  const orderRef = useRef(null);
  const safeItemsRef = useRef([]);
  /** Sync pick counts so rapid wedge scans don't both read stale React state. */
  const pickedQtyByItemRef = useRef({});
  const pickListRef = useRef(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const bottomBarInsetStyle = { paddingBottom: Math.max(insets.bottom, 12) };
  const pickupKeyboardOffset =
    keyboardHeight > 0 ? Math.max(0, keyboardHeight - insets.bottom) : 0;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event?.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Find the current order (normalize id types so list updates always match this screen)
  useEffect(() => {
    const currentOrder = orders.find((o) => sameOrderId(o, orderId));
    setOrder(currentOrder);
  }, [orders, orderId]);

  // Check for cancellation on screen focus and stop picking if cancelled
  const refreshOrdersRef = useRef(refreshOrders);
  refreshOrdersRef.current = refreshOrders;

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      const checkOrderStatus = async () => {
        const latest = await refreshOrdersRef.current(null, { force: true });
        if (cancelled) return;
        const list = Array.isArray(latest) ? latest : [];
        const currentOrder = list.find((o) => sameOrderId(o, orderId));
        if (currentOrder && String(currentOrder.status || currentOrder.orderStatus || '').toLowerCase() === 'cancelled') {
          showAppDialog(
            'Order cancelled',
            'This order was cancelled, so picking has been stopped.',
            [{ text: 'OK', onPress: () => navigation.goBack() }],
            {
              variant: 'warning',
              cancelable: false,
              details: [{ label: 'Order', value: `#${orderId}`, icon: 'receipt-outline' }],
            }
          );
        }
      };
      checkOrderStatus();
      return () => {
        cancelled = true;
      };
    }, [orderId, navigation])
  );

  // Get items array safely
  const items = React.useMemo(() => {
    if (!order?.items) return [];
    const itemsArray = Array.isArray(order.items)
      ? order.items
      : (() => {
          try {
            return JSON.parse(order.items || '[]');
          } catch {
            return [];
          }
        })();
    return itemsArray;
  }, [order?.items]);

  // Filter out any null/undefined entries to avoid crashes in counts and render
  const safeItems = React.useMemo(() => (items || []).filter(Boolean), [items]);

  orderRef.current = order;
  safeItemsRef.current = safeItems;

  useEffect(() => {
    pickedQtyByItemRef.current = {};
  }, [orderId]);

  useEffect(() => {
    const map = { ...pickedQtyByItemRef.current };
    for (const item of safeItems) {
      if (!item?.id) continue;
      const fromItem = Math.max(0, Number(item.pickedQuantity ?? 0));
      if (item.status === ITEM_STATUS.SCANNED) {
        map[item.id] = Math.max(1, Number(item.quantity ?? 1));
      } else {
        map[item.id] = Math.max(Number(map[item.id] ?? 0), fromItem);
      }
    }
    pickedQtyByItemRef.current = map;
  }, [safeItems]);

  const hasWedgePickLines = React.useMemo(
    () =>
      safeItems.some((item) => {
        if (!item) return false;
        const rawType = String(item.item_type || item.type || '').toLowerCase();
        const printItem =
          rawType === 'print' ||
          Boolean(
            item.fileUrl ||
              item.file_url ||
              item.printUrl ||
              item.print_url ||
              item.document_url ||
              item.documentUrl
          );
        if (printItem) return false;
        return (
          item.status !== ITEM_STATUS.SCANNED && item.status !== ITEM_STATUS.UNAVAILABLE
        );
      }),
    [safeItems]
  );

  const wedgeEnabled = Boolean(isFocused && order && hasWedgePickLines);

  const checkOrderCompletion = React.useCallback(() => {
    const list = safeItemsRef.current || [];
    const allItemsProcessed = list.every(
      (item) =>
        item.status === ITEM_STATUS.SCANNED || item.status === ITEM_STATUS.UNAVAILABLE
    );

    if (allItemsProcessed && list.length > 0) {
      showAppDialog(
        'All items processed',
        'Every item has been picked or marked unavailable. You can now mark this order as ready.',
        [{ text: 'OK' }],
        { variant: 'success', icon: 'checkmark-done-circle' }
      );
    }
  }, []);

  // Inventory lookup needs the numeric store id; managers can carry codes like "store-4".
  const storeIdForPick = React.useMemo(() => {
    const candidates = [
      manager?.storeId,
      manager?.store_id,
      order?.storeId,
      order?.store_id,
    ];
    const numeric = candidates.find((value) =>
      /^\d+$/.test(String(value ?? '').replace(/^store[-_]?/i, '').trim())
    );
    return numeric ?? candidates.find((value) => value) ?? null;
  }, [manager?.storeId, manager?.store_id, order?.storeId, order?.store_id]);

  const promptIfExpired = useCallback((payload) => {
    return new Promise((resolve) => {
      setExpiredGate({
        productName: payload.productName,
        expiryValue: payload.expiryValue,
        inventoryId: payload.inventoryId,
        resolve,
      });
    });
  }, []);

  const promptExpiringSoon = useCallback(
    (payload) =>
      confirmExpiringSoonPick({
        productName: payload.productName,
        expiryValue: payload.expiryValue,
        alert: payload.alert,
      }),
    []
  );

  const ensureProductNotExpiredForPick = useCallback(
    async (item, barcode) => {
      const expiryState = await resolvePickExpiryState({
        storeId: storeIdForPick,
        barcode,
        item,
      });

      if (expiryState.isExpired) {
        Vibration.vibrate([0, 120, 80, 120]);
        const allowed = await promptIfExpired({
          productName: item?.name || item?.productName || barcode,
          expiryValue: expiryState.expiryValue,
          inventoryId: expiryState.inventoryId,
        });
        return Boolean(allowed);
      }

      if (expiryState.isExpiringSoon && expiryState.alert) {
        Vibration.vibrate([0, 80, 60, 80]);
        const allowed = await promptExpiringSoon({
          productName: item?.name || item?.productName || barcode,
          expiryValue: expiryState.expiryValue,
          alert: expiryState.alert,
        });
        return Boolean(allowed);
      }

      return true;
    },
    [promptIfExpired, promptExpiringSoon, storeIdForPick]
  );

  const handleWedgeBarcode = useCallback(
    async (raw) => {
      const data = String(raw || '').trim();
      if (!data || wedgeLockRef.current) return;

      const ord = orderRef.current;
      const list = safeItemsRef.current || [];
      if (!ord || !list.length) return;

      const currentOrderId = ord.id || ord.orderId || orderId;
      const candidates = list
        .filter((item) => {
          if (!item) return false;
          const rawType = String(item.item_type || item.type || '').toLowerCase();
          const printItem =
            rawType === 'print' ||
            Boolean(
              item.fileUrl ||
                item.file_url ||
                item.printUrl ||
                item.print_url ||
                item.document_url ||
                item.documentUrl
            );
          if (printItem) return false;
          if (item.status === ITEM_STATUS.SCANNED || item.status === ITEM_STATUS.UNAVAILABLE) {
            return false;
          }
          const bc = String(item.barcode || '').trim();
          return bc === data;
        })
        // Prefer a line already partially scanned so multi-qty finishes on the same row.
        .sort(
          (a, b) =>
            Math.max(0, Number(b.pickedQuantity ?? 0)) - Math.max(0, Number(a.pickedQuantity ?? 0))
        );

      if (candidates.length === 0) {
        showAppDialog(
          'No matching item',
          'No open line in this order uses the scanned barcode.',
          undefined,
          {
            variant: 'warning',
            icon: 'barcode-outline',
            details: [{ label: 'Scanned', value: data, icon: 'scan-outline' }],
          }
        );
        return;
      }

      const item = candidates[0];
      wedgeLockRef.current = true;

      try {
        const canPick = await ensureProductNotExpiredForPick(item, data);
        if (!canPick) {
          return;
        }

        // One physical scan = one unit. Qty 3 toothpaste requires 3 separate scans.
        const requiredQty = Math.max(1, Number(item.quantity ?? 1));
        const prevPicked = Math.max(
          0,
          Number(pickedQtyByItemRef.current[item.id] ?? item.pickedQuantity ?? 0)
        );
        const nextPicked = Math.min(requiredQty, prevPicked + 1);
        pickedQtyByItemRef.current[item.id] = nextPicked;
        const scannedAt = new Date().toISOString();
        const isComplete = nextPicked >= requiredQty;

        if (isComplete) {
          try {
            await persistItemScan(currentOrderId, data, nextPicked, scannedAt, null);
          } catch (e) {
            console.warn('⚠️ Persist scan failed, applying local state only:', e?.message);
          }
          updateItemStatus(currentOrderId, item.id, ITEM_STATUS.SCANNED, scannedAt, nextPicked);
          Vibration.vibrate(100);
          setTimeout(() => {
            checkOrderCompletion();
          }, 450);
        } else {
          updateItemStatus(
            currentOrderId,
            item.id,
            item.status || ITEM_STATUS.PENDING,
            scannedAt,
            nextPicked
          );
          Vibration.vibrate(60);
        }
      } finally {
        wedgeLockRef.current = false;
        setWedgeResume((k) => k + 1);
      }
    },
    [
      orderId,
      persistItemScan,
      updateItemStatus,
      checkOrderCompletion,
      ensureProductNotExpiredForPick,
    ]
  );

  const { hardwareInputProps, focusCapture } = useHardwareBarcodeWedge({
    onBarcode: (d) => {
      handleWedgeBarcode(d);
    },
    enabled: wedgeEnabled,
    resumeToken: wedgeResume,
  });

  const focusCaptureRef = useRef(focusCapture);
  focusCaptureRef.current = focusCapture;

  useFocusEffect(
    React.useCallback(() => {
      Keyboard.dismiss();
      setWedgeResume((k) => k + 1);
      const t = setTimeout(() => focusCaptureRef.current(), 80);
      return () => clearTimeout(t);
    }, [])
  );

  // When every line is picked or unavailable, leave picking in one step (Accepted tab),
  // and match Android hardware back to the same behavior.
  useFocusEffect(
    React.useCallback(() => {
      if (!allPickedOrUnavailable) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        navigation.navigate('OrdersList', { selectedTab: ORDER_STATUS.ACCEPTED });
        return true;
      });
      return () => sub.remove();
    }, [allPickedOrUnavailable, navigation])
  );

  const handleLeavePicking = React.useCallback(() => {
    if (allPickedOrUnavailable) {
      navigation.navigate('OrdersList', { selectedTab: ORDER_STATUS.ACCEPTED });
    } else {
      navigation.goBack();
    }
  }, [allPickedOrUnavailable, navigation]);

  useEffect(() => {
    const currentOrderId = String(order?.id || order?.orderId || orderId || '').trim();
    if (!currentOrderId) return undefined;

    const cancellationListener = DeviceEventEmitter.addListener('orderCancelled', (payload = {}) => {
      const cancelledOrderId = String(payload?.orderId || '').trim();
      if (!cancelledOrderId || cancelledOrderId !== currentOrderId) return;

      showAppDialog(
        'Order cancelled',
        'Stop packing this order immediately.',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('OrdersList', { selectedTab: ORDER_STATUS.ACCEPTED }),
          },
        ],
        {
          variant: 'error',
          icon: 'close-circle',
          cancelable: false,
          details: payload?.reason
            ? [{ label: 'Reason', value: payload.reason, icon: 'information-circle-outline' }]
            : undefined,
        }
      );
    });

    return () => {
      cancellationListener.remove();
    };
  }, [navigation, order?.id, order?.orderId, orderId]);

  // Check if all items are picked or unavailable
  useEffect(() => {
    const scannedItems = safeItems.filter(item => item.status === ITEM_STATUS.SCANNED).length;
    const unavailableItems = safeItems.filter(item => item.status === ITEM_STATUS.UNAVAILABLE).length;
    const newAllPickedOrUnavailable = scannedItems + unavailableItems === safeItems.length && safeItems.length > 0;

    setAllPickedOrUnavailable(newAllPickedOrUnavailable);
  }, [safeItems]);

  // Check for scan success from navigation params
  useEffect(() => {
    if (route.params?.scanSuccess) {
      // Clear the param to prevent showing again
      navigation.setParams({ scanSuccess: undefined });
    }
  }, [route.params?.scanSuccess]);

  // Helper to normalize status
  const normalizeStatus = (status) => {
    if (!status) return '';
    return String(status).toLowerCase();
  };

  const isPrintItem = (item) => {
    const rawType = String(item?.item_type || item?.type || '').toLowerCase();
    return rawType === 'print' || Boolean(item?.fileUrl || item?.file_url || item?.printUrl || item?.print_url || item?.document_url || item?.documentUrl);
  };

  const getPrintFileUrl = (item) => resolvePrintItemUrl(item);

  const getPrintFileName = (item) =>
    item?.fileName || item?.file_name || item?.item_name || item?.name || 'Document';

  const isPrintItemImage = (item) => {
    const url = getPrintFileUrl(item);
    return isImageMediaUrl(url, getPrintFileName(item));
  };

  const getPrintMeta = (item) => {
    const pages = Number(item?.pages ?? item?.page_count ?? 1);
    const quantity = Number(item?.quantity ?? 1);
    const price = Number(item?.price ?? 0);
    const colorMode = String(item?.colorMode || item?.color_mode || item?.print_color || '').toLowerCase();
    const orientation = String(item?.orientation || item?.print_orientation || '').toLowerCase();
    return {
      pages: Number.isFinite(pages) && pages > 0 ? pages : 1,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      price: Number.isFinite(price) ? price : 0,
      colorMode: colorMode === 'black_white' || colorMode === 'bw' ? 'black_white' : 'color',
      orientation: orientation === 'landscape' ? 'landscape' : 'portrait',
    };
  };

  const ensureLocalFile = async (item) =>
    downloadMediaToLocal(getPrintFileUrl(item), getPrintFileName(item));

  const openPrintPreview = async (item) => {
    setPreviewItem(item);
    setPreviewLocalUri(null);
    setPreviewLoadError('');
    setIsPreviewVisible(true);

    const url = getPrintFileUrl(item);
    if (!url) {
      setPreviewLoadError('No file URL found for this item.');
      return;
    }

    if (!isPrintItemImage(item)) return;

    setIsPreviewLoading(true);
    try {
      const localUri = await downloadMediaToLocal(url, getPrintFileName(item));
      setPreviewLocalUri(localUri);
    } catch (e) {
      console.warn('⚠️ Print preview load failed:', e?.message ?? e);
      setPreviewLoadError(e?.message || 'Unable to load preview.');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const closePrintPreview = () => {
    setIsPreviewVisible(false);
    setPreviewItem(null);
    setPreviewLocalUri(null);
    setPreviewLoadError('');
    setIsPreviewLoading(false);
  };

  const markPrintDone = async (item) => {
    const currentOrderId = order?.id || order?.orderId || orderId;
    const itemId = item?.id;
    const backendItemId = item?.backendItemId ?? item?.id;
    if (!itemId) return;

    const scannedAt = new Date().toISOString();
    const pickedQty = Number(item?.quantity ?? 1);

    try {
      await persistItemScan(
        currentOrderId,
        item?.barcode || `PRINT_${itemId}`,
        pickedQty,
        scannedAt,
        backendItemId
      );
    } catch (e) {
      console.warn('⚠️ Persist print completion failed, applying local state only:', e?.message);
    }

    updateItemStatus(currentOrderId, itemId, ITEM_STATUS.SCANNED, scannedAt, pickedQty);

    setTimeout(checkOrderCompletion, 100);
  };

  const handlePrintItem = async (item) => {
    const url = getPrintFileUrl(item);
    if (!url) {
      showAppDialog('Print failed', 'No file was found for this item.', undefined, {
        variant: 'error',
        icon: 'print-outline',
      });
      return;
    }
    setIsPrinting(true);
    try {
      const localUri = await ensureLocalFile(item);
      closePrintPreview();
      await Print.printAsync({ uri: localUri });
      await markPrintDone(item);
    } catch (e) {
      await showUserFacingErrorDialog(e, { action: 'print this file' });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadItem = async (item, fromPreview = false) => {
    const url = getPrintFileUrl(item);
    if (!url) {
      showAppDialog('Download failed', 'No file was found for this item.', undefined, {
        variant: 'error',
        icon: 'cloud-download-outline',
      });
      return;
    }
    setDownloadingItemId(item?.id ?? null);
    setIsDownloading(true);
    try {
      const localUri = await ensureLocalFile(item);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri);
      }
      if (fromPreview) {
        closePrintPreview();
      }
      showAppDialog(
        'File downloaded',
        'The file was downloaded. Mark this item as printed?',
        [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Mark Printed', onPress: () => markPrintDone(item) },
        ],
        { variant: 'success', icon: 'cloud-done-outline' }
      );
    } catch (e) {
      await showUserFacingErrorDialog(e, { action: 'download this file' });
    } finally {
      setIsDownloading(false);
      setDownloadingItemId(null);
    }
  };

  const openExternalPreview = async (item) => {
    const resolvedUrl = getPrintFileUrl(item);
    if (!resolvedUrl) return;
    try {
      const localUri = await ensureLocalFile(item);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri);
        return;
      }
      const canOpen = await Linking.canOpenURL(resolvedUrl);
      if (canOpen) {
        await Linking.openURL(resolvedUrl);
      } else {
        showAppDialog('Preview not available', 'Unable to open this file.', undefined, {
          variant: 'warning',
          icon: 'eye-off-outline',
        });
      }
    } catch (e) {
      await showUserFacingErrorDialog(e, { action: 'open this file' });
    }
  };

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Order not found</Text>
      </SafeAreaView>
    );
  }

  const orderStatusNorm = normalizeStatus(order.status ?? order.orderStatus);
  const isPickupOrder =
    String(order?.fulfillmentType ?? order?.fulfillment_type ?? 'delivery').toLowerCase() === 'pickup';
  const canMarkReady =
    allPickedOrUnavailable &&
    !['ready', 'assigned', 'delivered', 'completed', 'cancelled', 'picked_up', 'pickedup'].includes(orderStatusNorm) &&
    orderStatusNorm === 'accepted';
  const canCompletePickup =
    isPickupOrder &&
    ['ready'].includes(orderStatusNorm);

  const handleMarkReady = async () => {
    const targetOrderId = order.id || order.orderId || orderId;
    console.log('[OrderPicking] Mark as ready tapped', { orderId: targetOrderId, isPickupOrder });
    try {
      setIsAssigningDriver(true);
      const result = await markOrderReady(targetOrderId);
      if (isPickupOrder) {
        await showAppDialog(
          'Pickup order ready',
          'The customer has been notified by SMS with the pickup OTP.',
          [{ text: 'OK' }],
          { variant: 'success', icon: 'bag-check' }
        );
      } else {
        const resolvedRack = resolveAssignedPackoutRack(result);
        if (resolvedRack) {
          await showPackoutRackAssignedDialog(resolvedRack);
        } else {
          await showNoPackoutRacksDialog();
        }
      }
      navigation.navigate('OrdersList', {
        selectedTab: isPickupOrder ? ORDER_STATUS.PICKUP_AT_STORE : ORDER_STATUS.ACCEPTED,
      });
    } catch (error) {
      console.log('[OrderPicking] Mark as ready failed', {
        orderId: targetOrderId,
        error: error?.message || String(error),
      });
      if (isNoRacksAvailableError(error)) {
        await showNoPackoutRacksDialog();
        return;
      }
      const msg = error?.message || 'Failed to mark order ready. Please try again.';
      const normalizedMessage = String(msg).toLowerCase();
      const isNoDriverError =
        normalizedMessage.includes('no drivers available') ||
        normalizedMessage.includes('driver at max active limit') ||
        normalizedMessage.includes('availability changed');
      if (isNoDriverError) {
        showAppDialog(
          'No drivers available',
          "Couldn't find an available driver right now. Please try again shortly.",
          [{ text: 'OK' }],
          { variant: 'warning', icon: 'alert-circle-outline' }
        );
      } else {
        await showUserFacingErrorDialog(error, { action: 'mark this order ready' });
      }
    } finally {
      setIsAssigningDriver(false);
    }
  };

  const handleCompletePickup = async () => {
    const targetOrderId = order.id || order.orderId || orderId;
    const otp = String(pickupOtpInput || '').trim();
    if (!/^\d{4}$/.test(otp)) {
      showAppDialog(
        'Invalid OTP',
        'Enter the 4-digit pickup OTP from the customer’s SMS or the delivery OTP from their app.',
        undefined,
        { variant: 'warning', icon: 'keypad-outline' }
      );
      return;
    }
    try {
      setIsCompletingPickup(true);
      await markOrderPickedUp(targetOrderId, otp);
      await showAppDialog('Pickup complete', 'This order is now marked as delivered.', [{ text: 'OK' }], {
        variant: 'success',
        icon: 'bag-check',
        highlight: {
          icon: 'storefront-outline',
          label: 'Fulfilment',
          value: 'Picked up at store',
        },
      });
      navigation.navigate('OrdersList', { selectedTab: ORDER_STATUS.COMPLETED });
    } catch (error) {
      const message = error?.message || 'Failed to complete pickup.';
      const isExpired = String(message).toLowerCase().includes('expired');
      if (isExpired) {
        showAppDialog('OTP expired', 'This pickup OTP has expired. Please ask the customer for a new code.', undefined, {
          variant: 'error',
          icon: 'time-outline',
        });
      } else {
        await showUserFacingErrorDialog(error, { action: 'complete this pickup' });
      }
    } finally {
      setIsCompletingPickup(false);
    }
  };

  const getItemStatusColor = (status) => {
    switch (status) {
      case ITEM_STATUS.PENDING:
        return '#FF9500';
      case ITEM_STATUS.LOCATED:
        return '#007AFF';
      case ITEM_STATUS.SCANNED:
        return '#34C759';
      case ITEM_STATUS.UNAVAILABLE:
        return '#FF3B30';
      default:
        return '#8E8E93';
    }
  };

  const getItemStatusIcon = (status) => {
    switch (status) {
      case ITEM_STATUS.PENDING:
        return 'time-outline';
      case ITEM_STATUS.LOCATED:
        return 'location-outline';
      case ITEM_STATUS.SCANNED:
        return 'checkmark-circle';
      case ITEM_STATUS.UNAVAILABLE:
        return 'close-circle';
      default:
        return 'help-outline';
    }
  };

  const handleLocateItem = (item) => {
    updateItemStatus(orderId, item.id, ITEM_STATUS.LOCATED);
    const rack = item.rack || {};
    const rackLabel = String(
      item?.product_racknumber ||
        rack?.location ||
        item?.rack_number ||
        item?.rackNumber ||
        ''
    ).trim();
    showAppDialog(
      'Find this item',
      item.name,
      [
        { text: 'Got it', style: 'cancel' },
        { text: 'Scan Item', onPress: () => handleScanItem(item) },
      ],
      {
        variant: 'info',
        icon: 'navigate',
        highlight: {
          icon: 'grid-outline',
          label: 'Rack',
          value: rackLabel || 'Not set',
        },
        details: [
          { label: 'Aisle', value: rack.aisle || '—', icon: 'git-branch-outline' },
          rack.description
            ? { label: 'Notes', value: rack.description, icon: 'document-text-outline' }
            : null,
        ].filter(Boolean),
      }
    );
  };

  const handleMarkUnavailable = async (item) => {
    const confirmed = await confirmAppDialog({
      title: 'Mark item unavailable',
      message: 'This tells the customer the item is out of stock and cannot be picked.',
      confirmText: 'Mark Unavailable',
      destructive: true,
      icon: 'remove-circle',
      details: [{ label: 'Item', value: item.name, icon: 'cube-outline' }],
    });
    if (!confirmed) return;

    markItemUnavailable(orderId, item.id);
    setTimeout(checkOrderCompletion, 100);
  };

  const handleScanItem = (item, options = {}) => {
    const useCamera = options.useCamera === true;
    const currentOrderId = order?.id || order?.orderId || orderId;
    const alreadyPicked = Math.max(0, Number(item.pickedQuantity ?? 0));
    const requiredQuantity = Math.max(1, Number(item.quantity ?? 1));
    navigation.navigate('BarcodeScanner', {
      orderId: currentOrderId,
      itemId: item.id,
      expectedBarcode: item.barcode,
      itemName: item.productName || item.name,
      requiredQuantity,
      alreadyPickedQuantity: alreadyPicked,
      scanWithCamera: useCamera,
      storeId: storeIdForPick,
      inventoryId: item.inventory_id || item.inventoryId || null,
      expiryDate: item.expiry_date || item.expiryDate || null,
      onScanSuccess: async (scannedBarcode, quantity) => {
        const totalPicked = Math.max(1, Number(quantity ?? requiredQuantity));
        pickedQtyByItemRef.current[item.id] = totalPicked;
        try {
          await persistItemScan(
            currentOrderId,
            scannedBarcode,
            totalPicked,
            new Date().toISOString(),
            null
          );
        } catch (e) {
          console.warn('⚠️ Persist scan failed, applying local state only:', e?.message);
        }
        updateItemStatus(
          currentOrderId,
          item.id,
          ITEM_STATUS.SCANNED,
          new Date().toISOString(),
          totalPicked
        );
        setTimeout(checkOrderCompletion, 100);
      },
      onScanProgress: (scannedBarcode, pickedSoFar) => {
        const next = Math.max(0, Number(pickedSoFar ?? 0));
        pickedQtyByItemRef.current[item.id] = next;
        updateItemStatus(
          currentOrderId,
          item.id,
          item.status || ITEM_STATUS.PENDING,
          new Date().toISOString(),
          next
        );
      },
    });
  };

  const renderItemExpiryLine = (item) => {
    if (isPrintItem(item)) return null;
    return <ItemExpiryBadge item={item} />;
  };

  const renderItemExpiryDetailLine = (item) => {
    if (isPrintItem(item)) return null;
    const expiryValue = getItemExpiryValue(item);
    const alert = getInventoryExpiryAlert(expiryValue);
    if (!alert) return null;
    return (
      <Text
        style={
          alert.status === 'expired'
            ? styles.pickingDetailExpiryExpired
            : styles.pickingDetailExpirySoon
        }
      >
        Expiry: {alert.label}
        {expiryValue ? ` (${String(expiryValue).slice(0, 10)})` : ''}
      </Text>
    );
  };

  const getItemWeightLabel = (item) => formatItemWeightLabel(item, '—');

  const renderBarcodeHighlight = (barcodeValue) => {
    if (!barcodeValue) return null;
    return (
      <View style={styles.barcodeHighlight}>
        <Ionicons name="barcode-outline" size={18} color="#7A4F01" />
        <Text style={styles.barcodeHighlightText}>{String(barcodeValue)}</Text>
      </View>
    );
  };

  const renderItemCard = ({ item }) => {
    const printItem = isPrintItem(item);
    const meta = printItem ? getPrintMeta(item) : null;
    const displayName = printItem ? getPrintFileName(item) : item.name;
    const displayCategory = printItem ? 'Print file' : item.category;
    const barcodeValue = !printItem ? item.barcode : '';
    const quantity = Math.max(0, Number(item?.quantity ?? 0));
    const weightLabel = getItemWeightLabel(item);
    const scannedCount =
      item.status === ITEM_STATUS.SCANNED
        ? quantity
        : Math.max(0, Number(item.pickedQuantity ?? pickedQtyByItemRef.current[item.id] ?? 0));
    if (item.status === ITEM_STATUS.SCANNED || item.status === ITEM_STATUS.UNAVAILABLE) {
      const picked = item.status === ITEM_STATUS.SCANNED;
      return (
        <TouchableOpacity
          style={[
            styles.itemCardCompact,
            picked ? styles.itemCardCompactPicked : styles.itemCardCompactUnavail,
          ]}
          onPress={() => setPickingDetailItem(item)}
          activeOpacity={0.72}
        >
          <View style={styles.itemCardCompactRow}>
            {printItem ? (
              <View style={styles.itemThumbPrint}>
                <Ionicons name="document-text-outline" size={22} color="#007AFF" />
              </View>
            ) : (
              <Image source={{ uri: item.image }} style={styles.itemThumbImage} />
            )}
            <Text style={styles.itemCardCompactName} numberOfLines={2}>
              {displayName}
            </Text>
            {picked ? (
              <Ionicons name="checkmark-circle" size={26} color="#34C759" />
            ) : (
              <Ionicons name="close-circle" size={26} color="#FF3B30" />
            )}
          </View>
          <Text
            style={picked ? styles.itemCardCompactSub : styles.itemCardCompactSubUnavail}
            numberOfLines={1}
          >
            {picked
              ? printItem
                ? `Printed${item.scannedAt ? ` · ${new Date(item.scannedAt).toLocaleTimeString()}` : ''}`
                : `Picked ${scannedCount}/${quantity}`
              : printItem
                ? 'Cannot print'
                : 'Not available'}
          </Text>
          {picked && !printItem ? (
            <Text style={styles.itemCardCompactWeight} numberOfLines={1}>
              Weight: {weightLabel}
            </Text>
          ) : null}
          {!printItem ? renderBarcodeHighlight(barcodeValue) : null}
          <Text style={styles.itemCardCompactHint}>Tap for details</Text>
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          {printItem ? (
            <View style={styles.printItemIcon}>
              <Ionicons name="document-text-outline" size={24} color="#007AFF" />
            </View>
          ) : (
            <Image source={{ uri: item.image }} style={styles.itemImage} />
          )}
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{displayName}</Text>
            <Text style={styles.itemCategory}>{displayCategory}</Text>
            {printItem ? (
              <>
                <Text style={styles.itemDetails}>
                  Pages: {meta.pages} | {meta.colorMode === 'black_white' ? 'B/W' : 'Color'} | {meta.orientation}
                </Text>
                <Text style={styles.itemDetails}>Qty: {meta.quantity}</Text>
              </>
            ) : (
              <>
                <View style={styles.pickMetaRow}>
                  <View style={styles.pickMetaChip}>
                    <Text style={styles.pickMetaChipLabel}>Qty</Text>
                    <Text style={styles.pickMetaChipValue}>{quantity}</Text>
                  </View>
                  <View style={[styles.pickMetaChip, styles.pickMetaChipWeight]}>
                    <Text style={styles.pickMetaChipLabel}>Weight</Text>
                    <Text style={styles.pickMetaChipValue} numberOfLines={1}>
                      {weightLabel}
                    </Text>
                  </View>
                </View>
                {renderBarcodeHighlight(barcodeValue)}
                {renderItemExpiryLine(item)}
              </>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getItemStatusColor(item.status) }]}>
            <Ionicons
              name={getItemStatusIcon(item.status)}
              size={16}
              color="#FFFFFF"
            />
          </View>
        </View>

        {!printItem && quantity > 0 ? (
          <View
            style={[
              styles.scanCountBanner,
              scannedCount > 0 ? styles.scanCountBannerActive : null,
            ]}
          >
            <Ionicons
              name="layers-outline"
              size={18}
              color={scannedCount > 0 ? '#FFFFFF' : '#0F5132'}
            />
            <Text
              style={[
                styles.scanCountBannerText,
                scannedCount > 0 ? styles.scanCountBannerTextActive : null,
              ]}
            >
              {scannedCount}/{quantity} scanned
            </Text>
          </View>
        ) : null}

        {!printItem && (
          <View style={styles.rackInfo}>
            <View style={styles.rackHeader}>
              <Ionicons name="location" size={16} color="#007AFF" />
              <Text style={styles.rackTitle}>
                Rack:{' '}
                {String(
                  item?.product_racknumber || item?.rack?.location || item?.rack_number || item?.rackNumber || ''
                ).trim() || '—'}
              </Text>
            </View>
            {item?.rack?.aisle ? <Text style={styles.rackAisle}>{item.rack.aisle}</Text> : null}
            {item?.rack?.description ? (
              <Text style={styles.rackDescription}>{item.rack.description}</Text>
            ) : null}
          </View>
        )}

        <View style={styles.itemActions}>
          {printItem ? (
            <>
              <TouchableOpacity
                style={[styles.printButton, item.status === ITEM_STATUS.SCANNED && styles.printButtonDisabled]}
                onPress={() => openPrintPreview(item)}
                disabled={item.status === ITEM_STATUS.SCANNED}
              >
                <Ionicons name="print-outline" size={16} color="#FFFFFF" />
                <Text style={styles.buttonText}>{item.status === ITEM_STATUS.SCANNED ? 'Printed' : 'Print'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.downloadButton}
                onPress={() => handleDownloadItem(item)}
                disabled={isDownloading && downloadingItemId === item.id}
              >
                {isDownloading && downloadingItemId === item.id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                )}
              </TouchableOpacity>

              {item.status !== ITEM_STATUS.SCANNED && item.status !== ITEM_STATUS.UNAVAILABLE && (
                <TouchableOpacity
                  style={styles.scanButton}
                  onPress={() => markPrintDone(item)}
                >
                  <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Mark Printed</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {item.status === ITEM_STATUS.PENDING && (
                <TouchableOpacity
                  style={styles.locateButton}
                  onPress={() => handleLocateItem(item)}
                >
                  <Ionicons name="navigate" size={16} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Navigate</Text>
                </TouchableOpacity>
              )}

              {item.status !== ITEM_STATUS.SCANNED && item.status !== ITEM_STATUS.UNAVAILABLE && (
                <TouchableOpacity
                  style={styles.cameraScanButton}
                  onPress={() => handleScanItem(item, { useCamera: true })}
                >
                  <Ionicons name="camera-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Camera</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Not Available temporarily hidden
          {item.status !== ITEM_STATUS.SCANNED && item.status !== ITEM_STATUS.UNAVAILABLE && (
            <TouchableOpacity
              style={styles.unavailableButton}
              onPress={() => handleMarkUnavailable(item)}
            >
              <Ionicons name="close" size={16} color="#FFFFFF" />
              <Text style={styles.buttonText}>{printItem ? 'Cannot Print' : 'Not Available'}</Text>
            </TouchableOpacity>
          )}
          */}
        </View>
      </View>
    );
  };

  const scannedItems = safeItems.filter(item => item.status === ITEM_STATUS.SCANNED).length;
  const unavailableItems = safeItems.filter(item => item.status === ITEM_STATUS.UNAVAILABLE).length;
  const totalItems = safeItems.length;
  const previewMeta = previewItem ? getPrintMeta(previewItem) : null;
  const previewIsImage = previewItem ? isPrintItemImage(previewItem) : false;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <TextInput {...hardwareInputProps} />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleLeavePicking}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
            {String(order.id || order.orderId || '').trim()}
          </Text>
        </View>
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>
            {scannedItems + unavailableItems}/{totalItems}
          </Text>
        </View>
      </View>

      <View style={styles.progressBar}>
        <View 
          style={[
            styles.progressFill, 
            { width: `${totalItems > 0 ? (((scannedItems + unavailableItems) / totalItems) * 100) : 0}%` }
          ]} 
        />
      </View>

      {hasWedgePickLines ? (
        <View style={styles.scannerHintBanner}>
          <Ionicons name="barcode-outline" size={18} color="#0F5132" />
          <Text style={styles.scannerHintText}>Scanner ready — scan once per unit.</Text>
        </View>
      ) : null}

      <Modal
        transparent
        visible={isPreviewVisible}
        animationType="fade"
        onRequestClose={closePrintPreview}
      >
        <Pressable style={styles.previewBackdrop} onPress={closePrintPreview}>
          <Pressable style={styles.previewCard} onPress={() => {}}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Print Preview</Text>
              <TouchableOpacity onPress={closePrintPreview}>
                <Ionicons name="close" size={20} color="#111111" />
              </TouchableOpacity>
            </View>
            {previewItem ? (
              <>
                <Text style={styles.previewFileName}>{getPrintFileName(previewItem)}</Text>
                <View style={styles.previewBody}>
                  {isPreviewLoading ? (
                    <View style={styles.previewPlaceholder}>
                      <ActivityIndicator size="large" color="#007AFF" />
                      <Text style={styles.previewPlaceholderText}>Loading preview...</Text>
                    </View>
                  ) : previewLoadError ? (
                    <View style={styles.previewPlaceholder}>
                      <Ionicons name="alert-circle-outline" size={44} color="#B42318" />
                      <Text style={styles.previewPlaceholderText}>{previewLoadError}</Text>
                    </View>
                  ) : previewIsImage && previewLocalUri ? (
                    <ExpoImage source={{ uri: previewLocalUri }} style={styles.previewImage} contentFit="contain" />
                  ) : (
                    <View style={styles.previewPlaceholder}>
                      <Ionicons name="document-text-outline" size={44} color="#666666" />
                      <Text style={styles.previewPlaceholderText}>
                        {previewIsImage ? 'Preview not available' : 'Preview not available for this file type'}
                      </Text>
                      {previewItem ? (
                        <TouchableOpacity
                          style={styles.previewLinkButton}
                          onPress={() => openExternalPreview(previewItem)}
                        >
                          <Ionicons name="open-outline" size={16} color="#007AFF" />
                          <Text style={styles.previewLinkText}>Open File</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  )}
                </View>
                {previewMeta ? (
                  <View style={styles.previewMeta}>
                    <Text style={styles.previewMetaText}>Pages: {previewMeta.pages}</Text>
                    <Text style={styles.previewMetaText}>
                      Color: {previewMeta.colorMode === 'black_white' ? 'B/W' : 'Color'}
                    </Text>
                    <Text style={styles.previewMetaText}>Orientation: {previewMeta.orientation}</Text>
                  </View>
                ) : null}
                <View style={styles.previewActions}>
                  <TouchableOpacity
                    style={styles.previewPrintButton}
                    onPress={() => handlePrintItem(previewItem)}
                    disabled={isPrinting}
                  >
                    {isPrinting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="print-outline" size={16} color="#FFFFFF" />
                    )}
                    <Text style={styles.previewActionText}>
                      {isPrinting ? 'Printing...' : 'Print'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.previewDownloadButton}
                    onPress={() => handleDownloadItem(previewItem, true)}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                    )}
                    <Text style={styles.previewActionText}>Download</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={pickingDetailItem != null}
        animationType="fade"
        onRequestClose={() => setPickingDetailItem(null)}
      >
        <Pressable style={styles.pickingDetailBackdrop} onPress={() => setPickingDetailItem(null)}>
          <Pressable style={styles.pickingDetailCard} onPress={() => {}}>
            {pickingDetailItem ? (
              <>
                <Text style={styles.pickingDetailTitle}>
                  {isPrintItem(pickingDetailItem)
                    ? getPrintFileName(pickingDetailItem)
                    : pickingDetailItem.name}
                </Text>
                {isPrintItem(pickingDetailItem) ? (
                  <>
                    <Text style={styles.pickingDetailLine}>
                      Status:{' '}
                      {pickingDetailItem.status === ITEM_STATUS.SCANNED ? 'Printed' : 'Unavailable'}
                    </Text>
                    <Text style={styles.pickingDetailLine}>
                      Pages: {getPrintMeta(pickingDetailItem).pages} ·{' '}
                      {getPrintMeta(pickingDetailItem).colorMode === 'black_white' ? 'B/W' : 'Color'} ·{' '}
                      {getPrintMeta(pickingDetailItem).orientation}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.pickingDetailLine}>Category: {pickingDetailItem.category || '—'}</Text>
                    {renderBarcodeHighlight(pickingDetailItem.barcode)}
                    <Text style={styles.pickingDetailLine}>
                      Qty: {pickingDetailItem.quantity}
                    </Text>
                    <Text style={styles.pickingDetailLine}>
                      Weight: {getItemWeightLabel(pickingDetailItem)}
                    </Text>
                    {!isPrintItem(pickingDetailItem) ? (
                      <Text style={styles.pickingDetailLine}>
                        Scanned:{' '}
                        {pickingDetailItem.status === ITEM_STATUS.SCANNED
                          ? pickingDetailItem.quantity
                          : Math.max(0, Number(pickingDetailItem.pickedQuantity ?? 0))}
                        /{pickingDetailItem.quantity}
                      </Text>
                    ) : null}
                    <Text style={styles.pickingDetailLine}>
                      Rack:{' '}
                      {String(
                        pickingDetailItem?.product_racknumber ||
                          pickingDetailItem?.rack?.location ||
                          pickingDetailItem?.rack_number ||
                          pickingDetailItem?.rackNumber ||
                          ''
                      ).trim() || '—'}
                      {pickingDetailItem?.rack?.aisle
                        ? ` · Aisle: ${pickingDetailItem.rack.aisle}`
                        : ''}
                    </Text>
                    {pickingDetailItem.rack?.description ? (
                      <Text style={styles.pickingDetailLine}>{pickingDetailItem.rack.description}</Text>
                    ) : null}
                    {renderItemExpiryDetailLine(pickingDetailItem)}
                  </>
                )}
                {pickingDetailItem.scannedAt ? (
                  <Text style={styles.pickingDetailMeta}>
                    {pickingDetailItem.status === ITEM_STATUS.SCANNED ? 'Completed' : 'Updated'}:{' '}
                    {new Date(pickingDetailItem.scannedAt).toLocaleString()}
                  </Text>
                ) : null}
                <TouchableOpacity style={styles.pickingDetailClose} onPress={() => setPickingDetailItem(null)}>
                  <Text style={styles.pickingDetailCloseText}>Close</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
      <FlatList
        ref={pickListRef}
        style={styles.pickList}
        data={safeItems}
        extraData={safeItems
          .map((i) => `${i?.id}:${i?.pickedQuantity ?? 0}:${i?.status}`)
          .join('|')}
        renderItem={renderItemCard}
        keyExtractor={(item, index) =>
          [
            order?.id || order?.orderId || 'order',
            item?.item_type || item?.type || 'item',
            item?.id ?? item?.barcode ?? item?.fileName ?? item?.name ?? 'unknown',
            index,
          ].join(':')
        }
        contentContainerStyle={styles.pickListContent}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          <View
            style={[
              styles.listFooterSpacer,
              canCompletePickup && styles.listFooterSpacerPickup,
            ]}
          />
        }
      />

      {canMarkReady ? (
        <View style={[styles.bottomAssignBar, bottomBarInsetStyle]}>
          <View style={styles.readyRowTop}>
            <Ionicons name="checkmark-circle" size={18} color="#34C759" />
            <Text style={styles.readyMessageOneLine} numberOfLines={2}>
              {isPickupOrder
                ? 'All items processed — mark ready and notify customer.'
                : 'All items processed — mark order ready.'}
            </Text>
          </View>
          <View style={styles.readyActionsRow}>
            <TouchableOpacity
              style={[
                styles.markReadyButton,
                isAssigningDriver && styles.markReadyButtonDisabled,
              ]}
              disabled={isAssigningDriver}
              onPress={() => {
                void handleMarkReady();
              }}
            >
              <Ionicons name="checkmark-done-outline" size={18} color="#FFFFFF" />
              <Text style={styles.markReadyButtonText}>
                {isAssigningDriver
                  ? 'Checking…'
                  : isPickupOrder
                  ? 'Mark Ready & Notify'
                  : 'Assign Driver'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {canCompletePickup ? (
        <View
          style={[
            styles.bottomAssignBar,
            bottomBarInsetStyle,
            pickupKeyboardOffset > 0 && { marginBottom: pickupKeyboardOffset },
          ]}
        >
          <Text style={styles.pickupHandoverTitle}>Complete pickup</Text>
          <Text style={styles.pickupHandoverHint} numberOfLines={3}>
            Accept pickup SMS OTP or Delivery OTP from the customer's LittleKart app.
          </Text>
          <View style={styles.pickupCompleteRow}>
            <TextInput
              value={pickupOtpInput}
              onChangeText={setPickupOtpInput}
              placeholder="OTP"
              keyboardType="number-pad"
              maxLength={4}
              style={styles.pickupOtpInputField}
              returnKeyType="done"
              onFocus={() => {
                requestAnimationFrame(() => {
                  pickListRef.current?.scrollToEnd({ animated: true });
                });
              }}
              onSubmitEditing={() => {
                void handleCompletePickup();
              }}
            />
            <TouchableOpacity
              style={[
                styles.pickupCompleteButton,
                isCompletingPickup && styles.pickupCompleteButtonDisabled,
              ]}
              disabled={isCompletingPickup}
              onPress={() => {
                void handleCompletePickup();
              }}
            >
              <Text style={styles.pickupCompleteButtonText}>
                {isCompletingPickup ? 'Saving…' : 'Complete'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <ExpiredProductModal
        visible={Boolean(expiredGate)}
        productName={expiredGate?.productName}
        expiryValue={expiredGate?.expiryValue}
        inventoryId={expiredGate?.inventoryId}
        onPickAnother={() => {
          const resolve = expiredGate?.resolve;
          setExpiredGate(null);
          resolve?.(false);
          setWedgeResume((k) => k + 1);
        }}
        onExpiryUpdated={() => {
          const resolve = expiredGate?.resolve;
          setExpiredGate(null);
          resolve?.(true);
        }}
      />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  keyboardAvoidingContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
    minHeight: 28,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000000',
  },
  progressContainer: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E5E5',
    marginHorizontal: 16,
    borderRadius: 2,
  },
  progressFill: {
    height: 4,
    backgroundColor: '#34C759',
    borderRadius: 2,
  },
  scannerHintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#D1E7DD',
    borderRadius: 8,
  },
  scannerHintText: {
    flex: 1,
    fontSize: 13,
    color: '#0F5132',
    lineHeight: 18,
  },
  scanCountBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#D1E7DD',
  },
  scanCountBannerActive: {
    backgroundColor: '#0F5132',
  },
  scanCountBannerText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F5132',
  },
  scanCountBannerTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
  },
  pickList: {
    flex: 1,
  },
  pickListContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  listFooterSpacer: {
    height: 20,
  },
  listFooterSpacerPickup: {
    height: 120,
  },
  itemCardCompact: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E8E8ED',
  },
  itemCardCompactPicked: {
    borderColor: '#C8E6C9',
    backgroundColor: '#F4FBF5',
  },
  itemCardCompactUnavail: {
    borderColor: '#F5C6C6',
    backgroundColor: '#FFF8F8',
  },
  itemCardCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemThumbImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  itemThumbPrint: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCardCompactName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  itemCardCompactSub: {
    marginTop: 8,
    fontSize: 16,
    color: '#1B5E20',
    fontWeight: '700',
  },
  itemCardCompactSubUnavail: {
    marginTop: 8,
    fontSize: 15,
    color: '#C62828',
    fontWeight: '600',
  },
  itemCardCompactWeight: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
  },
  itemCardCompactHint: {
    marginTop: 2,
    fontSize: 11,
    color: '#8E8E93',
  },
  pickingDetailBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  pickingDetailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  pickingDetailTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  pickingDetailLine: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    lineHeight: 20,
  },
  pickingDetailExpiryExpired: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B91C1C',
    marginBottom: 8,
    lineHeight: 20,
  },
  pickingDetailExpirySoon: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B45309',
    marginBottom: 8,
    lineHeight: 20,
  },
  pickingDetailMeta: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    marginBottom: 14,
  },
  pickingDetailClose: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pickingDetailCloseText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  itemHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  printItemIcon: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 2,
  },
  itemCategory: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 4,
  },
  itemDetails: {
    fontSize: 14,
    color: '#333333',
    marginBottom: 2,
  },
  pickMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  pickMetaChip: {
    minWidth: 72,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },
  pickMetaChipWeight: {
    flexGrow: 1,
    backgroundColor: '#E8F5E9',
  },
  pickMetaChipLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 2,
  },
  pickMetaChipValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  barcodeHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 2,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FFF3CD',
    borderWidth: 1,
    borderColor: '#FFECB5',
  },
  barcodeHighlightText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#7A4F01',
    fontVariant: ['tabular-nums'],
  },
  barcode: {
    fontSize: 12,
    color: '#999999',
  },
  statusBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rackInfo: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  rackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  rackTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 4,
  },
  rackAisle: {
    fontSize: 14,
    color: '#333333',
    marginBottom: 2,
  },
  rackDescription: {
    fontSize: 12,
    color: '#666666',
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  locateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  cameraScanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5856D6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  unavailableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  printButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5856D6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  printButtonDisabled: {
    opacity: 0.6,
  },
  downloadButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A84FF',
    width: 34,
    height: 34,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  completedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  completedText: {
    color: '#34C759',
    fontSize: 14,
    fontWeight: '600',
  },
  scannedTimeText: {
    color: '#34C759',
    fontSize: 12,
    marginLeft: 8,
    fontStyle: 'italic',
  },
  unavailableIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFE8E8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  unavailableText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 50,
  },
  bottomAssignBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 4,
  },
  readyButtonContainer: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: '#EEF2F7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8DEE6',
  },
  readyRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  readyMessageOneLine: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
    lineHeight: 18,
  },
  readyActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  rackHalf: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#C5CCD6',
    justifyContent: 'center',
    minHeight: 52,
  },
  rackHalfLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  rackHalfValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  assignHalf: {
    flex: 1,
    backgroundColor: '#34C759',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 52,
    paddingHorizontal: 8,
  },
  assignHalfDisabled: {
    backgroundColor: '#A8B0BC',
  },
  assignHalfText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  markReadyButton: {
    flex: 1,
    backgroundColor: '#34C759',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 52,
    paddingHorizontal: 12,
  },
  markReadyButtonDisabled: {
    backgroundColor: '#A8B0BC',
  },
  markReadyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  pickupHandoverTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  pickupHandoverHint: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 18,
  },
  pickupCompleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickupOtpInputField: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 20,
    letterSpacing: 6,
    textAlign: 'center',
    minHeight: 52,
  },
  pickupCompleteButton: {
    backgroundColor: '#34C759',
    borderRadius: 10,
    minHeight: 52,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupCompleteButtonDisabled: {
    backgroundColor: '#A8B0BC',
  },
  pickupCompleteButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  rackSelector: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rackSelectorLabel: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 4,
  },
  rackSelectorValue: {
    fontSize: 16,
    color: '#111111',
    fontWeight: '700',
  },
  markReadyButton: {
    backgroundColor: '#34C759',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    gap: 8,
  },
  markReadyButtonDisabled: {
    opacity: 0.65,
  },
  markReadyButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  rackPickerCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
  rackPickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
  rackPickerSubtitle: {
    fontSize: 13,
    color: '#666666',
    marginTop: 6,
    marginBottom: 14,
  },
  rackGridScroll: {
    flexGrow: 0,
  },
  rackGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 4,
  },
  rackOption: {
    width: '18%',
    minWidth: 58,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rackOptionSelected: {
    backgroundColor: '#007AFF',
  },
  rackOptionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333333',
  },
  rackOptionTextSelected: {
    color: '#FFFFFF',
  },
  previewCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  previewFileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 10,
  },
  previewBody: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  previewPlaceholder: {
    alignItems: 'center',
    gap: 8,
  },
  previewPlaceholderText: {
    fontSize: 13,
    color: '#666666',
  },
  previewLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  previewLinkText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '600',
  },
  previewMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  previewMetaText: {
    fontSize: 12,
    color: '#555555',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  previewPrintButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#5856D6',
    paddingVertical: 12,
    borderRadius: 10,
  },
  previewDownloadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0A84FF',
    paddingVertical: 12,
    borderRadius: 10,
  },
  previewActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default OrderPicking;
