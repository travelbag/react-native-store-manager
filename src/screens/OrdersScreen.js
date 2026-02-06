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
  // Normalize status for filtering
  const normalizeStatus = (status) => {
    if (!status) return '';
    return String(status).toLowerCase();
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
      count: safeOrders.filter(o => normalizeStatus(o.status ?? o.orderStatus) === 'accepted').length 
    },
    { 
      key: ORDER_STATUS.READY, 
      label: 'Ready', 
      count: safeOrders.filter(o => normalizeStatus(o.status ?? o.orderStatus) === 'ready').length 
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
  ];

  // Simple filtering - each order appears in exactly one tab
  const filteredOrders = safeOrders.filter(order => {
    const orderStatus = normalizeStatus(order.status ?? order.orderStatus);
    return orderStatus === normalizeStatus(selectedFilter);
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

  const renderOrderItem = ({ item }) => (
    <OrderCard order={{
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
    }} />
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
  <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={styles.headerTitle}>Store Manager</Text>
          <Text style={styles.headerSubtitle}>
            {manager?.storeName || 'Store'} • {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.userButton}
            onPress={() => navigation.navigate("Profile")}
          >
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{manager?.name || 'Manager'}</Text>
              <Text style={styles.userRole}>{manager?.role || 'Store Manager'}</Text>
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

      <FlatList
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666666',
    marginTop: 4,
  },
  headerActions: {
    marginLeft: 16,
  },
  userButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
  },
  userInfo: {
    marginRight: 8,
    alignItems: 'flex-end',
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
