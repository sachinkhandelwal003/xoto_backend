const { body, param } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');

const validate = (req, res, next) => {
  const errors = require('express-validator').validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

exports.validateCreateCategory = [
  body('name').isIn(['Interior', 'Landscaping']).withMessage('Invalid category name'),
  body('description').optional().isString().trim(),
  validate,
];

exports.validateCreateSubcategory = [
  param('categoryId').isMongoId().withMessage('Invalid category ID'),
  body('label').trim().isLength({ min: 3 }).withMessage('Label required (min 3 chars)'),
  body('description').optional().isString(),
  validate,
];

exports.validateCreateType = [
  param('categoryId').isMongoId(),
  param('subcategoryId').isMongoId(),
  body('label').trim().isLength({ min: 3 }),
  body('description').optional().isString(),
  validate,
];

// Add this to your existing validation file

exports.validateBulkCreate = [
  body('categories').isArray({ min: 1 }).withMessage('categories array is required'),
  body('categories.*.name')
    .isIn(['Interior', 'Landscaping'])
    .withMessage('Category name must be Interior or Landscaping'),
  body('categories.*.subcategories').optional().isArray(),
  body('categories.*.subcategories.*.label')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 3 })
    .withMessage('Subcategory label required'),
  body('categories.*.subcategories.*.types').optional().isArray(),
  body('categories.*.subcategories.*.types.*.label')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2 }),
  validate,
];
module.exports = {
  validateCreateCategory: exports.validateCreateCategory,
  validateCreateSubcategory: exports.validateCreateSubcategory,
  validateCreateType: exports.validateCreateType,
    validateBulkCreate: exports.validateBulkCreate,

};