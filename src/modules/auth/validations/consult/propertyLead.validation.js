// validations/propertyLead/propertyLead.validation.js
const { body, query, param, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const mongoose = require('mongoose');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.path || e.param, message: e.msg }))
    });
  }
  next();
};

const isValidId = (val, field) => {
  if (!mongoose.Types.ObjectId.isValid(val)) throw new Error(`${field} is invalid`);
  return true;
};

exports.validateCreatePropertyLead = [
  body('type').isIn([
    'buy',
    'sell',
    'rent',
    'schedule_visit',
    'partner',
    'investor',
    'developer',
    'enquiry',
    'consultation'
  ]),

  body('name.first_name').notEmpty(),
  body('name.last_name').notEmpty(),
  body('email').isEmail(),
  body('mobile.number').matches(/^\d{8,15}$/),

  // Schedule visit
  body('occupation')
    .if(body('type').equals('schedule_visit'))
    .notEmpty(),

  body('location')
    .if(body('type').equals('schedule_visit'))
    .notEmpty(),

  // Partner / Investor / Developer
  body('company')
    .if(body('type').isIn(['partner', 'investor', 'developer']))
    .notEmpty(),

  body('message')
    .if(body('type').isIn(['partner', 'investor', 'developer', 'enquiry', 'consultation']))
    .notEmpty(),

  // Consultation
  body('consultant_type')
    .if(body('type').equals('consultation'))
    .isIn(['landscape', 'interior', 'architect', 'civil_engineer', 'other']),

  validate
];

// UPDATE
exports.validateUpdatePropertyLead = [
  param('id').custom(id => isValidId(id, 'PropertyLead ID')),
  // Optional fields...
  validate
];

// GET ALL
// GET ALL PROPERTY LEADS (ADMIN)
exports.validateGetPropertyLeads = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be >= 1'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('search')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Search cannot be empty'),

  query('status')
    .optional()
    .isIn(['submit', 'contacted', 'converted', 'dead'])
    .withMessage('Invalid status'),

  query('type')
    .optional()
    .isIn([
      'buy',
      'sell',
      'rent',
      'schedule_visit',
      'partner',
      'investor',
      'developer',
      'enquiry',
      'consultation'
    ])
    .withMessage('Invalid lead type'),

  validate
];

exports.validatePropertyLeadId = [
  param('id').custom(id => isValidId(id, 'PropertyLead ID')),
  validate
];