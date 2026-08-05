import { lookupInventoryByBarcode } from '../services/InventoryService';
import {
  getInventoryExpiryAlert,
  getItemExpiryValue,
  isInventoryExpired,
} from './inventoryExpiry';

/**
 * Resolve live inventory expiry for a pick scan.
 * Prefers store inventory lookup; falls back to values already on the order line.
 */
export async function resolvePickExpiryState({ storeId, barcode, item }) {
  const bc = String(barcode || item?.barcode || '').trim();
  let inventory = null;

  try {
    if (storeId && bc) {
      inventory = await lookupInventoryByBarcode(storeId, bc);
    }
  } catch (error) {
    console.warn('⚠️ Inventory expiry lookup failed:', error?.message || error);
  }

  if (__DEV__) {
    console.log('[expiry-check]', {
      storeId,
      barcode: bc,
      inventoryExpiry: inventory?.expiry_date ?? inventory?.expiryDate ?? null,
      itemExpiry: getItemExpiryValue(item) || null,
    });
  }

  const expiryValue =
    inventory?.expiry_date ||
    inventory?.expiryDate ||
    getItemExpiryValue(item) ||
    '';

  const inventoryId =
    inventory?.id ??
    item?.inventory_id ??
    item?.inventoryId ??
    null;

  const alert = getInventoryExpiryAlert(expiryValue);

  return {
    isExpired: isInventoryExpired(expiryValue) || alert?.status === 'expired',
    isExpiringSoon: alert?.status === 'expiring_soon',
    alert,
    expiryValue: expiryValue || null,
    inventoryId,
    inventory,
  };
}
