const { body, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../utils/constants/statusCodes');
const Customer = require('../models/Customer/customer.model');

// Improved email regex (more comprehensive)
const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Alternative simpler email regex if above is too complex:
// const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      statusCode: StatusCodes.BAD_REQUEST,
      message: 'Validation failed',
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

// Customer login validation
exports.validateCustomerLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .matches(emailRegex).withMessage('Invalid email format'),
  body('password')
    .trim()
    .notEmpty().withMessage('Password is required'),
  validate,
];

// Create customer validation
exports.validateCreateCustomer = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .matches(emailRegex).withMessage('Invalid email format')
    .normalizeEmail()
    .custom(async (email) => {
      const existingCustomer = await Customer.findOne({ email });
      if (existingCustomer) {
        throw new Error('Email already in use');
      }
      return true;
    }),
  body('password')
    .trim()
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword')
    .trim()
    .notEmpty().withMessage('Confirm password is required')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required'),
  body('profile_image')
    .optional()
    .custom((value, { req }) => {
      if (req.file) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif'];
        const maxSize = 2 * 1024 * 1024; // 2MB
        if (!allowedTypes.includes(req.file.mimetype)) {
          throw new Error('Profile image must be JPEG, PNG, JPG, or GIF');
        }
        if (req.file.size > maxSize) {
          throw new Error('Profile image size must be less than 2MB');
        }
      }
      return true;
    }),
  validate,
];

// Change password validation
exports.validateChangePassword = [
  body('currentPassword')
    .trim()
    .notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .trim()
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  body('confirmPassword')
    .trim()
    .notEmpty().withMessage('Confirm password is required')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  validate,
];