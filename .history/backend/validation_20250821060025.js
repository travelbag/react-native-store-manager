const Joi = require('joi');

const schemas = {
  // Store Manager Token Registration
  registerToken: Joi.object({
    storeManagerId: Joi.string().min(3).max(50).required(),
    storeId: Joi.string().min(3).max(50).required(),
    pushToken: Joi.string().min(10).required(),
    deviceInfo: Joi.object({
      platform: Joi.string().valid('ios', 'android', 'web').required(),
      timestamp: Joi.string().isoDate().optional(),
      deviceModel: Joi.string().optional(),
      appVersion: Joi.string().optional(),
    }).required()
  }),

  // Order Creation
  createOrder: Joi.object({
    customerName: Joi.string().min(2).max(255).required(),
    customerEmail: Joi.string().email().optional(),
    customerPhone: Joi.string().min(10).max(20).optional(),
    storeId: Joi.string().min(3).max(50).required(),
    totalAmount: Joi.number().positive().precision(2).required(),
    orderType: Joi.string().valid('grocery', 'pickup', 'delivery').default('grocery'),
    deliveryType: Joi.string().valid('home_delivery', 'pickup', 'curbside').default('home_delivery'),
    deliveryAddress: Joi.string().max(500).optional(),
    specialInstructions: Joi.string().max(1000).optional(),
    estimatedTime: Joi.number().integer().min(5).max(120).optional(),
    items: Joi.array().items(
      Joi.object({
        productName: Joi.string().min(1).max(255).required(),
        productCategory: Joi.string().max(100).optional(),
        price: Joi.number().positive().precision(2).required(),
        quantity: Joi.number().integer().positive().required(),
        barcode: Joi.string().max(255).optional(),
        productImage: Joi.string().uri().optional(),
        rackLocation: Joi.string().max(50).optional(),
        rackAisle: Joi.string().max(100).optional(),
        rackDescription: Joi.string().max(255).optional(),
        rackFloor: Joi.string().max(50).optional(),
      })
    ).min(1).required()
  }),

  // Order Status Update
  updateOrderStatus: Joi.object({
    status: Joi.string().valid('pending', 'accepted', 'picking', 'preparing', 'ready', 'completed', 'rejected').required()
  }),

  // Item Status Update
  updateItemStatus: Joi.object({
    status: Joi.string().valid('pending', 'located', 'scanned', 'unavailable').required(),
    pickedQuantity: Joi.number().integer().min(0).optional()
  })
};

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    
    req.validatedData = value;
    next();
  };
};

module.exports = {
  schemas,
  validate
};
