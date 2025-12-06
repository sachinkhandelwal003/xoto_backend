// validations/enquiry/enquiry.validation.js
const { body, query, param, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Enquiry = require('../../models/consultant/enquiry.model');
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

// CREATE (Public Form)
exports.validateCreateEnquiry = [
  body('name.first_name').trim().notEmpty().withMessage('First name required'),
  body('name.last_name').trim().notEmpty().withMessage('Last name required'),
  body('mobile.number').trim().notEmpty().matches(/^\d{8,15}$/).withMessage('Valid mobile number required'),
  body('email').trim().isEmail().withMessage('Valid email required'),
  body('message').optional().trim().isLength({ max: 2000 }),
  body('preferred_contact').optional().isIn(['phone', 'email', 'whatsapp']),
  validate
];

// UPDATE
exports.validateUpdateEnquiry = [
  param('id').custom(id => isValidId(id, 'Enquiry ID')),
  body('status').optional().isIn(['submit', 'contacted']),
  body('follow_up_date').optional().isISO8601(),
  body('notes.*.text').optional().trim(),
  validate
];

// GET ALL
exports.validateGetEnquiries = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('status').optional().isIn(['submit', 'contacted']),
  validate
];

exports.validateEnquiryId = [
  param('id').custom(id => isValidId(id, 'Enquiry ID')),
  validate
];