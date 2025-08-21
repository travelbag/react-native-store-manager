# Backend Integration Guide

## 📡 Push Notification Integration

### 1. Store Manager Token Registration

**Endpoint:** `POST /api/store-managers/register-token`

**Request Body:**
```json
{
  "storeManagerId": "SM_001",
  "storeId": "STORE_001", 
  "pushToken": "ExponentPushToken[xxxxx]",
  "deviceInfo": {
    "platform": "ios|android",
    "timestamp": "2025-08-21T10:30:00Z"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token registered successfully",
  "tokenId": "token_12345"
}
```

### 2. Send Order Notification to Store Manager

When a customer submits an order, your backend should:

#### Step 1: Send Push Notification
```javascript
// Example using Expo Push API
const message = {
  to: "ExponentPushToken[xxxxx]", // Store manager's token
  sound: 'default',
  title: 'New Grocery Order! 🛒',
  body: `Order #${order.id} - ${order.customerName} - ${order.items.length} items - $${order.total}`,
  data: {
    type: 'grocery_order',
    orderId: order.id,
    storeId: order.storeId,
    priority: 'high',
    timestamp: new Date().toISOString()
  },
  channelId: 'orders', // Android channel
  priority: 'high',
  badge: 1
};

await expo.sendPushNotificationAsync(message);
```

#### Step 2: Provide Order Details API
**Endpoint:** `GET /api/orders/{orderId}`

**Response:**
```json
{
  "id": 1234,
  "customerName": "John Doe",
  "items": [
    {
      "id": "1234_item_001",
      "name": "Organic Bananas",
      "price": 2.99,
      "quantity": 2,
      "barcode": "123456789012",
      "image": "https://...",
      "category": "Fruits",
      "rack": {
        "location": "A1-B2",
        "aisle": "Produce Section",
        "description": "Fresh Fruits - Left side near entrance",
        "floor": "Ground Floor"
      },
      "status": "pending"
    }
  ],
  "total": "25.99",
  "status": "pending",
  "timestamp": "2025-08-21T10:30:00Z",
  "deliveryAddress": "123 Main St, City, State",
  "phoneNumber": "+1 (555) 123-4567",
  "estimatedTime": 30,
  "orderType": "grocery",
  "deliveryType": "home_delivery",
  "specialInstructions": "Please check expiry dates"
}
```

## 🔧 Configuration Steps

### 1. Update API Configuration
Edit `/src/config/api.js`:
```javascript
export const API_CONFIG = {
  BASE_URL: 'https://your-actual-domain.com/api',
  STORE_MANAGER_ID: 'YOUR_ACTUAL_STORE_MANAGER_ID',
  STORE_ID: 'YOUR_ACTUAL_STORE_ID',
  DEMO_MODE: false, // Set to false for production
};
```

### 2. Add Authentication
Implement your authentication logic in `getAuthHeaders()` function.

### 3. Test Flow
1. App registers push token with backend ✅
2. Customer submits order on website/app 📱
3. Backend sends push notification to store manager 🔔
4. Store manager app receives notification 📲
5. App fetches full order details from API 📦
6. Store manager can start picking process 🛒

## 🛡️ Security Considerations

1. **Authentication**: Always verify store manager identity
2. **Token Security**: Store push tokens securely
3. **Rate Limiting**: Prevent notification spam
4. **Data Validation**: Validate all order data
5. **HTTPS**: Use secure connections only

## 📱 Notification Best Practices

1. **Timing**: Send immediately when order is placed
2. **Content**: Include order summary and customer name
3. **Sound**: Use distinct sound for grocery orders
4. **Badge**: Update app badge count
5. **Priority**: Set high priority for immediate delivery
6. **Fallback**: Have SMS/email backup if push fails
