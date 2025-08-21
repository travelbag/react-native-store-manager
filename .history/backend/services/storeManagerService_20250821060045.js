const db = require('../database');
const { v4: uuidv4 } = require('uuid');

class StoreManagerService {
  
  // Register or update push token for store manager
  async registerToken(data) {
    const { storeManagerId, storeId, pushToken, deviceInfo } = data;
    
    try {
      // Check if store manager exists
      const manager = await this.getStoreManager(storeManagerId);
      if (!manager) {
        throw new Error(`Store manager with ID ${storeManagerId} not found`);
      }

      // Check if store exists
      const store = await this.getStore(storeId);
      if (!store) {
        throw new Error(`Store with ID ${storeId} not found`);
      }

      // Check if token already exists for this manager
      const existingToken = await db.query(
        'SELECT id FROM push_tokens WHERE store_manager_id = ? AND push_token = ?',
        [storeManagerId, pushToken]
      );

      if (existingToken.length > 0) {
        // Update existing token
        await db.query(
          `UPDATE push_tokens 
           SET last_used = CURRENT_TIMESTAMP, 
               device_info = ?, 
               is_active = TRUE,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [JSON.stringify(deviceInfo), existingToken[0].id]
        );

        return {
          success: true,
          message: 'Push token updated successfully',
          tokenId: existingToken[0].id
        };
      } else {
        // Deactivate old tokens for this manager
        await db.query(
          'UPDATE push_tokens SET is_active = FALSE WHERE store_manager_id = ?',
          [storeManagerId]
        );

        // Insert new token
        const tokenId = uuidv4();
        await db.query(
          `INSERT INTO push_tokens 
           (id, store_manager_id, store_id, push_token, device_platform, device_info, is_active) 
           VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
          [
            tokenId,
            storeManagerId,
            storeId,
            pushToken,
            deviceInfo.platform,
            JSON.stringify(deviceInfo)
          ]
        );

        return {
          success: true,
          message: 'Push token registered successfully',
          tokenId: tokenId
        };
      }
    } catch (error) {
      console.error('Error registering token:', error);
      throw error;
    }
  }

  // Get store manager by ID
  async getStoreManager(storeManagerId) {
    const managers = await db.query(
      'SELECT * FROM store_managers WHERE id = ? AND is_active = TRUE',
      [storeManagerId]
    );
    return managers[0] || null;
  }

  // Get store by ID
  async getStore(storeId) {
    const stores = await db.query(
      'SELECT * FROM stores WHERE id = ? AND is_active = TRUE',
      [storeId]
    );
    return stores[0] || null;
  }

  // Get all active push tokens for a store
  async getStoreTokens(storeId) {
    return await db.query(
      `SELECT pt.*, sm.name as manager_name, sm.email as manager_email
       FROM push_tokens pt
       JOIN store_managers sm ON pt.store_manager_id = sm.id
       WHERE pt.store_id = ? AND pt.is_active = TRUE AND sm.is_active = TRUE`,
      [storeId]
    );
  }

  // Get push tokens for a specific manager
  async getManagerTokens(storeManagerId) {
    return await db.query(
      'SELECT * FROM push_tokens WHERE store_manager_id = ? AND is_active = TRUE',
      [storeManagerId]
    );
  }

  // Deactivate token
  async deactivateToken(tokenId) {
    await db.query(
      'UPDATE push_tokens SET is_active = FALSE WHERE id = ?',
      [tokenId]
    );
  }

  // Get store managers for a store
  async getStoreManagers(storeId) {
    return await db.query(
      'SELECT * FROM store_managers WHERE store_id = ? AND is_active = TRUE',
      [storeId]
    );
  }

  // Update last used timestamp for token
  async updateTokenLastUsed(pushToken) {
    await db.query(
      'UPDATE push_tokens SET last_used = CURRENT_TIMESTAMP WHERE push_token = ?',
      [pushToken]
    );
  }
}

module.exports = new StoreManagerService();
