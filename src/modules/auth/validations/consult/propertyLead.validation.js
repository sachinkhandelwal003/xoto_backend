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

// CREATE (Public)
exports.validateCreatePropertyLead = [
  body('type').isIn(['buy','sell','rent','schedule_visit','partner','investor','developer']).withMessage('Invalid lead type'),

  // Always required
  body('name.first_name').trim().notEmpty().withMessage('First name required'),
  body('name.last_name').trim().notEmpty().withMessage('Last name required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('mobile.number').matches(/^\d{8,15}$/).withMessage('Valid mobile number required'),

  // Conditional validations

  body('occupation').if(body('type').equals('schedule_visit')).notEmpty(),
  body('location').if(body('type').equals('schedule_visit')).notEmpty(),

  body('company').if(body('type').isIn(['partner','investor','developer'])).notEmpty(),
  body('stakeholder_type').if(body('type').equals('partner')).notEmpty(),
  body('message').if(body('type').isIn(['partner','investor','developer'])).notEmpty(),

  validate
];

// UPDATE
exports.validateUpdatePropertyLead = [
  param('id').custom(id => isValidId(id, 'PropertyLead ID')),
  // Optional fields...
  validate
];

// GET ALL
exports.validateGetPropertyLeads = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('status').optional().isIn(['submit', 'contacted']),
  query('type').optional().isIn(['buy', 'sell', 'schedule_visit','rent', 'partner']),
  validate
];

exports.validatePropertyLeadId = [
  param('id').custom(id => isValidId(id, 'PropertyLead ID')),
  validate
];