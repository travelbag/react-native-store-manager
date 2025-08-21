const db = require('../database');
const { v4: uuidv4 } = require('uuid');

class OrderService {
  
  // Create a new order
  async createOrder(orderData) {
    const { 
      customerName, 
      customerEmail, 
      customerPhone, 
      storeId, 
      totalAmount, 
      orderType, 
      deliveryType, 
      deliveryAddress, 
      specialInstructions, 
      estimatedTime, 
      items 
    } = orderData;

    try {
      // Generate order number
      const orderNumber = this.generateOrderNumber();

      // Start transaction
      const queries = [
        {
          sql: `INSERT INTO orders 
                (order_number, customer_name, customer_email, customer_phone, store_id, 
                 total_amount, order_type, delivery_type, delivery_address, 
                 special_instructions, estimated_time) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            orderNumber, customerName, customerEmail, customerPhone, storeId,
            totalAmount, orderType, deliveryType, deliveryAddress,
            specialInstructions, estimatedTime
          ]
        }
      ];

      const [orderResult] = await db.transaction(queries);
      const orderId = orderResult.insertId;

      // Insert order items
      const itemQueries = items.map(item => ({
        sql: `INSERT INTO order_items 
              (id, order_id, product_name, product_category, price, quantity, 
               barcode, product_image, rack_location, rack_aisle, rack_description, rack_floor) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          uuidv4(), orderId, item.productName, item.productCategory, item.price, 
          item.quantity, item.barcode, item.productImage, item.rackLocation, 
          item.rackAisle, item.rackDescription, item.rackFloor
        ]
      }));

      await db.transaction(itemQueries);

      // Return complete order
      return await this.getOrderById(orderId);
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  // Get order by ID with items
  async getOrderById(orderId) {
    try {
      const orders = await db.query(
        'SELECT * FROM orders WHERE id = ?',
        [orderId]
      );

      if (orders.length === 0) {
        return null;
      }

      const order = orders[0];
      
      const items = await db.query(
        'SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at',
        [orderId]
      );

      return {
        ...order,
        items: items.map(item => ({
          id: item.id,
          name: item.product_name,
          category: item.product_category,
          price: parseFloat(item.price),
          quantity: item.quantity,
          barcode: item.barcode,
          image: item.product_image,
          rack: {
            location: item.rack_location,
            aisle: item.rack_aisle,
            description: item.rack_description,
            floor: item.rack_floor
          },
          status: item.status,
          pickedQuantity: item.picked_quantity,
          scannedAt: item.scanned_at
        }))
      };
    } catch (error) {
      console.error('Error getting order:', error);
      throw error;
    }
  }

  // Get orders for a store
  async getStoreOrders(storeId, status = null, limit = 50, offset = 0) {
    try {
      let sql = 'SELECT * FROM orders WHERE store_id = ?';
      const params = [storeId];

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const orders = await db.query(sql, params);

      // Get items for each order
      const ordersWithItems = await Promise.all(
        orders.map(async (order) => {
          const items = await db.query(
            'SELECT * FROM order_items WHERE order_id = ?',
            [order.id]
          );

          return {
            ...order,
            items: items.map(item => ({
              id: item.id,
              name: item.product_name,
              category: item.product_category,
              price: parseFloat(item.price),
              quantity: item.quantity,
              barcode: item.barcode,
              image: item.product_image,
              rack: {
                location: item.rack_location,
                aisle: item.rack_aisle,
                description: item.rack_description,
                floor: item.rack_floor
              },
              status: item.status,
              pickedQuantity: item.picked_quantity,
              scannedAt: item.scanned_at
            }))
          };
        })
      );

      return ordersWithItems;
    } catch (error) {
      console.error('Error getting store orders:', error);
      throw error;
    }
  }

  // Update order status
  async updateOrderStatus(orderId, status) {
    try {
      await db.query(
        'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, orderId]
      );

      return await this.getOrderById(orderId);
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }

  // Update item status
  async updateItemStatus(itemId, status, pickedQuantity = null) {
    try {
      let sql = 'UPDATE order_items SET status = ?, updated_at = CURRENT_TIMESTAMP';
      const params = [status];

      if (status === 'scanned') {
        sql += ', scanned_at = CURRENT_TIMESTAMP';
      }

      if (pickedQuantity !== null) {
        sql += ', picked_quantity = ?';
        params.push(pickedQuantity);
      }

      sql += ' WHERE id = ?';
      params.push(itemId);

      await db.query(sql, params);

      return { success: true };
    } catch (error) {
      console.error('Error updating item status:', error);
      throw error;
    }
  }

  // Generate order number
  generateOrderNumber() {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    
    return `ORD${year}${month}${day}${random}`;
  }
}

module.exports = new OrderService();
