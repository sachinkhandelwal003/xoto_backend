// validations/authvalidation/module.validation.js
const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { Module } = require('../../models/role/module.model');
const mongoose = require('mongoose');

// ---------------------------------------------------------------------
// Common validation helper
// ---------------------------------------------------------------------
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

const checkModuleExistence = async moduleId => {
  const module = await Module.findById(moduleId);
  if (!module) throw new Error('Module not found');
  return true;
};

const checkSubModuleExistence = async (moduleId, subModuleId) => {
  const module = await Module.findById(moduleId);
  if (!module) throw new Error('Module not found');
  const sub = module.subModules.id(subModuleId);
  if (!sub) throw new Error('Sub-module not found');
  return true;
};

// ---------------------------------------------------------------------
// CREATE MODULE (single or bulk)
// ---------------------------------------------------------------------
exports.validateCreateModule = [
  body().custom(value => {
    if (!Array.isArray(value) && typeof value !== 'object') {
      throw new Error('Body must be an object or an array of objects');
    }
    return true;
  }),

  // ---- ARRAY CASE ----
  body()
    .if(body().isArray())
    .custom(async (arr, { req }) => {
      for (let i = 0; i < arr.length; i++) {
        const el = arr[i];
        if (!el.name) throw new Error(`modules[${i}].name is required`);
        if (!el.route) throw new Error(`modules[${i}].route is required`);

        const nameExists = await Module.findOne({ name: el.name });
        if (nameExists) throw new Error(`modules[${i}].name "${el.name}" already exists`);

        const routeExists = await Module.findOne({ route: el.route });
        if (routeExists) throw new Error(`modules[${i}].route "${el.route}" already exists`);
      }
      return true;
    }),

  // ---- SINGLE OBJECT CASE ----
  body('name')
    .if(body().custom(v => !Array.isArray(v)))
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 50 })
    .withMessage('Name ≤ 50 chars')
    .custom(async name => {
      if (await Module.findOne({ name })) throw new Error('Name already exists');
    }),

  body('route')
    .if(body().custom(v => !Array.isArray(v)))
    .trim()
    .notEmpty()
    .withMessage('Route is required')
    .custom(async route => {
      if (await Module.findOne({ route })) throw new Error('Route already exists');
    }),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Description ≤ 300 chars'),

  body('icon').optional().trim(),
  body('position').optional().isNumeric().withMessage('position must be a number'),

  // ---- SUB-MODULES ----
  body('subModules')
    .optional()
    .isArray()
    .withMessage('subModules must be an array'),

  body('subModules.*.name')
    .if(body('subModules').exists())
    .trim()
    .notEmpty()
    .withMessage('Sub-module name required'),

  body('subModules.*.route')
    .if(body('subModules').exists())
    .trim()
    .notEmpty()
    .withMessage('Sub-module route required')
    .custom(async (route, { req }) => {
      // uniqueness across **all** modules (except the one being created)
      const exists = await Module.findOne({
        'subModules.route': route,
        'subModules.isDeleted': false
      });
      if (exists) throw new Error(`Sub-module route "${route}" already exists`);
    }),

  body('subModules.*.icon').optional().trim(),
  body('subModules.*.isActive').optional().isBoolean(),
  body('subModules.*.position').optional().isNumeric(),
  body('subModules.*.dashboardView').optional().isBoolean(),

  validate
];

// ---------------------------------------------------------------------
// UPDATE MODULE
// ---------------------------------------------------------------------
exports.validateUpdateModule = [
  param('moduleId')
    .custom(v => isValidObjectId(v, 'Module ID'))
    .bail()
    .custom(checkModuleExistence)
    .bail(),

  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ max: 50 })
    .withMessage('Name ≤ 50 chars')
    .custom(async (name, { req }) => {
      const exists = await Module.findOne({ name, _id: { $ne: req.params.moduleId } });
      if (exists) throw new Error('Module with this name already exists');
    }),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Description ≤ 300 chars'),

  body('icon').optional().trim(),

  body('route')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Route cannot be empty')
    .custom(async (route, { req }) => {
      const exists = await Module.findOne({ route, _id: { $ne: req.params.moduleId } });
      if (exists) throw new Error('Module with this route already exists');
    }),

  body('subModules')
    .optional()
    .isArray()
    .withMessage('subModules must be an array'),

  body('subModules.*.name')
    .if(body('subModules').exists())
    .trim()
    .notEmpty()
    .withMessage('Sub-module name required'),

  body('subModules.*.route')
    .if(body('subModules').exists())
    .trim()
    .notEmpty()
    .withMessage('Sub-module route required')
    .custom(async (route, { req }) => {
      const exists = await Module.findOne({
        'subModules.route': route,
        _id: { $ne: req.params.moduleId },
        'subModules.isDeleted': false
      });
      if (exists) throw new Error(`Sub-module route "${route}" already exists`);
    }),

  body('subModules.*.icon').optional().trim(),
  body('subModules.*.isActive').optional().isBoolean(),
  body('subModules.*.position').optional().isNumeric(),
  body('subModules.*.dashboardView').optional().isBoolean(),

  body('isActive').optional().isBoolean(),
  body('position').optional().isNumeric(),
  validate
];

