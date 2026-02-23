const winston = require('winston');

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log' }),
    new winston.transports.Console()
  ]
});

class APIError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.statusCode = statusCode || 500;
    this.details = details;
    this.name = 'APIError';
  }
}

// Global error handling middleware
const errorHandler = (err, req, res, next) => {
  if (err instanceof APIError) {
    return res.status(err.statusCode).json({
      error: {
        status: err.statusCode,
        message: err.message,
        ...(err.details && { details: err.details })
      }
    });
  }

  // Handle unexpected errors
  logger.error(`Unexpected error: ${err.message}`);
  res.status(500).json({
    error: {
      status: 500,
      message: 'Internal server error'
    }
  });
};

module.exports = { APIError, errorHandler };