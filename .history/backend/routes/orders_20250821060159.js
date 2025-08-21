const express = require('express');
const router = express.Router();
const orderService = require('../services/orderService');
const storeManagerService = require('../services/storeManagerService');
const { validate, schemas } = require('../validation');

// @route   POST /api/orders
// @desc    Create a new order
// @access  Public (from customer app/website)
router.post('/', validate(schemas.createOrder), async (req, res) => {
  try {
    const order = await orderService.createOrder(req.validatedData);
    
    // Send push notification to store managers
    await sendOrderNotificationToStore(order.store_id, order);
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/orders/:orderId
// @desc    Get order by ID
// @access  Private
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await orderService.getOrderById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    res.json({
      success: true,
      data: formatOrderForApp(order)
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve order'
    });
  }
});

// @route   GET /api/orders/store/:storeId
// @desc    Get orders for a store
// @access  Private
router.get('/store/:storeId', async (req, res) => {
  try {
    const { storeId } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;
    
    const orders = await orderService.getStoreOrders(storeId, status, parseInt(limit), parseInt(offset));
    
    res.json({
      success: true,
      data: orders.map(formatOrderForApp),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: orders.length
      }
    });
  } catch (error) {
    console.error('Get store orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve orders'
    });
  }
});

// @route   PUT /api/orders/:orderId/status
// @desc    Update order status
// @access  Private
router.put('/:orderId/status', validate(schemas.updateOrderStatus), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.validatedData;
    
    const order = await orderService.updateOrderStatus(orderId, status);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: formatOrderForApp(order)
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
});

// @route   PUT /api/orders/items/:itemId/status
// @desc    Update item status
// @access  Private
router.put('/items/:itemId/status', validate(schemas.updateItemStatus), async (req, res) => {
  try {
    const { itemId } = req.params;
    const { status, pickedQuantity } = req.validatedData;
    
    await orderService.updateItemStatus(itemId, status, pickedQuantity);
    
    res.json({
      success: true,
      message: 'Item status updated successfully'
    });
  } catch (error) {
    console.error('Update item status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update item status'
    });
  }
});

// Helper function to send push notification to store managers
async function sendOrderNotificationToStore(storeId, order) {
  try {
    // Get all active push tokens for the store
    const tokens = await storeManagerService.getStoreTokens(storeId);
    
    if (tokens.length === 0) {
      console.log(`No active tokens found for store ${storeId}`);
      return;
    }

    console.log(`Sending order notification to ${tokens.length} store managers`);
    
    // In a real implementation, you would send actual push notifications here
    // using Expo's push notification service or Firebase Cloud Messaging
    
    // Example with Expo Push Notifications:
    /*
    const { Expo } = require('expo-server-sdk');
    const expo = new Expo();
    
    const messages = tokens.map(token => ({
      to: token.push_token,
      sound: 'default',
      title: 'New Grocery Order! 🛒',
      body: `Order #${order.order_number} - ${order.customer_name} - ${order.items.length} items - $${order.total_amount}`,
      data: {
        type: 'grocery_order',
        orderId: order.id,
        storeId: order.store_id,
        priority: 'high'
      },
      channelId: 'orders',
      priority: 'high'
    }));
    
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
    */
    
    // For now, just log the notification
    console.log('📱 Push notification sent:', {
      title: 'New Grocery Order! 🛒',
      body: `Order #${order.order_number} - ${order.customer_name} - ${order.items.length} items - $${order.total_amount}`,
      recipients: tokens.length
    });
    
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

// Helper function to format order for React Native app
function formatOrderForApp(order) {
  return {
    id: order.id,
    customerName: order.customer_name,
    items: order.items,
    total: parseFloat(order.total_amount).toFixed(2),
    status: order.status,
    timestamp: order.created_at,
    deliveryAddress: order.delivery_address,
    phoneNumber: order.customer_phone,
    estimatedTime: order.estimated_time,
    orderType: order.order_type,
    deliveryType: order.delivery_type,
    specialInstructions: order.special_instructions
  };
}

module.exports = router;
