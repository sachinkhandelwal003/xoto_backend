// validations/subcategory/subcategory.validation.js
const { body, query, param, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Category = require('../../models/Freelancer/categoryfreelancer.model');
const Subcategory = require('../../models/Freelancer/subcategoryfreelancer.model');
const mongoose = require('mongoose');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg
      }))
    });
  }
  next();
};

const isValidObjectId = (value, field) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`${field} must be a valid ObjectId`);
  }
  return true;
};

// CREATE
exports.validateCreateSubcategory = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),

  body('category')
    .notEmpty().withMessage('Category is required')
    .custom(async (value) => {
      if (!isValidObjectId(value, 'Category ID')) return false;
      const cat = await Category.findOne({ _id: value, is_deleted: false });
      if (!cat) throw new Error('Category not found or deleted');
      return true;
    }),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description too long'),

  body('icon')
    .optional()
    .trim()
    .isURL().withMessage('Invalid icon URL'),

  validate
];

// UPDATE
exports.validateUpdateSubcategory = [
  param('id')
    .custom(value => isValidObjectId(value, 'Subcategory ID')),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),

  body('category')
    .optional()
    .custom(async (value) => {
      if (!isValidObjectId(value, 'Category ID')) return false;
      const cat = await Category.findOne({ _id: value, is_deleted: false });
      if (!cat) throw new Error('Category not found');
      return true;
    }),

  body('is_active')
    .optional()
    .toBoolean()
    .isBoolean().withMessage('is_active must be boolean'),

  validate
];

// GET ALL
exports.validateGetSubcategories = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be ≥1'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit 1-100'),

  query('category')
    .optional()
    .custom(value => isValidObjectId(value, 'Category ID')),

  query('search')
    .optional()
    .trim(),

  query('active')
    .optional()
    .isIn(['true', 'false']).withMessage('active must be true/false'),

  validate
];

// PARAM ID
exports.validateSubcategoryId = [
  param('id')
    .custom(value => isValidObjectId(value, 'Subcategory ID')),
  validate
];