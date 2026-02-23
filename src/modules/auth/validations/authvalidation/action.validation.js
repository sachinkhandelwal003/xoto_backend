// modules/auth/validations/action/action.validation.js
const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { Action } = require('../../models/role/actionmodule.model');
const { Module } = require('../../models/role/module.model');
const mongoose = require('mongoose');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      statusCode: StatusCodes.BAD_REQUEST,
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

exports.validateCreateAction = [
  body().isArray().withMessage('Request body must be an array of actions'),
  body('*.name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .bail()
    .custom(async (name, { req, path }) => {
      const index = parseInt(path.match(/\d+/)[0]);
      const moduleId = req.body[index].moduleId;
      const existingAction = await Action.findOne({ name, moduleId });
      if (existingAction) {
        throw new Error(`Action with name "${name}" already exists in module at index ${index}`);
      }
      return true;
    })
    .bail(),
  body('*.description')
    .optional()
    .trim()
    .bail(),
  body('*.moduleId')
    .custom(value => isValidObjectId(value, 'Module ID'))
    .bail()
    .custom(async (moduleId, { req, path }) => {
      const index = parseInt(path.match(/\d+/)[0]);
      const module = await Module.findById(moduleId);
      if (!module) {
        throw new Error(`Module not found at index ${index}`);
      }
      return true;
    })
    .bail(),
  validate
];

exports.validateUpdateAction = [
  param('actionId')
    .custom(value => isValidObjectId(value, 'Action ID'))
    .bail()
    .custom(async actionId => {
      const action = await Action.findById(actionId);
      if (!action) {
        throw new Error('Action not found');
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
    .custom(async (name, { req }) => {
      const action = await Action.findById(req.params.actionId);
      const existing = await Action.findOne({ name, moduleId: action.moduleId, _id: { $ne: req.params.actionId } });
      if (existing) {
        throw new Error('Action with this name already exists in the module');
      }
      return true;
    })
    .bail(),
  body('description')
    .optional()
    .trim()
    .bail(),
  validate
];

exports.validateDeleteAction = [
  param('actionId')
    .custom(value => isValidObjectId(value, 'Action ID'))
    .bail()
    .custom(async actionId => {
      const action = await Action.findById(actionId);
      if (!action) {
        throw new Error('Action not found');
      }
      const { Permission } = require('../../models/role/permission.model');
      const permissions = await Permission.find({ actions: actionId });
      if (permissions.length > 0) {
        throw new Error('Cannot delete action used in permissions');
      }
      return true;
    })
    .bail(),
  validate
];

exports.validateGetAction = [
  param('actionId')
    .custom(value => isValidObjectId(value, 'Action ID'))
    .bail()
    .custom(async actionId => {
      const action = await Action.findById(actionId);
      if (!action) {
        throw new Error('Action not found');
      }
      return true;
    })
    .bail(),
  validate
];

exports.validateGetAllActions = [
  query('moduleId')
    .optional()
    .custom(value => isValidObjectId(value, 'Module ID'))
    .bail()
    .custom(async moduleId => {
      const module = await Module.findById(moduleId);
      if (!module) {
        throw new Error('Module not found');
      }
      return true;
    })
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
  validate
];