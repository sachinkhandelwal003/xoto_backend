// controllers/subcategory/subcategory.controller.js
const winston = require('winston');
const Category = require('../../models/Freelancer/categoryfreelancer.model');
const Subcategory = require('../../models/Freelancer/subcategoryfreelancer.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: 'logs/subcategory.log' }),
    new winston.transports.Console()
  ]
});

// CREATE SUBCATEGORY
exports.createSubcategory = asyncHandler(async (req, res) => {
  const { name, category, description, icon } = req.body;

  // Check if category exists and not deleted
  const cat = await Category.findOne({ _id: category, is_deleted: false });
  if (!cat) throw new APIError('Category not found or deleted', StatusCodes.NOT_FOUND);

  // Check duplicate name under same category
  const exists = await Subcategory.findOne({
    name: { $regex: `^${name}$`, $options: 'i' },
    category,
    is_deleted: false
  });
  if (exists) throw new APIError('Subcategory already exists in this category', StatusCodes.CONFLICT);

  const subcategory = await Subcategory.create({
    name,
    category,
    description,
    icon,
    is_active: true
  });

  logger.info(`Subcategory created: ${subcategory._id} | ${name}`);
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Subcategory created',
    subcategory
  });
});

// GET ALL SUBCATEGORIES (with filters)
exports.getAllSubcategories = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, category, search, active } = req.query;

  const query = { is_deleted: false };
  if (category) query.category = category;
  if (active !== undefined) query.is_active = active === 'true';
  if (search) {
    query.name = { $regex: search, $options: 'i' };
  }

  const subcategories = await Subcategory.find(query)
    .select('-__v')
    .populate('category')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  const total = await Subcategory.countDocuments(query);

  res.status(StatusCodes.OK).json({
    success: true,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total
    },
    subcategories
  });
});

// GET SINGLE SUBCATEGORY
exports.getSubcategory = asyncHandler(async (req, res) => {
  const subcategory = await Subcategory.findOne({
    _id: req.params.id,
    is_deleted: false
  }).populate('category', 'name');

  if (!subcategory) throw new APIError('Subcategory not found', StatusCodes.NOT_FOUND);

  res.status(StatusCodes.OK).json({
    success: true,
    subcategory
  });
});

// UPDATE SUBCATEGORY
exports.updateSubcategory = asyncHandler(async (req, res) => {
  const { name, category, description, icon, is_active } = req.body;

  const subcategory = await Subcategory.findOne({
    _id: req.params.id,
    is_deleted: false
  });
  if (!subcategory) throw new APIError('Subcategory not found', StatusCodes.NOT_FOUND);

  // If category changed, validate new category
  if (category && category !== subcategory.category.toString()) {
    const cat = await Category.findOne({ _id: category, is_deleted: false });
    if (!cat) throw new APIError('Invalid category', StatusCodes.BAD_REQUEST);
  }

  // Prevent duplicate name in same category
  if (name && name.toLowerCase() !== subcategory.name.toLowerCase()) {
    const exists = await Subcategory.findOne({
      name: { $regex: `^${name}$`, $options: 'i' },
      category: category || subcategory.category,
      _id: { $ne: subcategory._id },
      is_deleted: false
    });
    if (exists) throw new APIError('Subcategory name already exists in this category', StatusCodes.CONFLICT);
  }

  Object.assign(subcategory, { name, category, description, icon, is_active });
  await subcategory.save();

  logger.info(`Subcategory updated: ${subcategory._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Subcategory updated',
    subcategory
  });
});

// SOFT DELETE SUBCATEGORY
exports.deleteSubcategory = asyncHandler(async (req, res) => {
  const subcategory = await Subcategory.findOne({
    _id: req.params.id,
    is_deleted: false
  });
  if (!subcategory) throw new APIError('Subcategory not found', StatusCodes.NOT_FOUND);

  // Prevent delete if used by any freelancer
  const used = await require('../../models/freelancer').countDocuments({
    'services_offered.subcategory': subcategory._id,
    is_deleted: false
  });
  if (used > 0) {
    throw new APIError('Cannot delete: Subcategory is in use by freelancers', StatusCodes.FORBIDDEN);
  }

  subcategory.is_deleted = true;
  subcategory.deleted_at = new Date();
  await subcategory.save();

  logger.info(`Subcategory soft-deleted: ${subcategory._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Subcategory deleted'
  });
});

// RESTORE SUBCATEGORY
exports.restoreSubcategory = asyncHandler(async (req, res) => {
  const subcategory = await Subcategory.findOne({
    _id: req.params.id,
    is_deleted: true
  });
  if (!subcategory) throw new APIError('Subcategory not found or already active', StatusCodes.NOT_FOUND);

  subcategory.is_deleted = false;
  subcategory.deleted_at = null;
  await subcategory.save();

  logger.info(`Subcategory restored: ${subcategory._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Subcategory restored'
  });
});