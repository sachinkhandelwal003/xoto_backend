const winston = require('winston');
const Attribute = require('../../models/attributes.model');
const { StatusCodes } = require('../../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../../utils/errorHandler');
const asyncHandler = require('../../../../../utils/asyncHandler');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/attribute.log' }),
    new winston.transports.Console()
  ]
});

exports.createAttribute = asyncHandler(async (req, res, next) => {
  const attributeData = req.body;

  const existingAttribute = await Attribute.findOne({ name: attributeData.name.trim() });
  if (existingAttribute) {
    logger.warn(`Attribute creation failed: Duplicate name - ${attributeData.name}`);
    throw new APIError('Attribute name already exists', StatusCodes.CONFLICT);
  }

  try {
    const attribute = await Attribute.create(attributeData);
    logger.info(`Attribute created successfully: ${attribute._id}`);
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Attribute created successfully',
      data: { attribute }
    });
  } catch (error) {
    logger.error(`Attribute creation failed: ${error.message}`);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      throw new APIError(`Validation failed: ${errors.join(', ')}`, StatusCodes.BAD_REQUEST);
    }
    throw new APIError('Server error while creating attribute', StatusCodes.INTERNAL_SERVER_ERROR);
  }
});

exports.getAllAttributes = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10 } = req.query;
  const attributes = await Attribute.find()
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();
  const total = await Attribute.countDocuments();

  logger.info(`Retrieved ${attributes.length} attributes`);
  res.status(StatusCodes.OK).json({
    success: true,
    pagination: { page: Number(page), limit: Number(limit), total },
    attributes
  });
});

exports.getAttributeById = asyncHandler(async (req, res, next) => {
  const attribute = await Attribute.findById(req.params.id).lean();
  if (!attribute) {
    logger.warn(`Attribute not found: ${req.params.id}`);
    throw new APIError('Attribute not found', StatusCodes.NOT_FOUND);
  }

  logger.info(`Retrieved attribute: ${req.params.id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    attribute
  });
});

exports.updateAttribute = asyncHandler(async (req, res, next) => {
  const attribute = await Attribute.findById(req.params.id);
  if (!attribute) {
    logger.warn(`Attribute not found for update: ${req.params.id}`);
    throw new APIError('Attribute not found', StatusCodes.NOT_FOUND);
  }

  const updatedData = req.body;
  if (updatedData.name && updatedData.name !== attribute.name) {
    const existingAttribute = await Attribute.findOne({ name: updatedData.name });
    if (existingAttribute) {
      logger.warn(`Update failed: Name already in use - ${updatedData.name}`);
      throw new APIError('Attribute name already in use', StatusCodes.CONFLICT);
    }
  }

  Object.assign(attribute, updatedData);
  await attribute.save();

  logger.info(`Attribute updated successfully: ${attribute._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Attribute updated successfully',
    attribute
  });
});

exports.deleteAttribute = asyncHandler(async (req, res, next) => {
  const attribute = await Attribute.findById(req.params.id);
  if (!attribute) {
    logger.warn(`Attribute not found for deletion: ${req.params.id}`);
    throw new APIError('Attribute not found', StatusCodes.NOT_FOUND);
  }

  await attribute.deleteOne();
  logger.info(`Attribute deleted successfully: ${attribute._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Attribute deleted successfully'
  });
});