/**
 * Resolve product weight from order-item payloads (orders.ordered_items JSON, etc.).
 * Empty strings are treated as missing so alternate keys can win.
 * When the API omits weight, fall back to pack size embedded in the product name
 * (e.g. "Fortune besan 500g", "Corn Flakes 650G", "oil1L - 870 g").
 */

const WEIGHT_IN_NAME_RE =
  /(\d+(?:\.\d+)?)\s*(kg|g|gm|ml|l|ltr|litre|liter)\b/gi;

function normalizeWeightMatch(amount, unit) {
  const a = String(amount || '').trim();
  let u = String(unit || '').trim().toLowerCase();
  if (!a || !u) return '';
  if (u === 'gm') u = 'g';
  if (u === 'ltr' || u === 'litre' || u === 'liter') u = 'L';
  if (u === 'l') u = 'L';
  if (u === 'g' || u === 'kg' || u === 'ml') {
    return `${a}${u}`;
  }
  return `${a}${u}`;
}

function weightFromProductName(name) {
  const text = String(name || '');
  if (!text.trim()) return '';
  const matches = [...text.matchAll(WEIGHT_IN_NAME_RE)];
  if (!matches.length) return '';
  // Prefer the last pack-size style match (often the clearest, e.g. "... oil1L - 870 g").
  const last = matches[matches.length - 1];
  return normalizeWeightMatch(last[1], last[2]);
}

export function resolveItemWeight(item) {
  if (!item || typeof item !== 'object') return '';

  const candidates = [
    item.weight,
    item.selectedWeight,
    item.selected_weight,
    item.productWeight,
    item.product_weight,
    item.itemWeight,
    item.item_weight,
    item.netWeight,
    item.net_weight,
    item.packSize,
    item.pack_size,
    item.packageSize,
    item.package_size,
    item.size,
    item.variant,
    item.variantName,
    item.variant_name,
    item.unit,
    item.quantityUnit,
    item.quantity_unit,
    item.Weight,
    item?.product?.weight,
    item?.product?.selectedWeight,
    item?.product?.selected_weight,
    item?.meta?.weight,
    item?.details?.weight,
  ];

  for (const value of candidates) {
    if (value == null) continue;
    if (typeof value === 'object') {
      const nested =
        value.label ?? value.name ?? value.value ?? value.weight ?? value.size ?? '';
      const text = String(nested ?? '').trim();
      if (text) return text;
      continue;
    }
    const text = String(value).trim();
    if (text && text.toLowerCase() !== 'null' && text.toLowerCase() !== 'undefined') {
      return text;
    }
  }

  const unit = String(item.weight_class ?? item.weightClass ?? item.weight_unit ?? '').trim();
  const numeric = item.weight_value ?? item.weightValue;
  if (numeric != null && String(numeric).trim() !== '') {
    return unit ? `${String(numeric).trim()} ${unit}` : String(numeric).trim();
  }

  return weightFromProductName(
    item.productName ?? item.item_name ?? item.name ?? item.product_name ?? ''
  );
}

export function formatItemWeightLabel(item, fallback = '—') {
  return resolveItemWeight(item) || fallback;
}
