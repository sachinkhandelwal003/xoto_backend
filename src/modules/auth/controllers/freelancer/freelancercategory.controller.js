// controllers/category/category.controller.js
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
    new winston.transports.File({ filename: 'logs/category.log' }),
    new winston.transports.Console()
  ]
});

// CREATE CATEGORY
exports.createCategory = asyncHandler(async (req, res) => {
  const { name, description, icon } = req.body;

  const trimmedName = name.trim();
  const exists = await Category.findOne({
    name: { $regex: `^${trimmedName}$`, $options: 'i' },
    is_deleted: false
  });
  if (exists) throw new APIError('Category already exists', StatusCodes.CONFLICT);

  const category = await Category.create({
    name: trimmedName,
    description,
    icon,
    is_active: true
  });

  logger.info(`Category created: ${category._id} | ${category.name}`);
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Category created successfully',
    category
  });
});

// GET ALL CATEGORIES
// GET ALL OR SINGLE CATEGORY
// ✅ GET ALL OR SINGLE CATEGORY
exports.getAllCategories = asyncHandler(async (req, res) => {
  const {
    id,
    page = 1,
    limit = 10,
    search,
    active,
    is_deleted,
  } = req.query;

  // ---------- 1. SINGLE CATEGORY ----------
  if (id) {
    const category = await Category.findOne({
      _id: id,
      is_deleted: false,               // never return a soft-deleted doc when id is used
    }).select('-__v');

    if (!category) {
      throw new APIError('Category not found', StatusCodes.NOT_FOUND);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      category,
    });
  }

  // ---------- 2. LIST (active / trash) ----------
  const query = {};

  // is_deleted flag decides active vs trash view
  query.is_deleted = is_deleted === 'true';

  // optional status filter (active / inactive)
  if (active !== undefined && active !== '') {
    query.is_active = active === 'true';
  }

  // optional fuzzy name search
  if (search) {
    query.name = { $regex: search.trim(), $options: 'i' };
  }

  // parallel DB calls
  const [categories, total] = await Promise.all([
    Category.find(query)
      .select('-__v')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean(),

    Category.countDocuments(query),
  ]);

  return res.status(StatusCodes.OK).json({
    success: true,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
    },
    categories,
  });
});


// GET SINGLE CATEGORY
exports.getCategory = asyncHandler(async (req, res) => {
  const category = await Category.findOne({
    _id: req.params.id,
    is_deleted: false
  }).populate({
    path: 'subcategories',
    match: { is_deleted: false },
    select: 'name slug is_active'
  });

  if (!category) throw new APIError('Category not found', StatusCodes.NOT_FOUND);

  res.status(StatusCodes.OK).json({
    success: true,
    category
  });
});

// UPDATE CATEGORY
exports.updateCategory = asyncHandler(async (req, res) => {
  const { name, description, icon, is_active } = req.body;

  const category = await Category.findOne({
    _id: req.params.id,
    is_deleted: false
  });
  if (!category) throw new APIError('Category not found', StatusCodes.NOT_FOUND);

  // Prevent duplicate name
  if (name && name.trim().toLowerCase() !== category.name.toLowerCase()) {
    const exists = await Category.findOne({
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
      _id: { $ne: category._id },
      is_deleted: false
    });
    if (exists) throw new APIError('Category name already exists', StatusCodes.CONFLICT);
  }

  Object.assign(category, {
    name: name?.trim() || category.name,
    description,
    icon,
    is_active: is_active !== undefined ? is_active : category.is_active
  });

  await category.save();

  logger.info(`Category updated: ${category._id} | ${category.name}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Category updated',
    category
  });
});

// SOFT DELETE CATEGORY
exports.deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findOne({
    _id: req.params.id,
    is_deleted: false
  });
  if (!category) throw new APIError('Category not found', StatusCodes.NOT_FOUND);

  // Check if any subcategory uses it
  const used = await Subcategory.countDocuments({
    category: category._id,
    is_deleted: false
  });
  if (used > 0) {
    throw new APIError('Cannot delete: Category has subcategories', StatusCodes.FORBIDDEN);
  }

  category.is_deleted = true;
  category.deleted_at = new Date();
  await category.save();

  logger.info(`Category soft-deleted: ${category._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Category deleted'
  });
});

// RESTORE CATEGORY
exports.restoreCategory = asyncHandler(async (req, res) => {
  const category = await Category.findOne({
    _id: req.params.id,
    is_deleted: true
  });
  if (!category) throw new APIError('Category not found or already active', StatusCodes.NOT_FOUND);

  category.is_deleted = false;
  category.deleted_at = null;
  await category.save();

  logger.info(`Category restored: ${category._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Category restored'
  });
});