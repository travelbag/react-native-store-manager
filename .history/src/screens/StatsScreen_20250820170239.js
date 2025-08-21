import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useOrders, ORDER_STATUS } from '../context/OrdersContext';

const StatsScreen = () => {
  const { orders } = useOrders();

  const today = new Date();
  const todayOrders = orders.filter(order => {
    const orderDate = new Date(order.timestamp);
    return orderDate.toDateString() === today.toDateString();
  });

  const stats = {
    totalOrders: orders.length,
    todayOrders: todayOrders.length,
    pendingOrders: orders.filter(o => o.status === ORDER_STATUS.PENDING).length,
    acceptedOrders: orders.filter(o => o.status === ORDER_STATUS.ACCEPTED).length,
    preparingOrders: orders.filter(o => o.status === ORDER_STATUS.PREPARING).length,
    readyOrders: orders.filter(o => o.status === ORDER_STATUS.READY).length,
    completedOrders: orders.filter(o => o.status === ORDER_STATUS.COMPLETED).length,
    rejectedOrders: orders.filter(o => o.status === ORDER_STATUS.REJECTED).length,
    totalRevenue: orders
      .filter(o => o.status === ORDER_STATUS.COMPLETED)
      .reduce((sum, order) => sum + parseFloat(order.total), 0),
    todayRevenue: todayOrders
      .filter(o => o.status === ORDER_STATUS.COMPLETED)
      .reduce((sum, order) => sum + parseFloat(order.total), 0),
  };

  const StatCard = ({ title, value, subtitle, color = '#007AFF' }) => (
    <View style={styles.statCard}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
    </View>
  );

  const StatusCard = ({ status, count, color }) => (
    <View style={styles.statusCard}>
      <View style={[styles.statusIndicator, { backgroundColor: color }]} />
      <View style={styles.statusInfo}>
        <Text style={styles.statusLabel}>{status}</Text>
        <Text style={styles.statusCount}>{count}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Analytics</Text>
          <Text style={styles.headerSubtitle}>Store performance overview</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Summary</Text>
          <View style={styles.statsGrid}>
            <StatCard
              title="Orders Today"
              value={stats.todayOrders}
              subtitle="orders received"
              color="#34C759"
            />
            <StatCard
              title="Revenue Today"
              value={`$${stats.todayRevenue.toFixed(2)}`}
              subtitle="earnings"
              color="#FF9500"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overall Statistics</Text>
          <View style={styles.statsGrid}>
            <StatCard
              title="Total Orders"
              value={stats.totalOrders}
              subtitle="all time"
            />
            <StatCard
              title="Total Revenue"
              value={`$${stats.totalRevenue.toFixed(2)}`}
              subtitle="all time"
              color="#FF9500"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Status Breakdown</Text>
          <View style={styles.statusGrid}>
            <StatusCard
              status="Pending"
              count={stats.pendingOrders}
              color="#FF9500"
            />
            <StatusCard
              status="Accepted"
              count={stats.acceptedOrders}
              color="#007AFF"
            />
            <StatusCard
              status="Preparing"
              count={stats.preparingOrders}
              color="#FF9500"
            />
            <StatusCard
              status="Ready"
              count={stats.readyOrders}
              color="#34C759"
            />
            <StatusCard
              status="Completed"
              count={stats.completedOrders}
              color="#8E8E93"
            />
            <StatusCard
              status="Rejected"
              count={stats.rejectedOrders}
              color="#FF3B30"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance Metrics</Text>
          <View style={styles.metricsContainer}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Average Order Value</Text>
              <Text style={styles.metricValue}>
                ${stats.completedOrders > 0 
                  ? (stats.totalRevenue / stats.completedOrders).toFixed(2)
                  : '0.00'
                }
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Completion Rate</Text>
              <Text style={styles.metricValue}>
                {stats.totalOrders > 0 
                  ? ((stats.completedOrders / stats.totalOrders) * 100).toFixed(1)
                  : '0'
                }%
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Rejection Rate</Text>
              <Text style={styles.metricValue}>
                {stats.totalOrders > 0 
                  ? ((stats.rejectedOrders / stats.totalOrders) * 100).toFixed(1)
                  : '0'
                }%
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statTitle: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 8,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statSubtitle: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
  },
  statusGrid: {
    gap: 8,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 16,
    color: '#333333',
  },
  statusCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
  },
  metricsContainer: {
    backgroundColor: '#FFFFFF',
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
  metricItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  metricLabel: {
    fontSize: 16,
    color: '#333333',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
});

export default StatsScreen;
