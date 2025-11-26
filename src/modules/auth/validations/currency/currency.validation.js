const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Currency = require('../../models/currency/currency.model');
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

// Custom validator to check if currency exists
const checkCurrencyExistence = async (currencyId) => {
  const currency = await Currency.findById(currencyId);
  if (!currency) {
    throw new Error('Currency not found');
  }
  return true;
};

// Validation for creating a currency
exports.validateCreateCurrency = [
  body('code')
    .trim()
    .notEmpty()
    .withMessage('Currency code is required')
    .bail()
    .isString()
    .withMessage('Currency code must be a string')
    .bail()
    .matches(/^[A-Z]{3}$/)
    .withMessage('Currency code must be a 3-letter ISO 4217 code (e.g., USD)')
    .bail()
    .custom(async (code) => {
      const existingCurrency = await Currency.findOne({ code });
      if (existingCurrency) {
        throw new Error('A currency with this code already exists');
      }
      return true;
    })
    .bail(),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Currency name is required')
    .bail()
    .isString()
    .withMessage('Currency name must be a string')
    .bail()
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Currency name can only contain letters and spaces')
    .bail()
    .isLength({ max: 50 })
    .withMessage('Currency name cannot exceed 50 characters')
    .bail(),
  body('symbol')
    .trim()
    .notEmpty()
    .withMessage('Currency symbol is required')
    .bail()
    .isString()
    .withMessage('Currency symbol must be a string')
    .bail()
    .isLength({ max: 10 })
    .withMessage('Currency symbol cannot exceed 10 characters')
    .bail()
    .custom(async (symbol) => {
      const existingCurrency = await Currency.findOne({ symbol });
      if (existingCurrency) {
        throw new Error('A currency with this symbol already exists');
      }
      return true;
    })
    .bail(),
  body('exchangeRate')
    .notEmpty()
    .withMessage('Exchange rate is required')
    .bail()
    .isFloat({ min: 0 })
    .withMessage('Exchange rate must be a positive number')
    .bail()
    .custom((value) => {
      if (value && value.toString().split('.')[1]?.length > 4) {
        throw new Error('Exchange rate cannot have more than 4 decimal places');
      }
      return true;
    })
    .bail(),
  body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('Default status must be a boolean')
    .bail(),
  validate,
];

// Validation for updating a currency
exports.validateUpdateCurrency = [
  param('currencyId')
    .custom((value) => isValidObjectId(value, 'Currency ID'))
    .bail()
    .custom(checkCurrencyExistence)
    .bail(),
  body('code')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Currency code cannot be empty')
    .bail()
    .isString()
    .withMessage('Currency code must be a string')
    .bail()
    .matches(/^[A-Z]{3}$/)
    .withMessage('Currency code must be a 3-letter ISO 4217 code (e.g., USD)')
    .bail()
    .custom(async (code, { req }) => {
      const existingCurrency = await Currency.findOne({
        code,
        _id: { $ne: req.params.currencyId },
      });
      if (existingCurrency) {
        throw new Error('A currency with this code already exists');
      }
      return true;
    })
    .bail(),
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Currency name cannot be empty')
    .bail()
    .isString()
    .withMessage('Currency name must be a string')
    .bail()
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Currency name can only contain letters and spaces')
    .bail()
    .isLength({ max: 50 })
    .withMessage('Currency name cannot exceed 50 characters')
    .bail(),
  body('symbol')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Currency symbol cannot be empty')
    .bail()
    .isString()
    .withMessage('Currency symbol must be a string')
    .bail()
    .isLength({ max: 10 })
    .withMessage('Currency symbol cannot exceed 10 characters')
    .bail()
    .custom(async (symbol, { req }) => {
      const existingCurrency = await Currency.findOne({
        symbol,
        _id: { $ne: req.params.currencyId },
      });
      if (existingCurrency) {
        throw new Error('A currency with this symbol already exists');
      }
      return true;
    })
    .bail(),
  body('exchangeRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Exchange rate must be a positive number')
    .bail()
    .custom((value) => {
      if (value && value.toString().split('.')[1]?.length > 4) {
        throw new Error('Exchange rate cannot have more than 4 decimal places');
      }
      return true;
    })
    .bail(),
  body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('Default status must be a boolean')
    .bail(),
  body('status')
    .optional()
    .isIn([0, 1])
    .withMessage('Status must be either 0 (inactive) or 1 (active)')
    .bail(),
  validate,
];

// Validation for soft deleting a currency
exports.validateSoftDeleteCurrency = [
  param('currencyId')
    .custom((value) => isValidObjectId(value, 'Currency ID'))
    .bail()
    .custom(checkCurrencyExistence)
    .bail()
    .custom(async (currencyId) => {
      const currency = await Currency.findById(currencyId);
      if (currency.status === 0) {
        throw new Error('Currency is already inactive');
      }
      if (currency.isDefault) {
        throw new Error('Cannot soft delete the default currency');
      }
      return true;
    })
    .bail(),
  validate,
];

// Validation for permanent deleting a currency
exports.validatePermanentDeleteCurrency = [
  param('currencyId')
    .custom((value) => isValidObjectId(value, 'Currency ID'))
    .bail()
    .custom(checkCurrencyExistence)
    .bail()
    .custom(async (currencyId) => {
      const currency = await Currency.findById(currencyId);
      if (currency.status === 1) {
        throw new Error('Currency must be soft deleted before permanent deletion');
      }
      if (currency.isDefault) {
        throw new Error('Cannot permanently delete the default currency');
      }
      return true;
    })
    .bail(),
  validate,
];

// Validation for restoring a currency
exports.validateRestoreCurrency = [
  param('currencyId')
    .custom((value) => isValidObjectId(value, 'Currency ID'))
    .bail()
    .custom(checkCurrencyExistence)
    .bail()
    .custom(async (currencyId) => {
      const currency = await Currency.findById(currencyId);
      if (currency.status === 1) {
        throw new Error('Currency is already active');
      }
      return true;
    })
    .bail(),
  validate,
];

// Validation for getting a single currency
exports.validateGetCurrency = [
  param('currencyId')
    .custom((value) => isValidObjectId(value, 'Currency ID'))
    .bail()
    .custom(checkCurrencyExistence)
    .bail(),
  validate,
];

// Validation for getting all currencies
exports.validateGetAllCurrencies = [
  query('status')
    .optional()
    .isIn(['0', '1'])
    .withMessage('Status must be either "0" or "1"')
    .bail(),
  query('isDefault')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('isDefault must be either "true" or "false"')
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