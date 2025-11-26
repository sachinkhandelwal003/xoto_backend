const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const mongoose = require('mongoose');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      statusCode: StatusCodes.BAD_REQUEST,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

const isValidObjectId = (value, fieldName) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`${fieldName} must be a valid MongoDB ObjectId`);
  }
  return true;
};

// Cart Validations
exports.validateCreateOrUpdateCart = [
  body('product_id')
    .trim()
    .custom(value => isValidObjectId(value, 'Product ID')),
  body('product_type')
    .trim()
    .isIn(['ProductB2C', 'ProductB2B'])
    .withMessage('Product type must be ProductB2C or ProductB2B'),
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1')
    .toInt(),
  validate
];

exports.validateRemoveCartItem = [
  param('product_id')
    .trim()
    .custom(value => isValidObjectId(value, 'Product ID')),
  param('product_type')
    .trim()
    .isIn(['ProductB2C', 'ProductB2B'])
    .withMessage('Product type must be ProductB2C or ProductB2B'),
  validate
];

exports.validateApplyCoupon = [
  body('coupon_code')
    .trim()
    .notEmpty()
    .withMessage('Coupon code is required')
    .isString()
    .withMessage('Coupon code must be a string'),
  validate
];

// Order Validations
exports.validateCreateOrder = [
  body('shipping_address')
    .notEmpty()
    .withMessage('Shipping address is required')
    .isObject()
    .withMessage('Shipping address must be an object'),
  body('shipping_address.street')
    .trim()
    .notEmpty()
    .withMessage('Street is required')
    .isString()
    .withMessage('Street must be a string'),
  body('shipping_address.city')
    .trim()
    .notEmpty()
    .withMessage('City is required')
    .isString()
    .withMessage('City must be a string'),
  body('shipping_address.state')
    .trim()
    .notEmpty()
    .withMessage('State is required')
    .isString()
    .withMessage('State must be a string'),
  body('shipping_address.country')
    .trim()
    .notEmpty()
    .withMessage('Country is required')
    .isString()
    .withMessage('Country must be a string'),
  body('shipping_address.postal_code')
    .trim()
    .notEmpty()
    .withMessage('Postal code is required')
    .matches(/^\d{5,6}$/)
    .withMessage('Postal code must be 5 or 6 digits'),
  body('payment_method')
    .trim()
    .isIn(['credit_card', 'debit_card', 'net_banking', 'upi', 'cod'])
    .withMessage('Invalid payment method'),
  validate
];

exports.validateCancelOrder = [
  param('id')
    .trim()
    .custom(value => isValidObjectId(value, 'Order ID')),
  body('password')
    .trim()
    .notEmpty()
    .withMessage('Password is required for cancellation')
    .isString()
    .withMessage('Password must be a string'),
  validate
];

exports.validateGetAllOrders = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('status')
    .optional()
    .isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'])
    .withMessage('Invalid status filter'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date')
    .toDate(),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
    .toDate(),
  validate
];

exports.validateOrderId = [
  param('id')
    .trim()
    .custom(value => isValidObjectId(value, 'Order ID')),
  validate
];

// Wishlist Validations
exports.validateAddToWishlist = [
  body('product_id')
    .trim()
    .custom(value => isValidObjectId(value, 'Product ID')),
  body('product_type')
    .trim()
    .isIn(['ProductB2C', 'ProductB2B'])
    .withMessage('Product type must be ProductB2C or ProductB2B'),
  validate
];

exports.validateRemoveFromWishlist = [
  param('product_id')
    .trim()
    .custom(value => isValidObjectId(value, 'Product ID')),
  param('product_type')
    .trim()
    .isIn(['ProductB2C', 'ProductB2B'])
    .withMessage('Product type must be ProductB2C or ProductB2B'),
  validate
];