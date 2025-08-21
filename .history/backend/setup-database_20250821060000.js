const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 3306,
  multipleStatements: true
};

async function setupDatabase() {
  let connection;
  
  try {
    console.log('🔄 Connecting to MySQL...');
    connection = await mysql.createConnection(dbConfig);
    
    console.log('📊 Creating database and tables...');
    
    const setupSQL = `
      -- Create database if not exists
      CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'store_manager_db'};
      USE ${process.env.DB_NAME || 'store_manager_db'};

      -- Store Managers table
      CREATE TABLE IF NOT EXISTS store_managers (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        store_id VARCHAR(50) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_store_id (store_id),
        INDEX idx_email (email)
      );

      -- Stores table
      CREATE TABLE IF NOT EXISTS stores (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(50),
        zip_code VARCHAR(20),
        phone VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      -- Push Tokens table
      CREATE TABLE IF NOT EXISTS push_tokens (
        id VARCHAR(36) PRIMARY KEY,
        store_manager_id VARCHAR(50) NOT NULL,
        store_id VARCHAR(50) NOT NULL,
        push_token TEXT NOT NULL,
        device_platform ENUM('ios', 'android', 'web') NOT NULL,
        device_info JSON,
        is_active BOOLEAN DEFAULT TRUE,
        last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (store_manager_id) REFERENCES store_managers(id) ON DELETE CASCADE,
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
        INDEX idx_store_manager (store_manager_id),
        INDEX idx_store (store_id),
        INDEX idx_token (push_token(255)),
        UNIQUE KEY unique_manager_token (store_manager_id, push_token(255))
      );

      -- Orders table
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255),
        customer_phone VARCHAR(50),
        store_id VARCHAR(50) NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        status ENUM('pending', 'accepted', 'picking', 'preparing', 'ready', 'completed', 'rejected') DEFAULT 'pending',
        order_type ENUM('grocery', 'pickup', 'delivery') DEFAULT 'grocery',
        delivery_type ENUM('home_delivery', 'pickup', 'curbside') DEFAULT 'home_delivery',
        delivery_address TEXT,
        special_instructions TEXT,
        estimated_time INT, -- in minutes
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (store_id) REFERENCES stores(id),
        INDEX idx_store_order (store_id),
        INDEX idx_status (status),
        INDEX idx_created (created_at)
      );

      -- Order Items table
      CREATE TABLE IF NOT EXISTS order_items (
        id VARCHAR(36) PRIMARY KEY,
        order_id INT NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        product_category VARCHAR(100),
        price DECIMAL(8, 2) NOT NULL,
        quantity INT NOT NULL,
        barcode VARCHAR(255),
        product_image TEXT,
        rack_location VARCHAR(50),
        rack_aisle VARCHAR(100),
        rack_description TEXT,
        rack_floor VARCHAR(50),
        status ENUM('pending', 'located', 'scanned', 'unavailable') DEFAULT 'pending',
        picked_quantity INT DEFAULT 0,
        scanned_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        INDEX idx_order (order_id),
        INDEX idx_barcode (barcode),
        INDEX idx_status (status)
      );

      -- Insert sample data
      INSERT IGNORE INTO stores (id, name, address, city, state, zip_code, phone) VALUES
      ('STORE_001', 'Downtown Grocery', '123 Main St', 'Springfield', 'IL', '62701', '+1-555-0101'),
      ('STORE_002', 'Westside Market', '456 Oak Ave', 'Springfield', 'IL', '62702', '+1-555-0102');

      INSERT IGNORE INTO store_managers (id, name, email, phone, store_id) VALUES
      ('SM_001', 'John Manager', 'john.manager@store.com', '+1-555-1001', 'STORE_001'),
      ('SM_002', 'Sarah Admin', 'sarah.admin@store.com', '+1-555-1002', 'STORE_001'),
      ('SM_003', 'Mike Supervisor', 'mike.supervisor@store.com', '+1-555-1003', 'STORE_002');
    `;

    await connection.execute(setupSQL);
    
    console.log('✅ Database setup completed successfully!');
    console.log('📊 Tables created:');
    console.log('   - stores');
    console.log('   - store_managers');
    console.log('   - push_tokens');
    console.log('   - orders');
    console.log('   - order_items');
    console.log('🎯 Sample data inserted');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase;
