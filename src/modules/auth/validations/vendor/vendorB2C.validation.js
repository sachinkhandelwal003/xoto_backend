const { body, query, param, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const VendorB2C = require('../../models/Vendor/B2cvendor.model');
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

// Send OTP validation
exports.validateSendOtp = [
  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required').bail()
    .isMobilePhone('any').withMessage('Invalid mobile number'),
  validate
];

// Verify OTP validation
exports.validateVerifyOtp = [
  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required').bail()
    .isMobilePhone('any').withMessage('Invalid mobile number'),
  body('otp')
    .trim()
    .notEmpty().withMessage('OTP is required').bail()
    .isLength({ min: 4, max: 6 }).withMessage('OTP must be between 4 and 6 digits'),
  validate
];

// Create vendor validation
exports.validateCreateVendor = [
  // --- Email ---
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required').bail()
    .isEmail().withMessage('Invalid email format').bail()
    .normalizeEmail()
    .custom(async (email) => {
      const existingVendor = await VendorB2C.findOne({ email });
      if (existingVendor) throw new Error('Email already in use');
      return true;
    }),

  // --- Password & Confirmation ---
  body('password')
    .trim()
    .notEmpty().withMessage('Password is required').bail()
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),

  body('confirmPassword')
    .trim()
    .notEmpty().withMessage('Confirm password is required').bail()
    .custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),

  // --- Basic Info ---
  body('full_name')
    .trim()
    .notEmpty().withMessage('Full name is required'),

  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required').bail()
    .isMobilePhone('any').withMessage('Invalid mobile number').bail()
    .custom(async (mobile) => {
      const existingVendor = await VendorB2C.findOne({ mobile });
      if (existingVendor) throw new Error('Mobile number already in use');
      return true;
    }),

  body('is_mobile_verified')
    .toBoolean()
    .isBoolean().withMessage('is_mobile_verified must be boolean').bail()
    .custom((v) => {
      if (!v) throw new Error('Mobile must be verified');
      return true;
    }),

  // --- Store Details ---
  body('store_details.store_name')
    .trim()
    .notEmpty().withMessage('Store name is required'),

  body('store_details.store_description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Store description must not exceed 500 characters'),

  body('store_details.store_type')
    .notEmpty().withMessage('Store type is required').bail()
    .isIn(['Individual / Sole Proprietor', 'Private Limited', 'Partnership'])
    .withMessage('Invalid store type'),

  body('store_details.store_address')
    .trim()
    .notEmpty().withMessage('Store address is required'),

  body('store_details.pincode')
    .trim()
    .notEmpty().withMessage('Pincode is required'),

  // --- Registration ---
  body('registration.pan_number')
    .trim()
    .notEmpty().withMessage('PAN number is required'),

  body('registration.gstin')
    .optional()
    .trim(),

  // --- Bank Details ---
  body('bank_details.bank_account_number')
    .trim()
    .notEmpty().withMessage('Bank account number is required'),

  body('bank_details.ifsc_code')
    .trim()
    .notEmpty().withMessage('IFSC code is required'),

  body('bank_details.account_holder_name')
    .trim()
    .notEmpty().withMessage('Account holder name is required'),

  // --- Logo Validation ---
  body('logo')
    .optional()
    .custom((_, { req }) => {
      if (req.files?.logo) {
        const logo = req.files.logo[0];
        const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif'];
        const max = 2 * 1024 * 1024;
        if (!allowed.includes(logo.mimetype)) throw new Error('Logo must be JPEG/PNG/JPG/GIF');
        if (logo.size > max) throw new Error('Logo size must be <2MB');
      }
      return true;
    }),

  // --- Document Validation ---
  body('documents')
    .custom((_, { req }) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
      const maxSize = 5 * 1024 * 1024;
      const docTypes = ['identityProof', 'addressProof', 'gstCertificate'];
      if (!req.files || !Object.keys(req.files).some(k => docTypes.includes(k)))
        throw new Error('At least one document is required');
      for (const t of docTypes) {
        if (req.files[t]) {
          for (const f of req.files[t]) {
            if (!allowedTypes.includes(f.mimetype)) throw new Error(`Document ${t} must be JPEG, PNG, or PDF`);
            if (f.size > maxSize) throw new Error(`Document ${t} size must be <5MB`);
          }
        }
      }
      return true;
    }),

  // --- Terms ---
  body('meta.agreed_to_terms')
    .toBoolean()
    .isBoolean().withMessage('Agreed to terms must be boolean').bail()
    .custom(v => {
      if (!v) throw new Error('You must agree to the terms');
      return true;
    }),

  validate
];

// Vendor login validation
exports.validateVendorLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required').bail()
    .isEmail().withMessage('Invalid email format'),
  body('password')
    .trim()
    .notEmpty().withMessage('Password is required'),
  validate
];

// Get all vendors validation
exports.validateGetAllVendors = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1 }).withMessage('Limit must be a positive integer'),
  query('status')
    .optional()
    .isIn(['0', '1', '2']).withMessage('Invalid status (must be 0, 1, or 2)'),
  validate
];

