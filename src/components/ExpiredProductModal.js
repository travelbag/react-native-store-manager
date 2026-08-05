import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  formatInventoryExpiryDisplay,
  isInventoryExpired,
  normalizeExpiryInput,
} from '../utils/inventoryExpiry';
import { updateInventoryExpiryDate } from '../services/InventoryService';

/**
 * Blocks picking an expired product until the picker chooses another item
 * or corrects the inventory expiry date.
 */
const ExpiredProductModal = ({
  visible,
  productName,
  expiryValue,
  inventoryId,
  onPickAnother,
  onExpiryUpdated,
}) => {
  const [mode, setMode] = useState('alert'); // alert | edit
  const [expiryInput, setExpiryInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setMode('alert');
    setExpiryInput(String(expiryValue || '').trim().slice(0, 10));
    setSaving(false);
    setError('');
  }, [visible, expiryValue]);

  const handleSaveExpiry = async () => {
    const normalized = normalizeExpiryInput(expiryInput) || String(expiryInput || '').trim();
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(normalized)) {
      setError('Enter expiry as YYYY-MM-DD or YYYY-MM');
      return;
    }
    if (isInventoryExpired(normalized)) {
      setError('That date is still expired. Enter a future (or today) expiry, or pick another product.');
      return;
    }
    if (!inventoryId) {
      setError('Cannot update: inventory record not found for this barcode. Pick another product or fix stock in admin.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await updateInventoryExpiryDate(inventoryId, normalized);
      onExpiryUpdated?.(normalized);
    } catch (e) {
      setError(e?.message || 'Failed to update expiry date');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onPickAnother}>
      <Pressable style={styles.backdrop} onPress={onPickAnother}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.iconWrap}>
            <Ionicons name="warning" size={28} color="#B45309" />
          </View>
          <Text style={styles.title}>Product expired</Text>
          <Text style={styles.body}>
            {productName ? `"${productName}"` : 'This product'} is marked expired
            {expiryValue ? ` (${formatInventoryExpiryDisplay(expiryValue)})` : ''}.
            {'\n\n'}
            Do not pick this unit. Scan another product, or update the expiry date if the label is not expired.
          </Text>

          {mode === 'edit' ? (
            <View style={styles.editBlock}>
              <Text style={styles.label}>New expiry date</Text>
              <TextInput
                style={styles.input}
                value={expiryInput}
                onChangeText={setExpiryInput}
                placeholder="YYYY-MM-DD or YYYY-MM"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.row}>
                <Pressable
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={() => {
                    setMode('alert');
                    setError('');
                  }}
                  disabled={saving}
                >
                  <Text style={styles.btnSecondaryText}>Back</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnPrimary, saving && styles.btnDisabled]}
                  onPress={handleSaveExpiry}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnPrimaryText}>Save & continue</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.row}>
              <Pressable style={[styles.btn, styles.btnSecondary]} onPress={onPickAnother}>
                <Text style={styles.btnSecondaryText}>Pick another</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnPrimary]}
                onPress={() => setMode('edit')}
              >
                <Text style={styles.btnPrimaryText}>Update expiry</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: '#374151',
    marginBottom: 16,
  },
  editBlock: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  error: {
    color: '#B91C1C',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  btnPrimary: {
    backgroundColor: '#B45309',
  },
  btnSecondary: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  btnSecondaryText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default ExpiredProductModal;
