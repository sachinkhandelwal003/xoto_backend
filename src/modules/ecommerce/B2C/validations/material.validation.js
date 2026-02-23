
const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const Material = require('../models/material.model');
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

exports.validateCreateMaterial = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .custom(async (name) => {
      const existingMaterial = await Material.findOne({ name, status: { $ne: 0 } });
      if (existingMaterial) {
        throw new Error('Material name already in use');
      }
      return true;
    }),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
  body('properties')
    .optional()
    .isArray().withMessage('Properties must be an array')
    .custom(properties => {
      if (properties.length > 0) {
        properties.forEach(prop => {
          if (typeof prop !== 'string') {
            throw new Error('Each property must be a string');
          }
        });
      }
      return true;
    }),
  validate
];

exports.validateUpdateMaterial = [
  param('id')
    .custom(value => isValidObjectId(value, 'Material ID')),
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Name cannot be empty')
    .custom(async (name, { req }) => {
      const existingMaterial = await Material.findOne({ name, _id: { $ne: req.params.id }, status: { $ne: 0 } });
      if (existingMaterial) {
        throw new Error('Material name already in use');
      }
      return true;
    }),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
  body('properties')
    .optional()
    .isArray().withMessage('Properties must be an array')
    .custom(properties => {
      if (properties.length > 0) {
        properties.forEach(prop => {
          if (typeof prop !== 'string') {
            throw new Error('Each property must be a string');
          }
        });
      }
      return true;
    }),
  validate
];

exports.validateGetAllMaterials = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1 }).withMessage('Limit must be a positive integer'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Search term must not exceed 100 characters'),
  query('status')
    .optional()
    .isIn([0, 1]).withMessage('Status must be 0 (deleted) or 1 (active)'),
  validate
];

exports.validateMaterialId = [
  param('id')
    .custom(value => isValidObjectId(value, 'Material ID')),
  validate
];