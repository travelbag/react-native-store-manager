import React from 'react';
import { Text, StyleSheet } from 'react-native';
import {
  formatInventoryExpiryDisplay,
  getItemExpiryValue,
} from '../utils/inventoryExpiry';

/**
 * Plain expiry date text after an item is picked. No alerts.
 */
const ItemExpiryBadge = ({ item, style }) => {
  const status = String(item?.status || '').toLowerCase();
  if (!item || status !== 'scanned') return null;
  const expiryValue = getItemExpiryValue(item);
  if (!expiryValue) return null;

  return (
    <Text style={[styles.text, style]}>
      Expiry: {formatInventoryExpiryDisplay(expiryValue)}
    </Text>
  );
};

const styles = StyleSheet.create({
  text: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
    marginTop: 6,
  },
});

export default ItemExpiryBadge;
