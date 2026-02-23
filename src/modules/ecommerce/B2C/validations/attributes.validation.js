const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Attribute = require('../models/attributes.model');
const mongoose = require('mongoose');

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

const isValidObjectId = (value, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`${fieldName} must be a valid MongoDB ObjectId`);
  }
  return true;
};

exports.validateCreateAttribute = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .custom(async (name) => {
      const existingAttribute = await Attribute.findOne({ name });
      if (existingAttribute) {
        throw new Error('Attribute name already in use');
      }
      return true;
    }),
  body('values')
    .optional()
    .isArray().withMessage('Values must be an array')
    .custom(values => {
      if (values.length > 0) {
        values.forEach(value => {
          if (typeof value !== 'string') {
            throw new Error('Each value must be a string');
          }
        });
      }
      return true;
    }),
  validate
];

exports.validateUpdateAttribute = [
  param('id')
    .custom(value => isValidObjectId(value, 'Attribute ID')),
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Name cannot be empty')
    .custom(async (name, { req }) => {
      const existingAttribute = await Attribute.findOne({ name, _id: { $ne: req.params.id } });
      if (existingAttribute) {
        throw new Error('Attribute name already in use');
      }
      return true;
    }),
  body('values')
    .optional()
    .isArray().withMessage('Values must be an array')
    .custom(values => {
      if (values.length > 0) {
        values.forEach(value => {
          if (typeof value !== 'string') {
            throw new Error('Each value must be a string');
          }
        });
      }
      return true;
    }),
  validate
];

exports.validateGetAllAttributes = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1 }).withMessage('Limit must be a positive integer'),
  validate
];

exports.validateAttributeId = [
  param('id')
    .custom(value => isValidObjectId(value, 'Attribute ID')),
  validate
];