const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Sample data - in production, use a real database
const storeManagers = [
  {
    id: 'SM_001',
    username: 'admin',
    password: 'admin123', // In production, use hashed passwords
    name: 'John Manager',
    storeId: 'STORE_001',
    storeName: 'Downtown Grocery',
    role: 'manager'
  }
];

const orders = [
  {
    id: 'ORDER_001',
    customerName: 'Alice Johnson',
    storeId: 'STORE_001',
    status: 'pending',
    total: '45.67',
    timestamp: new Date().toISOString(),
    items: [
      {
        id: 'item_001',
        name: 'Organic Bananas',
        price: 2.99,
        quantity: 2,
        barcode: '123456789012',
        image: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=300',
        category: 'Fruits',
        status: 'pending'
      }
    ]
  }
];

// Store manager routes
app.post('/api/store-managers/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    const manager = storeManagers.find(m => m.username === username && m.password === password);
    
    if (manager) {
      const token = jwt.sign(
        { id: manager.id, username: manager.username },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.json({
        success: true,
        token,
        manager: {
          id: manager.id,
          name: manager.name,
          username: manager.username,
          storeId: manager.storeId,
          storeName: manager.storeName,
          role: manager.role
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Register push token
app.post('/api/store-managers/register-token', (req, res) => {
  try {
    const { storeManagerId, storeId, pushToken, deviceInfo } = req.body;
    
    // In production, save to database
    console.log('Push token registered:', { storeManagerId, storeId, pushToken });
    
    res.json({
      success: true,
      message: 'Push token registered successfully'
    });
  } catch (error) {
    console.error('Token registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register token'
    });
  }
});

// Get orders for a store
app.get('/api/orders', (req, res) => {
  try {
    const { storeId, limit = 50 } = req.query;
    
    const storeOrders = orders.filter(order => order.storeId === storeId);
    const limitedOrders = storeOrders.slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: limitedOrders,
      total: storeOrders.length
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
});

// Get pending orders for polling
app.get('/api/orders/pending', (req, res) => {
  try {
    const { storeId } = req.query;
    
    const pendingOrders = orders.filter(order => 
      order.storeId === storeId && order.status === 'pending'
    );
    
    res.json({
      success: true,
      data: pendingOrders,
      total: pendingOrders.length
    });
  } catch (error) {
    console.error('Get pending orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending orders'
    });
  }
});

// Update order status
app.put('/api/orders/:orderId/status', (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, storeManagerId, timestamp } = req.body;
    
    const orderIndex = orders.findIndex(order => order.id === orderId);
    
    if (orderIndex !== -1) {
      orders[orderIndex].status = status;
      orders[orderIndex].updatedAt = timestamp;
      orders[orderIndex].updatedBy = storeManagerId;
      
      res.json({
        success: true,
        message: 'Order status updated successfully',
        order: orders[orderIndex]
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
});

// Get specific order details
app.get('/api/orders/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = orders.find(order => order.id === orderId);
    
    if (order) {
      res.json({
        success: true,
        data: order
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details'
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'Store Manager API is running'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Store Manager API server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔐 Demo login: admin / admin123`);
});

module.exports = app;
