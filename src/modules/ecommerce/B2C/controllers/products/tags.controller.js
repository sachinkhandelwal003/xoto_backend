const Tag = require('../../models/tags.model');
const { StatusCodes } = require('../../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../../utils/errorHandler');
const asyncHandler = require('../../../../../utils/asyncHandler');

exports.createTag = asyncHandler(async (req, res, next) => {
  const tagData = req.body;

  const existingTag = await Tag.findOne({ name: tagData.name.trim() });
  if (existingTag) {
    throw new APIError('Tag name already exists', StatusCodes.CONFLICT);
  }

  try {
    const tag = await Tag.create(tagData);
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Tag created successfully',
      data: { tag }
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      throw new APIError(`Validation failed: ${errors.join(', ')}`, StatusCodes.BAD_REQUEST);
    }
    throw new APIError('Server error while creating tag', StatusCodes.INTERNAL_SERVER_ERROR);
  }
});

exports.getAllTags = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10 } = req.query;
  const tags = await Tag.find()
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();
  const total = await Tag.countDocuments();

  res.status(StatusCodes.OK).json({
    success: true,
    pagination: { page: Number(page), limit: Number(limit), total },
    tags
  });
});

exports.getTagById = asyncHandler(async (req, res, next) => {
  const tag = await Tag.findById(req.params.id).lean();
  if (!tag) {
    throw new APIError('Tag not found', StatusCodes.NOT_FOUND);
  }

  res.status(StatusCodes.OK).json({
    success: true,
    tag
  });
});

exports.updateTag = asyncHandler(async (req, res, next) => {
  const tag = await Tag.findById(req.params.id);
  if (!tag) {
    throw new APIError('Tag not found', StatusCodes.NOT_FOUND);
  }

  const updatedData = req.body;
  if (updatedData.name && updatedData.name !== tag.name) {
    const existingTag = await Tag.findOne({ name: updatedData.name });
    if (existingTag) {
      throw new APIError('Tag name already in use', StatusCodes.CONFLICT);
    }
  }

  Object.assign(tag, updatedData);
  tag.updated_at = Date.now();
  await tag.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Tag updated successfully',
    tag
  });
});

exports.deleteTag = asyncHandler(async (req, res, next) => {
  const tag = await Tag.findById(req.params.id);
  if (!tag) {
    throw new APIError('Tag not found', StatusCodes.NOT_FOUND);
  }

  await tag.deleteOne();
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Tag deleted successfully'
  });
});