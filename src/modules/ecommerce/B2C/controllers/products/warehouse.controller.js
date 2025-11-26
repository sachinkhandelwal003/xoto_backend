const Warehouse = require('../../models/warehouse.model');
const { StatusCodes } = require('../../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../../utils/errorHandler');
const asyncHandler = require('../../../../../utils/asyncHandler');
const winston = require('winston');
const mongoose = require('mongoose');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/warehouse.log' }),
    new winston.transports.Console()
  ]
});

// Get all warehouses for a vendor
exports.getWarehouses = asyncHandler(async (req, res, next) => {
  const { vendor_id, page = 1, limit = 10, search, city, state } = req.query;

  if (!vendor_id || !mongoose.Types.ObjectId.isValid(vendor_id)) {
    throw new APIError('Valid vendor ID is required', StatusCodes.BAD_REQUEST);
  }

  if (req.user.role === 'Vendor-B2C' && req.user.id !== vendor_id) {
    throw new APIError('Unauthorized: You can only view your own warehouses', StatusCodes.FORBIDDEN);
  }

  const query = { vendor: vendor_id, active: true };
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } }
    ];
  }
  if (city) query.city = { $regex: city, $options: 'i' };
  if (state) query.state = { $regex: state, $options: 'i' };

  const warehouses = await Warehouse.find(query)
    .select('name code address city state country contact_person phone email capacity_units active')
    .sort({ created_at: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  const total = await Warehouse.countDocuments(query);

  logger.info(`Retrieved ${warehouses.length} warehouses for vendor: ${vendor_id}`);

  res.status(StatusCodes.OK).json({
    success: true,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total
    },
    warehouses
  });
});

// Create a new warehouse
exports.createWarehouse = asyncHandler(async (req, res, next) => {
  const { name, code, address, city, state, country, contact_person, phone, email, capacity_units } = req.body;

  if (!name || !code) {
    throw new APIError('Name and code are required', StatusCodes.BAD_REQUEST);
  }

 

  const existingWarehouse = await Warehouse.findOne({ 
    $or: [
      { vendor: req.user.id, name }, 
      { code }
    ] 
  });
  
  if (existingWarehouse) {
    throw new APIError(
      existingWarehouse.name === name ? 
        `Warehouse with name "${name}" already exists for this vendor` : 
        `Warehouse code "${code}" already exists`,
      StatusCodes.CONFLICT
    );
  }

  const warehouse = await Warehouse.create({
    ...req.body,
    created_at: new Date(),
    updated_at: new Date()
  });

  logger.info(`Warehouse created successfully: ${warehouse._id} for vendor: ${req.user.id}`);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Warehouse created successfully',
    warehouse: {
      id: warehouse._id,
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address,
      city: warehouse.city,
      state: warehouse.state,
      country: warehouse.country,
      contact_person: warehouse.contact_person,
      phone: warehouse.phone,
      email: warehouse.email,
      capacity_units: warehouse.capacity_units,
      active: warehouse.active
    }
  });
});

// Update an existing warehouse
exports.updateWarehouse = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new APIError('Invalid warehouse ID', StatusCodes.BAD_REQUEST);
  }

  const warehouse = await Warehouse.findById(id);
  if (!warehouse) {
    throw new APIError('Warehouse not found', StatusCodes.NOT_FOUND);
  }

  if (req.user.role === 'Vendor-B2C' && warehouse.vendor.toString() !== req.user.id) {
    throw new APIError('Unauthorized: You can only update your own warehouses', StatusCodes.FORBIDDEN);
  }

  // Check for duplicate name (same vendor, different warehouse)
  if (updateData.name) {
    const existingWarehouse = await Warehouse.findOne({ 
      vendor: req.user.id, 
      name: updateData.name, 
      _id: { $ne: id } 
    });
    if (existingWarehouse) {
      throw new APIError(`Warehouse with name "${updateData.name}" already exists for this vendor`, StatusCodes.CONFLICT);
    }
  }

  // Check for duplicate code (any vendor)
  if (updateData.code) {
    const existingCode = await Warehouse.findOne({ 
      code: updateData.code, 
      _id: { $ne: id } 
    });
    if (existingCode) {
      throw new APIError(`Warehouse code "${updateData.code}" already exists`, StatusCodes.CONFLICT);
    }
  }

  // Update warehouse
  Object.keys(updateData).forEach(key => {
    if (updateData[key] !== undefined) {
      warehouse[key] = updateData[key];
    }
  });
  warehouse.updated_at = new Date();

  await warehouse.save();

  logger.info(`Warehouse updated successfully: ${warehouse._id}`);

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Warehouse updated successfully',
    warehouse: {
      id: warehouse._id,
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address,
      city: warehouse.city,
      state: warehouse.state,
      country: warehouse.country,
      contact_person: warehouse.contact_person,
      phone: warehouse.phone,
      email: warehouse.email,
      capacity_units: warehouse.capacity_units,
      active: warehouse.active
    }
  });
});

// Delete a warehouse
exports.deleteWarehouse = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new APIError('Invalid warehouse ID', StatusCodes.BAD_REQUEST);
  }

  const warehouse = await Warehouse.findById(id);
  if (!warehouse) {
    throw new APIError('Warehouse not found', StatusCodes.NOT_FOUND);
  }

  if (req.user.role === 'Vendor-B2C' && warehouse.vendor.toString() !== req.user.id) {
    throw new APIError('Unauthorized: You can only delete your own warehouses', StatusCodes.FORBIDDEN);
  }

  // Check if warehouse is used in inventory (you'll need to import your Inventory model)
  // const Inventory = require('../models/inventory.model');
  // const inventoryCount = await Inventory.countDocuments({ warehouse: id });
  // if (inventoryCount > 0) {
  //   throw new APIError('Cannot delete warehouse with active inventory', StatusCodes.BAD_REQUEST);
  // }

  await Warehouse.findByIdAndDelete(id);

  logger.info(`Warehouse deleted successfully: ${id}`);

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Warehouse deleted successfully'
  });
});