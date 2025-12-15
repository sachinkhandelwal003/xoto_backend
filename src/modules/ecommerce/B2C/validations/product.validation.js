// validations/product.validation.js
const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const ProductB2C  = require('../models/product.model');
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

// Check if referenced document exists
const checkReferenceExists = async (value, fieldName, modelName) => {
  const model = mongoose.model(modelName);
  const exists = await model.exists({ _id: value });
  if (!exists) {
    throw new Error(`${fieldName} does not exist`);
  }
  return true;
};
  

exports.validateCreateProduct = [

  // Product Name
  body('name')
    .trim()
    .notEmpty().withMessage('Product name is required')
    .bail()
    .isLength({ min: 3, max: 200 })
    .withMessage('Product name must be between 3 and 200 characters'),

  // Category (ONLY required + ObjectId)
  body('category')
    .notEmpty().withMessage('Category is required')
    .bail()
    .custom(v => isValidObjectId(v, 'Category')),

  // Brand
  body('brand')
    .notEmpty().withMessage('Brand is required')
    .bail()
    .custom(v => isValidObjectId(v, 'Brand')),

  // Material
  body('material')
    .notEmpty().withMessage('Material is required')
    .bail()
    .custom(v => isValidObjectId(v, 'Material')),

  // Pricing
  body('pricing.cost_price')
    .notEmpty().withMessage('Cost price is required')
    .bail()
    .isFloat({ min: 0 })
    .withMessage('Cost price must be a positive number'),

  body('pricing.base_price')
    .notEmpty().withMessage('Base price is required')
    .bail()
    .isFloat({ min: 0 })
    .withMessage('Base price must be a positive number'),

  body('pricing.currency')
    .notEmpty().withMessage('Currency is required')
    .bail()
    .custom(v => isValidObjectId(v, 'Currency')),

  // Attributes (optional)
  body('attributes')
    .optional()
    .customSanitizer(v => {
      try {
        return typeof v === 'string' ? JSON.parse(v) : v;
      } catch {
        throw new Error('Attributes must be a valid JSON array');
      }
    })
    .bail()
    .isArray()
    .withMessage('Attributes must be an array'),

  // Tags (optional)
  body('tags')
    .optional()
    .customSanitizer(v => {
      try {
        return typeof v === 'string' ? JSON.parse(v) : v;
      } catch {
        throw new Error('Tags must be a valid JSON array');
      }
    })
    .bail()
    .isArray()
    .withMessage('Tags must be an array'),

  // Color Variants
  body('color_variants')
    .notEmpty().withMessage('Color variants are required')
    .bail()
    .customSanitizer(v => {
      try {
        return typeof v === 'string' ? JSON.parse(v) : v;
      } catch {
        throw new Error('Color variants must be a valid JSON array');
      }
    })
    .bail()
    .isArray({ min: 1 })
    .withMessage('At least one color variant is required')
    .bail()
    .custom((variants) => {
      variants.forEach((v, i) => {
        if (!v.color_name || !v.color_name.trim()) {
          throw new Error(`Color name is required for variant at index ${i}`);
        }
      });
      return true;
    }),

  validate
];



exports.validateUpdateProduct = [
  param('id')
    .custom(value => isValidObjectId(value, 'Product ID')),
  
  body('vendor')
    .optional()
    .custom(value => isValidObjectId(value, 'Vendor'))
    .custom(async (value) => await checkReferenceExists(value, 'Vendor', 'VendorB2C')),
  
  body('category')
    .optional()
    .custom(value => isValidObjectId(value, 'Category'))
    .custom(async (value) => await checkReferenceExists(value, 'Category', 'Category')),
  
  body('brand')
    .optional()
    .custom(value => isValidObjectId(value, 'Brand'))
    .custom(async (value) => await checkReferenceExists(value, 'Brand', 'Brand')),
  
  body('material')
    .optional()
    .custom(value => isValidObjectId(value, 'Material'))
    .custom(async (value) => await checkReferenceExists(value, 'Material', 'Material')),

  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Product name is required')
    .isLength({ min: 3, max: 200 }).withMessage('Product name must be between 3 and 200 characters'),

  body('pricing.base_price')
    .optional()
    .isFloat({ min: 0 }).withMessage('Base price must be a positive number'),

  body('pricing.cost_price')
    .optional()
    .isFloat({ min: 0 }).withMessage('Cost price must be a positive number'),

  body('pricing.sale_price')
    .optional()
    .isFloat({ min: 0 }).withMessage('Sale price must be a positive number'),

  body('tags')
    .optional()
    .isArray().withMessage('Tags must be an array')
    .custom(async (tags) => {
      if (tags && tags.length > 0) {
        await Promise.all(tags.map(async (tagId) => {
          isValidObjectId(tagId, 'Tag');
          await checkReferenceExists(tagId, 'Tag', 'Tag');
        }));
      }
      return true;
    }),

  body('status')
    .optional()
    .isIn(['draft', 'pending_verification', 'active', 'rejected', 'inactive', 'archived'])
    .withMessage('Invalid status value'),

  // Color variants for update (optional, no image_alts)
  body('color_variants')
    .optional()
    .custom((value) => {
      let variants;
      try {
        variants = typeof value === 'string' ? JSON.parse(value) : value;
      } catch {
        throw new Error('Invalid color_variants format');
      }
      if (Array.isArray(variants)) {
        variants.forEach((v, i) => {
          if (!v.color_name) {
            throw new Error(`Color name required for variant ${i + 1}`);
          }
        });
      }
      return true;
    }),

  validate
];

