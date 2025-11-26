const { body, query, param, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const VendorB2B = require('../../models/Vendor/B2bvendor.model');
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
    .notEmpty().withMessage('Mobile number is required')
    .isMobilePhone('any').withMessage('Invalid mobile number'),
  validate
];

// Verify OTP validation
exports.validateVerifyOtp = [
  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required')
    .isMobilePhone('any').withMessage('Invalid mobile number'),
  body('otp')
    .trim()
    .notEmpty().withMessage('OTP is required')
    .isLength({ min: 4, max: 6 }).withMessage('OTP must be between 4 and 6 digits'),
  validate
];

// Create vendor validation
exports.validateCreateVendor = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail()
    .custom(async (email) => {
      const existingVendor = await VendorB2B.findOne({ email });
      if (existingVendor) {
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
  body('full_name')
    .trim()
    .notEmpty().withMessage('Full name is required'),
  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required')
    .isMobilePhone('any').withMessage('Invalid mobile number')
    .custom(async (mobile) => {
      const existingVendor = await VendorB2B.findOne({ mobile });
      if (existingVendor) {
        throw new Error('Mobile number already in use');
      }
      return true;
    }),
  body('is_mobile_verified')
    .toBoolean()
    .isBoolean().withMessage('isMobileVerified must be boolean')
    .custom((value) => {
      if (!value) {
        throw new Error('Mobile must be verified');
      }
      return true;
    }),
  body('business_details.business_name')
    .trim()
    .notEmpty().withMessage('Business name is required'),
  body('business_details.business_description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Business description must not exceed 500 characters'),
  body('business_details.business_type')
    .notEmpty().withMessage('Business type is required')
    .isIn(['Individual', 'Private Limited', 'Partnership']).withMessage('Invalid business type'),
  body('business_details.business_address')
    .trim()
    .notEmpty().withMessage('Business address is required'),
  body('business_details.pickup_address')
    .trim()
    .notEmpty().withMessage('Pickup address is required'),
  body('business_details.pincode')
    .trim()
    .notEmpty().withMessage('Pincode is required'),
  body('registration.pan_number')
    .trim()
    .notEmpty().withMessage('PAN number is required'),
  body('registration.gstin')
    .optional()
    .trim(),
  body('bank_details.bank_account_number')
    .trim()
    .notEmpty().withMessage('Bank account number is required'),
  body('bank_details.ifsc_code')
    .trim()
    .notEmpty().withMessage('IFSC code is required'),
  body('bank_details.account_holder_name')
    .trim()
    .notEmpty().withMessage('Account holder name is required'),
  body('business_details.categories')
    .customSanitizer(value => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch (e) {
          return [];
        }
      }
      return value;
    })
    .isArray({ min: 1 }).withMessage('At least one category is required')
    .custom((categories) => {
      for (const category of categories) {
        if (!category.name || typeof category.name !== 'string') {
          throw new Error('Each category must have a valid name');
        }
        if (category.sub_categories && !Array.isArray(category.sub_categories)) {
          throw new Error('Sub-categories must be an array');
        }
      }
      return true;
    }),
  body('logo')
    .optional()
    .custom((value, { req }) => {
      if (req.files && req.files.logo) {
        const logoFile = req.files.logo[0];
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif'];
        const maxSize = 2 * 1024 * 1024; // 2MB

        if (!allowedTypes.includes(logoFile.mimetype)) {
          throw new Error('Logo must be an image (JPEG, PNG, JPG, GIF)');
        }

        if (logoFile.size > maxSize) {
          throw new Error('Logo size must be less than 2MB');
        }
      }
      return true;
    }),
  // Document validation
  body('documents')
    .custom((value, { req }) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
      const maxSize = 5 * 1024 * 1024; // 5MB
      const documentTypes = [
        'identityProof',
        'addressProof',
        'businessProof',
        'gstCertificate',
        'cancelledCheque',
        'additional',
      ];

      // Check if at least one document is provided
      if (!req.files || !Object.keys(req.files).some(key => documentTypes.includes(key))) {
        throw new Error('At least one document is required');
      }

      // Validate each document
      Object.keys(req.files).forEach(fileType => {
        if (documentTypes.includes(fileType)) {
          const files = Array.isArray(req.files[fileType]) ? req.files[fileType] : [req.files[fileType]];
          files.forEach(file => {
            if (!allowedTypes.includes(file.mimetype)) {
              throw new Error(`Document ${fileType} must be JPEG, PNG, or PDF`);
            }
            if (file.size > maxSize) {
              throw new Error(`Document ${fileType} size must be less than 5MB`);
            }
          });
        }
      });

      return true;
    }),
  body('meta.agreed_to_terms')
    .toBoolean()
    .isBoolean().withMessage('Agreed to terms must be boolean')
    .custom(value => {
      if (!value) {
        throw new Error('You must agree to the terms');
      }
      return true;
    }),
  validate
];