// ---------------------------------------------------------------------
// REORDER MODULES
// ---------------------------------------------------------------------
exports.validateReorderModules = [
  body('modules').isArray().withMessage('Modules must be an array'),
  body('modules.*._id').custom(v => isValidObjectId(v, 'Module ID')),
  body('modules.*.position').isNumeric().withMessage('Position must be a number'),
  validate
];

// ---------------------------------------------------------------------
// DELETE MODULE
// ---------------------------------------------------------------------
exports.validateDeleteModule = [
  param('moduleId')
    .custom(v => isValidObjectId(v, 'Module ID'))
    .bail()
    .custom(checkModuleExistence)
    .bail()
    .custom(async moduleId => {
      const { Permission } = require('../../models/role/permission.model');
      const perms = await Permission.find({ moduleId });
      if (perms.length) throw new Error('Cannot delete module with associated permissions');
    })
    .bail(),
  validate
];

// ---------------------------------------------------------------------
// GET SINGLE MODULE
// ---------------------------------------------------------------------
exports.validateGetModule = [
  param('moduleId')
    .custom(v => isValidObjectId(v, 'Module ID'))
    .bail()
    .custom(checkModuleExistence)
    .bail(),
  validate
];

// ---------------------------------------------------------------------
// GET ALL MODULES
// ---------------------------------------------------------------------
exports.validateGetAllModules = [
  query('isActive')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('isActive must be "true" or "false"'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be ≥ 1'),
  query('limit')
    .optional()
    .isInt({ min: 1 })
    .withMessage('limit must be ≥ 1'),
  validate
];

// ---------------------------------------------------------------------
// CREATE SUB-MODULE(S)
// ---------------------------------------------------------------------
exports.validateCreateSubModule = [
  param('moduleId')
    .custom(v => isValidObjectId(v, 'Module ID'))
    .bail()
    .custom(checkModuleExistence)
    .bail(),

  body().custom(value => {
    if (!Array.isArray(value) && typeof value !== 'object')
      throw new Error('Body must be an object or an array of objects');
    return true;
  }),

  // ---- ARRAY ----
  body()
    .if(body().isArray())
    .custom(async (arr, { req }) => {
      for (let i = 0; i < arr.length; i++) {
        const el = arr[i];
        if (!el.name) throw new Error(`subModules[${i}].name is required`);
        if (!el.route) throw new Error(`subModules[${i}].route is required`);

        const exists = await Module.findOne({
          'subModules.route': el.route,
          _id: { $ne: req.params.moduleId },
          'subModules.isDeleted': false
        });
        if (exists) throw new Error(`subModules[${i}].route "${el.route}" already exists`);
      }
    }),

  // ---- SINGLE ----
  body('name')
    .if(body().custom(v => !Array.isArray(v)))
    .trim()
    .notEmpty()
    .withMessage('Sub-module name required'),

  body('route')
    .if(body().custom(v => !Array.isArray(v)))
    .trim()
    .notEmpty()
    .withMessage('Sub-module route required')
    .custom(async (route, { req }) => {
      const exists = await Module.findOne({
        'subModules.route': route,
        _id: { $ne: req.params.moduleId },
        'subModules.isDeleted': false
      });
      if (exists) throw new Error(`Sub-module route "${route}" already exists`);
    }),

  body('icon').optional().trim(),
  body('isActive').optional().isBoolean(),
  body('dashboardView').optional().isBoolean(),
  body('position').optional().isNumeric(),
  validate
];

// ---------------------------------------------------------------------
// UPDATE SUB-MODULE
// ---------------------------------------------------------------------
exports.validateUpdateSubModule = [
  param('moduleId')
    .custom(v => isValidObjectId(v, 'Module ID'))
    .bail()
    .custom(checkModuleExistence)
    .bail(),
  param('subModuleId')
    .custom(v => isValidObjectId(v, 'Sub-module ID'))
    .bail()
    .custom((v, { req }) => checkSubModuleExistence(req.params.moduleId, v))
    .bail(),

  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('route')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Route cannot be empty')
    .custom(async (route, { req }) => {
      const exists = await Module.findOne({
        'subModules.route': route,
        _id: { $ne: req.params.moduleId },
        'subModules.isDeleted': false
      });
      if (exists) throw new Error(`Sub-module route "${route}" already exists`);
    }),

  body('icon').optional().trim(),
  body('isActive').optional().isBoolean(),
  body('dashboardView').optional().isBoolean(),
  body('position').optional().isNumeric(),
  validate
];

// ---------------------------------------------------------------------
// REORDER SUB-MODULES
// ---------------------------------------------------------------------
exports.validateReorderSubModules = [
  param('moduleId')
    .custom(v => isValidObjectId(v, 'Module ID'))
    .bail()
    .custom(checkModuleExistence)
    .bail(),
  body('subModules')
    .isArray()
    .withMessage('subModules must be an array'),
  body('subModules.*._id')
    .custom(v => isValidObjectId(v, 'Sub-module ID')),
  body('subModules.*.position')
    .isNumeric()
    .withMessage('position must be a number'),
  validate
];