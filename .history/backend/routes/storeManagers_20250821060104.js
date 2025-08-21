const express = require('express');
const router = express.Router();
const storeManagerService = require('../services/storeManagerService');
const { validate, schemas } = require('../validation');

// @route   POST /api/store-managers/register-token
// @desc    Register or update push notification token for store manager
// @access  Private (add auth middleware as needed)
router.post('/register-token', validate(schemas.registerToken), async (req, res) => {
  try {
    const result = await storeManagerService.registerToken(req.validatedData);
    
    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        tokenId: result.tokenId,
        storeManagerId: req.validatedData.storeManagerId,
        storeId: req.validatedData.storeId,
        registeredAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Register token error:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to register push token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/store-managers/:managerId/tokens
// @desc    Get all active tokens for a store manager
// @access  Private
router.get('/:managerId/tokens', async (req, res) => {
  try {
    const { managerId } = req.params;
    const tokens = await storeManagerService.getManagerTokens(managerId);
    
    res.json({
      success: true,
      data: tokens.map(token => ({
        id: token.id,
        devicePlatform: token.device_platform,
        deviceInfo: JSON.parse(token.device_info || '{}'),
        lastUsed: token.last_used,
        createdAt: token.created_at
      }))
    });
  } catch (error) {
    console.error('Get manager tokens error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve tokens'
    });
  }
});

// @route   GET /api/store-managers/store/:storeId
// @desc    Get all store managers for a store
// @access  Private
router.get('/store/:storeId', async (req, res) => {
  try {
    const { storeId } = req.params;
    const managers = await storeManagerService.getStoreManagers(storeId);
    
    res.json({
      success: true,
      data: managers.map(manager => ({
        id: manager.id,
        name: manager.name,
        email: manager.email,
        phone: manager.phone,
        isActive: manager.is_active,
        createdAt: manager.created_at
      }))
    });
  } catch (error) {
    console.error('Get store managers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve store managers'
    });
  }
});

// @route   DELETE /api/store-managers/tokens/:tokenId
// @desc    Deactivate a push token
// @access  Private
router.delete('/tokens/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    await storeManagerService.deactivateToken(tokenId);
    
    res.json({
      success: true,
      message: 'Token deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate token'
    });
  }
});

// @route   GET /api/store-managers/store/:storeId/tokens
// @desc    Get all active push tokens for a store
// @access  Private
router.get('/store/:storeId/tokens', async (req, res) => {
  try {
    const { storeId } = req.params;
    const tokens = await storeManagerService.getStoreTokens(storeId);
    
    res.json({
      success: true,
      data: tokens.map(token => ({
        id: token.id,
        storeManagerId: token.store_manager_id,
        managerName: token.manager_name,
        managerEmail: token.manager_email,
        pushToken: token.push_token,
        devicePlatform: token.device_platform,
        lastUsed: token.last_used,
        createdAt: token.created_at
      }))
    });
  } catch (error) {
    console.error('Get store tokens error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve store tokens'
    });
  }
});

module.exports = router;
