// modules/auth/controllers/role/platform.controller.js
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const { Platform, Role } = require('../../models/role/role.model');
const asyncHandler = require('../../../../utils/asyncHandler');

// Create a new platform
exports.createPlatform = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  // Check for duplicate name
  const existingPlatform = await Platform.findOne({ name });
  if (existingPlatform) {
    throw new APIError('Platform with this name already exists', StatusCodes.CONFLICT);
  }

  // Create new platform
  const platform = await Platform.create({
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    description
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Platform created successfully',
    platform,
  });
});

// Update a platform
exports.updatePlatform = asyncHandler(async (req, res) => {
  const { platformId } = req.params;
  const { name, description, isActive } = req.body;

  // Check if platform exists
  const platform = await Platform.findById(platformId);
  if (!platform) {
    throw new APIError('Platform not found', StatusCodes.NOT_FOUND);
  }

  // Check for duplicate name (excluding current platform)
  if (name) {
    const existingPlatform = await Platform.findOne({
      name,
      _id: { $ne: platformId }
    });
    if (existingPlatform) {
      throw new APIError('Platform with this name already exists', StatusCodes.CONFLICT);
    }
  }

  // Update platform
  platform.name = name || platform.name;
  platform.slug = name ? name.toLowerCase().replace(/\s+/g, '-') : platform.slug;
  platform.description = description || platform.description;
  platform.isActive = isActive !== undefined ? isActive : platform.isActive;

  await platform.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Platform updated successfully',
    platform,
  });
});

// Soft delete a platform (set isActive to false)
exports.deletePlatform = asyncHandler(async (req, res) => {
  const { platformId } = req.params;

  // Check if platform exists
  const platform = await Platform.findById(platformId);
  if (!platform) {
    throw new APIError('Platform not found', StatusCodes.NOT_FOUND);
  }

  // Check if platform is already inactive
  if (!platform.isActive) {
    throw new APIError('Platform is already deleted', StatusCodes.BAD_REQUEST);
  }

  // Check if platform has associated active roles
  const hasRoles = await Role.exists({ category: platformId, isActive: true });
  if (hasRoles) {
    throw new APIError('Cannot delete platform with associated active roles', StatusCodes.BAD_REQUEST);
  }

  // Soft delete
  platform.isActive = false;
  await platform.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Platform soft deleted successfully',
  });
});

// Permanent delete a platform (only if already soft deleted)
exports.permanentDeletePlatform = asyncHandler(async (req, res) => {
  const { platformId } = req.params;

  // Check if platform exists
  const platform = await Platform.findById(platformId);
  if (!platform) {
    throw new APIError('Platform not found', StatusCodes.NOT_FOUND);
  }

  // Check if platform is already soft deleted
  if (platform.isActive) {
    throw new APIError('Platform must be soft deleted before permanent deletion', StatusCodes.BAD_REQUEST);
  }

  // Check if platform has associated roles, even inactive ones
  const hasRoles = await Role.exists({ category: platformId });
  if (hasRoles) {
    throw new APIError('Cannot permanently delete platform with associated roles', StatusCodes.BAD_REQUEST);
  }

  // Permanent delete
  await platform.deleteOne();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Platform permanently deleted successfully',
  });
});

// Restore a soft deleted platform (set isActive to true)
exports.restorePlatform = asyncHandler(async (req, res) => {
  const { platformId } = req.params;

  // Check if platform exists
  const platform = await Platform.findById(platformId);
  if (!platform) {
    throw new APIError('Platform not found', StatusCodes.NOT_FOUND);
  }

  // Check if platform is already active
  if (platform.isActive) {
    throw new APIError('Platform is already active', StatusCodes.BAD_REQUEST);
  }

  // Restore
  platform.isActive = true;
  await platform.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Platform restored successfully',
    platform,
  });
});

// Get a single platform
exports.getPlatform = asyncHandler(async (req, res) => {
  const { platformId } = req.params;

  const platform = await Platform.findById(platformId);
  if (!platform) {
    throw new APIError('Platform not found', StatusCodes.NOT_FOUND);
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Platform retrieved successfully',
    platform,
  });
});

// Get all platforms (default to active platforms)
exports.getAllPlatforms = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const { isActive } = req.query;

  // Build filter (default to isActive: true if not specified)
  const filter = {};
  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  } else {
    filter.isActive = true;
  }

  // Query platforms
  const platforms = await Platform.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Platform.countDocuments(filter);

  res.status(StatusCodes.OK).json({
    success: true,
    count: platforms.length,
    message: `${platforms.length} platforms found`,
    pagination: {
      totalRecords: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      perPage: limit,
    },
    platforms,
  });
});

exports.seedPlatforms = asyncHandler(async (req, res) => {
  const platforms = [
    { name: 'ecommerce', description: 'E-commerce related roles (SuperAdmin, Vendor, Freelancer, Business)' },
    { name: 'employee', description: 'Employee related roles (Manager, HR, Staff, Developer)' },
    { name: 'system', description: 'Internal system roles' }
  ];

  // Check if platforms already exist
  const existingPlatforms = await Platform.find({ name: { $in: platforms.map(p => p.name) } });
  if (existingPlatforms.length > 0) {
    throw new APIError('Some platforms already exist', StatusCodes.CONFLICT);
  }

  // Insert platforms
  const createdPlatforms = await Platform.insertMany(platforms.map(p => ({
    ...p,
    slug: p.name.toLowerCase().replace(/\s+/g, '-')
  })));

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Platforms seeded successfully',
    platforms: createdPlatforms,
  });
});