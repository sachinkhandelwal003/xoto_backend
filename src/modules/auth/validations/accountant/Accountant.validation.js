// validations/freelancer/accountant.validation.js
const { body, query, param, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Accountant = require('../../models/accountant/Accountant.model');
const mongoose = require('mongoose');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.path || e.param, message: e.msg })),
    });
  }
  next();
};

const isValidObjectId = (value, field) => {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new Error(`${field} must be valid ObjectId`);
  return true;
};

/* CREATE */
exports.validateCreateAccountant = [
  body('email').trim().isEmail().custom(async email => {
    if (await Accountant.findOne({ email, is_deleted: false })) throw new Error('Email in use');
  }),
  body('password').isLength({ min: 6 }),
  body('confirm_password').custom((v, { req }) => v === req.body.password || 'Passwords do not match'),
  body('name.first_name').trim().isLength({ min: 2, max: 50 }),
  body('name.last_name').trim().isLength({ min: 2, max: 50 }),
  body('mobile').isMobilePhone('any').custom(async mobile => {
    if (await Accountant.findOne({ mobile, is_deleted: false })) throw new Error('Mobile in use');
  }),
  validate,
];

/* LOGIN */
exports.validateAccountantLogin = [
  body('email').trim().isEmail(),
  body('password').notEmpty(),
  validate,
];

/* GET ALL */
exports.validateGetAllAccountants = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('active').optional().isIn(['true', 'false']),
  validate,
];

/* PARAM ID */
exports.validateAccountantId = [
  param('id').custom(v => isValidObjectId(v, 'Accountant ID')),
  validate,
];