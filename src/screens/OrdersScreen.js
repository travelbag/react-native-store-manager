import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useOrders, ORDER_STATUS } from '../context/OrdersContext';
import { useAuth } from '../context/AuthContext';
import OrderCard from '../components/OrderCard';
import { useFocusEffect } from '@react-navigation/native';
import { AppState } from 'react-native';

const OrdersScreen = ({ route, navigation }) => {
  const { orders, loading, refreshOrders } = useOrders();
  const { manager, logout } = useAuth();
  const [selectedFilter, setSelectedFilter] = useState(ORDER_STATUS.PENDING);
  const [refreshing, setRefreshing] = useState(false);
  const [alertedCancelledOrders, setAlertedCancelledOrders] = useState(new Set()); // Track alerted order IDs to prevent duplicates
  const [inlineNotice, setInlineNotice] = useState('');
  const insets = useSafeAreaInsets();

  // Handle navigation parameter to set the selected tab
  React.useEffect(() => {
    if (route?.params?.selectedTab) {
      setSelectedFilter(route.params.selectedTab);
      // Clear the parameter to prevent it from persisting
      route.params.selectedTab = undefined;
    }
  }, [route?.params?.selectedTab]);

  React.useEffect(() => {
    if (!route?.params?.readyNotice) {
      return undefined;
    }
    setInlineNotice(route.params.readyNotice);
    route.params.readyNotice = undefined;
    refreshOrders(null, { force: true });
    const refreshTimer = setTimeout(() => {
      refreshOrders(null, { force: true });
    }, 2000);
    const noticeTimer = setTimeout(() => {
      setInlineNotice('');
    }, 3000);
    return () => {
      clearTimeout(refreshTimer);
      clearTimeout(noticeTimer);
    };
  }, [route?.params?.readyNotice, refreshOrders]);

  // Detect newly cancelled orders and show alert (only once per order, for current orders not yet assigned/delivered)
  useEffect(() => {
    const currentOrders = Array.isArray(orders) ? orders : [];
    const cancelledOrders = currentOrders.filter(order => {
      const orderId = order?.id || order?.orderId;
      const currentStatus = String(order?.status || order?.orderStatus || '').toLowerCase();
      // Only alert for cancelled orders that are "current" (not yet assigned or delivered)
      const isCurrentOrder = ['pending', 'accepted', 'ready'].includes(currentStatus); // Adjust if needed based on your workflow
      return currentStatus === 'cancelled' && isCurrentOrder && !alertedCancelledOrders.has(orderId);
    });

    // Show alert for each qualifying cancelled order (only once)
    cancelledOrders.forEach(order => {
      const orderId = order?.id || order?.orderId;
      Alert.alert(
        'Order Cancelled',
        `Order #${orderId} has been cancelled.`,
        [{ text: 'OK' }]
      );
      // Mark as alerted to prevent future duplicates
      setAlertedCancelledOrders(prev => new Set(prev).add(orderId));
    });
  }, [orders, alertedCancelledOrders]); // Runs whenever orders change

  const safeOrders = Array.isArray(orders) ? orders : [];
  // Normalize status for filtering
  const normalizeStatus = (status) => {
    if (!status) return '';
    return String(status).toLowerCase();
  };

  const isAcceptedTabStatus = (o) => {
    const s = normalizeStatus(o.status ?? o.orderStatus);
    return s === 'accepted' || s === ORDER_STATUS.READY;
  };

  const filters = [
    { 
      key: ORDER_STATUS.PENDING, 
      label: 'Pending', 
      count: safeOrders.filter(o => normalizeStatus(o.status ?? o.orderStatus) === 'pending').length 
    },
    { 
      key: ORDER_STATUS.ACCEPTED, 
      label: 'Accepted', 
      count: safeOrders.filter(isAcceptedTabStatus).length 
    },
    { 
      key: ORDER_STATUS.ASSIGNED, 
      label: 'Assigned', 
      count: safeOrders.filter(o => normalizeStatus(o.status ?? o.orderStatus) === 'assigned').length 
    },
    { 
      key: ORDER_STATUS.COMPLETED, 
      label: 'Delivered', 
      count: safeOrders.filter(o => normalizeStatus(o.status ?? o.orderStatus) === 'delivered').length 
    },
    { 
      key: 'cancelled', 
      label: 'Cancelled', 
      count: safeOrders.filter(o => normalizeStatus(o.status ?? o.orderStatus) === 'cancelled').length 
    },
  ];

  // Accepted tab includes accepted orders and ready orders waiting for assignment.
  const filteredOrders = safeOrders.filter(order => {
    const orderStatus = normalizeStatus(order.status ?? order.orderStatus);
    const filter = normalizeStatus(selectedFilter);
    if (filter === normalizeStatus(ORDER_STATUS.ACCEPTED)) {
      return orderStatus === 'accepted' || orderStatus === ORDER_STATUS.READY;
    }
    return orderStatus === filter;
  });

    //console.log('Filtered Orders:', filteredOrders);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshOrders();
    } finally {
      setRefreshing(false);
    }
  };

  // Refresh whenever the screen gains focus for near-real-time sync across devices
  useFocusEffect(
    React.useCallback(() => {
      refreshOrders();
      return undefined;
    }, [refreshOrders])
  );

  // Refresh when app returns to foreground (active)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshOrders();
      }
    });
    return () => subscription.remove();
  }, [refreshOrders]);

  const hideStatusBadge =
    selectedFilter === ORDER_STATUS.ASSIGNED ||
    selectedFilter === ORDER_STATUS.COMPLETED ||
    selectedFilter === 'cancelled';

  const renderOrderItem = ({ item }) => (
    <OrderCard
      hideStatusBadge={hideStatusBadge}
      order={{
        ...item,
        id: item?.id ?? item?.orderId ?? '',
        status: item?.status ?? item?.orderStatus ?? 'N/A',
        totalPrice: item?.totalPrice ?? item?.total ?? 0,
        customerName: item?.customerName ?? '',
        orderDate: item?.orderDate ?? item?.timestamp ?? '',
        items: Array.isArray(item?.items)
          ? item.items
          : typeof item?.items === 'string'
            ? (() => { try { return JSON.parse(item.items); } catch { return []; } })()
            : [],
      }}
    />
  );

  const renderFilterButton = (filter) => (
    <TouchableOpacity
      key={filter.key}
      style={[
        styles.filterButton,
        selectedFilter === filter.key && styles.activeFilterButton,
      ]}
      onPress={() => setSelectedFilter(filter.key)}
    >
      <Text
        style={[
          styles.filterButtonText,
          selectedFilter === filter.key && styles.activeFilterButtonText,
        ]}
      >
        {filter.label}
      </Text>
      {typeof filter.count === 'number' && filter.count > 0 && (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{filter.count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>No Orders Found</Text>
      <Text style={styles.emptyStateSubtitle}>
        {selectedFilter === 'all' 
          ? 'New orders will appear here when they come in'
          : `No ${selectedFilter} orders at the moment`
        }
      </Text>
    </View>
  );

  const formatManagerName = (name) => {
    const safeName = String(name || 'Manager');
    if (safeName.length <= 11) return safeName;
    return `${safeName.slice(0, 11)}...`;
  };


  return (
  <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={styles.headerTitle} numberOfLines={1}>Store Manager</Text>
          <Text style={styles.headerStoreName} numberOfLines={1}>
            {manager?.storeName || 'Store'}
          </Text>
          <Text style={styles.headerOrders}>
            {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.userButton}
            onPress={() => navigation.navigate("Profile")}
          >
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1}>
                {formatManagerName(manager?.name)}
              </Text>
              <Text style={styles.userRole} numberOfLines={1}>
                {manager?.role || 'Store Manager'}
              </Text>
            </View>
            <Ionicons name="person-circle-outline" size={32} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filtersContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filters}
          renderItem={({ item }) => renderFilterButton(item)}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.filtersContent}
        />
      </View>

      {inlineNotice && filteredOrders.length > 0 ? (
        <View style={styles.noticeBanner}>
          <Ionicons name="information-circle" size={18} color="#0F5132" />
          <Text style={styles.noticeBannerText}>{inlineNotice}</Text>
        </View>
      ) : null}

      <FlatList
        key={selectedFilter}
        data={filteredOrders}
        renderItem={renderOrderItem}
        keyExtractor={(item, index) => {
          // Use id if available and unique, else fallback to orderId+index
          const id = item?.id || item?.orderId;
          return id ? `${id}` : `order-${index}`;
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={[
          styles.listContainer,
          filteredOrders.length === 0 && styles.emptyListContainer,
        ]}
        ListEmptyComponent={renderEmptyState}
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerMain: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  headerStoreName: {
    fontSize: 16,
    color: '#353535',
    marginTop: 6,
  },
  headerOrders: {
    fontSize: 16,
    color: '#FF3B30',
    marginTop: 2,
  },
  headerActions: {
    marginLeft: 16,
    width: 150,
  },
  userButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    width: '100%',
    justifyContent: 'space-between',
  },
  userInfo: {
    marginRight: 8,
    alignItems: 'flex-end',
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  userRole: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  filtersContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  noticeBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#E8F7EE',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noticeBannerText: {
    flex: 1,
    color: '#0F5132',
    fontSize: 14,
    fontWeight: '600',
  },
  filtersContent: {
    paddingHorizontal: 16,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  activeFilterButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333333',
  },
  activeFilterButtonText: {
    color: '#FFFFFF',
  },
  countBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
    minWidth: 20,
    alignItems: 'center',
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  listContainer: {
    paddingTop: 8,
    paddingBottom: 20,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default OrdersScreen;



