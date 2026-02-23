// controllers/subcategory.controller.js
const mongoose = require('mongoose');
const {Category} = require('../../models/estimateCategory/category.model');
const {Subcategory} = require('../../models/estimateCategory/category.model');
const {Type} = require('../../models/estimateCategory/category.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const APIError = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');

// CREATE Subcategory
exports.createSubcategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const { label, description, order } = req.body;

  // Check if category exists
  const category = await Category.findById(categoryId);
  if (!category) throw new APIError('Category not found', StatusCodes.NOT_FOUND);

  // Check if subcategory already exists in this category
  const exists = await Subcategory.findOne({ label, category: categoryId });
  if (exists) throw new APIError('Subcategory already exists in this category', StatusCodes.CONFLICT);

  const subcategory = await Subcategory.create({
    label,
    description: description || '',
    category: categoryId,
    order: order || 0
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Subcategory created successfully',
    subcategory,
  });
});

// GET Subcategories with optional filters + categoryId param support
exports.getSubcategories = asyncHandler(async (req, res) => {
  const {
    label,
    active,
    populate = "false",
    page = 1,
    limit, // optional for no-pagination
  } = req.query;

  const { categoryId } = req.params;

  let query = {};

  if (categoryId) query.category = categoryId;
  if (label) query.label = new RegExp(label, "i");
  if (active !== undefined) query.isActive = active === "true";

  /* ---------------------------------------------------------
      🟦 BASE QUERY
  --------------------------------------------------------- */
  let subcategoryQuery = Subcategory.find(query)
    .sort({ order: 1, createdAt: -1 });

  if (populate === "true") {
    subcategoryQuery = subcategoryQuery
      .populate({ path: "category", select: "name slug" })
      .populate({
        path: "types",
        options: { sort: { order: 1 } }
      });
  }

  /* ---------------------------------------------------------
      🟦 PAGINATION (only if limit is provided)
  --------------------------------------------------------- */
  let pagination = null;

  if (limit) {
    const limitNum = parseInt(limit);
    const pageNum = parseInt(page);

    subcategoryQuery = subcategoryQuery
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await Subcategory.countDocuments(query);

    pagination = {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  const subcategories = await subcategoryQuery;

  /* ---------------------------------------------------------
      🟦 RESPONSE
  --------------------------------------------------------- */
  res.status(StatusCodes.OK).json({
    success: true,
    data: subcategories,
    pagination, // null when limit is missing
  });
});

exports.getSubcategoriesByCategoryName = asyncHandler(async (req, res) => {
  const { categoryName } = req.params;
  const { label, active, populate = "false" } = req.query;

  /* -----------------------------
       1️⃣ Find category by name
  ------------------------------ */
  const category = await Category.findOne({
    name: new RegExp(`^${categoryName}$`, "i")
  });

  if (!category) {
    return res.status(StatusCodes.NOT_FOUND).json({
      success: false,
      message: "Category not found",
    });
  }

  /* -----------------------------
       2️⃣ Build subcategory query
  ------------------------------ */
  let query = { category: category._id };

  if (label) query.label = new RegExp(label, "i");
  if (active !== undefined) query.isActive = active === "true";

  /* -----------------------------
       3️⃣ Base query
  ------------------------------ */
  let subQuery = Subcategory.find(query)
    .sort({ order: 1, createdAt: -1 });

  if (populate === "true") {
    subQuery = subQuery
      .populate({ path: "category", select: "name slug" })
      .populate({
        path: "types",
        options: { sort: { order: 1 } }
      });
  }

  const subcategories = await subQuery;

  /* -----------------------------
       4️⃣ Return response
  ------------------------------ */
  res.status(StatusCodes.OK).json({
    success: true,
    category: category.name,
    data: subcategories
  });
});


// GET Single Subcategory with types
exports.getSubcategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { populate = 'true' } = req.query;

  let subcategory;

  if (populate === 'true') {
    subcategory = await Subcategory.findById(id)
      .populate({
        path: 'category',
        select: 'name slug'
      })
      .populate({
        path: 'types',
        options: { sort: { order: 1 } }
      });
  } else {
    subcategory = await Subcategory.findById(id);
  }

  if (!subcategory) throw new APIError('Subcategory not found', StatusCodes.NOT_FOUND);

  res.status(StatusCodes.OK).json({
    success: true,
    subcategory,
  });
});

// UPDATE Subcategory
exports.updateSubcategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { label, description, isActive, order } = req.body;

  const subcategory = await Subcategory.findById(id);
  if (!subcategory) throw new APIError('Subcategory not found', StatusCodes.NOT_FOUND);

  // Check if new label already exists in same category
  if (label && label !== subcategory.label) {
    const exists = await Subcategory.findOne({
      label,
      category: subcategory.category,
      _id: { $ne: id }
    });
    if (exists) throw new APIError('Subcategory label already exists in this category', StatusCodes.CONFLICT);
    subcategory.label = label;
  }

  if (description !== undefined) subcategory.description = description;
  if (isActive !== undefined) subcategory.isActive = isActive;
  if (order !== undefined) subcategory.order = order;

  await subcategory.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Subcategory updated successfully',
    subcategory,
  });
});

// DELETE Subcategory
exports.deleteSubcategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if subcategory has types
  const hasTypes = await Type.exists({ subcategory: id, isActive: true });
  if (hasTypes) {
    throw new APIError('Cannot delete subcategory with active types', StatusCodes.BAD_REQUEST);
  }

  const subcategory = await Subcategory.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true }
  );

  if (!subcategory) throw new APIError('Subcategory not found', StatusCodes.NOT_FOUND);

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Subcategory deactivated successfully',
    subcategory,
  });
});