const { body, query, param } = require('express-validator');

exports.validateGetWarehouses = [
  query('vendor_id').isMongoId().withMessage('Vendor ID must be a valid ObjectId'),
  query('page').optional().isInt({ min: 1 }).toInt().withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1 }).toInt().withMessage('Limit must be a positive integer'),
  query('search').optional().isString().trim().withMessage('Search must be a string'),
  query('city').optional().isString().trim().withMessage('City must be a string'),
  query('state').optional().isString().trim().withMessage('State must be a string')
];

exports.validateCreateWarehouse = [
  body('name')
    .notEmpty()
    .trim()
    .withMessage('Warehouse name is required')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('code')
    .notEmpty()
    .trim()
    .withMessage('Warehouse code is required'),
  body('address').optional().trim().isString().withMessage('Address must be a string'),
  body('city').optional().trim().isString().withMessage('City must be a string'),
  body('state').optional().trim().isString().withMessage('State must be a string'),
  body('country').optional().trim().isString().withMessage('Country must be a string'),
  body('contact_person').optional().trim().isString().withMessage('Contact person must be a string'),
  body('phone').optional().trim().isString().withMessage('Phone must be a string'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('capacity_units').optional().isInt({ min: 0 }).withMessage('Capacity units must be a non-negative integer'),
  body('active').optional().isBoolean().withMessage('Active must be a boolean')
];

exports.validateUpdateWarehouse = [
  param('id').isMongoId().withMessage('Invalid warehouse ID'),
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Warehouse name cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('code')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Warehouse code cannot be empty'),
  body('address').optional().trim().isString().withMessage('Address must be a string'),
  body('city').optional().trim().isString().withMessage('City must be a string'),
  body('state').optional().trim().isString().withMessage('State must be a string'),
  body('country').optional().trim().isString().withMessage('Country must be a string'),
  body('contact_person').optional().trim().isString().withMessage('Contact person must be a string'),
  body('phone').optional().trim().isString().withMessage('Phone must be a string'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('capacity_units').optional().isInt({ min: 0 }).withMessage('Capacity units must be a non-negative integer'),
  body('active').optional().isBoolean().withMessage('Active must be a boolean')
];

exports.validateDeleteWarehouse = [
  param('id').isMongoId().withMessage('Invalid warehouse ID')
];