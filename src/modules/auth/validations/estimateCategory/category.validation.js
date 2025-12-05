// validations/category.validation.js
const { body, param, query } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');

const validate = (req, res, next) => {
  const errors = require('express-validator').validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// Category Validations
exports.validateCreateCategory = [
  body('name').isIn(['Interior', 'Landscaping']).withMessage('Invalid category name'),
  body('description').optional().isString().trim().isLength({ max: 500 }),
  validate,
];

exports.validateBulkCreate = [
  body('categories').isArray({ min: 1 }).withMessage('categories array is required'),
  body('categories.*.name')
    .isIn(['Interior', 'Landscaping'])
    .withMessage('Category name must be Interior or Landscaping'),
  body('categories.*.subcategories').optional().isArray(),
  body('categories.*.subcategories.*.label')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 3, max: 100 }),
  body('categories.*.subcategories.*.types').optional().isArray(),
  body('categories.*.subcategories.*.types.*.label')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 }),
  validate,
];

// Subcategory Validations
exports.validateCreateSubcategory = [
  param('categoryId').isMongoId().withMessage('Invalid category ID'),
  body('label').trim().isLength({ min: 3, max: 100 }).withMessage('Label required (3-100 chars)'),
  body('description').optional().isString().trim().isLength({ max: 500 }),
  body('order').optional().isInt({ min: 0 }),
  validate,
];

// Type Validations
exports.validateCreateType = [
  param('categoryId').isMongoId().withMessage('Invalid category ID'),
  param('subcategoryId').isMongoId().withMessage('Invalid subcategory ID'),
  body('label').trim().isLength({ min: 2, max: 100 }).withMessage('Label required (2-100 chars)'),
  body('description').optional().isString().trim().isLength({ max: 500 }),
  body('order').optional().isInt({ min: 0 }),
  validate,
];

// Query Validations
exports.validateQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('active').optional().isIn(['true', 'false']),
  query('populate').optional().isIn(['true', 'false']),
  validate,
];