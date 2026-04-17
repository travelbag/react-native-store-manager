import { apiClient } from './apiClient';

const ASSIGN_DRIVER_STATUS = 'assigned';

const extractAssignDriverMessage = (payload) =>
  payload?.message || payload?.error || payload?.details || null;

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

export const assignDriver = async (orderId, storeId, packageRack) => {
  const body = { orderId, storeId, status: ASSIGN_DRIVER_STATUS, rackNumber: packageRack };
  console.log('[ui->api] POST /orders/assign-driver-fromstore', {
    body,
  });
  const response = await apiClient.post('/orders/assign-driver-fromstore', {
    body,
  });
  const result = await readAssignDriverPayload(response);

  if (isAlreadyAssignedPayload(result)) {
    console.log('Driver already assigned for order:', result);
    return { ...(result || {}), alreadyAssigned: true };
  }

  if (!response.ok) {
    throw new Error(extractAssignDriverMessage(result) || 'No drivers available');
  }

  console.log('Driver assigned successfully for order:', result);
  return result;
};
