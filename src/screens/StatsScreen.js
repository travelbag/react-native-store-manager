import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useOrders } from '../context/OrdersContext';

const RANGE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
];

const toDateOnlyKey = (val) => {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseDateKey = (key) => {
  const [y, m, d] = String(key || '').split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0, 0);
};

const shiftDateKey = (key, days) => {
  const next = parseDateKey(key);
  next.setDate(next.getDate() + days);
  return toDateOnlyKey(next);
};

const startOfWeekMonday = (date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
};

const formatDisplayDate = (key) => {
  const d = parseDateKey(key);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const getOrderDateField = (order) =>
  order?.timestamp ?? order?.orderDate ?? order?.created_at ?? order?.acceptedAt ?? null;

const DateStepper = ({ label, value, onChange }) => (
  <View style={styles.stepper}>
    <Text style={styles.stepperLabel}>{label}</Text>
    <View style={styles.stepperRow}>
      <Pressable style={styles.stepperBtn} onPress={() => onChange(shiftDateKey(value, -1))}>
        <Ionicons name="chevron-back" size={18} color="#111827" />
      </Pressable>
      <Text style={styles.stepperValue}>{formatDisplayDate(value)}</Text>
      <Pressable style={styles.stepperBtn} onPress={() => onChange(shiftDateKey(value, 1))}>
        <Ionicons name="chevron-forward" size={18} color="#111827" />
      </Pressable>
    </View>
  </View>
);

const StatsScreen = () => {
  const { orders } = useOrders();
  const todayKey = toDateOnlyKey(new Date());
  const [range, setRange] = useState('today');
  const [customFrom, setCustomFrom] = useState(todayKey);
  const [customTo, setCustomTo] = useState(todayKey);

  const { count, caption, totalOrders } = useMemo(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];
    const now = new Date();
    let fromKey = todayKey;
    let toKey = todayKey;

    if (range === 'week') {
      fromKey = toDateOnlyKey(startOfWeekMonday(now));
      const end = startOfWeekMonday(now);
      end.setDate(end.getDate() + 6);
      toKey = toDateOnlyKey(end);
    } else if (range === 'month') {
      fromKey = toDateOnlyKey(new Date(now.getFullYear(), now.getMonth(), 1));
      toKey = toDateOnlyKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (range === 'custom') {
      fromKey = customFrom <= customTo ? customFrom : customTo;
      toKey = customFrom <= customTo ? customTo : customFrom;
    }

    const matched = safeOrders.filter((order) => {
      const key = toDateOnlyKey(getOrderDateField(order));
      return key && key >= fromKey && key <= toKey;
    });

    const captionText =
      fromKey === toKey
        ? formatDisplayDate(fromKey)
        : `${formatDisplayDate(fromKey)} – ${formatDisplayDate(toKey)}`;

    return { count: matched.length, caption: captionText, totalOrders: safeOrders.length };
  }, [orders, range, customFrom, customTo, todayKey]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Analytics</Text>
        <Text style={styles.headerSubtitle}>Order counts for your store</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {RANGE_OPTIONS.map((option) => {
            const active = range === option.key;
            return (
              <Pressable
                key={option.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setRange(option.key)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {range === 'custom' ? (
          <View style={styles.customBlock}>
            <DateStepper label="From" value={customFrom} onChange={setCustomFrom} />
            <DateStepper label="To" value={customTo} onChange={setCustomTo} />
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={[styles.iconWrap, styles.iconToday]}>
            <Ionicons name="receipt-outline" size={22} color="#047857" />
          </View>
          <Text style={styles.cardLabel}>Orders in period</Text>
          <Text style={styles.cardValue}>{count}</Text>
          <Text style={styles.cardCaption}>{caption}</Text>
        </View>

        <View style={styles.card}>
          <View style={[styles.iconWrap, styles.iconTotal]}>
            <Ionicons name="layers-outline" size={22} color="#1D4ED8" />
          </View>
          <Text style={styles.cardLabel}>Total orders</Text>
          <Text style={[styles.cardValue, styles.cardValueTotal]}>{totalOrders}</Text>
          <Text style={styles.cardCaption}>All orders loaded for this store</Text>
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  body: {
    padding: 16,
    paddingBottom: 28,
  },
  chips: {
    gap: 8,
    paddingBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  customBlock: {
    gap: 8,
    marginBottom: 8,
  },
  stepper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  stepperLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 6,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 4,
    marginBottom: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  iconTotal: {
    backgroundColor: '#DBEAFE',
  },
  iconToday: {
    backgroundColor: '#D1FAE5',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  cardValue: {
    marginTop: 4,
    fontSize: 40,
    fontWeight: '800',
    color: '#047857',
  },
  cardValueTotal: {
    color: '#1D4ED8',
  },
  cardCaption: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
});

export default StatsScreen;
