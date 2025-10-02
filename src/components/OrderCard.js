import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOrders, ORDER_STATUS, ITEM_STATUS } from '../context/OrdersContext';
import { useNavigation } from '@react-navigation/native';

const OrderCard = ({ order }) => {
  const navigation = useNavigation();
  const {
    acceptOrder,
    rejectOrder,
    startPickingOrder,
    startPreparingOrder,
    markOrderReady,
    completeOrder,
  } = useOrders();

  // Map backend fields to frontend expected fields
  const orderId = order?.id || order?.orderId || '';
  //console.log('Rendering OrderCard for orderId:', order);
  // Parse items if stringified
  let items = Array.isArray(order?.items)
    ? order.items
    : typeof order?.items === 'string'
      ? (() => { try { return JSON.parse(order.items); } catch { return []; } })()
      : [];

  // Fallbacks for other fields
  const customerName = order?.customerName || '';
  const timestamp = order?.timestamp || order?.orderDate || '';
  const status = order?.status || order?.orderStatus || 'N/A';
  const total = order?.total || order?.totalPrice || 0;
  const deliveryAddress = order?.deliveryAddress || '';
  const phoneNumber = order?.phoneNumber || '';
  const deliveryType = order?.deliveryType || '';
  const specialInstructions = order?.specialInstructions || '';

  const getStatusColor = (status) => {
    switch (status) {
      case ORDER_STATUS.PENDING:
        return '#FF9500';
      case ORDER_STATUS.ACCEPTED:
        return '#007AFF';
      case ORDER_STATUS.PREPARING:
        return '#FF9500';
      case ORDER_STATUS.READY:
        return '#34C759';
      case ORDER_STATUS.COMPLETED:
        return '#8E8E93';
      case ORDER_STATUS.REJECTED:
        return '#FF3B30';
      default:
        return '#8E8E93';
    }
  };

  const getStatusText = (status) => {
    console.log('Getting status text for status:', status);
    switch (status) {
      case ORDER_STATUS.PENDING:
        return 'Pending';
      case ORDER_STATUS.ACCEPTED:
        return 'Accepted';
      case ORDER_STATUS.PICKING:
        return 'Picking Items';
      case ORDER_STATUS.PREPARING:
        return 'Preparing';
      case ORDER_STATUS.READY:
        return 'Ready';
      case ORDER_STATUS.COMPLETED:
        return 'Completed';
      case ORDER_STATUS.REJECTED:
        return 'Rejected';
      default:
        return 'Unknown';
    }
  };

  const handleAcceptOrder = () => {
    acceptOrder(orderId);
    // The status will update via context, and modal will close automatically
  };

  const handleAccept = () => {
    Alert.alert(
      'Accept Order',
      `Accept order #${orderId} from ${customerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Accept', onPress: handleAcceptOrder },
      ]
    );
  };
  const handleReject = () => {
    Alert.alert(
      'Reject Order',
      `Reject order #${orderId} from ${customerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => rejectOrder(orderId) },
      ]
    );
  };

  const handleStartPicking = () => {
    startPickingOrder(orderId);
    navigation.navigate('OrderPicking', { orderId });
  };

  const handleStartPreparing = () => {
    startPreparingOrder(orderId);
  };

  const handleMarkReady = () => {
    markOrderReady(orderId);
  };

  const handleComplete = () => {
    completeOrder(orderId);
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderActionButtons = () => {
    switch (status) {
      case ORDER_STATUS.PENDING:
        return (
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.rejectButton} onPress={handleReject}>
              <Text style={styles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
          </View>
        );
      case ORDER_STATUS.ACCEPTED:
        return (
          <TouchableOpacity style={styles.primaryButton} onPress={handleStartPicking}>
            <Ionicons name="basket-outline" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>Start Picking</Text>
          </TouchableOpacity>
        );
      case ORDER_STATUS.PICKING:
        const pickedItems = items?.filter(item => item.status === ITEM_STATUS.SCANNED).length || 0;
        const totalItems = items?.length || 0;
        const allPicked = pickedItems === totalItems && totalItems > 0;
        return (
          <TouchableOpacity 
            style={styles.primaryButton} 
            onPress={() => navigation.navigate('OrderPicking', { orderId })}
          >
            <Ionicons name="location-outline" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>
              {allPicked ? 'Picking Complete' : `Continue Picking (${pickedItems}/${totalItems})`}
            </Text>
          </TouchableOpacity>
        );
      case ORDER_STATUS.PREPARING:
        return (
          <TouchableOpacity style={styles.primaryButton} onPress={handleMarkReady}>
            <Ionicons name="checkmark-outline" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>Mark Ready</Text>
          </TouchableOpacity>
        );
      case ORDER_STATUS.READY:
        return (
          <TouchableOpacity style={styles.primaryButton} onPress={handleComplete}>
            <Ionicons name="bag-check-outline" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>Complete Order</Text>
          </TouchableOpacity>
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.orderId}>Order #{orderId}</Text>
          <Text style={styles.customerName}>{customerName}</Text>
          <Text style={styles.time}>{formatTime(timestamp)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
          <Text style={styles.statusText}>{getStatusText(status)}</Text>
        </View>
      </View>

      <View style={styles.orderDetails}>
        <Text style={styles.sectionTitle}>Items ({items.length}):</Text>
        {Array.isArray(items) && items.length > 0 ? (
          items.map((item, index) => (
            <View key={index} style={styles.itemRow}>
              {item.image && (
                <Image source={{ uri: item.image }} style={styles.itemImage} />
              )}
              <View style={styles.itemDetails}>
                <Text style={styles.itemName}>
                  {item.quantity}x {item.name}
                </Text>
                {item.category && (
                  <Text style={styles.itemCategory}>{item.category}</Text>
                )}
                {item.rack && (
                  <Text style={styles.itemLocation}>📍 {item.rack.location}</Text>
                )}
              </View>
              <Text style={styles.itemPrice}>${((item.price ?? 0) * (item.quantity ?? 0)).toFixed(2)}</Text>
            </View>
          ))
        ) : (
          <Text style={{ color: '#888', fontStyle: 'italic', marginBottom: 8 }}>No items found for this order.</Text>
        )}
        <View style={styles.totalContainer}>
          <Text style={styles.totalText}>Total: ${total}</Text>
        </View>

        <View style={styles.customerInfo}>
          <Text style={styles.infoLabel}>Delivery Address:</Text>
          <Text style={styles.infoText}>{deliveryAddress}</Text>
          <Text style={styles.infoLabel}>Phone:</Text>
          <Text style={styles.infoText}>{phoneNumber}</Text>
          <Text style={styles.infoLabel}>Delivery Type:</Text>
          <Text style={styles.infoText}>
            {deliveryType === 'home_delivery' ? '🚚 Home Delivery' : '🏪 Store Pickup'}
          </Text>
          {specialInstructions && (
            <>
              <Text style={styles.infoLabel}>Special Instructions:</Text>
              <Text style={styles.infoText}>{specialInstructions}</Text>
            </>
          )}
        </View>
      </View>

      {renderActionButtons()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderId: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
  },
  customerName: {
    fontSize: 16,
    color: '#333333',
    marginTop: 2,
  },
  time: {
    fontSize: 14,
    color: '#666666',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  orderDetails: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  itemImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginRight: 12,
    backgroundColor: '#F0F0F0',
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    color: '#333333',
    fontWeight: '500',
    marginBottom: 2,
  },
  itemCategory: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 2,
  },
  itemLocation: {
    fontSize: 11,
    color: '#007AFF',
  },
  itemPrice: {
    fontSize: 14,
    color: '#333333',
    fontWeight: '500',
  },
  totalContainer: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingTop: 8,
    marginTop: 8,
  },
  totalText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'right',
  },
  customerInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
    marginTop: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#333333',
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  acceptButton: {
    backgroundColor: '#34C759',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  rejectButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default OrderCard;