// Vendor login validation
exports.validateVendorLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
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
    .custom(value => isValidObjectId(value, 'Vendor ID')),
  validate
];

// Update vendor status validation
exports.validateUpdateVendorStatus = [
  param('id')
    .custom(value => isValidObjectId(value, 'Vendor ID')),
  body('status')
    .notEmpty().withMessage('Status is required')
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
    .custom(value => isValidObjectId(value, 'Vendor ID')),
  body('full_name')
    .optional()
    .trim()
    .notEmpty().withMessage('Full name cannot be empty'),
  body('mobile')
    .optional()
    .trim()
    .isMobilePhone('any').withMessage('Invalid mobile number')
    .custom(async (mobile, { req }) => {
      const vendor = await VendorB2B.findOne({ mobile, _id: { $ne: req.params.id } });
      if (vendor) {
        throw new Error('Mobile number already in use');
      }
      return true;
    }),
  body('business_details.business_name')
    .optional()
    .trim()
    .notEmpty().withMessage('Business name cannot be empty'),
  body('business_details.business_description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Business description must not exceed 500 characters'),
  body('business_details.business_type')
    .optional()
    .isIn(['Individual', 'Private Limited', 'Partnership']).withMessage('Invalid business type'),
  body('business_details.business_address')
    .optional()
    .trim()
    .notEmpty().withMessage('Business address cannot be empty'),
  body('business_details.pickup_address')
    .optional()
    .trim()
    .notEmpty().withMessage('Pickup address cannot be empty'),
  body('business_details.pincode')
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
  body('business_details.categories')
    .optional()
    .isArray({ min: 1 }).withMessage('At least one category is required')
    .custom((categories) => {
      for (const category of categories) {
        if (!category.name || typeof category.name !== 'string') {
          throw new Error('Each category must have a valid name');
        }
        if (category.sub_categories && !Array.isArray(category.sub_categories)) {
          throw new Error('Sub-categories must be an array');
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
    .notEmpty()
    .withMessage('Vendor ID is required')
    .custom((value) => isValidObjectId(value, 'Vendor ID')),
  body('documentId')
    .notEmpty()
    .withMessage('Document ID is required')
    .custom((value) => isValidObjectId(value, 'Document ID')),
  body('verified')
    .toBoolean()
    .isBoolean()
    .withMessage('Verified must be a boolean value'),
  body('reason')
    .if((value, { req }) => req.body.verified === false)
    .notEmpty()
    .withMessage('Reason is required when document is rejected')
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must not exceed 500 characters'),
  body('suggestion')
    .if((value, { req }) => req.body.verified === false)
    .notEmpty()
    .withMessage('Suggestion is required when document is rejected')
    .trim()
    .isLength({ max: 500 })
    .withMessage('Suggestion must not exceed 500 characters'),
  body('reason')
    .if((value, { req }) => req.body.verified === true)
    .isEmpty()
    .withMessage('Reason must be empty when document is verified'),
  body('suggestion')
    .if((value, { req }) => req.body.verified === true)
    .isEmpty()
    .withMessage('Suggestion must be empty when document is verified'),
  validate
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
  validate
];

// Update document validation
exports.validateUpdateDocument = [
  param('documentId')
    .custom(value => isValidObjectId(value, 'Document ID')),
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