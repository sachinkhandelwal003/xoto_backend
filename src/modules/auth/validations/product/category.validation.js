const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { Category, Subcategory } = require('../../models/products/category.model');
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

exports.validateCreateCategory = [
  body('name')
    .trim()
    .notEmpty().withMessage('Category name is required')
    .custom(async (name) => {
      const existingCategory = await Category.findOne({ name });
      if (existingCategory) {
        throw new Error('Category name already in use');
      }
      return true;
    }),
  validate
];

exports.validateCategoryId = [
  param('id')
    .custom(value => isValidObjectId(value, 'Category ID')),
  validate
];

exports.validateUpdateCategory = [
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Category name cannot be empty')
    .custom(async (name, { req }) => {
      const existingCategory = await Category.findOne({ name, _id: { $ne: req.params.id } });
      if (existingCategory) {
        throw new Error('Category name already in use');
      }
      return true;
    }),
  validate
];

exports.validateCreateSubcategory = [
  body('name')
    .trim()
    .notEmpty().withMessage('Subcategory name is required')
    .custom(async (name) => {
      const existingSubcategory = await Subcategory.findOne({ name });
      if (existingSubcategory) {
        throw new Error('Subcategory name already in use');
      }
      return true;
    }),
  body('categoryId')
    .notEmpty().withMessage('Category ID is required')
    .custom(value => isValidObjectId(value, 'Category ID'))
    .custom(async (categoryId) => {
      const category = await Category.findById(categoryId);
      if (!category) {
        throw new Error('Category not found');
      }
      return true;
    }),
  validate
];

exports.validateSubcategoryId = [
  param('id')
    .custom(value => isValidObjectId(value, 'Subcategory ID')),
  validate
];

exports.validateUpdateSubcategory = [
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Subcategory name cannot be empty')
    .custom(async (name, { req }) => {
      const existingSubcategory = await Subcategory.findOne({ name, _id: { $ne: req.params.id } });
      if (existingSubcategory) {
        throw new Error('Subcategory name already in use');
      }
      return true;
    }),
  body('categoryId')
    .optional()
    .custom(value => isValidObjectId(value, 'Category ID'))
    .custom(async (categoryId) => {
      if (categoryId) {
        const category = await Category.findById(categoryId);
        if (!category) {
          throw new Error('Category not found');
        }
      }
      return true;
    }),
  validate
];