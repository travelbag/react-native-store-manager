import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOrders, ITEM_STATUS, ORDER_STATUS } from '../context/OrdersContext';

const OrderPickingScreen = ({ route, navigation }) => {
  const [allPickedOrUnavailable, setAllPickedOrUnavailable] = useState(false);
  const { orderId } = route.params;
  const { orders, updateItemStatus, scanBarcode, markItemUnavailable, updateOrderStatus, markOrderReady } = useOrders();

  // Find order by id or orderId for compatibility
  const order = orders.find(o => o.id === orderId || o.orderId === orderId);

  // Get items array safely
  const items = React.useMemo(() => {
    if (!order?.items) return [];
    const itemsArray = Array.isArray(order.items) ? order.items : JSON.parse(order.items);
    console.log('📋 OrderPickingScreen - Items updated:', itemsArray.map(item => ({ id: item.id, name: item.name, status: item.status })));
    return itemsArray;
  }, [order?.items]);

  // Filter out any null/undefined entries to avoid crashes in counts and render
  const safeItems = React.useMemo(() => (items || []).filter(Boolean), [items]);

  // Check if all items are picked or unavailable
  useEffect(() => {
    const scannedItems = safeItems.filter(item => item.status === ITEM_STATUS.SCANNED).length;
    const unavailableItems = safeItems.filter(item => item.status === ITEM_STATUS.UNAVAILABLE).length;
    const newAllPickedOrUnavailable = scannedItems + unavailableItems === safeItems.length && safeItems.length > 0;
console.log('safeItems', safeItems);
  console.log('scannedItems',scannedItems);
  console.log('unavailableItems',unavailableItems);
    console.log('📊 OrderPickingScreen - Status check:', {
      scannedItems,
      unavailableItems,
      totalItems: safeItems.length,
      allPickedOrUnavailable: newAllPickedOrUnavailable
    });

    setAllPickedOrUnavailable(newAllPickedOrUnavailable);
  }, [safeItems]);

  // Check for scan success from navigation params
  useEffect(() => {
    if (route.params?.scanSuccess) {
      // Show a brief success message
      Alert.alert(
        'Scan Successful! ✅',
        'Item has been marked as picked.',
        [{ text: 'OK' }]
      );
      // Clear the param to prevent showing again
      navigation.setParams({ scanSuccess: undefined });
    }
  }, [route.params?.scanSuccess]);

  // Helper to normalize status
  const normalizeStatus = (status) => {
    if (!status) return '';
    return String(status).toLowerCase();
  };

  // Helper to get readable status text
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
      case normalizeStatus(ORDER_STATUS.READY):
        return 'Ready';
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

  // Removed duplicate accept/reject alert logic. Only OrderCard shows the alert.
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
            // Check if all items are completed after marking unavailable
            setTimeout(checkOrderCompletion, 100);
          }
        },
      ]
    );
  };

const handleScanItem = (item) => {
  // Be explicit about passing orderId so the scanner can navigate back reliably
  const currentOrderId = order?.id || order?.orderId || orderId;
  navigation.navigate('BarcodeScanner', {
    orderId: currentOrderId,
    itemId: item.id,
    expectedBarcode: item.barcode,
    itemName: item.productName || item.name,
    requiredQuantity: item.quantity,
    onScanSuccess: (scannedBarcode, quantity) => {
      updateItemStatus(currentOrderId, item.id, ITEM_STATUS.SCANNED, new Date().toISOString(), quantity);
      // Check if all items are completed after this scan
      setTimeout(checkOrderCompletion, 100);
    },
  });
};


const checkOrderCompletion = () => {
  // Use the safeItems array instead of raw items
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

  const renderItemCard = ({ item }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Image source={{ uri: item.image }} style={styles.itemImage} />
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemCategory}>{item.category}</Text>
          <Text style={styles.itemDetails}>
            Qty: {item.quantity} × ${item.price} = ${(item.quantity * item.price).toFixed(2)}
          </Text>
          <Text style={styles.barcode}>Barcode: {item.barcode}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getItemStatusColor(item.status) }]}>
          <Ionicons 
            name={getItemStatusIcon(item.status)} 
            size={16} 
            color="#FFFFFF" 
          />
        </View>
      </View>

      <View style={styles.rackInfo}>
        <View style={styles.rackHeader}>
          <Ionicons name="location" size={16} color="#007AFF" />
