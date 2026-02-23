// validations/category/category.validation.js
const { body, query, param, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Category = require('../../models/Freelancer/categoryfreelancer.model');
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
exports.validateCreateCategory = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters')
    .custom(async (name) => {
      const exists = await Category.findOne({
        name: { $regex: `^${name}$`, $options: 'i' },
        is_deleted: false
      });
      if (exists) throw new Error('Category already exists');
      return true;
    }),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description too long'),
  validate
];

// UPDATE
exports.validateUpdateCategory = [
  param('id')
    .custom(value => isValidObjectId(value, 'Category ID')),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters')
    .custom(async (name, { req }) => {
      const exists = await Category.findOne({
        name: { $regex: `^${name}$`, $options: 'i' },
        _id: { $ne: req.params.id },
        is_deleted: false
      });
      if (exists) throw new Error('Category name already exists');
      return true;
    }),

  body('is_active')
    .optional()
    .toBoolean()
    .isBoolean().withMessage('is_active must be boolean'),

  validate
];

// GET ALL
exports.validateGetCategories = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be ≥1'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit 1-100'),

  query('search')
    .optional()
    .trim(),

  query('active')
    .optional()
    .isIn(['true', 'false']).withMessage('active must be true/false'),

  validate
];

// PARAM ID
exports.validateCategoryId = [
  param('id')
    .custom(value => isValidObjectId(value, 'Category ID')),
  validate
];