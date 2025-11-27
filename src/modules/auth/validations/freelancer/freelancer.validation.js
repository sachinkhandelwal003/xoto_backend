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


// === CREATE FREELANCER (NO DOCUMENTS) ===
exports.validateCreateFreelancer = [

  // Email
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required').bail()
    .isEmail().withMessage('Invalid email format').bail()
    .normalizeEmail()
    .custom(async (email) => {
      const exists = await Freelancer.findOne({ email, is_deleted: false });
      if (exists) throw new Error('Email already in use');
      return true;
    }),

  // Password
  body('password')
    .trim()
    .notEmpty().withMessage('Password is required').bail()
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),

  // Confirm Password
  body('confirm_password')
    .trim()
    .notEmpty().withMessage('Confirm password is required').bail()
    .custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),

  // Name
  body('name.first_name')
    .trim()
    .notEmpty().withMessage('First name is required').bail()
    .isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),

  body('name.last_name')
    .trim()
    .notEmpty().withMessage('Last name is required').bail()
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),

  // Mobile (string or object)
  body('mobile')
    .notEmpty().withMessage('Mobile number is required').bail()
    .custom((value, { req }) => {
      let country_code = '+91';
      let number = '';

      if (typeof value === 'string') {
        number = value.replace(/\D/g, '');
        if (number.length < 8 || number.length > 15)
          throw new Error('Mobile must have 8-15 digits');
      } 
      else if (typeof value === 'object' && value.number) {
        country_code = value.country_code || '+91';
        number = value.number.toString().replace(/\D/g, '');

        if (!/^\+\d{1,4}$/.test(country_code))
          throw new Error('Invalid country code');

        if (number.length < 8 || number.length > 15)
          throw new Error('Mobile number must have 8-15 digits');
      } 
      else {
        throw new Error('Mobile must be a valid number or object { country_code, number }');
      }

      req.body.mobile = { country_code, number };
      return true;
    })
    .bail()
    .custom(async (mobileObj) => {
      const exists = await Freelancer.findOne({
        "mobile.country_code": mobileObj.country_code,
        "mobile.number": mobileObj.number,
        is_deleted: false
      });
      if (exists) throw new Error('Mobile number already in use');
      return true;
    }),

  // Mobile Verified
  body('is_mobile_verified')
    .toBoolean()
    .isBoolean().withMessage('is_mobile_verified must be true/false').bail()
    .custom((value) => {
      if (value !== true)
        throw new Error('You must verify your mobile number via OTP before registering');
      return true;
    }),

  // Professional
  body('professional.experience_years')
    .optional()
    .isInt({ min: 0, max: 50 }).withMessage('Experience must be 0-50 years'),

  body('professional.bio')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Bio must not exceed 1000 characters'),

  body('professional.skills')
    .optional()
    .isArray().withMessage('Skills must be an array').bail()
    .custom((skills) => {
      if (skills.length > 20) throw new Error('Maximum 20 skills allowed');
      return true;
    }),

  body('professional.working_radius')
    .optional()
    .trim()
    .matches(/^\d+\s?(km|mi)$/i).withMessage('Working radius must be like "50 km"'),

  body('professional.availability')
    .optional()
    .trim()
    .isIn(['Part-time', 'Full-time', 'Project-based']).withMessage('Invalid availability'),

  // Location
  body('location.city')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('City must be 2-100 characters'),

  body('location.state').optional().trim(),
  body('location.country').optional().trim(),

  body('location.pincode')
    .optional()
    .trim()
    .matches(/^\d{5,6}$/).withMessage('Invalid pincode'),

  // Languages
  body('languages')
    .optional()
    .isArray().withMessage('Languages must be an array').bail()
    .custom((langs) => {
      if (langs.length > 10) throw new Error('Maximum 10 languages allowed');
      return true;
    }),

  // SERVICES OFFERED
  body('services_offered')
    .isArray({ min: 1 }).withMessage('At least one service is required').bail()
    .custom(async (services) => {
      for (let i = 0; i < services.length; i++) {
        const s = services[i];

        if (!s.category) throw new Error(`Service ${i + 1}: category is required`);
        isValidObjectId(s.category, `Service ${i + 1} category`);

        if (!Array.isArray(s.subcategories) || s.subcategories.length === 0)
          throw new Error(`Service ${i + 1}: at least one subcategory is required`);

        const cat = await Category.findOne({ _id: s.category, is_deleted: false });
        if (!cat) throw new Error(`Service ${i + 1}: Invalid category ID`);

        for (let j = 0; j < s.subcategories.length; j++) {
          const subId = s.subcategories[j];

          isValidObjectId(subId, `Service ${i + 1} subcategory ${j + 1}`);

          const subcat = await Subcategory.findOne({
            _id: subId,
            category: s.category,
            is_deleted: false
          });

          if (!subcat)
            throw new Error(`Service ${i + 1}, Subcategory ${j + 1}: Does not belong to selected category`);
        }

        if (s.price_range && !/^\d+\s?-\s?\d+/.test(s.price_range))
          throw new Error(`Service ${i + 1}: Invalid price range (e.g., 500 - 2000)`);
      }
      return true;
    }),

  // PAYMENT
  body('payment.preferred_method')
    .optional()
    .isString().withMessage('Preferred payment method must be a string'),

  body('payment.advance_percentage')
    .optional()
    .isInt({ min: 0, max: 100 }).withMessage('Advance % must be 0-100'),

  body('payment.gst_number')
    .optional()
    .trim()
    .matches(/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}[A-Z\d]{1}$/)
    .withMessage('Invalid GST number'),

  // Terms
  body('meta.agreed_to_terms')
    .toBoolean()
    .isBoolean().withMessage('Agreed to terms must be boolean').bail()
    .custom(value => {
      if (!value) throw new Error('You must agree to terms and conditions');
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