<Text style={styles.rackTitle}>Location: {item.rack?.location || 'N/A'}</Text>
        </View>
        <Text style={styles.rackAisle}>{item.rack?.aisle || 'N/A'}</Text>
<Text style={styles.rackDescription}>{item.rack?.description || 'N/A'}</Text>
      </View>

      <View style={styles.itemActions}>
        {item.status === ITEM_STATUS.PENDING && (
          <TouchableOpacity
            style={styles.locateButton}
            onPress={() => handleLocateItem(item)}
          >
            <Ionicons name="navigate" size={16} color="#FFFFFF" />
            <Text style={styles.buttonText}>Navigate</Text>
          </TouchableOpacity>
        )}

        {/* {(item.status === ITEM_STATUS.LOCATED || item.status === ITEM_STATUS.PENDING) && ( */}
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => handleScanItem(item)}
          >
            <Ionicons name="scan" size={16} color="#FFFFFF" />
            <Text style={styles.buttonText}>Scan</Text>
          </TouchableOpacity>
        {/* )} */}

        {item.status !== ITEM_STATUS.SCANNED && item.status !== ITEM_STATUS.UNAVAILABLE && (
          <TouchableOpacity
            style={styles.unavailableButton}
            onPress={() => handleMarkUnavailable(item)}
          >
            <Ionicons name="close" size={16} color="#FFFFFF" />
            <Text style={styles.buttonText}>Not Available</Text>
          </TouchableOpacity>
        )}

        {item.status === ITEM_STATUS.SCANNED && (
          <View style={styles.completedIndicator}>
            <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            <Text style={styles.completedText}>
              ✅ Picked {item.pickedQuantity || item.quantity}/{item.quantity}
            </Text>
            <Text style={styles.scannedTimeText}>
              {item.scannedAt ? new Date(item.scannedAt).toLocaleTimeString() : 'Just scanned'}
            </Text>
          </View>
        )}

        {item.status === ITEM_STATUS.UNAVAILABLE && (
          <View style={styles.unavailableIndicator}>
            <Ionicons name="close-circle" size={20} color="#FF3B30" />
            <Text style={styles.unavailableText}>
              ❌ Not Available
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Order not found</Text>
      </SafeAreaView>
    );
  }

  const scannedItems = safeItems.filter(item => item.status === ITEM_STATUS.SCANNED).length;
  const unavailableItems = safeItems.filter(item => item.status === ITEM_STATUS.UNAVAILABLE).length;
  const totalItems = safeItems.length;

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

<FlatList
  data={safeItems}
  renderItem={renderItemCard}
  keyExtractor={(item, index) => (item?.id ?? index).toString()}
/>



{allPickedOrUnavailable && 
 (order.status !== ORDER_STATUS.READY && order.orderStatus !== ORDER_STATUS.READY) && (
  <View style={styles.readyButtonContainer}>
    <View style={styles.readyMessageContainer}>
      <Ionicons name="checkmark-circle" size={24} color="#34C759" />
      <Text style={styles.readyMessageText}>
        All items processed! Ready to mark order as complete.
      </Text>
    </View>
    <TouchableOpacity
      style={styles.markReadyButton}
      onPress={async () => {
        try {
          const readyOrderId = order.id || order.orderId || orderId;
          console.log('Marking order ready with ID:', readyOrderId);
          await markOrderReady(readyOrderId);
          Alert.alert(
            'Order Ready! ✅',
            'This order has been marked as READY and is now available in the Ready tab.',
            [
              {
                text: 'OK',
                onPress: () => {
                  // Navigate to Orders screen with Ready tab selected
                  navigation.navigate('OrdersList', { 
                    selectedTab: ORDER_STATUS.READY 
                  });
                }
              }
            ]
          );
        } catch (error) {
          console.error('Error marking order ready:', error);
          Alert.alert(
            'Error',
            'Failed to mark order as ready. Please try again.',
            [{ text: 'OK' }]
          );
        }
      }}
    >
      <Ionicons name="flag" size={20} color="#FFFFFF" />
      <Text style={styles.markReadyButtonText}>
        Mark Order Ready
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
  markReadyButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default OrderPickingScreen;
