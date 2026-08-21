import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useOrders, ORDER_STATUS, isPickupFulfillmentOrder, isPickupReadyOrder, isPickupCompletedOrder, isPendingNewOrderStatus } from '../context/OrdersContext';
import { useAuth } from '../context/AuthContext';
import OrderCard from '../components/OrderCard';
import { useFocusEffect } from '@react-navigation/native';
import { AppState } from 'react-native';

const OrdersScreen = ({ route, navigation }) => {
  const { orders, loading, error, refreshOrders } = useOrders();
  const { manager } = useAuth();
  // Cancelled-order alerts are handled centrally in OrdersContext (with Order ID).
  const [selectedFilter, setSelectedFilter] = useState(ORDER_STATUS.PENDING);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  // Handle navigation parameter to set the selected tab
  React.useEffect(() => {
    if (route?.params?.selectedTab) {
      setSelectedFilter(route.params.selectedTab);
      // Clear the parameter to prevent it from persisting
      route.params.selectedTab = undefined;
    }
  }, [route?.params?.selectedTab]);

  const safeOrders = Array.isArray(orders) ? orders : [];
  // Normalize status for filtering (keep in sync with OrdersContext canonicalize aliases)
  const normalizeStatus = (status) => {
    if (!status) return '';
    const s = String(status).toLowerCase();
    if (s === 'pickedup' || s === 'picked_up' || s === 'completed') return 'delivered';
    return s;
  };

  const isAcceptedTabStatus = (o) => {
    const s = normalizeStatus(o.status ?? o.orderStatus);
    if (isPickupFulfillmentOrder(o) && s === ORDER_STATUS.READY) {
      return false;
    }
    return s === 'accepted' || s === ORDER_STATUS.READY;
  };

  const isPendingTabOrder = (order) =>
    isPendingNewOrderStatus(order?.status ?? order?.orderStatus);

  const filters = [
    { 
      key: ORDER_STATUS.PENDING, 
      label: 'Pending', 
      count: safeOrders.filter(isPendingTabOrder).length 
    },
    { 
      key: ORDER_STATUS.ACCEPTED, 
      label: 'Accepted', 
      count: safeOrders.filter(isAcceptedTabStatus).length 
    },
    {
      key: ORDER_STATUS.PICKUP_AT_STORE,
      label: 'Pick at Store',
      count: safeOrders.filter((o) => isPickupReadyOrder(o)).length,
    },
    { 
      key: ORDER_STATUS.ASSIGNED, 
      label: 'Assigned', 
      count: safeOrders.filter(o => {
        const s = normalizeStatus(o.status ?? o.orderStatus);
        return s === 'assigned' && !isPickupFulfillmentOrder(o);
      }).length 
    },
    { 
      key: ORDER_STATUS.COMPLETED, 
      label: 'Delivered', 
      count: safeOrders.filter(o => {
        const s = normalizeStatus(o.status ?? o.orderStatus);
        return s === 'delivered' || isPickupCompletedOrder(o);
      }).length 
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
    if (filter === normalizeStatus(ORDER_STATUS.PENDING)) {
      return isPendingTabOrder(order);
    }
    if (filter === normalizeStatus(ORDER_STATUS.PICKUP_AT_STORE)) {
      return isPickupReadyOrder(order);
    }
    if (filter === normalizeStatus(ORDER_STATUS.ACCEPTED)) {
      return orderStatus === 'accepted' || (orderStatus === ORDER_STATUS.READY && !isPickupFulfillmentOrder(order));
    }
    if (filter === normalizeStatus(ORDER_STATUS.COMPLETED)) {
      return orderStatus === 'delivered' || isPickupCompletedOrder(order);
    }
    if (filter === normalizeStatus(ORDER_STATUS.ASSIGNED)) {
      return orderStatus === 'assigned' && !isPickupFulfillmentOrder(order);
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
      refreshOrders(null, { force: true });
      return undefined;
    }, [refreshOrders])
  );

  // Refresh when app returns to foreground (active)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshOrders(null, { force: true });
      }
    });
    return () => subscription.remove();
  }, [refreshOrders]);

  const hideStatusBadge =
    selectedFilter === ORDER_STATUS.ASSIGNED ||
    selectedFilter === ORDER_STATUS.COMPLETED ||
    selectedFilter === ORDER_STATUS.PICKUP_AT_STORE ||
    selectedFilter === 'cancelled';

  const renderOrderItem = React.useCallback(
    ({ item }) => <OrderCard hideStatusBadge={hideStatusBadge} order={item} />,
    [hideStatusBadge]
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

  return (
  <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {manager?.storeName || 'Store'}
        </Text>
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

      {error ? (
        <View style={styles.syncWarningBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color="#9A6700" style={styles.syncWarningIcon} />
          <Text style={styles.syncWarningText}>{error}</Text>
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
          { paddingBottom: Math.max(insets.bottom, 12) + 16 },
          filteredOrders.length === 0 && styles.emptyListContainer,
        ]}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  filtersContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  filtersContent: {
    paddingHorizontal: 16,
  },
  syncWarningBanner: {
    backgroundColor: '#FFF4E5',
    borderBottomWidth: 1,
    borderBottomColor: '#FFD699',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  syncWarningIcon: {
    marginTop: 1,
  },
  syncWarningText: {
    color: '#9A6700',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
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
    paddingTop: 6,
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



