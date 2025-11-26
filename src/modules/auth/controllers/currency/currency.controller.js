const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const Currency = require('../../models/currency/currency.model');
const asyncHandler = require('../../../../utils/asyncHandler');

// Create a new currency
exports.createCurrency = asyncHandler(async (req, res) => {
  const { code, name, symbol, exchangeRate, isDefault } = req.body;

  // Check for duplicate code or symbol
  const existingCurrency = await Currency.findOne({ $or: [{ code }, { symbol }] });
  if (existingCurrency) {
    throw new APIError('Currency with this code or symbol already exists', StatusCodes.CONFLICT);
  }

  // If isDefault is true, ensure no other currency is default
  if (isDefault) {
    await Currency.updateMany({ isDefault: true }, { isDefault: false });
  }

  // Create new currency
  const currency = await Currency.create({
    code,
    name,
    symbol,
    exchangeRate: parseFloat(exchangeRate),
    isDefault: isDefault || false,
    status: 1, // Default to active
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Currency created successfully',
    currency,
  });
});

// Update an existing currency
exports.updateCurrency = asyncHandler(async (req, res) => {
  const { currencyId } = req.params;
  const { code, name, symbol, exchangeRate, isDefault, status } = req.body;

  // Check if currency exists
  const currency = await Currency.findById(currencyId);
  if (!currency) {
    throw new APIError('Currency not found', StatusCodes.NOT_FOUND);
  }

  // Check for duplicate code or symbol (excluding current currency)
  if (code || symbol) {
    const existingCurrency = await Currency.findOne({
      $or: [{ code: code || currency.code }, { symbol: symbol || currency.symbol }],
      _id: { $ne: currencyId },
    });
    if (existingCurrency) {
      throw new APIError('Currency with this code or symbol already exists', StatusCodes.CONFLICT);
    }
  }

  // If setting as default, unset others
  if (isDefault && !currency.isDefault) {
    await Currency.updateMany({ _id: { $ne: currencyId } }, { isDefault: false });
  }

  // Update currency
  currency.code = code || currency.code;
  currency.name = name || currency.name;
  currency.symbol = symbol || currency.symbol;
  currency.exchangeRate = exchangeRate !== undefined ? parseFloat(exchangeRate) : currency.exchangeRate;
  currency.isDefault = isDefault !== undefined ? isDefault : currency.isDefault;
  currency.status = status !== undefined ? parseInt(status) : currency.status;

  await currency.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Currency updated successfully',
    currency,
  });
});

// Soft delete a currency
exports.softDeleteCurrency = asyncHandler(async (req, res) => {
  const { currencyId } = req.params;

  // Check if currency exists
  const currency = await Currency.findById(currencyId);
  if (!currency) {
    throw new APIError('Currency not found', StatusCodes.NOT_FOUND);
  }

  // Prevent soft deletion of default currency
  if (currency.isDefault) {
    throw new APIError('Cannot soft delete the default currency', StatusCodes.BAD_REQUEST);
  }

  // Check if currency is already inactive
  if (currency.status === 0) {
    throw new APIError('Currency is already deleted', StatusCodes.BAD_REQUEST);
  }

  // Soft delete by setting status to 0
  currency.status = 0;
  await currency.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Currency soft deleted successfully',
  });
});

// Permanent delete a currency
exports.permanentDeleteCurrency = asyncHandler(async (req, res) => {
  const { currencyId } = req.params;

  // Check if currency exists
  const currency = await Currency.findById(currencyId);
  if (!currency) {
    throw new APIError('Currency not found', StatusCodes.NOT_FOUND);
  }

  // Prevent permanent deletion of default currency
  if (currency.isDefault) {
    throw new APIError('Cannot permanently delete the default currency', StatusCodes.BAD_REQUEST);
  }

  // Check if currency is already soft deleted
  if (currency.status === 1) {
    throw new APIError('Currency must be soft deleted before permanent deletion', StatusCodes.BAD_REQUEST);
  }

  // Perform permanent deletion
  await Currency.deleteOne({ _id: currencyId });

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Currency permanently deleted successfully',
  });
});

// Restore a soft-deleted currency
exports.restoreCurrency = asyncHandler(async (req, res) => {
  const { currencyId } = req.params;

  // Check if currency exists
  const currency = await Currency.findById(currencyId);
  if (!currency) {
    throw new APIError('Currency not found', StatusCodes.NOT_FOUND);
  }

  // Check if currency is already active
  if (currency.status === 1) {
    throw new APIError('Currency is already active', StatusCodes.BAD_REQUEST);
  }

  // Restore by setting status to 1
  currency.status = 1;
  await currency.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Currency restored successfully',
    currency,
  });
});

// Get a single currency by ID
exports.getCurrency = asyncHandler(async (req, res) => {
  const { currencyId } = req.params;

  const currency = await Currency.findById(currencyId);
  if (!currency) {
    throw new APIError('Currency not found', StatusCodes.NOT_FOUND);
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Currency retrieved successfully',
    currency,
  });
});

// Get all currencies with pagination and filtering
exports.getAllCurrencies = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const { status, isDefault } = req.query;

  // Build filter
  const filter = {};
  if (status !== undefined) {
    filter.status = parseInt(status);
  }
  if (isDefault !== undefined) {
    filter.isDefault = isDefault === 'true';
  }

  // 👉 If isDefault=true, return a single currency object
  if (filter.isDefault === true) {
    const defaultCurrency = await Currency.findOne(filter).sort({ createdAt: -1 });

    if (!defaultCurrency) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Default currency not found',
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: 'Default currency found',
      currency: defaultCurrency, // ✅ single object
    });
  }

  // 👉 Otherwise, normal paginated query
  const currencies = await Currency.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Currency.countDocuments(filter);

  res.status(StatusCodes.OK).json({
    success: true,
    count: currencies.length,
    message: `${currencies.length} currencies found`,
    pagination: {
      totalRecords: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      perPage: limit,
    },
    currencies, // array only when not filtering by isDefault=true
  });
});
