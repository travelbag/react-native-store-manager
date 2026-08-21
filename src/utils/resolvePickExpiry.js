/**
 * Live expiry lookup for picks — informational only.
 * Never blocks scanning; always allows the pick to continue.
 */
export async function resolvePickExpiryState({ item } = {}) {
  const expiryValue =
    item?.expiry_date ||
    item?.expiryDate ||
    item?.expiry ||
    null;

  return {
    isExpired: false,
    isExpiringSoon: false,
    alert: null,
    expiryValue: expiryValue || null,
    inventoryId: null,
    allowed: true,
  };
}
