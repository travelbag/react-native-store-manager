import React, { useState, useEffect } from 'react';
import { View, Text, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useOrders, ORDER_STATUS, ITEM_STATUS } from '../context/OrdersContext';
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  Pressable,
  Linking,
  ActivityIndicator,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const PACKAGE_RACK_OPTIONS = ['A', 'B', 'C', 'D'].flatMap((col) =>
  Array.from({ length: 15 }, (_, idx) => `${col}${idx + 1}`)
);

const OrderPicking = ({ route, navigation }) => {
  const { orderId } = route.params;
  const { 
    orders, 
    refreshOrders,
    updateItemStatus,
    markItemUnavailable,
    persistItemScan,
    completePickingAndAssignDriver,
  } = useOrders();
  
  const [order, setOrder] = useState(null);
  const [allPickedOrUnavailable, setAllPickedOrUnavailable] = useState(false);
  const [isAssigningDriver, setIsAssigningDriver] = useState(false);
  const [selectedPackageRack, setSelectedPackageRack] = useState('');
  const [isRackPickerVisible, setIsRackPickerVisible] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadingItemId, setDownloadingItemId] = useState(null);

  // Find the current order
  useEffect(() => {
    const currentOrder = orders.find(o => (o.id || o.orderId) === orderId);
    setOrder(currentOrder);
  }, [orders, orderId]);

  useEffect(() => {
    const rackFromOrder = String(order?.packageRack || '').trim();
    if (rackFromOrder) {
      setSelectedPackageRack(rackFromOrder);
    }
  }, [order?.packageRack]);

  // Check for cancellation on screen focus and stop picking if cancelled
  useFocusEffect(
    React.useCallback(() => {
      const checkOrderStatus = async () => {
        await refreshOrders(null, { force: true }); // Ensure latest data
        const currentOrder = orders.find(o => (o.id || o.orderId) === orderId);
        if (currentOrder && String(currentOrder.status || currentOrder.orderStatus || '').toLowerCase() === 'cancelled') {
          Alert.alert(
            'Order Cancelled',
            `Order #${orderId} has been cancelled.`,
            [{ text: 'OK', onPress: () => navigation.goBack() }] // Navigate back to stop picking
          );
        }
      };
      checkOrderStatus();
      return () => {}; // Cleanup if needed
    }, [orderId, orders, refreshOrders, navigation])
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

  useEffect(() => {
    const currentOrderId = String(order?.id || order?.orderId || orderId || '').trim();
    if (!currentOrderId) return undefined;

    const cancellationListener = DeviceEventEmitter.addListener('orderCancelled', (payload = {}) => {
      const cancelledOrderId = String(payload?.orderId || '').trim();
      if (!cancelledOrderId || cancelledOrderId !== currentOrderId) return;

      const reasonText = payload?.reason ? `\nReason: ${payload.reason}` : '';
      Alert.alert(
        'Order Cancelled',
        `Order cancelled. Stop packing for this order immediately.${reasonText}`,
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('OrdersList', { selectedTab: ORDER_STATUS.ACCEPTED }),
          },
        ],
        { cancelable: false }
      );
    });

    return () => {
      cancellationListener.remove();
    };
  }, [navigation, order?.id, order?.orderId, orderId]);

  useEffect(() => {
    const currentOrderId = String(order?.id || order?.orderId || orderId || '').trim();
    if (!currentOrderId) return undefined;

    const cancellationListener = DeviceEventEmitter.addListener('orderCancelled', (payload = {}) => {
      const cancelledOrderId = String(payload?.orderId || '').trim();
      if (!cancelledOrderId || cancelledOrderId !== currentOrderId) return;

      const reasonText = payload?.reason ? `\nReason: ${payload.reason}` : '';
      Alert.alert(
        'Order Cancelled',
        `Order cancelled. Stop packing for this order immediately.${reasonText}`,
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('OrdersList', { selectedTab: ORDER_STATUS.ACCEPTED }),
          },
        ],
        { cancelable: false }
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

  const getPrintFileUrl = (item) =>
    item?.fileUrl ||
    item?.file_url ||
    item?.printUrl ||
    item?.print_url ||
    item?.document_url ||
    item?.documentUrl ||
    '';

  const getPrintFileName = (item) =>
    item?.fileName || item?.file_name || item?.item_name || item?.name || 'Document';

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

  const isImageUrl = (uri) => {
    const clean = String(uri || '').split('?')[0].toLowerCase();
    return /\.(png|jpg|jpeg|webp|gif)$/.test(clean);
  };

  const sanitizeFileName = (name) => String(name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');

  const getFileExtension = (url) => {
    const clean = String(url || '').split('?')[0];
    const parts = clean.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  };

  const ensureLocalFile = async (url, fileName) => {
    if (!url) throw new Error('File URL is missing');
    if (url.startsWith('file://')) return url;
    const safeName = sanitizeFileName(fileName);
    const ext = getFileExtension(url);
    const nameWithExt = ext && !safeName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
      ? `${safeName}.${ext}`
      : safeName;
    const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!baseDir) throw new Error('No local storage available');
    const localUri = `${baseDir}${Date.now()}_${nameWithExt}`;
    const download = await FileSystem.downloadAsync(url, localUri);
    return download.uri;
  };

  const openPrintPreview = (item) => {
    setPreviewItem(item);
    setIsPreviewVisible(true);
  };

  const closePrintPreview = () => {
    setIsPreviewVisible(false);
    setPreviewItem(null);
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
      Alert.alert('Print failed', 'No file URL found for this item.');
      return;
    }
    setIsPrinting(true);
    try {
      const localUri = await ensureLocalFile(url, getPrintFileName(item));
      closePrintPreview();
      await Print.printAsync({ uri: localUri });
      await markPrintDone(item);
    } catch (e) {
      Alert.alert('Print failed', e?.message || 'Unable to print this file.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadItem = async (item, fromPreview = false) => {
    const url = getPrintFileUrl(item);
    if (!url) {
      Alert.alert('Download failed', 'No file URL found for this item.');
      return;
    }
    setDownloadingItemId(item?.id ?? null);
    setIsDownloading(true);
    try {
      const localUri = await ensureLocalFile(url, getPrintFileName(item));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri);
      }
      if (fromPreview) {
        closePrintPreview();
      }
      Alert.alert(
        'Downloaded',
        'File downloaded. Mark this item as printed?',
        [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Mark Printed', onPress: () => markPrintDone(item) },
        ]
      );
    } catch (e) {
      Alert.alert('Download failed', e?.message || 'Unable to download this file.');
    } finally {
      setIsDownloading(false);
      setDownloadingItemId(null);
    }
  };

  const openExternalPreview = async (url) => {
    if (!url) return;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Preview not available', 'Unable to open this file.');
      }
    } catch (e) {
      Alert.alert('Preview failed', 'Unable to open this file.');
    }
  };

  const getOrderStatusText = (status) => {
    switch (normalizeStatus(status)) {
      case normalizeStatus(ORDER_STATUS.PENDING):
        return 'Pending';
      case normalizeStatus(ORDER_STATUS.ACCEPTED):
        return 'Accepted';
      case normalizeStatus(ORDER_STATUS.PICKING):
        return 'Picking Items';
      case normalizeStatus(ORDER_STATUS.PREPARING):
        return 'Preparing';
      case normalizeStatus(ORDER_STATUS.COMPLETED):
        return 'Completed';
      case normalizeStatus(ORDER_STATUS.REJECTED):
        return 'Rejected';
      default:
        return 'Pending'; // fallback to Pending if unknown
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
  const canAssignDriver =
    allPickedOrUnavailable &&
    !['assigned', 'delivered', 'completed', 'cancelled'].includes(orderStatusNorm) &&
    orderStatusNorm === 'accepted';

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
    Alert.alert(
      'Navigate to Item',
      `📍 ${item.name}\n\n🏪 Location: ${rack.location}\n📍 Aisle: ${rack.aisle}\n📝 Description: ${rack.description}`,
      [
        { text: 'Got it!', style: 'default' },
        { 
          text: 'Scan Item', 
          style: 'default',
          onPress: () => handleScanItem(item)
        },
      ]
    );
  };

  const handleMarkUnavailable = (item) => {
    Alert.alert(
      'Mark Item Unavailable',
      `Mark "${item.name}" as unavailable?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Mark Unavailable', 
          style: 'destructive',
          onPress: () => {
            markItemUnavailable(orderId, item.id);
            setTimeout(checkOrderCompletion, 100);
          }
        },
      ]
    );
  };

  const handleScanItem = (item) => {
    const currentOrderId = order?.id || order?.orderId || orderId;
    navigation.navigate('BarcodeScanner', {
      orderId: currentOrderId,
      itemId: item.id,
      expectedBarcode: item.barcode,
      itemName: item.productName || item.name,
      requiredQuantity: item.quantity,
      onScanSuccess: async (scannedBarcode, quantity) => {
        try {
          await persistItemScan(
            currentOrderId,
            scannedBarcode,
            quantity,
            new Date().toISOString(),
            null
          );
        } catch (e) {
          console.warn('⚠️ Persist scan failed, applying local state only:', e?.message);
        }
        updateItemStatus(currentOrderId, item.id, ITEM_STATUS.SCANNED, new Date().toISOString(), quantity);
        setTimeout(checkOrderCompletion, 100);
      },
    });
  };

  const checkOrderCompletion = () => {
    const allItemsProcessed = safeItems.every(
      item =>
        item.status === ITEM_STATUS.SCANNED ||
        item.status === ITEM_STATUS.UNAVAILABLE
    );

    if (allItemsProcessed && safeItems.length > 0) {
      Alert.alert(
        'All Items Processed! ✅',
        'All items have been picked or marked unavailable. You can now mark this order as READY.',
        [{ text: 'OK' }]
      );
    }
  };

  const renderItemCard = ({ item }) => {
    const printItem = isPrintItem(item);
    const meta = printItem ? getPrintMeta(item) : null;
    const displayName = printItem ? getPrintFileName(item) : item.name;
    const displayCategory = printItem ? 'Print file' : item.category;
    const barcodeValue = !printItem ? item.barcode : '';
    const quantity = Number(item?.quantity ?? 0);
    const price = Number(item?.price ?? 0);
    const scannedLabel = printItem ? 'Just updated' : 'Just scanned';

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
                <Text style={styles.itemDetails}>
                  Qty: {meta.quantity} × ${meta.price} = ${(meta.quantity * meta.price).toFixed(2)}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.itemDetails}>
                  Qty: {quantity} × ${price} = ${(quantity * price).toFixed(2)}
                </Text>
                {barcodeValue ? <Text style={styles.barcode}>Barcode: {barcodeValue}</Text> : null}
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

        {!printItem && (
          <View style={styles.rackInfo}>
            <View style={styles.rackHeader}>
              <Ionicons name="location" size={16} color="#007AFF" />
              <Text style={styles.rackTitle}>Location: {item.rack?.location || 'N/A'}</Text>
            </View>
            <Text style={styles.rackAisle}>{item.rack?.aisle || 'N/A'}</Text>
            <Text style={styles.rackDescription}>{item.rack?.description || 'N/A'}</Text>
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

              <TouchableOpacity
                style={styles.scanButton}
                onPress={() => handleScanItem(item)}
              >
                <Ionicons name="scan" size={16} color="#FFFFFF" />
                <Text style={styles.buttonText}>Scan</Text>
              </TouchableOpacity>
            </>
          )}

          {item.status !== ITEM_STATUS.SCANNED && item.status !== ITEM_STATUS.UNAVAILABLE && (
            <TouchableOpacity
              style={styles.unavailableButton}
              onPress={() => handleMarkUnavailable(item)}
            >
              <Ionicons name="close" size={16} color="#FFFFFF" />
              <Text style={styles.buttonText}>{printItem ? 'Cannot Print' : 'Not Available'}</Text>
            </TouchableOpacity>
          )}

          {item.status === ITEM_STATUS.SCANNED && (
            <View style={styles.completedIndicator}>
              <Ionicons name="checkmark-circle" size={20} color="#34C759" />
              <Text style={styles.completedText}>
                {printItem
                  ? `Printed ${item.quantity || 1}`
                  : `Picked ${item.pickedQuantity || item.quantity}/${item.quantity}`}
              </Text>
              <Text style={styles.scannedTimeText}>
                {item.scannedAt ? new Date(item.scannedAt).toLocaleTimeString() : scannedLabel}
              </Text>
            </View>
          )}

          {item.status === ITEM_STATUS.UNAVAILABLE && (
            <View style={styles.unavailableIndicator}>
              <Ionicons name="close-circle" size={20} color="#FF3B30" />
              <Text style={styles.unavailableText}>
                {printItem ? 'Cannot Print' : 'Not Available'}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const scannedItems = safeItems.filter(item => item.status === ITEM_STATUS.SCANNED).length;
  const unavailableItems = safeItems.filter(item => item.status === ITEM_STATUS.UNAVAILABLE).length;
  const totalItems = safeItems.length;
  const previewUrl = previewItem ? getPrintFileUrl(previewItem) : '';
  const previewMeta = previewItem ? getPrintMeta(previewItem) : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Order #{order.id || order.orderId}</Text>
          <Text style={styles.headerSubtitle}>{order.customerName}</Text>
          <Text style={styles.headerStatus}>{getOrderStatusText(order.status ?? order.orderStatus)}</Text>
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
                  {previewUrl && isImageUrl(previewUrl) ? (
                    <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="contain" />
                  ) : (
                    <View style={styles.previewPlaceholder}>
                      <Ionicons name="document-text-outline" size={44} color="#666666" />
                      <Text style={styles.previewPlaceholderText}>Preview not available</Text>
                      {previewUrl ? (
                        <TouchableOpacity
                          style={styles.previewLinkButton}
                          onPress={() => openExternalPreview(previewUrl)}
                        >
                          <Ionicons name="open-outline" size={16} color="#007AFF" />
                          <Text style={styles.previewLinkText}>Open Preview</Text>
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
        animationType="fade"
        transparent
        visible={isRackPickerVisible}
        onRequestClose={() => setIsRackPickerVisible(false)}
      >
        <Pressable style={styles.previewBackdrop} onPress={() => setIsRackPickerVisible(false)}>
          <Pressable style={styles.rackPickerCard} onPress={() => {}}>
            <Text style={styles.rackPickerTitle}>Select package rack</Text>
            <Text style={styles.rackPickerSubtitle}>
              Choose where the packed order is stored before assigning the driver.
            </Text>
            <View style={styles.rackGrid}>
              {PACKAGE_RACK_OPTIONS.map((rack) => (
                <TouchableOpacity
                  key={rack}
                  style={[
                    styles.rackOption,
                    selectedPackageRack === rack && styles.rackOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedPackageRack(rack);
                    setIsRackPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.rackOptionText,
                      selectedPackageRack === rack && styles.rackOptionTextSelected,
                    ]}
                  >
                    {rack}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <FlatList
        data={safeItems}
        renderItem={renderItemCard}
        keyExtractor={(item, index) =>
          [
            order?.id || order?.orderId || 'order',
            item?.item_type || item?.type || 'item',
            item?.id ?? item?.barcode ?? item?.fileName ?? item?.name ?? 'unknown',
            index,
          ].join(':')
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      />

      {canAssignDriver && (
        <View style={styles.readyButtonContainer}>
          <View style={styles.readyMessageContainer}>
            <Ionicons name="checkmark-circle" size={24} color="#34C759" />
            <Text style={styles.readyMessageText}>
              All items processed! Assign a driver for delivery.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.rackSelector}
            onPress={() => setIsRackPickerVisible(true)}
          >
            <View>
              <Text style={styles.rackSelectorLabel}>Package Rack</Text>
              <Text style={styles.rackSelectorValue}>
                {selectedPackageRack || 'Choose rack'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.markReadyButton, isAssigningDriver && styles.markReadyButtonDisabled]}
            disabled={isAssigningDriver}
            onPress={async () => {
              try {
                const targetOrderId = order.id || order.orderId || orderId;
                if (!selectedPackageRack) {
                  Alert.alert('Select package rack', 'Please select the package rack before assigning a driver.');
                  return;
                }
                setIsAssigningDriver(true);
                await completePickingAndAssignDriver(targetOrderId, selectedPackageRack);
                Alert.alert(
                  'Driver assigned ✅',
                  `This order is assigned to a driver and stored at rack ${selectedPackageRack}.`,
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        navigation.navigate('OrdersList', {
                          selectedTab: ORDER_STATUS.ASSIGNED,
                        });
                      },
                    },
                  ]
                );
              } catch (error) {
                const msg = error?.message || 'Failed to assign driver. Please try again.';
                if (String(msg).toLowerCase().includes('no drivers')) {
                  Alert.alert('No drivers available', 'Try again in a few minutes.', [{ text: 'OK' }]);
                } else {
                  Alert.alert('Error', msg, [{ text: 'OK' }]);
                }
              } finally {
                setIsAssigningDriver(false);
              }
            }}
          >
            <Ionicons name="car-outline" size={20} color="#FFFFFF" />
            <Text style={styles.markReadyButtonText}>
              {isAssigningDriver ? 'Assigning…' : 'Assign Driver'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  headerStatus: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '600',
    marginTop: 2,
  },
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666666',
    marginTop: 2,
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
  listContent: {
    padding: 16,
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
  readyButtonContainer: {
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  readyMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  readyMessageText: {
    fontSize: 16,
    color: '#333333',
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
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
  rackGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
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
