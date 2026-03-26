import { apiClient } from './apiClient';

export const assignDriver = async (orderId, storeId) => {
  try {
    console.log('Assigning driver for order:', orderId, 'at store:', storeId);
    const response = await apiClient.post('/orders/assign-driver-fromstore', {
      body: { orderId, storeId },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error('No drivers available');
    }
   
    const result = await response.json();
console.log('Driver assigned successfully for order:', result);
return result;
  } catch (error) {
    console.log('Error assigning driver:', error);
    throw error;
  }
};
