// validations/category.validation.js
const { body, param, query } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { Type } = require('../../models/estimateCategory/category.model');
const mongoose = require('mongoose');

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
  // params
  param('categoryId')
    .isMongoId()
    .withMessage('Invalid category ID'),

  param('subcategoryId')
    .isMongoId()
    .withMessage('Invalid subcategory ID'),

  // label
  body('label')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Label required (2-100 chars)')
    .custom(async (value, { req }) => {
      const { categoryId, subcategoryId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(categoryId) ||
          !mongoose.Types.ObjectId.isValid(subcategoryId)) {
        return true; // params validation will handle this
      }

      const label = value.trim();

      const exists = await Type.findOne({
        label: { $regex: `^${label}$`, $options: 'i' },
        subcategory: subcategoryId,
        category: categoryId
      });

      if (exists) {
        throw new Error(`Type "${label}" already exists in this subcategory`);
      }

      return true;
    }),

  // description
  body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description max 500 chars'),

  // order
  body('order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Order must be >= 0'),

  validate
];
// Query Validations
exports.validateQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('active').optional().isIn(['true', 'false']),
  query('populate').optional().isIn(['true', 'false']),
  validate,
];