import { apiClient } from './apiClient';

const ASSIGN_DRIVER_STATUS = 'assigned';
const BATCH_ASSIGN_ERROR_MESSAGES = {
  BATCH_ASSIGNMENT_CONFLICT: 'Availability changed, retry',
  DRIVER_HAS_ACTIVE_ORDERS: 'Some drivers still have active orders',
  DRIVER_AT_CAPACITY: 'Driver at max active limit',
};

const extractAssignDriverMessage = (payload) =>
  payload?.message || payload?.error || payload?.details || null;

const extractAssignDriverCode = (payload) =>
  payload?.code ||
  payload?.errorCode ||
  payload?.error_code ||
  payload?.errors?.[0]?.code ||
  payload?.details?.code ||
  null;

const normalizeIdList = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
};

const normalizeAssignments = (payload) => {
  const raw =
    payload?.assignments ||
    payload?.assignmentMap ||
    payload?.assignment_map ||
    payload?.data?.assignments ||
    payload?.data?.assignmentMap ||
    {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .map(([driverId, orderIds]) => [String(driverId ?? '').trim(), normalizeIdList(orderIds)])
      .filter(([driverId, orderIds]) => driverId && orderIds.length)
  );
};

const hasAssignedDriverPayload = (payload) =>
  Boolean(
    payload?.driverId ||
    payload?.driver_id ||
    payload?.order?.driverId ||
    payload?.order?.driver_id ||
    payload?.data?.driverId ||
    payload?.data?.driver_id
  );

const isAlreadyAssignedPayload = (payload) =>
  payload?.code === 'ALREADY_ASSIGNED' || hasAssignedDriverPayload(payload);

const readAssignDriverPayload = async (response) => {
  try {
    return await response.json();
  } catch {
    try {
      const text = await response.text();
      return text ? { message: text } : null;
    } catch {
      return null;
    }
  }
};

export const getBatchAssignmentSummary = (payload) => {
  const assignments = normalizeAssignments(payload);
  const assignmentOrderIds = Object.values(assignments).flat();
  const assignedCountRaw =
    payload?.assignedCount ??
    payload?.assigned_count ??
    payload?.data?.assignedCount ??
    payload?.data?.assigned_count;
  const unassignedOrderIds = normalizeIdList(
    payload?.unassignedOrderIds ??
      payload?.unassigned_order_ids ??
      payload?.data?.unassignedOrderIds ??
      payload?.data?.unassigned_order_ids
  );
  const unassignedCountRaw =
    payload?.unassignedCount ??
    payload?.unassigned_count ??
    payload?.data?.unassignedCount ??
    payload?.data?.unassigned_count;
  const batchCountRaw =
    payload?.batchCount ??
    payload?.batch_count ??
    payload?.batchesCount ??
    payload?.batches_count ??
    payload?.data?.batchCount ??
    payload?.data?.batch_count;
  const assignedCount =
    Number.isFinite(Number(assignedCountRaw))
      ? Number(assignedCountRaw)
      : assignmentOrderIds.length || (hasAssignedDriverPayload(payload) ? 1 : 0);
  const unassignedCount =
    Number.isFinite(Number(unassignedCountRaw))
      ? Number(unassignedCountRaw)
      : unassignedOrderIds.length;
  const batchCount =
    Number.isFinite(Number(batchCountRaw))
      ? Number(batchCountRaw)
      : Object.keys(assignments).length;
  return {
    assignedCount,
    unassignedCount,
    batchCount,
    assignments,
    assignedOrderIds: assignmentOrderIds,
    unassignedOrderIds,
  };
};

export const wasOrderAssigned = (payload, orderId) => {
  const targetOrderId = String(orderId ?? '').trim();
  if (!targetOrderId) return false;
  if (payload?.alreadyAssigned) return true;
  const nestedOrderId = String(payload?.order?.orderId ?? payload?.order?.id ?? '').trim();
  if (nestedOrderId && nestedOrderId === targetOrderId) return true;
  const summary = getBatchAssignmentSummary(payload);
  return summary.assignedOrderIds.includes(targetOrderId);
};

export const buildBatchAssignmentSummaryMessage = (payload) => {
  const summary = getBatchAssignmentSummary(payload);
  const headline = `Assigned ${summary.assignedCount} orders in ${summary.batchCount} batches, ${summary.unassignedCount} pending`;
  const details = [];
  const assignmentLines = Object.entries(summary.assignments).map(
    ([driverId, orderIds]) => `${driverId} -> ${orderIds.join(', ')}`
  );
  if (assignmentLines.length) {
    details.push(`Assignments\n${assignmentLines.join('\n')}`);
  }
  if (summary.unassignedOrderIds.length) {
    details.push(`Pending\n${summary.unassignedOrderIds.join(', ')}`);
  }
  return {
    ...summary,
    headline,
    message: details.length ? `${headline}\n\n${details.join('\n\n')}` : headline,
  };
};

export const getAssignDriverErrorMessage = (error) => {
  const code = error?.code || error?.payload?.code || null;
  if (code && BATCH_ASSIGN_ERROR_MESSAGES[code]) {
    return BATCH_ASSIGN_ERROR_MESSAGES[code];
  }
  return error?.message || 'No drivers available';
};

export const assignDriver = async (orderId, storeId, packageRack, options = {}) => {
  // Backend POST /api/orders/assign-driver-batch-fromstore reads `packageRack` and writes orders.rack_number.
  const orderIds = normalizeIdList(options?.orderIds);
  const body = {
    storeId,
    status: ASSIGN_DRIVER_STATUS,
    packageRack: packageRack != null ? String(packageRack).trim() : '',
    ...(orderIds.length ? { orderIds } : { orderId }),
  };
  console.log('[ui->api] POST /orders/assign-driver-batch-fromstore', {
    body,
  });
  const response = await apiClient.post('/orders/assign-driver-batch-fromstore', {
    body,
  });
  const result = await readAssignDriverPayload(response);

  if (isAlreadyAssignedPayload(result)) {
    console.log('Driver already assigned for order:', result);
    return { ...(result || {}), alreadyAssigned: true };
  }

  if (!response.ok) {
    const error = new Error(
      BATCH_ASSIGN_ERROR_MESSAGES[extractAssignDriverCode(result)] ||
        extractAssignDriverMessage(result) ||
        'No drivers available'
    );
    error.code = extractAssignDriverCode(result);
    error.payload = result;
    error.status = response.status;
    throw error;
  }

  console.log('Driver batch assignment succeeded:', result);
  return result;
};
