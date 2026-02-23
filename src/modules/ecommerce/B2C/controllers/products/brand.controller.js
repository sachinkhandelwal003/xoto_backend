const Brand = require('../../models/brand.model');
const { StatusCodes } = require('../../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../../utils/errorHandler');
const asyncHandler = require('../../../../../utils/asyncHandler');

exports.createBrand = asyncHandler(async (req, res, next) => {
  const brandData = req.body;

  if (req.file) {
    brandData.logo = req.file.path; // Store file path from multer
  }

  const existingBrand = await Brand.findOne({ name: brandData.name.trim(), status: { $ne: 0 } });
  if (existingBrand) {
    throw new APIError('Brand name already exists', StatusCodes.CONFLICT);
  }

  try {
    const brand = await Brand.create(brandData);
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Brand created successfully',
      data: { brand }
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      throw new APIError(`Validation failed: ${errors.join(', ')}`, StatusCodes.BAD_REQUEST);
    }
    throw new APIError('Server error while creating brand', StatusCodes.INTERNAL_SERVER_ERROR);
  }
});

exports.getAllBrands = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, search = '', status } = req.query;
  const query = search ? { name: { $regex: search, $options: 'i' } } : {};
  if (status !== undefined) {
    query.status = Number(status);
  }

  const brands = await Brand.find(query)
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();
  const total = await Brand.countDocuments(query);

  res.status(StatusCodes.OK).json({
    success: true,
    pagination: { page: Number(page), limit: Number(limit), total },
    brands
  });
});

exports.getBrandById = asyncHandler(async (req, res, next) => {
  const brand = await Brand.findById(req.params.id).lean();
  if (!brand) {
    throw new APIError('Brand not found', StatusCodes.NOT_FOUND);
  }

  res.status(StatusCodes.OK).json({
    success: true,
    brand
  });
});

exports.updateBrand = asyncHandler(async (req, res, next) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) {
    throw new APIError('Brand not found', StatusCodes.NOT_FOUND);
  }

  const updatedData = req.body;
  if (req.file) {
    updatedData.logo = req.file.path; // Store file path from multer
  }

  if (updatedData.name && updatedData.name !== brand.name) {
    const existingBrand = await Brand.findOne({ name: updatedData.name, status: { $ne: 0 } });
    if (existingBrand) {
      throw new APIError('Brand name already in use', StatusCodes.CONFLICT);
    }
  }

  Object.assign(brand, updatedData);
  await brand.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Brand updated successfully',
    brand
  });
});

exports.softDeleteBrand = asyncHandler(async (req, res, next) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) {
    throw new APIError('Brand not found', StatusCodes.NOT_FOUND);
  }

  if (brand.status === 0) {
    throw new APIError('Brand is already deleted', StatusCodes.BAD_REQUEST);
  }

  brand.status = 0;
  brand.deletedAt = new Date();
  await brand.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Brand soft deleted successfully'
  });
});

exports.restoreBrand = asyncHandler(async (req, res, next) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) {
    throw new APIError('Brand not found', StatusCodes.NOT_FOUND);
  }

  if (brand.status === 1) {
    throw new APIError('Brand is not deleted', StatusCodes.BAD_REQUEST);
  }

  brand.status = 1;
  brand.deletedAt = undefined;
  await brand.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Brand restored successfully',
    brand
  });
});