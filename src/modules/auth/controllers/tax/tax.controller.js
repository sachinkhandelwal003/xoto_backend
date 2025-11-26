// modules/tax/controllers/tax.controller.js
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const Tax = require('../../models/tax/tax.model');
const asyncHandler = require('../../../../utils/asyncHandler');

// Create a new tax
exports.createTax = asyncHandler(async (req, res) => {
  const { taxName, rate } = req.body;

  // Check for duplicate tax name
  const existingTax = await Tax.findOne({ taxName });
  if (existingTax) {
    throw new APIError('Tax with this name already exists', StatusCodes.CONFLICT);
  }

  // Create new tax
  const tax = await Tax.create({
    taxName,
    rate,
    status: 1, // Default to active
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Tax created successfully',
    tax,
  });
});

// Update an existing tax
exports.updateTax = asyncHandler(async (req, res) => {
  const { taxId } = req.params;
  const { taxName, rate, status } = req.body;

  // Check if tax exists
  const tax = await Tax.findById(taxId);
  if (!tax) {
    throw new APIError('Tax not found', StatusCodes.NOT_FOUND);
  }

  // Check for duplicate tax name (excluding current tax)
  if (taxName && taxName !== tax.taxName) {
    const existingTax = await Tax.findOne({ taxName, _id: { $ne: taxId } });
    if (existingTax) {
      throw new APIError('Tax with this name already exists', StatusCodes.CONFLICT);
    }
  }

  // Update tax
  tax.taxName = taxName || tax.taxName;
  tax.rate = rate !== undefined ? rate : tax.rate;
  tax.status = status !== undefined ? status : tax.status;

  await tax.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Tax updated successfully',
    tax,
  });
});

// Soft delete a tax (set status to 0)
exports.softDeleteTax = asyncHandler(async (req, res) => {
  const { taxId } = req.params;

  // Check if tax exists
  const tax = await Tax.findById(taxId);
  if (!tax) {
    throw new APIError('Tax not found', StatusCodes.NOT_FOUND);
  }

  // Check if tax is already inactive
  if (tax.status === 0) {
    throw new APIError('Tax is already deleted', StatusCodes.BAD_REQUEST);
  }

  // Soft delete
  tax.status = 0;
  await tax.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Tax soft deleted successfully',
  });
});

// Permanent delete a tax (only if already soft deleted)
exports.permanentDeleteTax = asyncHandler(async (req, res) => {
  const { taxId } = req.params;

  // Check if tax exists
  const tax = await Tax.findById(taxId);
  if (!tax) {
    throw new APIError('Tax not found', StatusCodes.NOT_FOUND);
  }

  // Check if tax is already soft deleted
  if (tax.status === 1) {
    throw new APIError('Tax must be soft deleted before permanent deletion', StatusCodes.BAD_REQUEST);
  }

  await tax.deleteOne();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Tax permanently deleted successfully',
  });
});

// Restore a soft deleted tax (set status to 1)
exports.restoreTax = asyncHandler(async (req, res) => {
  const { taxId } = req.params;

  // Check if tax exists
  const tax = await Tax.findById(taxId);
  if (!tax) {
    throw new APIError('Tax not found', StatusCodes.NOT_FOUND);
  }

  // Check if tax is already active
  if (tax.status === 1) {
    throw new APIError('Tax is already active', StatusCodes.BAD_REQUEST);
  }

  // Restore
  tax.status = 1;
  await tax.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Tax restored successfully',
    tax,
  });
});

// Get a single tax by ID
exports.getTax = asyncHandler(async (req, res) => {
  const { taxId } = req.params;

  const tax = await Tax.findById(taxId);
  if (!tax) {
    throw new APIError('Tax not found', StatusCodes.NOT_FOUND);
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Tax retrieved successfully',
    tax,
  });
});

// Get all taxes with pagination and filtering (default to active taxes)
exports.getAllTaxes = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const { status } = req.query;

  // Build filter (default to status: 1 if not specified)
  const filter = {};
  if (status !== undefined) {
    filter.status = parseInt(status);
  } else {
    filter.status = 1;
  }

  // Query taxes
  const taxes = await Tax.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Tax.countDocuments(filter);

  res.status(StatusCodes.OK).json({
    success: true,
    count: taxes.length,
    message: `${taxes.length} taxes found`,
    pagination: {
      totalRecords: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      perPage: limit,
    },
    taxes,
  });
});