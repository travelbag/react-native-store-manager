import { lookupInventoryByBarcode } from '../services/InventoryService';
import { getItemExpiryValue, isInventoryExpired } from './inventoryExpiry';

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

  return {
    isExpired: isInventoryExpired(expiryValue),
    expiryValue: expiryValue || null,
    inventoryId,
    inventory,
  };
}
