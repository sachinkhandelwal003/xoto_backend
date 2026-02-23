const { StatusCodes } = require('../modules/auth/constants/statusCodes');
const APIError = require('../utils/errorHandler');
const logger = require('../config/logger');

const validate = (schema) => async (req, res, next) => {
  try {
    // Use validateAsync for async validation
    const validatedData = await schema.validateAsync(req.body, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: true
    });

    req.body = validatedData;
    next();
  } catch (error) {
    if (error.isJoi) {
      const formattedErrors = error.details.map(err => ({
        field: err.path.join('.'),
        message: err.message.replace(/['"]+/g, ''),
        type: err.type
      }));

      logger.warn(`Validation failed: ${JSON.stringify(formattedErrors)}`);
      
      // Ensure StatusCodes.VALIDATION_FAILED is defined
      const statusCode = StatusCodes.VALIDATION_FAILED || 422; // Fallback to 422 if undefined
      return next(new APIError(
        'Validation failed',
        statusCode,
        { errors: formattedErrors }
      ));
    }
    // Log unexpected errors
    logger.error(`Unexpected validation error: ${error.message}`);
    next(new APIError('Internal server error', StatusCodes.INTERNAL_SERVER_ERROR));
  }
};

module.exports = validate;