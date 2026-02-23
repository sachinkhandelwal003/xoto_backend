// validations/user/user.validation.js
const { body, query, param, validationResult } = require('express-validator');
const User = require('../../models/user/user.model');
const {Role} = require('../../../auth/models/role/role.model');
const mongoose = require('mongoose');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Customer = require('../../models/user/customer.model');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
      })),
    });
  }
  next();
};

const isValidObjectId = (value, fieldName = 'ID') => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`${fieldName} must be a valid MongoDB ID`);
  }
  return true;
};

exports.validateCustomerSignup = [

  // 🔹 First Name
  body('name.first_name')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be 2–50 characters'),

  // 🔹 Last Name
  body('name.last_name')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be 2–50 characters'),

  // 🔹 Email
  body('email')
    .notEmpty().withMessage('Email is required')
    .bail()
    .custom(async (email) => {
      const emailRegex = /^[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}$/;
      const normalized = email.trim().toLowerCase();

      if (!emailRegex.test(normalized)) {
        throw new Error('Please enter a valid email address');
      }

      const existing = await Customer.findOne({
        email: normalized,
        is_deleted: false
      });

      if (existing) {
        throw new Error('Email already registered');
      }

      return true;
    }),

  // 🔹 Mobile Number (Nested)
  body('mobile.number')
    .notEmpty().withMessage('Mobile number is required')
    .bail()
    .matches(/^\d{8,15}$/)
    .withMessage('Mobile number must be 8–15 digits'),

  // 🔹 Country Code (Optional)
  body('mobile.country_code')
    .optional()
    .matches(/^\+\d{1,4}$/)
    .withMessage('Invalid country code'),

  // 🔹 Mobile Uniqueness
  body('mobile.number')
    .custom(async (number,country_code) => {
      const existing = await Customer.findOne({
        "mobile.country_code":country_code,
        "mobile.number": number,
        is_deleted: false
      });

      if (existing) {
        console.log("existingexistingexisting",existing)
        throw new Error('Mobile number already registered');
      }

      return true;
    }),

  // 🔹 Location (Optional – safe validation)
  body('location.lat').optional().isFloat().withMessage('Latitude must be a number'),
  body('location.lng').optional().isFloat().withMessage('Longitude must be a number'),
  body('location.country').optional().isString(),
  body('location.state').optional().isString(),
  body('location.city').optional().isString(),
  body('location.area').optional().isString(),
  body('location.address').optional().isString(),

  validate
];
exports.validateCreateUser = [
  body('name.first_name')
    .trim()
    .notEmpty().withMessage('First name is required').bail()
    .isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),

  body('name.last_name')
    .trim()
    .notEmpty().withMessage('Last name is required').bail()
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),
body('email')
  .notEmpty().withMessage('Email is required').bail()
  .custom(async (email) => {
    const emailRegex = /^[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}$/;
    const normalized = email.trim().toLowerCase();

    if (!emailRegex.test(normalized)) {
      throw new Error('Please enter a valid email address');
    }

    const existing = await User.findOne({ email: normalized, is_deleted: false });
    if (existing) {
      throw new Error('Email already registered');
    }

    return true;
  }),
  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required').bail()
    .isMobilePhone('any').withMessage('Enter a valid mobile number'),

  body('role')
    .notEmpty().withMessage('Role is required').bail()
    .custom(isValidObjectId).withMessage('Invalid role ID').bail()
    .custom(async (roleId) => {
      const role = await Role.findById(roleId);
      if (!role) throw new Error('Role not found');
      return true;
    }),

  body('mobile')
    .custom(async (mobile, { req }) => {
      const roleId = req.body.role;
      const existing = await User.findOne({ mobile, role: roleId, is_deleted: false });
      if (existing) {
        throw new Error('This mobile number is already used for this role');
      }
      return true;
    }),

  body('password')
    .notEmpty().withMessage('Password is required').bail()
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),

  body('confirm_password')
    .notEmpty().withMessage('Confirm password is required').bail()
    .custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),

  validate,
];

exports.validateLogin = [
  body('email').trim().toLowerCase().isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
  validate,
];

exports.validateGetUsers = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
  query('limit').optional().isInt({ min: 1, max: 500 }).withMessage('Limit 1–500'),
  query('search').optional().trim(),
  query('active').optional().isIn(['true', 'false']),
  validate,
];

exports.validateUserId = [
  param('id').custom((id) => isValidObjectId(id, 'User ID')),
  validate,
];