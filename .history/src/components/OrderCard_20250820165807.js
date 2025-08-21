import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useOrders, ORDER_STATUS } from '../context/OrdersContext';

const OrderCard = ({ order }) => {
  const {
    acceptOrder,
    rejectOrder,
    startPreparingOrder,
    markOrderReady,
    completeOrder,
  } = useOrders();

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
    switch (status) {
      case ORDER_STATUS.PENDING:
        return 'Pending';
      case ORDER_STATUS.ACCEPTED:
        return 'Accepted';
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

  const handleAccept = () => {
    Alert.alert(
      'Accept Order',
      `Accept order #${order.id} from ${order.customerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Accept', onPress: () => acceptOrder(order.id) },
      ]
    );
  };

  const handleReject = () => {
    Alert.alert(
      'Reject Order',
      `Reject order #${order.id} from ${order.customerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => rejectOrder(order.id) },
      ]
    );
  };

  const handleStartPreparing = () => {
    startPreparingOrder(order.id);
  };

  const handleMarkReady = () => {
    markOrderReady(order.id);
  };

  const handleComplete = () => {
    completeOrder(order.id);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderActionButtons = () => {
    switch (order.status) {
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
          <TouchableOpacity style={styles.primaryButton} onPress={handleStartPreparing}>
            <Text style={styles.primaryButtonText}>Start Preparing</Text>
          </TouchableOpacity>
        );
      case ORDER_STATUS.PREPARING:
        return (
          <TouchableOpacity style={styles.primaryButton} onPress={handleMarkReady}>
            <Text style={styles.primaryButtonText}>Mark Ready</Text>
          </TouchableOpacity>
        );
      case ORDER_STATUS.READY:
        return (
          <TouchableOpacity style={styles.primaryButton} onPress={handleComplete}>
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
          <Text style={styles.orderId}>Order #{order.id}</Text>
          <Text style={styles.customerName}>{order.customerName}</Text>
          <Text style={styles.time}>{formatTime(order.timestamp)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
          <Text style={styles.statusText}>{getStatusText(order.status)}</Text>
        </View>
      </View>

      <View style={styles.orderDetails}>
        <Text style={styles.sectionTitle}>Items:</Text>
        {order.items.map((item, index) => (
          <View key={index} style={styles.item}>
            <Text style={styles.itemName}>
              {item.quantity}x {item.name}
            </Text>
            <Text style={styles.itemPrice}>${(item.price * item.quantity).toFixed(2)}</Text>
          </View>
        ))}
        
        <View style={styles.totalContainer}>
          <Text style={styles.totalText}>Total: ${order.total}</Text>
        </View>

        <View style={styles.customerInfo}>
          <Text style={styles.infoLabel}>Delivery Address:</Text>
          <Text style={styles.infoText}>{order.deliveryAddress}</Text>
          <Text style={styles.infoLabel}>Phone:</Text>
          <Text style={styles.infoText}>{order.phoneNumber}</Text>
          <Text style={styles.infoLabel}>Estimated Time:</Text>
          <Text style={styles.infoText}>{order.estimatedTime} minutes</Text>
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
  itemName: {
    fontSize: 14,
    color: '#333333',
    flex: 1,
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
