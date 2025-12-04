// modules/package/controllers/package.controller.js
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const LandscapingPackage = require('../../models/packages/packages.model');
const asyncHandler = require('../../../../utils/asyncHandler');
// CREATE PACKAGE
exports.createPackage = asyncHandler(async (req, res) => {
  const { name, price, description, features, popular, currency } = req.body;

  const existing = await LandscapingPackage.findOne({ name });
  if (existing) {
    throw new APIError('Package with this name already exists', StatusCodes.CONFLICT);
  }

  const pkg = await LandscapingPackage.create({
    name,
    price,
    description,
    currency: currency || 'USD', // <----- NOW SUPPORTED
    features: features || [],
    popular: popular || false,
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Package created successfully',
    package: pkg,
  });
});

// GET ALL PACKAGES (active by default
exports.getAllPackages = asyncHandler(async (req, res) => {
  const { isActive } = req.query;

  const filter = {};
  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  } else {
    filter.isActive = true; // default: show only active
  }

  const packages = await LandscapingPackage.find(filter)
    .sort({ order: 1, price: 1 })
    .select('-__v');

  res.status(StatusCodes.OK).json({
    success: true,
    count: packages.length,
    packages,
  });
});

// GET SINGLE PACKAGE
exports.getPackageById = asyncHandler(async (req, res) => {
  const pkg = await LandscapingPackage.findById(req.params.id);
  if (!pkg) throw new APIError('Package not found', StatusCodes.NOT_FOUND);

  res.status(StatusCodes.OK).json({
    success: true,
    package: pkg,
  });
});

// UPDATE PACKAGE
exports.updatePackage = asyncHandler(async (req, res) => {
  const updates = req.body;

  const pkg = await LandscapingPackage.findById(req.params.id);
  if (!pkg) throw new APIError('Package not found', StatusCodes.NOT_FOUND);

  if (updates.name && updates.name !== pkg.name) {
    const exists = await LandscapingPackage.findOne({ name: updates.name });
    if (exists) throw new APIError('Package name already exists', StatusCodes.CONFLICT);
  }

  Object.assign(pkg, updates);
  await pkg.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Package updated successfully',
    package: pkg,
  });
});

// SOFT DELETE PACKAGE (set isActive = false)
exports.deletePackage = asyncHandler(async (req, res) => {
  const pkg = await LandscapingPackage.findById(req.params.id);
  if (!pkg) throw new APIError('Package not found', StatusCodes.NOT_FOUND);

  if (!pkg.isActive) {
    throw new APIError('Package is already deactivated', StatusCodes.BAD_REQUEST);
  }

  pkg.isActive = false;
  await pkg.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Package deactivated successfully (soft deleted)',
  });
});

// RESTORE PACKAGE (set isActive = true)
exports.restorePackage = asyncHandler(async (req, res) => {
  const pkg = await LandscapingPackage.findById(req.params.id);
  if (!pkg) throw new APIError('Package not found', StatusCodes.NOT_FOUND);

  if (pkg.isActive) {
    throw new APIError('Package is already active', StatusCodes.BAD_REQUEST);
  }

  pkg.isActive = true;
  await pkg.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Package restored successfully',
    package: pkg,
  });
});

// PERMANENT DELETE (only if already soft-deleted)
exports.permanentDeletePackage = asyncHandler(async (req, res) => {
  const pkg = await LandscapingPackage.findById(req.params.id);
  if (!pkg) throw new APIError('Package not found', StatusCodes.NOT_FOUND);

  if (pkg.isActive) {
    throw new APIError('Package must be deactivated first before permanent deletion', StatusCodes.BAD_REQUEST);
  }

  await pkg.deleteOne();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Package permanently deleted',
  });
});