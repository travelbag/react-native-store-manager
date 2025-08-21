import React, { useState } from 'react';
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
  const { orderId } = route.params;
  const { orders, updateItemStatus, scanBarcode, markItemUnavailable, updateOrderStatus } = useOrders();
  const [selectedItem, setSelectedItem] = useState(null);

  const order = orders.find(o => o.id === orderId);

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Order not found</Text>
      </SafeAreaView>
    );
  }

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
    Alert.alert(
      'Navigate to Item',
      `📍 ${item.name}\n\n🏪 Location: ${item.rack.location}\n📍 Aisle: ${item.rack.aisle}\n📝 Description: ${item.rack.description}`,
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

  const handleScanItem = (item) => {
    navigation.navigate('BarcodeScanner', {
      orderId,
      itemId: item.id,
      expectedBarcode: item.barcode,
      itemName: item.name,
      requiredQuantity: item.quantity,
      onScanSuccess: (scannedBarcode, pickedQuantity) => {
        const result = scanBarcode(orderId, item.id, scannedBarcode, pickedQuantity);
        if (result.success) {
          checkOrderCompletion();
        }
      },
    });
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
            checkOrderCompletion();
          }
        },
      ]
    );
  };

  const checkOrderCompletion = () => {
    const allItemsProcessed = order.items.every(item => 
      item.status === ITEM_STATUS.SCANNED || item.status === ITEM_STATUS.UNAVAILABLE
    );
    
    if (allItemsProcessed) {
      Alert.alert(
        'Order Picking Complete!',
        'All items have been processed. Ready to prepare the order?',
        [
          { text: 'Stay Here', style: 'cancel' },
          { 
            text: 'Mark Ready', 
            style: 'default',
            onPress: () => {
              updateOrderStatus(orderId, ORDER_STATUS.PREPARING);
              navigation.goBack();
            }
          },
        ]
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
          <Text style={styles.rackTitle}>Location: {item.rack.location}</Text>
        </View>
        <Text style={styles.rackAisle}>{item.rack.aisle}</Text>
        <Text style={styles.rackDescription}>{item.rack.description}</Text>
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

        {(item.status === ITEM_STATUS.LOCATED || item.status === ITEM_STATUS.PENDING) && (
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => handleScanItem(item)}
          >
            <Ionicons name="scan" size={16} color="#FFFFFF" />
            <Text style={styles.buttonText}>Scan</Text>
          </TouchableOpacity>
        )}

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
            <Text style={styles.completedText}>Picked</Text>
          </View>
        )}
      </View>
    </View>
  );

  const scannedItems = order.items.filter(item => item.status === ITEM_STATUS.SCANNED).length;
  const unavailableItems = order.items.filter(item => item.status === ITEM_STATUS.UNAVAILABLE).length;
  const totalItems = order.items.length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Order #{order.id}</Text>
          <Text style={styles.headerSubtitle}>{order.customerName}</Text>
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
            { width: `${((scannedItems + unavailableItems) / totalItems) * 100}%` }
          ]} 
        />
      </View>

      <FlatList
        data={order.items}
        renderItem={renderItemCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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
  },
  completedText: {
    color: '#34C759',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 50,
  },
});

export default OrderPickingScreen;
