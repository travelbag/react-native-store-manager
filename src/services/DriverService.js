import { API_CONFIG, buildApiUrl } from '../config/api';

export const assignDriver = async (orderId, storeId) => {
  try {
    console.log('Assigning driver for order:', orderId, 'at store:', storeId);
    // Use the correct backend endpoint as per your Express route
    const url = buildApiUrl('/orders/assign-driver-fromstore');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId, storeId }),
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
