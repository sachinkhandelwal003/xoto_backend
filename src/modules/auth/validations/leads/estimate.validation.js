// validations/leads/estimate.validation.js
const { body, param, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');

const Category = require('../../models/Freelancer/categoryfreelancer.model');
const Subcategory = require('../../models/Freelancer/subcategoryfreelancer.model');

// ---------------------- COMMON HELPERS ----------------------

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

// ------------------------------------------------------------
// CUSTOMER — SUBMIT ESTIMATE
// ------------------------------------------------------------
exports.validateSubmitEstimate = [
  body('customer_name')
    .trim().notEmpty().withMessage('Customer name is required'),

  body('customer_email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format'),

  body('customer_mobile')
    .notEmpty().withMessage('Mobile number is required')
    .matches(/^[6-9]\d{9}$/).withMessage('Invalid Indian mobile number'),

  body('category')
    .notEmpty().withMessage('Category is required')
    .custom(isValidObjectId)
    .custom(async id => {
      const exists = await Category.findById(id);
      if (!exists) throw new Error('Category not found');
      return true;
    }),

  body('subcategories')
    .optional().isArray().withMessage('Subcategories must be an array')
    .custom(async arr => {
      for (const id of arr) {
        if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid subcategory ID');
        const exists = await Subcategory.findById(id);
        if (!exists) throw new Error(`Subcategory not found: ${id}`);
      }
      return true;
    }),

  body('description')
    .notEmpty().withMessage('Description is required'),

  validate,
];

// ------------------------------------------------------------
// SUPERADMIN — ASSIGN TO SUPERVISOR
// ------------------------------------------------------------
exports.validateAssignSupervisor = [
  param('id').custom(id => isValidObjectId(id, 'Estimate ID')),

  body('supervisor_id')
    .notEmpty().withMessage('Supervisor ID is required')
    .custom(id => isValidObjectId(id, 'Supervisor ID')),

  validate,
];

// ------------------------------------------------------------
// SUPERVISOR — SEND TO FREELANCERS
// ------------------------------------------------------------
exports.validateSendToFreelancers = [
  param('id').custom(id => isValidObjectId(id, 'Estimate ID')),

  body('freelancer_ids')
    .isArray({ min: 1 }).withMessage('freelancer_ids must be a non-empty array'),

  body('freelancer_ids.*')
    .custom(id => isValidObjectId(id, 'Freelancer ID')),

  validate,
];

// ------------------------------------------------------------
exports.validateSubmitQuotation = [
  param('id').custom(id => isValidObjectId(id, 'Estimate ID')),

  // Items array validation
  body('items')
    .isArray({ min: 1 }).withMessage('At least one item is required'),

  body('items.*.sno')
    .isInt({ min: 1 }).withMessage('S.No must be a positive number'),

  body('items.*.item')
    .notEmpty().withMessage('Item name is required')
    .isString().withMessage('Item must be a string'),

  body('items.*.description')
    .optional()
    .isString().withMessage('Description must be a string'),

  body('items.*.unit')
    .notEmpty().withMessage('Unit is required (e.g., sq.ft, pcs, lumpsum)')
    .isString().withMessage('Unit must be a string'),

  body('items.*.quantity')
    .notEmpty().withMessage('Quantity is required')
    .isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0'),

  body('items.*.unit_price')
    .notEmpty().withMessage('Unit price is required')
    .isFloat({ min: 0 }).withMessage('Unit price cannot be negative'),

  // Optional: you can remove total from frontend, backend will calculate
  body('items.*.total')
    .optional()
    .isFloat({ min: 0 }).withMessage('Total must be a valid number'),

  // Scope of Work
  body('scope_of_work')
    .notEmpty().withMessage('Scope of work is required'),

  // Discount (optional)
  body('discount_percent')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Discount must be between 0 and 100%'),

  validate,
];

// ------------------------------------------------------------
// SUPERVISOR — CREATE FINAL QUOTATION (With Line Items)
// ------------------------------------------------------------
exports.validateCreateFinalQuotation = [
  param('id').custom(id => isValidObjectId(id, 'Estimate ID')),

  body('items')
    .isArray({ min: 1 }).withMessage('At least one item is required in final quotation'),

  body('items.*.sno')
    .isInt({ min: 1 }).withMessage('S.No is required and must be valid'),

  body('items.*.item')
    .notEmpty().withMessage('Item name is required'),

  body('items.*.description')
    .optional()
    .isString(),

  body('items.*.unit')
    .notEmpty().withMessage('Unit is required'),

  body('items.*.quantity')
    .notEmpty().withMessage('Quantity is required')
    .isFloat({ min: 0.01 }).withMessage('Quantity must be > 0'),

  body('items.*.unit_price')
    .notEmpty().withMessage('Unit price is required')
    .isFloat({ min: 0 }).withMessage('Unit price cannot be negative'),

  body('scope_of_work')
    .notEmpty().withMessage('Scope of work is mandatory for final quotation')
,
  body('discount_percent')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Discount percent must be 0–100'),

  validate,
];

// ------------------------------------------------------------
// SUPERADMIN — APPROVE FINAL QUOTATION
// (NO quotation_id sent — final_quotation stored already)
// ------------------------------------------------------------
exports.validateApproveFinalQuotation = [
  param('id').custom(id => isValidObjectId(id, 'Estimate ID')),
  validate,
];

// ------------------------------------------------------------
// CUSTOMER — RESPONSE
// ------------------------------------------------------------
exports.validateCustomerResponse = [
  param('id').custom(id => isValidObjectId(id, 'Estimate ID')),

  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['accepted', 'rejected']).withMessage('Status must be accepted/rejected'),

  body('reason')
    .optional()
    .isString().withMessage('Reason must be a string'),

  validate,
];
