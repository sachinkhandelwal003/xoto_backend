// validations/freelancer/freelancer.validation.js
const { body, query, param, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Freelancer = require('../../models/Freelancer/freelancer.model');
const Category = require('../../models/Freelancer/categoryfreelancer.model');
const Subcategory = require('../../models/Freelancer/subcategoryfreelancer.model');;
const mongoose = require('mongoose');

// Reusable validation result handler
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

// Helper: Valid ObjectId
const isValidObjectId = (value, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`${fieldName} must be a valid MongoDB ObjectId`);
  }
  return true;
};


exports.validateCreateFreelancer = [

  /* ================= EMAIL ================= */
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required').bail()
    .isEmail().withMessage('Invalid email format').bail()
    .normalizeEmail()
    .custom(async (email) => {
      const exists = await Freelancer.findOne({ email });
      if (exists) throw new Error('Email already in use');
      return true;
    }),

  /* ================= PASSWORD ================= */
  body('password')
    .trim()
    .notEmpty().withMessage('Password is required').bail()
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),

  body('confirm_password')
    .notEmpty().withMessage('Confirm password is required')
    .custom((value, { req }) => {
      if (value !== req.body.password)
        throw new Error('Passwords do not match');
      return true;
    }),

  /* ================= NAME ================= */
  body('name.first_name')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 2, max: 50 }),

  body('name.last_name')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ min: 2, max: 50 }),

  /* ================= MOBILE ================= */
  body('mobile')
    .notEmpty().withMessage('Mobile is required')
    .custom((value, { req }) => {
      let country_code = '+91';
      let number;

      if (typeof value === 'string') {
        number = value.replace(/\D/g, '');
      } else if (typeof value === 'object') {
        country_code = value.country_code || '+91';
        number = String(value.number || '').replace(/\D/g, '');
      } else {
        throw new Error('Invalid mobile format');
      }

      if (!/^\+\d{1,4}$/.test(country_code))
        throw new Error('Invalid country code');

      if (!/^\d{8,15}$/.test(number))
        throw new Error('Mobile number must be 8–15 digits');

      req.body.mobile = { country_code, number };
      return true;
    })
    .custom(async (mobile) => {
      const exists = await Freelancer.findOne({
        'mobile.country_code': mobile.country_code,
        'mobile.number': mobile.number
      });
      if (exists) throw new Error('Mobile number already in use');
      return true;
    }),

  /* ================= MOBILE VERIFIED ================= */
  body('is_mobile_verified')
    .toBoolean()
    .custom(value => {
      if (!value)
        throw new Error('Mobile must be verified via OTP');
      return true;
    }),

  /* ================= PROFESSIONAL ================= */
  body('professional.experience_years')
    .optional()
    .isInt({ min: 0, max: 50 }),

  body('professional.bio')
    .optional()
    .isLength({ max: 1000 }),

  body('professional.skills')
    .optional()
    .isArray({ max: 20 }),

  body('professional.availability')
    .optional()
    .isIn(['Full-time', 'Part-time', 'Project-based']),

  /* ================= LOCATION ================= */
  body('location.city').optional().isLength({ min: 2, max: 100 }),
  body('location.state').optional().trim(),
  body('location.country').optional().trim(),
  body('location.pincode')
    .optional()
    .matches(/^\d{5,6}$/).withMessage('Invalid pincode'),

  /* ================= LANGUAGES ================= */
  body('languages')
    .optional()
    .isArray({ max: 10 }),

  /* ================= PAYMENT ================= */
  body('payment.preferred_method').optional().isString(),
  body('payment.vat_number').optional().isString(),
  body('payment.preferred_currency').optional().isMongoId(),

  /* ================= TERMS ================= */
  body('meta.agreed_to_terms')
    .toBoolean()
    .custom(val => {
      if (!val) throw new Error('You must agree to terms');
      return true;
    }),

  validate
];

// === LOGIN ===
exports.validateFreelancerLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email'),

  body('password')
    .trim()
    .notEmpty().withMessage('Password is required'),

  validate
];

// === CHANGE PASSWORD ===
exports.validateChangePassword = [
  body('current_password')
    .trim()
    .notEmpty().withMessage('Current password is required'),

  body('new_password')
    .trim()
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 6 }).withMessage('New password must be ≥6 chars'),

  body('confirm_password')
    .trim()
    .notEmpty().withMessage('Confirm password is required')
    .custom((value, { req }) => {
      if (value !== req.body.new_password) throw new Error('Passwords do not match');
      return true;
    }),

  validate
];

// === GET ALL FREELANCERS (Admin) ===
exports.validateGetAllFreelancers = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be ≥1'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),

  query('status')
    .optional()
    .isIn(['0', '1', '2']).withMessage('Status must be 0, 1, or 2'),

  query('search')
    .optional()
    .trim(),

  query('city')
    .optional()
    .trim(),

  validate
];

// === UPDATE FREELANCER STATUS ===
exports.validateUpdateFreelancerStatus = [
  param('id')
    .custom(value => isValidObjectId(value, 'Freelancer ID')),

  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['0', '1', '2']).withMessage('Status must be 0, 1, or 2'),

  body('rejection_reason')
    .if(body('status').equals('2'))
    .notEmpty().withMessage('Rejection reason is required')
    .trim()
    .isLength({ max: 500 }).withMessage('Reason too long'),

  validate
];

// === UPDATE DOCUMENT VERIFICATION ===
exports.validateUpdateDocumentVerification = [
  body('freelancerId')
    .notEmpty().withMessage('Freelancer ID required')
    .custom(value => isValidObjectId(value, 'Freelancer ID')),

  body('documentId')
    .notEmpty().withMessage('Document ID required')
    .custom(value => isValidObjectId(value, 'Document ID')),

  body('verified')
    .toBoolean()
    .isBoolean().withMessage('Verified must be boolean'),

  body('reason')
    .if(body('verified').equals(false))
    .notEmpty().withMessage('Reason required when rejected')
    .trim()
    .isLength({ max: 500 }),

  body('suggestion')
    .if(body('verified').equals(false))
    .notEmpty().withMessage('Suggestion required when rejected')
    .trim()
    .isLength({ max: 500 }),

  body('reason')
    .if(body('verified').equals(true))
    .isEmpty().withMessage('Reason must be empty when approved'),

  body('suggestion')
    .if(body('verified').equals(true))
    .isEmpty().withMessage('Suggestion must be empty when approved'),

  validate
];

// === UPDATE DOCUMENT (File) ===
exports.validateUpdateDocument = [
  param('documentId')
    .custom(value => isValidObjectId(value, 'Document ID')),

  body('file')
    .custom((value, { req }) => {
      if (!req.file) throw new Error('File is required');

      const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
      if (!allowed.includes(req.file.mimetype)) {
        throw new Error('Only JPEG, PNG, PDF allowed');
      }
      if (req.file.size > 5 * 1024 * 1024) {
        throw new Error('File size must be < 5MB');
      }
      return true;
    }),

  validate
];

// === FREELANCER ID PARAM ===
exports.validateFreelancerId = [
  param('id')
    .custom(value => isValidObjectId(value, 'Freelancer ID')),
  validate
];