// Vendor ID validation
exports.validateVendorId = [
  param('id')
    .custom(value => isValidObjectId(value, 'Vendor ID')).bail(),
  validate
];

// Update vendor status validation
exports.validateUpdateVendorStatus = [
  param('id')
    .custom(value => isValidObjectId(value, 'Vendor ID')).bail(),
  body('status')
    .notEmpty().withMessage('Status is required').bail()
    .isIn(['0', '1', '2']).withMessage('Invalid status (must be 0, 1, or 2)'),
  body('rejection_reason')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Rejection reason must not exceed 500 characters'),
  validate
];

// Update vendor validation
exports.validateUpdateVendor = [
  param('id')
    .custom(value => isValidObjectId(value, 'Vendor ID')).bail(),
  body('full_name')
    .optional()
    .trim()
    .notEmpty().withMessage('Full name cannot be empty'),
  body('mobile')
    .optional()
    .trim()
    .isMobilePhone('any').withMessage('Invalid mobile number').bail()
    .custom(async (mobile, { req }) => {
      const vendor = await VendorB2C.findOne({ mobile, _id: { $ne: req.params.id } });
      if (vendor) {
        throw new Error('Mobile number already in use');
      }
      return true;
    }),
  body('store_details.store_name')
    .optional()
    .trim()
    .notEmpty().withMessage('Store name cannot be empty'),
  body('store_details.store_description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Store description must not exceed 500 characters'),
  body('store_details.store_type')
    .optional()
    .isIn(['Individual / Sole Proprietor', 'Private Limited', 'Partnership']).withMessage('Invalid store type'),
  body('store_details.store_address')
    .optional()
    .trim()
    .notEmpty().withMessage('Store address cannot be empty'),
  body('store_details.pincode')
    .optional()
    .trim()
    .notEmpty().withMessage('Pincode cannot be empty'),
  body('registration.pan_number')
    .optional()
    .trim()
    .notEmpty().withMessage('PAN number cannot be empty'),
  body('registration.gstin')
    .optional()
    .trim(),
  body('bank_details.bank_account_number')
    .optional()
    .trim()
    .notEmpty().withMessage('Bank account number cannot be empty'),
  body('bank_details.ifsc_code')
    .optional()
    .trim()
    .notEmpty().withMessage('IFSC code cannot be empty'),
  body('bank_details.account_holder_name')
    .optional()
    .trim()
    .notEmpty().withMessage('Account holder name cannot be empty'),
  body('store_details.categories')
    .optional()
    .isArray({ min: 1 }).withMessage('At least one category is required').bail()
    .custom((categories) => {
      for (const category of categories) {
        if (!category.name || typeof category.name !== 'string') {
          throw new Error('Each category must have a valid name');
        }
        if (category.subcategories && !Array.isArray(category.subcategories)) {
          throw new Error('Subcategories must be an array');
        }
      }
      return true;
    }),
  body('meta.agreed_to_terms')
    .optional()
    .toBoolean()
    .isBoolean().withMessage('Agreed to terms must be boolean'),
  validate
];

// Update document verification validation
exports.validateUpdateDocumentVerification = [
  body('vendorId')
    .notEmpty().withMessage('Vendor ID is required').bail()
    .custom((value) => isValidObjectId(value, 'Vendor ID')).bail(),
  body('documentId')
    .notEmpty().withMessage('Document ID is required').bail()
    .custom((value) => isValidObjectId(value, 'Document ID')).bail(),
  body('verified')
    .toBoolean()
    .isBoolean().withMessage('Verified must be a boolean value').bail(),
  body('reason')
    .if((value, { req }) => req.body.verified === false)
    .notEmpty().withMessage('Reason is required when document is rejected').bail()
    .trim()
    .isLength({ max: 500 }).withMessage('Reason must not exceed 500 characters'),
  body('suggestion')
    .if((value, { req }) => req.body.verified === false)
    .notEmpty().withMessage('Suggestion is required when document is rejected').bail()
    .trim()
    .isLength({ max: 500 }).withMessage('Suggestion must not exceed 500 characters'),
  body('reason')
    .if((value, { req }) => req.body.verified === true)
    .isEmpty().withMessage('Reason must be empty when document is verified'),
  body('suggestion')
    .if((value, { req }) => req.body.verified === true)
    .isEmpty().withMessage('Suggestion must be empty when document is verified'),
  validate
];

// Change password validation
exports.validateChangePassword = [
  body('currentPassword')
    .trim()
    .notEmpty().withMessage('Current password is required').bail(),
  body('newPassword')
    .trim()
    .notEmpty().withMessage('New password is required').bail()
    .isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  body('confirmPassword')
    .trim()
    .notEmpty().withMessage('Confirm password is required').bail()
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  validate
];

// Update document validation
exports.validateUpdateDocument = [
  param('documentId')
    .custom(value => isValidObjectId(value, 'Document ID')).bail(),
  body('file')
    .custom((value, { req }) => {
      if (!req.file) {
        throw new Error('File is required');
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        throw new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed');
      }
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (req.file.size > maxSize) {
        throw new Error('File size exceeds 5MB limit');
      }
      return true;
    }),
  validate
];