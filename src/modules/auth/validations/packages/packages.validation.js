// modules/package/validations/package.validation.js
const { body, param, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

exports.validateCreatePackage = [
  body('name')
    .isIn(['Essentials', 'Premium', 'Luxe', 'Tshibare'])
    .withMessage('Invalid package name'),
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Description must be 10-500 characters'),
  body('features')
    .isArray({ min: 3, max: 10 })
    .withMessage('Provide 3-10 features'),
  body('features.*')
    .trim()
    .isLength({ min: 5 })
    .withMessage('Each feature must be at least 5 chars'),
  validate,
];

exports.validateUpdatePackage = [
  param('id').isMongoId().withMessage('Invalid package ID'),
  body('price').optional().isFloat({ min: 0 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('features').optional().isArray(),
  body('popular').optional().isBoolean(),
  validate,
];