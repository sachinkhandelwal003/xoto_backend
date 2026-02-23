
const Material = require('../../models/material.model');
const { StatusCodes } = require('../../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../../utils/errorHandler');
const asyncHandler = require('../../../../../utils/asyncHandler');

exports.createMaterial = asyncHandler(async (req, res, next) => {
  const materialData = req.body;

  const existingMaterial = await Material.findOne({ name: materialData.name.trim(), status: { $ne: 0 } });
  if (existingMaterial) {
    throw new APIError('Material name already exists', StatusCodes.CONFLICT);
  }

  try {
    const material = await Material.create(materialData);
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Material created successfully',
      data: { material }
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      throw new APIError(`Validation failed: ${errors.join(', ')}`, StatusCodes.BAD_REQUEST);
    }
    throw new APIError('Server error while creating material', StatusCodes.INTERNAL_SERVER_ERROR);
  }
});

exports.getAllMaterials = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, search = '', status } = req.query;
  const query = search ? { name: { $regex: search, $options: 'i' } } : {};
  if (status !== undefined) {
    query.status = Number(status);
  }

  const materials = await Material.find(query)
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();
  const total = await Material.countDocuments(query);

  res.status(StatusCodes.OK).json({
    success: true,
    pagination: { page: Number(page), limit: Number(limit), total },
    materials
  });
});

exports.getMaterialById = asyncHandler(async (req, res, next) => {
  const material = await Material.findById(req.params.id).lean();
  if (!material) {
    throw new APIError('Material not found', StatusCodes.NOT_FOUND);
  }

  res.status(StatusCodes.OK).json({
    success: true,
    material
  });
});

exports.updateMaterial = asyncHandler(async (req, res, next) => {
  const material = await Material.findById(req.params.id);
  if (!material) {
    throw new APIError('Material not found', StatusCodes.NOT_FOUND);
  }

  const updatedData = req.body;
  if (updatedData.name && updatedData.name !== material.name) {
    const existingMaterial = await Material.findOne({ name: updatedData.name, status: { $ne: 0 } });
    if (existingMaterial) {
      throw new APIError('Material name already in use', StatusCodes.CONFLICT);
    }
  }

  Object.assign(material, updatedData);
  await material.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Material updated successfully',
    material
  });
});

exports.softDeleteMaterial = asyncHandler(async (req, res, next) => {
  const material = await Material.findById(req.params.id);
  if (!material) {
    throw new APIError('Material not found', StatusCodes.NOT_FOUND);
  }

  if (material.status === 0) {
    throw new APIError('Material is already deleted', StatusCodes.BAD_REQUEST);
  }

  material.status = 0;
  material.deletedAt = new Date();
  await material.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Material soft deleted successfully'
  });
});

exports.restoreMaterial = asyncHandler(async (req, res, next) => {
  const material = await Material.findById(req.params.id);
  if (!material) {
    throw new APIError('Material not found', StatusCodes.NOT_FOUND);
  }

  if (material.status === 1) {
    throw new APIError('Material is not deleted', StatusCodes.BAD_REQUEST);
  }

  material.status = 1;
  material.deletedAt = undefined;
  await material.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Material restored successfully',
    material
  });
});
