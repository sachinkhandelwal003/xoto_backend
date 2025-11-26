const { body, query, param, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../utils/constants/statusCodes');
const { Role } = require('../models/role/role.model');
const User = require('../models/User');
const mongoose = require('mongoose');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
      })),
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

// Unified user creation validation
exports.validateCreateUser = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .bail()
    .isEmail().withMessage('Invalid email format')
    .bail()
    .normalizeEmail()
    .custom(async (email) => {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new Error('Email already in use');
      }
      return true;
    }),

  body('password')
    .trim()
    .notEmpty().withMessage('Password is required')
    .bail()
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),

  body('role')
    .notEmpty().withMessage('Role ID is required')
    .bail()
    .custom(value => isValidObjectId(value, 'Role ID'))
    .bail()
    .custom(async (roleId, { req }) => {
      const role = await Role.findById(roleId);
      if (!role) throw new Error('Role not found');

      // Check if trying to assign SuperAdmin role (code '0')
      if (role.code === '0') {
        const existingSuperAdmin = await User.findOne({
          role: { $in: await Role.find({ code: '0' }).distinct('_id') }
        });
        if (existingSuperAdmin) {
          throw new Error('System can only have one SuperAdmin');
        }
      }

      return true;
    }),

  body('status')
    .optional()
    .isIn(['Created', 'Verified', 'Pending']).withMessage('Status must be Created, Verified, or Pending'),

  validate
];

exports.validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),

  body('password')
    .trim()
    .notEmpty().withMessage('Password is required'),

  validate,
];

exports.validateGetAllUsers = [
  query('status')
    .optional()
    .isIn(['Created', 'Verified', 'Pending']).withMessage('Status must be Created, Verified, or Pending'),

  query('isActive')
    .optional()
    .isIn(['true', 'false']).withMessage('isActive must be true or false'),

  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1 }).withMessage('Limit must be a positive integer'),

  validate
];

exports.validateUserId = [
  param('id')
    .notEmpty().withMessage('User ID is required')
    .bail()
    .custom(value => isValidObjectId(value, 'User ID')),
  
  validate
];

exports.validateUpdateUserStatus = [
  param('id')
    .notEmpty().withMessage('User ID is required')
    .bail()
    .custom(value => isValidObjectId(value, 'User ID')),
  
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['Created', 'Verified', 'Pending']).withMessage('Status must be Created, Verified, or Pending'),
  
  validate
];

exports.validateUpdateUserActiveStatus = [
  param('id')
    .notEmpty().withMessage('User ID is required')
    .bail()
    .custom(value => isValidObjectId(value, 'User ID')),
  
  body('isActive')
    .notEmpty().withMessage('isActive is required')
    .isBoolean().withMessage('isActive must be true or false'),
  
  validate
];

exports.validateUpdatePassword = [
  param('id')
    .notEmpty().withMessage('User ID is required')
    .bail()
    .custom(value => isValidObjectId(value, 'User ID')),
  
  body('newPassword')
    .trim()
    .notEmpty().withMessage('New password is required')
    .bail()
    .isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),

  body('currentPassword')
    .optional()
    .trim()
    .notEmpty().withMessage('Current password is required when updating your own password'),
  
  validate
];