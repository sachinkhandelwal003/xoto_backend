const { APIError } = require('./errorHandler');
const { StatusCodes } = require('./constants/statusCodes');

const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(err => {
    if (err instanceof APIError) {
      return next(err);
    }
    const error = new APIError(
      err.message || 'Server Error',
      StatusCodes.INTERNAL_SERVER_ERROR
    );
    next(error);
  });
};

module.exports = asyncHandler;