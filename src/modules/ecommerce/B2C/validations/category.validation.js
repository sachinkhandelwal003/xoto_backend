const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Category = require('../models/category.model');
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
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`${fieldName} must be a valid MongoDB ObjectId`);
  }
  return true;
};

exports.validateCreateCategory = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
    .custom(async (name) => {
      const existing = await Category.findOne({ 
        name: name.trim(), 
        status: 1 
      });
      if (existing) throw new Error('Category name already exists');
      return true;
    }),
  body('slug')
    .optional()
    .trim()
    .matches(/^[a-z0-9-]+$/).withMessage('Slug can only contain lowercase letters, numbers, and hyphens'),
  body('parent')
    .optional()
    .custom(async (value) => {
      if (value) {
        return isValidObjectId(value, 'Parent Category ID');
      }
      return true;
    }),
  body('metaTitle')
    .optional()
    .trim()
    .isLength({ max: 60 }).withMessage('Meta title must not exceed 60 characters'),
  body('metaDescription')
    .optional()
    .trim()
    .isLength({ max: 160 }).withMessage('Meta description must not exceed 160 characters'),
  body('metaKeywords')
    .optional()
    .isArray().withMessage('Meta keywords must be an array')
    .custom((keywords) => {
      if (keywords && keywords.length > 10) {
        throw new Error('Maximum 10 keywords allowed');
      }
      return true;
    }),
  body('icon')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Icon must not exceed 100 characters'),
  body('isHighlighted')
    .optional()
    .isBoolean().withMessage('Must be a boolean'),
  body('isSpecial')
    .optional()
    .isBoolean().withMessage('Must be a boolean'),
  body('showInFilterMenu')
    .optional()
    .isBoolean().withMessage('Must be a boolean'),
  // sortOrder validation REMOVED
  body('status')
    .optional()
    .isInt({ min: 0, max: 1 }).withMessage('Status must be 0 or 1'),
  validate
];

exports.validateUpdateCategory = [
  param('id').custom((value) => isValidObjectId(value, 'Category ID')),
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Name cannot be empty')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
    .custom(async (name, { req }) => {
      const existing = await Category.findOne({ 
        name: name.trim(), 
        _id: { $ne: req.params.id },
        status: 1 
      });
      if (existing) throw new Error('Category name already exists');
      return true;
    }),
  body('parent')
    .optional()
    .custom(async (value, { req }) => {
      if (value && value !== req.category?.parent?.toString()) {
        return isValidObjectId(value, 'Parent Category ID');
      }
      return true;
    }),
  body('metaTitle')
    .optional()
    .trim()
    .isLength({ max: 60 }).withMessage('Meta title must not exceed 60 characters'),
  body('metaDescription')
    .optional()
    .trim()
    .isLength({ max: 160 }).withMessage('Meta description must not exceed 160 characters'),
  body('icon')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Icon must not exceed 100 characters'),
  body('isHighlighted')
    .optional()
    .isBoolean().withMessage('Must be a boolean'),
  body('isSpecial')
    .optional()
    .isBoolean().withMessage('Must be a boolean'),
  body('showInFilterMenu')
    .optional()
    .isBoolean().withMessage('Must be a boolean'),
  // sortOrder validation REMOVED
  body('status')
    .optional()
    .isInt({ min: 0, max: 1 }).withMessage('Status must be 0 or 1'),
  validate
];

exports.validateCategoryId = [
  param('id').custom((value) => isValidObjectId(value, 'Category ID')),
  validate
];

exports.validateGetAllCategories = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim().isLength({ max: 100 }),
  query('includeDeleted').optional().isIn(['true', 'false']),
  query('status').optional().isInt({ min: 0, max: 1 }),
  query('highlighted').optional().isIn(['true', 'false']),
  query('special').optional().isIn(['true', 'false']),
  query('showInMenu').optional().isIn(['true', 'false']),
  // sortOrder query validation REMOVED
  validate
];