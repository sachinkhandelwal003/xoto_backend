// validations/consultant/consultant.validation.js
const { body, query, param, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Consultant = require('../../models/consultant/consult.model');
const mongoose = require('mongoose');

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

const isValidObjectId = (value, field) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`${field} must be a valid ObjectId`);
  }
  return true;
};

// CREATE
exports.validateCreateConsultant = [
  body('name.first_name')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('First name can only contain letters and spaces'),

  body('name.last_name')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ min: 1, max: 50 }).withMessage('Last name must be 1-50 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Last name can only contain letters and spaces'),

  body('mobile.country_code')
    .optional()
    .trim()
    .matches(/^\+\d{1,4}$/).withMessage('Country code must be in format +XXX'),

  body('mobile.number')
    .trim()
    .notEmpty().withMessage('Mobile number is required')
    .isLength({ min: 8, max: 15 }).withMessage('Mobile number must be 8-15 digits')
    ,

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email')
  ,

  body('status')
    .optional()
    .isIn(['submitted', 'contacted', 'qualified', 'not_qualified', 'converted', 'rejected'])
    .withMessage('Invalid status'),

  body('message')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Message too long'),

  body('follow_up_date')
    .optional()
    .isISO8601().withMessage('Follow up date must be a valid date'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes too long'),

  validate
];

// UPDATE
exports.validateUpdateConsultant = [
  param('id')
    .custom(value => isValidObjectId(value, 'Consultant ID')),

  body('name.first_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('First name can only contain letters and spaces'),

  body('name.last_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('Last name must be 1-50 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Last name can only contain letters and spaces'),

  body('mobile.country_code')
    .optional()
    .trim()
    .matches(/^\+\d{1,4}$/).withMessage('Country code must be in format +XXX'),

  body('mobile.number')
    .optional()
    .trim()
    .isLength({ min: 8, max: 15 }).withMessage('Mobile number must be 8-15 digits')
    .matches(/^\d+$/).withMessage('Mobile number must contain only digits')
    .custom(async (number, { req }) => {
      if (!number) return true;
      const countryCode = req.body.mobile?.country_code || '+91';
      const exists = await Consultant.findOne({
        'mobile.number': number,
        'mobile.country_code': countryCode,
        _id: { $ne: req.params.id },
        is_deleted: false
      });
      if (exists) throw new Error('Mobile number already exists');
      return true;
    }),

  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please enter a valid email')
    .custom(async (email, { req }) => {
      if (!email) return true;
      const exists = await Consultant.findOne({
        email: email.toLowerCase(),
        _id: { $ne: req.params.id },
        is_deleted: false
      });
      if (exists) throw new Error('Email already exists');
      return true;
    }),

  body('status')
    .optional()
    .isIn(['submitted', 'contacted', 'qualified', 'not_qualified', 'converted', 'rejected'])
    .withMessage('Invalid status'),

  body('message')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Message too long'),

  body('follow_up_date')
    .optional()
    .isISO8601().withMessage('Follow up date must be a valid date'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes too long'),

  body('is_active')
    .optional()
    .toBoolean()
    .isBoolean().withMessage('is_active must be boolean'),

  validate
];

// GET ALL
exports.validateGetConsultants = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be ≥1'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit 1-100'),

  query('search')
    .optional()
    .trim(),

  query('status')
    .optional()
    .isIn(['submitted', 'contacted', 'qualified', 'not_qualified', 'converted', 'rejected'])
    .withMessage('Invalid status'),

  query('active')
    .optional()
    .isIn(['true', 'false']).withMessage('active must be true/false'),

  query('is_deleted')
    .optional()
    .isIn(['true', 'false']).withMessage('is_deleted must be true/false'),

  validate
];

// PARAM ID
exports.validateConsultantId = [
  param('id')
    .custom(value => isValidObjectId(value, 'Consultant ID')),
  validate
];