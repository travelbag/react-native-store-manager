import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOrders, ORDER_STATUS, ITEM_STATUS } from '../context/OrdersContext';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { assignDriver } from '../services/DriverService';

const OrderCard = ({ order }) => {
  const { updateOrderStatus, acceptOrder, rejectOrder, refreshOrders } = useOrders();
  const navigation = useNavigation();
  const { manager } = useAuth();
  const [noDriverVisible, setNoDriverVisible] = React.useState(false);
  const [isAssigningDriver, setIsAssigningDriver] = React.useState(false);

  // Map backend fields to frontend expected fields
  const orderId = order?.id || order?.orderId || '';
  
  // Parse items if stringified
  let items = Array.isArray(order?.items)
    ? order.items
    : typeof order?.items === 'string'
      ? (() => { try { return JSON.parse(order.items); } catch { return []; } })()
      : [];

  // Fallbacks for other fields
  const customerName = order?.customerName || '';
  const timestamp = order?.timestamp || order?.orderDate || '';
  const statusRaw = order?.status || order?.orderStatus || '';
  const status = String(statusRaw || '');
  const total = order?.total || order?.totalPrice || 0;
  const deliveryAddress = order?.deliveryAddress || '';
  const phoneNumber = order?.phoneNumber || '';
  const deliveryType = order?.deliveryType || '';
  const specialInstructions = order?.specialInstructions || '';
  const driverName = order?.driverName || '';
  const driverPhone = order?.driverPhone || '';



  const getStatusColor = (status) => {
    switch (status) {
      case ORDER_STATUS.PENDING:
        return '#FF9500';
      case ORDER_STATUS.ACCEPTED:
        return '#007AFF';
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

  const getStatusText = (s) => {
    const key = String(s || '').toLowerCase();
    switch (key) {
      case 'pending':
        return 'Pending';
      case 'accepted':
        return 'Accepted';
      case 'ready':
        return 'Ready';
      case 'assigned':
        return 'Assigned';
      case 'completed':
      case 'delivered':
        return 'Delivered';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Pending';
    }
  };

  const handleAcceptOrder = async () => {
    await acceptOrder(orderId);
  };

  const handleReject = () => {
    rejectOrder(orderId);
  };

  const handleStartPicking = async () => {
    //console.log('OrderCard handleStartPicking orderId:', orderId, 'order:', order);
    if (!orderId) {
      console.warn('OrderCard: Cannot start picking, orderId is missing!', order);
      Alert.alert('Error', 'Order ID is missing. Cannot start picking for this order.');
      return;
    }
    navigation.navigate('OrderPicking', { orderId });
  };

  const handleAssignDriver = async () => {
   // console.log('Assigning driver for order:', orderId);
    if (isAssigningDriver) return;
    const storeId = manager?.storeId || manager?.store_id || '';
    try {
      setIsAssigningDriver(true);
      await assignDriver(orderId, storeId);
      updateOrderStatus(orderId, ORDER_STATUS.ASSIGNED);
      // Pull fresh state from backend to reflect assigned driver across devices
      if (typeof refreshOrders === 'function') {
        refreshOrders();
      }
      Alert.alert('Success', 'Driver assigned successfully!');
    } catch (error) {
      const message = error?.message || 'Failed to assign driver';
      if (String(message).toLowerCase().includes('no drivers available')) {
        setNoDriverVisible(true);
        return;
      }
      Alert.alert('Error', message);
    } finally {
      setIsAssigningDriver(false);
    }
  };

  const sanitizePhone = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    const hasPlus = s.startsWith('+');
    const digits = s.replace(/[^0-9]/g, '');
    return hasPlus ? `+${digits}` : digits;
  };

  const handleCall = async (phone) => {
    const cleaned = sanitizePhone(phone);
    if (!cleaned) return;
    const url = `tel:${cleaned}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Not supported', 'Phone calls are not supported on this device.');
      }
    } catch (e) {
      Alert.alert('Error', 'Unable to initiate the call.');
    }
  };

  const formatDateTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d)) return '';
    const datePart = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
    const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  };

  const renderActionButtons = () => {
    const statusNormalized = String(status || '').toLowerCase();
    
    switch (statusNormalized) {
      case 'pending':
        return (
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.rejectButton} onPress={handleReject}>
              <Text style={styles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptButton} onPress={handleAcceptOrder}>
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
          </View>
        );
      
      case 'accepted':
        return (
          <TouchableOpacity style={styles.primaryButton} onPress={handleStartPicking}>
            <Ionicons name="basket-outline" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>Start Picking</Text>
          </TouchableOpacity>
        );
      
      case 'ready':
        return (
          <TouchableOpacity 
            style={[styles.primaryButton, isAssigningDriver && styles.primaryButtonDisabled]}
            onPress={handleAssignDriver}
            disabled={isAssigningDriver}
          >
            <Ionicons name="car-outline" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>
              {isAssigningDriver ? 'Assigning...' : 'Assign Driver'}
            </Text>
          </TouchableOpacity>
        );
      
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <Modal
        animationType="fade"
        transparent
        visible={noDriverVisible}
        onRequestClose={() => setNoDriverVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setNoDriverVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalIcon}>
              <Ionicons name="car-outline" size={26} color="#335CFF" />
            </View>
            <Text style={styles.modalTitle}>No drivers available</Text>
            <Text style={styles.modalBody}>
              We couldn't find an available driver right now. Try again in a few minutes.
            </Text>
            <TouchableOpacity style={styles.modalButton} onPress={() => setNoDriverVisible(false)}>
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <View style={styles.header}>
        <View>
          <Text style={styles.orderId}>Order #{orderId}</Text>
          <Text style={styles.customerName}>{customerName}</Text>
          <Text style={styles.time}>{formatDateTime(timestamp)}</Text>
        </View>
        <View style={styles.statusContainer}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
            <Text style={styles.statusText}>{getStatusText(status)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.itemsContainer}>
        <Text style={styles.itemsTitle}>Items ({items.length})</Text>
        {items.slice(0, 3).map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <Image source={{ uri: item.image }} style={styles.itemImage} />
            <View style={styles.itemDetails}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemPrice}>
                {item.quantity} × ${item.price} = ${(item.quantity * item.price).toFixed(2)}
              </Text>
            </View>
            {item.status === ITEM_STATUS.SCANNED && (
              <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            )}
          </View>
        ))}
        {items.length > 3 && (
          <Text style={styles.moreItems}>
            +{items.length - 3} more items
          </Text>
        )}
      </View>

      <View style={styles.orderInfo}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Total:</Text>
          <Text style={styles.infoValue}>${total}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Address:</Text>
          <Text style={styles.infoText}>{deliveryAddress}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phone:</Text>
          <Text style={styles.infoText}>{phoneNumber}</Text>
        </View>
        {(driverName || driverPhone) ? (
          <View style={styles.driverBlock}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Driver:</Text>
              <Text style={styles.infoTextDriver}>{driverName || 'Assigned'}</Text>
            </View>
            {driverPhone ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Driver Phone:</Text>
                <View style={styles.phoneRow}>
                  <Text style={styles.infoTextDriver}>{driverPhone}</Text>
                    <TouchableOpacity onPress={() => handleCall(driverPhone)}>
                      <Ionicons name="call-outline" size={30} color="#007AFF" style={styles.callIcon} />
                    </TouchableOpacity>
                  {/* <TouchableOpacity
                    accessibilityLabel="Call driver"
                    onPress={() => handleCall(driverPhone)}
                    style={styles.callButton}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  >
                    <Ionicons name="call-outline" size={30} color="#007AFF" />
                  </TouchableOpacity> */}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
        {specialInstructions && (
          <>
            <Text style={styles.infoLabel}>Special Instructions:</Text>
            <Text style={styles.infoText}>{specialInstructions}</Text>
          </>
        )}
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
    shadowOffset: { width: 0, height: 2 },
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
    color: '#666666',
    marginTop: 2,
  },
  time: {
    fontSize: 14,
    color: '#999999',
    marginTop: 4,
  },
  statusContainer: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  itemsContainer: {
    marginBottom: 12,
  },
  itemsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    marginRight: 12,
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
  },
  itemPrice: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  moreItems: {
    fontSize: 12,
    color: '#666666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  orderInfo: {
    marginBottom: 16,
  },
  driverBlock: {
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333333',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  infoText: {
    fontSize: 16,
    color: '#666666',
    flex: 1,
    textAlign: 'right',
  },
   infoTextDriver: {
    fontSize: 20,
    color: '#FF3B30',
    flex: 1,
    fontWeight: '500',
    textAlign: 'right',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },
  callButton: {
    marginLeft: 8,
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#34C759',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 14,
    color: '#555555',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default OrderCard;
