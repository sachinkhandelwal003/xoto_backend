const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Warehouse = require('../models/warehouse.model');

/* =========================
   COMMON VALIDATE HANDLER
========================= */
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

/* =========================
   OBJECT ID HELPER
========================= */
const isValidObjectId = (value, fieldName = 'ID') => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`${fieldName} must be a valid MongoDB ObjectId`);
  }
  return true;
};

/* =========================
   GET WAREHOUSES
========================= */
exports.validateGetWarehouses = [
  query('vendor_id')
    .optional()
    .custom(value => isValidObjectId(value, 'Vendor ID'))
    .bail(),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt()
    .bail(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt()
    .bail(),

  query('search')
    .optional()
    .trim()
    .isString()
    .withMessage('Search must be a string')
    .bail(),

  query('city')
    .optional()
    .trim()
    .isString()
    .withMessage('City must be a string')
    .bail(),

  query('state')
    .optional()
    .trim()
    .isString()
    .withMessage('State must be a string')
    .bail(),

  validate
];

/* =========================
   CREATE WAREHOUSE
========================= */

exports.validateCreateWarehouse = [
  body('name')
    .trim()
    .notEmpty().withMessage('Warehouse name is required')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters')
    .custom(async (name, { req }) => {
      const exists = await Warehouse.findOne({
        vendor: req.user.id,
        name
      });
      if (exists) {
        throw new Error('Warehouse name already exists for this vendor');
      }
      return true;
    }),

  body('code')
    .trim()
    .notEmpty().withMessage('Warehouse code is required')
    .custom(async (code, { req }) => {
      const exists = await Warehouse.findOne({
        vendor: req.user.id,
        code
      });
      if (exists) {
        throw new Error('Warehouse code already exists for this vendor');
      }
      return true;
    }),

  body('address').optional({ checkFalsy: true }).trim().isString(),
  body('city').optional({ checkFalsy: true }).trim().isString(),
  body('state').optional({ checkFalsy: true }).trim().isString(),
  body('country').optional({ checkFalsy: true }).trim().isString(),

  body('contact_person').optional({ checkFalsy: true }).trim().isString(),

  body('email')
    .optional({ checkFalsy: true })
    .isEmail().withMessage('Invalid email format'),

  body('capacity_units')
    .optional()
    .isInt({ min: 0 }).withMessage('Capacity units must be non-negative'),

  body('active')
    .optional()
    .isBoolean().withMessage('Active must be boolean'),

  /* ===== MOBILE ===== */
  body('mobile')
    .exists().withMessage('Mobile is required')
    .isObject().withMessage('Mobile must be an object'),

  body('mobile.country_code')
    .optional()
    .trim()
    .isString(),

  body('mobile.number')
    .exists().withMessage('Mobile number is required')
    .matches(/^\d{8,15}$/).withMessage('Mobile number must be 8–15 digits'),

  validate
];

/* =========================
   UPDATE WAREHOUSE
========================= */
exports.validateUpdateWarehouse = [
  param('id')
    .custom(value => isValidObjectId(value, 'Warehouse ID'))
    .bail(),

  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Warehouse name cannot be empty')
    .bail()
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters')
    .bail(),

  body('code')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Warehouse code cannot be empty')
    .bail(),

  body('address').optional().trim().isString().bail(),
  body('city').optional().trim().isString().bail(),
  body('state').optional().trim().isString().bail(),
  body('country').optional().trim().isString().bail(),

  body('contact_person').optional().trim().isString().bail(),
  body('email').optional().isEmail().bail(),

  body('capacity_units')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Capacity units must be non-negative')
    .bail(),

  body('active')
    .optional()
    .isBoolean()
    .withMessage('Active must be boolean')
    .bail(),

  /* MOBILE UPDATE (OPTIONAL BUT STRICT) */
  body('mobile')
    .optional()
    .isObject()
    .withMessage('Mobile must be an object')
    .bail(),

  body('mobile.country_code')
    .if(body('mobile').exists())
    .optional()
    .trim()
    .isString()
    .bail(),

  body('mobile.number')
    .if(body('mobile').exists())
    .exists()
    .withMessage('Mobile number is required when mobile is provided')
    .bail()
    .matches(/^\d{8,15}$/)
    .withMessage('Mobile number must be 8–15 digits')
    .bail(),

  validate
];

/* =========================
   DELETE WAREHOUSE
========================= */
exports.validateDeleteWarehouse = [
  param('id')
    .custom(value => isValidObjectId(value, 'Warehouse ID'))
    .bail(),
  validate
];

exports.validate = validate;
