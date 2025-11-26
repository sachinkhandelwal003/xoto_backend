// modules/auth/validations/role/role.validation.js
const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { Role, Platform } = require('../../models/role/role.model');
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

// Custom validator to check if role exists
const checkRoleExistence = async (roleId) => {
  const role = await Role.findById(roleId);
  if (!role) {
    throw new Error('Role not found');
  }
  return true;
};

// Validation for creating a role
exports.validateCreateRole = [
  body('code')
    .trim()
    .notEmpty()
    .withMessage('Code is required')
    .bail()
    .isString()
    .withMessage('Code must be a string')
    .bail()
    .isLength({ max: 50 })
    .withMessage('Code cannot exceed 50 characters')
    .bail()
    .custom(async (code) => {
      const existingRole = await Role.findOne({ code });
      if (existingRole) {
        throw new Error('Role with this code already exists');
      }
      return true;
    })
    .bail(),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .bail()
    .isLength({ max: 50 })
    .withMessage('Name cannot exceed 50 characters')
    .bail()
    .custom(async (name) => {
      const existingRole = await Role.findOne({ name });
      if (existingRole) {
        throw new Error('Role with this name already exists');
      }
      return true;
    })
    .bail(),
  body('category')
    .custom((value) => isValidObjectId(value, 'Platform ID'))
    .bail()
    .custom(checkPlatformExistence)
    .bail(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Description cannot exceed 300 characters')
    .bail(),
  body('parentRole')
    .optional()
    .custom((value) => isValidObjectId(value, 'Parent Role ID'))
    .bail()
    .custom(checkRoleExistence)
    .bail(),
  body('isSuperAdmin')
    .optional()
    .isBoolean()
    .withMessage('isSuperAdmin must be a boolean')
    .bail(),
  validate,
];

// Validation for updating a role
exports.validateUpdateRole = [
  param('roleId')
    .custom((value) => isValidObjectId(value, 'Role ID'))
    .bail()
    .custom(checkRoleExistence)
    .bail(),
  body('code')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Code cannot be empty')
    .bail()
    .isString()
    .withMessage('Code must be a string')
    .bail()
    .isLength({ max: 50 })
    .withMessage('Code cannot exceed 50 characters')
    .bail()
    .custom(async (code, { req }) => {
      const existingRole = await Role.findOne({ 
        code, 
        _id: { $ne: req.params.roleId } 
      });
      if (existingRole) {
        throw new Error('Role with this code already exists');
      }
      return true;
    })
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
      const existingRole = await Role.findOne({ 
        name, 
        _id: { $ne: req.params.roleId } 
      });
      if (existingRole) {
        throw new Error('Role with this name already exists');
      }
      return true;
    })
    .bail(),
  body('category')
    .optional()
    .custom((value) => isValidObjectId(value, 'Platform ID'))
    .bail()
    .custom(checkPlatformExistence)
    .bail(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Description cannot exceed 300 characters')
    .bail(),
  body('parentRole')
    .optional()
    .custom((value) => isValidObjectId(value, 'Parent Role ID'))
    .bail()
    .custom(checkRoleExistence)
    .bail(),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
    .bail(),
  body('isSuperAdmin')
    .optional()
    .isBoolean()
    .withMessage('isSuperAdmin must be a boolean')
    .bail(),
  validate,
];

// Validation for soft deleting a role
exports.validateDeleteRole = [
  param('roleId')
    .custom((value) => isValidObjectId(value, 'Role ID'))
    .bail()
    .custom(checkRoleExistence)
    .bail()
    .custom(async (roleId) => {
      const role = await Role.findById(roleId);
      if (!role.isActive) {
        throw new Error('Role is already deleted');
      }
      const dependentRoles = await Role.find({ parentRole: roleId, isActive: true });
      if (dependentRoles.length > 0) {
        throw new Error('Cannot delete role with dependent active child roles');
      }
      return true;
    })
    .bail(),
  validate,
];

// Validation for permanent deleting a role
exports.validatePermanentDeleteRole = [
  param('roleId')
    .custom((value) => isValidObjectId(value, 'Role ID'))
    .bail()
    .custom(checkRoleExistence)
    .bail()
    .custom(async (roleId) => {
      const role = await Role.findById(roleId);
      if (role.isActive) {
        throw new Error('Role must be soft deleted before permanent deletion');
      }
      const dependentRoles = await Role.find({ parentRole: roleId });
      if (dependentRoles.length > 0) {
        throw new Error('Cannot permanently delete role with dependent child roles');
      }
      return true;
    })
    .bail(),
  validate,
];

// Validation for restoring a role
exports.validateRestoreRole = [
  param('roleId')
    .custom((value) => isValidObjectId(value, 'Role ID'))
    .bail()
    .custom(checkRoleExistence)
    .bail()
    .custom(async (roleId) => {
      const role = await Role.findById(roleId);
      if (role.isActive) {
        throw new Error('Role is already active');
      }
      if (role.parentRole) {
        const parent = await Role.findById(role.parentRole);
        if (!parent || !parent.isActive) {
          throw new Error('Parent role must be active to restore this role');
        }
      }
      return true;
    })
    .bail(),
  validate,
];

// Validation for getting a single role
exports.validateGetRole = [
  param('roleId')
    .custom((value) => isValidObjectId(value, 'Role ID'))
    .bail()
    .custom(checkRoleExistence)
    .bail(),
  validate,
];

// Validation for getting all roles
exports.validateGetAllRoles = [
  query('category')
    .optional()
    .custom((value) => isValidObjectId(value, 'Platform ID'))
    .bail()
    .custom(checkPlatformExistence)
    .bail(),
  query('isActive')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('isActive must be either "true" or "false"')
    .bail(),
  query('isSuperAdmin')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('isSuperAdmin must be either "true" or "false"')
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