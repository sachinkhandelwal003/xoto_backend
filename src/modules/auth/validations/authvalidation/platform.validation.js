// modules/auth/validations/role/platform.validation.js
const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { Platform, Role } = require('../../models/role/role.model');
const mongoose = require('mongoose');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      statusCode: StatusCodes.BAD_REQUEST,
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

// Custom validator for MongoDB ObjectId
const isValidObjectId = (value, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`${fieldName} must be a valid MongoDB ObjectId`);
  }
  return true;
};

// Custom validator to check if platform exists
const checkPlatformExistence = async (platformId) => {
  const platform = await Platform.findById(platformId);
  if (!platform) {
    throw new Error('Platform not found');
  }
  return true;
};

// Validation for creating a platform
exports.validateCreatePlatform = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .bail()
    .isLength({ max: 50 })
    .withMessage('Name cannot exceed 50 characters')
    .bail()
    .custom(async (name) => {
      const existingPlatform = await Platform.findOne({ name });
      if (existingPlatform) {
        throw new Error('Platform with this name already exists');
      }
      return true;
    })
    .bail(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Description cannot exceed 300 characters')
    .bail(),
  validate,
];

// Validation for updating a platform
exports.validateUpdatePlatform = [
  param('platformId')
    .custom((value) => isValidObjectId(value, 'Platform ID'))
    .bail()
    .custom(checkPlatformExistence)
    .bail(),
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .bail()
    .isLength({ max: 50 })
    .withMessage('Name cannot exceed 50 characters')
    .bail()
    .custom(async (name, { req }) => {
      const existingPlatform = await Platform.findOne({ name, _id: { $ne: req.params.platformId } });
      if (existingPlatform) {
        throw new Error('Platform with this name already exists');
      }
      return true;
    })
    .bail(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Description cannot exceed 300 characters')
    .bail(),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
    .bail(),
  validate,
];

// Validation for soft deleting a platform
exports.validateDeletePlatform = [
  param('platformId')
    .custom((value) => isValidObjectId(value, 'Platform ID'))
    .bail()
    .custom(checkPlatformExistence)
    .bail()
    .custom(async (platformId) => {
      const platform = await Platform.findById(platformId);
      if (!platform.isActive) {
        throw new Error('Platform is already deleted');
      }
      const hasRoles = await Role.exists({ category: platformId, isActive: true });
      if (hasRoles) {
        throw new Error('Cannot delete platform with associated active roles');
      }
      return true;
    })
    .bail(),
  validate,
];

// Validation for permanent deleting a platform
exports.validatePermanentDeletePlatform = [
  param('platformId')
    .custom((value) => isValidObjectId(value, 'Platform ID'))
    .bail()
    .custom(checkPlatformExistence)
    .bail()
    .custom(async (platformId) => {
      const platform = await Platform.findById(platformId);
      if (platform.isActive) {
        throw new Error('Platform must be soft deleted before permanent deletion');
      }
      const hasRoles = await Role.exists({ category: platformId });
      if (hasRoles) {
        throw new Error('Cannot permanently delete platform with associated roles');
      }
      return true;
    })
    .bail(),
  validate,
];

// Validation for restoring a platform
exports.validateRestorePlatform = [
  param('platformId')
    .custom((value) => isValidObjectId(value, 'Platform ID'))
    .bail()
    .custom(checkPlatformExistence)
    .bail()
    .custom(async (platformId) => {
      const platform = await Platform.findById(platformId);
      if (platform.isActive) {
        throw new Error('Platform is already active');
      }
      return true;
    })
    .bail(),
  validate,
];

// Validation for getting a single platform
exports.validateGetPlatform = [
  param('platformId')
    .custom((value) => isValidObjectId(value, 'Platform ID'))
    .bail()
    .custom(checkPlatformExistence)
    .bail(),
  validate,
];

// Validation for getting all platforms
exports.validateGetAllPlatforms = [
  query('isActive')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('isActive must be either "true" or "false"')
    .bail(),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .bail(),
  query('limit')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Limit must be a positive integer')
    .bail(),
  validate,
];