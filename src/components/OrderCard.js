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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOrders, ORDER_STATUS, ITEM_STATUS } from '../context/OrdersContext';
import { useNavigation } from '@react-navigation/native';

const PACKAGE_RACK_OPTIONS_CARD = ['A', 'B', 'C', 'D'].flatMap((col) =>
  Array.from({ length: 15 }, (_, idx) => `${col}${idx + 1}`)
);

const OrderCard = ({ order, hideStatusBadge = false }) => {
  const { updateOrderStatus, acceptOrder, rejectOrder, refreshOrders, mergeOrderPackageRack, markOrderReady } = useOrders();
  const navigation = useNavigation();
  const [noDriverVisible, setNoDriverVisible] = React.useState(false);
  const [isAssigningDriver, setIsAssigningDriver] = React.useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = React.useState(false);
  const [rackModalVisible, setRackModalVisible] = React.useState(false);

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
  const orderRackFromServer = String(
    order?.packageRack || order?.rackNumber || order?.rack_number || ''
  ).trim();
  const [rackPickOptimistic, setRackPickOptimistic] = React.useState(null);

  React.useEffect(() => {
    if (!rackPickOptimistic) return;
    if (!orderRackFromServer) return;
    if (orderRackFromServer === rackPickOptimistic) {
      setRackPickOptimistic(null);
      return;
    }
    setRackPickOptimistic(null);
  }, [orderRackFromServer, rackPickOptimistic]);

  const packageRack = String(rackPickOptimistic || orderRackFromServer || '').trim();
  const hasAssignedRack = Boolean(packageRack);

  const isPrintItem = (item) => {
    const rawType = String(item?.item_type || item?.type || '').toLowerCase();
    return rawType === 'print' || Boolean(item?.fileUrl || item?.file_url || item?.printUrl || item?.print_url);
  };

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

  /** Product shelf rack (not package rack) — same sources as picking screen */
  const getItemRackLabel = (item) => {
    const rack = String(
      item?.product_racknumber ||
        item?.rack?.location ||
        item?.rack_number ||
        item?.rackNumber ||
        ''
    ).trim();
    return rack || '—';
  };


  const getStatusColor = (status) => {
    switch (status) {
      case ORDER_STATUS.PENDING:
        return '#FF9500';
      case ORDER_STATUS.ACCEPTED:
        return '#007AFF';
      case ORDER_STATUS.READY:
        return '#F59E0B';
      case ORDER_STATUS.COMPLETED:
        return '#8E8E93';
      case ORDER_STATUS.REJECTED:
        return '#FF3B30';
      case 'cancelled':
        return '#8E8E93';
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
        return 'Ready (waiting assignment)';
      case 'assigned':
        return 'Assigned';
      case 'completed':
      case 'delivered':
        return 'Delivered';
      case 'rejected':
        return 'Rejected';
      case 'cancelled':
        return 'Cancelled';
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

  const handleMarkReady = async () => {
    if (isAssigningDriver) return;
    if (!hasAssignedRack) {
      Alert.alert('Select package rack', 'Please select the package rack before marking the order ready.');
      return;
    }
    try {
      setIsAssigningDriver(true);
      await markOrderReady(orderId);
      if (typeof refreshOrders === 'function') {
        await refreshOrders(null, { force: true });
      }
      navigation.navigate('OrdersList', {
        selectedTab: ORDER_STATUS.ACCEPTED,
        readyNotice: 'Order marked ready. Assigning driver…',
      });
    } catch (error) {
      const message = error?.message || 'Failed to mark order ready';
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

  const statusNormalized = String(status || '').toLowerCase();
  /** Hide the long items list on Pending / Accepted so Accept & Start Picking stay visible on small scanners. */
  const useCompactItems =
    statusNormalized === 'pending' || statusNormalized === 'accepted' || statusNormalized === 'ready';

  const allItemsFinalized = React.useMemo(() => {
    if (!items.length) return false;
    return items.every((it) => {
      const st = String(it?.status || '').toLowerCase();
      return st === ITEM_STATUS.SCANNED || st === ITEM_STATUS.UNAVAILABLE;
    });
  }, [items]);

  const renderItemsList = () =>
    items.map((item, index) => (
      <View key={index} style={styles.itemRow}>
        {isPrintItem(item) ? (
          <View style={styles.printIcon}>
            <Ionicons name="document-text-outline" size={20} color="#007AFF" />
          </View>
        ) : (
          <Image source={{ uri: item.image }} style={styles.itemImage} />
        )}
        <View style={styles.itemDetails}>
          <View style={styles.itemTitleRow}>
            <Text style={styles.itemName}>
              {isPrintItem(item) ? getPrintFileName(item) : item.name}
            </Text>
            {isPrintItem(item) && (
              <View style={styles.printBadge}>
                <Text style={styles.printBadgeText}>PRINT</Text>
              </View>
            )}
          </View>
          <Text style={styles.itemPrice}>
            {(() => {
              if (isPrintItem(item)) {
                const meta = getPrintMeta(item);
                return `${meta.quantity} × ₹${meta.price} = ₹${(meta.quantity * meta.price).toFixed(2)}`;
              }
              const price = Number(item?.price ?? 0);
              const quantity = Number(item?.quantity ?? 0);
              return `${quantity} × ₹${price} = ₹${(quantity * price).toFixed(2)}`;
            })()}
          </Text>
          {isPrintItem(item) &&
            (() => {
              const meta = getPrintMeta(item);
              return (
                <Text style={styles.printMeta}>
                  {meta.pages} pages | {meta.colorMode === 'black_white' ? 'B/W' : 'Color'} | {meta.orientation}
                </Text>
              );
            })()}
        </View>
        {item.status === ITEM_STATUS.SCANNED && (
          <Ionicons name="checkmark-circle" size={20} color="#34C759" />
        )}
      </View>
    ));

  /** Image + rack only (no product name) — reused for accepted strip & pending top row */
  const renderRackThumbStripCells = () => {
    if (!items.length) {
      return (
        <View style={styles.compactThumbCell}>
          <View style={styles.compactThumbPlaceholder} />
          <Text style={styles.compactThumbRack} numberOfLines={2}>
            —
          </Text>
        </View>
      );
    }
    return items.map((item, index) => (
      <View key={index} style={styles.compactThumbCell}>
        {isPrintItem(item) ? (
          <View style={styles.compactThumbPrint}>
            <Ionicons name="document-text-outline" size={22} color="#007AFF" />
          </View>
        ) : (
          <Image source={{ uri: item.image }} style={styles.compactThumbImage} />
        )}
        <Text style={styles.compactThumbRack} numberOfLines={2}>
          {getItemRackLabel(item)}
        </Text>
      </View>
    ));
  };

  /** Pending + accepted compact card: full-width thumb + rack row (slide for more) */
  const renderCompactRackThumbRow = () => (
    <View style={styles.compactRackRowOuter}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={items.length > 2}
        keyboardShouldPersistTaps="handled"
        style={styles.compactRackRowScroll}
        contentContainerStyle={styles.compactRackRowContent}
      >
        {renderRackThumbStripCells()}
      </ScrollView>
      {items.length > 1 ? (
        <View style={styles.compactRackRowChevron} pointerEvents="none">
          <Ionicons name="chevron-forward" size={22} color="#8E8E93" />
        </View>
      ) : null}
    </View>
  );

  /** Accepted-tab details modal: image + name (+ line details) on left, rack on the right */
  const renderAcceptedDetailsItemsList = () =>
    items.map((item, index) => (
      <View key={index} style={styles.acceptedDetailsItemWrap}>
        <View style={styles.acceptedDetailsItemRow}>
          <View style={styles.acceptedDetailsLeftCluster}>
            {isPrintItem(item) ? (
              <View style={styles.printIcon}>
                <Ionicons name="document-text-outline" size={20} color="#007AFF" />
              </View>
            ) : (
              <Image source={{ uri: item.image }} style={styles.itemImage} />
            )}
            <View style={styles.acceptedDetailsTextCol}>
              <View style={styles.itemTitleRow}>
                <Text style={styles.itemName} numberOfLines={3}>
                  {isPrintItem(item) ? getPrintFileName(item) : item.name}
                </Text>
                {isPrintItem(item) ? (
                  <View style={styles.printBadge}>
                    <Text style={styles.printBadgeText}>PRINT</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.itemPrice}>
                {(() => {
                  if (isPrintItem(item)) {
                    const meta = getPrintMeta(item);
                    return `${meta.quantity} × ₹${meta.price} = ₹${(meta.quantity * meta.price).toFixed(2)}`;
                  }
                  const price = Number(item?.price ?? 0);
                  const quantity = Number(item?.quantity ?? 0);
                  return `${quantity} × ₹${price} = ₹${(quantity * price).toFixed(2)}`;
                })()}
              </Text>
              {isPrintItem(item) ? (
                (() => {
                  const meta = getPrintMeta(item);
                  return (
                    <Text style={styles.printMeta}>
                      {meta.pages} pages | {meta.colorMode === 'black_white' ? 'B/W' : 'Color'} | {meta.orientation}
                    </Text>
                  );
                })()
              ) : null}
            </View>
          </View>
          <View style={styles.acceptedDetailsRackCol}>
            <Text style={styles.acceptedDetailsRackRight} numberOfLines={2}>
              {getItemRackLabel(item)}
            </Text>
            {item.status === ITEM_STATUS.SCANNED ? (
              <Ionicons name="checkmark-circle" size={18} color="#34C759" style={styles.acceptedDetailsPickIcon} />
            ) : null}
          </View>
        </View>
      </View>
    ));

  const renderAcceptedActions = () => {
    if (statusNormalized === ORDER_STATUS.READY) {
      return (
        <View style={styles.cardFinalizeRow}>
          <TouchableOpacity
            style={styles.cardRackHalf}
            onPress={() => setRackModalVisible(true)}
            activeOpacity={0.75}
          >
            <Text style={styles.cardRackLabel}>Package rack</Text>
            <Text style={styles.cardRackValue} numberOfLines={1}>
              {packageRack || 'Select…'}
            </Text>
          </TouchableOpacity>
          <View style={[styles.cardAssignHalf, styles.cardAssignHalfDisabled]}>
            <Ionicons name="time-outline" size={18} color="#FFFFFF" />
            <Text style={styles.cardAssignHalfText}>Waiting assignment</Text>
          </View>
        </View>
      );
    }
    if (!allItemsFinalized) {
      return (
        <TouchableOpacity style={styles.primaryButton} onPress={handleStartPicking}>
          <Ionicons name="basket-outline" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.primaryButtonText}>Start Picking</Text>
        </TouchableOpacity>
      );
    }
    return (
      <View style={styles.cardFinalizeRow}>
        <TouchableOpacity
          style={styles.cardRackHalf}
          onPress={() => setRackModalVisible(true)}
          activeOpacity={0.75}
        >
          <Text style={styles.cardRackLabel}>Package rack</Text>
          <Text style={styles.cardRackValue} numberOfLines={1}>
            {packageRack || 'Select…'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.cardAssignHalf,
            isAssigningDriver && styles.cardAssignHalfDisabled,
          ]}
          disabled={isAssigningDriver}
          onPress={handleMarkReady}
        >
          <Ionicons name="checkmark-done-outline" size={18} color="#FFFFFF" />
          <Text style={styles.cardAssignHalfText}>
            {isAssigningDriver ? 'Saving…' : 'Mark Ready'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderActionButtons = () => {
    if (statusNormalized === 'accepted' || statusNormalized === ORDER_STATUS.READY) {
      return renderAcceptedActions();
    }
    switch (statusNormalized) {
      case 'pending':
        return (
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.acceptButton} onPress={handleAcceptOrder}>
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return null;
    }
  };

  const renderOrderDetailsBody = () => {
    if (statusNormalized === 'accepted' || statusNormalized === ORDER_STATUS.READY) {
      return (
        <>
          <Text style={styles.detailsSectionTitle}>Items ({items.length})</Text>
          {renderAcceptedDetailsItemsList()}

          <Text style={[styles.detailsSectionTitle, styles.detailsSectionSpaced]}>Customer</Text>
          <Text style={styles.detailsLine}>{customerName || '—'}</Text>

          <Text style={[styles.detailsSectionTitle, styles.detailsSectionSpaced]}>Phone</Text>
          <View style={styles.detailsPhoneRow}>
            <Text style={styles.detailsLine}>{phoneNumber || '—'}</Text>
            {phoneNumber ? (
              <TouchableOpacity onPress={() => handleCall(phoneNumber)} hitSlop={10}>
                <Ionicons name="call-outline" size={22} color="#007AFF" />
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={[styles.detailsSectionTitle, styles.detailsSectionSpaced]}>Address</Text>
          <Text style={styles.detailsBlock}>{deliveryAddress || '—'}</Text>

          <Text style={[styles.detailsSectionTitle, styles.detailsSectionSpaced]}>Total</Text>
          <Text style={styles.detailsLineStrong}>₹{total}</Text>
        </>
      );
    }

    return (
      <>
        <Text style={styles.detailsSectionTitle}>Customer</Text>
        <Text style={styles.detailsLine}>{customerName || '—'}</Text>
        <Text style={styles.detailsMeta}>Placed {formatDateTime(timestamp) || '—'}</Text>
        <Text style={styles.detailsMeta}>Status: {getStatusText(status)}</Text>

        <Text style={[styles.detailsSectionTitle, styles.detailsSectionSpaced]}>Total</Text>
        <Text style={styles.detailsLineStrong}>₹{total}</Text>

        <Text style={[styles.detailsSectionTitle, styles.detailsSectionSpaced]}>Address</Text>
        <Text style={styles.detailsBlock}>{deliveryAddress || '—'}</Text>

        <Text style={[styles.detailsSectionTitle, styles.detailsSectionSpaced]}>Phone</Text>
        <View style={styles.detailsPhoneRow}>
          <Text style={styles.detailsLine}>{phoneNumber || '—'}</Text>
          {phoneNumber ? (
            <TouchableOpacity onPress={() => handleCall(phoneNumber)} hitSlop={10}>
              <Ionicons name="call-outline" size={22} color="#007AFF" />
            </TouchableOpacity>
          ) : null}
        </View>

        {deliveryType ? (
          <>
            <Text style={[styles.detailsSectionTitle, styles.detailsSectionSpaced]}>Delivery</Text>
            <Text style={styles.detailsLine}>{deliveryType}</Text>
          </>
        ) : null}

        {hasAssignedRack ? (
          <>
            <Text style={[styles.detailsSectionTitle, styles.detailsSectionSpaced]}>Package rack</Text>
            <Text style={styles.detailsLineStrong}>{packageRack}</Text>
          </>
        ) : null}

        {(driverName || driverPhone) && String(status || '').toLowerCase() === 'assigned' ? (
          <View style={styles.detailsDriverBlock}>
            <Text style={[styles.detailsSectionTitle, styles.detailsSectionSpaced]}>Driver</Text>
            <Text style={styles.detailsLine}>{driverName || 'Assigned'}</Text>
            {driverPhone ? (
              <View style={styles.detailsPhoneRow}>
                <Text style={styles.detailsLine}>{driverPhone}</Text>
                <TouchableOpacity onPress={() => handleCall(driverPhone)} hitSlop={10}>
                  <Ionicons name="call-outline" size={22} color="#007AFF" />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        {specialInstructions ? (
          <>
            <Text style={[styles.detailsSectionTitle, styles.detailsSectionSpaced]}>Instructions</Text>
            <Text style={styles.detailsBlock}>{specialInstructions}</Text>
          </>
        ) : null}

        <Text style={[styles.detailsSectionTitle, styles.detailsSectionSpaced]}>
          Items ({items.length})
        </Text>
        {renderItemsList()}
      </>
    );
  };

  return (
    <View style={[styles.container, useCompactItems && styles.containerMinimal]}>
      <Modal
        animationType="fade"
        transparent
        visible={rackModalVisible}
        onRequestClose={() => setRackModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setRackModalVisible(false)}>
          <Pressable style={styles.rackPickModalCard} onPress={() => {}}>
            <View style={styles.itemsModalHeader}>
              <Text style={styles.itemsModalTitle}>Select package rack</Text>
              <TouchableOpacity onPress={() => setRackModalVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.rackPickScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.rackPickGrid}>
                {PACKAGE_RACK_OPTIONS_CARD.map((rack) => (
                  <TouchableOpacity
                    key={rack}
                    style={[
                      styles.rackPickOption,
                      packageRack === rack && styles.rackPickOptionSelected,
                    ]}
                    onPress={() => {
                      setRackPickOptimistic(rack);
                      mergeOrderPackageRack(orderId, rack);
                      setRackModalVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.rackPickOptionText,
                        packageRack === rack && styles.rackPickOptionTextSelected,
                      ]}
                    >
                      {rack}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={detailsModalVisible}
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDetailsModalVisible(false)}>
          <Pressable style={styles.orderDetailsModalCard} onPress={() => {}}>
            <View style={styles.itemsModalHeader}>
              <Text style={styles.itemsModalTitle}>Order #{orderId}</Text>
              <TouchableOpacity onPress={() => setDetailsModalVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.orderDetailsScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {renderOrderDetailsBody()}
            </ScrollView>
            <TouchableOpacity style={styles.detailsDoneButton} onPress={() => setDetailsModalVisible(false)}>
              <Text style={styles.detailsDoneButtonText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

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
      {useCompactItems ? (
        <>
          <Pressable
            style={styles.compactOrderIdPress}
            onPress={() => setDetailsModalVisible(true)}
            android_ripple={{ color: '#E5E5EA' }}
          >
            <Text style={styles.compactOrderIdText}>Order #{orderId}</Text>
            <Text style={styles.compactOrderIdHint}>Tap for customer, products & total</Text>
          </Pressable>
          {renderCompactRackThumbRow()}
          <View style={styles.compactActionsWrap}>{renderActionButtons()}</View>
        </>
      ) : (
        <>
      <View style={styles.header}>
        <View>
          <Text style={styles.orderId}>Order #{orderId}</Text>
          <Text style={styles.customerName}>{customerName}</Text>
          <Text style={styles.time}>{formatDateTime(timestamp)}</Text>
        </View>
        {!hideStatusBadge || packageRack ? (
          <View style={styles.statusContainer}>
            {!hideStatusBadge ? (
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
                <Text style={styles.statusText}>{getStatusText(status)}</Text>
              </View>
            ) : null}
            {packageRack ? (
              <View style={styles.rackBadge}>
                <Ionicons name="cube-outline" size={14} color="#FFFFFF" />
                <Text style={styles.rackBadgeText}>{packageRack}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
        <View style={styles.itemsContainer}>
          <Text style={styles.itemsTitle}>Items ({items.length})</Text>
          {items.slice(0, 3).map((item, index) => (
            <View key={index} style={styles.itemRow}>
              {isPrintItem(item) ? (
                <View style={styles.printIcon}>
                  <Ionicons name="document-text-outline" size={20} color="#007AFF" />
                </View>
              ) : (
                <Image source={{ uri: item.image }} style={styles.itemImage} />
              )}
              <View style={styles.itemDetails}>
                <View style={styles.itemTitleRow}>
                  <Text style={styles.itemName}>
                    {isPrintItem(item) ? getPrintFileName(item) : item.name}
                  </Text>
                  {isPrintItem(item) && (
                    <View style={styles.printBadge}>
                      <Text style={styles.printBadgeText}>PRINT</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.itemPrice}>
                  {(() => {
                    if (isPrintItem(item)) {
                      const meta = getPrintMeta(item);
                      return `${meta.quantity} × ₹${meta.price} = ₹${(meta.quantity * meta.price).toFixed(2)}`;
                    }
                    const price = Number(item?.price ?? 0);
                    const quantity = Number(item?.quantity ?? 0);
                    return `${quantity} × ₹${price} = ₹${(quantity * price).toFixed(2)}`;
                  })()}
                </Text>
                {isPrintItem(item) &&
                  (() => {
                    const meta = getPrintMeta(item);
                    return (
                      <Text style={styles.printMeta}>
                        {meta.pages} pages | {meta.colorMode === 'black_white' ? 'B/W' : 'Color'} |{' '}
                        {meta.orientation}
                      </Text>
                    );
                  })()}
              </View>
              {item.status === ITEM_STATUS.SCANNED && (
                <Ionicons name="checkmark-circle" size={20} color="#34C759" />
              )}
            </View>
          ))}
          {items.length > 3 && (
            <Text style={styles.moreItems}>+{items.length - 3} more items</Text>
          )}
        </View>

      <View style={styles.orderInfo}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Total:</Text>
          <Text style={styles.infoValue}>₹{total}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Address:</Text>
          <Text style={styles.infoText}>{deliveryAddress}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phone:</Text>
          <Text style={styles.infoText}>{phoneNumber}</Text>
        </View>
        {packageRack ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Package Rack:</Text>
            <Text style={styles.infoTextDriver}>{packageRack}</Text>
          </View>
        ) : null}
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
        </>
      )}
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
  containerMinimal: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  compactOrderIdPress: {
    width: '100%',
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#C5CCD6',
    borderRadius: 10,
    backgroundColor: '#FAFAFA',
  },
  compactOrderIdText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  compactOrderIdHint: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 4,
    fontWeight: '500',
  },
  compactRackRowOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingLeft: 6,
    paddingVertical: 6,
    paddingRight: 4,
  },
  compactRackRowScroll: {
    flex: 1,
    minWidth: 0,
    maxHeight: 86,
  },
  compactRackRowChevron: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 2,
    paddingRight: 2,
    opacity: 0.95,
  },
  compactRackRowContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 2,
    paddingRight: 8,
  },
  compactThumbCell: {
    width: 58,
    alignItems: 'center',
    marginRight: 10,
  },
  compactThumbImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#ECECEC',
  },
  compactThumbPrint: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactThumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#ECECEC',
  },
  compactThumbRack: {
    fontSize: 11,
    fontWeight: '700',
    color: '#007AFF',
    textAlign: 'center',
    marginTop: 4,
    width: '100%',
  },
  cardFinalizeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  cardRackHalf: {
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
  cardRackLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  cardRackValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  cardAssignHalf: {
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
  cardAssignHalfDisabled: {
    backgroundColor: '#A8B0BC',
  },
  cardAssignHalfText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  rackPickModalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  rackPickScroll: {
    maxHeight: 360,
    paddingHorizontal: 12,
  },
  rackPickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  rackPickOption: {
    width: '18%',
    minWidth: 52,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rackPickOptionSelected: {
    backgroundColor: '#007AFF',
  },
  rackPickOptionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  rackPickOptionTextSelected: {
    color: '#FFFFFF',
  },
  orderDetailsModalCard: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingBottom: 8,
    overflow: 'hidden',
  },
  orderDetailsScroll: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    maxHeight: 420,
  },
  detailsSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailsSectionSpaced: {
    marginTop: 14,
  },
  detailsLine: {
    fontSize: 15,
    color: '#1C1C1E',
    marginTop: 4,
  },
  detailsLineStrong: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    marginTop: 4,
  },
  detailsMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  detailsBlock: {
    fontSize: 14,
    color: '#333',
    marginTop: 4,
    lineHeight: 20,
  },
  detailsPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 12,
  },
  detailsDriverBlock: {
    marginTop: 0,
  },
  detailsDoneButton: {
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: 4,
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  detailsDoneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
  rackBadge: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#1F2937',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rackBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  compactActionsWrap: {
    marginBottom: 0,
  },
  itemsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  itemsModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
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
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
  },
  printIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  printBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  printBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#335CFF',
  },
  itemPrice: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  printMeta: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 2,
  },
  acceptedDetailsItemWrap: {
    marginBottom: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },
  acceptedDetailsItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  acceptedDetailsLeftCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
    marginRight: 10,
  },
  acceptedDetailsTextCol: {
    flex: 1,
    minWidth: 0,
  },
  acceptedDetailsRackCol: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    maxWidth: '32%',
    flexShrink: 0,
    paddingTop: 2,
  },
  acceptedDetailsRackRight: {
    fontSize: 14,
    fontWeight: '700',
    color: '#007AFF',
    textAlign: 'right',
  },
  acceptedDetailsPickIcon: {
    marginTop: 4,
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
  assignDriverButton: {
    backgroundColor: '#16A34A',
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
