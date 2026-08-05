import { apiClient } from './apiClient';

const readJson = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

/**
 * Live inventory row for a store barcode (includes expiry_date + id).
 */
export const lookupInventoryByBarcode = async (storeId, barcode) => {
  const sid = String(storeId ?? '').trim();
  const bc = String(barcode ?? '').trim();
  if (!sid || !bc) return null;

  const endpoint = `/inventory/lookup?store_id=${encodeURIComponent(sid)}&barcode=${encodeURIComponent(bc)}`;
  const response = await apiClient.get(endpoint);
  const payload = await readJson(response);

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(payload?.message || 'Inventory lookup failed');
  }

  return payload?.data ?? payload ?? null;
};

/**
 * Update expiry_date on an inventory row (YYYY-MM-DD or YYYY-MM).
 */
export const updateInventoryExpiryDate = async (inventoryId, expiryDate) => {
  const id = String(inventoryId ?? '').trim();
  const expiry = String(expiryDate ?? '').trim();
  if (!id) throw new Error('Inventory id is required');
  if (!expiry) throw new Error('Expiry date is required');

  const response = await apiClient.patch(`/inventory/${encodeURIComponent(id)}`, {
    body: { expiry_date: expiry },
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to update expiry date');
  }

  return payload?.data ?? payload ?? null;
};
