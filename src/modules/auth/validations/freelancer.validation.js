const { body, param, query, validationResult } = require('express-validator');
const { StatusCodes } = require('../../../utils/constants/statusCodes');
const Customer = require('../models/Customer/customer.model');
const FreelancerRequest = require('../models/Customer/freelancer.model');
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

// Custom validator to check if customer exists
const checkCustomerExistence = async (customerId) => {
  const customer = await Customer.findById(customerId);
  if (!customer) {
    throw new Error('Customer not found');
  }
  return true;
};

// Validation for submitting a freelancer request
const validateSubmitFreelancerRequest = [
  param('customerId')
    .custom((value) => isValidObjectId(value, 'Customer ID'))
    .bail()
    .custom(checkCustomerExistence)
    .bail(),
  body('skills')
    .isArray()
    .withMessage('Skills must be an array')
    .bail()
    .notEmpty()
    .withMessage('At least one skill is required')
    .bail(),
  body('skills.*')
    .isString()
    .withMessage('Each skill must be a valid string')
    .bail()
    .notEmpty()
    .withMessage('Skill cannot be empty')
    .bail()
    .isLength({ max: 100 })
    .withMessage('Each skill cannot exceed 100 characters')
    .bail(),
  body('hourlyRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Hourly rate must be a positive number')
    .bail(),
  body('portfolio')
    .optional()
    .isURL()
    .withMessage('Portfolio must be a valid URL')
    .bail()
    .isLength({ max: 500 })
    .withMessage('Portfolio URL cannot exceed 500 characters')
    .bail(),
  validate,
];

// Validation for approving a freelancer request
const validateApproveFreelancerRequest = [
  param('requestId')
    .custom((value) => isValidObjectId(value, 'Request ID'))
    .bail()
    .custom(async (requestId) => {
      const request = await FreelancerRequest.findById(requestId);
      if (!request) {
        throw new Error('Freelancer request not found');
      }
      if (request.status !== 0) {
        throw new Error('Freelancer request has already been processed');
      }
      return true;
    })
    .bail(),
  validate,
];

// Validation for rejecting a freelancer request
const validateRejectFreelancerRequest = [
  param('requestId')
    .custom((value) => isValidObjectId(value, 'Request ID'))
    .bail()
    .custom(async (requestId) => {
      const request = await FreelancerRequest.findById(requestId);
      if (!request) {
        throw new Error('Freelancer request not found');
      }
      if (request.status !== 0) {
        throw new Error('Freelancer request has already been processed');
      }
      return true;
    })
    .bail(),
  body('rejectionReason')
    .trim()
    .notEmpty()
    .withMessage('Rejection reason is required')
    .bail()
    .isLength({ max: 500 })
    .withMessage('Rejection reason cannot exceed 500 characters')
    .bail(),
  validate,
];

// Validation for getting all freelancer requests
const validateGetAllFreelancerRequests = [
  query('status')
    .optional()
    .isInt({ min: 0, max: 2 })
    .withMessage('Status must be 0 (pending), 1 (approved), or 2 (rejected)')
    .bail(),
  validate,
];

// Validation for getting customer freelancer status
const validateGetCustomerFreelancerStatus = [
  param('customerId')
    .custom((value) => isValidObjectId(value, 'Customer ID'))
    .bail()
    .custom(checkCustomerExistence)
    .bail(),
  validate,
];

module.exports = {
  validateSubmitFreelancerRequest,
  validateApproveFreelancerRequest,
  validateRejectFreelancerRequest,
  validateGetAllFreelancerRequests,
  validateGetCustomerFreelancerStatus,
};