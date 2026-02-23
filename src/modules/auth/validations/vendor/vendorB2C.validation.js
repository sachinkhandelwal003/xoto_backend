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


// exports.validateCreateVendor = [

//   // ===============================
//   // NAME
//   // ===============================
//   body('first_name')
//     .trim()
//     .notEmpty().withMessage('First name is required').bail(),

//   body('last_name')
//     .trim()
//     .notEmpty().withMessage('Last name is required').bail(),

//   // ===============================
//   // EMAIL
//   // ===============================
//   body('email')
//     .trim()
//     .isEmail().withMessage('Valid email is required').bail()
//     .normalizeEmail()
//     .custom(async (email) => {
//       const exists = await VendorB2C.findOne({ email });
//       if (exists) throw new Error('Email already in use');
//     }),

//   // ===============================
//   // MOBILE
//   // ===============================
//   body('mobile.number')
//     .notEmpty().withMessage('Mobile number is required').bail()
//     .isNumeric().withMessage('Mobile must be numeric').bail()
//     .isLength({ min: 8, max: 15 }).withMessage('Invalid mobile length').bail()
//     .custom(async (number) => {
//       const exists = await VendorB2C.findOne({ 'mobile.number': number });
//       if (exists) throw new Error('Mobile already registered');
//     }),

//   body('mobile.country_code')
//     .optional()
//     .isNumeric().withMessage('Invalid country code'),

//   // ===============================
//   // PASSWORD
//   // ===============================
//   body('password')
//     .isLength({ min: 6 }).withMessage('Password must be at least 6 characters').bail(),

//   body('confirmPassword')
//     .custom((value, { req }) => {
//       if (value !== req.body.password) throw new Error('Passwords do not match');
//       return true;
//     }),

//   // ===============================
//   // STORE DETAILS
//   // ===============================
//   body('store_details.store_name')
//     .trim()
//     .notEmpty().withMessage('Store name is required').bail(),

//   body('store_details.store_type')
//     .isIn(['Individual / Sole Proprietor', 'Private Limited', 'Partnership'])
//     .withMessage('Invalid business type').bail(),

//   body('store_details.store_address')
//     .trim()
//     .notEmpty().withMessage('Store address is required').bail(),

//   body('store_details.city')
//     .trim()
//     .notEmpty().withMessage('City is required').bail(),

//   body('store_details.pincode')
//     .trim()
//     .notEmpty().withMessage('Pincode is required').bail(),

//   body('store_details.categories')
//     .isArray({ min: 1 })
//     .withMessage('At least one category is required').bail(),

//   // ===============================
//   // REGISTRATION
//   // ===============================
//   // body('registration.pan_number')
//   //   .trim()
//   //   .notEmpty().withMessage('PAN is required').bail()
//   //   .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
//   //   .withMessage('Invalid PAN format').bail(),

//  body('registration.gstin')
//   .optional({ checkFalsy: true }) // ✅ ignores "", null, undefined
//   .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
//   .withMessage('Invalid GSTIN format')
// ,

//   // ===============================
//   // LOGO FILE
//   // ===============================
//   body('logo')
//     .optional()
//     .custom((_, { req }) => {
//       if (!req.files?.logo) return true;

//       const f = req.files.logo[0];
//       const allowed = ['image/jpeg', 'image/jpg', 'image/png'];

//       if (!allowed.includes(f.mimetype))
//         throw new Error('Logo must be JPG/PNG');

//       if (f.size > 2 * 1024 * 1024)
//         throw new Error('Logo must be < 2MB');

//       return true;
//     }),

//   // ===============================
//   // IDENTITY PROOF (OPTIONAL)
//   // ===============================
//   body('identityProof')
//     .optional()
//     .bail()
//     .custom((_, { req }) => {
//       if (!req.files?.identityProof) return true;

//       const f = req.files.identityProof[0];
//       const allowed = ['image/jpeg', 'image/png', 'application/pdf'];

//       if (!allowed.includes(f.mimetype))
//         throw new Error('Identity proof: only JPG, PNG, PDF allowed');

//       if (f.size > 5 * 1024 * 1024)
//         throw new Error('Identity proof too large');

//       return true;
//     }),

//   // ===============================
//   // ADDRESS PROOF (OPTIONAL)
//   // ===============================
//   body('addressProof')
//     .optional()
//     .bail()
//     .custom((_, { req }) => {
//       if (!req.files?.addressProof) return true;

//       const f = req.files.addressProof[0];
//       const allowed = ['image/jpeg', 'image/png', 'application/pdf'];

//       if (!allowed.includes(f.mimetype))
//         throw new Error('Address proof: only JPG, PNG, PDF allowed');

//       if (f.size > 5 * 1024 * 1024)
//         throw new Error('Address proof too large');

//       return true;
//     }),

//   // ===============================
//   // TERMS & CONDITIONS
//   // ===============================
//   body('meta.agreed_to_terms')
//     .custom((value) => {
//       if (value !== true && value !== 'true') {
//         throw new Error('You must agree to terms & conditions');
//       }
//       return true;
//     }),

//   validate
// ];



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

// Update document verification validation (FIXED)
exports.validateUpdateDocumentVerification = [
  body('vendorId')
    .notEmpty().withMessage('Vendor ID is required')
    .bail()
    .custom((value) => isValidObjectId(value, 'Vendor ID'))
    .bail(),

  body('documentField')
    .notEmpty().withMessage('Document field is required')
    .bail()
    .isString().withMessage('Document field must be a string')
    .bail()
    .isIn([
      'identity_proof',
      'address_proof',
      'pan_card',
      'gst_certificate',
      'cancelled_cheque',
      'shop_act_license'
    ])
    .withMessage('Invalid document field'),

  body('verified')
    .notEmpty().withMessage('Verified value is required')
    .bail()
    .isBoolean().withMessage('Verified must be true or false'),

  body('reason')
    .if((value, { req }) => req.body.verified === false)
    .notEmpty().withMessage('Reason is required when rejecting document')
    .isLength({ max: 500 }).withMessage('Reason must not exceed 500 characters'),

  body('suggestion')
    .if((value, { req }) => req.body.verified === false)
    .notEmpty().withMessage('Suggestion is required when rejecting document')
    .isLength({ max: 500 }).withMessage('Suggestion must not exceed 500 characters'),

  body('reason')
    .if((value, { req }) => req.body.verified === true)
    .custom((v) => !v)
    .withMessage('Reason must be empty when document is approved'),

  body('suggestion')
    .if((value, { req }) => req.body.verified === true)
    .custom((v) => !v)
    .withMessage('Suggestion must be empty when document is approved'),

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