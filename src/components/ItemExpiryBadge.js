import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  formatInventoryExpiryDisplay,
  getInventoryExpiryAlert,
  getItemExpiryValue,
} from '../utils/inventoryExpiry';

/**
 * Shows "Expired" or "N days left" when expiry is within 30 days (or already past).
 */
const ItemExpiryBadge = ({ item, style, showDate = true }) => {
  const expiryValue = getItemExpiryValue(item);
  const alert = getInventoryExpiryAlert(expiryValue);
  if (!alert) return null;

  const isExpired = alert.status === 'expired';

  return (
    <View
      style={[
        styles.badge,
        isExpired ? styles.badgeExpired : styles.badgeExpiring,
        style,
      ]}
    >
      <Ionicons
        name={isExpired ? 'alert-circle' : 'time-outline'}
        size={15}
        color={isExpired ? '#B91C1C' : '#B45309'}
      />
      <Text style={[styles.label, isExpired ? styles.labelExpired : styles.labelExpiring]}>
        {alert.label}
      </Text>
      {showDate && expiryValue ? (
        <Text style={[styles.date, isExpired ? styles.labelExpired : styles.labelExpiring]}>
          · {formatInventoryExpiryDisplay(expiryValue)}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
  },
  badgeExpired: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
    borderWidth: 1,
  },
  badgeExpiring: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
    borderWidth: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
  labelExpired: {
    color: '#B91C1C',
  },
  labelExpiring: {
    color: '#B45309',
  },
  date: {
    fontSize: 12,
    fontWeight: '500',
  },
});

export default ItemExpiryBadge;
