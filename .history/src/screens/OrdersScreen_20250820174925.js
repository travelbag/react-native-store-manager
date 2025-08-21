import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useOrders, ORDER_STATUS } from '../context/OrdersContext';
import OrderCard from '../components/OrderCard';

const OrdersScreen = () => {
  const { orders, loading } = useOrders();
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const filters = [
    { key: 'all', label: 'All Orders', count: orders.length },
    { key: ORDER_STATUS.PENDING, label: 'Pending', count: orders.filter(o => o.status === ORDER_STATUS.PENDING).length },
    { key: ORDER_STATUS.ACCEPTED, label: 'Accepted', count: orders.filter(o => o.status === ORDER_STATUS.ACCEPTED).length },
    { key: ORDER_STATUS.PICKING, label: 'Picking', count: orders.filter(o => o.status === ORDER_STATUS.PICKING).length },
    { key: ORDER_STATUS.PREPARING, label: 'Preparing', count: orders.filter(o => o.status === ORDER_STATUS.PREPARING).length },
    { key: ORDER_STATUS.READY, label: 'Ready', count: orders.filter(o => o.status === ORDER_STATUS.READY).length },
  ];

  const filteredOrders = selectedFilter === 'all' 
    ? orders.filter(order => order.status !== ORDER_STATUS.COMPLETED && order.status !== ORDER_STATUS.REJECTED)
    : orders.filter(order => order.status === selectedFilter);

  const onRefresh = () => {
    setRefreshing(true);
    // Simulate refresh
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const renderOrderItem = ({ item }) => (
    <OrderCard order={item} />
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
      {filter.count > 0 && (
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
            {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.addOrderButton}
          onPress={() => {
            // Simulate a new order for testing
            const newOrder = require('../context/OrdersContext').generateSampleGroceryOrder?.() || {
              id: Date.now(),
              customerName: 'Test Customer',
              items: [
                {
                  id: 'test_item',
                  name: 'Test Product',
                  quantity: 1,
                  price: 9.99,
                  barcode: '123456789',
                  image: 'https://images.unsplash.com/photo-1556909075-f3377fb8c666?w=300',
                  category: 'Test',
                  rack: { location: 'A1-B1', aisle: 'Test Aisle', description: 'Test location' },
                  status: 'pending'
                }
              ],
              total: '9.99',
              status: 'pending',
              timestamp: new Date().toISOString(),
              deliveryAddress: 'Test Address',
              phoneNumber: '+1 555-0123',
              orderType: 'grocery',
              deliveryType: 'home_delivery'
            };
            // This is just for demo - in real app, orders come from notifications
          }}
        >
          <Text style={styles.addOrderText}>+ Test Order</Text>
        </TouchableOpacity>
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
        keyExtractor={(item) => item.id.toString()}
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