exports.validateProductVerification = [
  param('id')
    .custom((value) => isValidObjectId(value))
    .withMessage('Invalid Product ID')
    .bail(),

  body('status')
    .notEmpty()
    .withMessage('Verification status is required')
    .bail()
    .isIn(['approved', 'rejected'])
    .withMessage('Status must be approved or rejected')
    .bail(),

  body('rejection_reason')
    .if(body('status').equals('rejected'))
    .notEmpty()
    .withMessage('Rejection reason is required when rejecting')
    .bail(),

  body('suggestion')
    .if(body('status').equals('rejected'))
    .notEmpty()
    .withMessage('Suggestion is required when rejecting')
    .bail(),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, errors: errors.array() });
    }
    next();
  },
];

exports.validateAssetVerification = [
  param('productId')
    .custom(value => isValidObjectId(value, 'Product ID')),
  
  param('assetId')
    .custom(value => isValidObjectId(value, 'Asset ID')),
  
  body('verified')
    .isBoolean().withMessage('Verified must be a boolean'),
  
  body('reason')
    .if(body('verified').equals(false))
    .notEmpty().withMessage('Reason is required when rejecting asset'),
  
  body('suggestion')
    .if(body('verified').equals(false))
    .notEmpty().withMessage('Suggestion is required when rejecting asset'),

  validate
];

exports.validateUpdateInventory = [
  param('productId')
    .custom(value => isValidObjectId(value, 'Product ID')),
  
  body('sku')
    .notEmpty().withMessage('SKU is required')
    .isLength({ min: 3 }).withMessage('SKU must be at least 3 characters'),
  
  body('quantity')
    .isInt({ min: 0 }).withMessage('Quantity must be a positive integer'),
  
  body('type')
    .optional()
    .isIn(['in', 'out', 'adjustment']).withMessage('Type must be in, out, or adjustment'),

  validate
];

exports.validateGetAllProducts = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['draft', 'pending_verification', 'active', 'rejected', 'inactive', 'archived'])
    .withMessage('Invalid status filter'),
  query('verification_status')
    .optional()
    .isIn(['pending', 'approved', 'rejected'])
    .withMessage('Invalid verification status filter'),
  query('vendor_id')
    .optional()
    .custom(value => isValidObjectId(value, 'Vendor ID')),
  query('category_id')
    .optional()
    .custom(value => isValidObjectId(value, 'Category ID')),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Search term too long'),

  validate
];

exports.validateProductId = [
  param('productId')
  .custom(value => isValidObjectId(value, 'Product ID')),
  validate
];



exports.validateUpdatePricing = [
  // Validate Product ID
  param('id')
    .custom(value => isValidObjectId(value))
    .withMessage('Invalid Product ID')
    .bail(),

  // Validate sale_price
  body('sale_price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Sale price must be a positive number')
    .bail(),

  // Validate discount
  body('discount').optional().custom(discount => {
    if (typeof discount !== 'object') throw new Error('Discount must be an object');
    return true;
  }).bail(),

  body('discount.type')
    .if(body('discount').exists())
    .optional()
    .isIn(['percentage', 'fixed'])
    .withMessage('Discount type must be percentage or fixed')
    .bail(),

  body('discount.value')
    .if(body('discount').exists())
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount value must be a positive number')
    .bail(),

  body('discount.valid_till')
    .if(body('discount').exists())
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Invalid valid till date')
    .bail(),

  // Validate tax
  body('tax').optional().custom(tax => {
    if (typeof tax !== 'object') throw new Error('Tax must be an object');
    return true;
  }).bail(),

  body('tax.tax_id')
    .if(body('tax').exists())
    .optional()
    .custom(value => isValidObjectId(value))
    .withMessage('Invalid Tax ID')
    .bail(),

  body('tax.rate')
    .if(body('tax').exists())
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax rate must be between 0 and 100')
    .bail(),

  validate
];
