// modules/tax/validations/tax.validation.js
const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Tax = require('../../models/tax/tax.model');
const mongoose = require('mongoose');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      statusCode: StatusCodes.BAD_REQUEST,
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

// Custom validator for MongoDB ObjectId
const isValidObjectId = (value, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`${fieldName} must be a valid MongoDB ObjectId`);
  }
  return true;
};

// Custom validator to check if tax exists
const checkTaxExistence = async (taxId) => {
  const tax = await Tax.findById(taxId);
  if (!tax) {
    throw new Error('Tax not found');
  }
  return true;
};

// Validation for creating a tax
exports.validateCreateTax = [
  body('taxName')
    .trim()
    .notEmpty()
    .withMessage('Tax name is required')
    .bail()
    .isString()
    .withMessage('Tax name must be a string')
    .bail()
    .matches(/^[a-zA-Z0-9\s\-&]+$/)
    .withMessage('Tax name can only contain letters, numbers, spaces, hyphens, and ampersands')
    .bail()
    .isLength({ max: 50 })
    .withMessage('Tax name cannot exceed 50 characters')
    .bail()
    .custom(async (taxName) => {
      const existingTax = await Tax.findOne({ taxName });
      if (existingTax) {
        throw new Error('Tax with this name already exists');
      }
      return true;
    })
    .bail(),
  body('rate')
    .notEmpty()
    .withMessage('Tax rate is required')
    .bail()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax rate must be a number between 0 and 100')
    .bail(),
  validate,
];

// Validation for updating a tax
exports.validateUpdateTax = [
  param('taxId')
    .custom((value) => isValidObjectId(value, 'Tax ID'))
    .bail()
    .custom(checkTaxExistence)
    .bail(),
  body('taxName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Tax name cannot be empty')
    .bail()
    .isString()
    .withMessage('Tax name must be a string')
    .bail()
    .matches(/^[a-zA-Z0-9\s\-&]+$/)
    .withMessage('Tax name can only contain letters, numbers, spaces, hyphens, and ampersands')
    .bail()
    .isLength({ max: 50 })
    .withMessage('Tax name cannot exceed 50 characters')
    .bail()
    .custom(async (taxName, { req }) => {
      const existingTax = await Tax.findOne({
        taxName,
        _id: { $ne: req.params.taxId },
      });
      if (existingTax) {
        throw new Error('Tax with this name already exists');
      }
      return true;
    })
    .bail(),
  body('rate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax rate must be a number between 0 and 100')
    .bail(),
  body('status')
    .optional()
    .isIn([0, 1])
    .withMessage('Status must be either 0 (inactive) or 1 (active)')
    .bail(),
  validate,
];

// Validation for soft deleting a tax
exports.validateSoftDeleteTax = [
  param('taxId')
    .custom((value) => isValidObjectId(value, 'Tax ID'))
    .bail()
    .custom(checkTaxExistence)
    .bail()
    .custom(async (taxId) => {
      const tax = await Tax.findById(taxId);
      if (tax.status === 0) {
        throw new Error('Tax is already deleted');
      }
      return true;
    })
    .bail(),
  validate,
];

// Validation for permanent deleting a tax
exports.validatePermanentDeleteTax = [
  param('taxId')
    .custom((value) => isValidObjectId(value, 'Tax ID'))
    .bail()
    .custom(checkTaxExistence)
    .bail()
    .custom(async (taxId) => {
      const tax = await Tax.findById(taxId);
      if (tax.status === 1) {
        throw new Error('Tax must be soft deleted before permanent deletion');
      }
      return true;
    })
    .bail(),
  validate,
];

// Validation for restoring a tax
exports.validateRestoreTax = [
  param('taxId')
    .custom((value) => isValidObjectId(value, 'Tax ID'))
    .bail()
    .custom(checkTaxExistence)
    .bail()
    .custom(async (taxId) => {
      const tax = await Tax.findById(taxId);
      if (tax.status === 1) {
        throw new Error('Tax is already active');
      }
      return true;
    })
    .bail(),
  validate,
];

// Validation for getting a single tax
exports.validateGetTax = [
  param('taxId')
    .custom((value) => isValidObjectId(value, 'Tax ID'))
    .bail()
    .custom(checkTaxExistence)
    .bail(),
  validate,
];

// Validation for getting all taxes
exports.validateGetAllTaxes = [
  query('status')
    .optional()
    .isIn(['0', '1'])
    .withMessage('Status must be either "0" or "1"')
    .bail(),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .bail(),
  query('limit')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Limit must be a positive integer')
    .bail(),
  validate,
];