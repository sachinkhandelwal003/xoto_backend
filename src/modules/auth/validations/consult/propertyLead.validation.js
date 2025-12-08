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
  body('type').notEmpty().isIn(['buy', 'sell', 'schedule_visit']),

  body('name.first_name').trim().notEmpty(),
  body('name.last_name').trim().notEmpty(),
  body('mobile.number').trim().notEmpty().matches(/^\d{8,15}$/),
  body('email').trim().isEmail(),

  body('preferred_contact').optional().isIn(['call', 'whatsapp', 'email']),

  // Conditional based on type
  body('desired_bedrooms').if(body('type').equals('buy')).notEmpty(),
  body('listing_type').if(body('type').equals('sell')).notEmpty(),
  body('city').if(body('type').equals('sell')).notEmpty(),
  // Add others as needed...

  body('occupation').if(body('type').equals('schedule_visit')).notEmpty(),
  body('location').if(body('type').equals('schedule_visit')).notEmpty(),

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
  query('type').optional().isIn(['buy', 'sell', 'schedule_visit']),
  validate
];

exports.validatePropertyLeadId = [
  param('id').custom(id => isValidId(id, 'PropertyLead ID')),
  validate
];