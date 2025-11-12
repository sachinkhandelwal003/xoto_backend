// validations/authvalidation/permission.validation.js
const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { Permission } = require('../../models/role/permission.model');
const { Role } = require('../../models/role/role.model');
const { Module } = require('../../models/role/module.model');
const mongoose = require('mongoose');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

const isValidId = (value, field) => {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new Error(`${field} must be valid ObjectId`);
  return true;
};

exports.validateCreatePermission = [
  body().isArray().withMessage('Body must be an array of permissions'),
  body('*.roleId').custom(isValidId).custom(async (id, { req, path }) => {
    const index = path.match(/\d+/)[0];
    const role = await Role.findById(id);
    if (!role) throw new Error(`Role not found at index [${index}]`);
  }),
  body('*.moduleId').custom(isValidId).custom(async (id, { req, path }) => {
    const index = path.match(/\d+/)[0];
    const module = await Module.findById(id);
    if (!module) throw new Error(`Module not found at index [${index}]`);
  }),
  body('*.subModuleId').optional({ nullable: true }).custom(async (id, { req, path }) => {
    if (!id) return true;
    const index = path.match(/\d+/)[0];
    const moduleId = req.body[index]?.moduleId;
    const module = await Module.findById(moduleId);
    const sub = module?.subModules?.id(id);
    if (!sub || sub.isDeleted) throw new Error(`Submodule not found at index [${index}]`);
  }),
  body('*.can*').optional().isIn([0, 1, true, false]),
  body().custom(async (arr) => {
    const checks = [];
    for (let i = 0; i < arr.length; i++) {
      const { roleId, moduleId, subModuleId } = arr[i];
      const normalizedSub = subModuleId == null ? null : subModuleId;
      checks.push(
        Permission.findOne({ roleId, moduleId, subModuleId: normalizedSub, isDeleted: false }).then(doc => {
          if (doc) throw new Error(`Duplicate permission at index [${i}]`);
        })
      );
    }
    await Promise.all(checks);
  }),
  validate
];

exports.validateUpdatePermission = [
  param('permissionId').custom(isValidId).custom(async id => {
    const perm = await Permission.findById(id);
    if (!perm || perm.isDeleted) throw new Error('Permission not found');
  }),
  body('canAdd').optional().isIn([0, 1, true, false]),
  body('canEdit').optional().isIn([0, 1, true, false]),
  body('canView').optional().isIn([0, 1, true, false]),
  body('canDelete').optional().isIn([0, 1, true, false]),
  body('canViewAll').optional().isIn([0, 1, true, false]),
  body('isActive').optional().isBoolean(),
  validate
];

exports.validateDeletePermission = [
  param('permissionId').custom(isValidId).custom(async id => {
    const perm = await Permission.findById(id);
    if (!perm || perm.isDeleted) throw new Error('Permission not found');
  }),
  validate
];

exports.validateGetPermission = [
  param('permissionId').custom(isValidId).custom(async id => {
    const perm = await Permission.findById(id);
    if (!perm || perm.isDeleted) throw new Error('Permission not found');
  }),
  validate
];

exports.validateGetAllPermissions = [
  query('roleCode').optional().isString(),
  query('moduleId').optional().custom(isValidId),
  query('isActive').optional().isIn(['true', 'false']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1 }),
  validate
];