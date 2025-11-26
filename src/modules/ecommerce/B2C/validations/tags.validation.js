const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Tag = require('../models/tags.model');
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

exports.validateCreateTag = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .custom(async (name) => {
      const existingTag = await Tag.findOne({ name });
      if (existingTag) {
        throw new Error('Tag name already in use');
      }
      return true;
    }),
  body('description')
    .optional()
    .trim()
    .isString().withMessage('Description must be a string'),
  validate
];

exports.validateUpdateTag = [
  param('id')
    .custom(value => isValidObjectId(value, 'Tag ID')),
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Name cannot be empty')
    .custom(async (name, { req }) => {
      const existingTag = await Tag.findOne({ name, _id: { $ne: req.params.id } });
      if (existingTag) {
        throw new Error('Tag name already in use');
      }
      return true;
    }),
  body('description')
    .optional()
    .trim()
    .isString().withMessage('Description must be a string'),
  validate
];

exports.validateGetAllTags = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1 }).withMessage('Limit must be a positive integer'),
  validate
];

exports.validateTagId = [
  param('id')
    .custom(value => isValidObjectId(value, 'Tag ID')),
  validate
];