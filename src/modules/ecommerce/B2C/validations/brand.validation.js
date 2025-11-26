const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Brand = require('../models/brand.model');
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

exports.validateCreateBrand = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .custom(async (name) => {
      const existingBrand = await Brand.findOne({ name, status: { $ne: 0 } });
      if (existingBrand) {
        throw new Error('Brand name already in use');
      }
      return true;
    }),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),

  body('country')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Country must not exceed 100 characters'),
  body('logo')
    .optional()
    .custom((value, { req }) => {
      if (req.file) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif'];
        const maxSize = 2 * 1024 * 1024; // 2MB
        if (!allowedTypes.includes(req.file.mimetype)) {
          throw new Error('Logo must be an image (JPEG, PNG, JPG, GIF)');
        }
        if (req.file.size > maxSize) {
          throw new Error('Logo size must be less than 2MB');
        }
      }
      return true;
    }),
  validate
];

exports.validateUpdateBrand = [
  param('id')
    .custom(value => isValidObjectId(value, 'Brand ID')),
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Name cannot be empty')
    .custom(async (name, { req }) => {
      const existingBrand = await Brand.findOne({ name, _id: { $ne: req.params.id }, status: { $ne: 0 } });
      if (existingBrand) {
        throw new Error('Brand name already in use');
      }
      return true;
    }),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
  body('website')
    .optional()
    .isURL().withMessage('Invalid website URL'),
  body('country')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Country must not exceed 100 characters'),
  body('logo')
    .optional()
    .custom((value, { req }) => {
      if (req.file) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif'];
        const maxSize = 2 * 1024 * 1024; // 2MB
        if (!allowedTypes.includes(req.file.mimetype)) {
          throw new Error('Logo must be an image (JPEG, PNG, JPG, GIF)');
        }
        if (req.file.size > maxSize) {
          throw new Error('Logo size must be less than 2MB');
        }
      }
      return true;
    }),
  validate
];

exports.validateGetAllBrands = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1 }).withMessage('Limit must be a positive integer'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Search term must not exceed 100 characters'),
  query('status')
    .optional()
    .isIn([0, 1]).withMessage('Status must be 0 (deleted) or 1 (active)'),
  validate
];

exports.validateBrandId = [
  param('id')
    .custom(value => isValidObjectId(value, 'Brand ID')),
  validate
];